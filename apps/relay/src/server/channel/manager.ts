import { getLogger } from "@/config/logger";
import { ERROR_MESSAGES, PROTOCOL_CONFIG } from "@/protocol/constants";
import { createPeerEventMessage, serializeMessage } from "@/protocol/messages";
import type { ErrorCode } from "@/protocol/types";
import { PeerEventType } from "@/protocol/types/enums";
import type { Channel, Device, TypedWebSocket } from "./types";

class ChannelManager {
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
        INTERNAL_ERROR: 0,
    };

    incrementError(code: ErrorCode): void {
        this.errors[code]++;
    }

    getErrorMetrics(): Record<ErrorCode, number> {
        return { ...this.errors };
    }

    getOrCreateChannel(channelId: string): Channel {
        const logger = getLogger();
        let channel = this.channels.get(channelId);

        if (!channel) {
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

    addDevice(
        channelId: string,
        deviceName: string,
        ws: TypedWebSocket,
    ): { success: boolean; error?: { code: ErrorCode; message: string } } {
        const logger = getLogger();
        const channel = this.getOrCreateChannel(channelId);

        if (channel.devices.size >= PROTOCOL_CONFIG.DEVICES_PER_CHANNEL) {
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

    hasPeer(channelId: string, deviceName: string): boolean {
        return this.getPeer(channelId, deviceName) !== null;
    }

    private notifyPeerConnected(channelId: string, newDeviceName: string): void {
        const logger = getLogger();
        const channel = this.channels.get(channelId);

        if (!channel) {
            return;
        }

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

    relayToPeer(channelId: string, senderName: string, message: string): boolean {
        const logger = getLogger();
        const peer = this.getPeer(channelId, senderName);

        if (!peer) {
            logger.debug(
                {
                    channelId,
                    senderName,
                },
                "No peer available for relay",
            );
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

export const channelManager = new ChannelManager();
