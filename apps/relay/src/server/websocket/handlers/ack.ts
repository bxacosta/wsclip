import type { Logger } from "pino";
import type { AckMessage } from "@/protocol/types";
import { channelManager, type TypedWebSocket } from "@/server/channel";

export function handleAckMessage(ws: TypedWebSocket, ackMsg: AckMessage, logger: Logger) {
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
