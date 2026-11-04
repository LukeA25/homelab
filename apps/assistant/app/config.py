from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


@lru_cache
def settings() -> dict:
    return {
        "openai_api_key": os.getenv("OPENAI_API_KEY", "").strip(),
        "device_token": os.getenv("ASSISTANT_DEVICE_TOKEN", "dev-token-change-me").strip(),
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
        "cursor_api_key": os.getenv("CURSOR_API_KEY", "").strip(),
        "cursor_repo": os.getenv("CURSOR_REPO_PATH", "/home/landerson/homelab"),
        "quiet_hours_start": int(os.getenv("QUIET_HOURS_START", "23")),
        "quiet_hours_end": int(os.getenv("QUIET_HOURS_END", "7")),
    }
