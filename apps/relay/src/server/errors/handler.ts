import type { Logger } from "pino";
import { ERROR_CATALOG, shouldCloseConnection } from "@/protocol/errors";
import { createErrorMessage, serializeMessage } from "@/protocol/messages";
import type { ErrorCode } from "@/protocol/types";
import type { TypedWebSocket } from "@/server/channel/types";

// Forward declaration to avoid circular dependency
// The actual channelManager is imported lazily
let getChannelManagerFn: (() => { incrementError: (code: ErrorCode) => void }) | null = null;

/**
 * Sets the channel manager getter function.
 * This is called during initialization to avoid circular dependencies.
 */
export function setChannelManagerGetter(getter: () => { incrementError: (code: ErrorCode) => void }): void {
    getChannelManagerFn = getter;
}

/**
 * Handles a protocol error by sending an error message to the client
 * and optionally closing the connection based on error type and connection state.
 *
 * Error behavior is determined by:
 * - Error category (auth, state, internal errors always close)
 * - Connection phase (message errors close only if not authenticated)
 *
 * @param ws - The WebSocket connection
 * @param errorCode - The error code from ErrorCode enum
 * @param customMessage - Optional custom message (defaults to catalog message)
 * @param logger - Optional logger for error logging
 */
export function handleProtocolError(
    ws: TypedWebSocket,
    errorCode: ErrorCode,
    customMessage?: string,
    logger?: Logger,
): void {
    const definition = ERROR_CATALOG[errorCode];
    const message = customMessage || definition.defaultMessage;
    const isAuthenticated = ws.data.phase === "ready";
    const shouldClose = shouldCloseConnection(definition.closeCode, isAuthenticated);

    if (logger) {
        logger.warn(
            {
                errorCode,
                closeCode: definition.closeCode,
                category: definition.category,
                shouldClose,
                phase: ws.data.phase,
            },
            message,
        );
    }

    // Increment error metrics if channel manager is available
    if (getChannelManagerFn) {
        getChannelManagerFn().incrementError(errorCode);
    }

    // Send error message to client
    const errorMsg = createErrorMessage(errorCode, message);
    ws.send(serializeMessage(errorMsg));

    // Close connection if error requires it
    if (shouldClose) {
        ws.close(definition.closeCode, message);
    }
}
