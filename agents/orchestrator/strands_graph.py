"""Strands multi-agent graph for the FieldProof workflow (PRD 15.1, 17, 30).

One workflow, two runtimes. `graph.py` sequences the steps in-process; this
module hands the same steps to a Strands `Graph` so the workflow can run on
Bedrock AgentCore with the runtime's tracing, session management and node
timeouts around it. Select it with `FIELDPROOF_ORCHESTRATOR=strands`.

    LOAD_CONTEXT -> PARSE_EVIDENCE -> RECONCILE -> POLICY_CHECK
                                                     |- needs_evidence -> REQUEST_EVIDENCE
                                                     |- needs_human ----> HUMAN_DECISION
                                                     `- is_clean -------> ACTION

Both runtimes call the same step functions and read the same `Branch`, so the
Strands path cannot drift into different behaviour - the invariant suite runs
against it directly (tests/test_strands_graph.py).

Why the nodes are deterministic
-------------------------------
A Strands graph node may be an `Agent` or any `MultiAgentBase`. FieldProof uses
custom `MultiAgentBase` nodes because PRD 18 puts every *decision* in code:
claim construction, evidence compatibility, reconciliation, policy verdicts and
authorization are deterministic, and a model may not vote on them. The model
work sits inside the nodes where judgement is actually required - reading a
photo or a receipt in PARSE_EVIDENCE, wording a supervisor's question in
HUMAN_DECISION - and each of those is a real Strands agent on Bedrock when
`FIELDPROOF_STUB_AGENTS=0`. The result is the hybrid graph the Strands docs
describe: model nodes for judgement, deterministic nodes for control.

The REQUEST_EVIDENCE and HUMAN_DECISION waits are terminal here, deliberately.
A pause that can last hours must not hold a runtime session open: the graph
exits, and the resuming event starts a new run (PRD FR-12).
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from typing import Any

from agents.action.agent import SYSTEM_PROMPT as ACTION_PROMPT
from agents.context.agent import SYSTEM_PROMPT as CONTEXT_PROMPT
from agents.evidence.agent import SYSTEM_PROMPT as EVIDENCE_PROMPT
from agents.policy.agent import SYSTEM_PROMPT as POLICY_PROMPT
from agents.reconciliation.agent import SYSTEM_PROMPT as RECONCILE_PROMPT

from .graph import (
    Branch,
    Node,
    RunResult,
    _step,
    step_action,
    step_clarify,
    step_human_decision,
    step_load_context,
    step_parse_evidence,
    step_policy_check,
    step_reconcile,
    step_request_evidence,
)

log = logging.getLogger("fieldproof.strands")

#: Guard against runaway loops when evidence keeps arriving (PRD 17 cycle).
MAX_NODE_EXECUTIONS = 24
EXECUTION_TIMEOUT_SECONDS = 300
NODE_TIMEOUT_SECONDS = 120

#: Each node's remit, in the words the model sees when that node consults one.
NODE_PROMPTS: dict[str, str] = {
    Node.LOAD_CONTEXT.value: CONTEXT_PROMPT,
    Node.PARSE_EVIDENCE.value: EVIDENCE_PROMPT,
    Node.RECONCILE.value: RECONCILE_PROMPT,
    Node.POLICY_CHECK.value: POLICY_PROMPT,
    Node.ACTION.value: ACTION_PROMPT,
}

_NODE_CLASS: type | None = None


def _node_class() -> type:
    """The `MultiAgentBase` subclass used for every node.

    Built on first use so the deterministic core still imports without the
    `agents` extra installed.
    """
    global _NODE_CLASS
    if _NODE_CLASS is not None:
        return _NODE_CLASS

    from strands.agent.agent_result import AgentResult
    from strands.multiagent.base import MultiAgentBase, MultiAgentResult, NodeResult, Status
    from strands.telemetry.metrics import EventLoopMetrics
    from strands.types.content import Message

    class FieldProofNode(MultiAgentBase):
        """A Strands custom node that runs one FieldProof workflow step.

        The step is a plain callable over the job store. Its return value is
        kept on `payload` so the conditional edges can read the deterministic
        verdict the step produced.
        """

        def __init__(self, node_id: str, run: Callable[[], Any]) -> None:
            super().__init__()
            self.id = node_id
            self.name = node_id
            self.prompt = NODE_PROMPTS.get(node_id, "")
            self._run = run
            self.payload: Any = None
            self.ran = False

        async def invoke_async(
            self,
            task: Any = None,
            invocation_state: dict[str, Any] | None = None,
            **kwargs: Any,
        ) -> Any:
            started = time.perf_counter()
            # Exceptions propagate: run_workflow already records a failed run,
            # marks the job FAILED and lets the next event retry it (PRD 36).
            self.payload = self._run()
            self.ran = True
            elapsed = round((time.perf_counter() - started) * 1000)
            log.info("node %s -> %s (%sms)", self.id, _describe(self.payload), elapsed)
            agent_result = AgentResult(
                stop_reason="end_turn",
                message=Message(role="assistant", content=[{"text": _describe(self.payload)}]),
                metrics=EventLoopMetrics(),
                state={},
            )
            return MultiAgentResult(
                status=Status.COMPLETED,
                results={
                    self.id: NodeResult(
                        result=agent_result, status=Status.COMPLETED, execution_time=elapsed
                    )
                },
                execution_count=1,
                execution_time=elapsed,
            )

    _NODE_CLASS = FieldProofNode
    return _NODE_CLASS


def _describe(payload: Any) -> str:
    if isinstance(payload, Branch):
        return (
            f"recoverable={len(payload.recoverable)} escalations={len(payload.escalations)} "
            f"awaiting={len(payload.awaiting)} clean={payload.is_clean}"
        )
    return str(payload)


def build_graph(job_id: str, result: RunResult) -> tuple[Any, dict[str, Any]]:
    """Construct the graph for one run of one job.

    Built per run because the nodes close over this job's `RunResult`: the
    steps record technician requests, supervisor decisions and the outcome on
    it exactly as the in-process path does.
    """
    from strands.multiagent import GraphBuilder

    node_type = _node_class()
    nodes: dict[str, Any] = {}

    def branch() -> Branch | None:
        return nodes[Node.POLICY_CHECK.value].payload

    def load_context() -> dict[str, Any]:
        _step(result, Node.LOAD_CONTEXT, job_id)
        return step_load_context(job_id)

    def parse_evidence() -> dict[str, Any]:
        _step(result, Node.PARSE_EVIDENCE, job_id)
        return step_parse_evidence(job_id)

    def reconcile() -> dict[str, Any]:
        _step(result, Node.RECONCILE, job_id)
        return step_reconcile(job_id)

    def policy_check() -> Branch:
        _step(result, Node.POLICY_CHECK, job_id)
        return step_policy_check(job_id)

    def request_evidence() -> str:
        _step(result, Node.REQUEST_EVIDENCE, job_id)
        current = branch()
        # Missing evidence first, then a supervisor's clarification relay - the
        # same precedence the in-process orchestrator applies.
        if current.recoverable:
            result.outcome = step_request_evidence(job_id, current, result)
        else:
            result.outcome = step_clarify(job_id, current, result)
        return result.outcome

    def human_decision() -> str:
        _step(result, Node.HUMAN_DECISION, job_id)
        result.outcome = step_human_decision(job_id, branch(), result)
        return result.outcome

    def action() -> str:
        _step(result, Node.ACTION, job_id)
        result.outcome = step_action(job_id, result)
        if result.outcome == "CLOSED":
            _step(result, Node.DONE, job_id)
        return result.outcome

    steps: dict[str, Callable[[], Any]] = {
        Node.LOAD_CONTEXT.value: load_context,
        Node.PARSE_EVIDENCE.value: parse_evidence,
        Node.RECONCILE.value: reconcile,
        Node.POLICY_CHECK.value: policy_check,
        Node.REQUEST_EVIDENCE.value: request_evidence,
        Node.HUMAN_DECISION.value: human_decision,
        Node.ACTION.value: action,
    }
    for node_id, step in steps.items():
        nodes[node_id] = node_type(node_id, step)

    builder = GraphBuilder()
    for node_id, executor in nodes.items():
        builder.add_node(executor, node_id)

    builder.add_edge(Node.LOAD_CONTEXT.value, Node.PARSE_EVIDENCE.value)
    builder.add_edge(Node.PARSE_EVIDENCE.value, Node.RECONCILE.value)
    builder.add_edge(Node.RECONCILE.value, Node.POLICY_CHECK.value)
    builder.add_edge(
        Node.POLICY_CHECK.value,
        Node.REQUEST_EVIDENCE.value,
        condition=lambda state: needs_evidence(branch()),
    )
    builder.add_edge(
        Node.POLICY_CHECK.value,
        Node.HUMAN_DECISION.value,
        condition=lambda state: needs_human(branch()),
    )
    builder.add_edge(
        Node.POLICY_CHECK.value,
        Node.ACTION.value,
        condition=lambda state: is_clean(branch()),
    )

    builder.set_entry_point(Node.LOAD_CONTEXT.value)
    builder.set_max_node_executions(MAX_NODE_EXECUTIONS)
    builder.set_execution_timeout(EXECUTION_TIMEOUT_SECONDS)
    builder.set_node_timeout(NODE_TIMEOUT_SECONDS)
    builder.reset_on_revisit(True)
    return builder.build(), nodes


# -- Edge conditions --------------------------------------------------------
#
# Exactly one is true for any branch, and each reads the deterministic verdict
# the domain layer produced. A model never decides which edge is taken.


def needs_evidence(branch: Branch | None) -> bool:
    """Something is missing, or the supervisor asked the technician a question."""
    if branch is None:
        return False
    return bool(branch.recoverable or (not branch.escalations and branch.awaiting))


def needs_human(branch: Branch | None) -> bool:
    """A genuine decision only a supervisor may make (PRD 12)."""
    if branch is None:
        return False
    return bool(not branch.recoverable and branch.escalations)


def is_clean(branch: Branch | None) -> bool:
    """Proceed to ACTION only when the domain layer says nothing is outstanding."""
    return bool(branch is not None and branch.is_clean)


def execute(job_id: str, result: RunResult) -> None:
    """Run one pass of the workflow through the Strands graph.

    Signature-compatible with `graph._execute`, so `run_workflow` keeps the run
    lock, the coalescing re-run, the idempotency keys and the run summary event
    whichever runtime executed the steps.
    """
    from strands.multiagent.base import Status

    graph, _nodes = build_graph(job_id, result)
    outcome = graph(job_id)
    if outcome.status != Status.COMPLETED:
        failed = sorted(getattr(outcome, "failed_nodes", None) or [])
        raise RuntimeError(f"strands graph {outcome.status} for {job_id} (failed: {failed})")
    if not result.outcome:
        # Every terminal node sets an outcome; reaching here means POLICY_CHECK
        # matched no edge, which is a topology bug rather than a job state.
        raise RuntimeError(f"strands graph reached no terminal node for {job_id}")
    log.info(
        "graph %s -> %s in %sms", job_id, result.outcome, getattr(outcome, "execution_time", 0)
    )
