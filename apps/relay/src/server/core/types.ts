import type { ServerWebSocket } from "bun";
import type { Connection } from "@/protocol";

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
    maxSessions: number;
    connectionsPerSession: number;
}>;

export interface ConnectionParams {
    sessionId: string;
    connectionId: string;
    secret: string;
}

export interface WebSocketData {
    sessionId: string;
    connection: Connection;
}

export type AppWebSocket = ServerWebSocket<WebSocketData>;
