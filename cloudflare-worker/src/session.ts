import { DurableObject } from 'cloudflare:workers';
import type {
  WebSocketMessage,
  AuthMessage,
  TextMessage,
  ClipboardTextMessage,
  ErrorMessage,
  AuthResponseMessage,
  Env,
} from './types';

/**
 * ClipboardSession Durable Object
 * Manages WebSocket connections for a pair of peers
 * Uses WebSocket Hibernation API for efficiency
 */
export class ClipboardSession extends DurableObject<Env> {
  private token: string = '';
  // Note: With Hibernation API, we use ctx.getWebSockets() instead of manual Map
  // The peerId is stored in WebSocket tags

  /**
   * HTTP fetch handler - called when WebSocket upgrade is requested
   */
  async fetch(request: Request): Promise<Response> {
    // Check if this is a WebSocket upgrade request
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // Parse URL to get token and peer_id
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const peerId = url.searchParams.get('peer_id');

    // Validate parameters
    if (!token || !peerId) {
      return new Response('Missing token or peer_id', { status: 400 });
    }

    // Store token on first connection
    if (!this.token) {
      this.token = token;
    }

    // Validate token matches BEFORE accepting WebSocket
    if (this.token !== token) {
      return new Response('Invalid token', { status: 403 });
    }

    // Check for duplicate peer_id and collect unique peer IDs BEFORE accepting
    const currentPeers = this.ctx.getWebSockets();
    const uniquePeerIds = new Set<string>();

    for (const ws of currentPeers) {
      const tags = this.ctx.getTags(ws);
      if (tags.length > 0) {
        const existingPeerId = tags[0];

        // Check for duplicate peer_id (strict validation)
        if (existingPeerId === peerId) {
          return new Response('This peer_id is already connected to this session', { status: 409 });
        }

        uniquePeerIds.add(existingPeerId);
      }
    }

    // If this is a new peer ID and we already have 2 unique peers, reject
    if (uniquePeerIds.size >= 2 && !uniquePeerIds.has(peerId)) {
      return new Response('Peer limit reached (maximum 2 peers per session)', { status: 429 });
    }

    // All validations passed, now accept WebSocket
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
   * Called when WebSocket message is received (Hibernation API)
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      // Parse message
      const data = typeof message === 'string'
        ? JSON.parse(message)
        : JSON.parse(new TextDecoder().decode(message));

      const msg = data as WebSocketMessage;

      // Handle different message types
      switch (msg.type) {
        case 'auth':
          await this.handleAuth(ws, msg as AuthMessage);
          break;

        case 'text_message':
          await this.handleTextMessage(ws, msg as TextMessage);
          break;

        case 'clipboard_text':
          await this.handleClipboardText(ws, msg as ClipboardTextMessage);
          break;

        default:
          this.sendError(ws, 'INTERNAL_ERROR', `Unknown message type: ${msg.type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.sendError(ws, 'INTERNAL_ERROR', 'Failed to process message');
    }
  }

  /**
   * Called when WebSocket is closed (Hibernation API)
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    // Get peer ID from WebSocket tags
    const tags = this.ctx.getTags(ws);
    const disconnectedPeerId = tags[0] || 'unknown';

    // Notify other peer about disconnection
    this.broadcastToOthers(ws, {
      type: 'peer_disconnected',
      peer_id: disconnectedPeerId,
      timestamp: new Date().toISOString(),
    });

    console.log(`Peer disconnected: ${disconnectedPeerId}, code: ${code}, reason: ${reason}`);
  }

  /**
   * Called when WebSocket encounters an error (Hibernation API)
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error);
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
      this.sendError(ws, 'INTERNAL_ERROR', 'Peer ID mismatch');
      return;
    }

    // Send auth response
    const response: AuthResponseMessage = {
      type: 'auth_response',
      success: true,
      session_id: this.ctx.id.toString(),
      paired_peer: this.getOtherPeerId(peer_id),
      timestamp: new Date().toISOString(),
    };

    ws.send(JSON.stringify(response));

    // Notify other peer about new connection
    this.broadcastToOthers(ws, {
      type: 'peer_connected',
      peer_id,
      timestamp: new Date().toISOString(),
    });

    const totalPeers = this.ctx.getWebSockets().length;
    console.log(`Peer authenticated: ${peer_id}, total peers: ${totalPeers}`);
  }

  /**
   * Handle text message relay
   */
  private async handleTextMessage(ws: WebSocket, msg: TextMessage): Promise<void> {
    // Simply relay to other peer
    this.broadcastToOthers(ws, msg);
  }

  /**
   * Handle clipboard text message relay (Phase 2)
   */
  private async handleClipboardText(ws: WebSocket, msg: ClipboardTextMessage): Promise<void> {
    // Simply relay to other peer
    this.broadcastToOthers(ws, msg);

    console.log(`Clipboard relay: ${msg.from} -> peer (${msg.source}, ${msg.content.length} chars)`);
  }

  /**
   * Send error message to client
   */
  private sendError(ws: WebSocket, code: ErrorMessage['code'], message: string): void {
    const error: ErrorMessage = {
      type: 'error',
      code,
      message,
      timestamp: new Date().toISOString(),
    };

    ws.send(JSON.stringify(error));
  }

  /**
   * Broadcast message to all peers except sender
   */
  private broadcastToOthers(sender: WebSocket, message: Partial<WebSocketMessage>): void {
    const msgStr = JSON.stringify(message);
    const allWebSockets = this.ctx.getWebSockets();

    for (const ws of allWebSockets) {
      if (ws !== sender) {
        try {
          const tags = this.ctx.getTags(ws);
          const peerId = tags[0] || 'unknown';
          ws.send(msgStr);
          console.log(`Sent message to peer: ${peerId}`);
        } catch (error) {
          const tags = this.ctx.getTags(ws);
          const peerId = tags[0] || 'unknown';
          console.error(`Failed to send to peer ${peerId}:`, error);
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
