import type { Env } from "@/config/env";
import { getLogger } from "@/config/logger";
import { WS_CLOSE_CODES } from "@/protocol/constants";
import { handleHealthCheck, handleNotFound, handleStats } from "@/server/http/routes";
import { createWebSocketHandlers } from "@/server/websocket/handler";

function getHttpStatusForError(errorCode: string | undefined): number {
    switch (errorCode) {
        case "RATE_LIMIT_EXCEEDED":
            return 429;
        case "INVALID_SECRET":
            return 401;
        case "INVALID_CHANNEL":
        case "INVALID_DEVICE_NAME":
        case "INVALID_MESSAGE":
            return 400;
        default:
            return 400;
    }
}

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

                const httpStatus = getHttpStatusForError(result.errorCode);
                const wsCloseCode = result.errorCode ? WS_CLOSE_CODES[result.errorCode] : 4000;

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
