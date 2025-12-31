import { ErrorCode } from "@/protocol";
import { getContext, type WebSocketData } from "@/server/core";
import type { ErrorResponse, HealthResponse } from "@/server/http/types.ts";
import {
    buildResponseError,
    extractBearerToken,
    extractConnectionParams,
    validateChannelId,
    validatePeerId,
} from "@/server/http/utils.ts";
import type { AppServer } from "@/server.ts";

export function handleUpgrade(request: Request, server: AppServer): Response | undefined {
    const { logger, config, channelManager, rateLimiter } = getContext();

    const ip = server.requestIP(request)?.address ?? "unknown";
    if (!rateLimiter.checkLimit(ip)) {
        logger.warn({ ip }, "Connection rejected due to rate limit");
        channelManager.incrementError(ErrorCode.RATE_LIMIT_EXCEEDED);
        return buildResponseError(ErrorCode.RATE_LIMIT_EXCEEDED);
    }

    const { channelId, peerId, secret } = extractConnectionParams(request);

    if (!validateChannelId(channelId)) {
        logger.warn({ channelId }, "Invalid channel ID");
        channelManager.incrementError(ErrorCode.INVALID_CHANNEL_ID);
        return buildResponseError(ErrorCode.INVALID_CHANNEL_ID);
    }

    if (!validatePeerId(peerId)) {
        logger.warn({ peerId }, "Invalid peer ID");
        channelManager.incrementError(ErrorCode.INVALID_PEER_ID);
        return buildResponseError(ErrorCode.INVALID_PEER_ID);
    }

    if (secret !== config.serverSecret) {
        logger.warn({ secret }, "Invalid secret");
        channelManager.incrementError(ErrorCode.INVALID_SECRET);
        return buildResponseError(ErrorCode.INVALID_SECRET);
    }

    const data: WebSocketData = {
        channelId: channelId,
        client: {
            id: peerId,
            address: ip,
            connectedAt: new Date().toISOString(),
        },
    };

    const upgraded = server.upgrade(request, { data });

    if (!upgraded) {
        return Response.json(
            {
                status: 500,
                code: "UPGRADE_FAILED",
                message: "WebSocket upgrade failed",
            },
            { status: 500 },
        );
    }
}

export function handleHealth(): Response {
    const { logger } = getContext();

    const response: HealthResponse = {
        status: "ok",
        timestamp: new Date().toISOString(),
    };

    logger.debug("Health check requested");

    return Response.json(response);
}

export function handleStats(request: Request): Response {
    const { logger, config, channelManager, rateLimiter } = getContext();

    const token = extractBearerToken(request);
    if (token !== config.serverSecret) {
        return buildResponseError(ErrorCode.INVALID_SECRET);
    }

    const rateLimitStats = rateLimiter.getStats();

    const memUsage = process.memoryUsage();

    const response = {
        ...channelManager.getStats(),
        memoryUsage: {
            rss: Math.floor(memUsage.rss / 1024 / 1024),
            heapTotal: Math.floor(memUsage.heapTotal / 1024 / 1024),
            heapUsed: Math.floor(memUsage.heapUsed / 1024 / 1024),
            external: Math.floor(memUsage.external / 1024 / 1024),
        },
        rateLimiting: rateLimitStats,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    };

    logger.debug("Stats requested");

    return Response.json(response);
}

export function handleNotFound(): Response {
    const response: ErrorResponse = {
        status: 404,
        code: "NOT_FOUND",
        message: "Resource not found",
    };

    return Response.json(response, { status: 404 });
}
