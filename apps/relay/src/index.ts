import { startServer } from "@/server";
import { initContext } from "@/server/core/context";
import { setupShutdown } from "@/shutdown";

initContext();
const server = startServer();
setupShutdown(server);
