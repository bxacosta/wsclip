import pino from "pino";
import type { Env } from "@/server/config/env.ts";

export type Logger = pino.Logger;

let logger: Logger;

export function initLogger(env: Env): Logger {
    logger = pino({
        level: env.LOG_LEVEL,

        // Add error serializer for better stack traces
        serializers: {
            err: pino.stdSerializers.err,
        },

        ...(env.NODE_ENV === "development"
            ? {
                  transport: {
                      target: "pino-pretty",
                      options: {
                          colorize: true,
                          translateTime: "yyyy-mm-dd'T'HH:MM:ss.l'Z'",
                          ignore: "pid,hostname",
                      },
                  },
              }
            : {
                  formatters: {
                      level: label => ({ level: label }),
                  },
                  timestamp: pino.stdTimeFunctions.isoTime,
              }),
    });

    return logger;
}

export function getLogger(): Logger {
    if (!logger) {
        throw new Error("Logger not initialized. Call initLogger(env) first.");
    }
    return logger;
}

// Flush logger before shutdown to prevent log loss
export async function flushLogger(): Promise<void> {
    if (!logger) return;

    const finalLogger = logger;
    if (finalLogger.flush) {
        await new Promise<void>(resolve => {
            finalLogger.flush((err?: Error) => {
                if (err) console.error("Logger flush error:", err);
                resolve();
            });
        });
    }
}
