import { loadEnv } from "@/config/env";
import { flushLogger, getLogger, initLogger } from "@/config/logger";
import { startServer } from "@/server";
import { rateLimiter } from "@/utils/rateLimiter";
import { channelManager } from "@/websocket/channel";

// Initialize environment and logger first
const env = loadEnv();
initLogger(env);

const logger = getLogger();
const server = startServer(env);

// Enhanced graceful shutdown
const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");

    // Broadcast shutdown message to all connected devices
    const shutdownMsg = {
        type: "server_shutdown",
        timestamp: new Date().toISOString(),
        message: "Server is shutting down",
    };

    const recipientCount = channelManager.broadcastToAll(JSON.stringify(shutdownMsg));

    logger.info({ recipientCount }, "Shutdown notification sent to all devices");

    // Wait 5 seconds for devices to disconnect gracefully
    logger.info("Waiting for graceful disconnect");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Stop rate limiter cleanup
    rateLimiter.stop();

    // Stop server
    logger.info("Stopping server");
    await server.stop();

    logger.info("Shutdown complete");

    // Flush logger before exit
    await flushLogger();

    process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
