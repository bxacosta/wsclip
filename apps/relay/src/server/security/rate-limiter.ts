import type { Logger } from "@/server/core/logger.ts";

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

export interface RateLimiterConfig {
    readonly maxConnections: number;
    readonly windowSec: number;
}

export interface RateLimiterDependencies {
    readonly config: RateLimiterConfig;
    readonly logger: Logger;
}

export interface RateLimiterStats {
    trackedIPs: number;
    maxConnections: number;
    windowMs: number;
}

const CLEANUP_INTERVAL_MS = 60_000;

export class RateLimiter {
    private readonly config: RateLimiterConfig;
    private readonly logger: Logger;
    private readonly windowMs: number;
    private readonly limits = new Map<string, RateLimitEntry>();
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor(deps: RateLimiterDependencies) {
        this.config = deps.config;
        this.logger = deps.logger;
        this.windowMs = deps.config.windowSec * 1000;
        this.startCleanup();
    }

    checkLimit(ip: string): boolean {
        const now = Date.now();
        const entry = this.limits.get(ip);

        if (!entry || now >= entry.resetAt) {
            this.limits.set(ip, {
                count: 1,
                resetAt: now + this.windowMs,
            });
            return true;
        }

        entry.count++;

        if (entry.count > this.config.maxConnections) {
            this.logger.warn({ ip, count: entry.count, limit: this.config.maxConnections }, "Rate limit exceeded");
            return false;
        }

        return true;
    }

    stop(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    getStats(): RateLimiterStats {
        return {
            trackedIPs: this.limits.size,
            maxConnections: this.config.maxConnections,
            windowMs: this.windowMs,
        };
    }

    private startCleanup(): void {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, CLEANUP_INTERVAL_MS);
    }

    private cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [ip, entry] of this.limits) {
            if (now >= entry.resetAt) {
                this.limits.delete(ip);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logger.debug(
                { entriesRemoved: cleaned, remainingEntries: this.limits.size },
                "Rate limiter cleanup completed",
            );
        }
    }
}

export function createRateLimiter(deps: RateLimiterDependencies): RateLimiter {
    return new RateLimiter(deps);
}
