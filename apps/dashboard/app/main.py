"""Homelab dashboard API + SPA.

Proxies Home Assistant (lights/weather) and the finance app (summary widgets),
serves a static service catalog with health checks, and ships the built React
SPA from frontend_dist.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

load_dotenv()

from .integrations import finance, homeassistant, homework, services, system  # noqa: E402

DISPLAY_TZ = os.getenv("DISPLAY_TZ", "America/Chicago")

app = FastAPI(title="Homelab Dashboard")
api = APIRouter()


@app.on_event("startup")
async def _start_background() -> None:
    system.start_sampler()


class LightControl(BaseModel):
    on: bool = True
    brightness_pct: Optional[int] = Field(default=None, ge=1, le=100)
    color_temp_kelvin: Optional[int] = None
    rgb_color: Optional[list[int]] = None


@api.get("/health")
async def health():
    return {"ok": True}


@api.get("/services")
async def list_services():
    return {"groups": await services.get_services()}


@api.get("/rooms")
async def list_rooms():
    try:
        return {"rooms": await homeassistant.get_rooms()}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@api.post("/rooms/all")
async def control_all_rooms(body: LightControl):
    try:
        await homeassistant.set_all_lights(body.model_dump(exclude_none=True))
        return {"rooms": await homeassistant.get_rooms()}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api.post("/rooms/{room_id}")
async def control_room(room_id: str, body: LightControl):
    try:
        room = await homeassistant.set_room(
            room_id, body.model_dump(exclude_none=True)
        )
        return room
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@api.get("/weather")
async def weather():
    try:
        data = await homeassistant.get_weather()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if data is None:
        return {"weather": None}
    return {"weather": data}


@api.get("/finance/summary")
async def finance_summary(refresh: bool = False, month: Optional[str] = None):
    return await finance.get_summary(force=refresh, month=month)


@api.get("/homework")
async def list_homework(limit: int = 10):
    return homework.get_assignments(limit=limit)


@api.get("/system")
async def system_stats():
    return system.get_stats()


@api.get("/config")
async def config():
    return {"tz": DISPLAY_TZ}


app.include_router(api, prefix="/api")

# The Vite build is copied here by the Docker image. __file__ is
# /app/app/main.py, so the dist lives at /app/frontend_dist.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend_dist"


def _mount_spa() -> None:
    if not FRONTEND_DIST.is_dir():
        return
    assets = FRONTEND_DIST / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):  # noqa: ARG001
        """Serve the SPA shell for all non-API routes."""
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")


_mount_spa()
