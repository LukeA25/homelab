"""SQLite engine + session helpers.

The database lives on the mounted `/data` volume so it survives container
restarts (see compose/finance-app/docker-compose.yaml). Override with the
DATABASE_PATH env var for local development.
"""

import os

from sqlmodel import SQLModel, Session, create_engine

DATABASE_PATH = os.getenv("DATABASE_PATH", "/data/finance.db")

_dirname = os.path.dirname(DATABASE_PATH)
if _dirname:
    os.makedirs(_dirname, exist_ok=True)

engine = create_engine(
    f"sqlite:///{DATABASE_PATH}",
    connect_args={"check_same_thread": False},
)


def init_db():
    from . import models

    SQLModel.metadata.create_all(engine)


def get_session() -> Session:
    return Session(engine)
