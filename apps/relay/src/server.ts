import type { Env } from "@/config/env";
import { getLogger } from "@/config/logger";
import { handleHealthCheck, handleNotFound, handleStats } from "@/http/routes";
import { createWebSocketHandlers } from "@/websocket/handler";

export function startServer(env: Env) {
    const logger = getLogger();
    const wsHandlers = createWebSocketHandlers(env);

    const server = Bun.serve({
        port: env.PORT,

        fetch(req, server) {
            const url = new URL(req.url);

            // WebSocket upgrade
            if (url.pathname === "/ws") {
                if (wsHandlers.upgrade(req, server)) {
                    return; // undefined = success (modern pattern)
                }
                return new Response("WebSocket upgrade failed", { status: 400 });
            }

            // Health check endpoint
            if (url.pathname === "/health" && req.method === "GET") {
                return handleHealthCheck();
            }

            // Stats endpoint
            if (url.pathname === "/stats" && req.method === "GET") {
                return handleStats();
            }

            // Not found
            return handleNotFound();
        },

        // WebSocket configuration
        websocket: wsHandlers.websocket,

        error(error) {
            // Use Pino's error serializer for better stack traces
            logger.error({ err: error }, "Server error");

            return new Response("Internal Server Error", { status: 500 });
        },
    });

    logger.info(
        {
            port: server.port,
            bunVersion: Bun.version,
            compression: "permessage-deflate",
            maxPayloadSize: env.MAX_MESSAGE_SIZE,
            idleTimeout: env.IDLE_TIMEOUT,
        },
        "Server started",
    );

    return server;
}
