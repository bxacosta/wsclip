/**
 * WebSocket message types for clipboard sync relay
 */

// Message types that flow through WebSocket
export type MessageType =
  | 'auth'
  | 'auth_response'
  | 'text_message'
  | 'clipboard_text'  // Phase 2
  | 'peer_connected'
  | 'peer_disconnected'
  | 'error';

// Base message interface
export interface BaseMessage {
  type: MessageType;
  timestamp?: string;
}

// Authentication request from client
export interface AuthMessage extends BaseMessage {
  type: 'auth';
  token: string;
  peer_id: string;
}

// Authentication response to client
export interface AuthResponseMessage extends BaseMessage {
  type: 'auth_response';
  success: boolean;
  session_id?: string;
  paired_peer?: string | null;
  error?: string;
}

// Text message between peers
export interface TextMessage extends BaseMessage {
  type: 'text_message';
  from: string;
  content: string;
  message_id: string;
}

// Clipboard text content message (Phase 2)
export interface ClipboardTextMessage extends BaseMessage {
  type: 'clipboard_text';
  from: string;
  content: string;
  message_id: string;
  source: 'auto' | 'manual';
}

// Peer connection events
export interface PeerEventMessage extends BaseMessage {
  type: 'peer_connected' | 'peer_disconnected';
  peer_id: string;
}

// Error message
export interface ErrorMessage extends BaseMessage {
  type: 'error';
  code: 'TOKEN_INVALID' | 'PEER_LIMIT' | 'ALREADY_CONNECTED' | 'INTERNAL_ERROR';
  message: string;
}

// Union type for all messages
export type WebSocketMessage =
  | AuthMessage
  | AuthResponseMessage
  | TextMessage
  | ClipboardTextMessage  // Phase 2
  | PeerEventMessage
  | ErrorMessage;

// Environment bindings
export interface Env {
  CLIPBOARD_SESSION: DurableObjectNamespace;
}
