import { randomUUID } from "node:crypto";
import { getTimestamp } from "@/protocol/messages/utils.ts";
import type {
    Connection,
    ConnectionEventType,
    ConnectionMessage,
    ErrorCode,
    ErrorMessage,
    ReadyMessage,
} from "@/protocol/types";
import { MessageType } from "@/protocol/types/enums";

export function createReadyMessage(
    connectionId: string,
    sessionId: string,
    otherConnection: Connection | null,
): ReadyMessage {
    return {
        header: {
            type: MessageType.READY,
            id: randomUUID(),
            timestamp: getTimestamp(),
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
            timestamp: getTimestamp(),
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
            timestamp: getTimestamp(),
        },
        payload: {
            code,
            message,
            ...(messageId && { messageId }),
            ...(details && { details }),
        },
    };
}
