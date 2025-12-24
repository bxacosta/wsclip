import type { Server } from "bun";
import { getLogger } from "@/config/logger";
import { ERROR_MESSAGES } from "@/protocol/constants";
import type { ErrorCode } from "@/protocol/types";
import { channelManager } from "@/server/channel";
import { getRateLimiter } from "@/server/security";
import { validateChannelId, validateDeviceName } from "./utils";

export interface UpgradeResult {
    success: boolean;
    errorCode?: ErrorCode;
    errorMessage?: string;
}

export function handleUpgrade(req: Request, server: Server<object>): UpgradeResult {
    const logger = getLogger();
    const url = new URL(req.url);
    const ip = server.requestIP(req)?.address || "unknown";

    if (!getRateLimiter().checkLimit(ip)) {
        logger.warn({ ip }, "Connection rejected due to rate limit");
        channelManager.incrementError("RATE_LIMIT_EXCEEDED");
        return {
            success: false,
            errorCode: "RATE_LIMIT_EXCEEDED",
            errorMessage: ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
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
            errorMessage: ERROR_MESSAGES.INVALID_CHANNEL,
        };
    }

    if (!validateDeviceName(deviceName)) {
        logger.warn({ deviceName }, "Invalid device name");
        channelManager.incrementError("INVALID_DEVICE_NAME");
        return {
            success: false,
            errorCode: "INVALID_DEVICE_NAME",
            errorMessage: ERROR_MESSAGES.INVALID_DEVICE_NAME,
        };
    }

    const data = {
        deviceName: deviceName.trim(),
        channelId: channel,
        connectedAt: new Date(),
        authenticated: false,
        authTimeoutId: null,
    };

    const upgraded = server.upgrade(req, { data });
    return { success: upgraded };
}
