import type { Logger } from "pino";
import { WS_CLOSE_CODES } from "@/protocol/constants";
import { createErrorMessage, serializeMessage } from "@/protocol/messages";
import type { ErrorCode } from "@/protocol/types";
import type { ValidationResult } from "@/protocol/validation";
import { channelManager, type TypedWebSocket } from "@/server/channel";

export function sendError(ws: TypedWebSocket, errorCode: ErrorCode, message: string, logger: Logger) {
    logger.warn({ errorCode }, message);
    channelManager.incrementError(errorCode);
    const errorMsg = createErrorMessage(errorCode, message);
    ws.send(serializeMessage(errorMsg));
}

export function sendErrorAndClose(ws: TypedWebSocket, errorCode: ErrorCode, message: string, logger: Logger) {
    logger.warn({ errorCode }, message);
    channelManager.incrementError(errorCode);
    const errorMsg = createErrorMessage(errorCode, message);
    ws.send(serializeMessage(errorMsg));
    ws.close(WS_CLOSE_CODES[errorCode], message);
}

export function handleValidationError(ws: TypedWebSocket, error: ValidationResult<unknown>["error"], logger: Logger) {
    const errorCode = error?.code || "INVALID_MESSAGE";
    const errorMessage = error?.message || "Invalid message format";
    sendError(ws, errorCode, errorMessage, logger);
}

export type MessageHandler<T> = (ws: TypedWebSocket, data: T, logger: Logger) => void | Promise<void>;

export function withValidation<T>(
    validator: (data: unknown) => ValidationResult<T>,
    handler: MessageHandler<T>,
): (ws: TypedWebSocket, message: unknown, logger: Logger) => void {
    return (ws: TypedWebSocket, message: unknown, logger: Logger) => {
        const validation = validator(message);

        if (!validation.valid || !validation.data) {
            handleValidationError(ws, validation.error, logger);
            return;
        }

        handler(ws, validation.data, logger);
    };
}
