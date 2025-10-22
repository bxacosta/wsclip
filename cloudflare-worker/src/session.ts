import { DurableObject } from 'cloudflare:workers';
import type {
  WebSocketMessage,
  AuthMessage,
  TextMessage,
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
  private peers: Map<string, WebSocket> = new Map();

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

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept WebSocket with Hibernation API
    this.ctx.acceptWebSocket(server, [peerId]);

    // Store token on first connection
    if (!this.token) {
      this.token = token;
    }

    // Validate token matches
    if (this.token !== token) {
      // Send structured error message before closing
      const errorMsg: ErrorMessage = {
        type: 'error',
        code: 'TOKEN_INVALID',
        message: 'Invalid token',
        timestamp: new Date().toISOString(),
      };
      server.send(JSON.stringify(errorMsg));
      server.close(1008, 'Invalid token');
      return new Response(null, { status: 101, webSocket: client });
    }

    // Check peer limit (max 2)
    if (this.peers.size >= 2 && !this.peers.has(peerId)) {
      // Send structured error message before closing
      const errorMsg: ErrorMessage = {
        type: 'error',
        code: 'PEER_LIMIT',
        message: 'Peer limit reached (maximum 2 peers per session)',
        timestamp: new Date().toISOString(),
      };
      server.send(JSON.stringify(errorMsg));
      server.close(1008, 'Peer limit reached');
      return new Response(null, { status: 101, webSocket: client });
    }

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
    // Find and remove peer
    let disconnectedPeerId: string | null = null;

    for (const [peerId, socket] of this.peers.entries()) {
      if (socket === ws) {
        disconnectedPeerId = peerId;
        this.peers.delete(peerId);
        break;
      }
    }

    // Notify other peer about disconnection
    if (disconnectedPeerId) {
      this.broadcastToOthers(ws, {
        type: 'peer_disconnected',
        peer_id: disconnectedPeerId,
        timestamp: new Date().toISOString(),
      });
    }

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

    // Check if peer already connected
    if (this.peers.has(peer_id)) {
      this.sendError(ws, 'ALREADY_CONNECTED', 'Peer already connected');
      return;
    }

    // Add peer to session
    this.peers.set(peer_id, ws);

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

    console.log(`Peer authenticated: ${peer_id}, total peers: ${this.peers.size}`);
  }

  /**
   * Handle text message relay
   */
  private async handleTextMessage(ws: WebSocket, msg: TextMessage): Promise<void> {
    // Simply relay to other peer
    this.broadcastToOthers(ws, msg);
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

    for (const [peerId, socket] of this.peers.entries()) {
      if (socket !== sender) {
        try {
          socket.send(msgStr);
        } catch (error) {
          console.error(`Failed to send to peer ${peerId}:`, error);
        }
      }
    }
  }

  /**
   * Get the other peer's ID in the session
   */
  private getOtherPeerId(currentPeerId: string): string | null {
    for (const peerId of this.peers.keys()) {
      if (peerId !== currentPeerId) {
        return peerId;
      }
    }
    return null;
  }
}
