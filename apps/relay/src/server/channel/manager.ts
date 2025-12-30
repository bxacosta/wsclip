import { getLogger } from "@/server/config/logger";
import { ERROR_CATALOG } from "@/protocol/errors";
import { createPeerMessage, serializeMessage } from "@/protocol/messages";
import type { ErrorCode } from "@/protocol/types";
import { PeerEventType } from "@/protocol/types/enums";
import type { Channel, Peer, TypedWebSocket } from "./types";

export interface ChannelManagerConfig {
    readonly maxChannels: number;
    readonly peersPerChannel: number;
}

export interface AddPeerResult {
    success: boolean;
    error?: {
        code: ErrorCode;
        message: string;
    };
}

class ChannelManager {
    private readonly config: ChannelManagerConfig;
    private channels: Map<string, Channel> = new Map();
    private messagesRelayed = 0;
    private bytesTransferred = 0;

    private errors: Record<ErrorCode, number> = {
        INVALID_SECRET: 0,
        INVALID_CHANNEL: 0,
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

    constructor(config: ChannelManagerConfig) {
        this.config = config;
    }

    incrementError(code: ErrorCode): void {
        this.errors[code]++;
    }

    getErrorMetrics(): Record<ErrorCode, number> {
        return { ...this.errors };
    }

    private getOrCreateChannel(channelId: string): Channel | null {
        const logger = getLogger();
        let channel = this.channels.get(channelId);

        if (!channel) {
            if (this.channels.size >= this.config.maxChannels) {
                logger.warn(
                    {
                        channelId,
                        currentChannels: this.channels.size,
                        maxChannels: this.config.maxChannels,
                    },
                    "Maximum channels reached",
                );
                return null;
            }

            channel = {
                channelId,
                peers: new Map(),
                createdAt: new Date(),
            };

            this.channels.set(channelId, channel);
            logger.info({ channelId, totalChannels: this.channels.size }, "Channel created");
        }

        return channel;
    }

    addPeer(channelId: string, peerId: string, ws: TypedWebSocket): AddPeerResult {
        const logger = getLogger();
        const channel = this.getOrCreateChannel(channelId);

        if (!channel) {
            return {
                success: false,
                error: {
                    code: "MAX_CHANNELS_REACHED",
                    message: ERROR_CATALOG.MAX_CHANNELS_REACHED.defaultMessage,
                },
            };
        }

        if (channel.peers.size >= this.config.peersPerChannel) {
            logger.warn(
                {
                    channelId,
                    peerId,
                    currentPeers: channel.peers.size,
                },
                "Channel full attempt",
            );

            return {
                success: false,
                error: {
                    code: "CHANNEL_FULL",
                    message: ERROR_CATALOG.CHANNEL_FULL.defaultMessage,
                },
            };
        }

        if (channel.peers.has(peerId)) {
            logger.warn({ channelId, peerId }, "Duplicate peer ID attempt");

            return {
                success: false,
                error: {
                    code: "DUPLICATE_PEER_ID",
                    message: ERROR_CATALOG.DUPLICATE_PEER_ID.defaultMessage,
                },
            };
        }

        const peer: Peer = {
            peerId,
            ws,
            connectedAt: new Date(),
            metadata: ws.data.metadata,
        };

        channel.peers.set(peerId, peer);
        ws.subscribe(channelId);

        logger.info(
            {
                channelId,
                peerId,
                totalPeers: channel.peers.size,
            },
            "Peer joined channel",
        );

        if (channel.peers.size === 2) {
            this.notifyPeerConnected(channelId, peerId);
        }

        return { success: true };
    }

    removePeer(channelId: string, peerId: string, ws: TypedWebSocket): void {
        const logger = getLogger();
        const channel = this.channels.get(channelId);

        if (!channel) {
            return;
        }

        const peer = channel.peers.get(peerId);

        // Only remove if the websocket matches the registered peer
        // This prevents removing a legitimate peer when a duplicate connection attempt closes
        if (!peer || peer.ws !== ws) {
            logger.debug({ channelId, peerId }, "Skipping removePeer: ws does not match registered peer");
            return;
        }

        peer.ws.unsubscribe(channelId);
        channel.peers.delete(peerId);

        logger.info(
            {
                channelId,
                peerId,
                remainingPeers: channel.peers.size,
            },
            "Peer left channel",
        );

        if (channel.peers.size === 1) {
            this.notifyPeerDisconnected(channelId, peerId);
        }

        if (channel.peers.size === 0) {
            this.channels.delete(channelId);
            logger.info({ channelId }, "Channel destroyed");
        }
    }

    getPeer(channelId: string, peerId: string): Peer | null {
        const channel = this.channels.get(channelId);

        if (!channel) {
            return null;
        }

        for (const [name, peer] of channel.peers) {
            if (name !== peerId) {
                return peer;
            }
        }

        return null;
    }

    hasPeer(channelId: string, peerId: string): boolean {
        return this.getPeer(channelId, peerId) !== null;
    }

    private notifyPeerConnected(channelId: string, newPeerId: string): void {
        const logger = getLogger();
        const channel = this.channels.get(channelId);

        if (!channel) {
            return;
        }

        const newPeer = channel.peers.get(newPeerId);
        if (!newPeer) {
            return;
        }

        for (const [name, peer] of channel.peers) {
            if (name !== newPeerId) {
                const metadata = {
                    connectedAt: newPeer.connectedAt.toISOString(),
                    ...newPeer.metadata,
                };
                const message = createPeerMessage(newPeerId, PeerEventType.JOINED, metadata);
                peer.ws.send(serializeMessage(message));

                logger.debug(
                    {
                        channelId,
                        to: name,
                        peer: newPeerId,
                    },
                    "Peer joined notification sent",
                );
            }
        }
    }

    private notifyPeerDisconnected(channelId: string, disconnectedPeerId: string): void {
        const logger = getLogger();
        const channel = this.channels.get(channelId);

        if (!channel) {
            return;
        }

        for (const [name, peer] of channel.peers) {
            if (name !== disconnectedPeerId) {
                const metadata = { reason: "connection_closed" };
                const message = createPeerMessage(disconnectedPeerId, PeerEventType.LEFT, metadata);
                peer.ws.send(serializeMessage(message));

                logger.debug(
                    {
                        channelId,
                        to: name,
                        peer: disconnectedPeerId,
                    },
                    "Peer left notification sent",
                );
            }
        }
    }

    relayToPeer(channelId: string, senderName: string, message: string): boolean {
        const logger = getLogger();
        const peer = this.getPeer(channelId, senderName);

        if (!peer) {
            logger.debug({ channelId, senderName }, "No peer available for relay");
            return false;
        }

        const result = peer.ws.send(message);

        if (result === -1) {
            logger.warn(
                {
                    channelId,
                    from: senderName,
                    to: peer.peerId,
                    sizeBytes: message.length,
                },
                "Backpressure detected, message queued by Bun",
            );
        } else if (result === 0) {
            logger.error(
                {
                    channelId,
                    from: senderName,
                    to: peer.peerId,
                },
                "Message dropped, connection issue",
            );
            return false;
        }

        this.messagesRelayed++;
        this.bytesTransferred += Buffer.byteLength(message, "utf8");

        logger.debug(
            {
                channelId,
                from: senderName,
                to: peer.peerId,
                sizeBytes: message.length,
                bytesSent: result > 0 ? result : "queued",
            },
            "Message relayed to peer",
        );

        return true;
    }

    /** Broadcasts a message to all connected peers (e.g., shutdown notification) */
    broadcastToAll(message: string): number {
        const logger = getLogger();
        let sentCount = 0;

        for (const channel of this.channels.values()) {
            for (const peer of channel.peers.values()) {
                try {
                    peer.ws.send(message);
                    sentCount++;
                } catch (error) {
                    logger.error(
                        {
                            err: error,
                            peerId: peer.peerId,
                            channelId: channel.channelId,
                        },
                        "Broadcast send failed",
                    );
                }
            }
        }

        logger.info({ recipientCount: sentCount }, "Broadcast message sent");
        return sentCount;
    }

    getStats() {
        let totalPeers = 0;
        let oldestConnection: Date | null = null;
        let newestConnection: Date | null = null;

        for (const channel of this.channels.values()) {
            for (const peer of channel.peers.values()) {
                totalPeers++;

                if (!oldestConnection || peer.connectedAt < oldestConnection) {
                    oldestConnection = peer.connectedAt;
                }

                if (!newestConnection || peer.connectedAt > newestConnection) {
                    newestConnection = peer.connectedAt;
                }
            }
        }

        return {
            activeChannels: this.channels.size,
            maxChannels: this.config.maxChannels,
            activeConnections: totalPeers,
            messagesRelayed: this.messagesRelayed,
            bytesTransferred: this.bytesTransferred,
            oldestConnectionAge: oldestConnection ? Math.floor((Date.now() - oldestConnection.getTime()) / 1000) : 0,
            newestConnectionAge: newestConnection ? Math.floor((Date.now() - newestConnection.getTime()) / 1000) : 0,
            errors: this.getErrorMetrics(),
        };
    }
}

// Singleton instance
let instance: ChannelManager | null = null;

export function initChannelManager(config: ChannelManagerConfig): ChannelManager {
    if (instance) {
        throw new Error("ChannelManager already initialized");
    }
    instance = new ChannelManager(config);
    return instance;
}

export function getChannelManager(): ChannelManager {
    if (!instance) {
        throw new Error("ChannelManager not initialized. Call initChannelManager() first.");
    }
    return instance;
}

/** Resets the singleton. Only for testing. */
export function resetChannelManager(): void {
    instance = null;
}
