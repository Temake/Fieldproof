"""Narrow tools exposed to agents (PRD 24).

Agents get these functions and nothing else - no storage handle, no HTTP
client, no filesystem. Each one validates, authorizes, executes, emits an event
and returns a structured result.
"""

from .base import ToolResult, fieldproof_tool
from .decisions import create_conflict, request_human_decision, resolve_decision, sync_conflicts
from .evidence import (
    get_evidence,
    request_technician_evidence,
    save_claims,
    save_observations,
    supersede_evidence,
    upload_evidence,
)
from .jobs import close_job, get_job_context, set_job_status
from .reports import generate_closeout_report, generate_evidence_receipt, prepare_invoice

__all__ = [
    "ToolResult",
    "close_job",
    "create_conflict",
    "fieldproof_tool",
    "generate_closeout_report",
    "generate_evidence_receipt",
    "get_evidence",
    "get_job_context",
    "prepare_invoice",
    "request_human_decision",
    "request_technician_evidence",
    "resolve_decision",
    "save_claims",
    "save_observations",
    "set_job_status",
    "supersede_evidence",
    "sync_conflicts",
    "upload_evidence",
]
