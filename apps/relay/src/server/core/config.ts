import { z } from "zod";
import { type Config, Environment, LogLevel } from "@/server/core/types";

const DEFAULTS: Omit<Config, "serverSecret"> = {
    port: 3000,
    maxMessageSize: 104_857_600, // 100 MiB
    logLevel: LogLevel.INFO,
    nodeEnv: Environment.DEVELOPMENT,
    idleTimeoutSec: 60,
    rateLimitMax: 10,
    rateLimitWindowSec: 60,
    compression: false,
    maxSessions: 4,
    connectionsPerSession: 2,
} as const;

const envSchema = z.object({
    SERVER_SECRET: z.string().min(1, "SERVER_SECRET is required"),
    PORT: z.coerce.number().default(DEFAULTS.port),
    MAX_MESSAGE_SIZE: z.coerce.number().default(DEFAULTS.maxMessageSize),
    LOG_LEVEL: z.enum(LogLevel).default(DEFAULTS.logLevel),
    NODE_ENV: z.enum(Environment).default(DEFAULTS.nodeEnv),
    IDLE_TIMEOUT_SEC: z.coerce.number().default(DEFAULTS.idleTimeoutSec),
    RATE_LIMIT_MAX: z.coerce.number().default(DEFAULTS.rateLimitMax),
    RATE_LIMIT_WINDOW_SEC: z.coerce.number().default(DEFAULTS.rateLimitWindowSec),
    COMPRESSION: z.coerce.boolean().default(DEFAULTS.compression),
    MAX_SESSIONS: z.coerce.number().default(DEFAULTS.maxSessions),
});

export function createConfig(): Config {
    const { success, data, error } = envSchema.safeParse(process.env);

    if (success) {
        return Object.freeze({
            port: data.PORT,
            serverSecret: data.SERVER_SECRET,
            nodeEnv: data.NODE_ENV,
            logLevel: data.LOG_LEVEL,
            maxMessageSize: data.MAX_MESSAGE_SIZE,
            idleTimeoutSec: data.IDLE_TIMEOUT_SEC,
            compression: data.COMPRESSION,
            rateLimitMax: data.RATE_LIMIT_MAX,
            rateLimitWindowSec: data.RATE_LIMIT_WINDOW_SEC,
            maxSessions: data.MAX_SESSIONS,
            connectionsPerSession: DEFAULTS.connectionsPerSession,
        });
    }

    console.error("Invalid environment variables:");
    for (const issue of error.issues) {
        console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
}
