import type { Logger } from "pino";
import type { ValidationResult } from "@/protocol/validation";
import type { AppWebSocket } from "@/server/core";
import { handleWebSocketError } from "@/server/errors";

export type MessageHandler<T> = (ws: AppWebSocket, data: T, logger: Logger) => void | Promise<void>;

export function withValidation<T>(
    validator: (data: unknown) => ValidationResult<T>,
    handler: MessageHandler<T>,
): (ws: AppWebSocket, message: unknown, logger: Logger) => void {
    return (ws: AppWebSocket, message: unknown, logger: Logger) => {
        const validation = validator(message);

        if (!validation.valid) {
            const errorCode = validation.error?.code || "INVALID_MESSAGE";
            const errorMessage = validation.error?.message || "Invalid message format";
            handleWebSocketError(ws, errorCode, errorMessage);
            return;
        }

        handler(ws, validation.data, logger);
    };
}
