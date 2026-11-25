import pytest

from app import devices
from app.auth import authenticate
from app.config import DEFAULT_LEGACY_TOKEN, settings


def test_enroll_verify_revoke():
    device, token = devices.enroll("ipad", ["nova.voice", "theology.*"])
    assert token.startswith("nova_ipad_")
    found = devices.verify(token)
    assert found and found.id == "ipad"
    assert found.allows("theology.read") and not found.allows("finance.read")

    assert devices.revoke("ipad")
    assert devices.verify(token) is None


def test_wrong_secret_and_unknown_device_fail():
    _, token = devices.enroll("phone", ["*"])
    assert devices.verify(token[:-2] + "xx") is None
    assert devices.verify("nova_ghost_abc") is None
    assert devices.verify("") is None


def test_one_device_token_cannot_authenticate_as_another():
    _, ipad_token = devices.enroll("ipad", ["theology.*"])
    devices.enroll("phone", ["*"])
    forged = "nova_phone_" + ipad_token.split("_", 2)[2]
    assert devices.verify(forged) is None


def test_legacy_import_is_one_time_and_revocable():
    assert devices.import_legacy("old-shared-secret", ["*"])
    assert devices.verify("old-shared-secret").id == devices.LEGACY_ID
    assert devices.revoke(devices.LEGACY_ID)
    assert not devices.import_legacy("old-shared-secret", ["*"])
    assert devices.verify("old-shared-secret") is None


def test_default_legacy_token_refused_without_flag(monkeypatch):
    devices.import_legacy(DEFAULT_LEGACY_TOKEN, ["*"])
    assert authenticate(DEFAULT_LEGACY_TOKEN) is None
    monkeypatch.setenv("ALLOW_DEFAULT_LEGACY_TOKEN", "true")
    settings.cache_clear()
    assert authenticate(DEFAULT_LEGACY_TOKEN).id == devices.LEGACY_ID


def test_invalid_ids_rejected():
    with pytest.raises(ValueError):
        devices.enroll("Bad_ID", ["*"])
    with pytest.raises(ValueError):
        devices.enroll(devices.LEGACY_ID, ["*"])
    with pytest.raises(ValueError):
        devices.enroll("empty", [])
