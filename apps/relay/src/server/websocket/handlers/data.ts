import type { Logger } from "pino";
import type { DataMessage } from "@/protocol/types";
import { getChannelManager, type TypedWebSocket } from "@/server/channel";
import { handleProtocolError } from "@/server/errors";

/**
 * Handles DATA messages for content relay between peers.
 *
 * Validates that a peer is connected before relaying the message.
 *
 * @param ws - The WebSocket connection
 * @param dataMsg - The parsed DATA message
 * @param logger - Logger instance
 */
export function handleDataMessage(ws: TypedWebSocket, dataMsg: DataMessage, logger: Logger) {
    const channelManager = getChannelManager();
    const hasPeer = channelManager.hasPeer(ws.data.channelId, ws.data.deviceName);

    if (!hasPeer) {
        logger.debug("No peer connected");
        handleProtocolError(ws, "NO_PEER_CONNECTED", undefined, logger);
        return;
    }

    logger.debug(
        {
            messageId: dataMsg.header.id,
            contentType: dataMsg.payload.contentType,
            sizeBytes: dataMsg.payload.metadata?.size,
        },
        "Relaying DATA message",
    );

    const relayed = channelManager.relayToPeer(ws.data.channelId, ws.data.deviceName, JSON.stringify(dataMsg));

    if (!relayed) {
        logger.warn("Failed to relay DATA message");
        handleProtocolError(ws, "NO_PEER_CONNECTED", "Peer disconnected", logger);
    }
}
