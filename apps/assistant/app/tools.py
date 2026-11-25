"""Capability handlers. Schemas, scopes and policies live in capabilities.yaml."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from . import approvals, context_files, finance, ha, homework, ops_client, worker_client
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
    "list_ops_requests": _list_ops_requests,
    "approve_ops_request": _approve_ops_request,
}


def parse_tool_args(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}
