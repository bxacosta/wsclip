import { type ChannelManager, createChannelManager } from "@/server/channel/manager.ts";
import { createConfig } from "@/server/core/config.ts";
import { createLogger, type Logger } from "@/server/core/logger.ts";
import type { Config } from "@/server/core/types.ts";
import { createRateLimiter, type RateLimiter } from "@/server/security";

interface AppContext {
    config: Config;
    logger: Logger;
    channelManager: ChannelManager;
    rateLimiter: RateLimiter;
}

let context: AppContext | null = null;

export function initContext(): AppContext {
    if (context) throw new Error("Context already initialized");

    const config = createConfig();
    const logger = createLogger(config);

    const rateLimiter = createRateLimiter({
        config: {
            maxConnections: config.rateLimitMax,
            windowSec: config.rateLimitWindowSec,
        },
        logger,
    });

    const channelManager = createChannelManager({
        config: {
            maxChannels: config.maxChannels,
            connectionsPerChannel: config.peersPerChannel,
        },
        logger,
    });

    context = Object.freeze({ config, logger, rateLimiter, channelManager });
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
