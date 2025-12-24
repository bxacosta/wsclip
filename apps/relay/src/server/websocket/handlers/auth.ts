import type { Logger } from "pino";
import { ERROR_MESSAGES } from "@/protocol/constants";
import { createConnectedMessage, serializeMessage } from "@/protocol/messages";
import type { AuthMessage } from "@/protocol/types";
import { channelManager, type TypedWebSocket } from "@/server/channel";
import { sendErrorAndClose } from "../middleware";

export function handleAuthMessage(ws: TypedWebSocket, authData: AuthMessage, serverSecret: string, logger: Logger) {
    if (authData.payload.secret !== serverSecret) {
        sendErrorAndClose(ws, "INVALID_SECRET", ERROR_MESSAGES.INVALID_SECRET, logger);
        return;
    }

    if (authData.payload.channel !== ws.data.channelId) {
        logger.warn({ authChannel: authData.payload.channel }, "Channel mismatch");
        sendErrorAndClose(ws, "INVALID_CHANNEL", "Channel mismatch", logger);
        return;
    }

    if (authData.payload.deviceName.trim() !== ws.data.deviceName) {
        logger.warn({ authDevice: authData.payload.deviceName }, "Device name mismatch");
        sendErrorAndClose(ws, "INVALID_DEVICE_NAME", "Device name mismatch", logger);
        return;
    }

    if (ws.data.authTimeoutId) {
        clearTimeout(ws.data.authTimeoutId);
        ws.data.authTimeoutId = null;
    }

    ws.data.authenticated = true;
    ws.data.clientInfo = authData.payload.clientInfo;

    const addResult = channelManager.addDevice(ws.data.channelId, ws.data.deviceName, ws);

    if (!addResult.success && addResult.error) {
        logger.warn({ error: addResult.error }, "Failed to add device to channel");
        sendErrorAndClose(ws, addResult.error.code, addResult.error.message, logger);
        return;
    }

    const waitingForPeer = !channelManager.hasPeer(ws.data.channelId, ws.data.deviceName);
    const connectedMsg = createConnectedMessage(
        ws.data.deviceName,
        ws.data.channelId,
        waitingForPeer,
        ws.data.clientInfo,
    );

    ws.send(serializeMessage(connectedMsg));
    logger.info({ waitingForPeer }, "Authentication successful");
}
