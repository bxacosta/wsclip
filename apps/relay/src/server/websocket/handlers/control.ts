import type { Logger } from "pino";
import type { ControlMessage } from "@/protocol/types";
import { getChannelManager, type TypedWebSocket } from "@/server/channel";
import { handleProtocolError } from "@/server/errors";

export function handleControlMessage(ws: TypedWebSocket, controlMsg: ControlMessage, logger: Logger) {
    const channelManager = getChannelManager();
    const hasPeer = channelManager.hasPeer(ws.data.channelId, ws.data.peerId);

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

    channelManager.relayToPeer(ws.data.channelId, ws.data.peerId, JSON.stringify(controlMsg));
}
