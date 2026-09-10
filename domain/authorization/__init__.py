"""Deterministic authorization boundary (PRD 18)."""

from .authorize import Authorization, NotAuthorized, authorize, require

__all__ = ["Authorization", "NotAuthorized", "authorize", "require"]
