"""In-app finance consultant: OpenAI tool-calling over live budget data.

Read tools execute immediately against SQLite. Write tools only queue
proposals — nothing mutates until POST /api/consultant/apply re-validates
and runs them through the same handlers the UI uses.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from openai import OpenAI
from sqlmodel import Session, select

from . import budget
from .models import ConsultantThread, ConsultantTurn

MAX_TOOL_ROUNDS = 8
DEFAULT_MODEL = "gpt-5.4"
SEARCH_LIMIT = 40

SYSTEM_PROMPT = """You are the finance consultant for a single-user homelab budgeting app.

Hard rules:
- Budget year runs May–April (or whatever get_overview / list_categories reports), NOT calendar year.
- Plaid sign convention: positive amount = spending (money out), negative = income (money in).
- Repayments: money-in can be split across expenses via allocations. Allocated dollars shrink the expense and are NOT income. Leftover unallocated repayment still counts as income through its category.
- Prefer get_overview / get_monthly for totals. Use search_transactions only when you need merchants, unassigned rows, or specific charges.
- Never invent subcategory ids, transaction ids, or amounts. Always look them up with tools first.
- Cite real numbers from tool results. If data is missing, say so.
- Unbudgeted-but-spent is real (actual with $0 projected) — call it out as a hole.
- Write tools do NOT save anything. They only queue proposals the user must Apply in the UI. After calling a write tool, tell the user what you proposed and that nothing changed until they Apply.
- Propose concrete edits for holes: missing projections, unassigned transactions, off-kind category assignments, repayment leftovers needing a category.
- Do not call Plaid or delete accounts. Those are out of scope.
- Be concise. Lead with the answer, then optional bullets.
- Format every reply in Markdown:
  - `#` for the main title, `##` for section headers, `###` for small labels.
  - Bullet lists for breakdowns. Do not leave raw asterisks around list markers.
  - For dollar figures, put `+` or `-` immediately before `$` so the UI can color them: `+$120` is favorable (under budget, extra income, net gain), `-$80` is unfavorable (overspend, shortfall). Example: **+$1,200.00** vs **-$340.00**.
  - Use a Markdown blockquote (`>`) for warnings or “important” callouts.
"""


def _model() -> str:
    return os.environ.get("OPENAI_MODEL") or os.environ.get("ASK_MODEL") or DEFAULT_MODEL


def _client() -> OpenAI:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not configured on the finance app",
        )
    kwargs: dict[str, Any] = {"api_key": key}
    base = os.environ.get("OPENAI_BASE_URL")
    if base:
        kwargs["base_url"] = base
    return OpenAI(**kwargs)


def _tool(name: str, description: str, properties: dict, required: Optional[list] = None) -> dict:
    schema: dict[str, Any] = {
        "type": "object",
        "properties": properties,
        "additionalProperties": False,
    }
    if required is not None:
        schema["required"] = required
    else:
        schema["required"] = list(properties.keys())
    return {
        "type": "function",
        "name": name,
        "description": description,
        "parameters": schema,
        "strict": False,
    }


TOOLS: list[dict] = [
    _tool(
        "get_overview",
        "Year projected vs actual for income, expense, net, and unassigned totals.",
        {},
        required=[],
    ),
    _tool(
        "get_monthly",
        "Per-subcategory monthly projected[] and actual[] arrays for the budget year.",
        {},
        required=[],
    ),
    _tool(
        "list_categories",
        "Categories, subcategories (with ids), and monthly projections.",
        {},
        required=[],
    ),
    _tool(
        "search_transactions",
        "Search transactions. Prefer filters over dumping everything.",
        {
            "query": {
                "type": "string",
                "description": "Optional text match on name/merchant",
            },
            "month": {
                "type": "string",
                "description": "Optional YYYY-MM filter",
            },
            "unassigned_only": {
                "type": "boolean",
                "description": "Only rows with no resolved subcategory",
            },
            "subcategory_id": {
                "type": "integer",
                "description": "Optional subcategory filter",
            },
            "limit": {
                "type": "integer",
                "description": f"Max rows (default {SEARCH_LIMIT})",
            },
        },
        required=[],
    ),
    _tool(
        "get_transaction",
        "Fetch one transaction by id, including repayment allocations.",
        {"transaction_id": {"type": "string"}},
    ),
    _tool(
        "list_repayable",
        "Expenses that still have remaining amount available for repayments.",
        {},
        required=[],
    ),
    _tool(
        "get_accounts",
        "Linked accounts with balances and masks (no Plaid tokens).",
        {},
        required=[],
    ),
    _tool(
        "get_investments",
        "Portfolio totals, holdings, and recent investment activity.",
        {},
        required=[],
    ),
    _tool(
        "list_rules",
        "Mapping rules that auto-assign Plaid categories/names to subcategories.",
        {},
        required=[],
    ),
    # --- write tools (queue proposals only) ---
    _tool(
        "propose_assign_transactions",
        "Propose assigning one or more transactions to a subcategory (or null to clear).",
        {
            "transaction_ids": {
                "type": "array",
                "items": {"type": "string"},
            },
            "subcategory_id": {
                "type": ["integer", "null"],
            },
            "summary": {
                "type": "string",
                "description": "Human-readable summary of the change",
            },
        },
        required=["transaction_ids", "subcategory_id", "summary"],
    ),
    _tool(
        "propose_set_projections",
        "Propose upserting monthly projection amounts.",
        {
            "projections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "subcategory_id": {"type": "integer"},
                        "month": {"type": "string"},
                        "amount": {"type": "number"},
                    },
                    "required": ["subcategory_id", "month", "amount"],
                },
            },
            "summary": {"type": "string"},
        },
        required=["projections", "summary"],
    ),
    _tool(
        "propose_create_category",
        "Propose creating a category.",
        {
            "name": {"type": "string"},
            "kind": {"type": "string", "enum": ["income", "expense"]},
            "summary": {"type": "string"},
        },
        required=["name", "kind", "summary"],
    ),
    _tool(
        "propose_update_category",
        "Propose updating a category name/kind.",
        {
            "category_id": {"type": "integer"},
            "name": {"type": "string"},
            "kind": {"type": "string", "enum": ["income", "expense"]},
            "summary": {"type": "string"},
        },
        required=["category_id", "summary"],
    ),
    _tool(
        "propose_delete_category",
        "Propose deleting a category (and its subcategories).",
        {
            "category_id": {"type": "integer"},
            "summary": {"type": "string"},
        },
    ),
    _tool(
        "propose_create_subcategory",
        "Propose creating a subcategory under a category.",
        {
            "category_id": {"type": "integer"},
            "name": {"type": "string"},
            "summary": {"type": "string"},
        },
    ),
    _tool(
        "propose_update_subcategory",
        "Propose renaming a subcategory.",
        {
            "subcategory_id": {"type": "integer"},
            "name": {"type": "string"},
            "summary": {"type": "string"},
        },
    ),
    _tool(
        "propose_delete_subcategory",
        "Propose deleting a subcategory.",
        {
            "subcategory_id": {"type": "integer"},
            "summary": {"type": "string"},
        },
    ),
    _tool(
        "propose_set_repayment",
        "Propose replacing repayment allocations for a money-in transaction. Empty allocations clears it.",
        {
            "transaction_id": {"type": "string"},
            "allocations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "expense_id": {"type": "string"},
                        "amount": {"type": "number"},
                    },
                    "required": ["expense_id", "amount"],
                },
            },
            "summary": {"type": "string"},
        },
        required=["transaction_id", "allocations", "summary"],
    ),
    _tool(
        "propose_create_manual_transaction",
        "Propose creating a manual transaction. Amount: +spend / −income.",
        {
            "date": {"type": "string"},
            "name": {"type": "string"},
            "amount": {"type": "number"},
            "merchant_name": {"type": "string"},
            "subcategory_id": {"type": ["integer", "null"]},
            "allocations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "expense_id": {"type": "string"},
                        "amount": {"type": "number"},
                    },
                    "required": ["expense_id", "amount"],
                },
            },
            "summary": {"type": "string"},
        },
        required=["date", "name", "amount", "summary"],
    ),
    _tool(
        "propose_delete_transaction",
        "Propose deleting a manual or pending transaction.",
        {
            "transaction_id": {"type": "string"},
            "summary": {"type": "string"},
        },
    ),
    _tool(
        "propose_create_rule",
        "Propose a mapping rule (pfc_detailed | pfc_primary | name_contains).",
        {
            "match_type": {"type": "string"},
            "match_value": {"type": "string"},
            "subcategory_id": {"type": "integer"},
            "priority": {"type": "integer"},
            "summary": {"type": "string"},
        },
        required=["match_type", "match_value", "subcategory_id", "summary"],
    ),
    _tool(
        "propose_update_rule",
        "Propose updating a mapping rule.",
        {
            "rule_id": {"type": "integer"},
            "match_type": {"type": "string"},
            "match_value": {"type": "string"},
            "subcategory_id": {"type": "integer"},
            "priority": {"type": "integer"},
            "summary": {"type": "string"},
        },
        required=["rule_id", "summary"],
    ),
    _tool(
        "propose_delete_rule",
        "Propose deleting a mapping rule.",
        {
            "rule_id": {"type": "integer"},
            "summary": {"type": "string"},
        },
    ),
    _tool(
        "propose_set_budget_year_start",
        "Propose changing the budget-year start month (1–12).",
        {
            "budget_year_start_month": {"type": "integer"},
            "summary": {"type": "string"},
        },
    ),
]

WRITE_TOOLS = {t["name"] for t in TOOLS if t["name"].startswith("propose_")}


def _months(session: Session) -> list[str]:
    return budget.budget_months(budget.get_start_month(session))


def _txn_rows(session: Session, month: Optional[str] = None) -> list[dict]:
    # Late import avoids circular import at module load.
    from .main import list_transactions

    return list_transactions(month=month, session=session)["transactions"]


def _read_get_overview(session: Session) -> Any:
    return budget.compute_overview(session, _months(session))


def _read_get_monthly(session: Session) -> Any:
    return budget.compute_monthly(session, _months(session))


def _read_list_categories(session: Session) -> Any:
    from .main import list_categories

    return list_categories(session=session)


def _read_search_transactions(session: Session, args: dict) -> Any:
    month = args.get("month") or None
    query = (args.get("query") or "").strip().lower()
    unassigned_only = bool(args.get("unassigned_only"))
    subcategory_id = args.get("subcategory_id")
    limit = int(args.get("limit") or SEARCH_LIMIT)
    limit = max(1, min(limit, 100))

    rows = _txn_rows(session, month)
    out = []
    for t in rows:
        if unassigned_only and t.get("resolved_subcategory_id") is not None:
            continue
        if subcategory_id is not None and t.get("resolved_subcategory_id") != subcategory_id:
            continue
        if query:
            hay = f"{t.get('name') or ''} {t.get('merchant_name') or ''}".lower()
            if query not in hay:
                continue
        out.append({
            "id": t["id"],
            "date": t["date"],
            "name": t.get("merchant_name") or t.get("name"),
            "amount": t["amount"],
            "effective_amount": t["effective_amount"],
            "resolved_subcategory_id": t.get("resolved_subcategory_id"),
            "resolved_name": t.get("resolved_name"),
            "resolved_category_name": t.get("resolved_category_name"),
            "is_repayment": t.get("is_repayment"),
            "allocated_amount": t.get("allocated_amount"),
            "unallocated_amount": t.get("unallocated_amount"),
            "repayment_status": t.get("repayment_status"),
            "pending": t.get("pending"),
            "source": t.get("source"),
        })
        if len(out) >= limit:
            break
    return {"count": len(out), "transactions": out}


def _read_get_transaction(session: Session, args: dict) -> Any:
    tid = args.get("transaction_id")
    for t in _txn_rows(session):
        if t["id"] == tid:
            return t
    return {"error": f"Transaction {tid} not found"}


def _read_list_repayable(session: Session) -> Any:
    from .main import list_repayable

    return list_repayable(session=session)


def _read_get_accounts(session: Session) -> Any:
    from .main import snapshot

    data = snapshot(session)
    return {
        "connected": data["connected"],
        "last_refreshed": data["last_refreshed"],
        "accounts": data["accounts"],
    }


def _read_get_investments(session: Session) -> Any:
    from .main import investments_data

    return investments_data(session=session)


def _read_list_rules(session: Session) -> Any:
    from .main import list_rules

    return list_rules(session=session)


READ_HANDLERS = {
    "get_overview": lambda s, a: _read_get_overview(s),
    "get_monthly": lambda s, a: _read_get_monthly(s),
    "list_categories": lambda s, a: _read_list_categories(s),
    "search_transactions": _read_search_transactions,
    "get_transaction": _read_get_transaction,
    "list_repayable": lambda s, a: _read_list_repayable(s),
    "get_accounts": lambda s, a: _read_get_accounts(s),
    "get_investments": lambda s, a: _read_get_investments(s),
    "list_rules": lambda s, a: _read_list_rules(s),
}


def _proposal(kind: str, summary: str, payload: dict) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "summary": summary.strip() or kind,
        "payload": payload,
    }


def _queue_write(name: str, args: dict) -> tuple[dict, str]:
    """Return (proposal, tool_result_message)."""
    summary = args.get("summary") or name

    if name == "propose_assign_transactions":
        payload = {
            "transaction_ids": args.get("transaction_ids") or [],
            "subcategory_id": args.get("subcategory_id"),
        }
        prop = _proposal("assign_transactions", summary, payload)
    elif name == "propose_set_projections":
        prop = _proposal(
            "set_projections",
            summary,
            {"projections": args.get("projections") or []},
        )
    elif name == "propose_create_category":
        prop = _proposal(
            "create_category",
            summary,
            {"name": args["name"], "kind": args["kind"]},
        )
    elif name == "propose_update_category":
        prop = _proposal(
            "update_category",
            summary,
            {
                "category_id": args["category_id"],
                "name": args.get("name"),
                "kind": args.get("kind"),
            },
        )
    elif name == "propose_delete_category":
        prop = _proposal(
            "delete_category",
            summary,
            {"category_id": args["category_id"]},
        )
    elif name == "propose_create_subcategory":
        prop = _proposal(
            "create_subcategory",
            summary,
            {"category_id": args["category_id"], "name": args["name"]},
        )
    elif name == "propose_update_subcategory":
        prop = _proposal(
            "update_subcategory",
            summary,
            {"subcategory_id": args["subcategory_id"], "name": args.get("name")},
        )
    elif name == "propose_delete_subcategory":
        prop = _proposal(
            "delete_subcategory",
            summary,
            {"subcategory_id": args["subcategory_id"]},
        )
    elif name == "propose_set_repayment":
        prop = _proposal(
            "set_repayment",
            summary,
            {
                "transaction_id": args["transaction_id"],
                "allocations": args.get("allocations") or [],
            },
        )
    elif name == "propose_create_manual_transaction":
        prop = _proposal(
            "create_manual_transaction",
            summary,
            {
                "date": args["date"],
                "name": args["name"],
                "amount": args["amount"],
                "merchant_name": args.get("merchant_name"),
                "subcategory_id": args.get("subcategory_id"),
                "allocations": args.get("allocations"),
            },
        )
    elif name == "propose_delete_transaction":
        prop = _proposal(
            "delete_transaction",
            summary,
            {"transaction_id": args["transaction_id"]},
        )
    elif name == "propose_create_rule":
        prop = _proposal(
            "create_rule",
            summary,
            {
                "match_type": args["match_type"],
                "match_value": args["match_value"],
                "subcategory_id": args["subcategory_id"],
                "priority": args.get("priority", 0),
            },
        )
    elif name == "propose_update_rule":
        prop = _proposal(
            "update_rule",
            summary,
            {
                "rule_id": args["rule_id"],
                "match_type": args.get("match_type"),
                "match_value": args.get("match_value"),
                "subcategory_id": args.get("subcategory_id"),
                "priority": args.get("priority"),
            },
        )
    elif name == "propose_delete_rule":
        prop = _proposal(
            "delete_rule",
            summary,
            {"rule_id": args["rule_id"]},
        )
    elif name == "propose_set_budget_year_start":
        prop = _proposal(
            "set_budget_year_start",
            summary,
            {"budget_year_start_month": args["budget_year_start_month"]},
        )
    else:
        raise ValueError(f"Unknown write tool {name}")

    result = {
        "status": "queued",
        "proposal_id": prop["id"],
        "message": (
            "Queued for user approval. Nothing was saved. "
            "Tell the user to review and Apply the proposal."
        ),
    }
    return prop, json.dumps(result)


def narrate_tool(name: str, args: Optional[dict] = None) -> str:
    """Plain-language status for the live UI."""
    args = args or {}
    if name == "get_overview":
        return "Checking year-to-date budget…"
    if name == "get_monthly":
        return "Comparing month-by-month actuals vs plan…"
    if name == "list_categories":
        return "Reviewing budget categories…"
    if name == "search_transactions":
        if args.get("unassigned_only"):
            return "Finding unassigned transactions…"
        query = (args.get("query") or "").strip()
        month = args.get("month")
        if query and month:
            return f"Searching {month} transactions for “{query}”…"
        if query:
            return f"Searching transactions for “{query}”…"
        if month:
            return f"Listing {month} transactions…"
        return "Searching transactions…"
    if name == "get_transaction":
        return "Looking up a specific charge…"
    if name == "list_repayable":
        return "Checking expenses that can still be repaid…"
    if name == "get_accounts":
        return "Checking account balances…"
    if name == "get_investments":
        return "Looking at your portfolio…"
    if name == "list_rules":
        return "Reviewing auto-categorization rules…"
    if name == "propose_assign_transactions":
        return "Drafting category assignments…"
    if name == "propose_set_projections":
        return "Drafting projection changes…"
    if name == "propose_create_category":
        return "Drafting a new category…"
    if name == "propose_update_category":
        return "Drafting a category update…"
    if name == "propose_delete_category":
        return "Drafting a category deletion…"
    if name == "propose_create_subcategory":
        return "Drafting a new subcategory…"
    if name == "propose_update_subcategory":
        return "Drafting a subcategory rename…"
    if name == "propose_delete_subcategory":
        return "Drafting a subcategory deletion…"
    if name == "propose_set_repayment":
        return "Drafting repayment allocations…"
    if name == "propose_create_manual_transaction":
        return "Drafting a manual transaction…"
    if name == "propose_delete_transaction":
        return "Drafting a transaction deletion…"
    if name == "propose_create_rule":
        return "Drafting a mapping rule…"
    if name == "propose_update_rule":
        return "Drafting a mapping-rule update…"
    if name == "propose_delete_rule":
        return "Drafting a mapping-rule deletion…"
    if name == "propose_set_budget_year_start":
        return "Drafting a budget-year change…"
    return name.replace("_", " ") + "…"


def _parse_args(arguments: str) -> dict:
    try:
        data = json.loads(arguments or "{}")
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _execute_tool(
    session: Session,
    name: str,
    arguments: str,
    proposals: list[dict],
) -> tuple[str, Optional[str]]:
    """Returns (json_result, optional_trace_label)."""
    args = _parse_args(arguments)
    label = narrate_tool(name, args)

    if name in WRITE_TOOLS:
        prop, result = _queue_write(name, args)
        proposals.append(prop)
        return result, prop["summary"]

    handler = READ_HANDLERS.get(name)
    if not handler:
        return json.dumps({"error": f"Unknown tool {name}"}), label
    try:
        data = handler(session, args)
        return json.dumps(data, default=str), label
    except HTTPException as e:
        return json.dumps({"error": e.detail}), label
    except Exception as e:  # noqa: BLE001 — surface tool failures to the model
        return json.dumps({"error": str(e)}), label


def _output_text(response: Any) -> str:
    text = getattr(response, "output_text", None)
    if text:
        return text
    parts: list[str] = []
    for item in getattr(response, "output", None) or []:
        if getattr(item, "type", None) == "message":
            for block in getattr(item, "content", None) or []:
                if getattr(block, "type", None) in ("output_text", "text"):
                    parts.append(getattr(block, "text", "") or "")
    return "\n".join(p for p in parts if p).strip()


def iter_chat(session: Session, messages: list[dict]):
    """Yield status/tool/done events while running the tool loop."""
    client = _client()
    model = _model()

    input_list: list[Any] = []
    for m in messages:
        role = m.get("role")
        content = m.get("content")
        if role not in ("user", "assistant") or not content:
            continue
        input_list.append({"role": role, "content": content})

    if not input_list:
        raise HTTPException(status_code=400, detail="messages required")

    proposals: list[dict] = []
    tool_trace: list[str] = []

    yield {"type": "status", "label": "Thinking about your question…"}

    response = client.responses.create(
        model=model,
        instructions=SYSTEM_PROMPT,
        tools=TOOLS,
        input=input_list,
        reasoning={"effort": "medium"},
    )

    for _ in range(MAX_TOOL_ROUNDS):
        calls = [
            item
            for item in (response.output or [])
            if getattr(item, "type", None) == "function_call"
        ]
        if not calls:
            break

        input_list += response.output
        for item in calls:
            args = _parse_args(item.arguments or "{}")
            yield {
                "type": "tool",
                "label": narrate_tool(item.name, args),
                "name": item.name,
            }
            result, label = _execute_tool(
                session, item.name, item.arguments or "{}", proposals
            )
            if label:
                tool_trace.append(label)
            input_list.append({
                "type": "function_call_output",
                "call_id": item.call_id,
                "output": result,
            })

        yield {"type": "status", "label": "Working through the numbers…"}
        response = client.responses.create(
            model=model,
            instructions=SYSTEM_PROMPT,
            tools=TOOLS,
            input=input_list,
            reasoning={"effort": "medium"},
        )

    yield {"type": "status", "label": "Writing an answer…"}
    reply = _output_text(response) or "I looked at your data but had nothing to add."
    yield {
        "type": "done",
        "reply": reply,
        "proposals": proposals,
        "tool_trace": tool_trace,
        "model": model,
    }


def run_chat(session: Session, messages: list[dict]) -> dict:
    """Run the consultant tool loop. Returns reply, proposals, tool_trace."""
    result = None
    for event in iter_chat(session, messages):
        if event.get("type") == "done":
            result = event
    if not result:
        raise HTTPException(status_code=500, detail="Consultant produced no reply")
    return {
        "reply": result["reply"],
        "proposals": result["proposals"],
        "tool_trace": result["tool_trace"],
        "model": result.get("model"),
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _title_from(text: str) -> str:
    line = " ".join((text or "").strip().split())
    if not line:
        return "New chat"
    return line if len(line) <= 72 else line[:69] + "…"


def _serialize_turn(turn: ConsultantTurn) -> dict:
    proposals = []
    trace = []
    if turn.proposals_json:
        try:
            proposals = json.loads(turn.proposals_json)
        except json.JSONDecodeError:
            proposals = []
    if turn.tool_trace_json:
        try:
            trace = json.loads(turn.tool_trace_json)
        except json.JSONDecodeError:
            trace = []
    return {
        "id": str(turn.id),
        "role": turn.role,
        "content": turn.content,
        "proposals": proposals,
        "tool_trace": trace,
        "created_at": turn.created_at,
    }


def _next_sort(session: Session, thread_id: str) -> int:
    turns = list(
        session.exec(
            select(ConsultantTurn).where(ConsultantTurn.thread_id == thread_id)
        ).all()
    )
    if not turns:
        return 0
    return max(t.sort_order for t in turns) + 1


def list_threads(session: Session) -> dict:
    threads = list(session.exec(select(ConsultantThread)).all())
    threads.sort(key=lambda t: t.updated_at or "", reverse=True)
    rows = []
    for t in threads:
        turns = list(
            session.exec(
                select(ConsultantTurn).where(ConsultantTurn.thread_id == t.id)
            ).all()
        )
        last = max(turns, key=lambda x: x.sort_order) if turns else None
        preview = ""
        if last:
            preview = " ".join(last.content.split())[:100]
        rows.append({
            "id": t.id,
            "title": t.title,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
            "preview": preview,
        })
    return {"conversations": rows}


def get_thread(session: Session, thread_id: str) -> dict:
    thread = session.get(ConsultantThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Conversation not found")
    turns = session.exec(
        select(ConsultantTurn)
        .where(ConsultantTurn.thread_id == thread_id)
        .order_by(ConsultantTurn.sort_order)
    ).all()
    return {
        "id": thread.id,
        "title": thread.title,
        "created_at": thread.created_at,
        "updated_at": thread.updated_at,
        "messages": [_serialize_turn(t) for t in turns],
    }


def create_thread(session: Session, title: str = "New chat") -> ConsultantThread:
    now = _now()
    thread = ConsultantThread(
        id=str(uuid.uuid4()),
        title=title or "New chat",
        created_at=now,
        updated_at=now,
    )
    session.add(thread)
    session.commit()
    session.refresh(thread)
    return thread


def rename_thread(session: Session, thread_id: str, title: str) -> dict:
    thread = session.get(ConsultantThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Conversation not found")
    thread.title = _title_from(title) if title.strip() else thread.title
    thread.updated_at = _now()
    session.add(thread)
    session.commit()
    return {"id": thread.id, "title": thread.title}


def delete_thread(session: Session, thread_id: str) -> dict:
    thread = session.get(ConsultantThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Conversation not found")
    for turn in session.exec(
        select(ConsultantTurn).where(ConsultantTurn.thread_id == thread_id)
    ).all():
        session.delete(turn)
    session.delete(thread)
    session.commit()
    return {"ok": True}


def clear_turn_proposals(session: Session, turn_id: int) -> dict:
    turn = session.get(ConsultantTurn, turn_id)
    if not turn:
        raise HTTPException(status_code=404, detail="Message not found")
    turn.proposals_json = None
    session.add(turn)
    session.commit()
    return {"ok": True}


def append_turn(
    session: Session,
    thread_id: str,
    role: str,
    content: str,
    proposals: Optional[list] = None,
    tool_trace: Optional[list] = None,
) -> ConsultantTurn:
    thread = session.get(ConsultantThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Conversation not found")
    turn = ConsultantTurn(
        thread_id=thread_id,
        role=role,
        content=content,
        proposals_json=json.dumps(proposals) if proposals else None,
        tool_trace_json=json.dumps(tool_trace) if tool_trace else None,
        created_at=_now(),
        sort_order=_next_sort(session, thread_id),
    )
    session.add(turn)
    thread.updated_at = _now()
    session.add(thread)
    session.commit()
    session.refresh(turn)
    return turn


def history_for_model(session: Session, thread_id: str) -> list[dict]:
    turns = session.exec(
        select(ConsultantTurn)
        .where(ConsultantTurn.thread_id == thread_id)
        .order_by(ConsultantTurn.sort_order)
    ).all()
    return [{"role": t.role, "content": t.content} for t in turns]


def apply_proposals(session: Session, proposals: list[dict]) -> dict:
    """Re-validate and apply proposals via the same handlers the UI uses."""
    from .main import (
        AllocationIn,
        AssignIn,
        CategoryIn,
        CategoryUpdate,
        ManualTxnIn,
        ProjectionItem,
        ProjectionsIn,
        RepaymentIn,
        RuleIn,
        RuleUpdate,
        SettingsIn,
        SubcategoryIn,
        SubcategoryUpdate,
        assign_transaction,
        create_category,
        create_manual_transaction,
        create_rule,
        create_subcategory,
        delete_category,
        delete_rule,
        delete_subcategory,
        delete_transaction,
        put_projections,
        put_settings,
        set_repayment,
        update_category,
        update_rule,
        update_subcategory,
    )

    results = []
    for prop in proposals:
        kind = prop.get("kind")
        payload = prop.get("payload") or {}
        summary = prop.get("summary") or kind
        try:
            if kind == "assign_transactions":
                sub_id = payload.get("subcategory_id")
                for tid in payload.get("transaction_ids") or []:
                    assign_transaction(
                        tid, AssignIn(subcategory_id=sub_id), session
                    )
                results.append({"summary": summary, "ok": True})
            elif kind == "set_projections":
                items = [
                    ProjectionItem(
                        subcategory_id=p["subcategory_id"],
                        month=p["month"],
                        amount=float(p["amount"]),
                    )
                    for p in (payload.get("projections") or [])
                ]
                put_projections(ProjectionsIn(projections=items), session)
                results.append({"summary": summary, "ok": True})
            elif kind == "create_category":
                out = create_category(
                    CategoryIn(name=payload["name"], kind=payload["kind"]),
                    session,
                )
                results.append({"summary": summary, "ok": True, "id": out.get("id")})
            elif kind == "update_category":
                update_category(
                    payload["category_id"],
                    CategoryUpdate(
                        name=payload.get("name"),
                        kind=payload.get("kind"),
                    ),
                    session,
                )
                results.append({"summary": summary, "ok": True})
            elif kind == "delete_category":
                delete_category(payload["category_id"], session)
                results.append({"summary": summary, "ok": True})
            elif kind == "create_subcategory":
                out = create_subcategory(
                    SubcategoryIn(
                        category_id=payload["category_id"],
                        name=payload["name"],
                    ),
                    session,
                )
                results.append({"summary": summary, "ok": True, "id": out.get("id")})
            elif kind == "update_subcategory":
                update_subcategory(
                    payload["subcategory_id"],
                    SubcategoryUpdate(name=payload.get("name")),
                    session,
                )
                results.append({"summary": summary, "ok": True})
            elif kind == "delete_subcategory":
                delete_subcategory(payload["subcategory_id"], session)
                results.append({"summary": summary, "ok": True})
            elif kind == "set_repayment":
                allocs = [
                    AllocationIn(
                        expense_id=a["expense_id"],
                        amount=float(a["amount"]),
                    )
                    for a in (payload.get("allocations") or [])
                ]
                set_repayment(
                    payload["transaction_id"],
                    RepaymentIn(allocations=allocs),
                    session,
                )
                results.append({"summary": summary, "ok": True})
            elif kind == "create_manual_transaction":
                allocs = None
                if payload.get("allocations"):
                    allocs = [
                        AllocationIn(
                            expense_id=a["expense_id"],
                            amount=float(a["amount"]),
                        )
                        for a in payload["allocations"]
                    ]
                out = create_manual_transaction(
                    ManualTxnIn(
                        date=payload["date"],
                        name=payload["name"],
                        amount=float(payload["amount"]),
                        merchant_name=payload.get("merchant_name"),
                        subcategory_id=payload.get("subcategory_id"),
                        allocations=allocs,
                    ),
                    session,
                )
                results.append({"summary": summary, "ok": True, "id": out.get("id")})
            elif kind == "delete_transaction":
                delete_transaction(payload["transaction_id"], session)
                results.append({"summary": summary, "ok": True})
            elif kind == "create_rule":
                out = create_rule(
                    RuleIn(
                        match_type=payload["match_type"],
                        match_value=payload["match_value"],
                        subcategory_id=payload["subcategory_id"],
                        priority=int(payload.get("priority") or 0),
                    ),
                    session,
                )
                results.append({"summary": summary, "ok": True, "id": out.get("id")})
            elif kind == "update_rule":
                update_rule(
                    payload["rule_id"],
                    RuleUpdate(
                        match_type=payload.get("match_type"),
                        match_value=payload.get("match_value"),
                        subcategory_id=payload.get("subcategory_id"),
                        priority=payload.get("priority"),
                    ),
                    session,
                )
                results.append({"summary": summary, "ok": True})
            elif kind == "delete_rule":
                delete_rule(payload["rule_id"], session)
                results.append({"summary": summary, "ok": True})
            elif kind == "set_budget_year_start":
                put_settings(
                    SettingsIn(
                        budget_year_start_month=int(
                            payload["budget_year_start_month"]
                        )
                    ),
                    session,
                )
                results.append({"summary": summary, "ok": True})
            else:
                results.append({
                    "summary": summary,
                    "ok": False,
                    "error": f"Unknown proposal kind: {kind}",
                })
        except HTTPException as e:
            results.append({
                "summary": summary,
                "ok": False,
                "error": e.detail,
            })
        except Exception as e:  # noqa: BLE001
            results.append({
                "summary": summary,
                "ok": False,
                "error": str(e),
            })

    return {
        "ok": all(r.get("ok") for r in results) if results else True,
        "results": results,
    }
