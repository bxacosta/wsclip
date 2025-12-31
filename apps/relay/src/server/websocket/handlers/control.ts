import { type ControlMessage, ErrorCode } from "@/protocol/types";
import { type AppWebSocket, getContext } from "@/server/core";
import type { Logger } from "@/server/core/logger.ts";
import { handleWebSocketError } from "@/server/errors";

export function handleControlMessage(ws: AppWebSocket, message: ControlMessage, logger: Logger) {
    const { channelManager } = getContext();
    const hasPeer = channelManager.hasOtherPeer(ws);

    if (!hasPeer) {
        logger.debug("No peer connected for CONTROL relay");
        handleWebSocketError(ws, ErrorCode.NO_PEER_CONNECTED);
        return;
    }

    logger.debug(
        {
            messageId: message.header.id,
            command: message.payload.command,
        },
        "Relaying CONTROL message",
    );

    channelManager.relayToClients(ws, message);
}
