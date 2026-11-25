"""Per-request correlation data, read by the audit log."""

from __future__ import annotations

from contextvars import ContextVar

request_id: ContextVar[str | None] = ContextVar("request_id", default=None)
device_id: ContextVar[str | None] = ContextVar("device_id", default=None)
session_id: ContextVar[str | None] = ContextVar("session_id", default=None)
