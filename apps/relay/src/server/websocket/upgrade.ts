import type { Server } from "bun";
import { getLogger } from "@/config/logger";
import { getDefaultMessage } from "@/protocol/errors";
import type { ErrorCode } from "@/protocol/types";
import { type ConnectionPhase, getChannelManager, type WebSocketData } from "@/server/channel";
import { getRateLimiter } from "@/server/security";
import { validateChannelId, validateDeviceName } from "./utils";

/**
 * Result of a WebSocket upgrade attempt.
 */
export interface UpgradeResult {
    success: boolean;
    errorCode?: ErrorCode;
    errorMessage?: string;
}

/**
 * Handles WebSocket upgrade requests.
 * Validates rate limits, channel ID, and device name before upgrading.
 *
 * @param req - The HTTP request to upgrade
 * @param server - The Bun server instance
 * @returns UpgradeResult indicating success or failure with error details
 */
export function handleUpgrade(req: Request, server: Server<object>): UpgradeResult {
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
            errorMessage: getDefaultMessage("RATE_LIMIT_EXCEEDED"),
        };
    }

    const channel = url.searchParams.get("channel") || "";
    const deviceName = url.searchParams.get("deviceName") || "";

    if (!validateChannelId(channel)) {
        logger.warn({ channel }, "Invalid channel ID");
        channelManager.incrementError("INVALID_CHANNEL");
        return {
            success: false,
            errorCode: "INVALID_CHANNEL",
            errorMessage: getDefaultMessage("INVALID_CHANNEL"),
        };
    }

    if (!validateDeviceName(deviceName)) {
        logger.warn({ deviceName }, "Invalid device name");
        channelManager.incrementError("INVALID_DEVICE_NAME");
        return {
            success: false,
            errorCode: "INVALID_DEVICE_NAME",
            errorMessage: getDefaultMessage("INVALID_DEVICE_NAME"),
        };
    }

    const initialPhase: ConnectionPhase = "authenticating";

    const data: WebSocketData = {
        deviceName: deviceName.trim(),
        channelId: channel,
        connectedAt: new Date(),
        phase: initialPhase,
        authTimeoutId: null,
    };

    const upgraded = server.upgrade(req, { data });
    return { success: upgraded };
}
