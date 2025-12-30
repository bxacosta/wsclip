import { randomUUID } from "node:crypto";
import type { ErrorCode, ErrorMessage, Metadata, PeerEventType, PeerMessage, ReadyMessage } from "@/protocol/types";
import { MessageType } from "@/protocol/types/enums";

export function createTimestamp(): string {
    return new Date().toISOString();
}

interface PeerInfo {
    peerId: string;
    metadata?: Metadata;
}

export function createReadyMessage(peerId: string, channelId: string, peer: PeerInfo | null): ReadyMessage {
    return {
        header: {
            type: MessageType.READY,
            id: randomUUID(),
            timestamp: createTimestamp(),
        },
        payload: {
            peerId,
            channelId,
            peer,
        },
    };
}

export function createPeerMessage(peerId: string, event: PeerEventType, metadata?: Metadata): PeerMessage {
    return {
        header: {
            type: MessageType.PEER,
            id: randomUUID(),
            timestamp: createTimestamp(),
        },
        payload: {
            peerId,
            event,
            ...(metadata && { metadata }),
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
            timestamp: createTimestamp(),
        },
        payload: {
            code,
            message,
            ...(messageId && { messageId }),
            ...(details && { details }),
        },
    };
}
