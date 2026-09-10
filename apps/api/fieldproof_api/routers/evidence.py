"""Evidence blob access (PRD 34 - authenticated endpoints, never public URLs)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response

from ..deps import get_object_store

router = APIRouter(prefix="/api/evidence", tags=["evidence"])


@router.get("/blob/{key:path}")
def get_blob(key: str):
    store = get_object_store()
    try:
        data = store.get(key)
    except (FileNotFoundError, ValueError):
        raise HTTPException(404, "artifact not found") from None
    return Response(content=data, media_type="application/octet-stream")
