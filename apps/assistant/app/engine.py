"""nova-engine: background work that must not run inside the voice path.

Runs as its own container from the gateway image (python -m app.engine).
It closes idle classic conversations and runs the post-session memory pass:
one structured model call per finished conversation that produces a summary,
labelled observations, and (when warranted) a rewritten user model. It never
touches persona, profile, settings or devices.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from openai import AsyncOpenAI

from . import calendar_events, calendar_service, context_files, event_engine, monitoring, notifications, observations, sessions
from .config import settings

log = logging.getLogger("nova.engine")

POLL_S = int(os.getenv("NOVA_ENGINE_POLL_SECONDS", "20"))
TRANSCRIPT_CHARS = 30000
MAX_OBSERVATIONS = 8

INSTRUCTIONS = """You maintain Nova's long-term memory of one user, after a conversation ends.

Input: the current user model, recent observations, and the transcript of the conversation that
just ended. Produce:
- summary: one or two sentences on what the conversation was about and what was decided or done.
- observations: at most 8 new, durable things worth remembering. Skip small talk, device commands
  with no lasting meaning, and anything already recorded. Label each honestly:
  statement = the user said it; outcome = something that happened (a plan kept or missed, a task
  done); inference = your tentative reading; pattern = only when several observations (cite them
  in evidence) support it. Never record secrets, credentials or account numbers.
- user_model: the full rewritten user-model document when this conversation changes it, else null.
  Keep the "# User model" title and a "## Summary" section of at most 1200 characters first; other
  sections are up to you (for example goals, routines, preferences, open questions). Mark
  inferences as tentative. Keep the whole document under 10000 characters; consolidate rather
  than append. Do not copy persona instructions or profile facts the user controls.
"""

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["summary", "observations", "user_model"],
    "properties": {
        "summary": {"type": "string"},
        "observations": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["kind", "text", "topics", "evidence"],
                "properties": {
                    "kind": {"type": "string", "enum": list(observations.KINDS)},
                    "text": {"type": "string"},
                    "topics": {"type": "array", "items": {"type": "string"}},
                    "evidence": {"type": "string"},
                },
            },
        },
        "user_model": {"type": ["string", "null"]},
    },
}


def transcript(session_id: str) -> str:
    tz = ZoneInfo(settings()["display_tz"])
    lines = []
    for t in sessions.turns(session_id):
        when = datetime.fromtimestamp(t["ts"], tz).strftime("%H:%M")
        if t["role"] == "tool":
            lines.append(f"[{when}] (tool {t['tool']}: {t['text']})")
        else:
            lines.append(f"[{when}] {'User' if t['role'] == 'user' else 'Nova'}: {t['text']}")
    text = "\n".join(lines)
    return text if len(text) <= TRANSCRIPT_CHARS else "…" + text[-TRANSCRIPT_CHARS:]


def build_input(job: dict[str, Any]) -> str:
    tz = ZoneInfo(settings()["display_tz"])
    started = datetime.fromtimestamp(job["started_at"], tz)
    recent = "\n".join(f"- ({o['kind']}) {o['text']}" for o in observations.recent(30)) or "(none)"
    return (
        f"## Current user model\n{context_files.read('user_model') or '(empty)'}\n\n"
        f"## Recent observations\n{recent}\n\n"
        f"## Conversation ({job['mode']}, {started:%A %Y-%m-%d %H:%M})\n{transcript(job['id'])}\n"
    )


async def call_model(text: str) -> dict[str, Any]:
    cfg = settings()
    client = AsyncOpenAI(api_key=cfg["openai_api_key"])
    resp = await client.responses.create(
        model=cfg["background_model"],
        instructions=INSTRUCTIONS,
        input=text,
        text={"format": {"type": "json_schema", "name": "memory_pass", "schema": SCHEMA, "strict": True}},
    )
    return json.loads(resp.output_text)


def apply(job: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    source = {"type": "memory_pass", "session": job["id"]}
    added = 0
    for o in (result.get("observations") or [])[:MAX_OBSERVATIONS]:
        try:
            observations.add(
                o["text"], kind=o["kind"], topics=o.get("topics"),
                source={**source, "evidence": str(o.get("evidence") or "")[:500]},
            )
            added += 1
        except (KeyError, ValueError) as exc:
            log.warning("skipped observation from %s: %s", job["id"], exc)
    model_change = None
    new_model = result.get("user_model")
    if isinstance(new_model, str) and new_model.strip():
        if not new_model.lstrip().startswith("# User model"):
            new_model = "# User model\n\n" + new_model.strip()
        model_change = context_files.rewrite(
            "user_model", new_model, reason="post-session memory pass", evidence=f"conversation {job['id']}",
            explicit=False,
        )
        if not model_change.get("ok"):
            raise ValueError(model_change.get("error") or "user model rewrite rejected")
    sessions.finish_memory(job["id"], str(result.get("summary") or "").strip()[:600])
    return {"observations": added, "user_model": model_change}


async def process(job: dict[str, Any]) -> None:
    try:
        result = await call_model(build_input(job))
        outcome = apply(job, result)
        log.info("memory pass %s: %s", job["id"], outcome)
    except Exception as exc:
        status = sessions.fail_memory(job["id"], str(exc))
        log.warning("memory pass %s failed (%s): %s", job["id"], status, exc)


async def run_once() -> bool:
    sessions.close_idle_classic()
    job = sessions.claim_memory_job()
    if job is None:
        return False
    await process(job)
    return True


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    if not settings()["openai_api_key"]:
        log.error("OPENAI_API_KEY is not configured; memory passes will fail and be retried")
    context_files.ensure_seeded()
    requeued = sessions.requeue_stale_running()
    if requeued:
        log.info("requeued %d interrupted memory pass(es)", requeued)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    log.info("nova-engine started (model %s)", settings()["background_model"])
    calendar_task = asyncio.create_task(calendar_events.refresh_loop(stop))
    try:
        async with calendar_service.serve():
            while not stop.is_set():
                try:
                    monitoring.settle()
                    await event_engine.tick()
                    await notifications.release(event_engine.homework_count, ZoneInfo(settings()["display_tz"]))
                except Exception:
                    log.exception("event poll failed")
                try:
                    busy = await run_once()
                except Exception:
                    log.exception("engine loop error")
                    busy = False
                if not busy:
                    try:
                        await asyncio.wait_for(stop.wait(), POLL_S)
                    except asyncio.TimeoutError:
                        pass
    finally:
        calendar_task.cancel()
        await asyncio.gather(calendar_task, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
