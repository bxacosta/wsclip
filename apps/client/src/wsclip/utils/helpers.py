"""Helper utilities."""
import uuid


def generate_peer_id() -> str:
    """Generate a unique peer ID."""
    return f"peer-{uuid.uuid4().hex[:8]}"
