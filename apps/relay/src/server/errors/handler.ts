import { createErrorMessage, serializeMessage } from "@/protocol/messages";
import { ErrorCatalog, type ErrorCode } from "@/protocol/types";
import type { AppWebSocket } from "@/server/core";

export function handleWebSocketError(ws: AppWebSocket, errorCode: ErrorCode, customMessage?: string): void {
    const error = ErrorCatalog[errorCode];
    const message = customMessage || error.message;

    const errorMsg = createErrorMessage(errorCode, message);
    ws.send(serializeMessage(errorMsg));

    if (!error.recoverable) {
        ws.close(error.code, message);
    }
}
