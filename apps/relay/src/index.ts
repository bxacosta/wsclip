import { loadEnv } from "@/config/env";
import { flushLogger, getLogger, initLogger } from "@/config/logger";
import { createShutdownMessage, serializeMessage } from "@/protocol/messages";
import { startServer } from "@/server";
import { channelManager } from "@/server/channel";
import { getRateLimiter, initRateLimiter } from "@/server/security";

const env = loadEnv();
initLogger(env);

initRateLimiter({
    maxConnections: env.RATE_LIMIT_MAX,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
});

const logger = getLogger();
const server = startServer(env);

const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");

    const shutdownMsg = createShutdownMessage("Server is shutting down", 5);
    const recipientCount = channelManager.broadcastToAll(serializeMessage(shutdownMsg));

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
