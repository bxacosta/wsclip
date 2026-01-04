import type { ConnectionParams } from "@/server/core";

export function extractBearerToken(request: Request): string {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader) return "";

    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    return match?.[1] ?? "";
}

export function extractConnectionParams(request: Request): ConnectionParams {
    const url = new URL(request.url);

    return {
        // Note: URL param is "channelId" (external API), mapped to "sessionId" internally
        sessionId: extractSearchParam(url, "channelId"),
        peerId: extractSearchParam(url, "peerId"),
        secret: extractBearerToken(request) || extractSearchParam(url, "secret"),
    };
}

function extractSearchParam(url: URL, param: string): string {
    return url.searchParams.get(param)?.trim() ?? "";
}

export function validateSessionId(sessionId: string): boolean {
    return /^[a-zA-Z0-9]{8}$/.test(sessionId);
}

export function validatePeerId(peerId: string): boolean {
    return peerId.trim().length > 0;
}
