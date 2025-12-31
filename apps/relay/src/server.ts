import type { Server } from "bun";
import type { WebSocketData } from "@/server/core";
import { getContext } from "@/server/core/context.ts";
import { handleHealth, handleNotFound, handleStats, handleUpgrade } from "@/server/http/routes";
import { createWebSocketHandler } from "@/server/websocket/handler";

export type AppServer = Server<WebSocketData>;

export function startServer(): AppServer {
    const { config, logger } = getContext();

    const server = Bun.serve<WebSocketData>({
        port: config.port,

        fetch(request, server) {
            const url = new URL(request.url);

            if (url.pathname === "/ws") return handleUpgrade(request, server);
            if (url.pathname === "/stats" && request.method === "GET") return handleStats(request);
            if (url.pathname === "/health" && request.method === "GET") return handleHealth();

            return handleNotFound();
        },

        websocket: createWebSocketHandler(),

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
