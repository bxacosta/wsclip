import { startServer } from "@/server";
import { initContext } from "@/server/core/context.ts";
import { gracefulShutdown } from "@/shutdown";

initContext();

const server = startServer();

const handler = (signal: string) => () => gracefulShutdown(signal, server);

process.on("SIGINT", handler("SIGINT"));
process.on("SIGTERM", handler("SIGTERM"));
process.on("SIGBREAK", handler("SIGBREAK"));
