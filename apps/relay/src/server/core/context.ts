import { createConfig } from "@/server/core/config";
import { createLogger, type Logger } from "@/server/core/logger";
import type { Config } from "@/server/core/types";
import { createRateLimiter, type RateLimiter } from "@/server/security";
import { createSessionManager, type SessionManager } from "@/server/session/manager";
import { createStatsCollector, type StatsCollector } from "@/server/stats";

interface AppContext {
    config: Config;
    logger: Logger;
    sessionManager: SessionManager;
    rateLimiter: RateLimiter;
    statsCollector: StatsCollector;
}

let context: AppContext | null = null;

export function initContext(): AppContext {
    if (context) throw new Error("Context already initialized");

    const config = createConfig();
    const logger = createLogger(config);
    const statsCollector = createStatsCollector();

    const rateLimiter = createRateLimiter({
        config: {
            maxConnections: config.rateLimitMax,
            windowSec: config.rateLimitWindowSec,
        },
        logger,
    });

    const sessionManager = createSessionManager({
        config: {
            maxSessions: config.maxSessions,
            connectionsPerSession: config.peersPerSession,
        },
        statsCollector,
    });

    context = Object.freeze({ config, logger, rateLimiter, sessionManager, statsCollector });
    return context;
}

export function getContext(): AppContext {
    if (!context) throw new Error("Context not initialized");
    return context;
}

export function resetContext(): void {
    if (process.env.NODE_ENV !== "test") {
        throw new Error("Reset only available in test environment");
    }
    context = null;
}
