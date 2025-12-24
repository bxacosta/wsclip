import type { Logger } from "pino";
import { ERROR_MESSAGES } from "@/protocol/constants";
import type { ControlMessage } from "@/protocol/types";
import { channelManager, type TypedWebSocket } from "@/server/channel";
import { sendError } from "../middleware";

export function handleControlMessage(ws: TypedWebSocket, controlMsg: ControlMessage, logger: Logger) {
    const hasPeer = channelManager.hasPeer(ws.data.channelId, ws.data.deviceName);

    if (!hasPeer) {
        logger.debug("No peer connected for CONTROL relay");
        sendError(ws, "NO_PEER_CONNECTED", ERROR_MESSAGES.NO_PEER_CONNECTED, logger);
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
