import { randomUUID } from "node:crypto";
import type {
    Connection,
    ConnectionEventType,
    ConnectionMessage,
    ErrorCode,
    ErrorMessage,
    ReadyMessage,
} from "./types.ts";
import { MessageType } from "./types.ts";

export function createReadyMessage(
    connectionId: string,
    sessionId: string,
    otherConnection: Connection | null,
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
            otherConnection,
        },
    };
}

export function createConnectionMessage(connectionId: string, event: ConnectionEventType): ConnectionMessage {
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
