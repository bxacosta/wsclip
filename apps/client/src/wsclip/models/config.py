"""Application configuration model."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from ..utils.paths import get_config_file


@dataclass
class ReconnectConfig:
    """Reconnection configuration."""
    enabled: bool = True
    max_attempts: int = 10


@dataclass
class ConnectionConfig:
    """Connection configuration."""
    worker_url: str = ''
    peer_id: str = ''
    token: str = ''
    reconnect: ReconnectConfig | None = None

    def __post_init__(self) -> None:
        """Initialize nested configs with defaults."""
        if self.reconnect is None:
            self.reconnect = ReconnectConfig()


@dataclass
class ClipboardConfig:
    """Clipboard configuration."""
    mode: Literal['auto', 'manual'] = 'manual'
    hotkey: str = '<alt>+<shift>+<enter>'
    poll_interval: float = 0.5
    max_size_mb: int = 1


@dataclass
class ProxyAuthConfig:
    """Proxy authentication configuration."""
    username: str | None = None
    password: str | None = None


@dataclass
class ProxyConfig:
    """Proxy configuration."""
    enabled: bool = False
    host: str = 'localhost'
    port: int = 1080
    type: str = 'socks5'
    auth: ProxyAuthConfig | None = None

    def __post_init__(self) -> None:
        """Initialize nested configs with defaults."""
        if self.auth is None:
            self.auth = ProxyAuthConfig()


@dataclass
class LoggingConfig:
    """Logging configuration."""
    level: str = 'INFO'


@dataclass
class AppConfig:
    """Application configuration with hierarchical structure."""
    connection: ConnectionConfig | None = None
    clipboard: ClipboardConfig | None = None
    proxy: ProxyConfig | None = None
    logging: LoggingConfig | None = None

    def __post_init__(self) -> None:
        """Initialize nested configs with defaults."""
        if self.connection is None:
            self.connection = ConnectionConfig()
        if self.clipboard is None:
            self.clipboard = ClipboardConfig()
        if self.proxy is None:
            self.proxy = ProxyConfig()
        if self.logging is None:
            self.logging = LoggingConfig()

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
            raise FileNotFoundError(
                f"Config file not found: {path}\n"
                f"Run 'wsclip init' to create a configuration file."
            )

        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise json.JSONDecodeError(
                f"Invalid JSON in config file {path}: {e.msg}",
                e.doc,
                e.pos
            )

        # Parse nested structures
        connection_data = data.get('connection', {})
        reconnect_data = connection_data.get('reconnect', {})
        connection = ConnectionConfig(
            worker_url=connection_data.get('worker_url', ''),
            peer_id=connection_data.get('peer_id', ''),
            token=connection_data.get('token', ''),
            reconnect=ReconnectConfig(
                enabled=reconnect_data.get('enabled', True),
                max_attempts=reconnect_data.get('max_attempts', 10),
            )
        )

        clipboard_data = data.get('clipboard', {})
        clipboard = ClipboardConfig(
            mode=clipboard_data.get('mode', 'manual'),
            hotkey=clipboard_data.get('hotkey', '<alt>+<shift>+<enter>'),
            poll_interval=clipboard_data.get('poll_interval', 0.5),
            max_size_mb=clipboard_data.get('max_size_mb', 1),
        )

        # Validate clipboard mode
        if clipboard.mode not in ('auto', 'manual'):
            raise ValueError(
                f"Invalid clipboard mode: {clipboard.mode}. Must be 'auto' or 'manual'."
            )

        proxy_data = data.get('proxy', {})
        auth_data = proxy_data.get('auth', {})
        proxy = ProxyConfig(
            enabled=proxy_data.get('enabled', False),
            host=proxy_data.get('host', 'localhost'),
            port=proxy_data.get('port', 1080),
            type=proxy_data.get('type', 'socks5'),
            auth=ProxyAuthConfig(
                username=auth_data.get('username'),
                password=auth_data.get('password'),
            )
        )

        logging_data = data.get('logging', {})
        logging = LoggingConfig(
            level=logging_data.get('level', 'INFO')
        )

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
            'connection': {
                'worker_url': self.connection.worker_url if self.connection else '',
                'peer_id': self.connection.peer_id if self.connection else '',
                'token': self.connection.token if self.connection else '',
                'reconnect': {
                    'enabled': self.connection.reconnect.enabled if self.connection and self.connection.reconnect else True,
                    'max_attempts': self.connection.reconnect.max_attempts if self.connection and self.connection.reconnect else 10,
                }
            },
            'clipboard': {
                'mode': self.clipboard.mode if self.clipboard else 'manual',
                'hotkey': self.clipboard.hotkey if self.clipboard else '<alt>+<shift>+<enter>',
                'poll_interval': self.clipboard.poll_interval if self.clipboard else 0.5,
                'max_size_mb': self.clipboard.max_size_mb if self.clipboard else 1,
            },
            'proxy': {
                'enabled': self.proxy.enabled if self.proxy else False,
                'host': self.proxy.host if self.proxy else 'localhost',
                'port': self.proxy.port if self.proxy else 1080,
                'type': self.proxy.type if self.proxy else 'socks5',
                'auth': {
                    'username': self.proxy.auth.username if self.proxy and self.proxy.auth else None,
                    'password': self.proxy.auth.password if self.proxy and self.proxy.auth else None,
                }
            },
            'logging': {
                'level': self.logging.level if self.logging else 'INFO'
            }
        }

        try:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except PermissionError as e:
            raise PermissionError(
                f"Cannot write config file {path}: Permission denied"
            ) from e
        except OSError as e:
            raise OSError(
                f"Failed to write config file {path}: {e}"
            ) from e

    def save(self, file_path: str | Path | None = None) -> None:
        """
        Alias for to_json().

        Args:
            file_path: Path to save JSON file. If None, uses default XDG path.
        """
        self.to_json(file_path)
