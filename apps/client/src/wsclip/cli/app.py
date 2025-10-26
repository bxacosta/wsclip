"""CLI application entry point."""
import click

from wsclip.cli.commands import start_command, status_command, init_command


@click.group()
@click.version_option(version="0.0.2")
def cli() -> None:
    """
    WSClip - WebSocket Clipboard Sync
    
    Real clipboard synchronization between peers.
    """
    pass


# Register commands
cli.add_command(start_command, name='start')
cli.add_command(status_command, name='status')
cli.add_command(init_command, name='init')


if __name__ == '__main__':
    cli()
