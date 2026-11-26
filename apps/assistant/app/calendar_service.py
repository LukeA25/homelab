"""Private gateway-to-engine RPC for iCloud operations."""

import asyncio
from contextlib import asynccontextmanager, suppress
from datetime import date, datetime, timedelta, timezone
import json
import logging
import os
import socket
from uuid import NAMESPACE_URL, uuid5
from zoneinfo import ZoneInfo

from . import calendar_events, store
from .config import settings

SOCKET_PATH = "calendar/engine.sock"
TIMEOUT = 60
LOG = logging.getLogger("nova.calendar")


def search(args, username, password):
    title = args["title"].strip()
    if not title or len(title) > 200:
        raise ValueError("Provide an event title or a distinctive part of its title.")
    now = datetime.now(ZoneInfo(settings()["display_tz"]))
    first = date.fromisoformat(args["start_date"]) if args.get("start_date") else now.date()
    last = (date.fromisoformat(args["through_date"]) + timedelta(days=1)
            if args.get("through_date") else first + timedelta(days=90))
    if not 0 < (last - first).days <= 366:
        raise ValueError("Use a search window of 1 to 366 days.")
    data = calendar_events.fetch(username, password, now, first=first, last=last, title=title)
    events = data["events"]
    return {"status": "ok", "from": first.isoformat(), "through": (last - timedelta(days=1)).isoformat(),
            "events": events[:30], "truncated": len(events) > 30}


def event_bounds(args):
    start, end = args["start"], args["end"]
    if len(start) == len(end) == 10:
        begins, finishes = date.fromisoformat(start), date.fromisoformat(end)
    else:
        begins, finishes = datetime.fromisoformat(start), datetime.fromisoformat(end)
        if begins.utcoffset() is None or finishes.utcoffset() is None:
            raise ValueError("Timed events need timezone offsets on both times.")
        begins, finishes = begins.astimezone(timezone.utc), finishes.astimezone(timezone.utc)
    if finishes <= begins:
        raise ValueError("The event end must be later than its start.")
    return begins, finishes


def calendars_or_create(operation, args, username, password):
    from caldav import DAVClient
    from caldav.lib.error import ConsistencyError

    with DAVClient(url=calendar_events.ICLOUD_URL, username=username, password=password, timeout=12) as client:
        calendars = client.principal().calendars()
        names = sorted(str(cal.name) for cal in calendars if cal.name)
        if operation == "list":
            return {"status": "ok", "calendars": names}
        target = args["calendar"].strip()
        matches = [cal for cal in calendars if str(cal.name or "").casefold() == target.casefold()]
        if not target or len(matches) != 1:
            return {"status": "calendar_required", "ok": False, "calendars": names,
                    "error": "Choose one unambiguous calendar by its exact name."}
        title = args["title"].strip()
        if not title or len(title) > 300:
            raise ValueError("Provide an event title of 1 to 300 characters.")
        begins, finishes = event_bounds(args)
        calendar = matches[0]
        identity = json.dumps([str(calendar.url), title, begins.isoformat(), finishes.isoformat()])
        uid = str(uuid5(NAMESPACE_URL, identity))
        try:
            calendar.add_event(uid=uid, summary=title, dtstart=begins, dtend=finishes, no_overwrite=True)
        except ConsistencyError:
            return {"status": "conflict", "ok": False,
                    "error": "An event with this identity already exists or iCloud rejected the create. Search before retrying."}
        return {"status": "created", "calendar": str(calendar.name), "title": title,
                "start": begins.isoformat(), "end": finishes.isoformat()}


@asynccontextmanager
async def serve():
    username = os.getenv("ICLOUD_CALDAV_USERNAME")
    password = os.getenv("ICLOUD_CALDAV_APP_PASSWORD")
    if not username or not password:
        yield
        return
    logging.getLogger("caldav").setLevel(logging.CRITICAL + 1)
    lock = asyncio.Lock()

    async def handle(reader, writer):
        operation = None
        try:
            request = json.loads(await asyncio.wait_for(reader.readline(), 5))
            operation, args = request["operation"], request["args"]
            if operation not in {"search", "list", "create"}:
                raise ValueError("Unknown calendar operation.")
            if lock.locked():
                result = {"status": "busy", "ok": False, "error": "Another calendar request is running."}
            else:
                async with lock:
                    if operation == "search":
                        result = await asyncio.to_thread(search, args, username, password)
                    else:
                        result = await asyncio.to_thread(calendars_or_create, operation, args, username, password)
        except ValueError:
            # Validation errors may also originate in the CalDAV library.
            result = {"status": "invalid_request", "ok": False,
                      "error": "Check the calendar name, date range, or start and end times."}
        except Exception as exc:
            LOG.warning("Calendar request failed (%s)", type(exc).__name__)
            result = {"status": "unknown" if operation == "create" else "unavailable", "ok": False}
        try:
            writer.write(json.dumps(result).encode() + b"\n")
            await writer.drain()
        except ConnectionError:
            pass
        finally:
            writer.close()

    path = store.path(SOCKET_PATH)
    if path.is_socket():
        path.unlink()
    with socket.socket(socket.AF_UNIX) as sock:
        sock.bind(str(path))
        path.chmod(0o600)
        sock.listen()
        server = await asyncio.start_unix_server(handle, sock=sock)
        try:
            async with server:
                yield
        finally:
            path.unlink(missing_ok=True)


async def _call(operation, args):
    writer = None
    try:
        async with asyncio.timeout(TIMEOUT):
            reader, writer = await asyncio.open_unix_connection(str(store.data_dir() / SOCKET_PATH), limit=256 * 1024)
            writer.write(json.dumps({"operation": operation, "args": args}).encode() + b"\n")
            await writer.drain()
            return json.loads(await reader.readline())
    except (OSError, TimeoutError, ValueError):
        return {"status": "unknown" if operation == "create" and writer else "unavailable", "ok": False}
    finally:
        if writer:
            writer.close()
            with suppress(OSError):
                await writer.wait_closed()


async def search_events(args, ctx):
    return await _call("search", args)


async def list_calendars(args, ctx):
    return await _call("list", args)


async def create_event(args, ctx):
    if not ctx.approval_id:
        raise RuntimeError("Calendar creation requires the user’s approval.")
    return await _call("create", args)
