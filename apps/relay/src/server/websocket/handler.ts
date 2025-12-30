import type { Server } from "bun";
import { createReadyMessage, parseMessage, serializeMessage } from "@/protocol/messages";
import { MessageType } from "@/protocol/types/enums";
import { validateAckPayload, validateControlPayload, validateDataPayload, validateHeader } from "@/protocol/validation";
import { getChannelManager, type TypedWebSocket } from "@/server/channel";
import type { Env } from "@/server/config/env";
import { handleProtocolError } from "@/server/errors";
import { handleAckMessage, handleControlMessage, handleDataMessage } from "./handlers";
import { withValidation } from "./middleware";
import { handleUpgrade, type UpgradeResult } from "./upgrade";
import { createWebSocketLogger } from "./utils";

export type { UpgradeResult };

export function createWebSocketHandlers(env: Env) {
    return {
        upgrade: (req: Request, server: Server<object>) => handleUpgrade(req, server, env.SERVER_SECRET),

        websocket: {
            maxPayloadLength: env.MAX_MESSAGE_SIZE,
            perMessageDeflate: env.COMPRESSION_ENABLED,
            idleTimeout: env.IDLE_TIMEOUT,
            backpressureLimit: 1024 * 1024,
            closeOnBackpressureLimit: false,
            sendPings: true,
            publishToSelf: false,

            open(ws: TypedWebSocket) {
                const wsLogger = createWebSocketLogger(ws);
                const channelManager = getChannelManager();

                const addResult = channelManager.addPeer(ws.data.channelId, ws.data.peerId, ws);

                if (!addResult.success && addResult.error) {
                    wsLogger.warn({ error: addResult.error }, "Failed to add peer to channel");
                    handleProtocolError(ws, addResult.error.code, addResult.error.message, wsLogger);
                    return;
                }

                const existingPeer = channelManager.getPeer(ws.data.channelId, ws.data.peerId);
                const peerInfo = existingPeer
                    ? {
                          peerId: existingPeer.peerId,
                          metadata: {
                              connectedAt: existingPeer.connectedAt.toISOString(),
                              ...existingPeer.metadata,
                          },
                      }
                    : null;

                const readyMsg = createReadyMessage(ws.data.peerId, ws.data.channelId, peerInfo);

                ws.send(serializeMessage(readyMsg));
                wsLogger.info({ hasPeer: existingPeer !== null }, "Connection ready");
            },

            message(ws: TypedWebSocket, message: string | Buffer) {
                const wsLogger = createWebSocketLogger(ws);
                const messageStr = typeof message === "string" ? message : message.toString("utf-8");
                const messageSizeBytes = Buffer.byteLength(messageStr, "utf-8");

                wsLogger.debug({ sizeBytes: messageSizeBytes }, "Message received");

                if (messageSizeBytes > env.MAX_MESSAGE_SIZE) {
                    wsLogger.warn({ sizeBytes: messageSizeBytes, maxSize: env.MAX_MESSAGE_SIZE }, "Message too large");
                    handleProtocolError(
                        ws,
                        "MESSAGE_TOO_LARGE",
                        `Message size ${messageSizeBytes} exceeds maximum ${env.MAX_MESSAGE_SIZE} bytes`,
                        wsLogger,
                    );
                    return;
                }

                const parsed = parseMessage(messageStr);
                if (!parsed) {
                    wsLogger.warn("Invalid JSON received");
                    handleProtocolError(ws, "INVALID_MESSAGE", "Invalid JSON format", wsLogger);
                    return;
                }

                const headerValidation = validateHeader(parsed);
                if (!headerValidation.valid || !headerValidation.data) {
                    wsLogger.warn({ error: headerValidation.error }, "Invalid message header");
                    handleProtocolError(
                        ws,
                        headerValidation.error?.code || "INVALID_MESSAGE",
                        headerValidation.error?.message || "Invalid message header",
                        wsLogger,
                    );
                    return;
                }

                const msgType = headerValidation.data.type;

                switch (msgType) {
                    case MessageType.DATA: {
                        const dataHandler = withValidation(validateDataPayload, handleDataMessage);
                        dataHandler(ws, parsed, wsLogger);
                        break;
                    }
                    case MessageType.ACK: {
                        const ackHandler = withValidation(validateAckPayload, handleAckMessage);
                        ackHandler(ws, parsed, wsLogger);
                        break;
                    }
                    case MessageType.CONTROL: {
                        const controlHandler = withValidation(validateControlPayload, handleControlMessage);
                        controlHandler(ws, parsed, wsLogger);
                        break;
                    }
                    default: {
                        wsLogger.warn({ type: msgType }, "Unknown message type");
                        handleProtocolError(ws, "INVALID_MESSAGE", `Unknown message type: ${msgType}`, wsLogger);
                    }
                }
            },

            close(ws: TypedWebSocket, code: number, reason: string) {
                const wsLogger = createWebSocketLogger(ws);

                getChannelManager().removePeer(ws.data.channelId, ws.data.peerId, ws);

                wsLogger.info({ code, reason }, "Connection closed");
            },

            drain(ws: TypedWebSocket) {
                const wsLogger = createWebSocketLogger(ws);
                wsLogger.debug("Backpressure relieved");
            },
        },
    };
}
