import { z } from "zod";

const envSchema = z.object({
    SERVER_SECRET: z.string().min(1, "SERVER_SECRET is required"),
    PORT: z.coerce.number().default(3000),
    MAX_MESSAGE_SIZE: z.coerce.number().default(104857600),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    IDLE_TIMEOUT: z.coerce.number().default(120),
    RATE_LIMIT_MAX: z.coerce.number().default(100),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
    COMPRESSION_ENABLED: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error("Invalid environment variables:");
        for (const issue of result.error.issues) {
            console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
        }
        process.exit(1);
    }

    return result.data;
}
