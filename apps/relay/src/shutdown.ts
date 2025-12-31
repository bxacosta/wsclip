import { getContext } from "@/server/core";
import { flushLogger } from "@/server/core/logger.ts";
import type { AppServer } from "@/server.ts";

let isShuttingDown = false;

async function performShutdown(signal: string, server: AppServer): Promise<void> {
    const { logger, channelManager, rateLimiter } = getContext();
    logger.info({ signal }, "Shutdown initiated");

    try {
        channelManager.close();
        rateLimiter.stop();
        await server.stop();
        await flushLogger(logger);
        process.exit(0);
    } catch (err) {
        logger.error({ err }, "Shutdown error");
        process.exit(1);
    }
}

export function gracefulShutdown(signal: string, server: AppServer): void {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`[shutdown] Received ${signal}, closing connections...`);

    performShutdown(signal, server).catch(err => {
        console.error("[shutdown] Fatal error:", err);
        process.exit(1);
    });
}

export function setupShutdownHandlers(server: AppServer): void {
    const handler = (signal: string) => () => gracefulShutdown(signal, server);

    process.on("SIGINT", handler("SIGINT"));
    process.on("SIGTERM", handler("SIGTERM"));
    process.on("SIGBREAK", handler("SIGBREAK"));
}
