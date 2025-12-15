import type { Server, ServerWebSocket } from "bun";
import type { Env } from "@/config/env";
import { getLogger } from "@/config/logger";
import type { ErrorMessage, WebSocketData, WS_CLOSE_CODES } from "@/types";
import { rateLimiter } from "@/utils/rateLimiter";
import { getConnectionParams, validateConnectionParams } from "@/utils/validation";
import { channelManager } from "@/websocket/channel";
import {
    getMessageType,
    sendConnectedMessage,
    sendErrorAndClose,
    sendMessage,
    validateClipboardAck,
    validateClipboardMessage,
} from "@/websocket/messages";

export function createWebSocketHandlers(env: Env) {
    const logger = getLogger();

    return {
        // Upgrade handler (called in fetch)
        upgrade(req: Request, server: Server<WebSocketData>): boolean {
            const url = new URL(req.url);

            // Get client IP (Bun API)
            const ip = server.requestIP(req)?.address || "unknown";

            // Check rate limit
            if (!rateLimiter.checkLimit(ip)) {
                logger.warn({ ip }, "Connection rejected due to rate limit");
                return false;
            }

            // Validate connection parameters
            const validation = validateConnectionParams(url.searchParams, env.SERVER_SECRET);

            if (!validation.valid) {
                logger.warn({ error: validation.error }, "WebSocket upgrade rejected");
                return false;
            }

            // Extract parameters
            const params = getConnectionParams(url.searchParams);

            // Prepare WebSocket data
            const data: WebSocketData = {
                deviceName: params.deviceName,
                channelId: params.channel,
                connectedAt: new Date(),
            };

            // Modern upgrade pattern - return boolean
            return server.upgrade(req, { data });
        },

        // WebSocket lifecycle handlers
        websocket: {
            // Apply MAX_MESSAGE_SIZE (fixes Phase 1 issue)
            maxPayloadLength: env.MAX_MESSAGE_SIZE,

            // Enable compression (permessage-deflate)
            perMessageDeflate: true,

            // Bun sends WebSocket ping frames automatically
            // If client does not respond with pong, connection closes
            idleTimeout: env.IDLE_TIMEOUT,

            // Handle backpressure in drain handler
            closeOnBackpressureLimit: false,

            // Connection opened - UPDATED for channel management
            open(ws: ServerWebSocket<WebSocketData>) {
                const wsLogger = logger.child({
                    context: "websocket",
                    deviceName: ws.data.deviceName,
                    channelId: ws.data.channelId,
                });

                wsLogger.info("Device connected");

                // Try to add device to channel
                const result = channelManager.addDevice(ws.data.channelId, ws.data.deviceName, ws);

                if (!result.success && result.error) {
                    // Send error and close
                    const { code, message } = result.error;
                    sendErrorAndClose(ws, code as keyof typeof WS_CLOSE_CODES, message);
                    return;
                }

                // Check if partner exists
                const hasPartner = channelManager.hasPartner(ws.data.channelId, ws.data.deviceName);

                // Send connected message
                sendConnectedMessage(ws, !hasPartner);
            },

            // Message received - UPDATED for Phase 4 clipboard relay
            message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
                const { deviceName, channelId } = ws.data;

                // MODERN PATTERN: Child logger with context
                const wsLogger = logger.child({
                    context: "websocket",
                    deviceName,
                    channelId,
                });

                // Convert Buffer to string if needed
                const messageStr = typeof message === "string" ? message : message.toString("utf-8");

                wsLogger.debug({ size: messageStr.length }, "Message received");

                // Determine message type
                const messageType = getMessageType(messageStr);

                if (!messageType) {
                    wsLogger.warn("Unknown message type");
                    sendErrorAndClose(ws, "INVALID_MESSAGE", "Unknown message type");
                    return;
                }

                // Handle clipboard message
                if (messageType === "clipboard") {
                    handleClipboardMessage(ws, messageStr, env.MAX_MESSAGE_SIZE);
                    return;
                }

                // Handle clipboard ACK
                if (messageType === "clipboard_ack") {
                    handleClipboardAck(ws, messageStr);
                    return;
                }

                // Unknown message type
                wsLogger.warn({ type: messageType }, "Unsupported message type");
            },

            // Backpressure relieved (modern pattern)
            drain(ws: ServerWebSocket<WebSocketData>) {
                const wsLogger = logger.child({
                    context: "websocket",
                    deviceName: ws.data.deviceName,
                    channelId: ws.data.channelId,
                });

                wsLogger.debug("Backpressure relieved, ready to send");

                // Phase 3 will implement queued message sending
            },

            // Connection closed - UPDATED for channel cleanup
            close(ws: ServerWebSocket<WebSocketData>, code: number, reason: string) {
                const { deviceName, channelId, connectedAt } = ws.data;

                const wsLogger = logger.child({
                    context: "websocket",
                    deviceName,
                    channelId,
                });

                // Calculate connection duration
                const duration = Date.now() - connectedAt.getTime();
                const durationSec = Math.floor(duration / 1000);

                wsLogger.info(
                    {
                        code,
                        reason: reason || "No reason provided",
                        durationSec,
                    },
                    "Device disconnected",
                );

                // Remove device from channel (auto-unsubscribes and notifies partner)
                channelManager.removeDevice(channelId, deviceName);
            },

            // Error handler
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

    // ============================================================================
    // Helper Functions for Phase 4
    // ============================================================================

    /**
     * Handle clipboard message
     * MODERN PATTERN: Uses child logger and reuses message utilities
     */
    function handleClipboardMessage(ws: ServerWebSocket<WebSocketData>, messageStr: string, maxSize: number): void {
        const { deviceName, channelId } = ws.data;
        const logger = getLogger();

        // Child logger for context
        const wsLogger = logger.child({
            context: "clipboard",
            deviceName,
            channelId,
        });

        // Validate message
        const validation = validateClipboardMessage(messageStr, maxSize);

        if (!validation.valid && validation.error) {
            wsLogger.warn({ error: validation.error }, "Invalid clipboard message");

            const errorMsg: ErrorMessage = {
                type: "error",
                timestamp: new Date().toISOString(),
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

            // Relay to partner
            const relayed = channelManager.relayToPartner(channelId, deviceName, messageStr);

            if (!relayed) {
                wsLogger.warn("No partner available to receive message");

                const errorMsg: ErrorMessage = {
                    type: "error",
                    timestamp: new Date().toISOString(),
                    code: "NO_PARTNER",
                    message: "No partner connected to receive message",
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
     * MODERN PATTERN: Uses child logger
     */
    function handleClipboardAck(ws: ServerWebSocket<WebSocketData>, messageStr: string): void {
        const { deviceName, channelId } = ws.data;
        const logger = getLogger();

        const wsLogger = logger.child({
            context: "clipboard_ack",
            deviceName,
            channelId,
        });

        // Validate ACK
        const validation = validateClipboardAck(messageStr);

        if (!validation.valid) {
            wsLogger.warn({ error: validation.error }, "Invalid ACK message");
            return; // Just ignore invalid ACKs
        }

        const ackMsg = validation.data;

        if (ackMsg) {
            wsLogger.debug({ receivedSize: ackMsg.receivedSize }, "ACK received");

            // Relay ACK to partner (the original sender)
            channelManager.relayToPartner(channelId, deviceName, messageStr);
        }
    }
}
