"""VAPID identity and Web Push delivery. Keys stay on disk so phones stay subscribed."""

from __future__ import annotations

import base64
import json
import logging
import os
import threading
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from py_vapid import Vapid
from pywebpush import WebPushException, webpush

from . import db

log = logging.getLogger("notify")
_KEY_PATH = Path(os.getenv("NOTIFY_VAPID", "/data/vapid.json"))
_SUBJECT = os.getenv("NOTIFY_SUBJECT", "mailto:notify@home.arpa")
_LOCK = threading.Lock()
_PRIVATE_PEM: str | None = None
_PUBLIC_B64: str | None = None


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _load() -> None:
    global _PRIVATE_PEM, _PUBLIC_B64
    if _PRIVATE_PEM is not None:
        return
    with _LOCK:
        if _PRIVATE_PEM is not None:
            return
        _KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
        if _KEY_PATH.exists():
            saved = json.loads(_KEY_PATH.read_text())
            pem = saved["private_pem"]
        else:
            vapid = Vapid()
            vapid.generate_keys()
            pem = vapid.private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            ).decode()
            tmp = _KEY_PATH.with_suffix(".tmp")
            tmp.write_text(json.dumps({"private_pem": pem}))
            tmp.replace(_KEY_PATH)
            os.chmod(_KEY_PATH, 0o600)
        private = load_pem_private_key(pem.encode(), password=None)
        raw = private.public_key().public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint,
        )
        _PRIVATE_PEM = pem
        _PUBLIC_B64 = _b64url(raw)


def public_key() -> str:
    _load()
    assert _PUBLIC_B64 is not None
    return _PUBLIC_B64


def send(app: str, title: str, body: str, url: str, tag: str) -> dict[str, int]:
    _load()
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})
    delivered = 0
    removed = 0
    failed = 0
    for row in db.for_app(app):
        try:
            webpush(
                subscription_info={
                    "endpoint": row["endpoint"],
                    "keys": {"p256dh": row["p256dh"], "auth": row["auth"]},
                },
                data=payload,
                vapid_private_key=_PRIVATE_PEM,
                vapid_claims={"sub": _SUBJECT},
                ttl=60 * 60 * 24,
            )
            delivered += 1
        except WebPushException as exc:
            status = exc.response.status_code if exc.response is not None else None
            if status in (404, 410):
                db.delete(row["endpoint"])
                removed += 1
            else:
                failed += 1
                log.warning("push to %s failed: %s", app, status or exc)
        except Exception:
            failed += 1
            log.exception("push to %s failed", app)
    return {"delivered": delivered, "removed": removed, "failed": failed}
