import { Hono } from 'hono';
import { ClipboardSession } from './session';
import { generateToken, isValidTokenFormat } from './auth';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

/**
 * Generate a new pairing token
 * GET /api/generate-token
 */
app.get('/api/generate-token', (c) => {
  const token = generateToken();

  return c.json({
    token,
    expires_in: 300, // 5 minutes (not enforced in Phase 1)
  });
});

/**
 * WebSocket endpoint for peer connections
 * GET /ws?token=XXXX-YYYY-ZZZZ&peer_id=peer_a
 */
app.get('/ws', async (c) => {
  const token = c.req.query('token');
  const peerId = c.req.query('peer_id');

  // Validate parameters
  if (!token || !peerId) {
    return c.text('Missing token or peer_id parameter', 400);
  }

  if (!isValidTokenFormat(token)) {
    return c.text('Invalid token format', 400);
  }

  // Get Durable Object instance by token
  // This ensures all peers with same token connect to same DO instance
  const id = c.env.CLIPBOARD_SESSION.idFromName(token);
  const stub = c.env.CLIPBOARD_SESSION.get(id);

  // Forward request to Durable Object
  return stub.fetch(c.req.raw);
});

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Root endpoint with API info
 * GET /
 */
app.get('/', (c) => {
  return c.json({
    name: 'Clipboard Sync WebSocket Relay',
    version: '1.0.0-phase1',
    endpoints: {
      generate_token: '/api/generate-token',
      websocket: '/ws?token=TOKEN&peer_id=PEER_ID',
      health: '/health',
    },
  });
});

// Export Durable Object class
export { ClipboardSession };

// Export default Worker
export default app;
