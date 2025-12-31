import pino from "pino";

import type { Config } from "@/server/core/index.ts";

export type Logger = pino.Logger;

export function createLogger(config: Config): Logger {
    return pino({
        level: config.logLevel,

        serializers: {
            err: pino.stdSerializers.err,
        },

        ...(config.nodeEnv === "development"
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
}

export async function flushLogger(logger: Logger): Promise<void> {
    return new Promise<void>(resolve => {
        logger.flush((error?: Error) => {
            if (error) console.error("Logger flush error:", error);
            resolve();
        });
    });
}
