from __future__ import annotations

import base64
import json
import logging
import re
import time
import uuid
from typing import Any

from . import approvals, bootstrap, dispatch, memory, openai_client, registry, sessions
from .devices import Device
from .tools import CallContext, parse_tool_args

log = logging.getLogger("nova")


_LIGHT_TOOLS = {"set_room_lights", "apply_scene"}
_LIGHT_INTENT = re.compile(
    r"\b(lights?|lamps?|dim(?:mer)?|brighten|brightness)\b|"
    r"\b(bedroom|living\s*room)\b.{0,40}\b(on|off)\b|"
    r"\b(on|off)\b.{0,40}\b(bedroom|living\s*room)\b|"
    r"\b(sleep|study)\s*(mode|scene)?\b|"
    r"\b(wake\s*(up|scene|mode)?|good\s*morning)\b",
    re.I,
)
_CLAIMS_DONE = re.compile(r"\b(done|okay|ok|yep|turned|switched|set|dimmed|brightened)\b", re.I)
_LIGHT_NUDGE = (
    "You confirmed without calling a tool. Call set_room_lights or apply_scene now "
    "to actually change the lights. Do not reply until the tool has run."
)
_CURSOR_TOOLS = {"propose_cursor_edit"}
_CURSOR_INTENT = re.compile(
    r"\bsend (that|this|it|a message) to (cursor|the agent)\b|"
    r"\b(edit|change|update|fix).{0,40}\b(code|repo|homelab)\b",
    re.I,
)
_CURSOR_NUDGE = (
    "You answered without calling propose_cursor_edit. Call it now with the user's request. "
    "Do not reply until it has run."
)


async def settle_pending_approval(text: str, device: Device, session_id: str | None, request_id: str) -> str | None:
    """The user's turn right after a read-back decides the pending approval; anything else cancels it."""
    pending = approvals.pending_for(device.id, session_id)
    if not pending:
        return None
    decision = approvals.classify(text)
    ctx = CallContext(device=device, session_id=session_id, request_id=request_id, user_text=text)
    outcome = await dispatch.resolve_and_run(pending["id"], decision, "voice", ctx)
    what = pending["read_back"]
    if decision == "yes":
        detail = json.dumps(outcome.get("result") if outcome.get("ok") else outcome.get("error"), default=str)[:1500]
        state = "It ran successfully." if outcome.get("ok") else "It was approved but failed."
        return f"The user approved: {what}\n{state} Result: {detail}\nTell the user the outcome."
    if decision == "no":
        return f"The user declined: {what}\nIt was not run. Acknowledge briefly."
    return (
        f"A pending request was cancelled because the user's reply was not a clear yes: {what}\n"
        "It was not run. Answer what the user just said; mention the request was cancelled only if relevant."
    )


def _proposal_from(name: str, args: dict[str, Any], out: dict[str, Any]) -> dict[str, Any] | None:
    if name == "propose_cursor_edit" and out.get("status") == "approval_required":
        return {"id": out["approval_id"], "prompt": args.get("prompt"), "status": "pending"}
    return None


async def _tool_loop(
    user_text: str,
    *,
    device: Device,
    session_id: str | None,
    request_id: str,
    history: list[dict[str, Any]] | None = None,
    on_status: Any = None,
) -> tuple[str, list[dict[str, Any]], dict[str, Any] | None]:
    async def status(phase: str, **extra: Any) -> None:
        if on_status:
            await on_status({"type": "status", "phase": phase, **extra})

    approval_note = await settle_pending_approval(user_text, device, session_id, request_id)
    instructions = bootstrap.classic_instructions(device, approval_note)
    tools = registry.model_tools(registry.for_device(device))
    ctx = CallContext(device=device, session_id=session_id, request_id=request_id, user_text=user_text)

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
    nudged_cursor = approval_note is not None
    available = {t["name"] for t in tools}

    async def respond() -> Any:
        return await openai_client.respond(instructions=instructions, input_list=input_list, tools=tools)

    response = await respond()
    for _ in range(4):
        calls = openai_client.function_calls(response)
        if not calls:
            reply = openai_client.output_text(response) or "Done."
            used = {a["tool"] for a in actions}
            # Only when the model claims a change without calling any tool; a status read is not a claim.
            if (
                not nudged_lights and not actions and _LIGHT_TOOLS & available
                and _LIGHT_INTENT.search(user_text) and _CLAIMS_DONE.search(reply)
            ):
                nudged_lights = True
                input_list += [{"role": "assistant", "content": reply}, {"role": "user", "content": _LIGHT_NUDGE}]
                response = await respond()
                continue
            if not nudged_cursor and not used & _CURSOR_TOOLS and _CURSOR_TOOLS & available and _CURSOR_INTENT.search(user_text):
                nudged_cursor = True
                input_list += [{"role": "assistant", "content": reply}, {"role": "user", "content": _CURSOR_NUDGE}]
                response = await respond()
                continue
            break

        input_list += list(response.output or [])
        for item in calls:
            name = item.name
            args = parse_tool_args(item.arguments)
            await status("tool", tool=name)
            out = await dispatch.call(name, args, ctx)
            actions.append({"tool": name, "ok": bool(out.get("ok")), "status": out.get("status")})
            cursor_proposal = _proposal_from(name, args, out) or cursor_proposal
            input_list.append(
                {"type": "function_call_output", "call_id": item.call_id, "output": json.dumps(out, default=str)}
            )
        response = await respond()
    else:
        reply = openai_client.output_text(response) or "I ran into a loop handling that. Try again."

    low = reply.lower()
    if len(user_text.strip()) >= 2 and ("didn't catch" in low or "did not catch" in low or "couldn't hear" in low):
        reply = "Sorry — I understood you, but couldn't complete that request."

    return reply, actions, cursor_proposal


async def _turn(
    text: str, *, device: Device, session_id: str | None, request_id: str, on_status: Any = None
) -> tuple[str, list[dict[str, Any]], dict[str, Any] | None]:
    history = memory.get_history(session_id)
    reply, actions, proposal = await _tool_loop(
        text, device=device, session_id=session_id, request_id=request_id, history=history, on_status=on_status
    )
    memory.append_turn(session_id, text, reply)
    _record(device, session_id, text, reply, actions)
    return reply, actions, proposal


def _record(device: Device, session_id: str | None, text: str, reply: str, actions: list[dict[str, Any]]) -> None:
    """Keep classic turns in the conversation history; a storage error must not break the reply."""
    try:
        conv = sessions.classic_session(device.id, session_id)
        sessions.add_turn(conv, "user", text)
        for a in actions:
            sessions.add_turn(conv, "tool", a.get("status") or ("ok" if a["ok"] else "failed"), tool=a["tool"], ok=a["ok"])
        sessions.add_turn(conv, "assistant", reply)
    except Exception:
        log.exception("could not record classic turn")


def _result(started: float, transcript: str, reply: str, actions: list, proposal: Any, session_id: str | None, audio: bytes) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "transcript": transcript,
        "reply": reply,
        "actions": actions,
        "audio_base64": base64.b64encode(audio).decode("ascii"),
        "audio_mime": "audio/mpeg",
        "elapsed_ms": int((time.monotonic() - started) * 1000),
        "cursor_proposal": proposal,
        "session_id": session_id,
    }


async def run_turn(
    audio: bytes,
    *,
    device: Device,
    request_id: str,
    filename: str = "audio.webm",
    on_status: Any = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    started = time.monotonic()

    async def status(phase: str, **extra: Any) -> None:
        if on_status:
            await on_status({"type": "status", "phase": phase, **extra})

    await status("transcribing")
    transcript = (await openai_client.transcribe(audio, filename=filename) or "").strip()
    await status("heard", transcript=transcript)

    if len(transcript) < 2:
        # Statement only — never a question, so the UI won't auto-open the mic.
        reply = "I didn't catch that."
        return _result(started, "", reply, [], None, session_id, await openai_client.synthesize(reply))

    await status("thinking")
    reply, actions, proposal = await _turn(
        transcript, device=device, session_id=session_id, request_id=request_id, on_status=on_status
    )
    await status("speaking", reply=reply)
    return _result(started, transcript, reply, actions, proposal, session_id, await openai_client.synthesize(reply))


async def run_text_turn(text: str, *, device: Device, request_id: str, session_id: str | None = None) -> dict[str, Any]:
    started = time.monotonic()
    reply, actions, proposal = await _turn(text, device=device, session_id=session_id, request_id=request_id)
    return _result(started, text, reply, actions, proposal, session_id, await openai_client.synthesize(reply))
