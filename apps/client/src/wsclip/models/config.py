"""Application configuration model."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from wsclip.config.settings import Settings
from wsclip.models.messages import ClipboardSyncMode
from wsclip.utils.paths import get_config_file


@dataclass
class ReconnectConfig:
    """Reconnection configuration."""

    enabled: bool = Settings.DEFAULT_RECONNECT_ENABLED
    max_attempts: int = Settings.DEFAULT_RECONNECT_MAX_ATTEMPTS


@dataclass
class ConnectionConfig:
    """Connection configuration."""

    worker_url: str = ""
    peer_id: str = ""
    token: str = ""
    reconnect: ReconnectConfig = field(default_factory=ReconnectConfig)


@dataclass
class ClipboardConfig:
    """Clipboard configuration."""

    sync_mode: ClipboardSyncMode = Settings.DEFAULT_CLIPBOARD_MODE
    hotkey: str = Settings.DEFAULT_CLIPBOARD_HOTKEY
    poll_interval: float = Settings.DEFAULT_CLIPBOARD_POLL_INTERVAL
    max_size_mb: int = Settings.DEFAULT_CLIPBOARD_MAX_SIZE_MB


@dataclass
class ProxyAuthConfig:
    """Proxy authentication configuration."""

    username: str | None = None
    password: str | None = None


@dataclass
class ProxyConfig:
    """Proxy configuration."""

    enabled: bool = Settings.DEFAULT_PROXY_ENABLED
    host: str = Settings.DEFAULT_PROXY_HOST
    port: int = Settings.DEFAULT_PROXY_PORT
    type: str = Settings.DEFAULT_PROXY_TYPE
    auth: ProxyAuthConfig = field(default_factory=ProxyAuthConfig)


@dataclass
class LoggingConfig:
    """Logging configuration."""

    level: str = Settings.DEFAULT_LOG_LEVEL


@dataclass
class AppConfig:
    """Application configuration with hierarchical structure."""

    connection: ConnectionConfig = field(default_factory=ConnectionConfig)
    clipboard: ClipboardConfig = field(default_factory=ClipboardConfig)
    proxy: ProxyConfig = field(default_factory=ProxyConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)

    @classmethod
    def from_json(cls, file_path: str | Path | None = None) -> AppConfig:
        """
        Load configuration from JSON file.

        Args:
            file_path: Path to JSON config file. If None, uses default XDG path.

        Returns:
            Loaded AppConfig instance

        Raises:
            FileNotFoundError: If config file doesn't exist
            json.JSONDecodeError: If JSON is malformed
            ValueError: If required fields are missing or invalid
        """
        if file_path is None:
            file_path = get_config_file()

        path = Path(file_path)

        if not path.exists():
            raise FileNotFoundError(f"Config file not found: {path}\nRun 'wsclip init' to create a configuration file.")

        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise json.JSONDecodeError(f"Invalid JSON in config file {path}: {e.msg}", e.doc, e.pos) from e

        # Parse nested structures
        connection_data = data.get("connection", {})
        reconnect_data = connection_data.get("reconnect", {})
        connection = ConnectionConfig(
            worker_url=connection_data.get("worker_url", ""),
            peer_id=connection_data.get("peer_id", ""),
            token=connection_data.get("token", ""),
            reconnect=ReconnectConfig(
                enabled=reconnect_data.get("enabled", Settings.DEFAULT_RECONNECT_ENABLED),
                max_attempts=reconnect_data.get("max_attempts", Settings.DEFAULT_RECONNECT_MAX_ATTEMPTS),
            ),
        )

        clipboard_data = data.get("clipboard", {})
        mode_str = clipboard_data.get("mode", "manual")
        # Convert string to enum
        mode = ClipboardSyncMode.MANUAL if mode_str == "manual" else ClipboardSyncMode.AUTO

        clipboard = ClipboardConfig(
            sync_mode=mode,
            hotkey=clipboard_data.get("hotkey", Settings.DEFAULT_CLIPBOARD_HOTKEY),
            poll_interval=clipboard_data.get("poll_interval", Settings.DEFAULT_CLIPBOARD_POLL_INTERVAL),
            max_size_mb=clipboard_data.get("max_size_mb", Settings.DEFAULT_CLIPBOARD_MAX_SIZE_MB),
        )

        proxy_data = data.get("proxy", {})
        auth_data = proxy_data.get("auth", {})
        proxy = ProxyConfig(
            enabled=proxy_data.get("enabled", Settings.DEFAULT_PROXY_ENABLED),
            host=proxy_data.get("host", Settings.DEFAULT_PROXY_HOST),
            port=proxy_data.get("port", Settings.DEFAULT_PROXY_PORT),
            type=proxy_data.get("type", Settings.DEFAULT_PROXY_TYPE),
            auth=ProxyAuthConfig(
                username=auth_data.get("username"),
                password=auth_data.get("password"),
            ),
        )

        logging_data = data.get("logging", {})
        logging = LoggingConfig(level=logging_data.get("level", Settings.DEFAULT_LOG_LEVEL))

        return cls(
            connection=connection,
            clipboard=clipboard,
            proxy=proxy,
            logging=logging,
        )

    def to_json(self, file_path: str | Path | None = None) -> None:
        """
        Save configuration to JSON file.

        Args:
            file_path: Path to save JSON file. If None, uses default XDG path.

        Raises:
            PermissionError: If file cannot be written
            OSError: If file write fails
        """
        if file_path is None:
            file_path = get_config_file()

        path = Path(file_path)

        # Convert to dict with proper structure
        data = {
            "connection": {
                "worker_url": self.connection.worker_url,
                "peer_id": self.connection.peer_id,
                "token": self.connection.token,
                "reconnect": {
                    "enabled": self.connection.reconnect.enabled,
                    "max_attempts": self.connection.reconnect.max_attempts,
                },
            },
            "clipboard": {
                "mode": self.clipboard.sync_mode.value,
                "hotkey": self.clipboard.hotkey,
                "poll_interval": self.clipboard.poll_interval,
                "max_size_mb": self.clipboard.max_size_mb,
            },
            "proxy": {
                "enabled": self.proxy.enabled,
                "host": self.proxy.host,
                "port": self.proxy.port,
                "type": self.proxy.type,
                "auth": {
                    "username": self.proxy.auth.username,
                    "password": self.proxy.auth.password,
                },
            },
            "logging": {"level": self.logging.level},
        }

        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except PermissionError as e:
            raise PermissionError(f"Cannot write config file {path}: Permission denied") from e
        except OSError as e:
            raise OSError(f"Failed to write config file {path}: {e}") from e

    def save(self, file_path: str | Path | None = None) -> None:
        """
        Alias for to_json().

        Args:
            file_path: Path to save JSON file. If None, uses default XDG path.
        """
        self.to_json(file_path)
