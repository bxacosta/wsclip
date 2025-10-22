"""
WebSocket reconnection strategy with exponential backoff
"""
import asyncio
from typing import Callable, Awaitable
from ..utils.logger import setup_logger, print_warning, print_success


class ReconnectionStrategy:
    """
    Handles automatic reconnection with exponential backoff
    """

    def __init__(
        self,
        initial_delay: float = 1.0,
        max_delay: float = 30.0,
        max_attempts: int = 10,
        log_level: str = "INFO"
    ):
        """
        Initialize reconnection strategy

        Args:
            initial_delay: Initial delay in seconds (default 1.0)
            max_delay: Maximum delay in seconds (default 30.0)
            max_attempts: Maximum reconnection attempts (default 10)
            log_level: Logging level
        """
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.max_attempts = max_attempts
        self.logger = setup_logger("reconnect", log_level)

        self._attempt_count = 0
        self._current_delay = initial_delay

    def reset(self) -> None:
        """Reset reconnection state (call after successful connection)"""
        self._attempt_count = 0
        self._current_delay = self.initial_delay

    def get_next_delay(self) -> float:
        """
        Calculate next reconnection delay with exponential backoff

        Returns:
            Delay in seconds, or -1 if max attempts exceeded
        """
        if self._attempt_count >= self.max_attempts:
            return -1.0

        delay = self._current_delay

        # Exponential backoff: 1, 2, 4, 8, 16, 30, 30, ...
        self._current_delay = min(self._current_delay * 2, self.max_delay)
        self._attempt_count += 1

        return delay

    async def connect_with_retry(
        self,
        connect_fn: Callable[[], Awaitable[bool]]
    ) -> bool:
        """
        Attempt connection with automatic retry

        Args:
            connect_fn: Async function that attempts connection

        Returns:
            True if connected successfully, False if all attempts failed
        """
        self.reset()

        while True:
            try:
                # Attempt connection
                success = await connect_fn()

                if success:
                    print_success("Connected successfully")
                    self.reset()
                    return True

            except Exception as e:
                self.logger.error(f"Connection error: {e}")

            # Get next delay
            delay = self.get_next_delay()

            if delay < 0:
                print_warning(f"Max reconnection attempts ({self.max_attempts}) exceeded")
                return False

            # Wait before retry
            print_warning(
                f"Reconnecting in {delay:.1f}s "
                f"(attempt {self._attempt_count}/{self.max_attempts})..."
            )
            await asyncio.sleep(delay)
