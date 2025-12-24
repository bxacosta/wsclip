import { getLogger } from "@/config/logger";
import { getDefaultMessage } from "@/protocol/errors";
import { createPeerEventMessage, serializeMessage } from "@/protocol/messages";
import type { ErrorCode } from "@/protocol/types";
import { PeerEventType } from "@/protocol/types/enums";
import type { Channel, Device, TypedWebSocket } from "./types";

/**
 * Configuration for the ChannelManager.
 * Immutable after construction.
 */
export interface ChannelManagerConfig {
    /** Maximum number of concurrent channels */
    readonly maxChannels: number;
    /** Maximum devices per channel (typically 2) */
    readonly devicesPerChannel: number;
}

/**
 * Result of adding a device to a channel.
 */
export interface AddDeviceResult {
    success: boolean;
    error?: {
        code: ErrorCode;
        message: string;
    };
}

/**
 * Manages WebSocket channels and device connections.
 * Handles device registration, message relay, and channel lifecycle.
 */
class ChannelManager {
    private readonly config: ChannelManagerConfig;
    private channels: Map<string, Channel> = new Map();
    private messagesRelayed = 0;
    private bytesTransferred = 0;

    private errors: Record<ErrorCode, number> = {
        INVALID_SECRET: 0,
        INVALID_CHANNEL: 0,
        INVALID_DEVICE_NAME: 0,
        CHANNEL_FULL: 0,
        DUPLICATE_DEVICE_NAME: 0,
        INVALID_MESSAGE: 0,
        MESSAGE_TOO_LARGE: 0,
        NO_PEER_CONNECTED: 0,
        RATE_LIMIT_EXCEEDED: 0,
        AUTH_TIMEOUT: 0,
        MAX_CHANNELS_REACHED: 0,
        INTERNAL_ERROR: 0,
    };

    constructor(config: ChannelManagerConfig) {
        this.config = config;
    }

    /**
     * Increments the error counter for a specific error code.
     */
    incrementError(code: ErrorCode): void {
        this.errors[code]++;
    }

    /**
     * Gets a copy of the error metrics.
     */
    getErrorMetrics(): Record<ErrorCode, number> {
        return { ...this.errors };
    }

    /**
     * Gets or creates a channel by ID.
     * Returns null if max channels limit is reached.
     */
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
                devices: new Map(),
                createdAt: new Date(),
            };

            this.channels.set(channelId, channel);
            logger.info({ channelId, totalChannels: this.channels.size }, "Channel created");
        }

        return channel;
    }

    /**
     * Adds a device to a channel.
     * Validates channel capacity and device name uniqueness.
     */
    addDevice(channelId: string, deviceName: string, ws: TypedWebSocket): AddDeviceResult {
        const logger = getLogger();
        const channel = this.getOrCreateChannel(channelId);

        if (!channel) {
            return {
                success: false,
                error: {
                    code: "MAX_CHANNELS_REACHED",
                    message: getDefaultMessage("MAX_CHANNELS_REACHED"),
                },
            };
        }

        if (channel.devices.size >= this.config.devicesPerChannel) {
            logger.warn(
                {
                    channelId,
                    deviceName,
                    currentDevices: channel.devices.size,
                },
                "Channel full attempt",
            );

            return {
                success: false,
                error: {
                    code: "CHANNEL_FULL",
                    message: getDefaultMessage("CHANNEL_FULL"),
                },
            };
        }

        if (channel.devices.has(deviceName)) {
            logger.warn({ channelId, deviceName }, "Duplicate device name attempt");

            return {
                success: false,
                error: {
                    code: "DUPLICATE_DEVICE_NAME",
                    message: getDefaultMessage("DUPLICATE_DEVICE_NAME"),
                },
            };
        }

        const device: Device = {
            deviceName,
            ws,
            connectedAt: new Date(),
            clientInfo: ws.data.clientInfo,
        };

        channel.devices.set(deviceName, device);
        ws.subscribe(channelId);

        logger.info(
            {
                channelId,
                deviceName,
                totalDevices: channel.devices.size,
            },
            "Device joined channel",
        );

        if (channel.devices.size === 2) {
            this.notifyPeerConnected(channelId, deviceName);
        }

        return { success: true };
    }

    /**
     * Removes a device from a channel.
     * Cleans up the channel if empty.
     */
    removeDevice(channelId: string, deviceName: string): void {
        const logger = getLogger();
        const channel = this.channels.get(channelId);

        if (!channel) {
            return;
        }

        const device = channel.devices.get(deviceName);
        if (device) {
            device.ws.unsubscribe(channelId);
        }

        channel.devices.delete(deviceName);

        logger.info(
            {
                channelId,
                deviceName,
                remainingDevices: channel.devices.size,
            },
            "Device left channel",
        );

        if (channel.devices.size === 1) {
            this.notifyPeerDisconnected(channelId, deviceName);
        }

        if (channel.devices.size === 0) {
            this.channels.delete(channelId);
            logger.info({ channelId }, "Channel destroyed");
        }
    }

    /**
     * Gets the peer device in a channel.
     */
    getPeer(channelId: string, deviceName: string): Device | null {
        const channel = this.channels.get(channelId);

        if (!channel) {
            return null;
        }

        for (const [name, device] of channel.devices) {
            if (name !== deviceName) {
                return device;
            }
        }

        return null;
    }

    /**
     * Checks if a peer is connected in the channel.
     */
    hasPeer(channelId: string, deviceName: string): boolean {
        return this.getPeer(channelId, deviceName) !== null;
    }

    /**
     * Notifies existing device when a new peer connects.
     */
    private notifyPeerConnected(channelId: string, newDeviceName: string): void {
        const logger = getLogger();
        const channel = this.channels.get(channelId);

        if (!channel) {
            return;
        }

        // Notify existing device about new peer
        for (const [name, device] of channel.devices) {
            if (name !== newDeviceName) {
                const message = createPeerEventMessage(
                    newDeviceName,
                    PeerEventType.JOINED,
                    channel.devices.get(newDeviceName)?.clientInfo,
                );
                device.ws.send(serializeMessage(message));

                logger.debug(
                    {
                        channelId,
                        to: name,
                        peer: newDeviceName,
                    },
                    "Peer joined notification sent",
                );
            }
        }

        // Notify new device about existing peer
        const newDevice = channel.devices.get(newDeviceName);
        if (newDevice) {
            for (const [name, device] of channel.devices) {
                if (name !== newDeviceName) {
                    const message = createPeerEventMessage(name, PeerEventType.JOINED, device.clientInfo);
                    newDevice.ws.send(serializeMessage(message));

                    logger.debug(
                        {
                            channelId,
                            to: newDeviceName,
                            peer: name,
                        },
                        "Peer joined notification sent",
                    );
                }
            }
        }
    }

    /**
     * Notifies remaining device when peer disconnects.
     */
    private notifyPeerDisconnected(channelId: string, disconnectedDeviceName: string): void {
        const logger = getLogger();
        const channel = this.channels.get(channelId);

        if (!channel) {
            return;
        }

        for (const [name, device] of channel.devices) {
            if (name !== disconnectedDeviceName) {
                const message = createPeerEventMessage(disconnectedDeviceName, PeerEventType.LEFT);
                device.ws.send(serializeMessage(message));

                logger.debug(
                    {
                        channelId,
                        to: name,
                        peer: disconnectedDeviceName,
                    },
                    "Peer left notification sent",
                );
            }
        }
    }

    /**
     * Relays a message to the peer device.
     * Returns false if no peer is connected or send fails.
     */
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
                    to: peer.deviceName,
                    sizeBytes: message.length,
                },
                "Backpressure detected, message queued by Bun",
            );
        } else if (result === 0) {
            logger.error(
                {
                    channelId,
                    from: senderName,
                    to: peer.deviceName,
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
                to: peer.deviceName,
                sizeBytes: message.length,
                bytesSent: result > 0 ? result : "queued",
            },
            "Message relayed to peer",
        );

        return true;
    }

    /**
     * Broadcasts a message to all connected devices.
     * Used for server-wide notifications like shutdown.
     */
    broadcastToAll(message: string): number {
        const logger = getLogger();
        let sentCount = 0;

        for (const channel of this.channels.values()) {
            for (const device of channel.devices.values()) {
                try {
                    device.ws.send(message);
                    sentCount++;
                } catch (error) {
                    logger.error(
                        {
                            err: error,
                            deviceName: device.deviceName,
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

    /**
     * Gets server statistics.
     */
    getStats() {
        let totalDevices = 0;
        let oldestConnection: Date | null = null;
        let newestConnection: Date | null = null;

        for (const channel of this.channels.values()) {
            for (const device of channel.devices.values()) {
                totalDevices++;

                if (!oldestConnection || device.connectedAt < oldestConnection) {
                    oldestConnection = device.connectedAt;
                }

                if (!newestConnection || device.connectedAt > newestConnection) {
                    newestConnection = device.connectedAt;
                }
            }
        }

        return {
            activeChannels: this.channels.size,
            maxChannels: this.config.maxChannels,
            activeConnections: totalDevices,
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

/**
 * Initializes the ChannelManager singleton with the given configuration.
 * Must be called once during application startup.
 *
 * @throws Error if already initialized
 */
export function initChannelManager(config: ChannelManagerConfig): ChannelManager {
    if (instance) {
        throw new Error("ChannelManager already initialized");
    }
    instance = new ChannelManager(config);
    return instance;
}

/**
 * Gets the ChannelManager singleton instance.
 *
 * @throws Error if not initialized
 */
export function getChannelManager(): ChannelManager {
    if (!instance) {
        throw new Error("ChannelManager not initialized. Call initChannelManager() first.");
    }
    return instance;
}

/**
 * Resets the ChannelManager singleton. Only for testing purposes.
 */
export function resetChannelManager(): void {
    instance = null;
}

// Legacy export for backward compatibility during migration
// TODO: Remove after all usages are updated to use getChannelManager()
export const channelManager = {
    get instance(): ChannelManager {
        return getChannelManager();
    },
};
