import type { ErrorCode } from "@/protocol/types/enums";
import type { ErrorDefinition } from "./types";

/**
 * Error catalog with all error definitions.
 *
 * Close code ranges:
 * - 4000-4099: Message errors (recoverable)
 * - 4100-4199: Authentication errors (fatal, HTTP upgrade only)
 * - 5000-5099: State/limit errors (fatal)
 * - 5900-5999: Internal server errors (fatal)
 */
export const ERROR_CATALOG: Record<ErrorCode, ErrorDefinition> = {
    // Message errors (recoverable)
    INVALID_MESSAGE: {
        closeCode: 4001,
        httpStatus: 400,
        recoverable: true,
        defaultMessage: "Invalid message format or structure",
    },
    MESSAGE_TOO_LARGE: {
        closeCode: 4002,
        httpStatus: 400,
        recoverable: true,
        defaultMessage: "Message exceeds maximum size limit",
    },
    NO_PEER_CONNECTED: {
        closeCode: 4003,
        httpStatus: 400,
        recoverable: true,
        defaultMessage: "No peer connected to relay message",
    },

    // Authentication errors (fatal, occur during HTTP upgrade)
    INVALID_SECRET: {
        closeCode: 4101,
        httpStatus: 401,
        recoverable: false,
        defaultMessage: "Invalid authentication secret",
    },
    INVALID_CHANNEL: {
        closeCode: 4102,
        httpStatus: 400,
        recoverable: false,
        defaultMessage: "Channel ID must be exactly 8 alphanumeric characters",
    },
    INVALID_PEER_ID: {
        closeCode: 4103,
        httpStatus: 400,
        recoverable: false,
        defaultMessage: "Peer identifier cannot be empty",
    },

    // State/limit errors (fatal)
    CHANNEL_FULL: {
        closeCode: 5001,
        httpStatus: 503,
        recoverable: false,
        defaultMessage: "Channel is full (maximum 2 peers)",
    },
    DUPLICATE_PEER_ID: {
        closeCode: 5002,
        httpStatus: 409,
        recoverable: false,
        defaultMessage: "Peer identifier already exists in this channel",
    },
    RATE_LIMIT_EXCEEDED: {
        closeCode: 5003,
        httpStatus: 429,
        recoverable: false,
        defaultMessage: "Rate limit exceeded, too many requests",
    },
    MAX_CHANNELS_REACHED: {
        closeCode: 5004,
        httpStatus: 503,
        recoverable: false,
        defaultMessage: "Server has reached maximum number of active channels",
    },

    // Internal errors (fatal)
    INTERNAL_ERROR: {
        closeCode: 5900,
        httpStatus: 500,
        recoverable: false,
        defaultMessage: "Internal server error",
    },
} as const;
