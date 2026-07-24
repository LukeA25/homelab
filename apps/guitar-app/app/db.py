"""SQLite engine + session helpers.

The database lives on the mounted `/data` volume so it survives container
restarts (see compose/guitar-app/docker-compose.yaml). Override with the
DATABASE_PATH env var for local development.
"""

import os

from sqlmodel import Session, SQLModel, create_engine

DATABASE_PATH = os.getenv("DATABASE_PATH", "/data/guitar.db")

_dirname = os.path.dirname(DATABASE_PATH)
if _dirname:
    os.makedirs(_dirname, exist_ok=True)

engine = create_engine(
    f"sqlite:///{DATABASE_PATH}",
    connect_args={"check_same_thread": False},
)


def init_db():
    from . import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _migrate_sqlite()


def _migrate_sqlite():
    """Add columns introduced after the first create_all (SQLite has no ALTER via SQLModel)."""
    statements = [
        "ALTER TABLE song ADD COLUMN artwork_url VARCHAR",
        "ALTER TABLE song ADD COLUMN apple_music_id VARCHAR",
    ]
    with engine.begin() as conn:
        for sql in statements:
            try:
                conn.exec_driver_sql(sql)
            except Exception:
                # Column already exists
                pass


def get_session() -> Session:
    return Session(engine)
