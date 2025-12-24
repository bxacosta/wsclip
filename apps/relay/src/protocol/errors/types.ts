import type { ErrorCode } from "@/protocol/types/enums";

/**
 * Behavior when an error occurs.
 * - "close": Close the WebSocket connection
 * - "continue": Send error message but keep connection open
 */
export type ErrorBehavior = "close" | "continue";

/**
 * Error category based on close code ranges.
 * - "message": 4000-4099 - Message validation errors (recoverable post-auth)
 * - "auth": 4100-4199 - Authentication errors (always fatal)
 * - "state": 5000-5099 - State/limit errors (always fatal)
 * - "internal": 5900-5999 - Internal server errors (always fatal)
 */
export type ErrorCategory = "message" | "auth" | "state" | "internal";

/**
 * Complete error definition for the protocol.
 * Each error code maps to a definition that includes its close code,
 * category, and default message.
 */
export interface ErrorDefinition {
    readonly code: ErrorCode;
    readonly closeCode: number;
    readonly category: ErrorCategory;
    readonly defaultMessage: string;
}

/**
 * Close code ranges by category.
 * Used for determining error behavior based on close code.
 */
export const CLOSE_CODE_RANGES = {
    MESSAGE_MIN: 4000,
    MESSAGE_MAX: 4099,
    AUTH_MIN: 4100,
    AUTH_MAX: 4199,
    STATE_MIN: 5000,
    STATE_MAX: 5099,
    INTERNAL_MIN: 5900,
    INTERNAL_MAX: 5999,
} as const;
