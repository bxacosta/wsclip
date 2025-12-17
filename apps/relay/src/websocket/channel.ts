import { getLogger } from "@/config/logger";
import type { Channel, ChannelDevice, ErrorCode, TypedWebSocket } from "@/types";
import { ERROR_MESSAGES } from "@/types";
import { sendPartnerConnected, sendPartnerDisconnected } from "./messages";

class ChannelManager {
    private channels: Map<string, Channel> = new Map();
    private messagesRelayed = 0;
    private bytesTransferred = 0;

    // Error metrics
    private errors: Record<ErrorCode, number> = {
        INVALID_SECRET: 0,
        INVALID_CHANNEL: 0,
        INVALID_DEVICE_NAME: 0,
        CHANNEL_FULL: 0,
        DUPLICATE_DEVICE_NAME: 0,
        INVALID_MESSAGE: 0,
        PAYLOAD_TOO_LARGE: 0,
        NO_PARTNER: 0,
        RATE_LIMIT_EXCEEDED: 0,
        AUTH_TIMEOUT: 0,
        MAX_CHANNELS_REACHED: 0,
    };

    /**
     * Increment error counter for a specific error code
     */
    incrementError(code: ErrorCode): void {
        this.errors[code]++;
    }

    /**
     * Get error metrics
     */
    getErrorMetrics(): Record<ErrorCode, number> {
        return { ...this.errors };
    }

    /**
     * Get or create a channel (internal use only)
     * Does NOT check max channels - that is done in addDevice
     */
    private getOrCreateChannel(channelId: string, maxChannels: number): Channel | null {
        const logger = getLogger();
        let channel = this.channels.get(channelId);

        if (!channel) {
            // Check max channels limit before creating new channel
            if (this.channels.size >= maxChannels) {
                logger.warn(
                    {
                        currentChannels: this.channels.size,
                        maxChannels,
                    },
                    "Max channels limit reached",
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
     * Add device to channel
     * Returns error if channel is full, deviceName is duplicate, or max channels reached
     */
    addDevice(
        channelId: string,
        deviceName: string,
        ws: TypedWebSocket,
        maxChannels: number,
    ): { success: boolean; error?: { code: ErrorCode; message: string } } {
        const logger = getLogger();
        const channel = this.getOrCreateChannel(channelId, maxChannels);

        // Check if max channels limit was reached
        if (!channel) {
            this.incrementError("MAX_CHANNELS_REACHED");

            return {
                success: false,
                error: {
                    code: "MAX_CHANNELS_REACHED",
                    message: ERROR_MESSAGES.MAX_CHANNELS_REACHED,
                },
            };
        }

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

            this.incrementError("CHANNEL_FULL");

            return {
                success: false,
                error: {
                    code: "CHANNEL_FULL",
                    message: ERROR_MESSAGES.CHANNEL_FULL,
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

            this.incrementError("DUPLICATE_DEVICE_NAME");

            return {
                success: false,
                error: {
                    code: "DUPLICATE_DEVICE_NAME",
                    message: ERROR_MESSAGES.DUPLICATE_DEVICE_NAME,
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

        // Subscribe to channel topic for pub/sub
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
            // Unsubscribe from channel topic
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
     */
    relayToPartner(channelId: string, senderName: string, message: string): boolean {
        const logger = getLogger();
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
     * Get detailed channel statistics with connection age tracking
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
export const channelManager = new ChannelManager();
