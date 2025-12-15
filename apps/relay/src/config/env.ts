import { z } from "zod";

const envSchema = z.object({
    SERVER_SECRET: z.string().min(1, "SERVER_SECRET is required"),
    PORT: z.coerce.number().default(3000),
    MAX_MESSAGE_SIZE: z.coerce.number().default(104857600),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    IDLE_TIMEOUT: z.coerce.number().default(60),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error("Invalid environment variables:");
        console.error(result.error.flatten().fieldErrors);
        process.exit(1);
    }

    return result.data;
}
