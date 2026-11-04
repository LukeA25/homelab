from __future__ import annotations

import base64
import json
import re
import time
import uuid
from typing import Any

from . import memory, openai_client, persona
from .tools import TOOLS, parse_tool_args, run_tool

SYSTEM_PROMPT_BASE = """You are a concise homelab voice assistant on a nightstand panel.
Prefer short spoken replies (1-2 sentences). Always use tools for facts — do not guess.
You receive prior turns in this conversation — use them. Short replies like "yes", "do it",
"confirm", or "that one" refer to your previous question or suggestion.

Important:
- Real words from the user are always a valid request. Answer them normally.
- Never reply with "I didn't catch that" (or similar) when the user said something intelligible.
  Empty/noise audio is already filtered before you see it.
- If you lack a tool for something, say you can't do that — do not pretend you didn't hear them.
- Prefer statements over questions unless you truly need a choice. Never end a "didn't hear"
  style reply with a question mark.
- Never say a light, scene, or device change is done unless you called the matching tool
  in this turn. Persona notes only change wording after tools succeed — they never replace tools.

Persona:
- Follow the persona notes below. They are lasting preferences the user (or you) wrote.
- When the user tells you how you should speak, react, answer, or behave going forward,
  call update_persona with that instruction (append by default). Then briefly confirm.

Capabilities (use the matching tool):
- Lights: get_rooms, set_room_lights, apply_scene (sleep / wake / study).
  Rooms: bedroom, living_room. Warm=3200K, Neutral=4500K.
  sleep also blanks the bedroom TV dashboard; wake clears the blank and dims bedroom lights.
- TV apps: set_tv_app to put guitar, finance, homework, or theology on the bedroom TV,
  or dashboard to return to the TV home screen. Use this when they say pull up / show /
  put something on the TV. Do not claim it switched unless the tool ran.
- Weather: get_weather — current conditions plus today.periods / today.will_rain for rain-today questions.
- Homework: list_homework, add_homework.
- Finance (read-only): get_finance_summary — spent vs budget, Day to Day / Charity, cash.
- Persona: update_persona to change your lasting behavior notes.
- Cursor: cursor_status to check access; propose_cursor_edit to queue a homelab code change
  (does NOT run until the user taps Confirm under the mic). Never claim you already edited files.
  If the user asks to send something to Cursor, edit the homelab, or test Cursor, you MUST
  call propose_cursor_edit in that turn. Never say "tap Confirm" unless that tool just queued
  a pending proposal. Voice cannot press Confirm.

If a tool errors, say what failed briefly.
"""


def _system_prompt() -> str:
    notes = persona.read_persona()
    return f"{SYSTEM_PROMPT_BASE}\n## Persona notes\n{notes}\n"


_LIGHT_TOOLS = {"set_room_lights", "apply_scene"}
_LIGHT_INTENT = re.compile(
    r"\b(lights?|lamps?|dim(?:mer)?|brighten|brightness)\b|"
    r"\b(bedroom|living\s*room)\b.{0,40}\b(on|off)\b|"
    r"\b(on|off)\b.{0,40}\b(bedroom|living\s*room)\b|"
    r"\b(sleep|study)\s*(mode|scene)?\b|"
    r"\b(wake\s*(up|scene|mode)?|good\s*morning)\b",
    re.I,
)
_LIGHT_NUDGE = (
    "You confirmed without calling a tool. Call set_room_lights or apply_scene now "
    "to actually change the lights. Do not reply until the tool has run."
)
_CURSOR_TOOLS = {"propose_cursor_edit"}
_CURSOR_INTENT = re.compile(
    r"\bcursor\b|\bsend (that|this|it|a message) to (cursor|the agent)\b|"
    r"\b(edit|change|update|fix).{0,40}\b(code|repo|homelab)\b",
    re.I,
)
_CURSOR_NUDGE = (
    "You told the user to confirm without calling propose_cursor_edit. "
    "Call propose_cursor_edit now with the user's request. Do not reply until it has run."
)


async def _tool_loop(
    user_text: str,
    *,
    history: list[dict[str, Any]] | None = None,
    on_status: Any = None,
) -> tuple[str, list[dict[str, Any]], dict[str, Any] | None]:
    async def status(phase: str, **extra: Any) -> None:
        if on_status:
            await on_status({"type": "status", "phase": phase, **extra})

    instructions = _system_prompt()
    input_list: list[Any] = []
    for msg in history or []:
        role = msg.get("role")
        content = (msg.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            input_list.append({"role": role, "content": content})
    input_list.append({"role": "user", "content": user_text})

    actions: list[dict[str, Any]] = []
    cursor_proposal = None
    reply = "Done."
    nudged_lights = False
    nudged_cursor = False

    response = await openai_client.respond(
        instructions=instructions,
        input_list=input_list,
        tools=TOOLS,
    )

    for _ in range(4):
        calls = openai_client.function_calls(response)
        if not calls:
            reply = openai_client.output_text(response) or "Done."
            used_lights = any(a["tool"] in _LIGHT_TOOLS for a in actions)
            used_cursor = any(a["tool"] in _CURSOR_TOOLS for a in actions)
            if (
                not used_lights
                and not nudged_lights
                and _LIGHT_INTENT.search(user_text or "")
            ):
                nudged_lights = True
                input_list.append({"role": "assistant", "content": reply})
                input_list.append({"role": "user", "content": _LIGHT_NUDGE})
                response = await openai_client.respond(
                    instructions=instructions,
                    input_list=input_list,
                    tools=TOOLS,
                )
                continue
            if (
                not used_cursor
                and not nudged_cursor
                and _CURSOR_INTENT.search(user_text or "")
            ):
                nudged_cursor = True
                input_list.append({"role": "assistant", "content": reply})
                input_list.append({"role": "user", "content": _CURSOR_NUDGE})
                response = await openai_client.respond(
                    instructions=instructions,
                    input_list=input_list,
                    tools=TOOLS,
                )
                continue
            break

        input_list += list(response.output or [])
        for item in calls:
            name = item.name
            args = parse_tool_args(item.arguments)
            await status("tool", tool=name, args=args)
            try:
                result = await run_tool(name, args)
                actions.append({"tool": name, "args": args, "result": result, "ok": True})
                if name == "propose_cursor_edit" and isinstance(result, dict):
                    cursor_proposal = result
            except Exception as exc:
                result = {"error": str(exc)}
                actions.append({"tool": name, "args": args, "result": result, "ok": False})
            input_list.append(
                {
                    "type": "function_call_output",
                    "call_id": item.call_id,
                    "output": json.dumps(result, default=str),
                }
            )
        response = await openai_client.respond(
            instructions=instructions,
            input_list=input_list,
            tools=TOOLS,
        )
    else:
        reply = openai_client.output_text(response) or "I ran into a loop handling that. Try again."

    # Guard against the model falsely claiming it didn't hear clear speech
    # (often when it lacks a tool — e.g. weather before get_weather existed).
    low = reply.lower()
    if (
        user_text.strip()
        and len(user_text.strip()) >= 2
        and ("didn't catch" in low or "did not catch" in low or "couldn't hear" in low)
    ):
        reply = "Sorry — I understood you, but couldn't complete that request."
        low = reply.lower()

    queued_cursor = any(a["tool"] == "propose_cursor_edit" and a.get("ok") for a in actions)
    if not queued_cursor and "tap confirm" in low:
        reply = "I didn't queue that in Cursor. Ask me again."

    return reply, actions, cursor_proposal


async def run_turn(
    audio: bytes,
    filename: str = "audio.webm",
    on_status: Any = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    started = time.monotonic()

    async def status(phase: str, **extra: Any) -> None:
        if on_status:
            await on_status({"type": "status", "phase": phase, **extra})

    await status("transcribing")
    transcript = await openai_client.transcribe(audio, filename=filename)
    await status("heard", transcript=transcript)

    cleaned = (transcript or "").strip()
    if len(cleaned) < 2:
        # Statement only — never a question, so the UI won't auto-open the mic.
        reply = "I didn't catch that."
        audio_out = await openai_client.synthesize(reply)
        return {
            "id": str(uuid.uuid4()),
            "transcript": "",
            "reply": reply,
            "actions": [],
            "audio_base64": base64.b64encode(audio_out).decode("ascii"),
            "audio_mime": "audio/mpeg",
            "elapsed_ms": int((time.monotonic() - started) * 1000),
            "cursor_proposal": None,
            "session_id": session_id,
        }
    transcript = cleaned

    await status("thinking")
    history = memory.get_history(session_id)
    reply, actions, cursor_proposal = await _tool_loop(
        transcript, history=history, on_status=on_status
    )
    memory.append_turn(session_id, transcript, reply)

    await status("speaking", reply=reply)
    audio_out = await openai_client.synthesize(reply)
    return {
        "id": str(uuid.uuid4()),
        "transcript": transcript,
        "reply": reply,
        "actions": actions,
        "audio_base64": base64.b64encode(audio_out).decode("ascii"),
        "audio_mime": "audio/mpeg",
        "elapsed_ms": int((time.monotonic() - started) * 1000),
        "cursor_proposal": cursor_proposal,
        "session_id": session_id,
    }


async def run_text_turn(text: str, session_id: str | None = None) -> dict[str, Any]:
    started = time.monotonic()
    history = memory.get_history(session_id)
    reply, actions, cursor_proposal = await _tool_loop(text, history=history)
    memory.append_turn(session_id, text, reply)
    audio_out = await openai_client.synthesize(reply)
    return {
        "id": str(uuid.uuid4()),
        "transcript": text,
        "reply": reply,
        "actions": actions,
        "audio_base64": base64.b64encode(audio_out).decode("ascii"),
        "audio_mime": "audio/mpeg",
        "elapsed_ms": int((time.monotonic() - started) * 1000),
        "cursor_proposal": cursor_proposal,
        "session_id": session_id,
        "bytes_in": len(text.encode("utf-8")),
    }
