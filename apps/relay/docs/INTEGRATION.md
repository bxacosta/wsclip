# CRSP Server Integration Reference

Reference documentation for integrating with a CRSP (Content Relay Sync Protocol) relay server. This document provides
all information needed to develop a client application.

## Quick Start

### Connection

```
ws://host:port/ws?channelId=<CHANNEL_ID>&peerId=<PEER_ID>&secret=<SECRET>
```

**Required Query Parameters**:

| Parameter   | Description           | Validation                                        |
|-------------|-----------------------|---------------------------------------------------|
| `channelId` | Channel identifier    | Exactly 8 alphanumeric characters (a-z, A-Z, 0-9) |
| `peerId`    | Peer identifier       | Non-empty string (whitespace trimmed)             |
| `secret`    | Authentication secret | Must match server secret                          |

**Alternative Authentication**:
The secret can also be provided via HTTP header:

```
Authorization: Bearer <SECRET>
```

If both are provided, the Authorization header takes precedence.

### Connection Flow

```
1. Client connects to: ws://host:port/ws?channelId=ABC12345&peerId=my-device&secret=xxx
2. Server validates parameters during HTTP upgrade
3. On success: WebSocket connection established
4. Server sends READY message immediately
5. Client can now send/receive messages
```

**Authentication happens during HTTP upgrade.** If authentication fails, the WebSocket connection is rejected with an
HTTP error response.

---

## HTTP Endpoints

### Health Check

```
GET /health
```

**Response** (200 OK):

```json
{
  "status": "ok",
  "timestamp": "2025-12-29T10:30:00.000Z"
}
```

### Server Statistics

```
GET /stats
Authorization: Bearer <SECRET>
```

**Response** (200 OK):
```json
{
  "activeChannels": 2,
  "maxChannels": 4,
  "activeConnections": 3,
  "messagesRelayed": 150,
  "bytesTransferred": 45678,
  "oldestConnectionAge": 3600,
  "newestConnectionAge": 120,
  "errors": {
    "INVALID_SECRET": 0,
    "INVALID_CHANNEL": 1,
    "INVALID_PEER_ID": 0,
    "CHANNEL_FULL": 0,
    "DUPLICATE_PEER_ID": 0,
    "INVALID_MESSAGE": 2,
    "MESSAGE_TOO_LARGE": 0,
    "NO_PEER_CONNECTED": 5,
    "RATE_LIMIT_EXCEEDED": 0,
    "MAX_CHANNELS_REACHED": 0,
    "INTERNAL_ERROR": 0
  },
  "memoryUsage": {
    "rss": 45,
    "heapTotal": 20,
    "heapUsed": 15,
    "external": 1
  },
  "rateLimiting": {
    "trackedIPs": 5,
    "windowMs": 60000
  },
  "uptime": 7200,
  "timestamp": "2025-12-29T10:30:00.000Z"
}
```

**Response** (401 Unauthorized): Invalid or missing authorization

---

## Message Format

All WebSocket messages use JSON with this structure:

```typescript
{
  header: {
    type: MessageType,     // Required: message type
    id: string,            // Required: UUID v4
    timestamp: string      // Required: ISO 8601
  },
  payload: { /* varies by type */ }
}
```

### Message Types

**Client to Client (via relay)**:

| Type      | Description                       |
|-----------|-----------------------------------|
| `data`    | Content transfer (text or binary) |
| `ack`     | Message acknowledgment            |
| `control` | Custom control commands           |

**Server to Client**:

| Type       | Description                         |
|------------|-------------------------------------|
| `ready`    | Connection established successfully |
| `peer`     | Peer joined or left the channel     |
| `error`    | Error notification                  |
| `shutdown` | Server is shutting down             |

---

## Server to Client Messages

### READY

Sent immediately after successful WebSocket connection.

```json
{
  "header": {
    "type": "ready",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-12-29T10:30:00.000Z"
  },
  "payload": {
    "peerId": "my-device",
    "channelId": "ABC12345",
    "peer": null
  }
}
```

**Payload Fields**:

| Field       | Type           | Description                          |
|-------------|----------------|--------------------------------------|
| `peerId`    | string         | Your peer identifier                 |
| `channelId` | string         | Channel identifier                   |
| `peer`      | object or null | Existing peer info, or null if alone |

**When a peer is already connected**:
```json
{
  "header": { "type": "ready", "id": "...", "timestamp": "..." },
  "payload": {
    "peerId": "my-device",
    "channelId": "ABC12345",
    "peer": {
      "peerId": "other-device",
      "metadata": {
        "connectedAt": "2025-12-29T10:25:00.000Z"
      }
    }
  }
}
```

---

### PEER

Sent when another peer joins or leaves the channel.

**Peer Joined**:

```json
{
  "header": {
    "type": "peer",
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "timestamp": "2025-12-29T10:31:00.000Z"
  },
  "payload": {
    "peerId": "other-device",
    "event": "joined",
    "metadata": {
      "connectedAt": "2025-12-29T10:31:00.000Z"
    }
  }
}
```

**Peer Left**:

```json
{
  "header": {
    "type": "peer",
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "timestamp": "2025-12-29T10:35:00.000Z"
  },
  "payload": {
    "peerId": "other-device",
    "event": "left",
    "metadata": {
      "reason": "connection_closed"
    }
  }
}
```

**Payload Fields**:

| Field      | Type                   | Description     |
|------------|------------------------|-----------------|
| `peerId`   | string                 | Peer identifier |
| `event`    | `"joined"` or `"left"` | Event type      |
| `metadata` | object                 | Event metadata  |

---

### ERROR

Sent when an error occurs.

```json
{
  "header": {
    "type": "error",
    "id": "550e8400-e29b-41d4-a716-446655440003",
    "timestamp": "2025-12-29T10:32:00.000Z"
  },
  "payload": {
    "code": "NO_PEER_CONNECTED",
    "message": "No peer connected to relay message"
  }
}
```

**Payload Fields**:

| Field     | Type   | Description                          |
|-----------|--------|--------------------------------------|
| `code`    | string | Error code (see Error Codes section) |
| `message` | string | Human-readable error message         |

---

### SHUTDOWN

Sent when the server is shutting down gracefully.

```json
{
  "header": {
    "type": "shutdown",
    "id": "550e8400-e29b-41d4-a716-446655440004",
    "timestamp": "2025-12-29T10:40:00.000Z"
  },
  "payload": {
    "message": "Server is shutting down for maintenance",
    "gracePeriod": 5
  }
}
```

**Payload Fields**:

| Field         | Type   | Description                                   |
|---------------|--------|-----------------------------------------------|
| `message`     | string | Shutdown reason                               |
| `gracePeriod` | number | Seconds until connection is closed (optional) |

**Recommended Action**: Save state and close connection gracefully.

---

## Client to Client Messages

These messages are sent by clients and relayed by the server to the peer. The server validates the structure but does
not modify the content.

### DATA

Transfer content (text or binary) to peer.

```json
{
  "header": {
    "type": "data",
    "id": "550e8400-e29b-41d4-a716-446655440005",
    "timestamp": "2025-12-29T10:33:00.000Z"
  },
  "payload": {
    "contentType": "text",
    "data": "Hello, world!",
    "metadata": {
      "mimeType": "text/plain",
      "size": 13
    }
  }
}
```

**Payload Fields**:

| Field         | Type                   | Required | Description                                 |
|---------------|------------------------|----------|---------------------------------------------|
| `contentType` | `"text"` or `"binary"` | Yes      | Content encoding type                       |
| `data`        | string                 | Yes      | Content (UTF-8 for text, Base64 for binary) |
| `metadata`    | object                 | No       | Optional metadata (not validated by server) |

**Content Types**:

- `text`: Direct UTF-8 string in `data` field
- `binary`: Base64-encoded binary data in `data` field

**Binary Example**:

```json
{
  "header": {
    "type": "data",
    "id": "...",
    "timestamp": "..."
  },
  "payload": {
    "contentType": "binary",
    "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "metadata": {
      "mimeType": "image/png",
      "filename": "pixel.png",
      "size": 68
    }
  }
}
```

**Server Behavior**:

- Validates `contentType` is "text" or "binary"
- Validates `data` is present and is a string
- If `contentType` is `binary`, validates `data` is valid Base64
- Relays the message to peer unchanged
- Returns `NO_PEER_CONNECTED` error if no peer in channel
- Returns `MESSAGE_TOO_LARGE` error if message exceeds size limit

---

### ACK

Acknowledge receipt of a message.

```json
{
  "header": {
    "type": "ack",
    "id": "550e8400-e29b-41d4-a716-446655440006",
    "timestamp": "2025-12-29T10:33:01.000Z"
  },
  "payload": {
    "messageId": "550e8400-e29b-41d4-a716-446655440005",
    "status": "success",
    "metadata": {
      "receivedSize": 13,
      "processingTime": 5
    }
  }
}
```

**Payload Fields**:

| Field       | Type                     | Required | Description                                 |
|-------------|--------------------------|----------|---------------------------------------------|
| `messageId` | string                   | Yes      | UUID of the acknowledged message            |
| `status`    | `"success"` or `"error"` | Yes      | Acknowledgment status                       |
| `metadata`  | object                   | No       | Optional metadata (not validated by server) |

**Server Behavior**:

- Validates `messageId` is present and valid UUID
- Validates `status` is "success" or "error"
- Relays to peer unchanged
- If no peer connected: silently ignores (ACK may arrive after peer disconnects)

---

### CONTROL

Send custom control commands to peer.

```json
{
  "header": {
    "type": "control",
    "id": "550e8400-e29b-41d4-a716-446655440007",
    "timestamp": "2025-12-29T10:34:00.000Z"
  },
  "payload": {
    "command": "sync_request",
    "metadata": {
      "since": "2025-12-29T00:00:00.000Z",
      "fullSync": false
    }
  }
}
```

**Payload Fields**:

| Field      | Type           | Required | Description                                  |
|------------|----------------|----------|----------------------------------------------|
| `command`  | string         | Yes      | Command identifier                           |
| `metadata` | object or null | No       | Command parameters (not validated by server) |

**Server Behavior**:

- Validates `command` is present and is a string
- Relays to peer unchanged
- Returns `NO_PEER_CONNECTED` error if no peer in channel

**Suggested Commands** (clients can define custom commands):

- `ping` / `pong`: Latency check
- `sync_request` / `sync_response`: Synchronization
- `pause_sync` / `resume_sync`: Flow control

---

## Error Codes

### Message Errors (Recoverable)

These errors occur after a successful connection and do not close the WebSocket.

| Code                | Close Code | Description                         |
|---------------------|------------|-------------------------------------|
| `INVALID_MESSAGE`   | 4001       | Invalid message format or structure |
| `MESSAGE_TOO_LARGE` | 4002       | Message exceeds size limit          |
| `NO_PEER_CONNECTED` | 4003       | No peer in channel to relay message |

### Authentication Errors (Fatal - HTTP Upgrade)

These errors occur during connection and reject the WebSocket upgrade.

| Code              | HTTP Status | Description                                          |
|-------------------|-------------|------------------------------------------------------|
| `INVALID_SECRET`  | 401         | Invalid authentication secret                        |
| `INVALID_CHANNEL` | 400         | Channel ID must be exactly 8 alphanumeric characters |
| `INVALID_PEER_ID` | 400         | Peer identifier cannot be empty                      |

### State/Limit Errors (Fatal)

These errors close the WebSocket connection.

| Code                   | Close Code | HTTP Status | Description                       |
|------------------------|------------|-------------|-----------------------------------|
| `CHANNEL_FULL`         | 5001       | 503         | Channel already has 2 peers       |
| `DUPLICATE_PEER_ID`    | 5002       | 409         | Peer ID already exists in channel |
| `RATE_LIMIT_EXCEEDED`  | 5003       | 429         | Too many connection attempts      |
| `MAX_CHANNELS_REACHED` | 5004       | 503         | Server channel limit reached      |

### Internal Errors (Fatal)

| Code             | Close Code | Description             |
|------------------|------------|-------------------------|
| `INTERNAL_ERROR` | 5900       | Unexpected server error |

---

## Server Configuration Defaults

| Setting                | Default           | Description                       |
|------------------------|-------------------|-----------------------------------|
| `PORT`                 | 3000              | Server port                       |
| `MAX_MESSAGE_SIZE`     | 104857600 (100MB) | Maximum message size in bytes     |
| `IDLE_TIMEOUT`         | 60                | WebSocket idle timeout in seconds |
| `RATE_LIMIT_MAX`       | 10                | Max connections per IP per window |
| `RATE_LIMIT_WINDOW_MS` | 60000 (1 min)     | Rate limit time window            |
| `MAX_CHANNELS`         | 4                 | Maximum concurrent channels       |
| `COMPRESSION_ENABLED`  | false             | WebSocket per-message deflate     |

**Fixed Protocol Constraints**:

- Maximum 2 peers per channel

---

## Validation Rules

### Header (Strict)

- All fields required: `type`, `id`, `timestamp`
- `type`: Must be valid message type
- `id`: Must be valid UUID v4
- `timestamp`: Must be valid ISO 8601 format
- No additional fields are allowed in the header

### Payload (Layered)

1. **Core fields**: Validated strictly per message type
2. **Extensible fields** (`metadata`): Passed through without validation

### Size Limits

- Maximum message size: 100MB by default (configurable)
- Applies to the entire JSON message

---

## Client Implementation Checklist

### Required

1. Connect with valid `channelId` (8 alphanumeric), `peerId` (non-empty), and `secret`
2. Generate UUID v4 for each message `id`
3. Use ISO 8601 format for `timestamp`
4. Handle all server message types: `ready`, `peer`, `error`, `shutdown`
5. Track peer connection state via `ready` and `peer` messages
6. Base64 encode binary data with `contentType: "binary"`

### Recommended

1. Implement reconnection with exponential backoff
2. Send ACK for important DATA messages
3. Handle `NO_PEER_CONNECTED` errors (queue or discard)
4. Implement message deduplication using `id` field
5. Handle `shutdown` message gracefully
6. Check `peer` field in `ready` to know if peer is already connected

### Optional

1. Define custom CONTROL commands for your use case
2. Add custom fields to `metadata` objects
3. Compress large payloads before Base64 encoding

---

## TypeScript Type Definitions

```typescript
// Message Types
type MessageType = "control" | "data" | "ack" | "ready" | "peer" | "error" | "shutdown";

// Content Types
type ContentType = "text" | "binary";

// Peer Events
type PeerEventType = "joined" | "left";

// ACK Status
type AckStatus = "success" | "error";

// Base Header
interface MessageHeader {
    type: MessageType;
    id: string;
    timestamp: string;
}

// Client to Client Messages
interface DataMessage {
    header: MessageHeader & { type: "data" };
    payload: {
        contentType: ContentType;
        data: string;
        metadata?: Record<string, unknown>;
    };
}

interface AckMessage {
    header: MessageHeader & { type: "ack" };
    payload: {
        messageId: string;
        status: AckStatus;
        metadata?: Record<string, unknown>;
    };
}

interface ControlMessage {
    header: MessageHeader & { type: "control" };
    payload: {
        command: string;
        metadata?: Record<string, unknown> | null;
    };
}

// Server to Client Messages
interface ReadyMessage {
    header: MessageHeader & { type: "ready" };
    payload: {
        peerId: string;
        channelId: string;
        peer: {
            peerId: string;
            metadata?: Record<string, unknown>;
        } | null;
    };
}

interface PeerMessage {
    header: MessageHeader & { type: "peer" };
    payload: {
        peerId: string;
        event: PeerEventType;
        metadata?: Record<string, unknown>;
    };
}

interface ErrorMessage {
    header: MessageHeader & { type: "error" };
    payload: {
        code: string;
        message: string;
    };
}

interface ShutdownMessage {
    header: MessageHeader & { type: "shutdown" };
    payload: {
        message: string;
        gracePeriod?: number;
    };
}

// Union type for all messages
type ServerMessage = ReadyMessage | PeerMessage | ErrorMessage | ShutdownMessage;
type ClientMessage = DataMessage | AckMessage | ControlMessage;
type Message = ServerMessage | ClientMessage;
```

---

## Quick Reference

| Action           | Message Type | Direction        | Key Fields              |
|------------------|--------------|------------------|-------------------------|
| Send content     | `data`       | Client -> Peer   | contentType, data       |
| Acknowledge      | `ack`        | Client -> Peer   | messageId, status       |
| Send command     | `control`    | Client -> Peer   | command                 |
| Connection ready | `ready`      | Server -> Client | peerId, channelId, peer |
| Peer status      | `peer`       | Server -> Client | peerId, event           |
| Error occurred   | `error`      | Server -> Client | code, message           |
| Server stopping  | `shutdown`   | Server -> Client | message, gracePeriod    |

---

**Protocol**: CRSP v1.0
**Document Version**: 2.0
**Last Updated**: 2025-12-29
