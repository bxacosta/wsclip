"""CLI commands for WSClip."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
import click
from rich.prompt import Prompt
from rich.table import Table

from ..core.sync_manager import SyncManager
from ..core.pairing import PairingManager
from ..models.config import AppConfig, ConnectionConfig, ClipboardConfig, ProxyConfig, LoggingConfig
from ..utils.logger import console, print_info, print_success, print_error
from ..utils.helpers import generate_peer_id
from ..utils.paths import get_config_file, ensure_config_dir
from ..config.settings import Settings


def get_or_generate_peer_id(config: AppConfig) -> str:
    """Get peer_id from config or generate new one."""
    if config.connection.peer_id and config.connection.peer_id.strip():
        return config.connection.peer_id.strip()
    else:
        return generate_peer_id()


@click.command()
@click.option('--mode', type=click.Choice(['auto', 'manual']), default='manual', help='Clipboard sync mode')
@click.option('--token', default=None, help='Pairing token (optional)')
@click.option('--config', default=None, help='Config file path (default: ~/.config/wsclip/config.json)')
def start_command(mode: str, token: str | None, config: str | None) -> None:
    """
    Start clipboard sync with specified mode.

    Token precedence:
    1. --token parameter → use and save to config
    2. config.json token → use that
    3. None → generate new token and save to config
    """
    # Determine config path
    if config is None:
        config_path = get_config_file()
    else:
        config_path = Path(config)

    # Load or create config
    if config_path.exists():
        try:
            app_config = AppConfig.from_json(config_path)
        except (FileNotFoundError, ValueError) as e:
            print_error(f"Error loading config: {e}")
            sys.exit(1)
    else:
        # Create default config
        print_info(f"Config not found. Creating default config at {config_path}")
        try:
            ensure_config_dir()
        except (PermissionError, OSError) as e:
            print_error(f"Cannot create config directory: {e}")
            sys.exit(1)

        app_config = AppConfig(
            connection=ConnectionConfig(worker_url=Settings.DEFAULT_WORKER_URL),
            clipboard=ClipboardConfig(mode=mode),
            proxy=ProxyConfig(),
            logging=LoggingConfig()
        )
        app_config.save(config_path)

    # Token resolution with precedence
    pairing = PairingManager(app_config)

    if token:
        # Priority 1: --token parameter
        pairing.join_with_token(token, str(config_path))
    elif not app_config.connection.token:
        # Priority 3: Generate new token
        console.print("[cyan]Generating new token...[/cyan]")
        generated_token = pairing.generate_token()

        if not generated_token:
            sys.exit(1)

        console.print()
        console.print("━" * 50, style="green")
        console.print(f"  Generated Token: [bold green]{generated_token}[/bold green]", justify="center")
        console.print("━" * 50, style="green")
        console.print()
        console.print("Share this token with the other peer:")
        console.print(f"  [dim]wsclip start --mode {mode} --token {generated_token}[/dim]")
        console.print()
    # else: Priority 2: use token from config.json

    # Generate peer_id if not defined
    app_config.connection.peer_id = get_or_generate_peer_id(app_config)
    app_config.clipboard.mode = mode

    # Create sync manager
    sync_manager = SyncManager(app_config)

    # Start with proper cleanup
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    interrupted = False
    try:
        loop.run_until_complete(sync_manager.start())
    except KeyboardInterrupt:
        interrupted = True
    finally:
        # Cleanup
        loop.run_until_complete(sync_manager.stop())
        
        # Cancel all pending tasks
        pending = asyncio.all_tasks(loop)
        for task in pending:
            task.cancel()

        if pending:
            loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))

        loop.close()
        sys.exit(0)


@click.command()
@click.option('--config', default=None, help='Config file path (default: ~/.config/wsclip/config.json)')
def status_command(config: str | None) -> None:
    """Show connection status and configuration."""
    # Determine config path
    if config is None:
        config_path = get_config_file()
    else:
        config_path = Path(config)

    if not config_path.exists():
        print_error(f"Config file not found: {config_path}")
        print_info("Run 'wsclip init' to create a configuration file")
        return

    # Load config
    try:
        app_config = AppConfig.from_json(config_path)
    except (FileNotFoundError, ValueError) as e:
        print_error(f"Error loading config: {e}")
        return

    # Display status table
    table = Table(title="WSClip Status")
    table.add_column("Property", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Config File", str(config_path))
    table.add_row("Mode", app_config.clipboard.mode)
    table.add_row("Hotkey", app_config.clipboard.hotkey if app_config.clipboard.mode == 'manual' else 'N/A')
    table.add_row("Worker URL", app_config.connection.worker_url)
    table.add_row("Peer ID", app_config.connection.peer_id if app_config.connection.peer_id else '[dim]auto-generated[/dim]')
    table.add_row("Token", app_config.connection.token if app_config.connection.token else '[dim]not set[/dim]')
    table.add_row("Auto-reconnect", "Enabled" if app_config.connection.reconnect.enabled else "Disabled")
    table.add_row("Reconnect Attempts", str(app_config.connection.reconnect.max_attempts))
    table.add_row("Poll Interval", f"{app_config.clipboard.poll_interval}s")
    table.add_row("Max Size", f"{app_config.clipboard.max_size_mb}MB")
    table.add_row("Proxy Enabled", "Yes" if app_config.proxy.enabled else "No")
    table.add_row("Log Level", app_config.logging.level)

    console.print(table)


@click.command()
def init_command() -> None:
    """Create a default configuration file."""
    config_path = get_config_file()

    if config_path.exists():
        if not click.confirm(f'{config_path} already exists. Overwrite?'):
            return

    # Ensure config directory exists
    try:
        ensure_config_dir()
    except (PermissionError, OSError) as e:
        print_error(f"Cannot create config directory: {e}")
        return

    # Prompt for Worker URL
    worker_url = Prompt.ask(
        "Cloudflare Worker URL",
        default=Settings.DEFAULT_WORKER_URL
    )

    # Create config with hierarchical structure
    config = AppConfig(
        connection=ConnectionConfig(
            worker_url=worker_url,
            peer_id='',  # Will be auto-generated
            token='',
        ),
        clipboard=ClipboardConfig(
            mode='manual',
            hotkey='<alt>+<shift>+<enter>',
            poll_interval=0.5,
            max_size_mb=1,
        ),
        proxy=ProxyConfig(),
        logging=LoggingConfig(level='INFO')
    )

    config.save(config_path)

    print_success(f"Configuration saved to {config_path}")
    console.print("\n[dim]You can now use 'wsclip start --mode auto' or 'wsclip start --mode manual'[/dim]")
