"""Application configuration model."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from json import JSONDecodeError
from pathlib import Path

from wsclip.config.constants import ConfigField
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

    def api_url(self) -> str:
        return self.worker_url.rstrip("/").replace("wss://", "https://").replace("/ws", "")


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
    connection: ConnectionConfig = field(default_factory=ConnectionConfig)
    clipboard: ClipboardConfig = field(default_factory=ClipboardConfig)
    proxy: ProxyConfig = field(default_factory=ProxyConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)

    @classmethod
    def from_json(cls, file_path: Path | None = None) -> AppConfig:
        """
        Load configuration from JSON file.

        Args:
            file_path: Path to JSON config file. If None, uses default XDG path.

        Returns:
            Loaded AppConfig instance

        Raises:
            FileNotFoundError: If config file doesn't exist
            JSONDecodeError: If JSON is malformed
            ValueError: If required fields are missing or invalid
        """
        file_path = file_path or get_config_file()

        if not file_path.exists():
            raise FileNotFoundError(f"Config file not found: {file_path}")

        try:
            with open(file_path, encoding="utf-8") as file:
                data = json.load(file)
        except JSONDecodeError as e:
            raise JSONDecodeError(f"Invalid JSON in config file {file_path}: {e.msg}", e.doc, e.pos) from e

        # Connection Configuration
        connection_data = data.get(ConfigField.CONNECTION, {})
        reconnect_data = connection_data.get(ConfigField.RECONNECT, {})
        connection = ConnectionConfig(
            worker_url=connection_data.get(ConfigField.WORKER_URL, ""),
            peer_id=connection_data.get(ConfigField.PEER_ID, ""),
            token=connection_data.get(ConfigField.TOKEN, ""),
            reconnect=ReconnectConfig(
                enabled=reconnect_data.get(ConfigField.RECONNECT_ENABLED, Settings.DEFAULT_RECONNECT_ENABLED),
                max_attempts=reconnect_data.get(
                    ConfigField.RECONNECT_MAX_ATTEMPTS, Settings.DEFAULT_RECONNECT_MAX_ATTEMPTS
                ),
            ),
        )

        # Clipboard Configuration
        clipboard_data = data.get(ConfigField.CLIPBOARD, {})
        clipboard = ClipboardConfig(
            sync_mode=ClipboardSyncMode(
                clipboard_data.get(ConfigField.CLIPBOARD_MODE, Settings.DEFAULT_CLIPBOARD_MODE.value)
            ),
            hotkey=clipboard_data.get(ConfigField.CLIPBOARD_HOTKEY, Settings.DEFAULT_CLIPBOARD_HOTKEY),
            poll_interval=clipboard_data.get(
                ConfigField.CLIPBOARD_POLL_INTERVAL, Settings.DEFAULT_CLIPBOARD_POLL_INTERVAL
            ),
            max_size_mb=clipboard_data.get(ConfigField.CLIPBOARD_MAX_SIZE_MB, Settings.DEFAULT_CLIPBOARD_MAX_SIZE_MB),
        )

        # Proxy Configuration
        proxy_data = data.get(ConfigField.PROXY, {})
        auth_data = proxy_data.get(ConfigField.PROXY_AUTH, {})
        proxy = ProxyConfig(
            enabled=proxy_data.get(ConfigField.PROXY_ENABLED, Settings.DEFAULT_PROXY_ENABLED),
            host=proxy_data.get(ConfigField.PROXY_HOST, Settings.DEFAULT_PROXY_HOST),
            port=proxy_data.get(ConfigField.PROXY_PORT, Settings.DEFAULT_PROXY_PORT),
            type=proxy_data.get(ConfigField.PROXY_TYPE, Settings.DEFAULT_PROXY_TYPE),
            auth=ProxyAuthConfig(
                username=auth_data.get(ConfigField.PROXY_AUTH_USERNAME),
                password=auth_data.get(ConfigField.PROXY_AUTH_PASSWORD),
            ),
        )

        # Logging Configuration
        logging_data = data.get(ConfigField.LOGGING, {})
        logging = LoggingConfig(level=logging_data.get(ConfigField.LOGGING_LEVEL, Settings.DEFAULT_LOG_LEVEL))

        return cls(
            connection=connection,
            clipboard=clipboard,
            proxy=proxy,
            logging=logging,
        )

    def to_dict(self) -> dict[str, object]:
        return {
            ConfigField.CONNECTION: {
                ConfigField.WORKER_URL: self.connection.worker_url,
                ConfigField.PEER_ID: self.connection.peer_id,
                ConfigField.TOKEN: self.connection.token,
                ConfigField.RECONNECT: {
                    ConfigField.RECONNECT_ENABLED: self.connection.reconnect.enabled,
                    ConfigField.RECONNECT_MAX_ATTEMPTS: self.connection.reconnect.max_attempts,
                },
            },
            ConfigField.CLIPBOARD: {
                ConfigField.CLIPBOARD_MODE: self.clipboard.sync_mode.value,
                ConfigField.CLIPBOARD_HOTKEY: self.clipboard.hotkey,
                ConfigField.CLIPBOARD_POLL_INTERVAL: self.clipboard.poll_interval,
                ConfigField.CLIPBOARD_MAX_SIZE_MB: self.clipboard.max_size_mb,
            },
            ConfigField.PROXY: {
                ConfigField.PROXY_ENABLED: self.proxy.enabled,
                ConfigField.PROXY_HOST: self.proxy.host,
                ConfigField.PROXY_PORT: self.proxy.port,
                ConfigField.PROXY_TYPE: self.proxy.type,
                ConfigField.PROXY_AUTH: {
                    ConfigField.PROXY_AUTH_USERNAME: self.proxy.auth.username,
                    ConfigField.PROXY_AUTH_PASSWORD: self.proxy.auth.password,
                },
            },
            ConfigField.LOGGING: {ConfigField.LOGGING_LEVEL: self.logging.level},
        }

    def save(self, file_path: Path | None = None) -> None:
        """
        Save configuration to JSON file.

        Args:
            file_path: Path to save JSON file. If None, uses default XDG path.

        Raises:
            PermissionError: If file cannot be written
            OSError: If file write fails
        """
        file_path = file_path or get_config_file()

        try:
            with open(file_path, "w", encoding="utf-8") as file:
                json.dump(self.to_dict(), file, indent=2, ensure_ascii=False)
        except PermissionError as e:
            raise PermissionError(f"Cannot write config file {file_path}: Permission denied") from e
        except OSError as e:
            raise OSError(f"Failed to write config file {file_path}: {e}") from e
