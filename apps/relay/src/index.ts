import { startServer } from "@/server";
import { getChannelManager, initChannelManager } from "@/server/channel";
import { config, initConfig, initLogger } from "@/server/config";
import { setChannelManagerGetter } from "@/server/errors";
import { initRateLimiter } from "@/server/security";
import { setupShutdownHandlers } from "@/shutdown";

initConfig();
initLogger();

initRateLimiter({
    maxConnections: config.rateLimitMax,
    windowSec: config.rateLimitWindowSec,
});

initChannelManager({
    maxChannels: config.maxChannels,
    peersPerChannel: config.peersPerChannel,
});

setChannelManagerGetter(getChannelManager);

const server = startServer();

setupShutdownHandlers(server);
