import { getLogger } from "@/server/config";

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

export interface RateLimiterConfig {
    maxConnections: number;
    windowSec: number;
}

class RateLimiter {
    private limits: Map<string, RateLimitEntry> = new Map();
    private readonly maxConnections: number;
    private readonly windowMs: number;
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor(config: RateLimiterConfig) {
        this.maxConnections = config.maxConnections;
        this.windowMs = config.windowSec * 1000;
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

        if (entry.count > this.maxConnections) {
            const logger = getLogger();
            logger.warn(
                {
                    ip,
                    count: entry.count,
                    limit: this.maxConnections,
                },
                "Rate limit exceeded",
            );
            return false;
        }

        return true;
    }

    private startCleanup(): void {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let cleaned = 0;

            for (const [ip, entry] of this.limits.entries()) {
                if (now >= entry.resetAt) {
                    this.limits.delete(ip);
                    cleaned++;
                }
            }

            if (cleaned > 0) {
                const logger = getLogger();
                logger.debug(
                    {
                        entriesRemoved: cleaned,
                        remainingEntries: this.limits.size,
                    },
                    "Rate limiter cleanup completed",
                );
            }
        }, 60000);
    }

    stop(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    getStats() {
        return {
            trackedIPs: this.limits.size,
            maxConnections: this.maxConnections,
            windowMs: this.windowMs,
        };
    }
}

let rateLimiterInstance: RateLimiter | null = null;

export function initRateLimiter(config: RateLimiterConfig): void {
    if (!rateLimiterInstance) {
        rateLimiterInstance = new RateLimiter(config);
    }
}

export function getRateLimiter(): RateLimiter {
    if (!rateLimiterInstance) {
        throw new Error("RateLimiter not initialized. Call initRateLimiter(config) first.");
    }
    return rateLimiterInstance;
}
