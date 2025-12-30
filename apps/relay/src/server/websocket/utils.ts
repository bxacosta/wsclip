import { getLogger } from "@/server/config/logger";
import type { TypedWebSocket } from "@/server/channel";

export function validateChannelId(channel: string): boolean {
    return /^[a-zA-Z0-9]{8}$/.test(channel);
}

export function validatePeerId(peerId: string): boolean {
    return peerId.trim().length > 0;
}

export function createWebSocketLogger(ws: TypedWebSocket) {
    return getLogger().child({
        context: "websocket",
        peerId: ws.data.peerId,
        channelId: ws.data.channelId,
    });
}
