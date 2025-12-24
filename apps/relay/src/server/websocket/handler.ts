import type { Env } from "@/config/env";
import { DEFAULT_LIMITS, ERROR_MESSAGES } from "@/protocol/constants";
import { parseMessage } from "@/protocol/messages";
import { MessageType } from "@/protocol/types/enums";
import {
    validateAckPayload,
    validateAuthPayload,
    validateControlPayload,
    validateDataPayload,
    validateHeader,
} from "@/protocol/validation";
import { channelManager, type TypedWebSocket } from "@/server/channel";
import { handleAckMessage, handleAuthMessage, handleControlMessage, handleDataMessage } from "./handlers";
import { sendError, sendErrorAndClose, withValidation } from "./middleware";
import { handleUpgrade, type UpgradeResult } from "./upgrade";
import { createWebSocketLogger } from "./utils";

export type { UpgradeResult };

export function createWebSocketHandlers(env: Env) {
    return {
        upgrade: handleUpgrade,

        websocket: {
            maxPayloadLength: env.MAX_MESSAGE_SIZE,
            perMessageDeflate: env.COMPRESSION_ENABLED,
            idleTimeout: env.IDLE_TIMEOUT,
            backpressureLimit: 1024 * 1024, // 1 MiB
            closeOnBackpressureLimit: false,
            sendPings: true,
            publishToSelf: false,

            open(ws: TypedWebSocket) {
                const wsLogger = createWebSocketLogger(ws);

                wsLogger.info("Connection opened, waiting for auth message");

                ws.data.authTimeoutId = setTimeout(() => {
                    if (!ws.data.authenticated) {
                        wsLogger.warn("Auth timeout - closing connection");
                        sendErrorAndClose(ws, "AUTH_TIMEOUT", ERROR_MESSAGES.AUTH_TIMEOUT, wsLogger);
                    }
                }, DEFAULT_LIMITS.AUTH_TIMEOUT_MS);
            },

            message(ws: TypedWebSocket, message: string | Buffer) {
                const { authenticated } = ws.data;
                const wsLogger = createWebSocketLogger(ws);

                const messageStr = typeof message === "string" ? message : message.toString("utf-8");
                const messageSizeBytes = Buffer.byteLength(messageStr, "utf-8");

                wsLogger.debug({ sizeBytes: messageSizeBytes, authenticated }, "Message received");

                if (messageSizeBytes > env.MAX_MESSAGE_SIZE) {
                    wsLogger.warn({ sizeBytes: messageSizeBytes, maxSize: env.MAX_MESSAGE_SIZE }, "Message too large");
                    sendErrorAndClose(
                        ws,
                        "MESSAGE_TOO_LARGE",
                        `Message size ${messageSizeBytes} exceeds maximum ${env.MAX_MESSAGE_SIZE} bytes`,
                        wsLogger,
                    );
                    return;
                }

                const parsed = parseMessage(messageStr);
                if (!parsed) {
                    wsLogger.warn("Invalid JSON received");
                    sendErrorAndClose(ws, "INVALID_MESSAGE", "Invalid JSON format", wsLogger);
                    return;
                }

                const headerValidation = validateHeader(parsed);
                if (!headerValidation.valid || !headerValidation.data) {
                    wsLogger.warn({ error: headerValidation.error }, "Invalid message header");
                    sendErrorAndClose(
                        ws,
                        headerValidation.error?.code || "INVALID_MESSAGE",
                        headerValidation.error?.message || "Invalid message header",
                        wsLogger,
                    );
                    return;
                }

                const msgType = headerValidation.data.type;

                if (!authenticated) {
                    if (msgType !== MessageType.AUTH) {
                        wsLogger.warn({ type: msgType }, "Expected AUTH message");
                        sendErrorAndClose(ws, "INVALID_SECRET", "Must authenticate first with AUTH message", wsLogger);
                        return;
                    }

                    const authValidation = validateAuthPayload(parsed);
                    if (!authValidation.valid || !authValidation.data) {
                        wsLogger.warn({ error: authValidation.error }, "Invalid AUTH message");
                        sendErrorAndClose(
                            ws,
                            authValidation.error?.code || "INVALID_MESSAGE",
                            authValidation.error?.message || "Invalid AUTH message",
                            wsLogger,
                        );
                        return;
                    }

                    handleAuthMessage(ws, authValidation.data, env.SERVER_SECRET, wsLogger);
                    return;
                }

                if (msgType === MessageType.AUTH) {
                    wsLogger.warn("AUTH message received after authentication");
                    return;
                }

                switch (msgType) {
                    case MessageType.DATA: {
                        const dataHandler = withValidation(validateDataPayload, handleDataMessage);
                        dataHandler(ws, parsed, wsLogger);
                        break;
                    }
                    case MessageType.ACK: {
                        const ackHandler = withValidation(validateAckPayload, handleAckMessage);
                        ackHandler(ws, parsed, wsLogger);
                        break;
                    }
                    case MessageType.CONTROL: {
                        const controlHandler = withValidation(validateControlPayload, handleControlMessage);
                        controlHandler(ws, parsed, wsLogger);
                        break;
                    }
                    default: {
                        wsLogger.warn({ type: msgType }, "Unknown message type");
                        sendError(ws, "INVALID_MESSAGE", `Unknown message type: ${msgType}`, wsLogger);
                    }
                }
            },

            close(ws: TypedWebSocket, code: number, reason: string) {
                const wsLogger = createWebSocketLogger(ws);

                if (ws.data.authTimeoutId) {
                    clearTimeout(ws.data.authTimeoutId);
                }

                if (ws.data.authenticated) {
                    channelManager.removeDevice(ws.data.channelId, ws.data.deviceName);
                }

                wsLogger.info({ code, reason }, "Connection closed");
            },

            drain(ws: TypedWebSocket) {
                const wsLogger = createWebSocketLogger(ws);
                wsLogger.debug("Backpressure relieved");
            },
        },
    };
}
