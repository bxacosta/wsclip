export const MessageType = {
    AUTH: "auth",
    CONTROL: "control",
    DATA: "data",
    ACK: "ack",
    CONNECTED: "connected",
    PEER_EVENT: "peer_event",
    ERROR: "error",
    SHUTDOWN: "shutdown",
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export const ErrorCode = {
    INVALID_SECRET: "INVALID_SECRET",
    INVALID_CHANNEL: "INVALID_CHANNEL",
    INVALID_DEVICE_NAME: "INVALID_DEVICE_NAME",
    CHANNEL_FULL: "CHANNEL_FULL",
    DUPLICATE_DEVICE_NAME: "DUPLICATE_DEVICE_NAME",
    INVALID_MESSAGE: "INVALID_MESSAGE",
    MESSAGE_TOO_LARGE: "MESSAGE_TOO_LARGE",
    NO_PEER_CONNECTED: "NO_PEER_CONNECTED",
    RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
    AUTH_TIMEOUT: "AUTH_TIMEOUT",
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
