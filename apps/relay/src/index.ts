import { PROTOCOL_CONFIG } from "@/protocol/constants";
import { startServer } from "@/server";
import { getChannelManager, initChannelManager } from "@/server/channel";
import { loadEnv } from "@/server/config/env";
import { initLogger } from "@/server/config/logger";
import { setChannelManagerGetter } from "@/server/errors";
import { initRateLimiter } from "@/server/security";
import { setupShutdownHandlers } from "@/shutdown";

const env = loadEnv();
initLogger(env);

initRateLimiter({
    maxConnections: env.RATE_LIMIT_MAX,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
});

initChannelManager({
    maxChannels: env.MAX_CHANNELS,
    peersPerChannel: PROTOCOL_CONFIG.PEERS_PER_CHANNEL,
});

setChannelManagerGetter(getChannelManager);

const server = startServer(env);

setupShutdownHandlers(server);
