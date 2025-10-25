/**
 * ClipboardSession Durable Object
 * Manages WebSocket connections for a pair of peers
 */

import { DurableObject } from 'cloudflare:workers';
import { SessionService } from '../services/session.service';
import { Validators } from '../utils/validators';
import { ErrorHandler } from '../utils/errors';
import { Logger } from '../utils/logger';
import { MAX_PEERS_PER_SESSION, MESSAGE_TYPES } from '../config/constants';
import type {
  WebSocketMessage,
  AuthMessage,
  TextMessage,
  ClipboardTextMessage,
  AuthResponseMessage,
  PeerEventMessage,
} from '../models/messages';

export class SessionDurableObject extends DurableObject {
  private token: string = '';

  /**
   * HTTP fetch handler - called when WebSocket upgrade is requested
   */
  async fetch(request: Request): Promise<Response> {
    // Check if this is a WebSocket upgrade request
    if (!Validators.isWebSocketUpgrade(request)) {
      return ErrorHandler.httpError('Expected WebSocket upgrade', 426);
    }

    // Parse URL to get token and peer_id
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const peerId = url.searchParams.get('peer_id');

    // Validate parameters
    if (!token || !peerId) {
      return ErrorHandler.httpError('Missing token or peer_id', 400);
    }

    // Validate peer_id (token already validated in index.ts)
    if (!peerId || peerId.length === 0) {
      return ErrorHandler.httpError('Invalid peer_id', 400);
    }

    // Store token on first connection
    if (!this.token) {
      this.token = token;
    }

    // Validate token matches
    if (this.token !== token) {
      return ErrorHandler.httpError('Invalid token', 403);
    }

    // Get current peers and check limits
    const currentPeers = this.ctx.getWebSockets();

    // Extract peer IDs using functional approach
    const existingPeerIds = currentPeers
      .map(ws => this.ctx.getTags(ws)[0])
      .filter((id): id is string => id !== undefined);

    const uniquePeerIds = new Set(existingPeerIds);

    // Check for duplicate peer_id
    if (uniquePeerIds.has(peerId)) {
      return ErrorHandler.httpError(
        'This peer_id is already connected to this session',
        409
      );
    }

    // Check if session is full
    if (!SessionService.canAcceptPeer(uniquePeerIds, peerId)) {
      return ErrorHandler.httpError(
        `Peer limit reached (maximum ${MAX_PEERS_PER_SESSION} peers per session)`,
        429
      );
    }

    // All validations passed, accept WebSocket
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept WebSocket with Hibernation API
    this.ctx.acceptWebSocket(server, [peerId]);

    // Return WebSocket response
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Called when WebSocket message is received
   */
  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    try {
      // Parse message
      const data =
        typeof message === 'string'
          ? JSON.parse(message)
          : JSON.parse(new TextDecoder().decode(message));

      // Validate message format
      if (!Validators.isValidMessage(data)) {
        ErrorHandler.sendError(ws, 'INTERNAL_ERROR', 'Invalid message format');
        return;
      }

      const msg = data;

      // Handle different message types
      switch (msg.type) {
        case MESSAGE_TYPES.AUTH:
          await this.handleAuth(ws, msg as AuthMessage);
          break;

        case MESSAGE_TYPES.TEXT_MESSAGE:
          await this.handleTextMessage(ws, msg as TextMessage);
          break;

        case MESSAGE_TYPES.CLIPBOARD_TEXT:
          await this.handleClipboardText(ws, msg as ClipboardTextMessage);
          break;

        case MESSAGE_TYPES.HEARTBEAT:
          // Heartbeat received - connection is alive, no action needed
          // Just receiving it keeps the Durable Object awake
          break;

        default:
          ErrorHandler.sendError(
            ws,
            'INTERNAL_ERROR',
            `Unknown message type: ${msg.type}`
          );
      }
    } catch (error) {
      Logger.error('Error handling message', error);
      ErrorHandler.sendError(ws, 'INTERNAL_ERROR', 'Failed to process message');
    }
  }

  /**
   * Called when WebSocket is closed
   */
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    // Get peer ID from WebSocket tags
    const tags = this.ctx.getTags(ws);
    const disconnectedPeerId = tags[0] || 'unknown';

    // Notify other peer about disconnection
    const disconnectEvent: PeerEventMessage = {
      type: MESSAGE_TYPES.PEER_DISCONNECTED,
      peer_id: disconnectedPeerId,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToOthers(ws, disconnectEvent);

    Logger.info('Peer disconnected', {
      peerId: disconnectedPeerId,
      code,
      reason,
    });
  }

  /**
   * Called when WebSocket encounters an error
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    Logger.error('WebSocket error', error);
  }

  /**
   * Handle authentication message
   */
  private async handleAuth(ws: WebSocket, msg: AuthMessage): Promise<void> {
    const { token, peer_id } = msg;

    // Get current peer ID from tags
    const tags = this.ctx.getTags(ws);
    const currentPeerId = tags[0];

    // Verify peer_id matches what was provided during connection
    if (currentPeerId !== peer_id) {
      ErrorHandler.sendError(ws, 'INTERNAL_ERROR', 'Peer ID mismatch');
      return;
    }

    // Send auth response
    const response: AuthResponseMessage = {
      type: MESSAGE_TYPES.AUTH_RESPONSE,
      success: true,
      session_id: this.ctx.id.toString(),
      paired_peer: this.getOtherPeerId(peer_id),
      timestamp: new Date().toISOString(),
    };

    ws.send(JSON.stringify(response));

    // Notify other peer about new connection
    const connectEvent: PeerEventMessage = {
      type: MESSAGE_TYPES.PEER_CONNECTED,
      peer_id,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToOthers(ws, connectEvent);

    const totalPeers = this.ctx.getWebSockets().length;
    Logger.info('Peer authenticated', { peerId: peer_id, totalPeers });
  }

  /**
   * Handle text message relay
   */
  private async handleTextMessage(ws: WebSocket, msg: TextMessage): Promise<void> {
    this.broadcastToOthers(ws, msg);
  }

  /**
   * Handle clipboard text message relay
   */
  private async handleClipboardText(
    ws: WebSocket,
    msg: ClipboardTextMessage
  ): Promise<void> {
    this.broadcastToOthers(ws, msg);

    Logger.debug('Clipboard relay', {
      from: msg.from,
      source: msg.source,
      contentLength: msg.content.length,
    });
  }

  /**
   * Broadcast message to all peers except sender
   */
  private broadcastToOthers(
    sender: WebSocket,
    message: WebSocketMessage
  ): void {
    const msgStr = JSON.stringify(message);
    const allWebSockets = this.ctx.getWebSockets();

    for (const ws of allWebSockets) {
      if (ws !== sender) {
        const tags = this.ctx.getTags(ws);
        const peerId = tags[0] || 'unknown';

        try {
          ws.send(msgStr);
          Logger.debug('Sent message to peer', { peerId });
        } catch (error) {
          Logger.error('Failed to send to peer', error, { peerId });
        }
      }
    }
  }

  /**
   * Get the other peer's ID in the session
   */
  private getOtherPeerId(currentPeerId: string): string | null {
    const allWebSockets = this.ctx.getWebSockets();

    for (const ws of allWebSockets) {
      const tags = this.ctx.getTags(ws);
      const peerId = tags[0];

      if (peerId && peerId !== currentPeerId) {
        return peerId;
      }
    }

    return null;
  }
}
