import { createErrorMessage, ErrorCatalog, type ErrorCode, serializeMessage } from "@/protocol";
import type { AppWebSocket } from "@/server/core";

export function sendWebSocketError(ws: AppWebSocket, errorCode: ErrorCode, customMessage?: string): void {
    const error = ErrorCatalog[errorCode];
    const message = customMessage ?? error.message;

    const errorMsg = createErrorMessage(errorCode, message);
    ws.send(serializeMessage(errorMsg));

    if (!error.recoverable) {
        ws.close(error.code, message);
    }
}
