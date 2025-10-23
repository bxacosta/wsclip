"""
CLI application entry point
"""
import asyncio
import sys
import uuid
from pathlib import Path
from typing import Optional
import click
import requests
from rich.prompt import Prompt
from rich.table import Table

from .core.websocket_client import WebSocketClient
from .core.clipboard_manager import ClipboardManager
from .core.hotkey_handler import HotkeyHandler
from .models.config import AppConfig, ProxyConfig
from .models.message import ClipboardTextMessage
from .utils.logger import console, print_info, print_success, print_error, print_warning
from .constants import DEFAULT_WORKER_URL


def get_or_generate_peer_id(config: AppConfig) -> str:
    """
    Get peer_id from config or generate new one

    Args:
        config: Application configuration

    Returns:
        peer_id in format: "peer-{uuid8}" or custom from config
    """
    if config.peer_id and config.peer_id.strip():
        return config.peer_id.strip()
    else:
        return f"peer-{uuid.uuid4().hex[:8]}"


@click.group()
@click.version_option(version="0.0.2")
def cli() -> None:
    """
    WSClip - WebSocket Clipboard Sync

    Phase 2: Real clipboard synchronization between peers
    """
    pass


@cli.command()
@click.option('--mode', type=click.Choice(['auto', 'manual']), default='manual', help='Clipboard sync mode')
@click.option('--token', default=None, help='Pairing token (optional)')
@click.option('--config', default='config.yaml', help='Config file path')
def start(mode: str, token: Optional[str], config: str) -> None:
    """
    Start clipboard sync with specified mode (Phase 2)

    Token precedence:
    1. --token parameter → use and save to config
    2. config.yaml token → use that
    3. None → generate new token and save to config
    """
    # Load or create config
    config_path = Path(config)

    if config_path.exists():
        app_config = AppConfig.from_yaml(config)
    else:
        # Create default config
        app_config = AppConfig(
            worker_url=DEFAULT_WORKER_URL,
            peer_id='',
            proxy=ProxyConfig(),
            mode=mode
        )

    # Token resolution with precedence
    if token:
        # Priority 1: --token parameter
        app_config.token = token
        app_config.to_yaml(config)  # Save to config
    elif not app_config.token:
        # Priority 3: Generate new token
        console.print("[cyan]Generating new token...[/cyan]")
        api_url = app_config.worker_url.replace('wss://', 'https://').replace('/ws', '')
        try:
            response = requests.get(f"{api_url}/api/generate-token", timeout=10)
            response.raise_for_status()
            data = response.json()
            app_config.token = data['token']
            app_config.to_yaml(config)  # Save to config

            console.print()
            console.print("━" * 50, style="green")
            console.print(f"  Generated Token: [bold green]{app_config.token}[/bold green]", justify="center")
            console.print("━" * 50, style="green")
            console.print()
            console.print("Share this token with the other peer:")
            console.print(f"  [dim]wsclip start --mode {mode} --token {app_config.token}[/dim]")
            console.print()
        except requests.RequestException as e:
            print_error(f"Failed to generate token: {e}")
            sys.exit(1)
    # else: Priority 2: use token from config.yaml

    # Generate peer_id if not defined
    app_config.peer_id = get_or_generate_peer_id(app_config)
    app_config.mode = mode

    # Start clipboard sync
    try:
        asyncio.run(_run_clipboard_sync(app_config))
    except KeyboardInterrupt:
        print_info("Interrupted by user")
        sys.exit(0)


@cli.command()
@click.option('--config', default='config.yaml', help='Config file path')
def status(config: str) -> None:
    """
    Show connection status and configuration
    """
    config_path = Path(config)

    if not config_path.exists():
        print_error(f"Config file not found: {config}")
        print_info("Run 'wsclip init' to create a configuration file")
        return

    # Load config
    app_config = AppConfig.from_yaml(config)

    # Display status table
    table = Table(title="WSClip Status")
    table.add_column("Property", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Mode", app_config.mode)
    table.add_row("Hotkey", app_config.hotkey if app_config.mode == 'manual' else 'N/A')
    table.add_row("Worker URL", app_config.worker_url)
    table.add_row("Peer ID", app_config.peer_id if app_config.peer_id else '[dim]auto-generated[/dim]')
    table.add_row("Token", app_config.token if app_config.token else '[dim]not set[/dim]')
    table.add_row("Auto-reconnect", "Enabled" if app_config.enable_reconnect else "Disabled")
    table.add_row("Poll Interval", f"{app_config.clipboard_poll_interval}s")
    table.add_row("Max Size", f"{app_config.clipboard_max_size_mb}MB")

    console.print(table)


async def _run_clipboard_sync(config: AppConfig) -> None:
    """
    Run clipboard sync (Phase 2)
    Replaces _run_client from Phase 1
    """
    # Create WebSocket client
    client = WebSocketClient(
        worker_url=config.worker_url,
        token=config.token,
        peer_id=config.peer_id,
        log_level=config.log_level,
        enable_reconnect=config.enable_reconnect
    )

    # Create clipboard manager
    clipboard_mgr = ClipboardManager(
        poll_interval=config.clipboard_poll_interval,
        max_size_bytes=config.clipboard_max_size_mb * 1024 * 1024
    )

    # Initialize hotkey_handler to None (for cleanup)
    hotkey_handler = None

    # Register clipboard receive handler
    async def on_clipboard_received(msg: ClipboardTextMessage) -> None:
        success = clipboard_mgr.set_clipboard_text(msg.content)
        if success:
            print_success(f"Received clipboard from {msg.from_peer} ({msg.source}): {len(msg.content)} chars")
        else:
            print_error("Failed to write clipboard")

    client.register_handler('clipboard_text', on_clipboard_received)

    # Connect
    connected = await client.connect_with_retry()
    if not connected:
        print_error("Failed to connect")
        return

    # Mode-specific setup
    try:
        if config.mode == 'auto':
            # Auto mode: monitor clipboard
            print_info("Auto mode: monitoring clipboard...")

            async def on_clipboard_change(content: str) -> None:
                await client.send_clipboard(content, source='auto')
                print_success(f"Sent clipboard: {len(content)} chars")

            await clipboard_mgr.start_monitoring(on_clipboard_change)

        elif config.mode == 'manual':
            # Manual mode: hotkey handler
            print_info(f"Manual mode: press {config.hotkey} to send clipboard")

            hotkey_handler = HotkeyHandler(config.log_level)

            async def send_current_clipboard() -> None:
                content = clipboard_mgr.get_clipboard_text()
                if content:
                    await client.send_clipboard(content, source='manual')
                    print_success(f"Sent clipboard: {len(content)} chars")
                else:
                    print_warning("Clipboard is empty")

            hotkey_handler.register_hotkey(config.hotkey, send_current_clipboard)
            await hotkey_handler.start()

        # Maintain connection
        await client.maintain_connection()

    except (KeyboardInterrupt, asyncio.CancelledError):
        # Graceful shutdown on Ctrl+C
        pass
    finally:
        # Cleanup
        if config.mode == 'auto':
            await clipboard_mgr.stop_monitoring()
        elif config.mode == 'manual' and hotkey_handler:
            hotkey_handler.stop()
        await client.disconnect()


@cli.command()
def init() -> None:
    """
    Create a default configuration file with Phase 2 fields
    """
    config_filename = 'config.yaml'
    config_path = Path(config_filename)

    if config_path.exists():
        if not click.confirm(f'{config_filename} already exists. Overwrite?'):
            return

    # Prompt for Worker URL
    worker_url = Prompt.ask(
        "Cloudflare Worker URL",
        default=DEFAULT_WORKER_URL
    )

    # Create config with Phase 2 defaults
    config = AppConfig(
        worker_url=worker_url,
        peer_id='',  # Will be auto-generated
        proxy=ProxyConfig(),
        mode='manual',
        hotkey='<ctrl>+<shift>+c',
        clipboard_poll_interval=0.5,
        clipboard_max_size_mb=1,
        enable_reconnect=True,
        reconnect_max_attempts=10
    )

    config.to_yaml(config_filename)

    print_success(f"Configuration saved to {config_filename}")
    console.print("\n[dim]You can now use 'wsclip start --mode auto' or 'wsclip start --mode manual'[/dim]")


if __name__ == '__main__':
    cli()
