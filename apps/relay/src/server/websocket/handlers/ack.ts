import type { Logger } from "pino";
import type { AckMessage } from "@/protocol/types";
import { getChannelManager, type TypedWebSocket } from "@/server/channel";

/**
 * Handles ACK messages for message acknowledgments.
 *
 * ACK messages are silently dropped if no peer is connected,
 * as the peer may have already disconnected.
 *
 * @param ws - The WebSocket connection
 * @param ackMsg - The parsed ACK message
 * @param logger - Logger instance
 */
export function handleAckMessage(ws: TypedWebSocket, ackMsg: AckMessage, logger: Logger) {
    const channelManager = getChannelManager();
    const hasPeer = channelManager.hasPeer(ws.data.channelId, ws.data.deviceName);

    if (!hasPeer) {
        logger.debug("No peer connected for ACK relay");
        return;
    }

    logger.debug(
        {
            ackId: ackMsg.header.id,
            messageId: ackMsg.payload.messageId,
            status: ackMsg.payload.status,
        },
        "Relaying ACK message",
    );

    channelManager.relayToPeer(ws.data.channelId, ws.data.deviceName, JSON.stringify(ackMsg));
}
