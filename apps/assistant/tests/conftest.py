import pytest

from app import config


@pytest.fixture(autouse=True)
def nova_env(tmp_path, monkeypatch):
    monkeypatch.setenv("NOVA_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ASSISTANT_DEVICE_TOKEN", "")
    monkeypatch.setenv("ALLOW_DEFAULT_LEGACY_TOKEN", "")
    config.settings.cache_clear()
    yield tmp_path
    config.settings.cache_clear()
