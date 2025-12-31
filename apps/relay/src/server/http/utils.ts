import { ErrorCatalog, type ErrorCode } from "@/protocol";
import type { ConnectionParams } from "@/server/core";
import type { ErrorResponse } from "@/server/http/types.ts";

export const extractBearerToken = (request: Request): string => {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader) return "";

    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    return match?.[1] ?? "";
};

export const extractConnectionParams = (request: Request): ConnectionParams => {
    const url = new URL(request.url);

    return {
        channelId: extractSearchParam(url, "channelId"),
        peerId: extractSearchParam(url, "peerId"),
        secret: extractBearerToken(request) || extractSearchParam(url, "secret"),
    };
};

function extractSearchParam(url: URL, param: string): string {
    return url.searchParams.get(param)?.trim() ?? "";
}

export function validateChannelId(channel: string): boolean {
    return /^[a-zA-Z0-9]{8}$/.test(channel);
}

export function validatePeerId(peerId: string): boolean {
    return peerId.trim().length > 0;
}

export const buildResponseError = (errorCode: ErrorCode, customMessage?: string): Response => {
    const error = ErrorCatalog[errorCode];

    const response: ErrorResponse = {
        code: errorCode,
        status: error.httpStatus,
        message: customMessage || error.message,
    };

    return Response.json(response, { status: error.httpStatus });
};
