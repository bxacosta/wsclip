"""Reconnection strategy with exponential backoff."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

from wsclip.config.settings import Settings
from wsclip.utils.logger import AppLogger


class ReconnectionStrategy:
    """Handles automatic reconnection with exponential backoff."""

    def __init__(
        self,
        initial_delay: float = Settings.RECONNECT_INITIAL_DELAY,
        max_delay: float = Settings.RECONNECT_MAX_DELAY,
        max_attempts: int = Settings.DEFAULT_RECONNECT_MAX_ATTEMPTS,
        logger: AppLogger | None = None,
    ):
        """
        Initialize reconnection strategy.

        Args:
            initial_delay: Initial delay in seconds
            max_delay: Maximum delay in seconds
            max_attempts: Maximum reconnection attempts
            logger: Application logger (for user-facing messages)
        """
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.max_attempts = max_attempts

        # Unified logger (works for Console and TUI)
        self.logger: AppLogger
        if logger is None:
            # Fallback to console logger if not provided
            from wsclip.utils.logger import create_logger

            self.logger = create_logger(mode="console", component_name="reconnect")
        else:
            self.logger = logger

        self._attempt_count = 0
        self._current_delay = initial_delay

    def reset(self) -> None:
        """Reset reconnection state after a successful connection."""
        self.logger.debug(
            f"Resetting reconnection state: attempt_count={self._attempt_count} -> 0, "
            f"current_delay={self._current_delay:.1f}s -> {self.initial_delay:.1f}s"
        )
        self._attempt_count = 0
        self._current_delay = self.initial_delay

    def get_next_delay(self) -> float:
        """
        Calculate the next reconnection delay with exponential backoff.

        Returns:
            Delay in seconds, or -1 if max attempts exceeded
        """
        if self._attempt_count >= self.max_attempts:
            self.logger.debug(f"Max attempts reached: {self._attempt_count} >= {self.max_attempts}")
            return -1.0

        delay = self._current_delay
        next_delay = min(self._current_delay * 2, self.max_delay)
        self.logger.debug(
            f"Calculating reconnect delay: attempt={self._attempt_count + 1}/{self.max_attempts}, "
            f"delay={delay:.1f}s, next_delay={next_delay:.1f}s"
        )
        self._current_delay = next_delay
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
        self.logger.debug("Starting connect_with_retry sequence")
        self.reset()

        while True:
            try:
                self.logger.debug(f"Attempting connection (try {self._attempt_count + 1}/{self.max_attempts})...")
                success = await connect_fn()

                if success:
                    self.logger.debug("Connection successful, resetting retry state")
                    self.logger.info("Connected to relay server")
                    self.reset()
                    return True
                else:
                    self.logger.debug("Connection attempt returned False")

            except Exception as e:
                self.logger.error(f"Connection attempt failed with exception: {e}")

            delay = self.get_next_delay()

            if delay < 0:
                self.logger.warning(f"Max reconnection attempts exceeded: {self.max_attempts}")
                self.logger.warning(f"Max reconnection attempts ({self.max_attempts}) exceeded")
                return False

            self.logger.debug(f"Waiting {delay:.1f}s before next attempt...")
            self.logger.warning(f"Reconnecting in {delay:.1f}s (attempt {self._attempt_count}/{self.max_attempts})...")
            await asyncio.sleep(delay)
