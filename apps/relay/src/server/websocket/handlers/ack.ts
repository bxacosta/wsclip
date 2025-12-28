import type { Logger } from "pino";
import type { AckMessage } from "@/protocol/types";
import { getChannelManager, type TypedWebSocket } from "@/server/channel";

export function handleAckMessage(ws: TypedWebSocket, ackMsg: AckMessage, logger: Logger) {
    const channelManager = getChannelManager();
    const hasPeer = channelManager.hasPeer(ws.data.channelId, ws.data.peerId);

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

    channelManager.relayToPeer(ws.data.channelId, ws.data.peerId, JSON.stringify(ackMsg));
}
