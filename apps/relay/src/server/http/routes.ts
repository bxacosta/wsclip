import { ErrorCode } from "@/protocol";
import type { AppServer } from "@/server";
import { getContext, type WebSocketData } from "@/server/core";
import { buildHttpError, buildHttpErrorRaw } from "@/server/errors";
import { extractBearerToken, extractConnectionParams, validatePeerId, validateSessionId } from "@/server/http/utils";

interface HealthResponse {
    status: "ok";
    timestamp: string;
}

export function handleUpgrade(request: Request, server: AppServer): Response | undefined {
    const { logger, config, rateLimiter } = getContext();

    const ip = server.requestIP(request)?.address ?? "unknown";
    if (!rateLimiter.checkLimit(ip)) {
        logger.warn({ ip }, "Connection rejected due to rate limit");
        return buildHttpError(ErrorCode.RATE_LIMIT_EXCEEDED);
    }

    const { sessionId, peerId, secret } = extractConnectionParams(request);

    if (!validateSessionId(sessionId)) {
        logger.warn({ sessionId }, "Invalid session ID");
        return buildHttpError(ErrorCode.INVALID_CHANNEL_ID);
    }

    if (!validatePeerId(peerId)) {
        logger.warn({ peerId }, "Invalid peer ID");
        return buildHttpError(ErrorCode.INVALID_PEER_ID);
    }

    if (secret !== config.serverSecret) {
        logger.warn({ secret }, "Invalid secret");
        return buildHttpError(ErrorCode.INVALID_SECRET);
    }

    const data: WebSocketData = {
        sessionId,
        client: {
            id: peerId,
            address: ip,
            connectedAt: new Date().toISOString(),
        },
    };

    const upgraded = server.upgrade(request, { data });

    if (!upgraded) {
        return buildHttpErrorRaw(500, "UPGRADE_FAILED", "WebSocket upgrade failed");
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
    const { logger, config, sessionManager, rateLimiter, statsCollector } = getContext();

    const token = extractBearerToken(request);
    if (token !== config.serverSecret) {
        return buildHttpError(ErrorCode.INVALID_SECRET);
    }

    const sessionInfo = sessionManager.getSessionInfo();
    const aggregatedStats = statsCollector.getAggregatedStats(sessionInfo);
    const rateLimitInfo = rateLimiter.getStats();

    const memUsage = process.memoryUsage();

    const response = {
        activeSessions: aggregatedStats.sessions.activeSessions,
        maxSessions: config.maxSessions,
        activeConnections: aggregatedStats.sessions.activeConnections,
        messagesRelayed: aggregatedStats.relay.messagesRelayed,
        bytesTransferred: aggregatedStats.relay.bytesTransferred,
        oldestConnectionAge: aggregatedStats.oldestConnectionAge,
        newestConnectionAge: aggregatedStats.newestConnectionAge,
        memoryUsage: {
            rss: Math.floor(memUsage.rss / 1024 / 1024),
            heapTotal: Math.floor(memUsage.heapTotal / 1024 / 1024),
            heapUsed: Math.floor(memUsage.heapUsed / 1024 / 1024),
            external: Math.floor(memUsage.external / 1024 / 1024),
        },
        rateLimiting: rateLimitInfo,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    };

    logger.debug("Stats requested");

    return Response.json(response);
}

export function handleNotFound(): Response {
    return buildHttpErrorRaw(404, "NOT_FOUND", "Resource not found");
}
