"""Home Assistant REST API client for lights and weather."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Optional
from zoneinfo import ZoneInfo

import httpx

HA_BASE_URL = os.getenv("HA_BASE_URL", "http://100.101.135.109:8123").rstrip("/")
HA_TOKEN = os.getenv("HA_TOKEN", "")
DISPLAY_TZ = os.getenv("DISPLAY_TZ", "America/Chicago")

_RAINY_CONDITIONS = frozenset(
    {"rainy", "pouring", "lightning-rainy", "hail", "snowy-rainy"}
)

ROOMS: dict[str, dict[str, Any]] = {
    "bedroom": {
        "id": "bedroom",
        "name": "Bedroom",
        "entities": ["light.desk_light", "light.room_light"],
    },
    "living_room": {
        "id": "living_room",
        "name": "Living Room",
        "entities": ["light.upper_light", "light.lower_light"],
    },
}

LIGHT_ENTITIES = [eid for room in ROOMS.values() for eid in room["entities"]]


def _headers() -> dict[str, str]:
    if not HA_TOKEN:
        raise RuntimeError("HA_TOKEN is not configured")
    return {
        "Authorization": f"Bearer {HA_TOKEN}",
        "Content-Type": "application/json",
    }


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=8.0, verify=False)


def _brightness_pct(brightness: Optional[int]) -> Optional[int]:
    if brightness is None:
        return None
    return max(0, min(100, round(brightness / 255 * 100)))


def _normalize_light(state: dict[str, Any]) -> dict[str, Any]:
    attrs = state.get("attributes") or {}
    entity_id = state.get("entity_id", "")
    modes = attrs.get("supported_color_modes") or []
    return {
        "entity_id": entity_id,
        "name": attrs.get("friendly_name")
        or entity_id.replace("light.", "").replace("_", " ").title(),
        "on": state.get("state") == "on",
        "brightness": attrs.get("brightness"),
        "brightness_pct": _brightness_pct(attrs.get("brightness")),
        "color_temp_kelvin": attrs.get("color_temp_kelvin") or attrs.get("color_temp"),
        "rgb_color": attrs.get("rgb_color"),
        "supported_color_modes": list(modes),
        "available": state.get("state") not in ("unavailable", "unknown", None),
    }


def _unavailable(entity_id: str) -> dict[str, Any]:
    return {
        "entity_id": entity_id,
        "name": entity_id.replace("light.", "").replace("_", " ").title(),
        "on": False,
        "brightness": None,
        "brightness_pct": None,
        "color_temp_kelvin": None,
        "rgb_color": None,
        "supported_color_modes": [],
        "available": False,
    }


async def _fetch_light(client: httpx.AsyncClient, entity_id: str) -> dict[str, Any]:
    try:
        resp = await client.get(
            f"{HA_BASE_URL}/api/states/{entity_id}",
            headers=_headers(),
        )
        if resp.status_code == 404:
            return _unavailable(entity_id)
        resp.raise_for_status()
        return _normalize_light(resp.json())
    except Exception:
        return _unavailable(entity_id)


def _aggregate_room(room: dict[str, Any], lights: list[dict[str, Any]]) -> dict[str, Any]:
    available = [l for l in lights if l.get("available")]
    on_lights = [l for l in available if l.get("on")]
    modes: set[str] = set()
    for l in available:
        modes.update(l.get("supported_color_modes") or [])

    brightness_values = [
        l["brightness_pct"]
        for l in on_lights
        if l.get("brightness_pct") is not None
    ]
    brightness_pct = (
        round(sum(brightness_values) / len(brightness_values))
        if brightness_values
        else None
    )

    rgb_color: Optional[list[int]] = None
    color_temp_kelvin: Optional[int] = None
    for light in on_lights:
        rgb = light.get("rgb_color")
        if isinstance(rgb, (list, tuple)) and len(rgb) >= 3:
            rgb_color = [int(rgb[0]), int(rgb[1]), int(rgb[2])]
            break
    if rgb_color is None:
        for light in on_lights:
            kelvin = light.get("color_temp_kelvin")
            if kelvin is not None:
                color_temp_kelvin = int(kelvin)
                break

    return {
        "id": room["id"],
        "name": room["name"],
        "entities": list(room["entities"]),
        "on": len(on_lights) > 0,
        "brightness_pct": brightness_pct if on_lights else None,
        "rgb_color": rgb_color,
        "color_temp_kelvin": color_temp_kelvin,
        "supported_color_modes": sorted(modes),
        "available": len(available) > 0,
        "lights_on": len(on_lights),
        "lights_total": len(lights),
    }


async def get_lights() -> list[dict[str, Any]]:
    async with _client() as client:
        return [await _fetch_light(client, eid) for eid in LIGHT_ENTITIES]


async def get_rooms() -> list[dict[str, Any]]:
    async with _client() as client:
        rooms = []
        for room in ROOMS.values():
            lights = [await _fetch_light(client, eid) for eid in room["entities"]]
            rooms.append(_aggregate_room(room, lights))
        return rooms


async def call_light_service(entity_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    if not entity_id.startswith("light."):
        raise ValueError("Only light entities are allowed")
    if entity_id not in LIGHT_ENTITIES:
        raise ValueError(f"Unknown light entity: {entity_id}")

    on = bool(payload.get("on", True))
    service = "turn_on" if on else "turn_off"
    body: dict[str, Any] = {"entity_id": entity_id}

    if on:
        if payload.get("brightness_pct") is not None:
            body["brightness_pct"] = max(1, min(100, int(payload["brightness_pct"])))
        if payload.get("color_temp_kelvin") is not None:
            body["color_temp_kelvin"] = int(payload["color_temp_kelvin"])
        if payload.get("rgb_color") is not None:
            rgb = payload["rgb_color"]
            if isinstance(rgb, (list, tuple)) and len(rgb) == 3:
                body["rgb_color"] = [int(c) for c in rgb]

    async with _client() as client:
        resp = await client.post(
            f"{HA_BASE_URL}/api/services/light/{service}",
            headers=_headers(),
            json=body,
        )
        resp.raise_for_status()
        return await _fetch_light(client, entity_id)


async def set_room(room_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    room = ROOMS.get(room_id)
    if not room:
        raise ValueError(f"Unknown room: {room_id}")

    lights: list[dict[str, Any]] = []
    for entity_id in room["entities"]:
        try:
            lights.append(await call_light_service(entity_id, payload))
        except Exception:
            lights.append(_unavailable(entity_id))
    return _aggregate_room(room, lights)


async def set_all_lights(payload: dict[str, Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for entity_id in LIGHT_ENTITIES:
        try:
            results.append(await call_light_service(entity_id, payload))
        except Exception:
            results.append(_unavailable(entity_id))
    return results


def _forecast_datetime(raw: Any) -> Optional[datetime]:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=ZoneInfo("UTC"))
    if isinstance(raw, str):
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _is_rainy_period(condition: Any, precipitation: Any) -> bool:
    try:
        if precipitation is not None and float(precipitation) > 0:
            return True
    except (TypeError, ValueError):
        pass
    if not isinstance(condition, str):
        return False
    c = condition.lower()
    return c in _RAINY_CONDITIONS or "rain" in c


async def _fetch_ha_forecast(
    client: httpx.AsyncClient, entity_id: str, forecast_type: str
) -> list[dict[str, Any]]:
    try:
        resp = await client.post(
            f"{HA_BASE_URL}/api/services/weather/get_forecasts",
            params={"return_response": "true"},
            headers=_headers(),
            json={"entity_id": entity_id, "type": forecast_type},
        )
        resp.raise_for_status()
        service_response = (resp.json() or {}).get("service_response") or {}
        entity_fc = service_response.get(entity_id) or {}
        raw = entity_fc.get("forecast") or []
        return [item for item in raw if isinstance(item, dict)]
    except Exception:
        return []


def _normalize_daily_forecast(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in items:
        out.append(
            {
                "datetime": item.get("datetime"),
                "condition": item.get("condition"),
                "temperature": item.get("temperature"),
                "templow": item.get("templow"),
                "precipitation": item.get("precipitation"),
                "precipitation_probability": item.get("precipitation_probability"),
            }
        )
    return out


def _build_today_forecast(
    hourly_raw: list[dict[str, Any]], tz_name: str
) -> dict[str, Any]:
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")
    today = datetime.now(tz).date()
    periods: list[dict[str, Any]] = []
    total_precip = 0.0
    max_precip = 0.0
    will_rain = False

    for item in hourly_raw:
        dt = _forecast_datetime(item.get("datetime"))
        if dt is None or dt.astimezone(tz).date() != today:
            continue
        local = dt.astimezone(tz)
        precip = item.get("precipitation")
        try:
            precip_f = float(precip) if precip is not None else 0.0
        except (TypeError, ValueError):
            precip_f = 0.0
        condition = item.get("condition")
        rainy = _is_rainy_period(condition, precip)
        will_rain = will_rain or rainy
        total_precip += precip_f
        max_precip = max(max_precip, precip_f)
        periods.append(
            {
                "datetime": local.isoformat(),
                "time_local": local.strftime("%H:%M"),
                "condition": condition,
                "temperature": item.get("temperature"),
                "precipitation": precip,
                "will_rain": rainy,
            }
        )

    return {
        "date": today.isoformat(),
        "timezone": tz.key,
        "will_rain": will_rain,
        "total_precipitation": round(total_precip, 4),
        "max_hourly_precipitation": round(max_precip, 4),
        "periods": periods,
    }


async def get_weather() -> Optional[dict[str, Any]]:
    async with _client() as client:
        try:
            resp = await client.get(
                f"{HA_BASE_URL}/api/states",
                headers=_headers(),
            )
            resp.raise_for_status()
            states = resp.json()
        except Exception:
            return None

        weather = next(
            (s for s in states if str(s.get("entity_id", "")).startswith("weather.")),
            None,
        )
        if not weather:
            return None

        entity_id = str(weather.get("entity_id") or "")
        attrs = weather.get("attributes") or {}
        hourly_raw = await _fetch_ha_forecast(client, entity_id, "hourly")
        daily_raw = await _fetch_ha_forecast(client, entity_id, "daily")
        legacy_forecast = attrs.get("forecast") or []
        daily_forecast = _normalize_daily_forecast(daily_raw or legacy_forecast)

        return {
            "entity_id": entity_id,
            "state": weather.get("state"),
            "temperature": attrs.get("temperature"),
            "temperature_unit": attrs.get("temperature_unit") or "°F",
            "humidity": attrs.get("humidity"),
            "wind_speed": attrs.get("wind_speed"),
            "precipitation_unit": attrs.get("precipitation_unit"),
            "friendly_name": attrs.get("friendly_name") or "Weather",
            "forecast": daily_forecast[:7],
            "today": _build_today_forecast(hourly_raw, DISPLAY_TZ),
        }
