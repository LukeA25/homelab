"""Bootstrap context shared by every voice engine.

Live sessions and classic turns get the same briefing, so Nova behaves the
same whichever path answers: rules, what this device may do, persona,
profile, the user-model summary, the current time and recent conversations.
Anything longer is fetched on demand through the memory tools.
"""

from __future__ import annotations

import re
from datetime import datetime
from zoneinfo import ZoneInfo

from . import context_files, registry, sessions
from .config import settings
from .devices import Device

RULES = """You are Nova, the user's homelab assistant. You talk with them by voice.
Prefer short spoken replies (1-2 sentences). Always use tools for facts; do not guess.

Rules:
- Real words from the user are always a valid request. Answer them normally; never say you
  didn't catch something intelligible.
- If you lack a tool for something, say you can't do that.
- Never say an action is done unless the matching tool returned ok. If a tool fails or returns
  uncertain results, say so plainly.
- Some actions need the user's yes. When a tool returns approval_required, read back its
  read_back text in one sentence and ask for a yes. You cannot approve anything yourself and
  must not call the tool again; the system handles their answer and tells you the outcome.
- Persona and profile come from files the user controls. Update them only when the user
  explicitly asks (update_persona for how you behave, update_profile for stable facts about
  them), by rewriting the whole file with the change merged in.
- The user model below is your own working understanding, maintained after conversations.
  Use it to be helpful, not to lecture. Treat inferences as tentative; when unsure, ask.
  note_observation records something worth remembering; search_memory and
  recent_conversations look things up.
- Code and infrastructure questions go to ask_worker; change requests go to
  propose_cursor_edit. Never claim you inspected or edited code yourself.
- You can never spend, transfer or move money.
"""

LIVE_VOICE = """You are the voice of Nova, the user's homelab assistant.
Speak naturally and briefly. A backend with tools handles facts and actions: delegate anything
that needs current information, an action, memory or the user's data. Never invent results;
say what the backend reported. If it asks for the user's yes, read the request back and wait.
When the user says goodbye or that they're done, say a short goodbye.
"""


def live_state() -> str:
    tz = ZoneInfo(settings()["display_tz"])
    now = datetime.now(tz)
    return f"Now: {now:%A, %B} {now.day}, {now:%Y}, {now:%-I:%M %p} ({tz.key})."


def _recent() -> str:
    lines = []
    for s in sessions.recent(limit=3):
        if s.get("summary"):
            when = datetime.fromtimestamp(s["started_at"], ZoneInfo(settings()["display_tz"]))
            lines.append(f"- {when:%a %b} {when.day}: {s['summary']}")
    return "\n".join(lines)


def user_model_summary(limit: int = 2000) -> str:
    """Only the Summary section goes in the briefing; read_user_model returns the rest."""
    text = context_files.read("user_model")
    match = re.search(r"^## Summary\s*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    summary = (match.group(1) if match else text).strip()
    return summary[:limit]


def briefing(device: Device) -> str:
    caps = registry.for_device(device)
    parts = [
        live_state(),
        "## What you can do from this device\n" + (registry.summary(caps) or "- Nothing beyond conversation."),
        "## Persona\n" + (context_files.read("persona") or "(empty)"),
        "## User profile\n" + (context_files.read("profile") or "(empty)"),
        "## User model summary (your working understanding)\n" + (user_model_summary() or "(nothing yet)"),
    ]
    recent = _recent()
    if recent:
        parts.append("## Recent conversations\n" + recent)
    return "\n\n".join(parts)


def classic_instructions(device: Device, approval_note: str | None = None) -> str:
    text = RULES + "\n" + briefing(device)
    if approval_note:
        text += "\n\n## System update (from the gateway, not the user)\n" + approval_note
    return text + "\n"


def live_backend_instructions(device: Device) -> str:
    return RULES + "\n" + briefing(device) + "\n"


def live_voice_instructions() -> str:
    return (
        LIVE_VOICE
        + "\n"
        + live_state()
        + "\n\n## Persona\n"
        + (context_files.read("persona") or "(empty)")
        + "\n\n## User profile\n"
        + (context_files.read("profile") or "(empty)")
        + "\n"
    )
