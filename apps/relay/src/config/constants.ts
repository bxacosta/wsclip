/**
 * Application constants
 */

// Session limits
export const MAX_PEERS_PER_SESSION = 2;

// Token settings
export const TOKEN_LENGTH = 12;
export const TOKEN_EXPIRY_SECONDS = 300; // 5 minutes (informational only, sent to client)

// Message types (const assertion for type safety)
export const MESSAGE_TYPES = {
  AUTH: 'auth',
  AUTH_RESPONSE: 'auth_response',
  TEXT_MESSAGE: 'text_message',
  CLIPBOARD_TEXT: 'clipboard_text',
  PEER_CONNECTED: 'peer_connected',
  PEER_DISCONNECTED: 'peer_disconnected',
  HEARTBEAT: 'heartbeat',
  ERROR: 'error',
} as const;
