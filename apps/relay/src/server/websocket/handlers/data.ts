import type { Logger } from "pino";
import { ERROR_MESSAGES } from "@/protocol/constants";
import type { DataMessage } from "@/protocol/types";
import { channelManager, type TypedWebSocket } from "@/server/channel";
import { sendError } from "../middleware";

export function handleDataMessage(ws: TypedWebSocket, dataMsg: DataMessage, logger: Logger) {
    const hasPeer = channelManager.hasPeer(ws.data.channelId, ws.data.deviceName);

    if (!hasPeer) {
        logger.debug("No peer connected");
        sendError(ws, "NO_PEER_CONNECTED", ERROR_MESSAGES.NO_PEER_CONNECTED, logger);
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
        sendError(ws, "NO_PEER_CONNECTED", "Peer disconnected", logger);
    }
}
