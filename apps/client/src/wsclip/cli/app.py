"""CLI application entry point."""

import click

from wsclip.cli.commands import config_command, start_command, status_command


@click.group(context_settings={"max_content_width": 100})
@click.version_option(version="0.0.2")
def cli() -> None:
    """
    WSClip - WebSocket Clipboard Sync

    Real clipboard synchronization between peers.
    """
    pass


# Register commands
cli.add_command(start_command, name="start")
cli.add_command(status_command, name="status")
cli.add_command(config_command, name="config")


if __name__ == "__main__":
    cli()
