import type { Logger } from "pino";
import {
    type AckMessage,
    type Connection,
    type ConnectionEventType,
    type ControlMessage,
    createConnectionMessage,
    createReadyMessage,
    type DataMessage,
    MessageType,
    serializeMessage,
    type ValidatedMessage,
} from "@/protocol";
import { type AppWebSocket, getContext } from "@/server/core";
import { handleAckMessage, handleControlMessage, handleDataMessage } from "@/server/websocket/handler";

export function sendReadyMessage(ws: AppWebSocket, otherConnection: Connection | null): void {
    const { sessionId, connection } = ws.data;
    const readyMessage = createReadyMessage(connection.id, sessionId, otherConnection);
    ws.send(serializeMessage(readyMessage));
}

export function notifyOtherConnections(ws: AppWebSocket, eventType: ConnectionEventType, logger: Logger): void {
    const { sessionManager } = getContext();
    const { sessionId, connection } = ws.data;

    const connections = sessionManager.getOtherConnections(sessionId, connection.id);
    const connectionMessage = createConnectionMessage(connection.id, eventType);
    const serialized = serializeMessage(connectionMessage);

    for (const sessionConnection of connections) {
        sessionConnection.ws.send(serialized);
        logger.debug({ to: sessionConnection.info.id, event: eventType }, "Connection notification sent");
    }
}

export function dispatchMessage(ws: AppWebSocket, message: ValidatedMessage, logger: Logger): void {
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
