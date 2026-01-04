import type { AppServer } from "@/server";
import { getContext } from "@/server/core";
import { flushLogger, type Logger } from "@/server/core/logger";
import type { RateLimiter } from "@/server/security";
import type { SessionManager } from "@/server/session";

const SHUTDOWN_TIMEOUT_MS = 10_000;
const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM", "SIGBREAK"] as const;

let isShuttingDown = false;

interface ShutdownDeps {
    logger: Logger;
    sessionManager: SessionManager;
    rateLimiter: RateLimiter;
}

export function setupShutdown(server: AppServer): void {
    for (const signal of SHUTDOWN_SIGNALS) {
        process.on(signal, () => handleShutdown(signal, server));
    }
}

function handleShutdown(signal: string, server: AppServer): void {
    if (isShuttingDown) return;
    isShuttingDown = true;

    const { logger, sessionManager, rateLimiter } = getContext();
    logger.info({ signal }, "Shutdown initiated");

    const timeout = setTimeout(() => {
        logger.fatal("Shutdown timeout reached, forcing exit");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    shutdown(server, { logger, sessionManager, rateLimiter })
        .catch(err => {
            console.error("[shutdown] Fatal error:", err);
            process.exit(1);
        })
        .finally(() => clearTimeout(timeout));
}

async function shutdown(server: AppServer, deps: ShutdownDeps): Promise<void> {
    const { logger, sessionManager, rateLimiter } = deps;

    const closeResult = sessionManager.close();

    logger.info({ closedCount: closeResult.closedCount }, "Connections closed");

    for (const error of closeResult.errors) {
        logger.error({ err: error.error, connectionId: error.connectionId }, "Connection close error");
    }

    rateLimiter.stop();
    await server.stop();
    await flushLogger(logger);

    process.exit(0);
}
