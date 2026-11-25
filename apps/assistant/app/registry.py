"""Capability index: what Nova can do, who may call it, and under which policy."""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from .devices import Device

CAPABILITIES_PATH = Path(__file__).with_name("capabilities.yaml")
POLICIES = {"automatic", "approval", "forbidden"}
EFFECTS = {"read", "write"}


@dataclass(frozen=True)
class Capability:
    name: str
    app: str
    scope: str
    policy: str
    effect: str
    summary: str
    description: str
    parameters: dict[str, Any] = field(hash=False)
    read_back: str | None = None


class ArgumentError(ValueError):
    pass


@lru_cache
def load() -> dict[str, Capability]:
    raw = yaml.safe_load(CAPABILITIES_PATH.read_text(encoding="utf-8"))
    caps: dict[str, Capability] = {}
    for entry in raw.get("capabilities") or []:
        cap = Capability(
            name=entry["name"],
            app=entry["app"],
            scope=entry["scope"],
            policy=entry["policy"],
            effect=entry["effect"],
            summary=entry["summary"].strip(),
            description=" ".join(str(entry["description"]).split()),
            parameters=entry["parameters"],
            read_back=entry.get("read_back"),
        )
        _check(cap)
        if cap.name in caps:
            raise ValueError(f"duplicate capability {cap.name}")
        caps[cap.name] = cap
    return caps


def _check(cap: Capability) -> None:
    if cap.policy not in POLICIES:
        raise ValueError(f"{cap.name}: unknown policy {cap.policy}")
    if cap.effect not in EFFECTS:
        raise ValueError(f"{cap.name}: unknown effect {cap.effect}")
    if cap.parameters.get("type") != "object":
        raise ValueError(f"{cap.name}: parameters must be an object schema")
    if cap.policy == "approval" and not cap.read_back:
        raise ValueError(f"{cap.name}: approval capabilities need read_back")


def get(name: str) -> Capability | None:
    return load().get(name)


def for_device(device: Device) -> list[Capability]:
    return [c for c in load().values() if c.policy != "forbidden" and device.allows(c.scope)]


def model_tools(caps: list[Capability]) -> list[dict[str, Any]]:
    return [
        {"type": "function", "name": c.name, "description": c.description, "parameters": c.parameters}
        for c in caps
    ]


def summary(caps: list[Capability]) -> str:
    """Compact capability list for the bootstrap context."""
    by_app: dict[str, list[str]] = {}
    for c in caps:
        note = " (needs the user's yes)" if c.policy == "approval" else ""
        by_app.setdefault(c.app, []).append(f"  - {c.name}: {c.summary}{note}")
    return "\n".join(f"- {app}:\n" + "\n".join(lines) for app, lines in by_app.items())


def read_back(cap: Capability, args: dict[str, Any]) -> str:
    template = cap.read_back or cap.summary
    safe = {k: str(v)[:600] for k, v in args.items()}
    try:
        return template.format(**safe)
    except (KeyError, IndexError):
        return f"{cap.summary} {safe}"


_TYPES = {"string": str, "integer": int, "boolean": bool, "number": (int, float), "object": dict, "array": list}


def validate_args(cap: Capability, args: dict[str, Any]) -> dict[str, Any]:
    """Enough JSON Schema to enforce the shapes used in capabilities.yaml."""
    schema = cap.parameters
    props: dict[str, Any] = schema.get("properties") or {}
    if not isinstance(args, dict):
        raise ArgumentError("arguments must be an object")
    for key in schema.get("required") or []:
        if key not in args:
            raise ArgumentError(f"missing {key}")
    if schema.get("additionalProperties") is False:
        extra = set(args) - set(props)
        if extra:
            raise ArgumentError(f"unexpected {', '.join(sorted(extra))}")
    for key, value in args.items():
        spec = props.get(key)
        if not spec:
            continue
        expected = _TYPES.get(spec.get("type", ""))
        if expected and (not isinstance(value, expected) or (expected is int and isinstance(value, bool))):
            raise ArgumentError(f"{key} must be {spec['type']}")
        if "enum" in spec and value not in spec["enum"]:
            raise ArgumentError(f"{key} must be one of {', '.join(map(str, spec['enum']))}")
        if isinstance(value, str):
            if len(value) > spec.get("maxLength", 10_000):
                raise ArgumentError(f"{key} is too long")
            if len(value.strip()) < spec.get("minLength", 0):
                raise ArgumentError(f"{key} is empty")
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if "minimum" in spec and value < spec["minimum"]:
                raise ArgumentError(f"{key} must be at least {spec['minimum']}")
            if "maximum" in spec and value > spec["maximum"]:
                raise ArgumentError(f"{key} must be at most {spec['maximum']}")
    return args
