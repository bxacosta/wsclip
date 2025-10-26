"""Reconnection strategy with exponential backoff."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

from wsclip.config.settings import Settings
from wsclip.utils.logger import print_success, print_warning, setup_logger


class ReconnectionStrategy:
    """Handles automatic reconnection with exponential backoff."""

    def __init__(
        self,
        initial_delay: float = Settings.RECONNECT_INITIAL_DELAY,
        max_delay: float = Settings.RECONNECT_MAX_DELAY,
        max_attempts: int = Settings.DEFAULT_RECONNECT_MAX_ATTEMPTS,
    ):
        """
        Initialize reconnection strategy.

        Args:
            initial_delay: Initial delay in seconds
            max_delay: Maximum delay in seconds
            max_attempts: Maximum reconnection attempts
        """
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.max_attempts = max_attempts
        self.logger = setup_logger("reconnect")

        self._attempt_count = 0
        self._current_delay = initial_delay

    def reset(self) -> None:
        """Reset reconnection state after a successful connection."""
        self._attempt_count = 0
        self._current_delay = self.initial_delay

    def get_next_delay(self) -> float:
        """
        Calculate the next reconnection delay with exponential backoff.

        Returns:
            Delay in seconds, or -1 if max attempts exceeded
        """
        if self._attempt_count >= self.max_attempts:
            return -1.0

        delay = self._current_delay
        self._current_delay = min(self._current_delay * 2, self.max_delay)
        self._attempt_count += 1

        return delay

    async def connect_with_retry(self, connect_fn: Callable[[], Awaitable[bool]]) -> bool:
        """
        Attempt connection with automatic retry.

        Args:
            connect_fn: Async function that attempts connection

        Returns:
            True if connected successfully, False if all attempts failed
        """
        self.reset()

        while True:
            try:
                success = await connect_fn()

                if success:
                    print_success("Connected successfully")
                    self.reset()
                    return True

            except Exception as e:
                self.logger.error(f"Connection error: {e}")

            delay = self.get_next_delay()

            if delay < 0:
                print_warning(f"Max reconnection attempts ({self.max_attempts}) exceeded")
                return False

            print_warning(f"Reconnecting in {delay:.1f}s (attempt {self._attempt_count}/{self.max_attempts})...")
            await asyncio.sleep(delay)
