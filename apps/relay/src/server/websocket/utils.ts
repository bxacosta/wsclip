import { getLogger } from "@/config/logger";
import type { TypedWebSocket } from "@/server/channel";

export function validateChannelId(channel: string): boolean {
    return /^[a-zA-Z0-9]{8}$/.test(channel);
}

export function validateDeviceName(deviceName: string): boolean {
    return deviceName.trim().length > 0;
}

export function createWebSocketLogger(ws: TypedWebSocket) {
    return getLogger().child({
        context: "websocket",
        deviceName: ws.data.deviceName,
        channelId: ws.data.channelId,
    });
}
