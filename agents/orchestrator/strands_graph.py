"""Strands graph wiring for the AgentCore deployment path (PRD 15.1, 17, 30).

graph.py is the deterministic orchestrator that runs the workflow today. This
module expresses the same node topology as a Strands multi-agent graph for
deployment on Bedrock AgentCore, where the runtime supplies tracing, retries
and the managed session.

The topology must stay identical to Node in graph.py. The branch conditions
read the *deterministic* verdicts written by the domain layer - a model never
decides which edge is taken.
"""

from __future__ import annotations

from typing import Any

from agents.context.agent import SYSTEM_PROMPT as CONTEXT_PROMPT
from agents.evidence.agent import SYSTEM_PROMPT as EVIDENCE_PROMPT
from agents.policy.agent import SYSTEM_PROMPT as POLICY_PROMPT
from agents.reconciliation.agent import SYSTEM_PROMPT as RECONCILE_PROMPT
from agents.action.agent import SYSTEM_PROMPT as ACTION_PROMPT
from agents.runtime import build_agent

#: Guard against runaway loops when evidence keeps arriving (PRD 17 cycle).
MAX_NODE_EXECUTIONS = 24
EXECUTION_TIMEOUT_SECONDS = 300


def build_graph() -> Any:
    """Construct the FieldProof agent graph.

    TODO: finish wiring once the Bedrock path is enabled. The intended shape:

        builder = GraphBuilder()
        builder.add_node(context_agent, "LOAD_CONTEXT")
        builder.add_node(evidence_agent, "PARSE_EVIDENCE")
        builder.add_node(reconciliation_agent, "RECONCILE")
        builder.add_node(policy_agent, "POLICY_CHECK")
        builder.add_node(action_agent, "ACTION")

        builder.add_edge("LOAD_CONTEXT", "PARSE_EVIDENCE")
        builder.add_edge("PARSE_EVIDENCE", "RECONCILE")
        builder.add_edge("RECONCILE", "POLICY_CHECK")
        builder.add_edge("POLICY_CHECK", "ACTION", condition=is_clean)
        builder.add_edge("POLICY_CHECK", "PARSE_EVIDENCE", condition=evidence_arrived)

        builder.set_entry_point("LOAD_CONTEXT")
        builder.set_max_node_executions(MAX_NODE_EXECUTIONS)
        builder.set_execution_timeout(EXECUTION_TIMEOUT_SECONDS)
        builder.reset_on_revisit(True)
        return builder.build()

    The REQUEST_EVIDENCE and HUMAN_DECISION waits are deliberately NOT nodes in
    this graph. A pause that can last minutes or hours must not hold a runtime
    session open: the graph exits, and the resuming event starts a new run
    (PRD FR-12).
    """
    from strands.multiagent import GraphBuilder

    builder = GraphBuilder()
    builder.add_node(build_agent("context", CONTEXT_PROMPT), "LOAD_CONTEXT")
    builder.add_node(build_agent("evidence", EVIDENCE_PROMPT), "PARSE_EVIDENCE")
    builder.add_node(build_agent("reconciliation", RECONCILE_PROMPT), "RECONCILE")
    builder.add_node(build_agent("policy", POLICY_PROMPT), "POLICY_CHECK")
    builder.add_node(build_agent("action", ACTION_PROMPT), "ACTION")

    builder.add_edge("LOAD_CONTEXT", "PARSE_EVIDENCE")
    builder.add_edge("PARSE_EVIDENCE", "RECONCILE")
    builder.add_edge("RECONCILE", "POLICY_CHECK")
    builder.add_edge("POLICY_CHECK", "ACTION", condition=is_clean)

    builder.set_entry_point("LOAD_CONTEXT")
    builder.set_max_node_executions(MAX_NODE_EXECUTIONS)
    builder.set_execution_timeout(EXECUTION_TIMEOUT_SECONDS)
    builder.reset_on_revisit(True)
    return builder.build()


def is_clean(state: Any) -> bool:
    """Proceed to ACTION only when the domain layer says nothing is outstanding."""
    job_state = state.results.get("RECONCILE")
    if job_state is None:
        return False
    return bool(getattr(job_state, "all_required_verified", False))
