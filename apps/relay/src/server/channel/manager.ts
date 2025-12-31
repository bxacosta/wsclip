import type { CRSPMessage, PeerMessage, ReadyMessage } from "@/protocol";
import { createPeerMessage, createReadyMessage, serializeMessage } from "@/protocol/messages";
import { ErrorCatalog, ErrorCode, PeerEventType } from "@/protocol/types/enums";
import type { AppWebSocket, WebSocketData } from "@/server/core";
import type { Logger } from "@/server/core/logger.ts";
import type {
    ActionResult,
    Channel,
    ChannelManagerConfig,
    ChannelManagerDependencies,
    ChannelStats,
    Connection,
    RelayResult,
} from "./types";

export class ChannelManager {
    private readonly config: ChannelManagerConfig;
    private readonly logger: Logger;
    private readonly channels = new Map<string, Channel>();
    private readonly errors: Record<ErrorCode, number> = {
        INVALID_SECRET: 0,
        INVALID_CHANNEL_ID: 0,
        INVALID_PEER_ID: 0,
        CHANNEL_FULL: 0,
        DUPLICATE_PEER_ID: 0,
        INVALID_MESSAGE: 0,
        MESSAGE_TOO_LARGE: 0,
        NO_PEER_CONNECTED: 0,
        RATE_LIMIT_EXCEEDED: 0,
        MAX_CHANNELS_REACHED: 0,
        INTERNAL_ERROR: 0,
    };

    private messagesRelayed = 0;
    private bytesTransferred = 0;

    constructor(deps: ChannelManagerDependencies) {
        this.config = deps.config;
        this.logger = deps.logger;
    }

    incrementError(code: ErrorCode): void {
        this.errors[code]++;
    }

    addConnection(ws: AppWebSocket): ActionResult {
        const logger = this.getLogger(ws.data);

        const { channelId, client } = ws.data;
        let channel = this.channels.get(channelId);

        if (!channel) {
            if (this.channels.size >= this.config.maxChannels) {
                logger.warn(
                    {
                        currentChannels: this.channels.size,
                        maxChannels: this.config.maxChannels,
                    },
                    ErrorCatalog[ErrorCode.MAX_CHANNELS_REACHED].message,
                );

                return { success: false, errorCode: ErrorCode.MAX_CHANNELS_REACHED };
            }

            channel = {
                channelId,
                createdAt: new Date(),
                connections: new Map(),
            };

            this.channels.set(channelId, channel);
            logger.info({ totalChannels: this.channels.size }, "Channel created");
        }

        if (channel.connections.size >= this.config.connectionsPerChannel) {
            logger.warn({ currentConnections: channel.connections.size }, ErrorCatalog[ErrorCode.CHANNEL_FULL].message);
            return { success: false, errorCode: ErrorCode.CHANNEL_FULL };
        }

        if (channel.connections.has(client.id)) {
            logger.warn(ErrorCatalog[ErrorCode.DUPLICATE_PEER_ID].message);
            return { success: false, errorCode: ErrorCode.DUPLICATE_PEER_ID };
        }

        channel.connections.set(client.id, { ws, client });
        ws.subscribe(channelId);
        logger.info({ totalClients: channel.connections.size }, "Client joined channel");

        const [existingConnections] = this.getOtherConnections(channelId, client.id);
        const readyMessage: ReadyMessage = createReadyMessage(
            client.id,
            channelId,
            existingConnections?.client || null,
        );
        ws.send(serializeMessage(readyMessage));

        if (channel.connections.size > 1) {
            this.notifyClientEvent(ws.data, PeerEventType.JOINED);
        }

        return { success: true };
    }

    removeConnection(ws: AppWebSocket): void {
        const logger = this.getLogger(ws.data);

        const { channelId, client } = ws.data;
        const channel = this.channels.get(channelId);

        if (!channel) return;

        const connection = channel.connections.get(client.id);
        if (!connection || connection.ws !== ws) {
            logger.debug("Skipping remove connection, ws does not match with registered connection");
            return;
        }

        connection.ws.unsubscribe(channelId);
        channel.connections.delete(client.id);

        logger.info({ remainingConnections: channel.connections.size }, "Client left the channel");

        if (channel.connections.size > 0) {
            this.notifyClientEvent(ws.data, PeerEventType.LEFT);
        }

        if (channel.connections.size === 0) {
            this.channels.delete(channelId);
            logger.info("Channel destroyed");
        }
    }

    getOtherConnections(channelId: string, clientId: string): Array<Connection> {
        const channel = this.channels.get(channelId);

        if (!channel) return [];

        const connections = [];

        for (const [id, connection] of channel.connections) {
            if (id !== clientId) {
                connections.push(connection);
            }
        }

        return connections;
    }

    hasOtherPeer(ws: AppWebSocket): boolean {
        return this.getOtherConnections(ws.data.channelId, ws.data.client.id) !== null;
    }

    relayToClients(ws: AppWebSocket, message: CRSPMessage): Array<RelayResult> {
        const logger = this.getLogger(ws.data);
        const { channelId, client } = ws.data;

        const connections = this.getOtherConnections(channelId, client.id);

        if (!connections?.length) {
            logger.debug("No connections available for relay");
            return [];
        }

        const serializedMessage = serializeMessage(message);
        const messageSize = Buffer.byteLength(serializedMessage, "utf8");

        return connections.map(connection => {
            const result = connection.ws.send(serializedMessage);

            if (result === 0) {
                logger.error({ to: connection.client.id }, "Message dropped, connection issue");
                return {
                    success: false,
                    clientId: connection.client.id,
                    errorCode: ErrorCode.NO_PEER_CONNECTED,
                };
            }

            this.messagesRelayed++;
            this.bytesTransferred += messageSize;

            logger.debug(
                {
                    to: connection.client.id,
                    sizeBytes: messageSize,
                    status: result > 0 ? "sent" : "queued",
                },
                "Message relayed to peer",
            );

            return { success: true, clientId: connection.client.id };
        });
    }

    close(): number {
        const code = 1001;
        const reason = "Server shutting down";
        let closedCount = 0;

        for (const channel of this.channels.values()) {
            for (const connection of channel.connections.values()) {
                try {
                    connection.ws.close(code, reason);
                    closedCount++;
                } catch (error) {
                    this.getLogger(connection.ws.data).error({ error }, "Connection close failed");
                }
            }
        }

        this.logger.info({ closedCount, code, reason }, "All connections closed");
        return closedCount;
    }

    getStats(): ChannelStats {
        let totalPeers = 0;
        let oldestConnection: Date | null = null;
        let newestConnection: Date | null = null;

        for (const channel of this.channels.values()) {
            for (const connection of channel.connections.values()) {
                totalPeers++;

                const connectedAt = new Date(connection.client.connectedAt);

                if (!oldestConnection || connectedAt < oldestConnection) {
                    oldestConnection = connectedAt;
                }

                if (!newestConnection || connectedAt > newestConnection) {
                    newestConnection = connectedAt;
                }
            }
        }

        return {
            activeChannels: this.channels.size,
            maxChannels: this.config.maxChannels,
            activeConnections: totalPeers,
            messagesRelayed: this.messagesRelayed,
            bytesTransferred: this.bytesTransferred,
            oldestConnectionAge: this.calculateAge(oldestConnection),
            newestConnectionAge: this.calculateAge(newestConnection),
            errors: { ...this.errors },
        };
    }

    private notifyClientEvent(data: WebSocketData, eventType: PeerEventType): void {
        const channel = this.channels.get(data.channelId);
        if (!channel) return;

        const message: PeerMessage = createPeerMessage(data.client.id, eventType);
        const serialized = serializeMessage(message);

        for (const [id, peer] of channel.connections) {
            if (id !== data.client.id) {
                peer.ws.send(serialized);
                this.getLogger(data).debug({ to: id }, `Peer ${eventType} notification sent`);
            }
        }
    }

    private calculateAge(date: Date | null): number {
        if (!date) return 0;
        return Math.floor((Date.now() - date.getTime()) / 1000);
    }

    private getLogger(data: WebSocketData) {
        return this.logger.child({
            context: "websocket",
            channelId: data.channelId,
            connectionId: data.client.id,
        });
    }
}

export function createChannelManager(deps: ChannelManagerDependencies): ChannelManager {
    return new ChannelManager(deps);
}
