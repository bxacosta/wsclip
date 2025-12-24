import type { Logger } from "pino";
import { createConnectedMessage, serializeMessage } from "@/protocol/messages";
import type { AuthMessage } from "@/protocol/types";
import { getChannelManager, type TypedWebSocket } from "@/server/channel";
import { handleProtocolError } from "@/server/errors";

/**
 * Handles AUTH messages for client authentication.
 *
 * Validates the secret, channel, and device name match the connection parameters.
 * On success, adds the device to the channel and sends a connected message.
 *
 * @param ws - The WebSocket connection
 * @param authData - The parsed AUTH message
 * @param serverSecret - The server's authentication secret
 * @param logger - Logger instance
 */
export function handleAuthMessage(ws: TypedWebSocket, authData: AuthMessage, serverSecret: string, logger: Logger) {
    const channelManager = getChannelManager();

    // Validate secret
    if (authData.payload.secret !== serverSecret) {
        handleProtocolError(ws, "INVALID_SECRET", undefined, logger);
        return;
    }

    // Validate channel matches connection parameter
    if (authData.payload.channel !== ws.data.channelId) {
        logger.warn({ authChannel: authData.payload.channel }, "Channel mismatch");
        handleProtocolError(ws, "INVALID_CHANNEL", "Channel mismatch", logger);
        return;
    }

    // Validate device name matches connection parameter
    if (authData.payload.deviceName.trim() !== ws.data.deviceName) {
        logger.warn({ authDevice: authData.payload.deviceName }, "Device name mismatch");
        handleProtocolError(ws, "INVALID_DEVICE_NAME", "Device name mismatch", logger);
        return;
    }

    // Clear auth timeout
    if (ws.data.authTimeoutId) {
        clearTimeout(ws.data.authTimeoutId);
        ws.data.authTimeoutId = null;
    }

    // Update connection state
    ws.data.phase = "ready";
    ws.data.clientInfo = authData.payload.clientInfo;

    // Add device to channel
    const addResult = channelManager.addDevice(ws.data.channelId, ws.data.deviceName, ws);

    if (!addResult.success && addResult.error) {
        logger.warn({ error: addResult.error }, "Failed to add device to channel");
        handleProtocolError(ws, addResult.error.code, addResult.error.message, logger);
        return;
    }

    // Send connected message
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
