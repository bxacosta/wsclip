import type { ContentType, ErrorCode, MessageType, PeerEventType } from "./enums";

export interface MessageHeader {
    type: MessageType;
    id: string;
    timestamp: string;
}

export interface BaseMessage {
    header: MessageHeader;
    payload: Record<string, unknown>;
}

export interface ClientInfo {
    platform?: string;
    version?: string;
    [key: string]: unknown;
}

export interface AuthMessage extends BaseMessage {
    header: MessageHeader & { type: "auth" };
    payload: {
        secret: string;
        channel: string;
        deviceName: string;
        clientInfo?: ClientInfo;
    };
}

export interface ControlMessage extends BaseMessage {
    header: MessageHeader & { type: "control" };
    payload: {
        command: string;
        params?: Record<string, unknown> | null;
    };
}

export interface DataMetadata {
    size?: number;
    encoding?: string;
    [key: string]: unknown;
}

export interface DataMessage extends BaseMessage {
    header: MessageHeader & { type: "data" };
    payload: {
        contentType: ContentType;
        data: string;
        metadata?: DataMetadata;
    };
}

export interface AckDetails {
    receivedAt?: string;
    processedAt?: string;
    [key: string]: unknown;
}

export interface AckMessage extends BaseMessage {
    header: MessageHeader & { type: "ack" };
    payload: {
        messageId: string;
        status: "received" | "processed" | "error";
        details?: AckDetails | null;
    };
}

export interface ConnectedMessage extends BaseMessage {
    header: MessageHeader & { type: "connected" };
    payload: {
        deviceName: string;
        channelId: string;
        waitingForPeer: boolean;
        clientInfo?: ClientInfo;
    };
}

export interface PeerEventMessage extends BaseMessage {
    header: MessageHeader & { type: "peer_event" };
    payload: {
        peerName: string;
        event: PeerEventType;
        clientInfo?: ClientInfo;
        detail?: string;
    };
}

export interface ErrorMessage extends BaseMessage {
    header: MessageHeader & { type: "error" };
    payload: {
        code: ErrorCode;
        message: string;
        messageId?: string;
        details?: Record<string, unknown>;
    };
}

export interface ShutdownMessage extends BaseMessage {
    header: MessageHeader & { type: "shutdown" };
    payload: {
        message: string;
        gracePeriod?: number;
    };
}

export type CRSPMessage =
    | AuthMessage
    | ControlMessage
    | DataMessage
    | AckMessage
    | ConnectedMessage
    | PeerEventMessage
    | ErrorMessage
    | ShutdownMessage;
