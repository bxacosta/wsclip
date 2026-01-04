import { type CRSPMessage, ErrorCode, serializeMessage } from "@/protocol";
import type { AppWebSocket } from "@/server/core";
import type { SessionInfo, StatsCollector } from "@/server/stats";
import type {
    AddConnectionResult,
    CloseResult,
    RelayResult,
    RemoveConnectionResult,
    Session,
    SessionConnection,
    SessionManagerConfig,
    SessionManagerDependencies,
} from "./types";

export class SessionManager {
    private readonly config: SessionManagerConfig;
    private readonly statsCollector: StatsCollector;
    private readonly sessions = new Map<string, Session>();

    constructor(deps: SessionManagerDependencies) {
        this.config = deps.config;
        this.statsCollector = deps.statsCollector;
    }

    addConnection(ws: AppWebSocket): AddConnectionResult {
        const { sessionId, connection } = ws.data;
        let session = this.sessions.get(sessionId);
        let sessionCreated = false;

        if (!session) {
            if (this.sessions.size >= this.config.maxSessions) {
                return {
                    success: false,
                    errorCode: ErrorCode.MAX_SESSIONS_REACHED,
                    context: {
                        currentSessions: this.sessions.size,
                        maxSessions: this.config.maxSessions,
                    },
                };
            }

            session = {
                sessionId,
                createdAt: new Date(),
                connections: new Map(),
            };

            this.sessions.set(sessionId, session);
            this.statsCollector.emit({ type: "session_created", sessionId });
            sessionCreated = true;
        }

        if (session.connections.size >= this.config.connectionsPerSession) {
            return {
                success: false,
                errorCode: ErrorCode.SESSION_FULL,
                context: {
                    currentConnections: session.connections.size,
                    connectionsPerSession: this.config.connectionsPerSession,
                },
            };
        }

        if (session.connections.has(connection.id)) {
            return {
                success: false,
                errorCode: ErrorCode.DUPLICATE_CONNECTION_ID,
                context: {},
            };
        }

        session.connections.set(connection.id, { ws, info: connection });
        ws.subscribe(sessionId);
        this.statsCollector.emit({ type: "connection_added", sessionId, connectionId: connection.id });

        const otherConnection = this.getOtherConnections(sessionId, connection.id).at(0)?.info ?? null;
        const shouldNotifyOthers = session.connections.size > 1;

        return {
            success: true,
            sessionCreated,
            totalConnections: session.connections.size,
            totalSessions: this.sessions.size,
            otherConnection,
            shouldNotifyOthers,
        };
    }

    removeConnection(ws: AppWebSocket): RemoveConnectionResult {
        const { sessionId, connection } = ws.data;
        const session = this.sessions.get(sessionId);

        if (!session) {
            return { removed: false, reason: "session_not_found" };
        }

        const sessionConnection = session.connections.get(connection.id);
        if (!sessionConnection || sessionConnection.ws !== ws) {
            return { removed: false, reason: "connection_mismatch" };
        }

        sessionConnection.ws.unsubscribe(sessionId);
        session.connections.delete(connection.id);
        this.statsCollector.emit({ type: "connection_removed", sessionId, connectionId: connection.id });

        const shouldNotifyOthers = session.connections.size > 0;
        let sessionDestroyed = false;

        if (session.connections.size === 0) {
            this.sessions.delete(sessionId);
            this.statsCollector.emit({ type: "session_destroyed", sessionId });
            sessionDestroyed = true;
        }

        return {
            removed: true,
            sessionDestroyed,
            remainingConnections: session.connections.size,
            shouldNotifyOthers,
        };
    }

    getOtherConnections(sessionId: string, connectionId: string): Array<SessionConnection> {
        const session = this.sessions.get(sessionId);

        if (!session) return [];

        const connections = [];

        for (const [id, sessionConnection] of session.connections) {
            if (id !== connectionId) {
                connections.push(sessionConnection);
            }
        }

        return connections;
    }

    hasOtherConnection(ws: AppWebSocket): boolean {
        return this.getOtherConnections(ws.data.sessionId, ws.data.connection.id).length > 0;
    }

    relayToConnections(ws: AppWebSocket, message: CRSPMessage): RelayResult {
        const { sessionId, connection } = ws.data;
        const connections = this.getOtherConnections(sessionId, connection.id);

        if (!connections.length) {
            return { results: [], totalSize: 0 };
        }

        const serializedMessage = serializeMessage(message);
        const messageSize = Buffer.byteLength(serializedMessage, "utf8");

        const results = connections.map(sessionConnection => {
            const sendResult = sessionConnection.ws.send(serializedMessage);

            if (sendResult === 0) {
                return {
                    connectionId: sessionConnection.info.id,
                    success: false,
                    status: "dropped" as const,
                    sizeBytes: messageSize,
                    errorCode: ErrorCode.NO_OTHER_CONNECTION,
                };
            }

            this.statsCollector.emit({ type: "message_relayed", sizeBytes: messageSize, sessionId });

            return {
                connectionId: sessionConnection.info.id,
                success: true,
                status: (sendResult > 0 ? "sent" : "queued") as "sent" | "queued",
                sizeBytes: messageSize,
            };
        });

        return { results, totalSize: messageSize * results.length };
    }

    close(): CloseResult {
        const code = 1001;
        const reason = "Server shutting down";
        let closedCount = 0;
        const errors: CloseResult["errors"] = [];

        for (const session of this.sessions.values()) {
            for (const sessionConnection of session.connections.values()) {
                try {
                    sessionConnection.ws.close(code, reason);
                    closedCount++;
                } catch (error) {
                    errors.push({
                        connectionId: sessionConnection.info.id,
                        sessionId: session.sessionId,
                        error: error instanceof Error ? error : new Error(String(error)),
                    });
                }
            }
        }

        return { closedCount, errors };
    }

    getSessionInfo(): SessionInfo {
        let totalConnections = 0;
        let oldestConnectionAt: Date | null = null;
        let newestConnectionAt: Date | null = null;

        for (const session of this.sessions.values()) {
            for (const sessionConnection of session.connections.values()) {
                totalConnections++;

                const connectedAt = new Date(sessionConnection.info.connectedAt);

                if (!oldestConnectionAt || connectedAt < oldestConnectionAt) {
                    oldestConnectionAt = connectedAt;
                }

                if (!newestConnectionAt || connectedAt > newestConnectionAt) {
                    newestConnectionAt = connectedAt;
                }
            }
        }

        return {
            activeSessions: this.sessions.size,
            activeConnections: totalConnections,
            oldestConnectionAt,
            newestConnectionAt,
        };
    }
}

export function createSessionManager(deps: SessionManagerDependencies): SessionManager {
    return new SessionManager(deps);
}
