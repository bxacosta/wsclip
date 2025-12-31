export const MessageType = {
    CONTROL: "control",
    DATA: "data",
    ACK: "ack",
    READY: "ready",
    PEER: "peer",
    ERROR: "error",
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export const ErrorCode = {
    INVALID_SECRET: "INVALID_SECRET",
    INVALID_CHANNEL_ID: "INVALID_CHANNEL_ID",
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

export type ErrorDefinition = Readonly<{
    code: number;
    httpStatus: number;
    recoverable: boolean;
    message: string;
}>;

export const ErrorCatalog: Record<ErrorCode, ErrorDefinition> = {
    // 4000-4099: Message errors (recoverable)
    INVALID_MESSAGE: {
        code: 4001,
        httpStatus: 400,
        recoverable: true,
        message: "Invalid message format or structure",
    },
    MESSAGE_TOO_LARGE: {
        code: 4002,
        httpStatus: 400,
        recoverable: true,
        message: "Message exceeds configured size limit",
    },
    NO_PEER_CONNECTED: {
        code: 4003,
        httpStatus: 400,
        recoverable: true,
        message: "No peer available to receive the message",
    },

    // 4100-4199: Validation errors (fatal)
    INVALID_SECRET: {
        code: 4100,
        httpStatus: 401,
        recoverable: false,
        message: "Invalid authentication secret",
    },
    INVALID_CHANNEL_ID: {
        code: 4101,
        httpStatus: 400,
        recoverable: false,
        message: "Invalid channel identifier",
    },
    INVALID_PEER_ID: {
        code: 4102,
        httpStatus: 400,
        recoverable: false,
        message: "Invalid peer identifier",
    },

    // 4200-4299: State/limit errors (fatal)
    CHANNEL_FULL: {
        code: 4200,
        httpStatus: 503,
        recoverable: false,
        message: "Channel has reached maximum peer limit",
    },
    DUPLICATE_PEER_ID: {
        code: 4201,
        httpStatus: 409,
        recoverable: false,
        message: "Peer identifier already in use in channel",
    },
    RATE_LIMIT_EXCEEDED: {
        code: 4202,
        httpStatus: 429,
        recoverable: false,
        message: "Connection rate limit exceeded",
    },
    MAX_CHANNELS_REACHED: {
        code: 4203,
        httpStatus: 503,
        recoverable: false,
        message: "Server channel limit reached",
    },

    // 4900-4999: Internal errors (fatal)
    INTERNAL_ERROR: {
        code: 4900,
        httpStatus: 500,
        recoverable: false,
        message: "Unexpected server error",
    },
} as const;
