import { ERROR_CATALOG } from "@/protocol/errors";
import type { ErrorCode } from "@/protocol/types";
import { config, getLogger } from "@/server/config";
import { handleHealthCheck, handleNotFound, handleStats } from "@/server/http/routes";
import { createWebSocketHandlers } from "@/server/websocket/handler";

export function startServer() {
    const logger = getLogger();
    const wsHandlers = createWebSocketHandlers();

    const server = Bun.serve({
        port: config.port,

        fetch(req, server) {
            const url = new URL(req.url);

            if (url.pathname === "/ws") {
                const result = wsHandlers.upgrade(req, server);

                if (result.success) {
                    return;
                }

                const errorDef = result.errorCode ? ERROR_CATALOG[result.errorCode as ErrorCode] : null;
                const httpStatus = errorDef?.httpStatus ?? 400;
                const wsCode = errorDef?.code ?? 4000;

                return Response.json(
                    {
                        error: result.errorCode || "UPGRADE_FAILED",
                        message: result.errorMessage || "WebSocket upgrade failed",
                        wsCode,
                    },
                    { status: httpStatus },
                );
            }

            if (url.pathname === "/health" && req.method === "GET") {
                return handleHealthCheck();
            }

            if (url.pathname === "/stats" && req.method === "GET") {
                const authHeader = req.headers.get("Authorization");
                return handleStats(authHeader, config.serverSecret);
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
            compression: config.compression,
            maxMessageSize: config.maxMessageSize,
            idleTimeoutSec: config.idleTimeoutSec,
        },
        "Server started",
    );

    return server;
}
