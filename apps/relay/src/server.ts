import type { Env } from "@/server/config/env";
import { getLogger } from "@/server/config/logger";
import { ERROR_CATALOG } from "@/protocol/errors";
import type { ErrorCode } from "@/protocol/types";
import { handleHealthCheck, handleNotFound, handleStats } from "@/server/http/routes";
import { createWebSocketHandlers } from "@/server/websocket/handler";

export function startServer(env: Env) {
    const logger = getLogger();
    const wsHandlers = createWebSocketHandlers(env);

    const server = Bun.serve({
        port: env.PORT,

        fetch(req, server) {
            const url = new URL(req.url);

            if (url.pathname === "/ws") {
                const result = wsHandlers.upgrade(req, server);

                if (result.success) {
                    return;
                }

                const errorDef = result.errorCode ? ERROR_CATALOG[result.errorCode as ErrorCode] : null;
                const httpStatus = errorDef?.httpStatus ?? 400;
                const wsCloseCode = errorDef?.closeCode ?? 4000;

                return Response.json(
                    {
                        error: result.errorCode || "UPGRADE_FAILED",
                        message: result.errorMessage || "WebSocket upgrade failed",
                        wsCloseCode,
                    },
                    { status: httpStatus },
                );
            }

            if (url.pathname === "/health" && req.method === "GET") {
                return handleHealthCheck();
            }

            if (url.pathname === "/stats" && req.method === "GET") {
                const authHeader = req.headers.get("Authorization");
                return handleStats(authHeader, env.SERVER_SECRET);
            }

            return handleNotFound();
        },

        websocket: wsHandlers.websocket,

        error(error) {
            logger.error({ err: error }, "Server error");
            return new Response("Internal Server Error", { status: 500 });
        },
    });

    logger.info(
        {
            port: server.port,
            bunVersion: Bun.version,
            compression: env.COMPRESSION_ENABLED,
            maxPayloadSize: env.MAX_MESSAGE_SIZE,
            idleTimeout: env.IDLE_TIMEOUT,
        },
        "Server started",
    );

    return server;
}
