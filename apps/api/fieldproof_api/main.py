"""FieldProof API (PRD 15.1, 23).

Thin layer. It accepts work-order data and evidence, publishes events, and
reads state back for the UI. It never runs the workflow inline - the event bus
does, which is what keeps the technician's Complete Job click instant and the
autonomy real rather than request-scoped.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agents.orchestrator import register
from infra.settings import get_settings

from .routers import decisions, evidence, jobs, ops
from .security import require_api_key

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Local mode runs the workflow on the in-process bus. On AWS the
    # EventBridge rule is the subscription (see infra/aws/template.yaml).
    if get_settings().is_local:
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
    allow_origins=list(get_settings().cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# PRD 34 - server-side authorization on every API route. The signed upload
# route is the one exception: its token is its credential.
secured = [Depends(require_api_key)]
app.include_router(jobs.router, dependencies=secured)
app.include_router(decisions.router, dependencies=secured)
app.include_router(evidence.router, dependencies=secured)
app.include_router(ops.router, dependencies=secured)
app.include_router(evidence.uploads_router)


@app.get("/health")
def health():
    return {"status": "ok", "mode": get_settings().mode}
