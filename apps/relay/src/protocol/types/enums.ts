export const MessageType = {
    CONTROL: "control",
    DATA: "data",
    ACK: "ack",
    READY: "ready",
    PEER: "peer",
    ERROR: "error",
    SHUTDOWN: "shutdown",
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export const ErrorCode = {
    INVALID_SECRET: "INVALID_SECRET",
    INVALID_CHANNEL: "INVALID_CHANNEL",
    INVALID_PEER_ID: "INVALID_PEER_ID",
    CHANNEL_FULL: "CHANNEL_FULL",
    DUPLICATE_PEER_ID: "DUPLICATE_PEER_ID",
    INVALID_MESSAGE: "INVALID_MESSAGE",
    MESSAGE_TOO_LARGE: "MESSAGE_TOO_LARGE",
    NO_PEER_CONNECTED: "NO_PEER_CONNECTED",
    RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
    MAX_CHANNELS_REACHED: "MAX_CHANNELS_REACHED",
    INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ContentType = {
    TEXT: "text",
    BINARY: "binary",
} as const;

export type ContentType = (typeof ContentType)[keyof typeof ContentType];

export const PeerEventType = {
    JOINED: "joined",
    LEFT: "left",
} as const;

export type PeerEventType = (typeof PeerEventType)[keyof typeof PeerEventType];
