import type { ErrorCode, Connection as ProtocolConnection } from "@/protocol";
import type { AppWebSocket } from "@/server/core";
import type { StatsCollector } from "@/server/stats";

export interface SessionConnection {
    ws: AppWebSocket;
    info: ProtocolConnection;
}

export interface Session {
    sessionId: string;
    connections: Map<string, SessionConnection>;
    createdAt: Date;
}

export type SessionManagerConfig = Readonly<{
    maxSessions: number;
    connectionsPerSession: number;
}>;

export type SessionManagerDependencies = Readonly<{
    config: SessionManagerConfig;
    statsCollector: StatsCollector;
}>;

// AddConnection result types
export type AddConnectionSuccess = {
    success: true;
    sessionCreated: boolean;
    totalConnections: number;
    totalSessions: number;
    otherConnections: ProtocolConnection[];
    shouldNotifyOthers: boolean;
};

export type AddConnectionFailure = {
    success: false;
    errorCode: ErrorCode;
    context: {
        currentSessions?: number;
        maxSessions?: number;
        currentConnections?: number;
        connectionsPerSession?: number;
    };
};

export type AddConnectionResult = AddConnectionSuccess | AddConnectionFailure;

// RemoveConnection result types
export type RemoveConnectionResult =
    | {
          removed: true;
          sessionDestroyed: boolean;
          remainingConnections: number;
          shouldNotifyOthers: boolean;
      }
    | {
          removed: false;
          reason: "session_not_found" | "connection_mismatch";
      };

// RelayResult types
export type RelayResultItem = {
    connectionId: string;
    success: boolean;
    status: "sent" | "queued" | "dropped";
    sizeBytes: number;
    errorCode?: ErrorCode;
};

export type RelayResult = {
    results: RelayResultItem[];
    totalSize: number;
};

// Close result types
export type CloseConnectionError = {
    connectionId: string;
    sessionId: string;
    error: Error;
};

export type CloseResult = {
    closedCount: number;
    errors: CloseConnectionError[];
};
