export const MessageType = {
    CONTROL: "control",
    DATA: "data",
    ACK: "ack",
    READY: "ready",
    CONNECTION: "connection",
    ERROR: "error",
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export const ErrorCode = {
    INVALID_SECRET: "INVALID_SECRET",
    INVALID_SESSION_ID: "INVALID_SESSION_ID",
    INVALID_CONNECTION_ID: "INVALID_CONNECTION_ID",
    SESSION_FULL: "SESSION_FULL",
    DUPLICATE_CONNECTION_ID: "DUPLICATE_CONNECTION_ID",
    INVALID_MESSAGE: "INVALID_MESSAGE",
    MESSAGE_TOO_LARGE: "MESSAGE_TOO_LARGE",
    NO_OTHER_CONNECTION: "NO_OTHER_CONNECTION",
    RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
    MAX_SESSIONS_REACHED: "MAX_SESSIONS_REACHED",
    INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ContentType = {
    TEXT: "text",
    BINARY: "binary",
} as const;

export type ContentType = (typeof ContentType)[keyof typeof ContentType];

export const ConnectionEventType = {
    JOINED: "joined",
    LEFT: "left",
} as const;

export type ConnectionEventType = (typeof ConnectionEventType)[keyof typeof ConnectionEventType];

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
    NO_OTHER_CONNECTION: {
        code: 4003,
        httpStatus: 400,
        recoverable: true,
        message: "No other connection available to receive the message",
    },

    // 4100-4199: Validation errors (fatal)
    INVALID_SECRET: {
        code: 4100,
        httpStatus: 401,
        recoverable: false,
        message: "Invalid authentication secret",
    },
    INVALID_SESSION_ID: {
        code: 4101,
        httpStatus: 400,
        recoverable: false,
        message: "Invalid session identifier",
    },
    INVALID_CONNECTION_ID: {
        code: 4102,
        httpStatus: 400,
        recoverable: false,
        message: "Invalid connection identifier",
    },

    // 4200-4299: State/limit errors (fatal)
    SESSION_FULL: {
        code: 4200,
        httpStatus: 503,
        recoverable: false,
        message: "Session has reached maximum connection limit",
    },
    DUPLICATE_CONNECTION_ID: {
        code: 4201,
        httpStatus: 409,
        recoverable: false,
        message: "Connection identifier already in use in session",
    },
    RATE_LIMIT_EXCEEDED: {
        code: 4202,
        httpStatus: 429,
        recoverable: false,
        message: "Connection rate limit exceeded",
    },
    MAX_SESSIONS_REACHED: {
        code: 4203,
        httpStatus: 503,
        recoverable: false,
        message: "Server session limit reached",
    },

    // 4900-4999: Internal errors (fatal)
    INTERNAL_ERROR: {
        code: 4900,
        httpStatus: 500,
        recoverable: false,
        message: "Unexpected server error",
    },
} as const;
