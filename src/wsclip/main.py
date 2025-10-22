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

from .core.websocket_client import WebSocketClient
from .models.config import AppConfig, ProxyConfig
from .utils.logger import console, print_info, print_success, print_error
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
@click.version_option(version="1.0.0-phase1")
def cli() -> None:
    """
    WSClip - WebSocket Clipboard Sync

    Phase 1: Text message relay between peers
    """
    pass


@cli.command()
@click.option('--worker-url', default=None, help='Cloudflare Worker URL')
@click.option('--config', default='config.yaml', help='Config file path')
def pair(worker_url: Optional[str], config: str) -> None:
    """
    Generate a new pairing token and wait for peer to connect
    """
    # Load or create config
    config_path = Path(config)

    if config_path.exists():
        app_config = AppConfig.from_yaml(config)
    else:
        # Create default config
        worker_url_value = worker_url or DEFAULT_WORKER_URL
        app_config = AppConfig(
            worker_url=worker_url_value,
            peer_id='',
            proxy=ProxyConfig()
        )

    # Generate peer_id if not defined
    app_config.peer_id = get_or_generate_peer_id(app_config)

    # Generate token from Worker
    console.print("[cyan]Generating pairing token...[/cyan]")

    try:
        # Call Worker API to generate token
        api_url = app_config.worker_url.replace('wss://', 'https://').replace('/ws', '')
        response = requests.get(f"{api_url}/api/generate-token", timeout=10)
        response.raise_for_status()

        data = response.json()
        token = data['token']

        app_config.token = token

        # Save config
        app_config.to_yaml(config)

        # Display token
        console.print()
        console.print("━" * 50, style="green")
        console.print(f"  Pairing Token: [bold green]{token}[/bold green]", justify="center")
        console.print("━" * 50, style="green")
        console.print()
        console.print(f"Share this token with the other peer:")
        console.print(f"  [dim]wsclip connect {token}[/dim]")
        console.print()

        # Start WebSocket client
        asyncio.run(_run_client(app_config))

    except requests.RequestException as e:
        print_error(f"Failed to generate token: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print_info("Interrupted by user")
        sys.exit(0)


@cli.command()
@click.argument('token')
@click.option('--worker-url', default=None, help='Cloudflare Worker URL')
@click.option('--config', default='config.yaml', help='Config file path')
def connect(token: str, worker_url: Optional[str], config: str) -> None:
    """
    Connect to a peer using their pairing token
    """
    # Load or create config
    config_path = Path(config)

    if config_path.exists():
        app_config = AppConfig.from_yaml(config)
    else:
        worker_url_value = worker_url or DEFAULT_WORKER_URL
        app_config = AppConfig(
            worker_url=worker_url_value,
            peer_id='',
            proxy=ProxyConfig()
        )

    # Generate peer_id if not defined
    app_config.peer_id = get_or_generate_peer_id(app_config)

    # Set token
    app_config.token = token

    # Save config
    app_config.to_yaml(config)

    console.print(f"[cyan]Connecting with token: {token}[/cyan]")

    try:
        asyncio.run(_run_client(app_config))
    except KeyboardInterrupt:
        print_info("Interrupted by user")
        sys.exit(0)


async def _run_client(config: AppConfig) -> None:
    """
    Run the WebSocket client with interactive message sending
    """
    # Create client
    client = WebSocketClient(
        worker_url=config.worker_url,
        token=config.token,
        peer_id=config.peer_id,
        log_level=config.log_level
    )

    # Connect
    connected = await client.connect()

    if not connected:
        print_error("Failed to connect")
        return

    # Create tasks
    listen_task = asyncio.create_task(client.listen())
    input_task = asyncio.create_task(_input_loop(client))

    # Wait for either task to complete
    try:
        await asyncio.gather(listen_task, input_task)
    except Exception as e:
        print_error(f"Error: {e}")
    finally:
        await client.disconnect()


async def _input_loop(client: WebSocketClient) -> None:
    """
    Interactive input loop for sending messages
    Runs in background while listening
    """
    loop = asyncio.get_event_loop()

    console.print()
    console.print("[dim]Type a message and press Enter to send (or 'quit' to exit)[/dim]")
    console.print()

    while True:
        try:
            # Run input in executor to avoid blocking
            message = await loop.run_in_executor(
                None,
                lambda: Prompt.ask("[bold cyan]>[/bold cyan]")
            )

            if message.lower() in ['quit', 'exit', 'q']:
                print_info("Exiting...")
                break

            if message.strip():
                await client.send_text(message)

        except EOFError:
            break
        except Exception as e:
            print_error(f"Input error: {e}")


@cli.command()
def init() -> None:
    """
    Create a default configuration file
    """
    config_path = Path('config.yaml')

    if config_path.exists():
        if not click.confirm('Config file already exists. Overwrite?'):
            return

    # Prompt for Worker URL
    worker_url = Prompt.ask(
        "Cloudflare Worker URL",
        default=DEFAULT_WORKER_URL
    )

    # Create config
    config = AppConfig(
        worker_url=worker_url,
        peer_id='peer_a',
        proxy=ProxyConfig()
    )

    config.to_yaml('config.yaml')

    print_success(f"Configuration saved to {config_path}")


if __name__ == '__main__':
    cli()
