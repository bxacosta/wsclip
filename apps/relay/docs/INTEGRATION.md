# CRSP Server Integration Reference

Reference documentation for integrating with a CRSP (Content Relay Sync Protocol) relay server. This document provides
all information needed to develop a client application.

## Quick Start

### Connection

```
ws://host:port/ws?sessionId=<SESSION_ID>&connectionId=<CONNECTION_ID>&secret=<SECRET>
```

**Required Query Parameters**:

| Parameter      | Description           | Validation                                        |
|----------------|-----------------------|---------------------------------------------------|
| `sessionId`    | Session identifier    | Exactly 8 alphanumeric characters (a-z, A-Z, 0-9) |
| `connectionId` | Connection identifier | Non-empty string (whitespace trimmed)             |
| `secret`       | Authentication secret | Must match server secret                          |

**Alternative Authentication**:
The secret can also be provided via HTTP header:

```
Authorization: Bearer <SECRET>
```

If both are provided, the Authorization header takes precedence.

### Connection Flow

```
1. Client connects to: ws://host:port/ws?sessionId=ABC12345&connectionId=my-device&secret=xxx
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
  "activeSessions": 2,
  "maxSessions": 4,
  "activeConnections": 3,
  "messagesRelayed": 150,
  "bytesTransferred": 45678,
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
    "heapTotal": 20,
    "heapUsed": 15,
    "external": 1
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

| Type         | Description                                        |
|--------------|----------------------------------------------------|
| `ready`      | Connection established successfully                |
| `connection` | Connection status changed (connected/disconnected) |
| `error`      | Error notification                                 |

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
    "connectionId": "my-device",
    "sessionId": "ABC12345",
    "otherConnections": []
  }
}
```

**Payload Fields**:

| Field              | Type   | Description                                   |
|--------------------|--------|-----------------------------------------------|
| `connectionId`     | string | Your connection identifier                    |
| `sessionId`        | string | Session identifier                            |
| `otherConnections` | array  | Array of existing connections (empty if none) |

**When a connection is already present**:

```json
{
  "header": {
    "type": "ready",
    "id": "...",
    "timestamp": "..."
  },
  "payload": {
    "connectionId": "my-device",
    "sessionId": "ABC12345",
    "otherConnections": [
      {
        "id": "other-device",
        "address": "::1",
        "connectedAt": "2025-12-29T10:25:00.000Z"
      }
    ]
  }
}
```

---

### CONNECTION

Sent when another connection's status changes in the session.

**Connection Connected**:

```json
{
  "header": {
    "type": "connection",
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "timestamp": "2025-12-29T10:31:00.000Z"
  },
  "payload": {
    "connectionId": "other-device",
    "status": "connected"
  }
}
```

**Connection Disconnected**:

```json
{
  "header": {
    "type": "connection",
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "timestamp": "2025-12-29T10:35:00.000Z"
  },
  "payload": {
    "connectionId": "other-device",
    "status": "disconnected"
  }
}
```

**Payload Fields**:

| Field          | Type                              | Description           |
|----------------|-----------------------------------|-----------------------|
| `connectionId` | string                            | Connection identifier |
| `status`       | `"connected"` or `"disconnected"` | Connection status     |

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
    "code": "NO_OTHER_CONNECTION",
    "message": "No other connection to relay message"
  }
}
```

**Payload Fields**:

| Field     | Type   | Description                          |
|-----------|--------|--------------------------------------|
| `code`    | string | Error code (see Error Codes section) |
| `message` | string | Human-readable error message         |

---

## Client to Client Messages

These messages are sent by clients and relayed by the server to the other connection. The server validates the structure
but does
not modify the content.

### DATA

Transfer content (text or binary) to other connection.

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
- Relays the message to other connection unchanged
- Returns `NO_OTHER_CONNECTION` error if no other connection in session
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
- Relays to other connection unchanged
- If no other connection connected: silently ignores

---

### CONTROL

Send custom control commands.

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
- Relays to other connection unchanged
- Returns `NO_OTHER_CONNECTION` error if no other connection in session

**Suggested Commands** (clients can define custom commands):

- `ping` / `pong`: Latency check
- `sync_request` / `sync_response`: Synchronization
- `pause_sync` / `resume_sync`: Flow control

---

## Error Codes

### Message Errors (Recoverable)

These errors occur after a successful connection and do not close the WebSocket.

| Code                  | Close Code | Description                          |
|-----------------------|------------|--------------------------------------|
| `INVALID_MESSAGE`     | 4001       | Invalid message format or structure  |
| `MESSAGE_TOO_LARGE`   | 4002       | Message exceeds size limit           |
| `NO_OTHER_CONNECTION` | 4003       | No other connection to relay message |

### Authentication Errors (Fatal - HTTP Upgrade)

These errors occur during connection and reject the WebSocket upgrade.

| Code                    | HTTP Status | Description                                          |
|-------------------------|-------------|------------------------------------------------------|
| `INVALID_SECRET`        | 401         | Invalid authentication secret                        |
| `INVALID_SESSION_ID`    | 400         | Session ID must be exactly 8 alphanumeric characters |
| `INVALID_CONNECTION_ID` | 400         | Connection identifier invalid                        |

### State/Limit Errors (Fatal)

These errors close the WebSocket connection.

| Code                      | Close Code | HTTP Status | Description                       |
|---------------------------|------------|-------------|-----------------------------------|
| `SESSION_FULL`            | 4200       | 503         | Session already has 2 connections |
| `DUPLICATE_CONNECTION_ID` | 4201       | 409         | Connection ID already exists      |
| `RATE_LIMIT_EXCEEDED`     | 4202       | 429         | Too many connection attempts      |
| `MAX_SESSIONS_REACHED`    | 4203       | 503         | Server session limit reached      |

### Internal Errors (Fatal)

| Code             | Close Code | Description             |
|------------------|------------|-------------------------|
| `INTERNAL_ERROR` | 4900       | Unexpected server error |

---

## Server Configuration Defaults

| Setting                 | Default           | Description                       |
|-------------------------|-------------------|-----------------------------------|
| `PORT`                  | 3000              | Server port                       |
| `MAX_MESSAGE_SIZE`      | 104857600 (100MB) | Maximum message size in bytes     |
| `IDLE_TIMEOUT_SEC`      | 60                | WebSocket idle timeout in seconds |
| `RATE_LIMIT_MAX`        | 10                | Max connections per IP per window |
| `RATE_LIMIT_WINDOW_SEC` | 60                | Rate limit time window in seconds |
| `MAX_SESSIONS`          | 4                 | Maximum concurrent sessions       |
| `COMPRESSION`           | false             | WebSocket per-message deflate     |

**Fixed Protocol Constraints**:

- Maximum 2 connections per session

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

1. Connect with valid `sessionId` (8 alphanumeric), `connectionId` (non-empty), and `secret`
2. Generate UUID v4 for each message `id`
3. Use ISO 8601 format for `timestamp`
4. Handle all server message types: `ready`, `connection`, `error`
5. Track other connection state via `ready` and `connection` messages
6. Base64 encode binary data with `contentType: "binary"`
7. Handle WebSocket close code 1001 for server shutdown (reconnect with backoff)

### Recommended

1. Implement reconnection with exponential backoff
2. Send ACK for important DATA messages
3. Handle `NO_OTHER_CONNECTION` errors (queue or discard)
4. Implement message deduplication using `id` field
5. Check `otherConnections` array in `ready` to know if others are already connected

### Optional

1. Define custom CONTROL commands for your use case
2. Add custom fields to `metadata` objects
3. Compress large payloads before Base64 encoding

---

## TypeScript Type Definitions

```typescript
// Message Types
type MessageType = "control" | "data" | "ack" | "ready" | "connection" | "error";

// Content Types
type ContentType = "text" | "binary";

// Connection Status
type ConnectionStatus = "connected" | "disconnected";

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
        connectionId: string;
        sessionId: string;
        otherConnections: Array<{
            id: string;
            address: string;
            connectedAt: string;
        }>;
    };
}

interface ConnectionMessage {
    header: MessageHeader & { type: "connection" };
    payload: {
        connectionId: string;
        status: ConnectionStatus;
    };
}

interface ErrorMessage {
    header: MessageHeader & { type: "error" };
    payload: {
        code: string;
        message: string;
    };
}

// Union type for all messages
type ServerMessage = ReadyMessage | ConnectionMessage | ErrorMessage;
type ClientMessage = DataMessage | AckMessage | ControlMessage;
type Message = ServerMessage | ClientMessage;
```

---

## Quick Reference

| Action            | Message Type | Direction        | Key Fields              |
|-------------------|--------------|------------------|-------------------------|
| Send content      | `data`       | Client -> Client | contentType, data       |
| Acknowledge       | `ack`        | Client -> Client | messageId, status       |
| Send command      | `control`    | Client -> Client | command                 |
| Connection ready  | `ready`      | Server -> Client | connectionId, sessionId |
| Connection status | `connection` | Server -> Client | connectionId, status    |
| Error occurred    | `error`      | Server -> Client | code, message           |

**Server Shutdown**: When the server shuts down, it closes all connections with WebSocket close code `1001` (Going Away)
and reason "Server shutting down". Clients should implement reconnection logic with exponential backoff.

---

**Protocol**: CRSP v1.0
**Document Version**: 2.0
**Last Updated**: 2025-12-29
