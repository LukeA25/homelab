"""OpenAI-compatible chat client for Study Desk Ask.

Defaults to a GPT-5 reasoning model. Point OPENAI_BASE_URL + OPENAI_API_KEY at
any OpenAI-compatible provider without code changes.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .config import (
    ASK_MAX_TOKENS,
    ASK_MODEL,
    ASK_PROVIDER,
    ASK_REASONING_EFFORT,
    ASK_TIMEOUT_SECONDS,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
)

log = logging.getLogger(__name__)


class LlmError(RuntimeError):
    """Raised when the configured provider cannot produce a completion."""


def llm_configured() -> bool:
    if ASK_PROVIDER in {"openai", "openai_compatible"}:
        return bool(OPENAI_API_KEY)
    return False


def _reasoning_model(model: str) -> bool:
    name = model.lower()
    return name.startswith(("gpt-5", "gpt-6", "o1", "o3", "o4"))


def _message_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                text = part.get("text") or part.get("content") or ""
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts).strip()
    return ""


async def chat_completion(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> str:
    """Return the assistant message content from an OpenAI-compatible chat API."""
    if ASK_PROVIDER not in {"openai", "openai_compatible"}:
        raise LlmError(f"unsupported ASK_PROVIDER={ASK_PROVIDER!r}")
    if not OPENAI_API_KEY:
        raise LlmError("OPENAI_API_KEY is not set")

    url = f"{OPENAI_BASE_URL}/chat/completions"
    budget = max_tokens if max_tokens is not None else ASK_MAX_TOKENS
    payload: dict[str, Any] = {
        "model": ASK_MODEL,
        "messages": messages,
    }
    if _reasoning_model(ASK_MODEL):
        # Reasoning tokens count against this budget. Temperature is fixed.
        payload["max_completion_tokens"] = budget
        if ASK_REASONING_EFFORT and ASK_REASONING_EFFORT != "default":
            payload["reasoning_effort"] = ASK_REASONING_EFFORT
    else:
        payload["temperature"] = temperature
        payload["max_tokens"] = budget
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=ASK_TIMEOUT_SECONDS) as client:
            res = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise LlmError(f"LLM request failed: {exc}") from exc

    if res.status_code >= 400:
        detail = res.text[:400]
        raise LlmError(f"LLM HTTP {res.status_code}: {detail}")

    data = res.json()
    try:
        content = _message_text(data["choices"][0]["message"].get("content"))
    except (KeyError, IndexError, TypeError) as exc:
        raise LlmError(f"unexpected LLM response shape: {data!r}") from exc

    if not content:
        raise LlmError("LLM returned an empty completion")
    return content
