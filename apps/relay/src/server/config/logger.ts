import pino from "pino";
import { getConfig } from "./loader";

export type Logger = pino.Logger;

let logger: Logger;

export function initLogger(): Logger {
    const cfg = getConfig();

    logger = pino({
        level: cfg.logLevel,

        serializers: {
            err: pino.stdSerializers.err,
        },

        ...(cfg.nodeEnv === "development"
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
        throw new Error("Logger not initialized. Call initLogger() first.");
    }
    return logger;
}

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
