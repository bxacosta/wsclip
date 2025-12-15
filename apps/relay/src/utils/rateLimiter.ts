import { getLogger } from "@/config/logger";

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

class RateLimiter {
    private limits: Map<string, RateLimitEntry> = new Map();
    private readonly maxConnections: number;
    private readonly windowMs: number;
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(maxConnections = 10, windowMs = 60000) {
        this.maxConnections = maxConnections;
        this.windowMs = windowMs;

        // Start cleanup interval (every minute)
        this.startCleanup();
    }

    /**
     * Check if IP is rate limited
     * Returns true if allowed, false if rate limited
     */
    checkLimit(ip: string): boolean {
        const now = Date.now();
        const entry = this.limits.get(ip);

        // No entry or expired, create new
        if (!entry || now >= entry.resetAt) {
            this.limits.set(ip, {
                count: 1,
                resetAt: now + this.windowMs,
            });
            return true;
        }

        // Increment count
        entry.count++;

        // Check if exceeded
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

    /**
     * Start cleanup interval to remove expired entries
     */
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
        }, 60000); // Every minute
    }

    /**
     * Stop cleanup interval
     */
    stop(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Get current statistics
     */
    getStats() {
        return {
            trackedIPs: this.limits.size,
            maxConnectionsPerMinute: this.maxConnections,
            windowMs: this.windowMs,
        };
    }
}

// Singleton instance
export const rateLimiter = new RateLimiter(10, 60000);
