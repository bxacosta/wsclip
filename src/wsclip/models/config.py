"""
Configuration data model
"""
from dataclasses import dataclass
from typing import Optional
import yaml
from pathlib import Path


@dataclass
class ProxyConfig:
    """Proxy configuration (not used in Phase 1)"""
    enabled: bool = False
    host: str = 'localhost'
    port: int = 1080
    type: str = 'socks5'
    username: Optional[str] = None
    password: Optional[str] = None


@dataclass
class AppConfig:
    """Application configuration"""
    # Worker connection
    worker_url: str

    # Peer identification
    peer_id: str

    # Authentication
    token: str = ''

    # Proxy settings (Phase 1: not implemented)
    proxy: Optional[ProxyConfig] = None

    # Logging
    log_level: str = 'INFO'

    @classmethod
    def from_yaml(cls, file_path: str) -> 'AppConfig':
        """Load configuration from YAML file"""
        path = Path(file_path)

        if not path.exists():
            raise FileNotFoundError(f"Config file not found: {file_path}")

        with open(path, 'r') as f:
            data = yaml.safe_load(f)

        # Parse proxy config if present
        proxy_data = data.get('proxy')
        proxy = ProxyConfig(**proxy_data) if proxy_data else ProxyConfig()

        return cls(
            worker_url=data.get('worker_url', ''),
            peer_id=data.get('peer_id', ''),
            token=data.get('token', ''),
            proxy=proxy,
            log_level=data.get('log_level', 'INFO')
        )

    def to_yaml(self, file_path: str) -> None:
        """Save configuration to YAML file"""
        data = {
            'worker_url': self.worker_url,
            'peer_id': self.peer_id,
            'token': self.token,
            'log_level': self.log_level,
            'proxy': {
                'enabled': self.proxy.enabled,
                'host': self.proxy.host,
                'port': self.proxy.port,
                'type': self.proxy.type,
            } if self.proxy else None
        }

        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, 'w') as f:
            yaml.dump(data, f, default_flow_style=False)
