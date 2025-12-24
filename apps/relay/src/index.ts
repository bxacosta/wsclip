import { loadEnv } from "@/config/env";
import { flushLogger, getLogger, initLogger } from "@/config/logger";
import { PROTOCOL_CONFIG } from "@/protocol/constants";
import { createShutdownMessage, serializeMessage } from "@/protocol/messages";
import { startServer } from "@/server";
import { getChannelManager, initChannelManager } from "@/server/channel";
import { setChannelManagerGetter } from "@/server/errors";
import { getRateLimiter, initRateLimiter } from "@/server/security";

// Load and validate environment configuration
const env = loadEnv();
initLogger(env);

// Initialize rate limiter
initRateLimiter({
    maxConnections: env.RATE_LIMIT_MAX,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
});

// Initialize channel manager with configuration
initChannelManager({
    maxChannels: env.MAX_CHANNELS,
    devicesPerChannel: PROTOCOL_CONFIG.DEVICES_PER_CHANNEL,
});

// Wire up error handler to channel manager (avoids circular dependency)
setChannelManagerGetter(getChannelManager);

const logger = getLogger();
const server = startServer(env);

/**
 * Graceful shutdown handler.
 * Notifies all connected clients and waits for graceful disconnect.
 */
const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");

    const shutdownMsg = createShutdownMessage("Server is shutting down", 5);
    const recipientCount = getChannelManager().broadcastToAll(serializeMessage(shutdownMsg));

    logger.info({ recipientCount }, "Shutdown notification sent to all devices");

    logger.info("Waiting for graceful disconnect");
    await new Promise(resolve => setTimeout(resolve, 5000));

    getRateLimiter().stop();

    logger.info("Stopping server");
    await server.stop();

    logger.info("Shutdown complete");

    await flushLogger();

    process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
