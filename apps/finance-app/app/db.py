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


# Columns added to existing tables after their first release, as
# (table, column, type). create_all() creates missing tables but never alters
# existing ones, so these are applied by hand on startup.
ADDED_COLUMNS = [
    ("transaction", "repayment_for_id", "VARCHAR"),
]


def init_db():
    from . import models

    SQLModel.metadata.create_all(engine)
    _add_missing_columns()


def _add_missing_columns():
    with engine.begin() as conn:
        for table, column, column_type in ADDED_COLUMNS:
            info = conn.exec_driver_sql(f'PRAGMA table_info("{table}")').fetchall()
            if not info:
                continue  # create_all just made it, so the column is already there
            if column in {row[1] for row in info}:
                continue
            conn.exec_driver_sql(
                f'ALTER TABLE "{table}" ADD COLUMN {column} {column_type}'
            )


def get_session() -> Session:
    return Session(engine)
