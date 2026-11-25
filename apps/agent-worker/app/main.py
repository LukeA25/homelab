"""agent-worker: the Cursor coding agent, callable only by the Nova gateway."""

from __future__ import annotations

import hmac
import os
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from . import jobs

app = FastAPI(title="agent-worker")
_TOKEN = os.getenv("WORKER_TOKEN", "")


def _auth(authorization: str | None = Header(default=None)) -> None:
    supplied = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
    if not _TOKEN or not hmac.compare_digest(supplied, _TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")


class JobIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    kind: Literal["change", "query"] = "change"
    id: str | None = Field(default=None, max_length=64)


class QueryIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    timeout_s: float = Field(default=40, ge=1, le=120)


@app.on_event("startup")
def _startup() -> None:
    jobs.load()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "cursor_configured": bool(os.getenv("CURSOR_API_KEY", "").strip())}


@app.post("/jobs", dependencies=[Depends(_auth)])
def create_job(body: JobIn) -> dict:
    return jobs.submit(body.prompt, body.kind, body.id)


@app.post("/query", dependencies=[Depends(_auth)])
def query(body: QueryIn) -> dict:
    """Synchronous read-only question with a bounded wait; the job keeps running if it times out."""
    job = jobs.submit(body.prompt, "query")
    done = jobs.wait(job["id"], body.timeout_s) or job
    if done["status"] in ("queued", "running"):
        return {**done, "status": "timeout", "note": "Still working; check the job later."}
    return done


@app.get("/jobs", dependencies=[Depends(_auth)])
def list_jobs(limit: int = 20) -> dict:
    return {"jobs": jobs.recent(max(1, min(limit, 100)))}


@app.get("/jobs/{job_id}", dependencies=[Depends(_auth)])
def get_job(job_id: str) -> dict:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
