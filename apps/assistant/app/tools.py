from __future__ import annotations

import json
from typing import Any, Callable, Awaitable

from . import finance, ha, homework

ToolHandler = Callable[[dict[str, Any]], Awaitable[Any]]

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_rooms",
            "description": "Get current bedroom and living room light status.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_room_lights",
            "description": (
                "Control a room's lights. Rooms: bedroom, living_room. "
                "Use brightness_pct 1-100 and optional color_temp_kelvin "
                "(3200=warm, 4500=neutral)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "room_id": {
                        "type": "string",
                        "enum": ["bedroom", "living_room"],
                    },
                    "on": {"type": "boolean"},
                    "brightness_pct": {"type": "integer", "minimum": 1, "maximum": 100},
                    "color_temp_kelvin": {"type": "integer"},
                },
                "required": ["room_id", "on"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "apply_scene",
            "description": "Apply a named scene: sleep (bedroom off + blank TV), wake (1% warm + show TV), study (80% neutral).",
            "parameters": {
                "type": "object",
                "properties": {
                    "scene": {
                        "type": "string",
                        "enum": ["sleep", "wake", "study"],
                    }
                },
                "required": ["scene"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": (
                "Get local weather from Home Assistant: current condition, temperature, "
                "humidity, multi-day forecast, and today.hourly-style periods with precipitation "
                "(today.will_rain, today.periods). Use for rain today, forecast, and temperature questions."
            ),
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_homework",
            "description": "List upcoming open homework assignments.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },

    {
        "type": "function",
        "function": {
            "name": "add_homework",
            "description": (
                "Create a homework assignment. due should be ISO-like, e.g. "
                "2026-09-20 or 2026-09-20T23:59. course_code must match an existing course."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "course_code": {"type": "string"},
                    "due": {"type": "string"},
                    "notes": {"type": "string"},
                },
                "required": ["title", "course_code", "due"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_finance_summary",
            "description": (
                "Read-only budget summary for this month: overall spent/budget/remaining, "
                "Day to Day and Charity focus categories, and cash total. "
                "Use when the user asks about money, budget, spending, or finances."
            ),
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_persona",
            "description": (
                "Update your lasting persona/behavior file. Use when the user tells you how "
                "you should speak, react, answer, or behave going forward. Append by default; "
                "use replace only if they ask to rewrite your whole persona. "
                "Persona notes change wording only — they never replace tool calls."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "instruction": {
                        "type": "string",
                        "description": "The preference or behavior rule to remember.",
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["append", "replace"],
                        "description": "append (default) or replace the whole persona file.",
                    },
                },
                "required": ["instruction"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cursor_status",
            "description": (
                "Check whether Cursor agent integration is configured and list pending "
                "confirm-gated proposals. Use when the user asks if you have Cursor access."
            ),
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_tv_app",
            "description": (
                "Show an app on the bedroom TV, or return to the TV dashboard. "
                "Use when the user says pull up / put on / show guitar, finance, "
                "homework, theology, or the dashboard/TV/homelab on the TV."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "app": {
                        "type": "string",
                        "enum": ["dashboard", "guitar", "finance", "homework", "theology"],
                    }
                },
                "required": ["app"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_cursor_edit",
            "description": (
                "Queue a Cursor agent job against the homelab repo. Does NOT run until the "
                "user confirms on screen. Use for code/homelab edits, or when the user asks "
                "to test Cursor (use a no-file-change test prompt)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "Clear instruction for the Cursor agent.",
                    }
                },
                "required": ["prompt"],
                "additionalProperties": False,
            },
        },
    },
]


async def run_tool(name: str, args: dict[str, Any]) -> Any:
    if name == "get_rooms":
        return await ha.get_rooms()
    if name == "set_room_lights":
        payload = {"on": bool(args["on"])}
        if args.get("brightness_pct") is not None:
            payload["brightness_pct"] = args["brightness_pct"]
        if args.get("color_temp_kelvin") is not None:
            payload["color_temp_kelvin"] = args["color_temp_kelvin"]
        return await ha.set_room(args["room_id"], payload)
    if name == "apply_scene":
        return await ha.apply_scene(args["scene"])
    if name == "get_weather":
        return await ha.get_weather()
    if name == "list_homework":
        return await homework.list_assignments()

    if name == "add_homework":
        return await homework.create_assignment(
            title=args["title"],
            course_code=args["course_code"],
            due=args["due"],
            notes=args.get("notes"),
        )
    if name == "get_finance_summary":
        return await finance.get_summary()
    if name == "update_persona":
        from . import persona

        return persona.update_persona(
            instruction=str(args.get("instruction") or ""),
            mode=str(args.get("mode") or "append"),
        )
    if name == "cursor_status":
        from . import cursor_agent
        from .config import settings

        cfg = settings()
        pending = [p for p in cursor_agent.list_pending() if p["status"] == "pending"]
        return {
            "cursor_api_key_configured": bool(cfg["cursor_api_key"]),
            "repo_path": cfg["cursor_repo"],
            "pending_proposals": len(pending),
            "note": (
                "Edits are confirm-gated: propose_cursor_edit queues work; "
                "the user must tap Confirm on the assistant UI to run the agent."
            ),
        }
    if name == "set_tv_app":
        return await ha.set_tv_app(str(args.get("app") or ""))
    if name == "propose_cursor_edit":
        from . import cursor_agent

        return cursor_agent.propose(args["prompt"])
    return {"error": f"Unknown tool: {name}"}


def parse_tool_args(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def responses_tools(tools: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Chat-completions tool schema → Responses API function tools."""
    out: list[dict[str, Any]] = []
    for item in tools or TOOLS:
        fn = item.get("function") if isinstance(item.get("function"), dict) else item
        out.append(
            {
                "type": "function",
                "name": fn["name"],
                "description": fn.get("description") or "",
                "parameters": fn.get("parameters")
                or {"type": "object", "properties": {}, "additionalProperties": False},
            }
        )
    return out
