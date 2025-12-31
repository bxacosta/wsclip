import { randomUUID } from "node:crypto";
import { getTimestamp } from "@/protocol/messages/utils.ts";
import type { ErrorCode, ErrorMessage, Peer, PeerEventType, PeerMessage, ReadyMessage } from "@/protocol/types";
import { MessageType } from "@/protocol/types/enums";

export function createReadyMessage(peerId: string, channelId: string, peer: Peer | null): ReadyMessage {
    return {
        header: {
            type: MessageType.READY,
            id: randomUUID(),
            timestamp: getTimestamp(),
        },
        payload: {
            peerId,
            channelId,
            peer,
        },
    };
}

export function createPeerMessage(peerId: string, event: PeerEventType): PeerMessage {
    return {
        header: {
            type: MessageType.PEER,
            id: randomUUID(),
            timestamp: getTimestamp(),
        },
        payload: {
            peerId,
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
