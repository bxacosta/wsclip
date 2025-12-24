import type { ErrorCode } from "@/protocol/types/enums";
import { CLOSE_CODE_RANGES, type ErrorDefinition } from "./types";

/**
 * Centralized error catalog for the CRSP protocol.
 *
 * Error code ranges:
 * - 4000-4099: Message errors (recoverable after authentication)
 * - 4100-4199: Authentication errors (always fatal)
 * - 5000-5099: State/limit errors (always fatal)
 * - 5900-5999: Internal server errors (always fatal)
 */
export const ERROR_CATALOG: Record<ErrorCode, ErrorDefinition> = {
    // 4000-4099: Message errors (recoverable post-auth, fatal pre-auth)
    INVALID_MESSAGE: {
        code: "INVALID_MESSAGE",
        closeCode: 4001,
        category: "message",
        defaultMessage: "Invalid message format or structure",
    },
    MESSAGE_TOO_LARGE: {
        code: "MESSAGE_TOO_LARGE",
        closeCode: 4002,
        category: "message",
        defaultMessage: "Message exceeds maximum size limit",
    },
    NO_PEER_CONNECTED: {
        code: "NO_PEER_CONNECTED",
        closeCode: 4003,
        category: "message",
        defaultMessage: "No peer connected to relay message",
    },

    // 4100-4199: Authentication errors (always fatal)
    INVALID_SECRET: {
        code: "INVALID_SECRET",
        closeCode: 4101,
        category: "auth",
        defaultMessage: "Invalid authentication secret",
    },
    INVALID_CHANNEL: {
        code: "INVALID_CHANNEL",
        closeCode: 4102,
        category: "auth",
        defaultMessage: "Channel ID must be exactly 8 alphanumeric characters",
    },
    INVALID_DEVICE_NAME: {
        code: "INVALID_DEVICE_NAME",
        closeCode: 4103,
        category: "auth",
        defaultMessage: "Device name cannot be empty",
    },
    AUTH_TIMEOUT: {
        code: "AUTH_TIMEOUT",
        closeCode: 4104,
        category: "auth",
        defaultMessage: "Authentication timeout, connection closed",
    },

    // 5000-5099: State/limit errors (always fatal)
    CHANNEL_FULL: {
        code: "CHANNEL_FULL",
        closeCode: 5001,
        category: "state",
        defaultMessage: "Channel is full (maximum 2 devices)",
    },
    DUPLICATE_DEVICE_NAME: {
        code: "DUPLICATE_DEVICE_NAME",
        closeCode: 5002,
        category: "state",
        defaultMessage: "Device name already exists in this channel",
    },
    RATE_LIMIT_EXCEEDED: {
        code: "RATE_LIMIT_EXCEEDED",
        closeCode: 5003,
        category: "state",
        defaultMessage: "Rate limit exceeded, too many requests",
    },
    MAX_CHANNELS_REACHED: {
        code: "MAX_CHANNELS_REACHED",
        closeCode: 5004,
        category: "state",
        defaultMessage: "Server has reached maximum number of active channels",
    },

    // 5900-5999: Internal server errors (always fatal)
    INTERNAL_ERROR: {
        code: "INTERNAL_ERROR",
        closeCode: 5900,
        category: "internal",
        defaultMessage: "Internal server error",
    },
} as const;

/**
 * Determines whether a connection should be closed based on error code and authentication state.
 *
 * Rules:
 * - Auth errors (41xx): Always close
 * - State errors (50xx): Always close
 * - Internal errors (59xx): Always close
 * - Message errors (40xx): Close only if not authenticated
 *
 * @param closeCode - The WebSocket close code from ERROR_CATALOG
 * @param isAuthenticated - Whether the connection has completed authentication
 * @returns true if connection should be closed, false otherwise
 */
export function shouldCloseConnection(closeCode: number, isAuthenticated: boolean): boolean {
    // Auth errors (4100-4199): always close
    if (closeCode >= CLOSE_CODE_RANGES.AUTH_MIN && closeCode <= CLOSE_CODE_RANGES.AUTH_MAX) {
        return true;
    }

    // State errors (5000-5099): always close
    if (closeCode >= CLOSE_CODE_RANGES.STATE_MIN && closeCode <= CLOSE_CODE_RANGES.STATE_MAX) {
        return true;
    }

    // Internal errors (5900-5999): always close
    if (closeCode >= CLOSE_CODE_RANGES.INTERNAL_MIN && closeCode <= CLOSE_CODE_RANGES.INTERNAL_MAX) {
        return true;
    }

    // Message errors (4000-4099): close only if not authenticated
    if (closeCode >= CLOSE_CODE_RANGES.MESSAGE_MIN && closeCode <= CLOSE_CODE_RANGES.MESSAGE_MAX) {
        return !isAuthenticated;
    }

    // Unknown code range: default to close for safety
    return true;
}

/**
 * Gets the error definition for a given error code.
 *
 * @param errorCode - The error code to look up
 * @returns The error definition
 */
export function getErrorDefinition(errorCode: ErrorCode): ErrorDefinition {
    return ERROR_CATALOG[errorCode];
}

/**
 * Gets the close code for a given error code.
 *
 * @param errorCode - The error code to look up
 * @returns The WebSocket close code
 */
export function getCloseCode(errorCode: ErrorCode): number {
    return ERROR_CATALOG[errorCode].closeCode;
}

/**
 * Gets the default message for a given error code.
 *
 * @param errorCode - The error code to look up
 * @returns The default error message
 */
export function getDefaultMessage(errorCode: ErrorCode): string {
    return ERROR_CATALOG[errorCode].defaultMessage;
}
