import type { ServerWebSocket, WebSocketHandler } from "bun";
import type { Logger } from "pino";
import {
    type AckMessage,
    ConnectionStatus,
    type ControlMessage,
    type DataMessage,
    ErrorCode,
    validateMessage,
} from "@/protocol";
import { type AppWebSocket, getContext, type WebSocketData } from "@/server/core";
import { sendWebSocketError } from "@/server/errors";
import type { RelayResultItem } from "@/server/session/types";
import { dispatchMessage, notifyOtherConnections, sendReadyMessage } from "@/server/websocket/dispatcher.ts";

export function handleDataMessage(ws: AppWebSocket, message: DataMessage, logger: Logger): void {
    const { sessionManager } = getContext();

    if (!sessionManager.hasOtherConnection(ws)) {
        logger.debug("No other connection in session");
        sendWebSocketError(ws, ErrorCode.NO_OTHER_CONNECTION);
        return;
    }

    const result = sessionManager.relayToConnections(ws, message);

    for (const item of result.results) {
        if (item.success) {
            logger.debug(
                { to: item.connectionId, sizeBytes: item.sizeBytes, status: item.status },
                "DATA message relayed",
            );
        } else {
            logger.warn({ to: item.connectionId, errorCode: item.errorCode }, "DATA message dropped");
        }
    }

    const hasFailed = result.results.some((r: RelayResultItem) => !r.success);
    if (hasFailed) {
        sendWebSocketError(ws, ErrorCode.NO_OTHER_CONNECTION, "Connection disconnected");
    }
}

export function handleAckMessage(ws: AppWebSocket, message: AckMessage, logger: Logger): void {
    const { sessionManager } = getContext();

    if (!sessionManager.hasOtherConnection(ws)) {
        logger.debug("No other connection for ACK relay");
        return;
    }

    const result = sessionManager.relayToConnections(ws, message);

    for (const item of result.results) {
        if (item.success) {
            logger.debug(
                {
                    to: item.connectionId,
                    ackId: message.header.id,
                    messageId: message.payload.messageId,
                    status: message.payload.status,
                },
                "ACK message relayed",
            );
        }
    }
}

export function handleControlMessage(ws: AppWebSocket, message: ControlMessage, logger: Logger): void {
    const { sessionManager } = getContext();

    if (!sessionManager.hasOtherConnection(ws)) {
        logger.debug("No other connection for CONTROL relay");
        sendWebSocketError(ws, ErrorCode.NO_OTHER_CONNECTION);
        return;
    }

    const result = sessionManager.relayToConnections(ws, message);

    for (const item of result.results) {
        if (item.success) {
            logger.debug({ to: item.connectionId, command: message.payload.command }, "CONTROL message relayed");
        }
    }
}

export function createWebSocketHandler(): WebSocketHandler<WebSocketData> {
    const { config, sessionManager } = getContext();

    return {
        maxPayloadLength: config.maxMessageSize,
        perMessageDeflate: config.compression,
        idleTimeout: config.idleTimeoutSec,
        backpressureLimit: 1024 * 1024,
        closeOnBackpressureLimit: false,
        sendPings: true,
        publishToSelf: false,

        open(ws: AppWebSocket) {
            const logger = createLogger(ws);
            const result = sessionManager.addConnection(ws);

            if (!result.success) {
                logger.warn(result.context, `Connection rejected: ${result.errorCode}`);
                sendWebSocketError(ws, result.errorCode);
                return;
            }

            if (result.sessionCreated) {
                logger.info({ totalSessions: result.totalSessions }, "Session created");
            }

            logger.info({ totalConnections: result.totalConnections }, "Connection joined session");

            sendReadyMessage(ws, result.otherConnections);

            if (result.shouldNotifyOthers) {
                notifyOtherConnections(ws, ConnectionStatus.CONNECTED, logger);
            }
        },

        message(ws: AppWebSocket, raw: string | Buffer) {
            const logger = createLogger(ws);
            const rawMessage = typeof raw === "string" ? raw : raw.toString("utf-8");
            const sizeBytes = Buffer.byteLength(rawMessage, "utf-8");

            logger.debug({ sizeBytes }, "Message received");

            const result = validateMessage(rawMessage, config.maxMessageSize);

            if (!result.valid) {
                logger.warn({ errorCode: result.error.code }, result.error.message);
                sendWebSocketError(ws, result.error.code, result.error.message);
                return;
            }

            dispatchMessage(ws, result.data, logger);
        },

        close(ws: AppWebSocket, code: number, reason: string) {
            const logger = createLogger(ws);
            const result = sessionManager.removeConnection(ws);

            if (!result.removed) {
                logger.debug({ reason: result.reason }, "Connection removal skipped");
                return;
            }

            logger.info({ remainingConnections: result.remainingConnections }, "Connection left session");

            if (result.shouldNotifyOthers) {
                notifyOtherConnections(ws, ConnectionStatus.DISCONNECTED, logger);
            }

            if (result.sessionDestroyed) {
                logger.info("Session destroyed");
            }

            logger.info({ code, reason }, "Connection closed");
        },

        drain(ws: AppWebSocket) {
            const logger = createLogger(ws);
            logger.debug("Backpressure relieved");
        },
    };
}

function createLogger(ws: ServerWebSocket<WebSocketData>): Logger {
    const { logger } = getContext();

    return logger.child({
        sessionId: ws.data.sessionId,
        connectionId: ws.data.connection.id,
    });
}
