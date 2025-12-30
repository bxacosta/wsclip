import type { Server } from "bun";
import { getChannelManager } from "@/server/channel";
import { flushLogger, getLogger } from "@/server/config";
import { getRateLimiter } from "@/server/security";

let isShuttingDown = false;

async function performShutdown(signal: string, server: Server<object>): Promise<void> {
    const logger = getLogger();
    logger.info({ signal }, "Shutdown initiated");

    try {
        getChannelManager().closeAllConnections(1001, "Server shutting down");
        getRateLimiter().stop();
        await server.stop();
        await flushLogger();
        process.exit(0);
    } catch (err) {
        logger.error({ err }, "Shutdown error");
        process.exit(1);
    }
}

export function gracefulShutdown(signal: string, server: Server<object>): void {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`[shutdown] Received ${signal}, closing connections...`);

    performShutdown(signal, server).catch(err => {
        console.error("[shutdown] Fatal error:", err);
        process.exit(1);
    });
}

export function setupShutdownHandlers(server: Server<object>): void {
    const handler = (signal: string) => () => gracefulShutdown(signal, server);

    process.on("SIGINT", handler("SIGINT"));
    process.on("SIGTERM", handler("SIGTERM"));
    process.on("SIGBREAK", handler("SIGBREAK"));
}
