"""API security for the MVP (PRD 34).

- Optional shared API key: set FIELDPROOF_API_KEY and every /api route
  requires `Authorization: Bearer <key>`. Deliberately simple - PRD 41 rules out
  complicated permissions for the hackathon.
- Signed upload URLs: an upload URL is a short-lived HMAC-signed grant for one
  object key under one job. In AWS mode S3 presigning does this; in local mode
  the API verifies its own tokens.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

from fastapi import Header, HTTPException, status

from infra.settings import get_settings


def require_api_key(authorization: str | None = Header(default=None)) -> None:
    expected = get_settings().api_key
    if not expected:
        return
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(token.strip(), expected):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "missing or invalid API key",
            headers={"WWW-Authenticate": "Bearer"},
        )


@dataclass(frozen=True)
class UploadGrant:
    job_id: str
    key: str
    content_type: str | None
    expires_at: int


def sign_upload(grant: UploadGrant) -> str:
    payload = json.dumps(grant.__dict__, sort_keys=True, separators=(",", ":")).encode()
    body = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    return f"{body}.{_mac(body)}"


def verify_upload(token: str) -> UploadGrant:
    body, _, mac = token.partition(".")
    if not body or not hmac.compare_digest(mac, _mac(body)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "invalid upload signature")
    padded = body + "=" * (-len(body) % 4)
    grant = UploadGrant(**json.loads(base64.urlsafe_b64decode(padded)))
    if grant.expires_at < time.time():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "upload URL has expired")
    return grant


def _mac(body: str) -> str:
    secret = get_settings().signing_secret.encode()
    return hmac.new(secret, body.encode(), hashlib.sha256).hexdigest()
