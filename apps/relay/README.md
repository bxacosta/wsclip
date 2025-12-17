# Relay

WebSocket relay server that enables real-time bidirectional communication between two devices through channel-based
pairing.

## Features

- Channel-based pairing with 8-character alphanumeric identifiers
- Maximum 2 devices per channel
- WebSocket compression (permessage-deflate)
- Rate limiting and backpressure handling
- Graceful shutdown with client notification
- Health check and statistics endpoints

## Requirements

- Bun 1.3 or higher

## Installation

```bash
bun install
```

## Configuration

| Variable             | Description                              | Default     |
|----------------------|------------------------------------------|-------------|
| SERVER_SECRET        | Authentication token (required)          | -           |
| PORT                 | Server port                              | 3000        |
| MAX_MESSAGE_SIZE     | Maximum payload size in bytes            | 104857600   |
| LOG_LEVEL            | Logging level (debug, info, warn, error) | info        |
| NODE_ENV             | Environment (development, production)    | development |
| IDLE_TIMEOUT         | WebSocket idle timeout in seconds        | 60          |
| RATE_LIMIT_MAX       | Maximum connections per window           | 10          |
| RATE_LIMIT_WINDOW_MS | Rate limit window in milliseconds        | 60000       |

## Usage

### Development

```bash
bun run dev
```

### Production

```bash
bun run build
bun run start
```

### Docker

```bash
docker compose up -d
```

## API

### WebSocket

```
ws://localhost:3000/ws?secret=<SECRET>&channel=<CHANNEL_ID>&deviceName=<DEVICE_NAME>
```

Parameters:

- secret: Server authentication token
- channel: 8-character alphanumeric channel identifier
- deviceName: Unique device name within the channel

### HTTP Endpoints

| Endpoint | Method | Description       |
|----------|--------|-------------------|
| /health  | GET    | Health check      |
| /stats   | GET    | Server statistics |

## Scripts

| Command       | Description                         |
|---------------|-------------------------------------|
| bun run dev   | Development server with auto-reload |
| bun run build | Compile TypeScript                  |
| bun run start | Run production build                |
| bun run check | Run linter                          |
| bun run fix   | Auto-fix linting issues             |
| bun run play  | Start playground on port 4000       |

## Playground

A web-based testing interface is available to interact with the server manually. Requires the server to be running.

```bash
bun run dev      # Terminal 1: Start server
bun run play     # Terminal 2: Open http://localhost:4000
```