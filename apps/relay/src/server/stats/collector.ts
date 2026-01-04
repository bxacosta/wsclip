import { EventEmitter } from "node:events";
import {
    type AggregatedStats,
    type RateLimitStats,
    type RelayStats,
    type SessionInfo,
    type StatsEvent,
    StatsEventType,
} from "@/server/stats/types";

export class StatsCollector {
    private readonly emitter = new EventEmitter();

    private messagesRelayed = 0;
    private bytesTransferred = 0;
    private rateLimitHits = 0;
    private rateLimitBlocked = 0;

    constructor() {
        this.setupListeners();
    }

    emit(event: StatsEvent): void {
        this.emitter.emit(event.type, event);
    }

    getRelayStats(): RelayStats {
        return {
            messagesRelayed: this.messagesRelayed,
            bytesTransferred: this.bytesTransferred,
        };
    }

    getRateLimitStats(): RateLimitStats {
        return {
            hits: this.rateLimitHits,
            blocked: this.rateLimitBlocked,
        };
    }

    getAggregatedStats(sessionInfo: SessionInfo): AggregatedStats {
        return {
            relay: this.getRelayStats(),
            sessions: sessionInfo,
            rateLimit: this.getRateLimitStats(),
            oldestConnectionAge: this.calculateAge(sessionInfo.oldestConnectionAt),
            newestConnectionAge: this.calculateAge(sessionInfo.newestConnectionAt),
        };
    }

    reset(): void {
        this.messagesRelayed = 0;
        this.bytesTransferred = 0;
        this.rateLimitHits = 0;
        this.rateLimitBlocked = 0;
    }

    private setupListeners(): void {
        this.emitter.on(StatsEventType.MESSAGE_RELAYED, (event: StatsEvent) => {
            if (event.type === StatsEventType.MESSAGE_RELAYED) {
                this.messagesRelayed++;
                this.bytesTransferred += event.sizeBytes;
            }
        });

        this.emitter.on(StatsEventType.RATE_LIMIT_HIT, () => {
            this.rateLimitHits++;
        });

        this.emitter.on(StatsEventType.RATE_LIMIT_BLOCKED, () => {
            this.rateLimitBlocked++;
        });
    }

    private calculateAge(date: Date | null): number {
        if (!date) return 0;
        return Math.floor((Date.now() - date.getTime()) / 1000);
    }
}

export function createStatsCollector(): StatsCollector {
    return new StatsCollector();
}
