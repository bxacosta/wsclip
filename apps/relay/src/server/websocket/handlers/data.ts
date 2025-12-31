import type { Logger } from "pino";
import { type DataMessage, ErrorCode } from "@/protocol/types";
import { type AppWebSocket, getContext } from "@/server/core";
import { handleWebSocketError } from "@/server/errors";

export function handleDataMessage(ws: AppWebSocket, message: DataMessage, logger: Logger) {
    const { channelManager } = getContext();
    const hasPeer = channelManager.hasOtherPeer(ws);

    if (!hasPeer) {
        logger.debug("No peer connected");
        handleWebSocketError(ws, ErrorCode.NO_PEER_CONNECTED);
        return;
    }

    logger.debug(
        {
            messageId: message.header.id,
            contentType: message.payload.contentType,
        },
        "Relaying DATA message",
    );

    const relayed = channelManager.relayToClients(ws, message);

    if (!relayed) {
        logger.warn("Failed to relay DATA message");
        handleWebSocketError(ws, ErrorCode.NO_PEER_CONNECTED, "Peer disconnected");
    }
}
