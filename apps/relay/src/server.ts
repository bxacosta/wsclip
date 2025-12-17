import type { Env } from "@/config/env";
import { getLogger } from "@/config/logger";
import { handleHealthCheck, handleNotFound, handleStats } from "@/http/routes";
import { WS_CLOSE_CODES } from "@/types";
import { createWebSocketHandlers } from "@/websocket/handler";

/**
 * Map error codes to HTTP status codes
 */
function getHttpStatusForError(errorCode: string | undefined): number {
    switch (errorCode) {
        case "RATE_LIMIT_EXCEEDED":
            return 429; // Too Many Requests
        case "INVALID_SECRET":
            return 401; // Unauthorized
        case "INVALID_CHANNEL":
        case "INVALID_DEVICE_NAME":
        case "INVALID_MESSAGE":
            return 400; // Bad Request
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

            // WebSocket upgrade
            if (url.pathname === "/ws") {
                const result = wsHandlers.upgrade(req, server);

                if (result.success) {
                    return; // undefined = success (modern pattern)
                }

                // Return detailed error response with appropriate status code and WS close code
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

            // Health check endpoint
            if (url.pathname === "/health" && req.method === "GET") {
                return handleHealthCheck();
            }

            // Stats endpoint (requires authentication)
            if (url.pathname === "/stats" && req.method === "GET") {
                const authHeader = req.headers.get("Authorization");
                return handleStats(authHeader, env.SERVER_SECRET);
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
