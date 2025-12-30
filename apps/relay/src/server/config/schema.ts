import { z } from "zod";

const DEFAULTS = {
    port: 3000,
    maxMessageSize: 104_857_600, // 100 MiB
    logLevel: "info" as const,
    nodeEnv: "development" as const,
    idleTimeoutSec: 60,
    rateLimitMax: 10,
    rateLimitWindowSec: 60,
    compression: false,
    maxChannels: 4,
} as const;

const PROTOCOL = {
    peersPerChannel: 2,
} as const;

const envSchema = z.object({
    SERVER_SECRET: z.string().min(1, "SERVER_SECRET is required"),
    PORT: z.coerce.number().default(DEFAULTS.port),
    MAX_MESSAGE_SIZE: z.coerce.number().default(DEFAULTS.maxMessageSize),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default(DEFAULTS.logLevel),
    NODE_ENV: z.enum(["development", "production", "test"]).default(DEFAULTS.nodeEnv),
    IDLE_TIMEOUT_SEC: z.coerce.number().default(DEFAULTS.idleTimeoutSec),
    RATE_LIMIT_MAX: z.coerce.number().default(DEFAULTS.rateLimitMax),
    RATE_LIMIT_WINDOW_SEC: z.coerce.number().default(DEFAULTS.rateLimitWindowSec),
    COMPRESSION: z.coerce.boolean().default(DEFAULTS.compression),
    MAX_CHANNELS: z.coerce.number().default(DEFAULTS.maxChannels),
});

export interface Config {
    readonly port: number;
    readonly serverSecret: string;
    readonly nodeEnv: "development" | "production" | "test";
    readonly logLevel: "debug" | "info" | "warn" | "error";
    readonly maxMessageSize: number;
    readonly idleTimeoutSec: number;
    readonly compression: boolean;
    readonly rateLimitMax: number;
    readonly rateLimitWindowSec: number;
    readonly maxChannels: number;
    readonly peersPerChannel: number;
}

export function parseConfig(): Config {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error("Invalid environment variables:");
        for (const issue of result.error.issues) {
            console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
        }
        process.exit(1);
    }

    const env = result.data;

    return Object.freeze({
        port: env.PORT,
        serverSecret: env.SERVER_SECRET,
        nodeEnv: env.NODE_ENV,
        logLevel: env.LOG_LEVEL,
        maxMessageSize: env.MAX_MESSAGE_SIZE,
        idleTimeoutSec: env.IDLE_TIMEOUT_SEC,
        compression: env.COMPRESSION,
        rateLimitMax: env.RATE_LIMIT_MAX,
        rateLimitWindowSec: env.RATE_LIMIT_WINDOW_SEC,
        maxChannels: env.MAX_CHANNELS,
        peersPerChannel: PROTOCOL.peersPerChannel,
    });
}
