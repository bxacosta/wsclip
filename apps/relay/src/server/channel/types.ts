import type { ServerWebSocket } from "bun";
import type { Metadata } from "@/protocol/types";

export interface WebSocketData {
    peerId: string;
    channelId: string;
    connectedAt: Date;
    metadata?: Metadata;
}

export type TypedWebSocket = ServerWebSocket<WebSocketData>;

export interface Peer {
    peerId: string;
    ws: TypedWebSocket;
    connectedAt: Date;
    metadata?: Metadata;
}

export interface Channel {
    channelId: string;
    peers: Map<string, Peer>;
    createdAt: Date;
}
