# WSClip - Clipboard Synchronization Client

A Windows clipboard synchronization client that enables real-time clipboard sharing between devices via WebSocket, with
optional SOCKS5 proxy support.

## Features

- **Real-time Sync**: Clipboard changes are instantly synchronized between paired devices
- **Content Types**: Supports TEXT, IMAGE (PNG), and FILE synchronization
- **SOCKS5 Proxy**: Optional proxy support for restricted network environments
- **Auto-Reconnection**: Automatic reconnection with exponential backoff
- **Portable**: Single-file executable, no installation required
- **Configuration Wizard**: Interactive setup on first run

## Requirements

- Windows 10/11 (x64)
- .NET 10.0 SDK (for building)

## Build

```bash
dotnet build
```

## Run (Development)

```bash
# Run with default configuration
dotnet run

# Run with verbose logging
dotnet run -- -v

# Run with custom config file
dotnet run -- -c ./myconfig.json
```

## Publish Portable Executable

```bash
dotnet publish -c Release
```

The executable is generated at: `bin/Release/net10.0-windows/win-x64/publish/wsclip.exe`

## Usage

```bash
# Show help
wsclip --help

# Show version
wsclip --version

# Run with default config
wsclip

# Run with verbose logging
wsclip -v

# Run with custom config
wsclip -c /path/to/config.json
```

## Configuration

On first run, WSClip will launch an interactive setup wizard.

Configuration is stored at: `~/.config/wsclip/config.json`

### Config File Format

```json
{
  "serverUrl": "wss://example.com:3000",
  "secret": "your-shared-secret",
  "sessionId": "AbCd1234",
  "connectionId": "my-device",
  "maxContentSize": 20971520,
  "proxy": {
    "enabled": true,
    "host": "localhost",
    "port": 9999
  }
}
```

### Configuration Options

| Option           | Description                                   |
|------------------|-----------------------------------------------|
| `serverUrl`      | WebSocket server URL (ws:// or wss://)        |
| `secret`         | Shared secret for authentication              |
| `sessionId`      | 8-character alphanumeric session identifier   |
| `connectionId`   | Device identifier (defaults to hostname)      |
| `maxContentSize` | Maximum content size in bytes (default: 20MB) |
| `proxy.enabled`  | Enable SOCKS5 proxy                           |
| `proxy.host`     | Proxy host address                            |
| `proxy.port`     | Proxy port number                             |

## How It Works

1. **Connection**: WSClip connects to the WebSocket server with session credentials
2. **Pairing**: Two devices with the same `sessionId` are paired
3. **Monitoring**: Clipboard changes are detected via Windows native events
4. **Sync**: Changes are sent to the paired device via the relay server
5. **Apply**: Received content is written to the local clipboard
