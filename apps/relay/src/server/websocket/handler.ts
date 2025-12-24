import type { Env } from "@/config/env";
import { DEFAULT_LIMITS } from "@/protocol/constants";
import { parseMessage } from "@/protocol/messages";
import { MessageType } from "@/protocol/types/enums";
import {
    validateAckPayload,
    validateAuthPayload,
    validateControlPayload,
    validateDataPayload,
    validateHeader,
} from "@/protocol/validation";
import { getChannelManager, isAuthenticated, type TypedWebSocket } from "@/server/channel";
import { handleProtocolError } from "@/server/errors";
import { handleAckMessage, handleAuthMessage, handleControlMessage, handleDataMessage } from "./handlers";
import { withValidation } from "./middleware";
import { handleUpgrade, type UpgradeResult } from "./upgrade";
import { createWebSocketLogger } from "./utils";

export type { UpgradeResult };

/**
 * Creates WebSocket handlers configured with the given environment.
 *
 * @param env - Environment configuration
 * @returns Object containing upgrade function and websocket handlers
 */
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

            /**
             * Called when a new WebSocket connection is opened.
             * Sets up authentication timeout.
             */
            open(ws: TypedWebSocket) {
                const wsLogger = createWebSocketLogger(ws);
                wsLogger.info("Connection opened, waiting for auth message");

                ws.data.authTimeoutId = setTimeout(() => {
                    if (!isAuthenticated(ws.data)) {
                        wsLogger.warn("Auth timeout - closing connection");
                        handleProtocolError(ws, "AUTH_TIMEOUT", undefined, wsLogger);
                    }
                }, DEFAULT_LIMITS.AUTH_TIMEOUT_MS);
            },

            /**
             * Called when a message is received on the WebSocket.
             * Routes messages based on type and authentication state.
             */
            message(ws: TypedWebSocket, message: string | Buffer) {
                const wsLogger = createWebSocketLogger(ws);
                const messageStr = typeof message === "string" ? message : message.toString("utf-8");
                const messageSizeBytes = Buffer.byteLength(messageStr, "utf-8");

                wsLogger.debug({ sizeBytes: messageSizeBytes, phase: ws.data.phase }, "Message received");

                // Check message size
                if (messageSizeBytes > env.MAX_MESSAGE_SIZE) {
                    wsLogger.warn({ sizeBytes: messageSizeBytes, maxSize: env.MAX_MESSAGE_SIZE }, "Message too large");
                    handleProtocolError(
                        ws,
                        "MESSAGE_TOO_LARGE",
                        `Message size ${messageSizeBytes} exceeds maximum ${env.MAX_MESSAGE_SIZE} bytes`,
                        wsLogger,
                    );
                    return;
                }

                // Parse JSON
                const parsed = parseMessage(messageStr);
                if (!parsed) {
                    wsLogger.warn("Invalid JSON received");
                    handleProtocolError(ws, "INVALID_MESSAGE", "Invalid JSON format", wsLogger);
                    return;
                }

                // Validate header
                const headerValidation = validateHeader(parsed);
                if (!headerValidation.valid || !headerValidation.data) {
                    wsLogger.warn({ error: headerValidation.error }, "Invalid message header");
                    handleProtocolError(
                        ws,
                        headerValidation.error?.code || "INVALID_MESSAGE",
                        headerValidation.error?.message || "Invalid message header",
                        wsLogger,
                    );
                    return;
                }

                const msgType = headerValidation.data.type;

                // Handle pre-authentication state
                if (!isAuthenticated(ws.data)) {
                    if (msgType !== MessageType.AUTH) {
                        wsLogger.warn({ type: msgType }, "Expected AUTH message");
                        handleProtocolError(
                            ws,
                            "INVALID_SECRET",
                            "Must authenticate first with AUTH message",
                            wsLogger,
                        );
                        return;
                    }

                    const authValidation = validateAuthPayload(parsed);
                    if (!authValidation.valid || !authValidation.data) {
                        wsLogger.warn({ error: authValidation.error }, "Invalid AUTH message");
                        handleProtocolError(
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

                // Ignore AUTH messages after authentication
                if (msgType === MessageType.AUTH) {
                    wsLogger.warn("AUTH message received after authentication");
                    return;
                }

                // Route authenticated messages
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
                        handleProtocolError(ws, "INVALID_MESSAGE", `Unknown message type: ${msgType}`, wsLogger);
                    }
                }
            },

            /**
             * Called when a WebSocket connection is closed.
             * Cleans up timeouts and removes device from channel.
             */
            close(ws: TypedWebSocket, code: number, reason: string) {
                const wsLogger = createWebSocketLogger(ws);

                if (ws.data.authTimeoutId) {
                    clearTimeout(ws.data.authTimeoutId);
                }

                if (isAuthenticated(ws.data)) {
                    getChannelManager().removeDevice(ws.data.channelId, ws.data.deviceName);
                }

                wsLogger.info({ code, reason }, "Connection closed");
            },

            /**
             * Called when backpressure is relieved on the WebSocket.
             */
            drain(ws: TypedWebSocket) {
                const wsLogger = createWebSocketLogger(ws);
                wsLogger.debug("Backpressure relieved");
            },
        },
    };
}
