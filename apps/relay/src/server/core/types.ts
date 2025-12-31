import type { ServerWebSocket } from "bun";
import type { Peer } from "@/protocol";

export const LogLevel = {
    DEBUG: "debug",
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const Environment = {
    DEVELOPMENT: "development",
    PRODUCTION: "production",
    TEST: "test",
} as const;

export type Environment = (typeof Environment)[keyof typeof Environment];

export type Config = Readonly<{
    port: number;
    serverSecret: string;
    logLevel: LogLevel;
    nodeEnv: Environment;
    maxMessageSize: number;
    idleTimeoutSec: number;
    compression: boolean;
    rateLimitMax: number;
    rateLimitWindowSec: number;
    maxChannels: number;
    peersPerChannel: number;
}>;

export interface ConnectionParams {
    channelId: string;
    peerId: string;
    secret: string;
}

export interface WebSocketData {
    channelId: string;
    client: Peer;
}

export type AppWebSocket = ServerWebSocket<WebSocketData>;
