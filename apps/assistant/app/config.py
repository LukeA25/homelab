from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

DEFAULT_LEGACY_TOKEN = "dev-token-change-me"


def _flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes")


@lru_cache
def settings() -> dict:
    return {
        "openai_api_key": os.getenv("OPENAI_API_KEY", "").strip(),
        "data_dir": os.getenv("NOVA_DATA_DIR", "/data"),
        # Shared token from before per-device credentials. Imported once as the
        # "legacy-shared" device; revoke it after enrolling real devices.
        "legacy_token": os.getenv("ASSISTANT_DEVICE_TOKEN", "").strip(),
        "allow_default_legacy_token": _flag("ALLOW_DEFAULT_LEGACY_TOKEN"),
        "ha_base_url": os.getenv("HA_BASE_URL", "http://100.101.135.109:8123").rstrip("/"),
        "ha_token": os.getenv("HA_TOKEN", "").strip(),
        "homework_base_url": os.getenv("HOMEWORK_BASE_URL", "http://100.101.135.109:8005").rstrip("/"),
        "dashboard_base_url": os.getenv("DASHBOARD_BASE_URL", "http://100.101.135.109:8004").rstrip("/"),
        "display_tz": os.getenv("DISPLAY_TZ", "America/Chicago"),
        "stt_model": os.getenv("ASSISTANT_STT_MODEL", "whisper-1"),
        "llm_model": os.getenv("ASSISTANT_LLM_MODEL", "gpt-5.4"),
        "llm_reasoning": os.getenv("ASSISTANT_LLM_REASONING", "medium").strip() or "medium",
        "tts_model": os.getenv("ASSISTANT_TTS_MODEL", "gpt-4o-mini-tts"),
        "tts_voice": os.getenv("ASSISTANT_TTS_VOICE", "alloy"),
        "worker_url": os.getenv("WORKER_URL", "http://agent-worker:8000").rstrip("/"),
        "worker_token": os.getenv("WORKER_TOKEN", "").strip(),
        "worker_query_timeout": float(os.getenv("WORKER_QUERY_TIMEOUT", "40")),
        "ops_url": os.getenv("OPS_URL", "http://ops-runner:8000").rstrip("/"),
        "ops_gateway_token": os.getenv("OPS_GATEWAY_TOKEN", "").strip(),
        "approval_ttl_seconds": int(os.getenv("APPROVAL_TTL_SECONDS", "120")),
        "quiet_hours_start": int(os.getenv("QUIET_HOURS_START", "23")),
        "quiet_hours_end": int(os.getenv("QUIET_HOURS_END", "7")),
    }
