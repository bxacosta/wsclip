import { getChannelManager } from "@/server/channel";
import { getLogger } from "@/server/config/logger";
import { getRateLimiter } from "@/server/security";

export interface HealthResponse {
    status: "ok";
    timestamp: string;
}

export function handleHealthCheck(): Response {
    const logger = getLogger();

    const response: HealthResponse = {
        status: "ok",
        timestamp: new Date().toISOString(),
    };

    logger.debug("Health check requested");

    return Response.json(response);
}

function extractBearerToken(authHeader: string | null): string | null {
    if (!authHeader) {
        return null;
    }

    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    return match?.[1] ?? null;
}

export function handleStats(authHeader: string | null, serverSecret: string): Response {
    const logger = getLogger();

    const token = extractBearerToken(authHeader);
    if (!token || token !== serverSecret) {
        logger.warn("Stats request rejected: invalid or missing authorization");
        return new Response("Unauthorized", { status: 401 });
    }

    const stats = getChannelManager().getStats();
    const rateLimitStats = getRateLimiter().getStats();

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
