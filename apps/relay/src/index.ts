import { startServer } from "@/server";
import { initContext } from "@/server/core/context.ts";
import { setupShutdownHandlers } from "@/shutdown";

initContext();

const server = startServer();

setupShutdownHandlers(server);
