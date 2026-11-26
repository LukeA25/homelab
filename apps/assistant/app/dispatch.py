"""Authorized tool dispatch: scope check, policy, approvals and audit for every call."""

from __future__ import annotations

import time
from typing import Any

from . import approvals, audit, registry
from .config import settings
from .tools import HANDLERS, CallContext


async def call(name: str, args: dict[str, Any], ctx: CallContext) -> dict[str, Any]:
    """Run a capability requested by the model on behalf of ctx.device."""
    cap = registry.get(name)
    if cap is None or name not in HANDLERS:
        audit.operation("tool_denied", tool=name, args=args, decision="unknown_tool")
        return {"ok": False, "error": f"Unknown tool: {name}"}
    if cap.policy == "forbidden":
        audit.operation("tool_denied", tool=name, args=args, decision="forbidden")
        return {"ok": False, "error": "That action is not available."}
    if not ctx.device.allows(cap.scope):
        audit.operation("tool_denied", tool=name, args=args, decision="out_of_scope", scope=cap.scope)
        return {"ok": False, "error": "That action is not permitted from this device."}
    try:
        registry.validate_args(cap, args)
    except registry.ArgumentError as exc:
        audit.operation("tool_denied", tool=name, args=args, decision="invalid_args", error=str(exc))
        return {"ok": False, "error": f"Invalid arguments: {exc}"}

    if cap.policy == "approval":
        text = registry.read_back(cap, args)
        approval = approvals.create(
            capability=name,
            args=args,
            read_back=text,
            device_id=ctx.device.id,
            session_id=ctx.session_id,
            request_id=ctx.request_id,
            ttl_seconds=settings()["approval_ttl_seconds"],
        )
        audit.operation(
            "approval_requested", tool=name, args=args, approval_id=approval["id"], read_back=text
        )
        return {
            "ok": False,
            "status": "approval_required",
            "approval_id": approval["id"],
            "read_back": text,
            "instruction": (
                "Not done yet. Read this back to the user in one sentence and ask them to say yes. "
                "You cannot approve it yourself; their next reply decides."
            ),
        }

    return await _run(name, args, ctx)


async def _run(name: str, args: dict[str, Any], ctx: CallContext) -> dict[str, Any]:
    started = time.monotonic()
    try:
        result = await HANDLERS[name](args, ctx)
    except Exception as exc:
        audit.operation(
            "tool_call", tool=name, args=args, ok=False, error=str(exc),
            approval_id=ctx.approval_id, duration_ms=int((time.monotonic() - started) * 1000),
        )
        return {"ok": False, "error": str(exc)}
    ok = not (isinstance(result, dict) and result.get("ok") is False)
    audit_result = {"status": result["status"]} if name.startswith("calendar_") else result
    audit.operation(
        "tool_call", tool=name, args=args, ok=ok, result=audit_result,
        approval_id=ctx.approval_id, duration_ms=int((time.monotonic() - started) * 1000),
    )
    return {"ok": ok, "result": result}


async def resolve_and_run(approval_id: str, decision: str, via: str, ctx: CallContext) -> dict[str, Any]:
    """Apply the user's decision to a pending approval; on yes, run exactly the approved call."""
    row = approvals.resolve(approval_id, decision, via)
    if row is None:
        audit.operation("approval_resolve_failed", approval_id=approval_id, decision=decision, via=via)
        return {"ok": False, "status": "not_pending", "error": "That request is no longer pending."}
    audit.operation(
        f"approval_{row['status']}", approval_id=approval_id, tool=row["capability"], via=via,
        evidence=ctx.user_text,
    )
    if row["status"] != "approved":
        return {"ok": False, "status": row["status"], "read_back": row["read_back"]}

    cap = registry.get(row["capability"])
    if cap is None or not ctx.device.allows(cap.scope):
        approvals.record_result(approval_id, False, {"error": "not permitted"})
        audit.operation("tool_denied", tool=row["capability"], decision="out_of_scope_at_approval")
        return {"ok": False, "status": "denied", "error": "That action is not permitted from this device."}

    run_ctx = CallContext(
        device=ctx.device, session_id=row["session_id"], request_id=ctx.request_id,
        user_text=ctx.user_text, approval_id=approval_id,
    )
    outcome = await _run(row["capability"], row["args"], run_ctx)
    approvals.record_result(approval_id, outcome["ok"], outcome.get("result") or outcome.get("error"))
    return {"status": "executed" if outcome["ok"] else "failed", "read_back": row["read_back"], **outcome}
