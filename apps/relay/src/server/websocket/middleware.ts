import type { Logger } from "pino";
import type { ValidationResult } from "@/protocol/validation";
import type { TypedWebSocket } from "@/server/channel";
import { handleProtocolError } from "@/server/errors";

/**
 * Type for message handler functions.
 */
export type MessageHandler<T> = (ws: TypedWebSocket, data: T, logger: Logger) => void | Promise<void>;

/**
 * Higher-order function that wraps a message handler with validation.
 * If validation fails, sends an error response using handleProtocolError.
 *
 * @param validator - Validation function that returns ValidationResult
 * @param handler - Message handler to call if validation succeeds
 * @returns Wrapped handler function
 */
export function withValidation<T>(
    validator: (data: unknown) => ValidationResult<T>,
    handler: MessageHandler<T>,
): (ws: TypedWebSocket, message: unknown, logger: Logger) => void {
    return (ws: TypedWebSocket, message: unknown, logger: Logger) => {
        const validation = validator(message);

        if (!validation.valid || !validation.data) {
            const errorCode = validation.error?.code || "INVALID_MESSAGE";
            const errorMessage = validation.error?.message || "Invalid message format";
            handleProtocolError(ws, errorCode, errorMessage, logger);
            return;
        }

        handler(ws, validation.data, logger);
    };
}
