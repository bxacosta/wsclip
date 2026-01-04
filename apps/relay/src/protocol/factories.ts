import { randomUUID } from "node:crypto";
import type {
    Connection,
    ConnectionMessage,
    ConnectionStatus,
    ErrorCode,
    ErrorMessage,
    ReadyMessage,
} from "./types.ts";
import { MessageType } from "./types.ts";

export function createReadyMessage(
    connectionId: string,
    sessionId: string,
    otherConnections: Connection[],
): ReadyMessage {
    return {
        header: {
            type: MessageType.READY,
            id: randomUUID(),
            timestamp: new Date().toISOString(),
        },
        payload: {
            connectionId,
            sessionId,
            otherConnections,
        },
    };
}

export function createConnectionMessage(connectionId: string, event: ConnectionStatus): ConnectionMessage {
    return {
        header: {
            type: MessageType.CONNECTION,
            id: randomUUID(),
            timestamp: new Date().toISOString(),
        },
        payload: {
            connectionId,
            event,
        },
    };
}

export function createErrorMessage(
    code: ErrorCode,
    message: string,
    messageId?: string,
    details?: Record<string, unknown>,
): ErrorMessage {
    return {
        header: {
            type: MessageType.ERROR,
            id: randomUUID(),
            timestamp: new Date().toISOString(),
        },
        payload: {
            code,
            message,
            ...(messageId && { messageId }),
            ...(details && { details }),
        },
    };
}
