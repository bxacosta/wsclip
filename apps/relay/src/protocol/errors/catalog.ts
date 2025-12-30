import type { ErrorCode } from "@/protocol/types/enums";
import type { ErrorDefinition } from "./types";

/**
 * Error catalog with all protocol error definitions.
 *
 * Code ranges (all within valid WebSocket range 4000-4999):
 * - 4000-4099: Message errors (recoverable, post-connection)
 * - 4100-4199: Validation errors (fatal)
 * - 4200-4299: State/limit errors (fatal)
 * - 4900-4999: Internal errors (fatal)
 */
export const ERROR_CATALOG: Record<ErrorCode, ErrorDefinition> = {
    // Message errors (recoverable, post-connection only)
    INVALID_MESSAGE: {
        code: 4001,
        httpStatus: 400,
        recoverable: true,
    },
    MESSAGE_TOO_LARGE: {
        code: 4002,
        httpStatus: 400,
        recoverable: true,
    },
    NO_PEER_CONNECTED: {
        code: 4003,
        httpStatus: 400,
        recoverable: true,
    },

    // Validation errors (fatal)
    INVALID_SECRET: {
        code: 4100,
        httpStatus: 401,
        recoverable: false,
    },
    INVALID_CHANNEL: {
        code: 4101,
        httpStatus: 400,
        recoverable: false,
    },
    INVALID_PEER_ID: {
        code: 4102,
        httpStatus: 400,
        recoverable: false,
    },

    // State/limit errors (fatal)
    CHANNEL_FULL: {
        code: 4200,
        httpStatus: 503,
        recoverable: false,
    },
    DUPLICATE_PEER_ID: {
        code: 4201,
        httpStatus: 409,
        recoverable: false,
    },
    RATE_LIMIT_EXCEEDED: {
        code: 4202,
        httpStatus: 429,
        recoverable: false,
    },
    MAX_CHANNELS_REACHED: {
        code: 4203,
        httpStatus: 503,
        recoverable: false,
    },

    // Internal errors (fatal)
    INTERNAL_ERROR: {
        code: 4900,
        httpStatus: 500,
        recoverable: false,
    },
} as const;

/** Human-readable error messages for each error code */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
    INVALID_MESSAGE: "Invalid message format or structure",
    MESSAGE_TOO_LARGE: "Message exceeds maximum size limit",
    NO_PEER_CONNECTED: "No peer connected to relay message",
    INVALID_SECRET: "Invalid authentication secret",
    INVALID_CHANNEL: "Channel ID must be exactly 8 alphanumeric characters",
    INVALID_PEER_ID: "Peer ID is required",
    CHANNEL_FULL: "Channel is full (maximum 2 peers)",
    DUPLICATE_PEER_ID: "Peer ID already exists in this channel",
    RATE_LIMIT_EXCEEDED: "Rate limit exceeded",
    MAX_CHANNELS_REACHED: "Maximum number of channels reached",
    INTERNAL_ERROR: "Internal server error",
} as const;
