"""Paths, atomic file writes and SQLite connections under the Nova data dir.

Standard library only so a separate auth container can reuse it.
"""

from __future__ import annotations

import fcntl
import os
import sqlite3
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


def data_dir() -> Path:
    return Path(os.getenv("NOVA_DATA_DIR", "/data"))


def path(*parts: str) -> Path:
    p = data_dir().joinpath(*parts)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def atomic_write(target: Path, text: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=f".{target.name}.")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, target)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


@contextmanager
def file_lock(target: Path) -> Iterator[None]:
    """Cross-process lock, so the gateway and nova-engine never interleave writes."""
    lock_path = target.with_name(f".{target.name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_path, "a+") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def connect(name: str, *, journal: str = "WAL", readonly: bool = False) -> sqlite3.Connection:
    """Open a database under the data dir.

    WAL readers need write access to the directory, so a database that a
    read-only mount must read uses journal="DELETE" instead.
    """
    if readonly:
        uri = f"file:{data_dir().joinpath(name)}?mode=ro"
        conn = sqlite3.connect(uri, uri=True, timeout=10, isolation_level=None)
    else:
        conn = sqlite3.connect(path(name), timeout=10, isolation_level=None)
        conn.execute(f"PRAGMA journal_mode={journal}")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=10000")
    return conn
