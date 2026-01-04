import type { AppServer } from "@/server";
import { getContext } from "@/server/core";
import { flushLogger } from "@/server/core/logger";

let isShuttingDown = false;

const SHUTDOWN_CLOSE_CODE = 1001;
const SHUTDOWN_REASON = "Server shutting down";

async function performShutdown(signal: string, server: AppServer): Promise<void> {
    const { logger, sessionManager, rateLimiter } = getContext();
    logger.info({ signal }, "Shutdown initiated");

    try {
        const closeResult = sessionManager.close();

        logger.info(
            { closedCount: closeResult.closedCount, code: SHUTDOWN_CLOSE_CODE, reason: SHUTDOWN_REASON },
            "All connections closed",
        );

        for (const error of closeResult.errors) {
            logger.error(
                { err: error.error, connectionId: error.connectionId, sessionId: error.sessionId },
                "Connection close failed",
            );
        }

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
