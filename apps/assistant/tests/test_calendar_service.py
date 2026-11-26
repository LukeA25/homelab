from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import caldav
import pytest

from app import calendar_service, dispatch


@pytest.mark.asyncio
async def test_live_search_and_creation_use_private_engine(monkeypatch):
    monkeypatch.setenv("ICLOUD_CALDAV_USERNAME", "test")
    monkeypatch.setenv("ICLOUD_CALDAV_APP_PASSWORD", "test")
    monkeypatch.setattr(calendar_service.calendar_events, "fetch",
                        lambda *args, **kwargs: {"events": [{"title": kwargs["title"]}]})
    client = MagicMock()
    selected = MagicMock()
    selected.name = "Spiritual"
    selected.url = "https://caldav.icloud.com/testing/"
    client.__enter__.return_value.principal.return_value.calendars.return_value = [selected]
    monkeypatch.setattr(caldav, "DAVClient", lambda **kwargs: client)
    async with calendar_service.serve():
        result = await calendar_service.search_events(
            {"title": "Retreat", "start_date": "2099-01-01", "through_date": "2099-02-01"}, None)
        assert result["events"] == [{"title": "Retreat"}]
        args = {"calendar": "unmatched", "title": "Retreat", "start": "2099-01-01", "end": "2099-01-02"}
        with pytest.raises(RuntimeError, match="approval"):
            await calendar_service.create_event(args, SimpleNamespace(approval_id=None))
        approved = SimpleNamespace(approval_id="test")
        assert (await calendar_service.create_event(args, approved))["status"] == "calendar_required"
        selected.add_event.assert_not_called()
        args["calendar"] = "spiritual"
        result = await calendar_service.create_event(args, approved)
        assert result["status"] == "created" and result["calendar"] == "Spiritual"
        assert selected.add_event.call_args.kwargs["dtstart"] == date(2099, 1, 1)
        assert selected.add_event.call_args.kwargs["no_overwrite"] is True


def test_calendar_writes_require_approval():
    assert dispatch.registry.get("calendar_create").policy == "approval"
