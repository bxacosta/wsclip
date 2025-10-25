/**
 * Validation utilities
 */

import type { WebSocketMessage, MessageType } from '../models/messages';

export class Validators {
  /**
   * Validate token format (XXXX-YYYY-ZZZZ)
   */
  static isValidToken(token: string): boolean {
    return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(token);
  }

  /**
   * Validate peer ID
   */
  static isValidPeerId(peerId: string): boolean {
    return peerId.length > 0 && peerId.length < 50;
  }

  /**
   * Validate WebSocket upgrade header
   */
  static isWebSocketUpgrade(request: Request): boolean {
    const upgradeHeader = request.headers.get('Upgrade');
    return upgradeHeader === 'websocket';
  }

  /**
   * Validate WebSocket message format (type guard)
   */
  static isValidMessage(data: unknown): data is WebSocketMessage {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const obj = data as Record<string, unknown>;

    // Validate 'type' field exists and is a valid MessageType
    if (typeof obj.type !== 'string') {
      return false;
    }

    const validTypes: MessageType[] = [
      'auth',
      'auth_response',
      'text_message',
      'clipboard_text',
      'peer_connected',
      'peer_disconnected',
      'heartbeat',
      'error',
    ];

    return validTypes.includes(obj.type as MessageType);
  }
}
