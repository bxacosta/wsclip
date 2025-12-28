import type { Logger } from "pino";
import type { DataMessage } from "@/protocol/types";
import { getChannelManager, type TypedWebSocket } from "@/server/channel";
import { handleProtocolError } from "@/server/errors";

export function handleDataMessage(ws: TypedWebSocket, dataMsg: DataMessage, logger: Logger) {
    const channelManager = getChannelManager();
    const hasPeer = channelManager.hasPeer(ws.data.channelId, ws.data.peerId);

    if (!hasPeer) {
        logger.debug("No peer connected");
        handleProtocolError(ws, "NO_PEER_CONNECTED", undefined, logger);
        return;
    }

    logger.debug(
        {
            messageId: dataMsg.header.id,
            contentType: dataMsg.payload.contentType,
        },
        "Relaying DATA message",
    );

    const relayed = channelManager.relayToPeer(ws.data.channelId, ws.data.peerId, JSON.stringify(dataMsg));

    if (!relayed) {
        logger.warn("Failed to relay DATA message");
        handleProtocolError(ws, "NO_PEER_CONNECTED", "Peer disconnected", logger);
    }
}
