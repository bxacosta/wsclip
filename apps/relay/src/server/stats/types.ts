export const StatsEventType = {
    MESSAGE_RELAYED: "message_relayed",
    CONNECTION_ADDED: "connection_added",
    CONNECTION_REMOVED: "connection_removed",
    SESSION_CREATED: "session_created",
    SESSION_DESTROYED: "session_destroyed",
    RATE_LIMIT_HIT: "rate_limit_hit",
    RATE_LIMIT_BLOCKED: "rate_limit_blocked",
} as const;

export type StatsEventType = (typeof StatsEventType)[keyof typeof StatsEventType];

export type MessageRelayedEvent = {
    type: typeof StatsEventType.MESSAGE_RELAYED;
    sizeBytes: number;
    sessionId: string;
};

export type ConnectionAddedEvent = {
    type: typeof StatsEventType.CONNECTION_ADDED;
    sessionId: string;
    connectionId: string;
};

export type ConnectionRemovedEvent = {
    type: typeof StatsEventType.CONNECTION_REMOVED;
    sessionId: string;
    connectionId: string;
};

export type SessionCreatedEvent = {
    type: typeof StatsEventType.SESSION_CREATED;
    sessionId: string;
};

export type SessionDestroyedEvent = {
    type: typeof StatsEventType.SESSION_DESTROYED;
    sessionId: string;
};

export type RateLimitHitEvent = {
    type: typeof StatsEventType.RATE_LIMIT_HIT;
    ip: string;
};

export type RateLimitBlockedEvent = {
    type: typeof StatsEventType.RATE_LIMIT_BLOCKED;
    ip: string;
};

export type StatsEvent =
    | MessageRelayedEvent
    | ConnectionAddedEvent
    | ConnectionRemovedEvent
    | SessionCreatedEvent
    | SessionDestroyedEvent
    | RateLimitHitEvent
    | RateLimitBlockedEvent;

export interface SessionInfo {
    activeSessions: number;
    activeConnections: number;
    oldestConnectionAt: Date | null;
    newestConnectionAt: Date | null;
}

export interface RelayStats {
    messagesRelayed: number;
    bytesTransferred: number;
}

export interface RateLimitStats {
    hits: number;
    blocked: number;
}

export interface AggregatedStats {
    relay: RelayStats;
    sessions: SessionInfo;
    rateLimit: RateLimitStats;
    oldestConnectionAge: number;
    newestConnectionAge: number;
}
