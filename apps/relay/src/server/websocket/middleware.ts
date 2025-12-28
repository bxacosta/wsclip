import type { Logger } from "pino";
import type { ValidationResult } from "@/protocol/validation";
import type { TypedWebSocket } from "@/server/channel";
import { handleProtocolError } from "@/server/errors";

export type MessageHandler<T> = (ws: TypedWebSocket, data: T, logger: Logger) => void | Promise<void>;

/** Wraps a handler with validation. Sends error via handleProtocolError if validation fails. */
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
