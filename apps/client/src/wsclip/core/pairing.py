"""Pairing manager for token generation and joining."""

from __future__ import annotations

from pathlib import Path

import requests

from wsclip.models.config import AppConfig
from wsclip.utils.logger import print_error, print_success


class PairingManager:
    """Manages peer pairing with tokens."""

    def __init__(self, config: AppConfig):
        """
        Initialize pairing manager.

        Args:
            config: Application configuration
        """
        self.config = config
        self.api_url = config.connection.worker_url.replace("wss://", "https://").replace("/ws", "")

    def generate_token(self) -> str | None:
        """
        Generate a new pairing token from the relay server.

        Returns:
            Generated token or None if failed
        """
        try:
            response = requests.get(f"{self.api_url}/api/generate-token", timeout=10)
            response.raise_for_status()
            data = response.json()
            token = data["token"]

            # Save to config
            self.config.connection.token = token
            self.config.save()

            print_success(f"Generated token: {token}")
            return token
        except requests.RequestException as e:
            print_error(f"Failed to generate token: {e}")
            return None

    def join_with_token(self, token: str, config_path: Path) -> bool:
        """
        Join a session with an existing token.

        Args:
            token: Pairing token
            config_path: Path to save config

        Returns:
            True if successful
        """
        try:
            self.config.connection.token = token
            self.config.save(config_path)
            print_success(f"Joined with token: {token}")
            return True
        except Exception as e:
            print_error(f"Failed to save token: {e}")
            return False
