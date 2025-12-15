import { getLogger } from "@/config/logger";
import type { Channel, ChannelDevice, ErrorCode, TypedWebSocket } from "@/types";
import { sendPartnerConnected, sendPartnerDisconnected } from "./messages";

class ChannelManager {
    private channels: Map<string, Channel> = new Map();
    private messagesRelayed = 0;
    private bytesTransferred = 0;

    /**
     * Get or create a channel
     */
    private getOrCreateChannel(channelId: string): Channel {
        const logger = getLogger(); // Modern pattern: get logger inside function
        let channel = this.channels.get(channelId);

        if (!channel) {
            channel = {
                channelId,
                devices: new Map(),
                createdAt: new Date(),
            };

            this.channels.set(channelId, channel);

            logger.info({ channelId }, "Channel created");
        }

        return channel;
    }

    /**
     * Add device to channel
     * Returns error if channel is full or deviceName is duplicate
     */
    addDevice(
        channelId: string,
        deviceName: string,
        ws: TypedWebSocket,
    ): { success: boolean; error?: { code: ErrorCode; message: string } } {
        const logger = getLogger();
        const channel = this.getOrCreateChannel(channelId);

        // Check if channel is full (max 2 devices)
        if (channel.devices.size >= 2) {
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
                    message: "Channel already has 2 participants",
                },
            };
        }

        // Check for duplicate deviceName in this channel
        if (channel.devices.has(deviceName)) {
            logger.warn(
                {
                    channelId,
                    deviceName,
                },
                "Duplicate device name attempt",
            );

            return {
                success: false,
                error: {
                    code: "DUPLICATE_DEVICE_NAME",
                    message: "Device name already exists in this channel",
                },
            };
        }

        // Add device to channel
        const device: ChannelDevice = {
            deviceName,
            ws,
            connectedAt: new Date(),
        };

        channel.devices.set(deviceName, device);

        // MODERN PATTERN: Subscribe to channel topic for pub/sub
        ws.subscribe(channelId);

        logger.info(
            {
                channelId,
                deviceName,
                totalDevices: channel.devices.size,
            },
            "Device joined channel",
        );

        // Notify partner if one exists
        if (channel.devices.size === 2) {
            this.notifyPartnerConnected(channelId, deviceName);
        }

        return { success: true };
    }

    /**
     * Remove device from channel
     * Destroys channel if empty
     */
    removeDevice(channelId: string, deviceName: string): void {
        const logger = getLogger();
        const channel = this.channels.get(channelId);

        if (!channel) {
            return;
        }

        // Get the WebSocket before removing
        const device = channel.devices.get(deviceName);
        if (device) {
            // MODERN PATTERN: Unsubscribe from channel topic
            device.ws.unsubscribe(channelId);
        }

        // Remove device
        channel.devices.delete(deviceName);

        logger.info(
            {
                channelId,
                deviceName,
                remainingDevices: channel.devices.size,
            },
            "Device left channel",
        );

        // Notify partner if one remains
        if (channel.devices.size === 1) {
            this.notifyPartnerDisconnected(channelId, deviceName);
        }

        // Destroy channel if empty
        if (channel.devices.size === 0) {
            this.channels.delete(channelId);

            logger.info({ channelId }, "Channel destroyed");
        }
    }

    /**
     * Get partner device in the same channel
     */
    getPartner(channelId: string, deviceName: string): ChannelDevice | null {
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
     * Check if device has a partner in the channel
     */
    hasPartner(channelId: string, deviceName: string): boolean {
        return this.getPartner(channelId, deviceName) !== null;
    }

    /**
     * Notify devices that partner connected
     * MODERN PATTERN: Uses sendPartnerConnected utility
     */
    private notifyPartnerConnected(channelId: string, newDeviceName: string): void {
        const logger = getLogger();
        const channel = this.channels.get(channelId);

        if (!channel) {
            return;
        }

        // Notify all OTHER devices about the new device
        for (const [name, device] of channel.devices) {
            if (name !== newDeviceName) {
                sendPartnerConnected(device.ws, newDeviceName);

                logger.debug(
                    {
                        channelId,
                        to: name,
                        partner: newDeviceName,
                    },
                    "Partner connected notification sent",
                );
            }
        }

        // Also notify the new device about existing partner
        const newDevice = channel.devices.get(newDeviceName);
        if (newDevice) {
            for (const [name] of channel.devices) {
                if (name !== newDeviceName) {
                    sendPartnerConnected(newDevice.ws, name);

                    logger.debug(
                        {
                            channelId,
                            to: newDeviceName,
                            partner: name,
                        },
                        "Partner connected notification sent",
                    );
                }
            }
        }
    }

    /**
     * Notify remaining device that partner disconnected
     * MODERN PATTERN: Uses sendPartnerDisconnected utility
     */
    private notifyPartnerDisconnected(channelId: string, disconnectedDeviceName: string): void {
        const logger = getLogger();
        const channel = this.channels.get(channelId);

        if (!channel) {
            return;
        }

        // Notify remaining device
        for (const [name, device] of channel.devices) {
            if (name !== disconnectedDeviceName) {
                sendPartnerDisconnected(device.ws, disconnectedDeviceName);

                logger.debug(
                    {
                        channelId,
                        to: name,
                        partner: disconnectedDeviceName,
                    },
                    "Partner disconnected notification sent",
                );
            }
        }
    }

    /**
     * Relay message to partner
     * Returns false if no partner exists
     * MODERN PATTERN: Uses lazy logger initialization
     */
    relayToPartner(channelId: string, senderName: string, message: string): boolean {
        const logger = getLogger(); // Modern pattern: get logger inside function
        const partner = this.getPartner(channelId, senderName);

        if (!partner) {
            logger.debug(
                {
                    channelId,
                    senderName,
                },
                "No partner available for relay",
            );
            return false;
        }

        // Send message (automatically handles backpressure)
        partner.ws.send(message);

        // Track metrics
        this.messagesRelayed++;
        this.bytesTransferred += Buffer.byteLength(message, "utf8");

        logger.debug(
            {
                channelId,
                from: senderName,
                to: partner.deviceName,
                size: message.length,
            },
            "Message relayed to partner",
        );

        return true;
    }

    /**
     * Broadcast message to all connected devices
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
     * Get channel statistics
     */
    getStats() {
        let totalDevices = 0;

        for (const channel of this.channels.values()) {
            totalDevices += channel.devices.size;
        }

        return {
            activeChannels: this.channels.size,
            activeConnections: totalDevices,
        };
    }

    /**
     * Get detailed channel statistics with connection age tracking
     */
    getDetailedStats() {
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
            activeConnections: totalDevices,
            messagesRelayed: this.messagesRelayed,
            bytesTransferred: this.bytesTransferred,
            oldestConnectionAge: oldestConnection ? Math.floor((Date.now() - oldestConnection.getTime()) / 1000) : 0,
            newestConnectionAge: newestConnection ? Math.floor((Date.now() - newestConnection.getTime()) / 1000) : 0,
        };
    }
}

// Singleton instance
export const channelManager = new ChannelManager();
