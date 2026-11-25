"""Live voice sessions (GPT Live) with a server-side sideband.

The browser sends its WebRTC offer here. The gateway creates the session with
the OpenAI key, returns the answer SDP, and attaches to the session's sideband
WebSocket. All tool calls are executed here through dispatch (scopes,
approvals and audit apply exactly as for classic turns); the browser only
carries audio and captions and never sees a credential or a tool result.

The gateway also keeps the transcript, tracks usage and cost, and ends the
session after a stretch of silence or at the maximum length.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import deque
from typing import Any

import httpx

from . import approvals, audit, bootstrap, dispatch, nova_config, registry, reqctx, sessions
from .config import settings
from .devices import Device
from .tools import CallContext, parse_tool_args

log = logging.getLogger("nova.live")

TURN_GAP_S = 0.7
TICK_S = 0.25
CLOSE_WAIT_S = 5.0
REATTACH_ATTEMPTS = 3

_ACTIVE: dict[str, "LiveSession"] = {}


class LiveError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _headers() -> dict[str, str]:
    key = settings()["openai_api_key"]
    if not key:
        raise LiveError(503, "Voice is not configured on the server")
    return {"Authorization": f"Bearer {key}"}


async def _create_remote(payload: dict[str, Any]) -> dict[str, Any]:
    url = f"{settings()['live_api_base']}/live/sessions"
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.post(url, json=payload, headers=_headers())
        except httpx.HTTPError as exc:
            raise LiveError(502, "Could not reach the voice service") from exc
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("error", {}).get("message") or "Voice connection failed"
        except ValueError:
            detail = "Voice connection failed"
        raise LiveError(resp.status_code if resp.status_code < 500 else 502, detail)
    return resp.json()


def _connect(live_id: str):
    """Open the sideband. Replaced in tests."""
    from websockets.asyncio.client import connect

    url = settings()["live_api_base"].replace("https://", "wss://", 1) + f"/live/sessions/{live_id}/attach"
    return connect(url, additional_headers=_headers(), max_size=4 * 1024 * 1024)


class LiveSession:
    def __init__(self, conv_id: str, live_id: str, device: Device):
        cfg = settings()
        self.conv_id = conv_id
        self.live_id = live_id
        self.device = device
        self.idle_end_s = cfg["live_idle_end_s"]
        self.max_s = cfg["live_max_minutes"] * 60
        self.started = time.monotonic()
        self.last_activity = self.started
        self.warned_max = False
        self.closing = False
        self.close_reason: str | None = None
        self.finished = asyncio.Event()
        self.attached = asyncio.Event()
        self.ws: Any = None
        self.seen: deque[str] = deque(maxlen=512)
        self.buf = {"user": "", "assistant": ""}
        self.buf_at = 0.0
        self.last_user_text: str | None = None
        self.tool_tasks: set[asyncio.Task] = set()
        self.calls = 0
        self.usage_seen = False
        self.task: asyncio.Task | None = None

    # --- sideband plumbing -------------------------------------------------------

    async def send(self, event: dict[str, Any]) -> None:
        if self.ws is not None:
            await self.ws.send(json.dumps(event))

    async def run(self) -> None:
        reqctx.device_id.set(self.device.id)
        reqctx.session_id.set(self.conv_id)
        reqctx.request_id.set(f"live-{self.conv_id}")
        ticker = asyncio.create_task(self._tick())
        reason = "sideband_lost"
        try:
            for attempt in range(REATTACH_ATTEMPTS + 1):
                try:
                    async with _connect(self.live_id) as ws:
                        self.ws = ws
                        self.attached.set()
                        async for raw in ws:
                            if await self.handle(json.loads(raw)):
                                reason = self.close_reason or "closed"
                                return
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    log.warning("live sideband %s dropped: %s", self.live_id, exc)
                finally:
                    self.ws = None
                if self.closing:
                    reason = self.close_reason or "closed"
                    return
                await asyncio.sleep(min(2 ** attempt, 5))
        finally:
            ticker.cancel()
            await self._finalize(self.close_reason or reason)

    async def close(self, reason: str) -> None:
        if self.closing:
            return
        self.closing = True
        self.close_reason = reason
        try:
            # Ending right after start: wait for the sideband so the remote session really stops.
            await asyncio.wait_for(self.attached.wait(), CLOSE_WAIT_S)
            await self.send({"type": "session.close"})
        except Exception as exc:
            log.warning("could not send session.close for %s: %s", self.live_id, exc)
        try:
            await asyncio.wait_for(self.finished.wait(), CLOSE_WAIT_S)
        except asyncio.TimeoutError:
            if self.task:
                self.task.cancel()

    async def _tick(self) -> None:
        while True:
            await asyncio.sleep(TICK_S)
            now = time.monotonic()
            if self.buf_at and now - self.buf_at >= TURN_GAP_S:
                await self._flush()
            if self.closing:
                continue
            busy = any(not t.done() for t in self.tool_tasks)
            if busy:
                self.last_activity = now
            elif now - self.last_activity >= self.idle_end_s:
                asyncio.create_task(self.close("idle"))
            if now - self.started >= self.max_s:
                asyncio.create_task(self.close("max_duration"))
            elif not self.warned_max and now - self.started >= self.max_s - 60:
                self.warned_max = True
                await self._commentary("Tell the user this conversation will end in about a minute.")

    async def _commentary(self, text: str) -> None:
        try:
            await self.send({"type": "session.commentary.append", "delegation_id": None, "content": text[:1800]})
        except Exception as exc:
            log.warning("commentary failed for %s: %s", self.live_id, exc)

    # --- events --------------------------------------------------------------------

    async def handle(self, event: dict[str, Any]) -> bool:
        """Process one sideband event. Returns True when the session is over."""
        eid = event.get("event_id")
        if eid:
            if eid in self.seen:
                return False
            self.seen.append(eid)
        kind = event.get("type")
        if kind == "session.input_transcript.delta":
            await self._delta("user", event.get("delta") or "")
        elif kind == "session.output_transcript.delta":
            await self._delta("assistant", event.get("delta") or "")
        elif kind == "response.event":
            await self._backend(event.get("event") or {})
        elif kind == "session.usage.updated":
            usage = event.get("usage") or {}
            self.usage_seen = True
            sessions.set_usage(
                self.conv_id, int(usage.get("seconds") or 0),
                usage.get("active_seconds"), usage.get("paused_seconds"),
            )
        elif kind == "session.closed":
            return True
        elif kind == "error":
            err = event.get("error") or {}
            audit.operation("live_error", live_session=self.live_id, error=err.get("message") or str(err)[:300])
        return False

    async def _delta(self, role: str, text: str) -> None:
        if not text:
            return
        other = "assistant" if role == "user" else "user"
        if self.buf[other].strip():
            await self._flush()
        self.buf[role] += text
        self.buf_at = self.last_activity = time.monotonic()

    async def _flush(self) -> None:
        self.buf_at = 0.0
        for role in ("user", "assistant"):
            text, self.buf[role] = self.buf[role].strip(), ""
            if not text:
                continue
            sessions.add_turn(self.conv_id, role, text)
            if role == "user":
                self.last_user_text = text
                await self._settle_approval(text)

    async def _settle_approval(self, text: str) -> None:
        if not approvals.pending_for(self.device.id, self.conv_id):
            return
        from .pipeline import settle_pending_approval

        note = await settle_pending_approval(text, self.device, self.conv_id, self._request_id())
        if note:
            sessions.add_turn(self.conv_id, "tool", note.splitlines()[0], tool="approval")
            await self._commentary("System update (from the gateway, not the user): " + note)

    def _request_id(self) -> str:
        self.calls += 1
        return f"live-{self.conv_id}-{self.calls}"

    async def _backend(self, inner: dict[str, Any]) -> None:
        kind = inner.get("type")
        if kind == "response.output_item.done" and (inner.get("item") or {}).get("type") == "function_call":
            if self.buf["user"].strip():
                await self._flush()
            task = asyncio.create_task(self._tool(inner["item"]))
            self.tool_tasks.add(task)
            task.add_done_callback(self.tool_tasks.discard)
        elif kind == "response.done":
            usage = (inner.get("response") or {}).get("usage") or {}
            if usage:
                cached = (usage.get("input_tokens_details") or {}).get("cached_tokens") or 0
                sessions.add_backend_tokens(
                    self.conv_id, usage.get("input_tokens") or 0, cached, usage.get("output_tokens") or 0
                )

    async def _tool(self, item: dict[str, Any]) -> None:
        name = item.get("name") or ""
        args = parse_tool_args(item.get("arguments"))
        rid = self._request_id()
        reqctx.request_id.set(rid)
        ctx = CallContext(device=self.device, session_id=self.conv_id, request_id=rid, user_text=self.last_user_text)
        try:
            out = await dispatch.call(name, args, ctx)
        except Exception as exc:
            out = {"ok": False, "error": str(exc)}
        sessions.add_turn(self.conv_id, "tool", out.get("status") or ("ok" if out.get("ok") else "failed"), tool=name, ok=bool(out.get("ok")))
        try:
            await self.send({
                "type": "response.item.create",
                "item": {"type": "function_call_output", "call_id": item.get("call_id"), "output": json.dumps(out, default=str)[:20000]},
            })
            await self.send({"type": "response.create"})
        except Exception as exc:
            log.warning("could not return %s output for %s: %s", name, self.live_id, exc)

    async def _finalize(self, reason: str) -> None:
        try:
            await self._flush()
        except Exception:
            log.exception("final flush failed for %s", self.conv_id)
        for t in list(self.tool_tasks):
            t.cancel()
        if not self.usage_seen:
            # No usage report arrived: bill wall-clock time as active so the budget never undercounts.
            elapsed = int(time.monotonic() - self.started)
            sessions.set_usage(self.conv_id, elapsed, elapsed, 0)
        sessions.end(self.conv_id, reason)
        audit.operation("live_session_ended", live_session=self.live_id, reason=reason)
        _ACTIVE.pop(self.conv_id, None)
        self.finished.set()


def _tools(device: Device) -> list[dict[str, Any]]:
    return [dict(t, strict=False) for t in registry.model_tools(registry.for_device(device))]


async def start(device: Device, sdp: str) -> dict[str, Any]:
    if not isinstance(sdp, str) or not sdp.startswith("v=0"):
        raise LiveError(422, "Invalid SDP offer")
    budget = sessions.budget()
    if budget["blocked"]:
        audit.operation("live_refused", reason="budget", month_usd=budget["month_usd"])
        raise LiveError(402, f"Live voice is paused: this month's voice spend is ${budget['month_usd']:.2f}, "
                             f"over the ${budget['limit_usd']:.0f} limit. Push-to-talk still works.")
    for other in [s for s in _ACTIVE.values() if s.device.id == device.id]:
        await other.close("replaced")

    cfg = settings()
    conv_id = sessions.create("live", device.id)
    payload = {
        "session": {
            "model": cfg["live_model"],
            "instructions": bootstrap.live_voice_instructions(),
            "audio": {"output": {"voice": nova_config.load()["voice"]}},
            "delegation": {
                "type": "responses",
                "responses": {
                    "model": cfg["live_backend_model"],
                    "instructions": bootstrap.live_backend_instructions(device),
                    "tools": _tools(device),
                    "tool_choice": "auto",
                    "parallel_tool_calls": False,
                },
            },
        },
        "transport": {"type": "webrtc", "sdp": sdp},
    }
    try:
        created = await _create_remote(payload)
    except LiveError:
        sessions.end(conv_id, "create_failed")
        raise
    live_id = (created.get("session") or {}).get("id")
    answer = (created.get("transport") or {}).get("sdp")
    if not live_id or not answer:
        sessions.end(conv_id, "create_failed")
        raise LiveError(502, "The voice service returned an incomplete session")
    sessions.set_live_id(conv_id, live_id)

    sess = LiveSession(conv_id, live_id, device)
    _ACTIVE[conv_id] = sess
    sess.task = asyncio.create_task(sess.run())
    audit.operation("live_session_started", live_session=live_id, conversation=conv_id)
    return {
        "conversation_id": conv_id,
        "sdp": answer,
        "budget": budget,
        "idle_end_s": cfg["live_idle_end_s"],
        "max_minutes": cfg["live_max_minutes"],
    }


async def end(conv_id: str, device: Device) -> bool:
    sess = _ACTIVE.get(conv_id)
    if sess is None or sess.device.id != device.id:
        return False
    await sess.close("user_ended")
    return True


def status(conv_id: str) -> dict[str, Any] | None:
    row = sessions.get(conv_id)
    if row is None:
        return None
    return {
        "conversation_id": conv_id,
        "device_id": row["device_id"],
        "active": conv_id in _ACTIVE,
        "ended_reason": row["end_reason"],
        "seconds": row["seconds"],
        "cost_usd": row["cost_usd"],
        "budget": sessions.budget(),
    }


async def shutdown() -> None:
    """Stop billing before the gateway exits: close every live session it holds."""
    await asyncio.gather(*(s.close("gateway_shutdown") for s in list(_ACTIVE.values())), return_exceptions=True)
