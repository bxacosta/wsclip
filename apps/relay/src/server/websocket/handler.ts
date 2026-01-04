import type { ServerWebSocket, WebSocketHandler } from "bun";
import type { Logger } from "pino";
import { createPeerMessage, createReadyMessage, serializeMessage } from "@/protocol/messages";
import type { AckMessage, ControlMessage, DataMessage, Peer } from "@/protocol/types";
import { ErrorCode, MessageType, PeerEventType } from "@/protocol/types/enums";
import { type AppWebSocket, getContext, type WebSocketData } from "@/server/core";
import { sendWebSocketError } from "@/server/errors";
import { type ValidatedMessage, validateMessage } from "@/server/websocket/validator";

function createLogger(ws: ServerWebSocket<WebSocketData>): Logger {
    const { logger } = getContext();

    return logger.child({
        sessionId: ws.data.sessionId,
        peerId: ws.data.client.id,
    });
}

function sendReadyMessage(ws: AppWebSocket, existingPeer: Peer | null): void {
    const { sessionId, client } = ws.data;
    // Note: Protocol uses "channelId" in wire format (external API)
    const readyMessage = createReadyMessage(client.id, sessionId, existingPeer);
    ws.send(serializeMessage(readyMessage));
}

function notifyPeers(ws: AppWebSocket, eventType: PeerEventType, logger: Logger): void {
    const { sessionManager } = getContext();
    const { sessionId, client } = ws.data;

    const connections = sessionManager.getOtherConnections(sessionId, client.id);
    const peerMessage = createPeerMessage(client.id, eventType);
    const serialized = serializeMessage(peerMessage);

    for (const connection of connections) {
        connection.ws.send(serialized);
        logger.debug({ to: connection.client.id, event: eventType }, "Peer notification sent");
    }
}

function handleDataMessage(ws: AppWebSocket, message: DataMessage, logger: Logger): void {
    const { sessionManager } = getContext();

    if (!sessionManager.hasOtherPeer(ws)) {
        logger.debug("No peer connected");
        sendWebSocketError(ws, ErrorCode.NO_PEER_CONNECTED);
        return;
    }

    const result = sessionManager.relayToClients(ws, message);

    for (const item of result.results) {
        if (item.success) {
            logger.debug({ to: item.clientId, sizeBytes: item.sizeBytes, status: item.status }, "DATA message relayed");
        } else {
            logger.warn({ to: item.clientId, errorCode: item.errorCode }, "DATA message dropped");
        }
    }

    const hasFailed = result.results.some(r => !r.success);
    if (hasFailed) {
        sendWebSocketError(ws, ErrorCode.NO_PEER_CONNECTED, "Peer disconnected");
    }
}

function handleAckMessage(ws: AppWebSocket, message: AckMessage, logger: Logger): void {
    const { sessionManager } = getContext();

    if (!sessionManager.hasOtherPeer(ws)) {
        logger.debug("No peer connected for ACK relay");
        return;
    }

    const result = sessionManager.relayToClients(ws, message);

    for (const item of result.results) {
        if (item.success) {
            logger.debug(
                {
                    to: item.clientId,
                    ackId: message.header.id,
                    messageId: message.payload.messageId,
                    status: message.payload.status,
                },
                "ACK message relayed",
            );
        }
    }
}

function handleControlMessage(ws: AppWebSocket, message: ControlMessage, logger: Logger): void {
    const { sessionManager } = getContext();

    if (!sessionManager.hasOtherPeer(ws)) {
        logger.debug("No peer connected for CONTROL relay");
        sendWebSocketError(ws, ErrorCode.NO_PEER_CONNECTED);
        return;
    }

    const result = sessionManager.relayToClients(ws, message);

    for (const item of result.results) {
        if (item.success) {
            logger.debug({ to: item.clientId, command: message.payload.command }, "CONTROL message relayed");
        }
    }
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

            logger.info({ totalConnections: result.totalConnections }, "Client joined session");

            sendReadyMessage(ws, result.existingPeer);

            if (result.shouldNotifyPeers) {
                notifyPeers(ws, PeerEventType.JOINED, logger);
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

            logger.info({ remainingConnections: result.remainingConnections }, "Client left session");

            if (result.shouldNotifyPeers) {
                notifyPeers(ws, PeerEventType.LEFT, logger);
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
