import type { WebSocketHandler } from "bun";
import { parseMessage } from "@/protocol/messages";
import { ErrorCode, MessageType } from "@/protocol/types/enums";
import {
    validateAckPayload,
    validateBaseMessage,
    validateControlPayload,
    validateDataPayload,
} from "@/protocol/validation";
import { type AppWebSocket, getContext, type WebSocketData } from "@/server/core";
import { handleWebSocketError } from "@/server/errors";
import { handleAckMessage, handleControlMessage, handleDataMessage } from "./handlers";
import { withValidation } from "./middleware";

function createWebSocketLogger(data: WebSocketData) {
    const { logger } = getContext();

    return logger.child({
        context: "websocket",
        peerId: data.client.id,
        channelId: data.channelId,
    });
}

export function createWebSocketHandler(): WebSocketHandler<WebSocketData> {
    const { config, channelManager } = getContext();

    return {
        maxPayloadLength: config.maxMessageSize,
        perMessageDeflate: config.compression,
        idleTimeout: config.idleTimeoutSec,
        backpressureLimit: 1024 * 1024,
        closeOnBackpressureLimit: false,
        sendPings: true,
        publishToSelf: false,

        open(ws: AppWebSocket) {
            const result = channelManager.addConnection(ws);

            if (!result.success) {
                handleWebSocketError(ws, result.errorCode);
                return;
            }
        },

        message(ws: AppWebSocket, message: string | Buffer) {
            const logger = createWebSocketLogger(ws.data);
            const rawMessage = typeof message === "string" ? message : message.toString("utf-8");
            const rawMessageSize = Buffer.byteLength(rawMessage, "utf-8");

            logger.debug({ sizeBytes: rawMessageSize }, "Message received");

            if (rawMessageSize > config.maxMessageSize) {
                logger.warn({ sizeBytes: rawMessageSize, maxSize: config.maxMessageSize }, "Message too large");
                handleWebSocketError(
                    ws,
                    ErrorCode.MESSAGE_TOO_LARGE,
                    `Message size ${rawMessageSize} exceeds maximum ${config.maxMessageSize} bytes`,
                );
                return;
            }

            const baseMessage = validateBaseMessage(parseMessage(rawMessage));

            console.log(baseMessage);
            if (!baseMessage.valid) {
                logger.warn({ error: baseMessage.error }, "Invalid message header");
                handleWebSocketError(ws, baseMessage.error.code, baseMessage.error.message);
                return;
            }

            const msgType = baseMessage.data.header.type;

            switch (msgType) {
                case MessageType.DATA: {
                    const dataHandler = withValidation(validateDataPayload, handleDataMessage);
                    dataHandler(ws, baseMessage.data, logger);
                    break;
                }
                case MessageType.ACK: {
                    const ackHandler = withValidation(validateAckPayload, handleAckMessage);
                    ackHandler(ws, baseMessage.data, logger);
                    break;
                }
                case MessageType.CONTROL: {
                    const controlHandler = withValidation(validateControlPayload, handleControlMessage);
                    controlHandler(ws, baseMessage.data, logger);
                    break;
                }
                default: {
                    logger.warn({ type: msgType }, "Unknown message type");
                    handleWebSocketError(ws, "INVALID_MESSAGE", `Unknown message type: ${msgType}`);
                }
            }
        },

        close(ws: AppWebSocket, code: number, reason: string) {
            const wsLogger = createWebSocketLogger(ws.data);
            channelManager.removeConnection(ws);
            wsLogger.info({ code, reason }, "Connection closed");
        },

        drain(ws: AppWebSocket) {
            const wsLogger = createWebSocketLogger(ws.data);
            wsLogger.debug("Backpressure relieved");
        },
    };
}
