import type { z } from "zod";
import type {
    ackMessageSchema,
    connectionMessageSchema,
    connectionSchema,
    controlMessageSchema,
    dataMessageSchema,
    errorMessageSchema,
    readyMessageSchema,
} from "@/protocol/messages";

export type ControlMessage = z.infer<typeof controlMessageSchema>;
export type DataMessage = z.infer<typeof dataMessageSchema>;
export type AckMessage = z.infer<typeof ackMessageSchema>;

export type ReadyMessage = z.infer<typeof readyMessageSchema>;
export type ConnectionMessage = z.infer<typeof connectionMessageSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;

export type Connection = z.infer<typeof connectionSchema>;
export type CRSPMessage = ControlMessage | DataMessage | AckMessage | ReadyMessage | ConnectionMessage | ErrorMessage;
