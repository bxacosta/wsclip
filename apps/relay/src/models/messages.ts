/**
 * WebSocket message type definitions
 */

export type MessageType =
  | 'auth'
  | 'auth_response'
  | 'text_message'
  | 'clipboard_text'
  | 'peer_connected'
  | 'peer_disconnected'
  | 'heartbeat'
  | 'error';

export type ErrorCode =
  | 'TOKEN_INVALID'
  | 'PEER_LIMIT'
  | 'ALREADY_CONNECTED'
  | 'INTERNAL_ERROR';

/**
 * Base message interface
 */
export interface BaseMessage {
  type: MessageType;
  timestamp: string;
}

/**
 * Authentication message from client
 */
export interface AuthMessage extends BaseMessage {
  type: 'auth';
  token: string;
  peer_id: string;
}

/**
 * Authentication response from server
 */
export interface AuthResponseMessage extends BaseMessage {
  type: 'auth_response';
  success: boolean;
  session_id: string;
  paired_peer: string | null;
  error?: string;
}

/**
 * Text message between peers
 */
export interface TextMessage extends BaseMessage {
  type: 'text_message';
  from: string;
  content: string;
  message_id: string;
}

/**
 * Clipboard text message
 */
export interface ClipboardTextMessage extends BaseMessage {
  type: 'clipboard_text';
  from: string;
  content: string;
  message_id: string;
  source: 'auto' | 'manual';
}

/**
 * Peer connection/disconnection event
 */
export interface PeerEventMessage extends BaseMessage {
  type: 'peer_connected' | 'peer_disconnected';
  peer_id: string;
}

/**
 * Heartbeat message to keep connection alive
 */
export interface HeartbeatMessage extends BaseMessage {
  type: 'heartbeat';
  peer_id: string;
}

/**
 * Error message
 */
export interface ErrorMessage extends BaseMessage {
  type: 'error';
  code: ErrorCode;
  message: string;
}

/**
 * Union type for all messages
 */
export type WebSocketMessage =
  | AuthMessage
  | AuthResponseMessage
  | TextMessage
  | ClipboardTextMessage
  | PeerEventMessage
  | HeartbeatMessage
  | ErrorMessage;
