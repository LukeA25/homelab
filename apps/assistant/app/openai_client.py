from __future__ import annotations

import io
from typing import Any

from openai import AsyncOpenAI

from .config import settings
from .tools import responses_tools


def _client() -> AsyncOpenAI:
    key = settings()["openai_api_key"]
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    return AsyncOpenAI(api_key=key)


async def transcribe(audio: bytes, filename: str = "audio.webm") -> str:
    cfg = settings()
    client = _client()
    file_obj = io.BytesIO(audio)
    file_obj.name = filename
    result = await client.audio.transcriptions.create(
        model=cfg["stt_model"],
        file=file_obj,
    )
    return (result.text or "").strip()


def output_text(response: Any) -> str:
    text = getattr(response, "output_text", None)
    if text:
        return str(text).strip()
    parts: list[str] = []
    for item in getattr(response, "output", None) or []:
        if getattr(item, "type", None) == "message":
            for block in getattr(item, "content", None) or []:
                if getattr(block, "type", None) in ("output_text", "text"):
                    parts.append(getattr(block, "text", "") or "")
    return "\n".join(p for p in parts if p).strip()


def function_calls(response: Any) -> list[Any]:
    return [
        item
        for item in (getattr(response, "output", None) or [])
        if getattr(item, "type", None) == "function_call"
    ]


async def respond(
    *,
    instructions: str,
    input_list: list[Any],
    tools: list[dict[str, Any]],
) -> Any:
    """Same Responses API path the finance consultant uses (gpt-5.4)."""
    cfg = settings()
    client = _client()
    kwargs: dict[str, Any] = {
        "model": cfg["llm_model"],
        "instructions": instructions,
        "tools": responses_tools(tools),
        "input": input_list,
    }
    effort = cfg.get("llm_reasoning") or "medium"
    if effort != "none":
        kwargs["reasoning"] = {"effort": effort}
    return await client.responses.create(**kwargs)


async def synthesize(text: str) -> bytes:
    cfg = settings()
    client = _client()
    # Prefer newer TTS; fall back to tts-1 if the mini model isn't available.
    try:
        resp = await client.audio.speech.create(
            model=cfg["tts_model"],
            voice=cfg["tts_voice"],
            input=text,
            response_format="mp3",
        )
    except Exception:
        resp = await client.audio.speech.create(
            model="tts-1",
            voice=cfg["tts_voice"] if cfg["tts_voice"] in {
                "alloy", "echo", "fable", "onyx", "nova", "shimmer"
            } else "alloy",
            input=text,
            response_format="mp3",
        )
    return resp.content
