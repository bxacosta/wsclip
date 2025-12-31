import type { BaseMessage } from "@/protocol";

export function serializeMessage(message: BaseMessage): string {
    return JSON.stringify(message);
}

export function parseMessage(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function getTimestamp(): string {
    return new Date().toISOString();
}
