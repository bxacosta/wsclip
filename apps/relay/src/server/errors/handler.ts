import type { Logger } from "pino";
import { ERROR_CATALOG, ERROR_MESSAGES } from "@/protocol/errors";
import { createErrorMessage, serializeMessage } from "@/protocol/messages";
import type { ErrorCode } from "@/protocol/types";
import type { TypedWebSocket } from "@/server/channel/types";

let getChannelManagerFn: (() => { incrementError: (code: ErrorCode) => void }) | null = null;

export function setChannelManagerGetter(getter: () => { incrementError: (code: ErrorCode) => void }): void {
    getChannelManagerFn = getter;
}

export function handleProtocolError(
    ws: TypedWebSocket,
    errorCode: ErrorCode,
    customMessage?: string,
    logger?: Logger,
): void {
    const definition = ERROR_CATALOG[errorCode];
    const message = customMessage || ERROR_MESSAGES[errorCode];

    if (logger) {
        logger.warn({ errorCode, code: definition.code, recoverable: definition.recoverable }, message);
    }

    if (getChannelManagerFn) {
        getChannelManagerFn().incrementError(errorCode);
    }

    const errorMsg = createErrorMessage(errorCode, message);
    ws.send(serializeMessage(errorMsg));

    if (!definition.recoverable) {
        ws.close(definition.code, message);
    }
}
