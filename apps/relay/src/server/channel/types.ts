import type { ErrorCode, Peer } from "@/protocol/types";
import type { AppWebSocket } from "@/server/core";
import type { Logger } from "@/server/core/logger.ts";

export interface Connection {
    ws: AppWebSocket;
    client: Peer;
}

export interface Channel {
    channelId: string;
    connections: Map<string, Connection>;
    createdAt: Date;
}

export type ChannelManagerConfig = Readonly<{
    maxChannels: number;
    connectionsPerChannel: number;
}>;
export type ChannelManagerDependencies = Readonly<{
    config: ChannelManagerConfig;
    logger: Logger;
}>;

export interface ChannelStats {
    activeChannels: number;
    maxChannels: number;
    activeConnections: number;
    messagesRelayed: number;
    bytesTransferred: number;
    oldestConnectionAge: number;
    newestConnectionAge: number;
    errors: Record<ErrorCode, number>;
}

export type ActionResult = { success: true } | { success: false; errorCode: ErrorCode };

export type RelayResult = {
    clientId: string;
} & ActionResult;
