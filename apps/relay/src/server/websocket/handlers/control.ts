import type { Logger } from "pino";
import type { ControlMessage } from "@/protocol/types";
import { getChannelManager, type TypedWebSocket } from "@/server/channel";
import { handleProtocolError } from "@/server/errors";

/**
 * Handles CONTROL messages for custom commands between peers.
 *
 * Validates that a peer is connected before relaying the message.
 *
 * @param ws - The WebSocket connection
 * @param controlMsg - The parsed CONTROL message
 * @param logger - Logger instance
 */
export function handleControlMessage(ws: TypedWebSocket, controlMsg: ControlMessage, logger: Logger) {
    const channelManager = getChannelManager();
    const hasPeer = channelManager.hasPeer(ws.data.channelId, ws.data.deviceName);

    if (!hasPeer) {
        logger.debug("No peer connected for CONTROL relay");
        handleProtocolError(ws, "NO_PEER_CONNECTED", undefined, logger);
        return;
    }

    logger.debug(
        {
            messageId: controlMsg.header.id,
            command: controlMsg.payload.command,
        },
        "Relaying CONTROL message",
    );

    channelManager.relayToPeer(ws.data.channelId, ws.data.deviceName, JSON.stringify(controlMsg));
}
