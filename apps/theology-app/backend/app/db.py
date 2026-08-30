"""SQLite engine, schema creation, and the FTS5 search index.

The database lives on the mounted /data volume so it survives container
restarts. Override with DATABASE_PATH for local development.
"""

from __future__ import annotations

from sqlmodel import Session, SQLModel, create_engine, text

from .config import DATABASE_PATH

DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{DATABASE_PATH}",
    connect_args={"check_same_thread": False},
)

# Standalone FTS5 table rather than an external-content one: blocks are only
# written during import, so we resync per work instead of maintaining triggers.
FTS_SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
    text,
    block_pk UNINDEXED,
    work_id UNINDEXED,
    tokenize = 'porter unicode61'
)
"""


def init_db() -> None:
    from . import models  # noqa: F401  (registers tables)

    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA journal_mode=WAL")
        conn.exec_driver_sql(FTS_SCHEMA)
        _patch_bookmark_columns(conn)


def _patch_bookmark_columns(conn) -> None:
    """Add bookmark scope/section_id columns on existing DBs."""
    rows = conn.exec_driver_sql("PRAGMA table_info(bookmark)").fetchall()
    names = {r[1] for r in rows}
    if "scope" not in names:
        conn.exec_driver_sql("ALTER TABLE bookmark ADD COLUMN scope TEXT DEFAULT ''")
    if "section_id" not in names:
        conn.exec_driver_sql("ALTER TABLE bookmark ADD COLUMN section_id TEXT DEFAULT ''")


def get_session() -> Session:
    return Session(engine)


def session_dependency():
    with Session(engine) as session:
        yield session


def reindex_work(session: Session, work_id: str) -> int:
    """Rebuild the FTS rows for one work. Returns the number of rows indexed."""
    session.execute(text("DELETE FROM blocks_fts WHERE work_id = :w"), {"w": work_id})
    result = session.execute(
        text(
            """
            INSERT INTO blocks_fts (text, block_pk, work_id)
            SELECT text, pk, work_id FROM block
            WHERE work_id = :w AND text != '' AND kind != 'heading'
            """
        ),
        {"w": work_id},
    )
    session.commit()
    return result.rowcount or 0
