# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for wsclip.

Build instructions:
    pyinstaller wsclip.spec

This creates a single-file executable in dist/wsclip.exe
"""

a = Analysis(
    ['src/wsclip/cli/app.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        # WebSocket support
        'websockets',
        'websockets.legacy',
        'websockets.legacy.client',

        # Clipboard support
        'pyperclip',

        # Hotkey support (pynput with platform-specific backends)
        'pynput',
        'pynput.keyboard',
        'pynput.keyboard._win32',

        # SOCKS5 proxy support
        'python_socks',
        'python_socks.async_',
        'python_socks.async_.asyncio',

        # CLI and UI
        'click',
        'rich',
        'rich.console',
        'rich.table',
        'rich.prompt',
        'rich.logging',

        # HTTP client
        'requests',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude unused modules to reduce size
        'tkinter',
        'matplotlib',
        'numpy',
        'pandas',
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='wsclip',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Keep console window for CLI application
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
