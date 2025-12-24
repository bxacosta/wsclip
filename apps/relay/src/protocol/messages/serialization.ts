import type { BaseMessage } from "@/protocol/types";

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
