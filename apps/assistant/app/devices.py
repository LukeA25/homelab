"""Enrolled devices: revocable per-device credentials with scopes.

Standard library only: the Phase 1b nova-auth container reads the same
database through this module.

Enroll from the host:
    docker exec assistant python -m app.devices enroll iphone --scopes '*'
    docker exec assistant python -m app.devices list
    docker exec assistant python -m app.devices revoke legacy-shared
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import re
import secrets
import sys
from dataclasses import dataclass
from datetime import datetime, timezone

from . import store

DB = "devices.db"
TOKEN_PREFIX = "nova_"
LEGACY_ID = "legacy-shared"
_ID = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?")


@dataclass(frozen=True)
class Device:
    id: str
    name: str
    scopes: tuple[str, ...]
    legacy: bool = False

    def allows(self, scope: str) -> bool:
        return scope_allows(self.scopes, scope)


def scope_allows(granted: tuple[str, ...] | list[str], scope: str) -> bool:
    for g in granted:
        if g == "*" or g == scope:
            return True
        if g.endswith(".*") and scope.startswith(g[:-1]):
            return True
    return False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _conn():
    conn = store.connect(DB)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            scopes TEXT NOT NULL,
            secret_hash TEXT NOT NULL,
            legacy INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            revoked_at TEXT
        )
        """
    )
    return conn


def _row_device(row) -> Device:
    return Device(
        id=row["id"],
        name=row["name"],
        scopes=tuple(json.loads(row["scopes"])),
        legacy=bool(row["legacy"]),
    )


def _clean_scopes(scopes: list[str]) -> list[str]:
    out = [s.strip() for s in scopes if s and s.strip()]
    if not out:
        raise ValueError("at least one scope is required")
    return out


def enroll(device_id: str, scopes: list[str], name: str | None = None) -> tuple[Device, str]:
    """Create a device and return its credential. The credential is shown only once."""
    if not _ID.fullmatch(device_id):
        raise ValueError("device id must be lowercase letters, digits and hyphens")
    if device_id == LEGACY_ID:
        raise ValueError(f"{LEGACY_ID} is reserved")
    scopes = _clean_scopes(scopes)
    token = f"{TOKEN_PREFIX}{device_id}_{secrets.token_urlsafe(32)}"
    with _conn() as conn:
        try:
            conn.execute(
                "INSERT INTO devices (id, name, scopes, secret_hash, legacy, created_at) VALUES (?, ?, ?, ?, 0, ?)",
                (device_id, name or device_id, json.dumps(scopes), _hash(token), _now()),
            )
        except Exception as exc:
            raise ValueError(f"device {device_id} already exists") from exc
    return Device(device_id, name or device_id, tuple(scopes)), token


def import_legacy(token: str, scopes: list[str]) -> bool:
    """Register the old shared token once. A revoked legacy record is never re-imported."""
    if not token:
        return False
    with _conn() as conn:
        if conn.execute("SELECT 1 FROM devices WHERE id = ?", (LEGACY_ID,)).fetchone():
            return False
        conn.execute(
            "INSERT INTO devices (id, name, scopes, secret_hash, legacy, created_at) VALUES (?, ?, ?, ?, 1, ?)",
            (LEGACY_ID, "Legacy shared token", json.dumps(_clean_scopes(scopes)), _hash(token), _now()),
        )
    return True


def verify(token: str | None) -> Device | None:
    if not token:
        return None
    digest = _hash(token)
    with _conn() as conn:
        if token.startswith(TOKEN_PREFIX):
            device_id = token[len(TOKEN_PREFIX):].split("_", 1)[0]
            row = conn.execute(
                "SELECT * FROM devices WHERE id = ? AND legacy = 0 AND revoked_at IS NULL", (device_id,)
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM devices WHERE id = ? AND legacy = 1 AND revoked_at IS NULL", (LEGACY_ID,)
            ).fetchone()
    if row is None or not hmac.compare_digest(row["secret_hash"], digest):
        return None
    return _row_device(row)


def revoke(device_id: str) -> bool:
    with _conn() as conn:
        cur = conn.execute(
            "UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", (_now(), device_id)
        )
        return cur.rowcount > 0


def set_scopes(device_id: str, scopes: list[str]) -> bool:
    with _conn() as conn:
        cur = conn.execute(
            "UPDATE devices SET scopes = ? WHERE id = ?", (json.dumps(_clean_scopes(scopes)), device_id)
        )
        return cur.rowcount > 0


def list_devices() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM devices ORDER BY created_at").fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "scopes": json.loads(r["scopes"]),
            "legacy": bool(r["legacy"]),
            "created_at": r["created_at"],
            "revoked_at": r["revoked_at"],
        }
        for r in rows
    ]


def legacy_active() -> bool:
    with _conn() as conn:
        return bool(
            conn.execute(
                "SELECT 1 FROM devices WHERE id = ? AND revoked_at IS NULL", (LEGACY_ID,)
            ).fetchone()
        )


def _main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.devices")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_enroll = sub.add_parser("enroll")
    p_enroll.add_argument("device_id")
    p_enroll.add_argument("--scopes", required=True, help="comma-separated, e.g. 'nova.voice,home.*'")
    p_enroll.add_argument("--name")
    sub.add_parser("list")
    p_revoke = sub.add_parser("revoke")
    p_revoke.add_argument("device_id")
    p_scopes = sub.add_parser("set-scopes")
    p_scopes.add_argument("device_id")
    p_scopes.add_argument("--scopes", required=True)
    args = parser.parse_args(argv)

    if args.cmd == "enroll":
        device, token = enroll(args.device_id, args.scopes.split(","), args.name)
        print(f"Enrolled {device.id} with scopes {', '.join(device.scopes)}")
        print("Credential (shown once, store it on the device):")
        print(token)
    elif args.cmd == "list":
        print(json.dumps(list_devices(), indent=2))
    elif args.cmd == "revoke":
        print("revoked" if revoke(args.device_id) else "not found or already revoked")
    elif args.cmd == "set-scopes":
        print("updated" if set_scopes(args.device_id, args.scopes.split(",")) else "not found")
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
