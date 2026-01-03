import type { z } from "zod";
import type {
    ackMessageSchema,
    controlMessageSchema,
    dataMessageSchema,
    errorMessageSchema,
    peerMessageSchema,
    peerSchema,
    readyMessageSchema,
} from "@/protocol/messages";

export type ControlMessage = z.infer<typeof controlMessageSchema>;
export type DataMessage = z.infer<typeof dataMessageSchema>;
export type AckMessage = z.infer<typeof ackMessageSchema>;

export type ReadyMessage = z.infer<typeof readyMessageSchema>;
export type PeerMessage = z.infer<typeof peerMessageSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;

export type Peer = z.infer<typeof peerSchema>;
export type CRSPMessage = ControlMessage | DataMessage | AckMessage | ReadyMessage | PeerMessage | ErrorMessage;
