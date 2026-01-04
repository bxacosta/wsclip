import type { StatsCollector } from "@/server/stats";

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

export type RateLimiterConfig = Readonly<{
    readonly maxConnections: number;
    readonly windowSec: number;
}>;

export type RateLimiterDependencies = Readonly<{
    config: RateLimiterConfig;
    statsCollector: StatsCollector;
}>;

export type RateLimiterInfo = {
    trackedIPs: number;
    maxConnections: number;
    windowMs: number;
};

export type CheckLimitResult =
    | { allowed: true; ip: string; currentCount: number }
    | { allowed: false; ip: string; currentCount: number; limit: number };

const CLEANUP_INTERVAL_MS = 60_000;

export class RateLimiter {
    private readonly config: RateLimiterConfig;
    private readonly statsCollector: StatsCollector;
    private readonly windowMs: number;
    private readonly limits = new Map<string, RateLimitEntry>();
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor(deps: RateLimiterDependencies) {
        this.config = deps.config;
        this.statsCollector = deps.statsCollector;
        this.windowMs = deps.config.windowSec * 1000;
        this.startCleanup();
    }

    checkLimit(ip: string): CheckLimitResult {
        const now = Date.now();
        const entry = this.limits.get(ip);

        this.statsCollector.emit({ type: "rate_limit_hit", ip });

        if (!entry || now >= entry.resetAt) {
            this.limits.set(ip, {
                count: 1,
                resetAt: now + this.windowMs,
            });
            return { allowed: true, ip, currentCount: 1 };
        }

        entry.count++;

        if (entry.count > this.config.maxConnections) {
            this.statsCollector.emit({ type: "rate_limit_blocked", ip });
            return {
                allowed: false,
                ip,
                currentCount: entry.count,
                limit: this.config.maxConnections,
            };
        }

        return { allowed: true, ip, currentCount: entry.count };
    }

    stop(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.limits.clear();
    }

    getInfo(): RateLimiterInfo {
        return {
            trackedIPs: this.limits.size,
            maxConnections: this.config.maxConnections,
            windowMs: this.windowMs,
        };
    }

    cleanup(): { entriesRemoved: number; remainingEntries: number } {
        const now = Date.now();
        let entriesRemoved = 0;

        for (const [ip, entry] of this.limits) {
            if (now >= entry.resetAt) {
                this.limits.delete(ip);
                entriesRemoved++;
            }
        }

        return { entriesRemoved, remainingEntries: this.limits.size };
    }

    private startCleanup(): void {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, CLEANUP_INTERVAL_MS);
    }
}

export function createRateLimiter(deps: RateLimiterDependencies): RateLimiter {
    return new RateLimiter(deps);
}
