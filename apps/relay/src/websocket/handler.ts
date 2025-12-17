import type { Server, ServerWebSocket } from "bun";
import type { Env } from "@/config/env";
import { getLogger } from "@/config/logger";
import type { ErrorCode, ErrorMessage, WebSocketData } from "@/types";
import { ERROR_MESSAGES, type WS_CLOSE_CODES } from "@/types";
import { getRateLimiter } from "@/utils/rateLimiter";
import { getConnectionParams, validateConnectionParams } from "@/utils/validation";
import { channelManager } from "@/websocket/channel";
import {
    createTimestamp,
    getMessageType,
    sendConnectedMessage,
    sendErrorAndClose,
    sendMessage,
    validateAuthMessage,
    validateClipboardAck,
    validateClipboardMessage,
} from "@/websocket/messages";

/**
 * Result of WebSocket upgrade attempt
 */
export interface UpgradeResult {
    success: boolean;
    errorCode?: ErrorCode;
    errorMessage?: string;
}

export function createWebSocketHandlers(env: Env) {
    const logger = getLogger();

    return {
        /**
         * Upgrade handler (called in fetch)
         * Only validates rate limit and basic params (channel, deviceName)
         * Secret validation happens via first message auth
         */
        upgrade(req: Request, server: Server<WebSocketData>): UpgradeResult {
            const url = new URL(req.url);
            const ip = server.requestIP(req)?.address || "unknown";

            // Check rate limit before accepting connection
            if (!getRateLimiter().checkLimit(ip)) {
                logger.warn({ ip }, "Connection rejected due to rate limit");
                channelManager.incrementError("RATE_LIMIT_EXCEEDED");
                return {
                    success: false,
                    errorCode: "RATE_LIMIT_EXCEEDED",
                    errorMessage: ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
                };
            }

            // Validate channel and deviceName (not secret - that comes via first message)
            const validation = validateConnectionParams(url.searchParams);

            if (!validation.valid) {
                logger.warn({ error: validation.error }, "WebSocket upgrade rejected");
                if (validation.error?.code) {
                    channelManager.incrementError(validation.error.code);
                }
                return {
                    success: false,
                    errorCode: validation.error?.code,
                    errorMessage: validation.error?.message,
                };
            }

            const params = getConnectionParams(url.searchParams);

            // Prepare WebSocket data - not authenticated yet
            const data: WebSocketData = {
                deviceName: params.deviceName,
                channelId: params.channel,
                connectedAt: new Date(),
                authenticated: false,
                authTimeoutId: null,
            };

            const upgraded = server.upgrade(req, { data });
            return { success: upgraded };
        },

        websocket: {
            maxPayloadLength: env.MAX_MESSAGE_SIZE,
            perMessageDeflate: env.COMPRESSION_ENABLED,
            idleTimeout: env.IDLE_TIMEOUT,
            closeOnBackpressureLimit: false,

            /**
             * Connection opened - start auth timeout
             * Client must send auth message within AUTH_TIMEOUT_MS
             */
            open(ws: ServerWebSocket<WebSocketData>) {
                const wsLogger = logger.child({
                    context: "websocket",
                    deviceName: ws.data.deviceName,
                    channelId: ws.data.channelId,
                });

                wsLogger.info("Connection opened, waiting for auth message");

                // Set auth timeout
                ws.data.authTimeoutId = setTimeout(() => {
                    if (!ws.data.authenticated) {
                        wsLogger.warn("Auth timeout - closing connection");
                        channelManager.incrementError("AUTH_TIMEOUT");
                        sendErrorAndClose(ws, "AUTH_TIMEOUT", ERROR_MESSAGES.AUTH_TIMEOUT);
                    }
                }, env.AUTH_TIMEOUT_MS);
            },

            /**
             * Message received - handle auth or regular messages
             */
            message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
                const { deviceName, channelId, authenticated } = ws.data;

                const wsLogger = logger.child({
                    context: "websocket",
                    deviceName,
                    channelId,
                });

                const messageStr = typeof message === "string" ? message : message.toString("utf-8");
                wsLogger.debug({ size: messageStr.length, authenticated }, "Message received");

                const messageType = getMessageType(messageStr);

                if (!messageType) {
                    wsLogger.warn("Message has no type field or invalid JSON");
                    channelManager.incrementError("INVALID_MESSAGE");
                    sendErrorAndClose(ws, "INVALID_MESSAGE", "Message must have a valid type field");
                    return;
                }

                // If not authenticated, only accept auth message
                if (!authenticated) {
                    if (messageType !== "auth") {
                        wsLogger.warn({ type: messageType }, "Received non-auth message before authentication");
                        channelManager.incrementError("INVALID_SECRET");
                        sendErrorAndClose(ws, "INVALID_SECRET", "Must authenticate first. Send auth message.");
                        return;
                    }

                    handleAuthMessage(ws, messageStr, env.SERVER_SECRET);
                    return;
                }

                // Authenticated - handle regular messages
                if (messageType === "auth") {
                    // Already authenticated, ignore duplicate auth
                    wsLogger.debug("Ignoring duplicate auth message");
                    return;
                }

                if (messageType === "clipboard") {
                    handleClipboardMessage(ws, messageStr, env.MAX_MESSAGE_SIZE);
                    return;
                }

                if (messageType === "clipboard_ack") {
                    handleClipboardAck(ws, messageStr);
                    return;
                }

                // Unsupported message type - send error but keep connection
                wsLogger.warn({ type: messageType }, "Unsupported message type");

                const errorMsg: ErrorMessage = {
                    type: "error",
                    timestamp: createTimestamp(),
                    code: "INVALID_MESSAGE",
                    message: `Unsupported message type: ${messageType}`,
                };

                sendMessage(ws, errorMsg);
            },

            drain(ws: ServerWebSocket<WebSocketData>) {
                const wsLogger = logger.child({
                    context: "websocket",
                    deviceName: ws.data.deviceName,
                    channelId: ws.data.channelId,
                });

                wsLogger.debug("Backpressure relieved, ready to send");
            },

            /**
             * Connection closed - cleanup auth timeout and channel
             */
            close(ws: ServerWebSocket<WebSocketData>, code: number, reason: string) {
                const { deviceName, channelId, connectedAt, authenticated, authTimeoutId } = ws.data;

                // Clear auth timeout if pending
                if (authTimeoutId) {
                    clearTimeout(authTimeoutId);
                }

                const wsLogger = logger.child({
                    context: "websocket",
                    deviceName,
                    channelId,
                });

                const duration = Date.now() - connectedAt.getTime();
                const durationSec = Math.floor(duration / 1000);

                wsLogger.info(
                    {
                        code,
                        reason: reason || "No reason provided",
                        durationSec,
                        wasAuthenticated: authenticated,
                    },
                    "Connection closed",
                );

                // Only remove from channel if was authenticated (added to channel)
                if (authenticated) {
                    channelManager.removeDevice(channelId, deviceName);
                }
            },

            error(ws: ServerWebSocket<WebSocketData>, error: Error) {
                const wsLogger = logger.child({
                    context: "websocket",
                    deviceName: ws.data.deviceName,
                    channelId: ws.data.channelId,
                });

                wsLogger.error({ err: error }, "WebSocket error");
            },
        },
    };

    /**
     * Handle authentication message
     */
    function handleAuthMessage(ws: ServerWebSocket<WebSocketData>, messageStr: string, serverSecret: string): void {
        const { deviceName, channelId, authTimeoutId } = ws.data;

        const wsLogger = logger.child({
            context: "auth",
            deviceName,
            channelId,
        });

        // Validate auth message
        const validation = validateAuthMessage(messageStr);

        if (!validation.valid || !validation.data) {
            wsLogger.warn({ error: validation.error }, "Invalid auth message");
            channelManager.incrementError("INVALID_MESSAGE");
            sendErrorAndClose(ws, "INVALID_MESSAGE", validation.error?.message || "Invalid auth message format");
            return;
        }

        // Verify secret
        if (validation.data.secret !== serverSecret) {
            wsLogger.warn("Invalid secret provided");
            channelManager.incrementError("INVALID_SECRET");
            sendErrorAndClose(ws, "INVALID_SECRET", ERROR_MESSAGES.INVALID_SECRET);
            return;
        }

        // Clear auth timeout
        if (authTimeoutId) {
            clearTimeout(authTimeoutId);
            ws.data.authTimeoutId = null;
        }

        // Mark as authenticated
        ws.data.authenticated = true;

        wsLogger.info("Authentication successful");

        // Now try to add to channel
        const result = channelManager.addDevice(channelId, deviceName, ws, env.MAX_CHANNELS);

        if (!result.success && result.error) {
            wsLogger.warn({ error: result.error }, "Failed to join channel");
            sendErrorAndClose(ws, result.error.code as keyof typeof WS_CLOSE_CODES, result.error.message);
            return;
        }

        // Check if partner exists
        const hasPartner = channelManager.hasPartner(channelId, deviceName);

        // Send connected message
        sendConnectedMessage(ws, !hasPartner);

        wsLogger.info({ hasPartner }, "Device joined channel successfully");
    }

    /**
     * Handle clipboard message
     */
    function handleClipboardMessage(ws: ServerWebSocket<WebSocketData>, messageStr: string, maxSize: number): void {
        const { deviceName, channelId } = ws.data;

        const wsLogger = logger.child({
            context: "clipboard",
            deviceName,
            channelId,
        });

        const validation = validateClipboardMessage(messageStr, maxSize);

        if (!validation.valid && validation.error) {
            wsLogger.warn({ error: validation.error }, "Invalid clipboard message");
            channelManager.incrementError(validation.error.code);

            const errorMsg: ErrorMessage = {
                type: "error",
                timestamp: createTimestamp(),
                code: validation.error.code,
                message: validation.error.message,
            };

            sendMessage(ws, errorMsg);
            return;
        }

        const clipboardMsg = validation.data;

        if (clipboardMsg) {
            wsLogger.info(
                {
                    contentType: clipboardMsg.contentType,
                    size: clipboardMsg.metadata.size,
                    mimeType: clipboardMsg.metadata.mimeType,
                },
                "Clipboard message validated",
            );

            const relayed = channelManager.relayToPartner(channelId, deviceName, messageStr);

            if (!relayed) {
                wsLogger.warn("No partner available to receive message");
                channelManager.incrementError("NO_PARTNER");

                const errorMsg: ErrorMessage = {
                    type: "error",
                    timestamp: createTimestamp(),
                    code: "NO_PARTNER",
                    message: ERROR_MESSAGES.NO_PARTNER,
                };

                sendMessage(ws, errorMsg);
                return;
            }

            wsLogger.info(
                {
                    contentType: clipboardMsg.contentType,
                    size: clipboardMsg.metadata.size,
                },
                "Clipboard message relayed successfully",
            );
        }
    }

    /**
     * Handle clipboard ACK
     */
    function handleClipboardAck(ws: ServerWebSocket<WebSocketData>, messageStr: string): void {
        const { deviceName, channelId } = ws.data;

        const wsLogger = logger.child({
            context: "clipboard_ack",
            deviceName,
            channelId,
        });

        const validation = validateClipboardAck(messageStr);

        if (!validation.valid) {
            wsLogger.warn({ error: validation.error }, "Invalid ACK message");
            return;
        }

        const ackMsg = validation.data;

        if (ackMsg) {
            wsLogger.debug({ receivedSize: ackMsg.receivedSize }, "ACK received");
            channelManager.relayToPartner(channelId, deviceName, messageStr);
        }
    }
}
