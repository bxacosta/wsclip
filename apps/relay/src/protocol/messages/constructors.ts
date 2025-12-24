import { randomUUID } from "node:crypto";
import type {
    ClientInfo,
    ConnectedMessage,
    ErrorCode,
    ErrorMessage,
    PeerEventMessage,
    PeerEventType,
    ShutdownMessage,
} from "@/protocol/types";
import { MessageType } from "@/protocol/types/enums";

export function createTimestamp(): string {
    return new Date().toISOString();
}

export function createConnectedMessage(
    deviceName: string,
    channelId: string,
    waitingForPeer: boolean,
    clientInfo?: ClientInfo,
): ConnectedMessage {
    return {
        header: {
            type: MessageType.CONNECTED,
            id: randomUUID(),
            timestamp: createTimestamp(),
        },
        payload: {
            deviceName,
            channelId,
            waitingForPeer,
            ...(clientInfo && { clientInfo }),
        },
    };
}

export function createPeerEventMessage(
    peerName: string,
    event: PeerEventType,
    clientInfo?: ClientInfo,
    detail?: string,
): PeerEventMessage {
    return {
        header: {
            type: MessageType.PEER_EVENT,
            id: randomUUID(),
            timestamp: createTimestamp(),
        },
        payload: {
            peerName,
            event,
            ...(clientInfo && { clientInfo }),
            ...(detail && { detail }),
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

export function createShutdownMessage(message: string, gracePeriod?: number): ShutdownMessage {
    return {
        header: {
            type: MessageType.SHUTDOWN,
            id: randomUUID(),
            timestamp: createTimestamp(),
        },
        payload: {
            message,
            ...(gracePeriod !== undefined && { gracePeriod }),
        },
    };
}
