import { type Config, parseConfig } from "./schema";

let configInstance: Config | null = null;

export function initConfig(): Config {
    if (configInstance !== null) {
        throw new Error("Configuration has already been initialized");
    }

    configInstance = parseConfig();
    return configInstance;
}

export function getConfig(): Config {
    if (configInstance === null) {
        throw new Error("Configuration has not been initialized. Call initConfig() first.");
    }

    return configInstance;
}

export const config: Config = new Proxy({} as Config, {
    get(_target, prop: keyof Config) {
        return getConfig()[prop];
    },
    set() {
        throw new Error("Configuration is immutable");
    },
});
