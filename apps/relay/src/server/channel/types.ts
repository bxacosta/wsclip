import type { ServerWebSocket } from "bun";
import type { ClientInfo } from "@/protocol/types";

export interface WebSocketData {
    deviceName: string;
    channelId: string;
    connectedAt: Date;
    authenticated: boolean;
    authTimeoutId: ReturnType<typeof setTimeout> | null;
    clientInfo?: ClientInfo;
}

export type TypedWebSocket = ServerWebSocket<WebSocketData>;

export interface Device {
    deviceName: string;
    ws: TypedWebSocket;
    connectedAt: Date;
    clientInfo?: ClientInfo;
}

export interface Channel {
    channelId: string;
    devices: Map<string, Device>;
    createdAt: Date;
}
