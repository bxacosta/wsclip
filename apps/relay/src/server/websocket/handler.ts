import type { Server } from "bun";
import type { Env } from "@/config/env";
import { getLogger } from "@/config/logger";
import { DEFAULT_LIMITS, ERROR_MESSAGES, WS_CLOSE_CODES } from "@/protocol/constants";
import { createConnectedMessage, createErrorMessage, serializeMessage } from "@/protocol/messages";
import type { ErrorCode } from "@/protocol/types";
import { MessageType } from "@/protocol/types/enums";
import {
    validateAckPayload,
    validateAuthPayload,
    validateControlPayload,
    validateDataPayload,
} from "@/protocol/validation";
import { channelManager, type TypedWebSocket } from "@/server/channel";
import { getRateLimiter } from "@/server/security";

export interface UpgradeResult {
    success: boolean;
    errorCode?: ErrorCode;
    errorMessage?: string;
}

function validateChannelId(channel: string): boolean {
    return /^[a-zA-Z0-9]{8}$/.test(channel);
}

function validateDeviceName(deviceName: string): boolean {
    return deviceName.trim().length > 0;
}

export function createWebSocketHandlers(env: Env) {
    const logger = getLogger();

    return {
        upgrade(req: Request, server: Server<object>): UpgradeResult {
            const url = new URL(req.url);
            const ip = server.requestIP(req)?.address || "unknown";

            if (!getRateLimiter().checkLimit(ip)) {
                logger.warn({ ip }, "Connection rejected due to rate limit");
                channelManager.incrementError("RATE_LIMIT_EXCEEDED");
                return {
                    success: false,
                    errorCode: "RATE_LIMIT_EXCEEDED",
                    errorMessage: ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
                };
            }

            const channel = url.searchParams.get("channel") || "";
            const deviceName = url.searchParams.get("deviceName") || "";

            if (!validateChannelId(channel)) {
                logger.warn({ channel }, "Invalid channel ID");
                channelManager.incrementError("INVALID_CHANNEL");
                return {
                    success: false,
                    errorCode: "INVALID_CHANNEL",
                    errorMessage: ERROR_MESSAGES.INVALID_CHANNEL,
                };
            }

            if (!validateDeviceName(deviceName)) {
                logger.warn({ deviceName }, "Invalid device name");
                channelManager.incrementError("INVALID_DEVICE_NAME");
                return {
                    success: false,
                    errorCode: "INVALID_DEVICE_NAME",
                    errorMessage: ERROR_MESSAGES.INVALID_DEVICE_NAME,
                };
            }

            const data = {
                deviceName: deviceName.trim(),
                channelId: channel,
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

            open(ws: TypedWebSocket) {
                const wsLogger = logger.child({
                    context: "websocket",
                    deviceName: ws.data.deviceName,
                    channelId: ws.data.channelId,
                });

                wsLogger.info("Connection opened, waiting for auth message");

                ws.data.authTimeoutId = setTimeout(() => {
                    if (!ws.data.authenticated) {
                        wsLogger.warn("Auth timeout - closing connection");
                        channelManager.incrementError("AUTH_TIMEOUT");
                        const errorMsg = createErrorMessage("AUTH_TIMEOUT", ERROR_MESSAGES.AUTH_TIMEOUT);
                        ws.send(serializeMessage(errorMsg));
                        ws.close(WS_CLOSE_CODES.AUTH_TIMEOUT, "Authentication timeout");
                    }
                }, DEFAULT_LIMITS.AUTH_TIMEOUT_MS);
            },

            message(ws: TypedWebSocket, message: string | Buffer) {
                const { deviceName, channelId, authenticated } = ws.data;

                const wsLogger = logger.child({
                    context: "websocket",
                    deviceName,
                    channelId,
                });

                const messageStr = typeof message === "string" ? message : message.toString("utf-8");
                wsLogger.debug({ size: messageStr.length, authenticated }, "Message received");

                let parsed: unknown;
                try {
                    parsed = JSON.parse(messageStr);
                } catch {
                    wsLogger.warn("Invalid JSON received");
                    channelManager.incrementError("INVALID_MESSAGE");
                    const errorMsg = createErrorMessage("INVALID_MESSAGE", "Invalid JSON format");
                    ws.send(serializeMessage(errorMsg));
                    ws.close(WS_CLOSE_CODES.INVALID_MESSAGE, "Invalid JSON");
                    return;
                }

                const msgHeader = (parsed as { header?: { type?: string } }).header;
                if (!msgHeader?.type) {
                    wsLogger.warn("Message missing header.type");
                    channelManager.incrementError("INVALID_MESSAGE");
                    const errorMsg = createErrorMessage("INVALID_MESSAGE", "Message must have header.type");
                    ws.send(serializeMessage(errorMsg));
                    ws.close(WS_CLOSE_CODES.INVALID_MESSAGE, "Missing header.type");
                    return;
                }

                if (!authenticated) {
                    if (msgHeader.type !== MessageType.AUTH) {
                        wsLogger.warn({ type: msgHeader.type }, "Expected AUTH message");
                        channelManager.incrementError("INVALID_SECRET");
                        const errorMsg = createErrorMessage(
                            "INVALID_SECRET",
                            "Must authenticate first with AUTH message",
                        );
                        ws.send(serializeMessage(errorMsg));
                        ws.close(WS_CLOSE_CODES.INVALID_SECRET, "Not authenticated");
                        return;
                    }

                    handleAuthMessage(ws, parsed, env.SERVER_SECRET, wsLogger);
                    return;
                }

                if (msgHeader.type === MessageType.AUTH) {
                    wsLogger.warn("AUTH message received after authentication");
                    return;
                }

                switch (msgHeader.type) {
                    case MessageType.DATA: {
                        handleDataMessage(ws, parsed, env.MAX_MESSAGE_SIZE, wsLogger);
                        break;
                    }
                    case MessageType.ACK: {
                        handleAckMessage(ws, parsed, wsLogger);
                        break;
                    }
                    case MessageType.CONTROL: {
                        handleControlMessage(ws, parsed, wsLogger);
                        break;
                    }
                    default: {
                        wsLogger.warn({ type: msgHeader.type }, "Unknown message type");
                        const errorMsg = createErrorMessage(
                            "INVALID_MESSAGE",
                            `Unknown message type: ${msgHeader.type}`,
                        );
                        ws.send(serializeMessage(errorMsg));
                    }
                }
            },

            close(ws: TypedWebSocket, code: number, reason: string) {
                const wsLogger = logger.child({
                    context: "websocket",
                    deviceName: ws.data.deviceName,
                    channelId: ws.data.channelId,
                });

                if (ws.data.authTimeoutId) {
                    clearTimeout(ws.data.authTimeoutId);
                }

                if (ws.data.authenticated) {
                    channelManager.removeDevice(ws.data.channelId, ws.data.deviceName);
                }

                wsLogger.info({ code, reason }, "Connection closed");
            },

            drain(ws: TypedWebSocket) {
                const wsLogger = logger.child({
                    context: "websocket",
                    deviceName: ws.data.deviceName,
                    channelId: ws.data.channelId,
                });

                wsLogger.debug("Backpressure relieved");
            },
        },
    };
}

function handleAuthMessage(
    ws: TypedWebSocket,
    message: unknown,
    serverSecret: string,
    wsLogger: ReturnType<typeof getLogger>,
) {
    const validation = validateAuthPayload(message);

    if (!validation.valid || !validation.data) {
        wsLogger.warn({ error: validation.error }, "Invalid AUTH message");
        channelManager.incrementError(validation.error?.code || "INVALID_MESSAGE");
        const errorMsg = createErrorMessage(
            validation.error?.code || "INVALID_MESSAGE",
            validation.error?.message || "Invalid AUTH message",
        );
        ws.send(serializeMessage(errorMsg));
        ws.close(
            WS_CLOSE_CODES[validation.error?.code || "INVALID_MESSAGE"],
            validation.error?.message || "Invalid AUTH",
        );
        return;
    }

    const authData = validation.data;

    if (authData.payload.secret !== serverSecret) {
        wsLogger.warn("Invalid secret");
        channelManager.incrementError("INVALID_SECRET");
        const errorMsg = createErrorMessage("INVALID_SECRET", ERROR_MESSAGES.INVALID_SECRET);
        ws.send(serializeMessage(errorMsg));
        ws.close(WS_CLOSE_CODES.INVALID_SECRET, "Invalid secret");
        return;
    }

    if (authData.payload.channel !== ws.data.channelId) {
        wsLogger.warn({ authChannel: authData.payload.channel }, "Channel mismatch");
        channelManager.incrementError("INVALID_CHANNEL");
        const errorMsg = createErrorMessage("INVALID_CHANNEL", "Channel mismatch");
        ws.send(serializeMessage(errorMsg));
        ws.close(WS_CLOSE_CODES.INVALID_CHANNEL, "Channel mismatch");
        return;
    }

    if (authData.payload.deviceName.trim() !== ws.data.deviceName) {
        wsLogger.warn({ authDevice: authData.payload.deviceName }, "Device name mismatch");
        channelManager.incrementError("INVALID_DEVICE_NAME");
        const errorMsg = createErrorMessage("INVALID_DEVICE_NAME", "Device name mismatch");
        ws.send(serializeMessage(errorMsg));
        ws.close(WS_CLOSE_CODES.INVALID_DEVICE_NAME, "Device name mismatch");
        return;
    }

    if (ws.data.authTimeoutId) {
        clearTimeout(ws.data.authTimeoutId);
        ws.data.authTimeoutId = null;
    }

    ws.data.authenticated = true;
    ws.data.clientInfo = authData.payload.clientInfo;

    const addResult = channelManager.addDevice(ws.data.channelId, ws.data.deviceName, ws);

    if (!addResult.success && addResult.error) {
        wsLogger.warn({ error: addResult.error }, "Failed to add device to channel");
        const errorMsg = createErrorMessage(addResult.error.code, addResult.error.message);
        ws.send(serializeMessage(errorMsg));
        ws.close(WS_CLOSE_CODES[addResult.error.code], addResult.error.message);
        return;
    }

    const waitingForPeer = !channelManager.hasPeer(ws.data.channelId, ws.data.deviceName);
    const connectedMsg = createConnectedMessage(
        ws.data.deviceName,
        ws.data.channelId,
        waitingForPeer,
        ws.data.clientInfo,
    );

    ws.send(serializeMessage(connectedMsg));
    wsLogger.info({ waitingForPeer }, "Authentication successful");
}

function handleDataMessage(
    ws: TypedWebSocket,
    message: unknown,
    maxSize: number,
    wsLogger: ReturnType<typeof getLogger>,
) {
    const validation = validateDataPayload(message, maxSize);

    if (!validation.valid || !validation.data) {
        wsLogger.warn({ error: validation.error }, "Invalid DATA message");
        channelManager.incrementError(validation.error?.code || "INVALID_MESSAGE");
        const errorMsg = createErrorMessage(
            validation.error?.code || "INVALID_MESSAGE",
            validation.error?.message || "Invalid DATA message",
        );
        ws.send(serializeMessage(errorMsg));
        return;
    }

    const hasPeer = channelManager.hasPeer(ws.data.channelId, ws.data.deviceName);

    if (!hasPeer) {
        wsLogger.debug("No peer connected");
        channelManager.incrementError("NO_PEER_CONNECTED");
        const errorMsg = createErrorMessage("NO_PEER_CONNECTED", ERROR_MESSAGES.NO_PEER_CONNECTED);
        ws.send(serializeMessage(errorMsg));
        return;
    }

    const relayed = channelManager.relayToPeer(ws.data.channelId, ws.data.deviceName, JSON.stringify(message));

    if (!relayed) {
        wsLogger.warn("Failed to relay DATA message");
        const errorMsg = createErrorMessage("NO_PEER_CONNECTED", "Peer disconnected");
        ws.send(serializeMessage(errorMsg));
    }
}

function handleAckMessage(ws: TypedWebSocket, message: unknown, wsLogger: ReturnType<typeof getLogger>) {
    const validation = validateAckPayload(message);

    if (!validation.valid || !validation.data) {
        wsLogger.warn({ error: validation.error }, "Invalid ACK message");
        channelManager.incrementError("INVALID_MESSAGE");
        const errorMsg = createErrorMessage("INVALID_MESSAGE", "Invalid ACK message");
        ws.send(serializeMessage(errorMsg));
        return;
    }

    const hasPeer = channelManager.hasPeer(ws.data.channelId, ws.data.deviceName);

    if (!hasPeer) {
        wsLogger.debug("No peer connected for ACK relay");
        return;
    }

    channelManager.relayToPeer(ws.data.channelId, ws.data.deviceName, JSON.stringify(message));
}

function handleControlMessage(ws: TypedWebSocket, message: unknown, wsLogger: ReturnType<typeof getLogger>) {
    const validation = validateControlPayload(message);

    if (!validation.valid || !validation.data) {
        wsLogger.warn({ error: validation.error }, "Invalid CONTROL message");
        channelManager.incrementError("INVALID_MESSAGE");
        const errorMsg = createErrorMessage("INVALID_MESSAGE", "Invalid CONTROL message");
        ws.send(serializeMessage(errorMsg));
        return;
    }

    const hasPeer = channelManager.hasPeer(ws.data.channelId, ws.data.deviceName);

    if (!hasPeer) {
        wsLogger.debug("No peer connected for CONTROL relay");
        channelManager.incrementError("NO_PEER_CONNECTED");
        const errorMsg = createErrorMessage("NO_PEER_CONNECTED", ERROR_MESSAGES.NO_PEER_CONNECTED);
        ws.send(serializeMessage(errorMsg));
        return;
    }

    channelManager.relayToPeer(ws.data.channelId, ws.data.deviceName, JSON.stringify(message));
}
