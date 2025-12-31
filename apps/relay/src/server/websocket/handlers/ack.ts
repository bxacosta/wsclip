import type { Logger } from "pino";
import type { AckMessage } from "@/protocol/types";
import { type AppWebSocket, getContext } from "@/server/core";

export function handleAckMessage(ws: AppWebSocket, message: AckMessage, logger: Logger) {
    const { channelManager } = getContext();
    const hasPeer = channelManager.hasOtherPeer(ws);

    if (!hasPeer) {
        logger.debug("No peer connected for ACK relay");
        return;
    }

    logger.debug(
        {
            ackId: message.header.id,
            messageId: message.payload.messageId,
            status: message.payload.status,
        },
        "Relaying ACK message",
    );

    channelManager.relayToClients(ws, message);
}
