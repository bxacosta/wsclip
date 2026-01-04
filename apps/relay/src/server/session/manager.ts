import type { CRSPMessage } from "@/protocol";
import { serializeMessage } from "@/protocol/messages";
import { ErrorCode } from "@/protocol/types/enums";
import type { AppWebSocket } from "@/server/core";
import type { SessionInfo, StatsCollector } from "@/server/stats";
import type {
    AddConnectionResult,
    CloseResult,
    Connection,
    RelayResult,
    RemoveConnectionResult,
    Session,
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
        const { sessionId, client } = ws.data;
        let session = this.sessions.get(sessionId);
        let sessionCreated = false;

        if (!session) {
            if (this.sessions.size >= this.config.maxSessions) {
                return {
                    success: false,
                    errorCode: ErrorCode.MAX_CHANNELS_REACHED,
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
                errorCode: ErrorCode.CHANNEL_FULL,
                context: {
                    currentConnections: session.connections.size,
                    connectionsPerSession: this.config.connectionsPerSession,
                },
            };
        }

        if (session.connections.has(client.id)) {
            return {
                success: false,
                errorCode: ErrorCode.DUPLICATE_PEER_ID,
                context: {},
            };
        }

        session.connections.set(client.id, { ws, client });
        ws.subscribe(sessionId);
        this.statsCollector.emit({ type: "connection_added", sessionId, connectionId: client.id });

        const existingPeer = this.getOtherConnections(sessionId, client.id).at(0)?.client ?? null;
        const shouldNotifyPeers = session.connections.size > 1;

        return {
            success: true,
            sessionCreated,
            totalConnections: session.connections.size,
            totalSessions: this.sessions.size,
            existingPeer,
            shouldNotifyPeers,
        };
    }

    removeConnection(ws: AppWebSocket): RemoveConnectionResult {
        const { sessionId, client } = ws.data;
        const session = this.sessions.get(sessionId);

        if (!session) {
            return { removed: false, reason: "session_not_found" };
        }

        const connection = session.connections.get(client.id);
        if (!connection || connection.ws !== ws) {
            return { removed: false, reason: "connection_mismatch" };
        }

        connection.ws.unsubscribe(sessionId);
        session.connections.delete(client.id);
        this.statsCollector.emit({ type: "connection_removed", sessionId, connectionId: client.id });

        const shouldNotifyPeers = session.connections.size > 0;
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
            shouldNotifyPeers,
        };
    }

    getOtherConnections(sessionId: string, clientId: string): Array<Connection> {
        const session = this.sessions.get(sessionId);

        if (!session) return [];

        const connections = [];

        for (const [id, connection] of session.connections) {
            if (id !== clientId) {
                connections.push(connection);
            }
        }

        return connections;
    }

    hasOtherPeer(ws: AppWebSocket): boolean {
        return this.getOtherConnections(ws.data.sessionId, ws.data.client.id).length > 0;
    }

    relayToClients(ws: AppWebSocket, message: CRSPMessage): RelayResult {
        const { sessionId, client } = ws.data;
        const connections = this.getOtherConnections(sessionId, client.id);

        if (!connections.length) {
            return { results: [], totalSize: 0 };
        }

        const serializedMessage = serializeMessage(message);
        const messageSize = Buffer.byteLength(serializedMessage, "utf8");

        const results = connections.map(connection => {
            const sendResult = connection.ws.send(serializedMessage);

            if (sendResult === 0) {
                return {
                    clientId: connection.client.id,
                    success: false,
                    status: "dropped" as const,
                    sizeBytes: messageSize,
                    errorCode: ErrorCode.NO_PEER_CONNECTED,
                };
            }

            this.statsCollector.emit({ type: "message_relayed", sizeBytes: messageSize, sessionId });

            return {
                clientId: connection.client.id,
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
            for (const connection of session.connections.values()) {
                try {
                    connection.ws.close(code, reason);
                    closedCount++;
                } catch (error) {
                    errors.push({
                        connectionId: connection.client.id,
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
            for (const connection of session.connections.values()) {
                totalConnections++;

                const connectedAt = new Date(connection.client.connectedAt);

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
