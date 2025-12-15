import { getLogger } from "@/config/logger";
import type { HealthResponse } from "@/types";
import { rateLimiter } from "@/utils/rateLimiter";
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

// NEW: Stats endpoint with detailed metrics
export function handleStats(): Response {
    const logger = getLogger();
    const stats = channelManager.getDetailedStats();
    const rateLimitStats = rateLimiter.getStats();

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
