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
from ..models.config import AppConfig, ProxyConfig
from ..utils.logger import console, print_info, print_success, print_error
from ..utils.helpers import generate_peer_id
from ..config.settings import Settings


def get_or_generate_peer_id(config: AppConfig) -> str:
    """Get peer_id from config or generate new one."""
    if config.peer_id and config.peer_id.strip():
        return config.peer_id.strip()
    else:
        return generate_peer_id()


@click.command()
@click.option('--mode', type=click.Choice(['auto', 'manual']), default='manual', help='Clipboard sync mode')
@click.option('--token', default=None, help='Pairing token (optional)')
@click.option('--config', default='config.yaml', help='Config file path')
def start_command(mode: str, token: str | None, config: str) -> None:
    """
    Start clipboard sync with specified mode.

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
            worker_url=Settings.DEFAULT_WORKER_URL,
            peer_id='',
            proxy=ProxyConfig(),
            mode=mode
        )

    # Token resolution with precedence
    pairing = PairingManager(app_config)
    
    if token:
        # Priority 1: --token parameter
        pairing.join_with_token(token, config)
    elif not app_config.token:
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
    # else: Priority 2: use token from config.yaml

    # Generate peer_id if not defined
    app_config.peer_id = get_or_generate_peer_id(app_config)
    app_config.mode = mode

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
@click.option('--config', default='config.yaml', help='Config file path')
def status_command(config: str) -> None:
    """Show connection status and configuration."""
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


@click.command()
def init_command() -> None:
    """Create a default configuration file."""
    config_filename = 'config.yaml'
    config_path = Path(config_filename)

    if config_path.exists():
        if not click.confirm(f'{config_filename} already exists. Overwrite?'):
            return

    # Prompt for Worker URL
    worker_url = Prompt.ask(
        "Cloudflare Worker URL",
        default=Settings.DEFAULT_WORKER_URL
    )

    # Create config
    config = AppConfig(
        worker_url=worker_url,
        peer_id='',  # Will be auto-generated
        proxy=ProxyConfig(),
        mode='manual',
        hotkey='<alt>+<shift>+<enter>',
        clipboard_poll_interval=0.5,
        clipboard_max_size_mb=1,
        enable_reconnect=True,
        reconnect_max_attempts=10
    )

    config.to_yaml(config_filename)

    print_success(f"Configuration saved to {config_filename}")
    console.print("\n[dim]You can now use 'wsclip start --mode auto' or 'wsclip start --mode manual'[/dim]")
