import { getLogger } from "@/config/logger";
import type { HealthResponse } from "@/types";
import { getRateLimiter } from "@/utils/rateLimiter";
import { extractBearerToken } from "@/utils/validation";
import { channelManager } from "@/websocket/channel";

export function handleHealthCheck(): Response {
    const logger = getLogger();

    const response: HealthResponse = {
        status: "ok",
        timestamp: new Date().toISOString(),
    };

    logger.debug("Health check requested");

    return Response.json(response);
}

/**
 * Stats endpoint with authentication
 * Requires Authorization: Bearer <secret> header
 */
export function handleStats(authHeader: string | null, serverSecret: string): Response {
    const logger = getLogger();

    // Validate authorization
    const token = extractBearerToken(authHeader);
    if (!token || token !== serverSecret) {
        logger.warn("Stats request rejected: invalid or missing authorization");
        return new Response("Unauthorized", { status: 401 });
    }

    const stats = channelManager.getStats();
    const rateLimitStats = getRateLimiter().getStats();

    // Use process.memoryUsage() for memory metrics (Bun compatible)
    const memUsage = process.memoryUsage();

    const response = {
        ...stats,
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
    return new Response("Not Found", { status: 404 });
}
