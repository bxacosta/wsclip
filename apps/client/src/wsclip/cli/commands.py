"""CLI commands for WSClip."""

from __future__ import annotations

import asyncio
import contextlib
import sys
from pathlib import Path

import click
from rich.table import Table

from wsclip.config.settings import Settings
from wsclip.core.pairing import PairingManager
from wsclip.core.sync_manager import SyncManager
from wsclip.models.config import AppConfig
from wsclip.models.messages import ClipboardSyncMode
from wsclip.utils.helpers import generate_peer_id
from wsclip.utils.logger import console, create_logger
from wsclip.utils.paths import ensure_config_dir, get_config_file

logger = create_logger(mode="console")


def _cancel_pending_tasks(loop: asyncio.AbstractEventLoop) -> None:
    """Cancel all pending tasks in the event loop."""
    pending = asyncio.all_tasks(loop)
    for task in pending:
        task.cancel()
    # Wait for all tasks to be cancelled
    for task in pending:
        with contextlib.suppress(asyncio.CancelledError, Exception):
            loop.run_until_complete(task)


def get_or_generate_peer_id(config: AppConfig) -> str:
    """Get peer_id from config or generate a new one."""
    if config.connection.peer_id and config.connection.peer_id.strip():
        return config.connection.peer_id.strip()

    return generate_peer_id()


@click.command()
@click.option(
    "--config",
    type=click.Path(exists=True, path_type=Path),
    default=None,
    help="Config file path (default: ~/.config/wsclip/config.json)",
)
@click.option(
    "--mode",
    type=click.Choice([mode.value for mode in ClipboardSyncMode]),
    default=ClipboardSyncMode.MANUAL.value,
    help="Clipboard sync mode",
)
@click.option("--token", default=None, help="Pairing token")
@click.option("--tui", is_flag=True, help="Enable TUI mode (default: console logs)")
def start_command(config: Path | None, mode: str, token: str | None, tui: bool) -> None:
    """
    Start clipboard sync with a specified mode.
    """

    config_path: Path = config or get_config_file()
    sync_mode: ClipboardSyncMode = ClipboardSyncMode(mode) or Settings.DEFAULT_CLIPBOARD_MODE

    if config_path.exists():
        try:
            app_config = AppConfig.from_json(config_path)
        except (FileNotFoundError, ValueError) as e:
            logger.error(f"Error loading config: {e}")
            sys.exit(1)
    else:
        logger.info("No configuration found. Launching configuration wizard...")
        logger.info("(You can reconfigure anytime with 'wsclip config')")

        try:
            ensure_config_dir()
        except (PermissionError, OSError) as e:
            logger.error(f"Cannot create config directory: {e}")
            sys.exit(1)

        # Import and run wizard
        from wsclip.cli.config_wizard import ConfigWizard

        wizard = ConfigWizard()
        app_config = wizard.run(full_mode=False, new_config=True)
        app_config.save(config_path)

        logger.info(f"Configuration saved to {config_path}")

    # Generate peer_id if not defined
    app_config.connection.peer_id = get_or_generate_peer_id(app_config)
    app_config.clipboard.sync_mode = sync_mode

    # Create a sync manager with TUI mode
    sync_manager = SyncManager(app_config, tui_mode=tui)

    # Start TUI if enabled (prevents flickering by starting before messages)
    if tui and sync_manager.tui:
        sync_manager.tui.start()

    pairing = PairingManager(app_config)

    if token:
        # Priority 1: --token parameter
        if pairing.join_with_token(token, config_path):
            sync_manager.logger.info(f"Using token from parameter: {token}")
        else:
            sync_manager.logger.error("Failed to save token to config")
    elif not app_config.connection.token:
        generated_token = pairing.generate_token()

        if not generated_token:
            sync_manager.logger.error("Failed to generate token")
            if sync_manager.tui:
                sync_manager.tui.stop()
            sys.exit(1)

        sync_manager.logger.info(f"Generated Token: {generated_token}")
        sync_manager.logger.info("Share this token with the other peer:")
        sync_manager.logger.info(f"  wsclip start --mode {sync_mode.value} --token {generated_token}")
    else:
        sync_manager.logger.info(f"Using token from config: {app_config.connection.token}")

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        loop.run_until_complete(sync_manager.start())
    except KeyboardInterrupt:
        sync_manager.logger.info("Shutting down...")
        _cancel_pending_tasks(loop)
    except Exception as e:
        sync_manager.logger.error(f"Unexpected error: {e}")
        _cancel_pending_tasks(loop)
    finally:
        try:
            loop.run_until_complete(sync_manager.stop())
        except Exception:
            pass
        finally:
            loop.close()


@click.command()
@click.option(
    "--config",
    type=click.Path(exists=True, path_type=Path),
    default=None,
    help="Config file path (default: ~/.config/wsclip/config.json)",
)
def status_command(config: Path | None) -> None:
    """Show connection status and configuration."""
    config_path: Path = get_config_file() if config is None else config

    if not config_path.exists():
        logger.error(f"Config file not found: {config_path}")
        logger.info("Run 'wsclip init' to create a configuration file")
        return

    try:
        app_config = AppConfig.from_json(config_path)
    except (FileNotFoundError, ValueError) as e:
        logger.error(f"Error loading config: {e}")
        return

    # Display status table
    table = Table(title="WSClip Status")
    table.add_column("Property", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Config File", str(config_path))
    table.add_row("Mode", app_config.clipboard.sync_mode.value)
    table.add_row(
        "Hotkey", app_config.clipboard.hotkey if app_config.clipboard.sync_mode == ClipboardSyncMode.MANUAL else "N/A"
    )
    table.add_row("Worker URL", app_config.connection.worker_url)
    table.add_row(
        "Peer ID", str(app_config.connection.peer_id) if app_config.connection.peer_id else "[dim]auto-generated[/dim]"
    )
    table.add_row("Token", str(app_config.connection.token) if app_config.connection.token else "[dim]not set[/dim]")
    table.add_row("Auto-reconnect", "Enabled" if app_config.connection.reconnect.enabled else "Disabled")
    table.add_row("Reconnect Attempts", str(app_config.connection.reconnect.max_attempts))
    table.add_row("Poll Interval", f"{app_config.clipboard.poll_interval}s")
    table.add_row("Max Size", f"{app_config.clipboard.max_size_mb}MB")
    table.add_row("Proxy Enabled", "Yes" if app_config.proxy.enabled else "No")
    table.add_row("Log Level", app_config.logging.level)

    console.print(table)


@click.command()
@click.option("--full", is_flag=True, help="Include advanced settings")
@click.option("--new", is_flag=True, help="Create new config (ignore existing)")
def config_command(full: bool, new: bool) -> None:
    """Interactive configuration wizard."""
    from wsclip.cli.config_wizard import ConfigWizard

    config_path: Path = get_config_file()

    try:
        ensure_config_dir()
    except (PermissionError, OSError) as e:
        logger.error(f"Cannot create config directory: {e}")
        return

    # Load existing config if available (unless --new flag)
    existing_config = None
    if not new and config_path.exists():
        try:
            existing_config = AppConfig.from_json(config_path)
        except (FileNotFoundError, ValueError) as e:
            logger.error(f"Error loading existing config: {e}")
            logger.info("Proceeding with new configuration...")

    # Run wizard
    wizard = ConfigWizard(existing_config=existing_config)
    config = wizard.run(full_mode=full, new_config=new)

    # Save configuration
    config.save(config_path)

    logger.info(f"Configuration saved to {config_path}")
    console.print("\n[dim]You can now use 'wsclip start --mode auto' or 'wsclip start --mode manual'[/dim]")

