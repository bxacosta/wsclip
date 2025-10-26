"""Interactive configuration wizard for WSClip."""

from __future__ import annotations

from rich.console import Console
from rich.prompt import Confirm, Prompt

from wsclip.config.settings import Settings
from wsclip.models.config import (
    AppConfig,
    ClipboardConfig,
    ConnectionConfig,
    LoggingConfig,
    ProxyAuthConfig,
    ProxyConfig,
    ReconnectConfig,
)
from wsclip.models.messages import ClipboardSyncMode
from wsclip.utils.helpers import generate_peer_id


class ConfigWizard:
    """Interactive configuration wizard."""

    def __init__(self, existing_config: AppConfig | None = None):
        """
        Initialize configuration wizard.

        Args:
            existing_config: Existing configuration to pre-fill prompts (None for new config)
        """
        self.existing_config = existing_config
        self.console = Console()

    def run(self, full_mode: bool = False, new_config: bool = False) -> AppConfig:
        """
        Run interactive configuration wizard.

        Args:
            full_mode: Include advanced settings
            new_config: Ignore existing config and create fresh

        Returns:
            Configured AppConfig instance
        """
        self.console.print("\n[bold white]WSClip Configuration Wizard[/bold white]\n")

        # Decide whether to use existing config as base
        base_config = None if new_config else self.existing_config

        # Connection section
        self.console.print("[grey70]Connection Settings:[/grey70]")
        worker_url = self._prompt_worker_url(base_config)
        peer_id = self._prompt_peer_id(base_config)
        token = self._prompt_token(base_config)

        # Clipboard section
        self.console.print("\n[grey70]Clipboard Settings:[/grey70]")
        sync_mode = self._prompt_sync_mode(base_config)
        hotkey = (
            self._prompt_hotkey(base_config)
            if sync_mode == ClipboardSyncMode.MANUAL
            else Settings.DEFAULT_CLIPBOARD_HOTKEY
        )

        # Proxy section
        self.console.print("\n[grey70]Proxy Settings:[/grey70]")
        proxy_config = self._prompt_proxy(base_config)

        # Advanced configuration (only if --full flag)
        if full_mode:
            self.console.print("\n[grey70]Advanced Settings:[/grey70]")
            poll_interval = self._prompt_poll_interval(base_config)
            max_size_mb = self._prompt_max_size(base_config)
            reconnect_enabled, reconnect_max_attempts = self._prompt_reconnect(base_config)
            log_level = self._prompt_log_level(base_config)
        else:
            # Use defaults or existing values
            poll_interval = (
                base_config.clipboard.poll_interval if base_config else Settings.DEFAULT_CLIPBOARD_POLL_INTERVAL
            )
            max_size_mb = base_config.clipboard.max_size_mb if base_config else Settings.DEFAULT_CLIPBOARD_MAX_SIZE_MB
            if base_config:
                reconnect_enabled = base_config.connection.reconnect.enabled
                reconnect_max_attempts = base_config.connection.reconnect.max_attempts
            else:
                reconnect_enabled = Settings.DEFAULT_RECONNECT_ENABLED
                reconnect_max_attempts = Settings.DEFAULT_RECONNECT_MAX_ATTEMPTS
            log_level = base_config.logging.level if base_config else Settings.DEFAULT_LOG_LEVEL

        # Build configuration
        config = AppConfig(
            connection=ConnectionConfig(
                worker_url=worker_url,
                peer_id=peer_id,
                token=token,
                reconnect=ReconnectConfig(
                    enabled=reconnect_enabled,
                    max_attempts=reconnect_max_attempts,
                ),
            ),
            clipboard=ClipboardConfig(
                sync_mode=sync_mode,
                hotkey=hotkey,
                poll_interval=poll_interval,
                max_size_mb=max_size_mb,
            ),
            proxy=proxy_config,
            logging=LoggingConfig(level=log_level),
        )

        self.console.print("\n[bold white]Configuration complete![/bold white]\n", style="bright_white")
        return config

    def _prompt_worker_url(self, base_config: AppConfig | None) -> str:
        """
        Prompt for Worker URL (required field).

        Args:
            base_config: Existing config for default value

        Returns:
            Worker URL string
        """
        if base_config:
            # Has existing config: show current value as default
            default = base_config.connection.worker_url
            url = Prompt.ask("  Worker URL", default=default)
        else:
            # No existing config: required field, no default
            url = ""
            while not url.strip():
                url = Prompt.ask("  Worker URL (required)")
                if not url.strip():
                    self.console.print("  [grey66]Worker URL is required[/grey66]")

        # Basic validation
        if not (url.startswith("ws://") or url.startswith("wss://")):
            self.console.print("  [grey66]Warning: URL should start with ws:// or wss://[/grey66]")

        return url

    def _prompt_peer_id(self, base_config: AppConfig | None) -> str:
        """
        Prompt for Peer ID with auto-generation.

        Args:
            base_config: Existing config for default value

        Returns:
            Peer ID string
        """
        if base_config and base_config.connection.peer_id:
            # Has existing peer_id: pre-fill, allow edit/delete to regenerate
            current_peer_id = base_config.connection.peer_id
            peer_id = Prompt.ask("  Peer ID", default=current_peer_id)

            # If user cleared the field, generate new one
            if not peer_id.strip():
                peer_id = generate_peer_id()
                self.console.print(f"  [grey70]Generated new: {peer_id}[/grey70]")
        else:
            # No existing peer_id: auto-generate and pre-fill
            generated_peer_id = generate_peer_id()
            peer_id = Prompt.ask("  Peer ID", default=generated_peer_id)

            # If user cleared the field, generate another new one
            if not peer_id.strip():
                peer_id = generate_peer_id()
                self.console.print(f"  [grey70]Generated new: {peer_id}[/grey70]")

        return peer_id

    def _prompt_token(self, base_config: AppConfig | None) -> str:
        """
        Prompt for pairing token (optional).

        Args:
            base_config: Existing config for default value

        Returns:
            Token string (empty if user wants to generate on start)
        """
        default_token = base_config.connection.token if base_config and base_config.connection.token else ""
        token = Prompt.ask("  Token (leave empty to auto-generate)", default=default_token)
        return token

    def _prompt_sync_mode(self, base_config: AppConfig | None) -> ClipboardSyncMode:
        """
        Prompt for clipboard sync mode.

        Args:
            base_config: Existing config for default value

        Returns:
            ClipboardSyncMode enum
        """
        default_mode = base_config.clipboard.sync_mode if base_config else ClipboardSyncMode.MANUAL
        mode_str = Prompt.ask("  Sync mode", choices=["auto", "manual"], default=default_mode.value)
        return ClipboardSyncMode.AUTO if mode_str == "auto" else ClipboardSyncMode.MANUAL

    def _prompt_hotkey(self, base_config: AppConfig | None) -> str:
        """
        Prompt for hotkey (manual mode only).

        Args:
            base_config: Existing config for default value

        Returns:
            Hotkey string in pynput format
        """
        default_hotkey = base_config.clipboard.hotkey if base_config else Settings.DEFAULT_CLIPBOARD_HOTKEY
        hotkey = Prompt.ask("  Hotkey", default=default_hotkey)
        return hotkey

    def _prompt_proxy(self, base_config: AppConfig | None) -> ProxyConfig:
        """
        Prompt for proxy configuration.

        Args:
            base_config: Existing config for default value

        Returns:
            ProxyConfig instance
        """
        default_enabled = base_config.proxy.enabled if base_config else Settings.DEFAULT_PROXY_ENABLED
        enabled = Confirm.ask("  Enable SOCKS5 proxy?", default=default_enabled)

        if not enabled:
            return ProxyConfig(enabled=False)

        # Proxy sub-prompts (with extra indentation)
        default_host = base_config.proxy.host if base_config else Settings.DEFAULT_PROXY_HOST
        default_port = base_config.proxy.port if base_config else Settings.DEFAULT_PROXY_PORT
        default_type = base_config.proxy.type if base_config else Settings.DEFAULT_PROXY_TYPE

        host = Prompt.ask("    Host", default=default_host)
        port = int(Prompt.ask("    Port", default=str(default_port)))
        proxy_type = Prompt.ask("    Type", default=default_type)

        # Optional auth
        default_username = base_config.proxy.auth.username if base_config and base_config.proxy.auth.username else ""
        username = Prompt.ask("    Username (optional)", default=default_username)

        password = ""
        if username:
            default_password = (
                base_config.proxy.auth.password if base_config and base_config.proxy.auth.password else ""
            )
            password = Prompt.ask("    Password (optional)", password=True, default=default_password)

        auth = ProxyAuthConfig(username=username, password=password) if username else ProxyAuthConfig()

        return ProxyConfig(
            enabled=True,
            host=host,
            port=port,
            type=proxy_type,
            auth=auth,
        )

    def _prompt_poll_interval(self, base_config: AppConfig | None) -> float:
        """Prompt for clipboard poll interval (advanced)."""
        default = base_config.clipboard.poll_interval if base_config else Settings.DEFAULT_CLIPBOARD_POLL_INTERVAL
        value = Prompt.ask("  Poll interval (seconds)", default=str(default))
        return float(value)

    def _prompt_max_size(self, base_config: AppConfig | None) -> int:
        """Prompt for maximum clipboard size (advanced)."""
        default = base_config.clipboard.max_size_mb if base_config else Settings.DEFAULT_CLIPBOARD_MAX_SIZE_MB
        value = Prompt.ask("  Max clipboard size (MB)", default=str(default))
        return int(value)

    def _prompt_reconnect(self, base_config: AppConfig | None) -> tuple[bool, int]:
        """Prompt for reconnection settings (advanced)."""
        if base_config:
            default_enabled = base_config.connection.reconnect.enabled
            default_attempts = base_config.connection.reconnect.max_attempts
        else:
            default_enabled = Settings.DEFAULT_RECONNECT_ENABLED
            default_attempts = Settings.DEFAULT_RECONNECT_MAX_ATTEMPTS

        enabled = Confirm.ask("  Enable auto-reconnect?", default=default_enabled)

        if not enabled:
            return False, 0

        attempts = int(Prompt.ask("    Max attempts", default=str(default_attempts)))
        return enabled, attempts

    def _prompt_log_level(self, base_config: AppConfig | None) -> str:
        """Prompt for log level (advanced)."""
        default = base_config.logging.level if base_config else Settings.DEFAULT_LOG_LEVEL
        level = Prompt.ask("  Log level", choices=["DEBUG", "INFO", "WARNING", "ERROR"], default=default)
        return level
