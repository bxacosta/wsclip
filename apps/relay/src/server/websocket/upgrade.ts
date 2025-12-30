import type { Server } from "bun";
import { ERROR_CATALOG } from "@/protocol/errors";
import type { ErrorCode } from "@/protocol/types";
import { getChannelManager, type WebSocketData } from "@/server/channel";
import { getLogger } from "@/server/config/logger";
import { getRateLimiter } from "@/server/security";
import { validateChannelId, validatePeerId } from "./utils";

export interface UpgradeResult {
    success: boolean;
    errorCode?: ErrorCode;
    errorMessage?: string;
}

export function handleUpgrade(req: Request, server: Server<object>, serverSecret: string): UpgradeResult {
    const logger = getLogger();
    const url = new URL(req.url);
    const ip = server.requestIP(req)?.address || "unknown";
    const channelManager = getChannelManager();

    if (!getRateLimiter().checkLimit(ip)) {
        logger.warn({ ip }, "Connection rejected due to rate limit");
        channelManager.incrementError("RATE_LIMIT_EXCEEDED");
        return {
            success: false,
            errorCode: "RATE_LIMIT_EXCEEDED",
            errorMessage: ERROR_CATALOG.RATE_LIMIT_EXCEEDED.defaultMessage,
        };
    }

    const channelId = url.searchParams.get("channelId") || "";
    const peerId = url.searchParams.get("peerId") || "";
    const querySecret = url.searchParams.get("secret") || "";

    if (!validateChannelId(channelId)) {
        logger.warn({ channelId }, "Invalid channel ID");
        channelManager.incrementError("INVALID_CHANNEL");
        return {
            success: false,
            errorCode: "INVALID_CHANNEL",
            errorMessage: ERROR_CATALOG.INVALID_CHANNEL.defaultMessage,
        };
    }

    if (!validatePeerId(peerId)) {
        logger.warn({ peerId }, "Invalid peer ID");
        channelManager.incrementError("INVALID_PEER_ID");
        return {
            success: false,
            errorCode: "INVALID_PEER_ID",
            errorMessage: ERROR_CATALOG.INVALID_PEER_ID.defaultMessage,
        };
    }

    // Dual authentication: Bearer header or query param secret
    const authHeader = req.headers.get("Authorization");
    let secret = "";

    if (authHeader?.startsWith("Bearer ")) {
        secret = authHeader.substring(7);
    } else if (querySecret) {
        secret = querySecret;
    }

    if (!secret || secret !== serverSecret) {
        logger.warn({ peerId, channelId, hasBearer: !!authHeader, hasQuerySecret: !!querySecret }, "Invalid secret");
        channelManager.incrementError("INVALID_SECRET");
        return {
            success: false,
            errorCode: "INVALID_SECRET",
            errorMessage: ERROR_CATALOG.INVALID_SECRET.defaultMessage,
        };
    }

    const data: WebSocketData = {
        peerId: peerId.trim(),
        channelId: channelId,
        connectedAt: new Date(),
    };

    const upgraded = server.upgrade(req, { data });
    return { success: upgraded };
}
