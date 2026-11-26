"""Capability handlers. Schemas, scopes and policies live in capabilities.yaml."""

from __future__ import annotations

import json
from dataclasses import dataclass
import re
from typing import Any, Awaitable, Callable

from . import approvals, calendar_events, calendar_service, context_files, finance, ha, homework, monitoring, planning, nova_config, observations, ops_client, sessions, worker_client
from .devices import Device


@dataclass
class CallContext:
    device: Device
    session_id: str | None
    request_id: str | None
    user_text: str | None = None
    approval_id: str | None = None


Handler = Callable[[dict[str, Any], CallContext], Awaitable[Any]]


async def _set_room_lights(args: dict[str, Any], ctx: CallContext) -> Any:
    payload: dict[str, Any] = {"on": bool(args["on"])}
    for key in ("brightness_pct", "color_temp_kelvin"):
        if args.get(key) is not None:
            payload[key] = args[key]
    return await ha.set_room(args["room_id"], payload)


async def _add_homework(args: dict[str, Any], ctx: CallContext) -> Any:
    return await homework.create_assignment(
        title=args["title"], course_code=args["course_code"], due=args["due"], notes=args.get("notes")
    )


def _rewrite(kind: str) -> Handler:
    async def handler(args: dict[str, Any], ctx: CallContext) -> Any:
        return context_files.rewrite(kind, args["content"], reason=args["reason"], evidence=ctx.user_text)

    return handler


async def _cursor_status(args: dict[str, Any], ctx: CallContext) -> Any:
    pending = [
        {"id": a["id"], "prompt": a["args"].get("prompt")}
        for a in approvals.recent("propose_cursor_edit", limit=10)
        if a["status"] == "pending"
    ]
    try:
        health = await worker_client.health()
        jobs = await worker_client.list_jobs(limit=5)
    except Exception as exc:
        return {"worker_reachable": False, "error": str(exc), "pending_approvals": pending}
    return {
        "worker_reachable": True,
        "cursor_configured": health.get("cursor_configured"),
        "recent_jobs": [
            {"id": j["id"], "kind": j["kind"], "status": j["status"], "prompt": (j.get("prompt") or "")[:160]}
            for j in jobs
        ],
        "pending_approvals": pending,
        "note": "Change requests run only after the user says yes or taps Confirm.",
    }


async def _ask_worker(args: dict[str, Any], ctx: CallContext) -> Any:
    return await worker_client.ask(args["question"])


async def _propose_cursor_edit(args: dict[str, Any], ctx: CallContext) -> Any:
    # Reached only after approval; the approval id doubles as the job id.
    if not ctx.approval_id:
        raise RuntimeError("change requests require an approval")
    return await worker_client.submit_change(ctx.approval_id, args["prompt"])


async def _monitor_status(args, ctx):
    return monitoring.diagnostics()


async def _ops_status(args, ctx):
    request_id = args["request_id"]
    if not re.fullmatch(r"[0-9a-f]{12}", request_id):
        raise ValueError("Invalid operations request ID")
    req = await ops_client.get_request(request_id)
    return {key: req.get(key) for key in ("id", "stack", "operation", "status", "expires_at")}


async def _worker_job(args, ctx):
    job_id = args["job_id"]
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", job_id):
        raise ValueError("Invalid worker job ID")
    job = await worker_client.get_job(job_id)
    if job is None:
        return {"status": "unknown"}
    return {key: job.get(key) for key in ("id", "status", "result", "error", "request_id")}


async def _list_ops_requests(args: dict[str, Any], ctx: CallContext) -> Any:
    return {"requests": await ops_client.pending_requests()}


async def _approve_ops_request(args: dict[str, Any], ctx: CallContext) -> Any:
    if not ctx.approval_id:
        raise RuntimeError("protected operations require an approval")
    req = await ops_client.get_request(args["request_id"])
    # The read-back used the model's stack/operation; refuse if they don't match the real request.
    if req.get("stack") != args["stack"] or req.get("operation") != args["operation"]:
        raise RuntimeError(
            f"request {args['request_id']} is {req.get('operation')} on {req.get('stack')}, not what was read back"
        )
    return await ops_client.execute(args["request_id"], ctx.approval_id)


async def _search_memory(args: dict[str, Any], ctx: CallContext) -> Any:
    hits = sessions.search(args["query"], limit=8)
    return {"results": hits, "note": "Snippets mark matches with [brackets]."} if hits else {"results": [], "note": "Nothing found."}


async def _read_user_model(args: dict[str, Any], ctx: CallContext) -> Any:
    return {
        "user_model": context_files.read("user_model"),
        "recent_observations": [
            {"ts": o["ts"], "kind": o["kind"], "text": o["text"]} for o in observations.recent(20)
        ],
    }


async def _recent_conversations(args: dict[str, Any], ctx: CallContext) -> Any:
    return {"conversations": [
        {"id": s["id"], "mode": s["mode"], "started_at": s["started_at"], "summary": s["summary"] or "(not summarized yet)"}
        for s in sessions.recent(limit=args.get("limit", 5))
    ]}


async def _note_observation(args: dict[str, Any], ctx: CallContext) -> Any:
    record = observations.add(
        args["text"], kind=args["kind"], topics=args.get("topics"),
        source={"type": "conversation", "session": ctx.session_id, "device": ctx.device.id, "evidence": ctx.user_text},
    )
    return {"ok": True, "id": record["id"]}


async def _get_settings(args: dict[str, Any], ctx: CallContext) -> Any:
    return {"settings": nova_config.describe()}


async def _update_setting(args: dict[str, Any], ctx: CallContext) -> Any:
    return nova_config.update(args["key"], args["value"], reason=args["reason"], evidence=ctx.user_text)


def _noargs(fn: Callable[[], Awaitable[Any]]) -> Handler:
    async def handler(args: dict[str, Any], ctx: CallContext) -> Any:
        return await fn()

    return handler


HANDLERS: dict[str, Handler] = {
    "get_rooms": _noargs(ha.get_rooms),
    "set_room_lights": _set_room_lights,
    "apply_scene": lambda args, ctx: ha.apply_scene(args["scene"]),
    "set_tv_app": lambda args, ctx: ha.set_tv_app(args["app"]),
    "get_weather": _noargs(ha.get_weather),
    "list_homework": _noargs(homework.list_assignments),
    "add_homework": _add_homework,
    "get_finance_summary": _noargs(finance.get_summary),
    "update_persona": _rewrite("persona"),
    "update_profile": _rewrite("profile"),
    "cursor_status": _cursor_status,
    "ask_worker": _ask_worker,
    "propose_cursor_edit": _propose_cursor_edit,
    "monitor_status": _monitor_status,
    "calendar_day": calendar_events.read_day,
    "calendar_search": calendar_service.search_events,
    "calendar_list": calendar_service.list_calendars,
    "calendar_create": calendar_service.create_event,
    "learning_goals": planning.learning_goals,
    "recent_place_events": planning.recent_places,
    "worker_job": _worker_job,
    "ops_request_status": _ops_status,
    "list_ops_requests": _list_ops_requests,
    "approve_ops_request": _approve_ops_request,
    "search_memory": _search_memory,
    "read_user_model": _read_user_model,
    "recent_conversations": _recent_conversations,
    "note_observation": _note_observation,
    "get_settings": _get_settings,
    "update_setting": _update_setting,
}


def parse_tool_args(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}
