"""FieldProof API (PRD 15.1, 23).

Thin layer. It accepts work-order data and evidence, publishes events, and
reads state back for the UI. It never runs the workflow inline - the event bus
does, which is what keeps the technician's Complete Job click instant and the
autonomy real rather than request-scoped.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agents.orchestrator import register
from infra.settings import get_settings

from .routers import decisions, evidence, jobs, ops

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    register()
    logging.getLogger("fieldproof").info(
        "FieldProof API up in %s mode (stub_agents=%s)",
        get_settings().mode,
        get_settings().stub_agents,
    )
    yield


app = FastAPI(
    title="FieldProof",
    description="Autonomous job closeout agent for field-service teams",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs.router)
app.include_router(decisions.router)
app.include_router(evidence.router)
app.include_router(ops.router)


@app.get("/health")
def health():
    return {"status": "ok", "mode": get_settings().mode}
