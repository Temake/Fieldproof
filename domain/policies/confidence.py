"""Confidence banding (PRD 26)."""

from __future__ import annotations

from ..enums import ConfidenceBand

HIGH_THRESHOLD = 0.90
MEDIUM_THRESHOLD = 0.70

#: Below this, a critical requirement may never auto-verify.
AUTO_VERIFY_FLOOR = MEDIUM_THRESHOLD


def band(confidence: float) -> ConfidenceBand:
    if confidence >= HIGH_THRESHOLD:
        return ConfidenceBand.HIGH
    if confidence >= MEDIUM_THRESHOLD:
        return ConfidenceBand.MEDIUM
    return ConfidenceBand.LOW


def may_auto_verify(confidence: float, *, critical: bool = True) -> bool:
    """Critical requirements need at least MEDIUM confidence to auto-verify."""
    if not critical:
        return confidence > 0.0
    return confidence >= AUTO_VERIFY_FLOOR
