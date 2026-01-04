# CRSP Server Implementation Reference

This document describes implementation-specific details of the CRSP relay server.

---

## 1. Server Configuration

### 1.1 Default Limits

The server implements the following default limits (all configurable via environment variables):

| Configuration             | Environment Variable    | Default Value     | Description                                 |
|---------------------------|-------------------------|-------------------|---------------------------------------------|
| `MAX_MESSAGE_SIZE`        | `MAX_MESSAGE_SIZE`      | 104857600 (100MB) | Maximum complete JSON message size          |
| `MAX_SESSIONS`            | `MAX_SESSIONS`          | 4                 | Maximum active sessions per server          |
| `CONNECTIONS_PER_SESSION` | N/A                     | 2                 | Connections per session (protocol-defined)* |
| `IDLE_TIMEOUT`            | `IDLE_TIMEOUT_SEC`      | 60 (seconds)      | Inactivity timeout for authenticated conns  |
| `RATE_LIMIT_MAX`          | `RATE_LIMIT_MAX`        | 10                | Max connections per IP in time window       |
| `RATE_LIMIT_WINDOW`       | `RATE_LIMIT_WINDOW_SEC` | 60 (seconds)      | Time window for rate limiting               |

*Note: `CONNECTIONS_PER_SESSION` is hardcoded to 2 in the current implementation. While the protocol specification defines
this as a protocol constraint, the architecture allows changing this value with minimal effort in future versions.

### 1.2 Environment Variables

```bash
# Required
SERVER_SECRET=your-secret-here

# Optional (with defaults shown)
PORT=3000
MAX_MESSAGE_SIZE=104857600
MAX_SESSIONS=4
IDLE_TIMEOUT_SEC=60
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW_SEC=60
LOG_LEVEL=info
NODE_ENV=development
```

### 1.3 WebSocket Connection and Authentication

**Connection URL Format**:

```
ws://host:port/ws?sessionId=<session-id>&connectionId=<connection-id>&secret=<secret>
```

**Query Parameters**:

- `sessionId` (required): 8-character alphanumeric session identifier
- `connectionId` (required): Connection identifier for this connection
- `secret` (optional): Authentication secret as query parameter fallback

**Dual Authentication Mechanism**:

The server implements dual authentication to support both standard HTTP clients and browser WebSocket clients:

1. **Primary Method - Authorization Header** (preferred):
   ```
   Authorization: Bearer your-secret-here
   ```
   - Standard HTTP authentication
   - More secure (not visible in URL)
   - Supported by most WebSocket clients

2. **Fallback Method - Query Parameter**:
   ```
   ws://host:port/ws?sessionId=xxx&connectionId=xxx&secret=your-secret-here
   ```
   - Provided for browser WebSocket API compatibility
   - Browser WebSocket API does not support custom headers
   - Less secure (visible in URL and logs)

**Validation Logic**:

- Server checks Authorization header first
- If no Bearer token found, falls back to `secret` query parameter
- If neither is present or secret is invalid, the connection is rejected during HTTP upgrade
- Validation also checks sessionId format, connectionId format, session capacity, and duplicate connectionId
- Either authentication method is enough for successful authentication

**Client Implementation Examples**:

```typescript
// Browser client with query parameter (browser WebSocket API limitation)
const ws = new WebSocket("ws://host:port/ws?sessionId=abc12345&connectionId=laptop&secret=server-secret");

ws.addEventListener("open", () => {
    // Connection is already authenticated
    // Server will immediately send CONNECTED message
});

ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.header.type === "ready") {
        // Now ready to send/receive data
    }
});
```

**Security Considerations**:
- Use WSS (WebSocket Secure) in production to encrypt URL parameters
- Prefer Authorization header when client supports it
- Query parameter method is provided for browser compatibility only
- Both methods require WSS to prevent secret exposure

---

## 2. Error Code Mapping

The server implements specific WebSocket close codes and HTTP status codes for different error categories:

### 2.1 Message Errors (4000-4099)

Recoverable errors - connection remains open, client can retry.

| Error Code          | Close Code | HTTP Status | Description                   |
|---------------------|------------|-------------|-------------------------------|
| `INVALID_MESSAGE`   | 4001       | 400         | Invalid message format        |
| `MESSAGE_TOO_LARGE` | 4002       | 400         | Message exceeds size limit    |
| `NO_OTHER_CONNECTION`| 4003      | 400         | No other connection available |

### 2.2 Authentication Errors (4100-4199)

Fatal errors - connection closes after error. These errors occur during HTTP upgrade, so they are returned as HTTP responses rather than WebSocket error messages.

| Error Code            | Close Code | HTTP Status | Description                     |
|-----------------------|------------|-------------|---------------------------------|
| `INVALID_SECRET`      | 4100       | 401         | Incorrect authentication secret |
| `INVALID_SESSION_ID`  | 4101       | 400         | Invalid session ID format       |
| `INVALID_CONNECTION_ID`| 4102       | 400         | Invalid connection identifier   |

### 2.3 State/Limit Errors (4200-4299)

Fatal errors - connection closes after error.

| Error Code              | Close Code | HTTP Status | Description                     |
|-------------------------|------------|-------------|---------------------------------|
| `SESSION_FULL`          | 4200       | 503         | Session already has 2 connections|
| `DUPLICATE_CONNECTION_ID`| 4201       | 409         | Connection identifier already in use|
| `RATE_LIMIT_EXCEEDED`   | 4202       | 429         | Too many connection attempts    |
| `MAX_SESSIONS_REACHED`  | 4203       | 503         | Server session limit reached    |

### 2.4 Internal Errors (4900-4999)

Fatal errors - connection closes after error.

| Error Code       | Close Code | HTTP Status | Description             |
|------------------|------------|-------------|-------------------------|
| `INTERNAL_ERROR` | 4900       | 500         | Unexpected server error |

### 2.5 Standard WebSocket Codes

| Code | Name             | Usage                            |
|------|------------------|----------------------------------|
| 1000 | Normal Closure   | Clean disconnect or idle timeout |
| 1001 | Going Away       | Server shutdown                  |
| 1002 | Protocol Error   | WebSocket protocol violation     |
| 1003 | Unsupported Data | Non-text frame received          |
| 1008 | Policy Violation | Message size exceeded            |
| 1011 | Internal Error   | Unexpected server error          |

---

## 3. Timeout Behaviors

### 3.1 IDLE_TIMEOUT (60 seconds)

**When**: Active WebSocket connection
**Trigger**: No messages received for 60 consecutive seconds
**Action**: Server closes connection with code 1000 (Normal Closure)
**Rationale**: Cleans up inactive connections to free resources

**Client Impact**: Client should implement periodic ping (using CONTROL messages with custom "ping" command) if
connection needs to stay alive without data transfer.

**Example Ping Pattern**:

```typescript
// Send every 30 seconds to stay within 60s idle timeout
setInterval(() => {
    send({
        header: {type: "control", id: uuid(), timestamp: new Date().toISOString()},
        payload: {command: "ping", metadata: null}
    });
}, 30000);
```

---

## 4. Validation Implementation

### 4.1 Validation Layers

The server implements three-level validation using Zod schemas:

#### Level 1: Header (STRICT)

```typescript
const headerSchema = z.strictObject({
    type: z.enum([/* all message types */]),
    id: z.uuid(),
    timestamp: z.iso.datetime(),
});
```

- No additional fields allowed
- All fields required and type-checked
- Violation → `INVALID_MESSAGE` error

#### Level 2: Payload Core (SEMI-STRICT)

```typescript
const dataPayloadSchema = z.looseObject({
    contentType: z.enum(["text", "binary"]),
    data: z.string().min(1),
    metadata: metadataSchema.optional(),
});
```

- Core fields strictly validated
- Additional fields allowed but ignored
- Base64 validation for binary content

#### Level 3: Metadata (PASSTHROUGH)

```typescript
const metadataSchema = z.record(z.string(), z.unknown());
```

- Complete passthrough - no content validation
- Complete passthrough - no content validation
- Server relays as-is to other connection
- Client responsibility to validate

### 4.2 Validation Error Handling

When validation fails, the server:

1. Extracts first Zod error from `result.error.issues[0]`
2. Creates ERROR message with code `INVALID_MESSAGE`
3. Includes original `messageId` if parseable
4. Sends ERROR message to client
5. If error is fatal, closes connection after sending

---

## 5. Session Management

### 5.1 Session Structure

Internally, the server maintains a `SessionManager` singleton with:

```typescript
interface Session {
    sessionId: string;
    connections: Map<string, Connection>;
    createdAt: Date;
}

interface Connection {
    id: string;
    ws: TypedWebSocket;
    connectedAt: Date;
}
```

### 5.2 Session Lifecycle

**Creation**:

- Session created automatically when first connection authenticates
- Session ID provided by client in WebSocket URL query parameter
- No pre-registration required

**Active State**:

- Session exists as long as at least one connection is active
- Maximum 2 connections per session (hardcoded)
- Connections can send/receive messages

**Cleanup**:

- When last connection disconnects, session is automatically deleted
- No session persistence
- No cleanup delay

### 5.3 Connection Identifier Uniqueness

Within a session:

- Connection identifiers must be unique
- Attempted duplicate → `DUPLICATE_CONNECTION_ID` error (4201)
- Duplicate validation happens during HTTP upgrade
- Case-sensitive comparison
- No reserved identifiers

---

## 6. Message Relay Behavior

### 6.1 Relay Strategy

The server implements transparent relay with the following rules:

**DATA and CONTROL messages**:

1. Validate message structure
2. Check for other connection presence
3. If other connection exists: relay entire message without modifications
4. If no other connection: send ERROR with code `NO_OTHER_CONNECTION`

**ACK messages**:

1. Validate message structure
2. Attempt to relay to other connection
3. If other connection disconnected: ignore silently (no error sent)
4. Rationale: ACK may arrive after connection disconnect, not an error condition

### 6.2 Message Size Enforcement

**Check Point**: Before parsing JSON
**Limit**: `MAX_MESSAGE_SIZE` (default 100MB)
**Action**: If exceeded:

1. Close connection with code 1008 (Policy Violation)
2. No ERROR message sent (message too large to parse)

**Implementation Note**: Bun's WebSocket API provides message size before parsing, allowing efficient rejection without
memory allocation.

---

## 7. Rate Limiting

### 7.1 Implementation

**Strategy**: Token bucket per IP address
**Window**: 60 seconds (sliding window)
**Limit**: 10 connection attempts per IP per window

### 7.2 Behavior

**On Limit Exceeded**:

1. Reject WebSocket upgrade
2. Return HTTP 429 (Too Many Requests)
3. No ERROR message (connection not established)

**Reset**: Automatic after window expires

**Bypass**: None - applies to all IPs including localhost in production

---

## 8. Production Deployment

### 8.1 TLS/WSS Configuration

**Required**: Always use WSS (WebSocket Secure) in production

**Options**:

1. **TLS Termination at Reverse Proxy** (recommended)
    - nginx/Caddy handles TLS
    - Server receives plain WS
    - Simpler server configuration

2. **Native Bun TLS**
   ```typescript
   Bun.serve({
     tls: {
       cert: Bun.file("./cert.pem"),
       key: Bun.file("./key.pem"),
     },
     // ... other config
   });
   ```

### 8.2 Secret Management

**Requirements**:

- Minimum 32 random characters
- Use cryptographically secure random generator
- Rotate periodically (recommend: quarterly)

**Generation**:

```bash
# Generate secure secret
openssl rand -base64 32
```

**Storage**:

- Environment variable (not in code)
- Secret management service (AWS Secrets Manager, HashiCorp Vault)
- Never commit to version control

### 8.3 Message Size Limits

**Recommendation**: Configure `MAX_MESSAGE_SIZE` based on use case

| Use Case              | Recommended Limit | Rationale                          |
|-----------------------|-------------------|------------------------------------|
| Clipboard sync (text) | 1MB               | Typical clipboard content is small |
| File transfer (small) | 10MB              | Documents, images                  |
| File transfer (large) | 100MB             | Videos, archives                   |
| File transfer (huge)  | 500MB+            | Large media files (monitor memory) |

**Consider**:

- Server memory (multiple simultaneous transfers)
- Network bandwidth
- Client device capabilities

### 8.4 Monitoring and Logging

**Structured Logging**: Server uses Pino for structured JSON logs

**Key Metrics to Monitor**:

- Active connections count
- Active sessions count
- Message throughput (messages/second)
- Average message size
- Error rates by error code
- Rate limit hits per IP
- Connection duration distribution

**Log Levels**:

- `error`: Authentication failures, validation errors, unexpected errors
- `warn`: Rate limit hits, backpressure events, connection not found
- `info`: Connections, disconnections, session lifecycle
- `debug`: Individual message relay, validation details

**Privacy Note**: Server logs only headers and basic metadata. The `data` field in DATA messages is NEVER logged.

### 8.5 WebSocket Compression

**Default**: Disabled (permessage-deflate compression not enabled)

**When to Enable**:

- High text content traffic
- Limited bandwidth networks
- Large JSON metadata structures

**When to Disable** (default):

- Already compressed data (images, videos, archives)
- CPU-constrained servers
- Low-latency requirements

**Enable in Bun**:

```typescript
Bun.serve({
    websocket: {
        perMessageDeflate: true,
        // ... other config
    },
});
```

### 8.6 Resource Limits

**Process Limits** (recommended for production):

```bash
# /etc/systemd/system/crsp-server.service
[Service]
LimitNOFILE=65535        # File descriptors (for WebSocket connections)
LimitNPROC=512           # Process limit
```

**Docker Limits**:

```yaml
# docker-compose.yml
services:
  crsp-server:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 512M
```

---

## 9. Performance Characteristics

### 9.1 Bun Runtime Advantages

This server leverages Bun's WebSocket implementation which provides:

**Native WebSocket Handlers**:

- 7x faster pub/sub than Node.js (according to Bun benchmarks)
- Zero-copy message passing
- Efficient backpressure handling

**Upgrade Pattern**:

```typescript
// Modern Bun upgrade (returns boolean)
export function upgrade(req: Request, server: Server): boolean {
    return server.upgrade(req, {data});
}
```

**Typed WebSocket**:

```typescript
interface WebSocketData {
    sessionId: string;
    connection: {
        id: string;
        address: string;
        connectedAt: string;
    };
}

type TypedWebSocket = ServerWebSocket<WebSocketData>;
```

### 9.2 Pub/Sub for Session Broadcast

The server uses Bun's native pub/sub for efficient session-wide broadcasts:

```typescript
// Subscribe connection to session
ws.subscribe(sessionId);

// Broadcast to all connections in session
ws.publish(sessionId, message);

// Unsubscribe on disconnect
ws.unsubscribe(sessionId);
```

**Performance**: Pub/sub avoids manual iteration over session members, delegating to Bun's optimized implementation.

### 9.3 Backpressure Handling

**Detection**:

```typescript
const result = ws.send(json);
// result > 0: bytes buffered
// result = -1: backpressure (Bun queued it)
// result = 0: dropped (connection issue)
```

**Current Strategy**: Server logs warning on backpressure but does not throttle. For high-throughput scenarios, consider
implementing sender-side flow control.

---

## 10. Testing

### 10.1 Manual Testing

**Test Client**: `playground.html` in project root

1. Open `playground.html` in multiple browser tabs/windows
2. Use same session ID, different connection identifiers
3. Test data/control message exchange
4. Test disconnect/reconnect scenarios

### 10.2 Health Checks

**Endpoint**: `GET /health`

```json
{
  "status": "ok",
  "timestamp": "2025-12-28T10:00:00.000Z"
}
```

**Stats Endpoint**: `GET /stats` (requires `Authorization: Bearer {secret}` header)

```json
{
  "activeSessions": 2,
  "maxSessions": 4,
  "activeConnections": 4,
  "messagesRelayed": 156,
  "bytesTransferred": 2457890,
  "rateLimit": {
    "hits": 5,
    "blocked": 1,
    "trackedIPs": 3,
    "maxConnections": 10,
    "windowMs": 60000
  },
  "oldestConnectionAge": 3600,
  "newestConnectionAge": 120,
  "memoryUsage": {
    "rss": 45,
    "heapTotal": 12,
    "heapUsed": 8,
    "external": 1
  },
  "uptime": 3600,
  "timestamp": "2025-12-28T10:00:00.000Z"
}
```

### 10.3 Load Testing

**Recommended Tools**:

- `wscat` for simple WebSocket testing
- `k6` with WebSocket support for load testing
- Custom scripts using WebSocket client libraries

**Scenarios to Test**:

1. Maximum sessions (MAX_SESSIONS)
2. Rapid connect/disconnect cycles
3. Rate limit enforcement
4. Large message handling (near MAX_MESSAGE_SIZE)
5. Idle timeout behavior
6. Auth timeout behavior

---

## 11. Error Recovery Patterns

### 11.1 Client Reconnection

**Recommended Pattern**:

```typescript
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_BASE = 1000;

function connect() {
    const ws = new WebSocket(url);

    ws.onclose = (event) => {
        // Message errors (4000-4099) are recoverable
        // All other errors (4100+) are fatal
        if (event.code >= 4100) {
            // Fatal error - do not reconnect
            console.error("Fatal error:", event.reason);
            return;
        }

        // Standard close (1001) means server shutdown - reconnect
        if (event.code === 1001) {
            // Server shutting down - wait and reconnect
        }

        // Exponential backoff
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts);
            setTimeout(connect, delay);
            reconnectAttempts++;
        }
    };

    ws.onopen = () => {
        reconnectAttempts = 0; // Reset on successful connection
    };
}
```

### 11.2 Message Retry

**Pattern**: Client-side message queue with retry

```typescript
const pendingMessages = new Map();

function sendWithRetry(message, maxRetries = 3) {
    pendingMessages.set(message.header.id, {
        message,
        retries: 0,
        maxRetries,
    });

    ws.send(JSON.stringify(message));
}

// On ACK received
function handleAck(ack) {
    pendingMessages.delete(ack.payload.messageId);
}

// On timeout (no ACK received)
function retryTimedOut(messageId) {
    const pending = pendingMessages.get(messageId);
    if (pending && pending.retries < pending.maxRetries) {
        pending.retries++;
        ws.send(JSON.stringify(pending.message));
    } else {
        pendingMessages.delete(messageId);
        // Handle permanent failure
    }
}
```

---

## 12. Architecture Decisions

### 12.1 Stateless Design

**Decision**: Server does not persist any application state

**Rationale**:

- Simplifies server implementation
- Easy horizontal scaling
- No database required
- Failure recovery via client reconnection

**Trade-offs**:

- No message delivery guarantee if recipient offline
- Clients must implement offline queue if needed

### 12.2 Transparent Relay

**Decision**: Server does not modify DATA/CONTROL message payloads

**Rationale**:

- Protocol independence from content types
- Enables end-to-end encryption at application layer
- Simplifies validation logic
- Reduces server processing overhead

**Trade-offs**:

- Server cannot provide content-aware features (compression, caching)
- Content validation is client responsibility

### 12.3 Hardcoded 2-Connection Limit

**Decision**: `CONNECTIONS_PER_SESSION = 2` is hardcoded

**Rationale**:

- Target use case is peer-to-peer sync (2 connections via relay)
- Simplifies relay logic (no broadcast to N > 2)
- Clear mental model for users

**Future Extension**: Architecture supports changing to N connections with minimal effort:

- Change constant value
- Update relay logic to iterate over N connections
- No protocol changes required

---

**Document Version**: 1.0
**Server Version**: 1.0.0
**Last Updated**: 2025-12-28
