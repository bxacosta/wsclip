import type { ServerWebSocket, WebSocketHandler } from "bun";
import type { Logger } from "pino";
import type { AckMessage, ControlMessage, DataMessage } from "@/protocol/types";
import { ErrorCode, MessageType } from "@/protocol/types/enums";
import { type AppWebSocket, getContext, type WebSocketData } from "@/server/core";
import { sendWebSocketError } from "@/server/errors";
import { type ValidatedMessage, validateMessage } from "@/server/websocket/validator";

function createLogger(ws: ServerWebSocket<WebSocketData>): Logger {
    const { logger } = getContext();

    return logger.child({
        context: "websocket",
        peerId: ws.data.client.id,
        channelId: ws.data.channelId,
    });
}

function handleDataMessage(ws: AppWebSocket, message: DataMessage, logger: Logger): void {
    const { channelManager } = getContext();

    if (!channelManager.hasOtherPeer(ws)) {
        logger.debug("No peer connected");
        sendWebSocketError(ws, ErrorCode.NO_PEER_CONNECTED);
        return;
    }

    logger.debug({ messageId: message.header.id, contentType: message.payload.contentType }, "Relaying DATA message");

    const results = channelManager.relayToClients(ws, message);
    const failed = results.some(r => !r.success);

    if (failed) {
        logger.warn("Failed to relay DATA message");
        sendWebSocketError(ws, ErrorCode.NO_PEER_CONNECTED, "Peer disconnected");
    }
}

function handleAckMessage(ws: AppWebSocket, message: AckMessage, logger: Logger): void {
    const { channelManager } = getContext();

    if (!channelManager.hasOtherPeer(ws)) {
        logger.debug("No peer connected for ACK relay");
        return;
    }

    logger.debug(
        { ackId: message.header.id, messageId: message.payload.messageId, status: message.payload.status },
        "Relaying ACK message",
    );

    channelManager.relayToClients(ws, message);
}

function handleControlMessage(ws: AppWebSocket, message: ControlMessage, logger: Logger): void {
    const { channelManager } = getContext();

    if (!channelManager.hasOtherPeer(ws)) {
        logger.debug("No peer connected for CONTROL relay");
        sendWebSocketError(ws, ErrorCode.NO_PEER_CONNECTED);
        return;
    }

    logger.debug({ messageId: message.header.id, command: message.payload.command }, "Relaying CONTROL message");

    channelManager.relayToClients(ws, message);
}

function dispatchMessage(ws: AppWebSocket, message: ValidatedMessage, logger: Logger): void {
    switch (message.header.type) {
        case MessageType.DATA:
            handleDataMessage(ws, message as DataMessage, logger);
            break;
        case MessageType.ACK:
            handleAckMessage(ws, message as AckMessage, logger);
            break;
        case MessageType.CONTROL:
            handleControlMessage(ws, message as ControlMessage, logger);
            break;
    }
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
                sendWebSocketError(ws, result.errorCode);
            }
        },

        message(ws: AppWebSocket, raw: string | Buffer) {
            const logger = createLogger(ws);
            const rawMessage = typeof raw === "string" ? raw : raw.toString("utf-8");

            const result = validateMessage(rawMessage, config.maxMessageSize, logger);

            if (!result.valid) {
                sendWebSocketError(ws, result.error.code, result.error.message);
                return;
            }

            dispatchMessage(ws, result.data, logger);
        },

        close(ws: AppWebSocket, code: number, reason: string) {
            const logger = createLogger(ws);
            channelManager.removeConnection(ws);
            logger.info({ code, reason }, "Connection closed");
        },

        drain(ws: AppWebSocket) {
            const logger = createLogger(ws);
            logger.debug("Backpressure relieved");
        },
    };
}
