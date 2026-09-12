# FieldProof

**The autonomous closeout agent for field-service teams.** A technician finishes a job,
uploads whatever evidence naturally comes out of the work, and walks away. FieldProof
reads the evidence, checks it against the work order, asks the technician for anything
missing, escalates only the decisions that need a human, and then closes the job with
a tamper-evident receipt.

Section references (§) point to the product requirements document, which is maintained
outside this repository.

> **Core invariant (§7).** No required claim may be VERIFIED without compatible
> supporting evidence or explicit human resolution. No job may be CLOSED while an
> unresolved blocking conflict exists.

## Quickstart

Requires Python 3.11+ and Node 20+.

```bash
pip install -e ".[dev]"      # backend + test tooling
python -m pytest -q          # 113 tests, including the ten core invariants (§32)
python -m demo.run_demo      # the §42 demo, headless, in the terminal
```

Run the API and seed the demo job (paused at the supervisor decision, §42 scene 6):

```bash
cp .env.example .env
uvicorn fieldproof_api.main:app --reload --port 8000 --env-file .env
python scripts/seed.py --reset          # or --all for every fixture
```

Interactive API docs are at <http://localhost:8000/docs>. The web client lives in
`apps/web` (`npm install && npm run dev`, port 3000): a landing page at `/`, the
operations console at `/dashboard`, and the technician view at `/field/<job id>`.
Copy `apps/web/.env.local.example` to `.env.local`; `FIELDPROOF_API_KEY` there is read
only by the web server, which adds it to API calls, so it never reaches the browser.

The `Makefile` wraps these (`make install / test / demo / api / seed / web`). It needs
GNU make, which Windows does not ship with - use WSL, Git Bash with make installed, or
run the commands above directly.

## How it works

```
 technician uploads ──► API ──► EVIDENCE_UPLOADED / JOB_COMPLETED event
                                          │
                                          ▼
                  ┌──────────── run_workflow(job_id) ─────────────┐
                  │ LOAD_CONTEXT   Context Agent       (reads)     │
                  │ PARSE_EVIDENCE Evidence Agent      (model)     │
                  │ RECONCILE      domain/reconciliation (pure)    │
                  │ POLICY_CHECK   domain/policies     (pure)      │
                  └───────┬────────────┬─────────────┬────────────┘
             missing /    │  conflict  │   clean     │  supervisor asked
             unreadable   ▼            ▼             ▼  for clarification
                 ask technician   ask supervisor   report → invoice →
                  (one message)   (one decision)   customer → close → receipt
                          │            │
                          └─ pause ────┴── the next event re-enters the workflow
```

**LLM proposes. Policy authorizes. Tool executes (§18).** Most agent demos let the
model decide. When the decision moves money, that is a bug, not a feature - so
FieldProof puts the model where judgement is actually needed and nowhere else.
Models are used for exactly two things: reading artifacts (photos, receipts, documents, voice notes) into
*observations*, and wording text a human will read. Everything that decides - claim
construction, evidence compatibility, reconciliation, policy verdicts, authorization,
state transitions - is deterministic code in `domain/`, and every side effect goes
through a tool in `tools/` that calls `authorize()` first.

Properties the workflow guarantees, each covered by tests:

- **Pauses are real stops.** Waiting for a technician or a supervisor ends the run;
  the next event starts a new one. Nothing sleeps, so resumption survives restarts (FR-12).
- **Safe to re-trigger.** A job that is not submitted yet, or is closed, is left alone.
  One run per job at a time (a lock), and an event that arrives mid-run is folded into
  exactly one follow-up run.
- **Idempotent side effects.** Every action carries an idempotency key. A refused action
  does not burn its key, and a failed action releases it, so a retry is never mistaken
  for a duplicate (§33, INV-005).
- **Stable conflicts.** A conflict's id is a fingerprint of what it is about, including
  the values involved. New evidence during a pending decision does not create a second
  question, and an approval for 3-against-2 does not carry over to 4-against-2 (INV-006).
- **Fail closed.** An artifact that cannot be read, or whose bytes no longer match the
  upload hash, counts as nothing. Reading it goes retry → alternate reader → ask a human
  for a clearer copy (§36).
- **Failed external actions don't un-verify.** If the invoice provider is down, the job
  stays VERIFIED with `invoice_action = FAILED`, and `POST /retry` finishes it (§36).
- **Tamper-evident receipt.** The receipt is sealed once at close with a SHA-256 over its
  canonical form; `GET /receipt/verify` recomputes it (§29).

## Agents and the Strands SDK (§15.1, §16)

Five agents (§16), built with the [Strands Agents SDK](https://strandsagents.com)
on Bedrock:

| Agent | Uses a model for | Decides |
| --- | --- | --- |
| Context | nothing - the work order is already structured | nothing |
| Evidence | reading photos, receipts, PDFs and voice notes into observations | nothing |
| Reconciliation | writing the supervisor's summary | nothing - `domain/reconciliation` compares |
| Policy | wording the one question a supervisor answers | nothing - `domain/policies` rules the verdict |
| Action | wording technician and customer messages | nothing - `domain/authorization` gates every tool |

**The graph.** `agents/orchestrator/strands_graph.py` is a real Strands `Graph`:
seven nodes, conditional edges, execution and node timeouts, and a cap on node
executions. Its nodes are custom `MultiAgentBase` nodes rather than agents,
because PRD 18 puts every decision in code - a model may read a photo, but it
may not vote on whether a requirement is met. The model work lives inside the
nodes that need judgement. That is the hybrid the Strands graph docs describe:
model nodes for judgement, deterministic nodes for control.

```
LOAD_CONTEXT -> PARSE_EVIDENCE -> RECONCILE -> POLICY_CHECK
                                                 |- needs_evidence -> REQUEST_EVIDENCE
                                                 |- needs_human ----> HUMAN_DECISION
                                                 `- is_clean -------> ACTION
```

Both orchestrators call the same step functions and read the same deterministic
`Branch`, so the choice is a deployment decision rather than a behavioural one.
`tests/test_strands_graph.py` runs the whole 17-fixture evaluation dataset
through the Strands path and asserts the same outcomes.

**The tool loop.** `tools/strands_tools.py` publishes the closeout tools as
Strands `@tool` functions, so a model can drive a job itself - propose the
action, call the tool, read the result. That is safe precisely because
authorization is not in the prompt: a model that proposes closing an unfinished
job gets back `ok=false` naming the invariant that stopped it, and the job does
not move (`tests/test_strands_tools.py`). Try it:

```bash
FIELDPROOF_STUB_AGENTS=0 python scripts/agentic_closeout.py JOB-1842
```

**Deployment.** `agents/agentcore_app.py` is a Bedrock AgentCore Runtime
entrypoint over the same workflow; the SAM template deploys the same code as an
EventBridge-triggered Lambda instead. Only one of the two should subscribe to
the trigger events.

## Repository layout (§31)

| Path | What lives there |
| --- | --- |
| `domain/` | Deterministic core: models, enums, state machine, claim/evidence compatibility, reconciliation, policy rules, `authorize()`. No I/O, no model calls. |
| `tools/` | The narrow tools agents may call (§24). Each validates, authorizes, executes, emits an event, returns a structured result. `strands_tools.py` publishes them as Strands `@tool`s. |
| `agents/` | The five agents (§16) and the orchestrator. `agents/orchestrator/graph.py` is the workflow; `strands_graph.py` is the same topology as a Strands graph; `agentcore_app.py` is the AgentCore Runtime entry point. |
| `apps/api/` | FastAPI service (§23). |
| `apps/web/` | Next.js client (§14 screens). |
| `infra/` | Settings, adapters (in-memory / DynamoDB store, filesystem / S3 objects, in-process / EventBridge bus, simulated notifier and invoicing), and `infra/aws/` - Lambda handlers and the SAM template. |
| `demo/` | 17 evaluation fixtures (§37), the fixture loader, the scenario runner and the headless demo. |
| `scripts/` | Seeding, fixture generation, `live_check.py` (real Bedrock read) and `agentic_closeout.py` (model-driven tool loop). |
| `tests/` | Invariants, workflow safety, model path, HTTP API, AWS adapters. |

## Running modes

| Mode | How | Store / objects / events | Models |
| --- | --- | --- | --- |
| Offline (default) | `FIELDPROOF_STUB_AGENTS=1` | memory + JSON files / local disk / in-process | Fixture readings; no Bedrock calls |
| Local + real models | `FIELDPROOF_STUB_AGENTS=0`, AWS credentials | as above | Bedrock via Strands |
| AWS | `FIELDPROOF_MODE=aws` (set by the SAM template) | DynamoDB / S3 / EventBridge | Bedrock, Amazon Transcribe for audio |

In offline mode the Evidence Agent uses the `fixture_reading` each fixture artifact
declares in its metadata, so the workflow, tests and demo are deterministic. That
determinism is also why the fixture artifacts are text stand-ins rather than
photographs: `scripts/live_check.py` is there to read a real one through Bedrock and
print the observations the reconciliation engine would receive. With stubs off, every
artifact goes through the model instead; the tests cover that path with a fake model
(`tests/test_evidence_agent.py`).

Either runtime can sequence the workflow, and both run the same steps:

| `FIELDPROOF_ORCHESTRATOR` | Runs the workflow as |
| --- | --- |
| `inprocess` (default) | a deterministic sequencer - `agents/orchestrator/graph.py` |
| `strands` | a Strands multi-agent graph - `agents/orchestrator/strands_graph.py` |

All configuration is environment variables - see [`.env.example`](.env.example).

## API (§23)

Every `/api` route requires `Authorization: Bearer $FIELDPROOF_API_KEY` when that
variable is set.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/jobs` | Create a work order (FR-01). 409 if the id exists. |
| `GET` | `/api/jobs`, `/api/jobs/{id}` | List jobs; full job state. |
| `POST` | `/api/jobs/{id}/complete` | Technician finishes. Returns at once; the workflow runs on the event. |
| `POST` | `/api/jobs/{id}/evidence` | Multipart upload: `file`, `type`, `uploaded_by`, optional `stage` (`before`/`after`) and `metadata` (JSON). |
| `POST` | `/api/jobs/{id}/evidence/json` | Same, JSON body with base64 or text content (fixtures, scripts). |
| `POST` | `/api/jobs/{id}/evidence/upload-url` | Signed upload URL (§34). `PUT` the bytes to it, then... |
| `POST` | `/api/jobs/{id}/evidence/confirm` | ...register them. The hash is computed server-side from what was stored. |
| `POST` | `/api/jobs/{id}/evidence/{evidence_id}/replace` | Replace an artifact; conclusions drawn from the old one are recomputed (INV-009). |
| `GET` | `/api/jobs/{id}/events` | Timeline (§14 screen 2). |
| `GET` | `/api/jobs/{id}/graph` | Requirement → claim → evidence graph (§14 screen 4). |
| `GET` | `/api/jobs/{id}/messages` | What FieldProof sent to the technician and customer. |
| `GET` | `/api/jobs/{id}/runs` | Workflow runs: trigger, steps, tools called, duration, outcome, error (§35). |
| `GET` | `/api/jobs/{id}/metrics` | §38 numbers, computed from events. |
| `POST` | `/api/jobs/{id}/retry` | Re-run after a failure (§36). |
| `GET` | `/api/jobs/{id}/receipt`, `/receipt/verify` | Evidence receipt (FR-15) and hash check (§29). |
| `GET` | `/api/decisions?status=PENDING` | Supervisor queue. |
| `GET` | `/api/decisions/{id}` | Decision card: question, policy, impact, evidence (§14 screen 3). |
| `POST` | `/api/decisions/{id}` | `{"decision": "APPROVE" \| "REJECT" \| "REQUEST_CLARIFICATION", "decided_by": "..."}`. Idempotent. |
| `GET` | `/api/dashboard` | §14 screen 1 counts. |

`REQUEST_CLARIFICATION` relays the supervisor's `comment` to the technician; the
conflict keeps blocking closeout, and the technician's reply produces a fresh decision
with that reply attached.

## Where each invariant is enforced (§32)

| Invariant | Enforced in | Tested in |
| --- | --- | --- |
| INV-001 no close with blocking conflicts | `domain/authorization/authorize.py` `_close_job` | `test_invariants`, `test_fixtures` (JOB-2080) |
| INV-002 no silently skipped requirement | `_close_job`, `_request_evidence` | `test_invariants` |
| INV-003 incompatible evidence can't support a claim | `domain/claims/compatibility.py` | `test_invariants` |
| INV-004 financial exceptions need approval | `_increase_invoice`, `_create_invoice`, `billable_amount` | `test_invariants`, JOB-2060 |
| INV-005 duplicate events don't duplicate actions | `tools/base.py` idempotency | `test_invariants`, `test_workflow_safety`, `test_aws_adapters` |
| INV-006 resume exactly once | run lock + stable conflict ids + idempotent `resolve_decision` | `test_invariants`, `test_workflow_safety` |
| INV-007 every action is audited | `tools/base.py`, `set_job_status` | `test_invariants` |
| INV-008 claims keep evidence references | `domain/claims/normalize.py` | `test_invariants` |
| INV-009 replacing an artifact invalidates conclusions | full re-reconciliation, `supersede_evidence` | `test_invariants`, `test_api` |
| INV-010 agent output can't bypass policy | `authorize()` on every tool | `test_invariants` |

## Deploying to AWS (§30)

`infra/aws/template.yaml` (SAM) creates the DynamoDB table (single-table layout, §22),
a private versioned S3 bucket, an EventBridge bus, the API as a Lambda behind an HTTP
API, and a workflow worker Lambda triggered by an EventBridge rule on `JOB_COMPLETED`,
`EVIDENCE_UPLOADED`, `DECISION_RESOLVED` and `WORKFLOW_RETRY_REQUESTED`.

```bash
make validate        # cfn-lint the template
make deploy          # sam build && sam deploy --guided   (needs the SAM CLI and make)
```

**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) is the full runbook** - prerequisites,
enabling Bedrock model access, building without `make`, smoke tests, wiring the web
client, costs, troubleshooting and teardown.

Before the first deploy, enable access to the Bedrock model in `BedrockModelId`
for your region. The build uses Linux wheels (`build-ApiFunction` in the `Makefile`), so
it works from Windows or macOS as long as `make` is available; `sam build --use-container`
avoids needing it locally.

To run the workflow on **Bedrock AgentCore Runtime** instead of the worker Lambda:

```bash
pip install -e ".[agentcore]"
agentcore configure -e agents/agentcore_app.py -r us-east-1   --requirements-file requirements-agentcore.txt
agentcore deploy
agentcore invoke '{"job_id": "JOB-1842"}'
```

The execution role needs access to the table, bucket and bus, and only one of the
two workers should be subscribed to the trigger events - both are covered in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) section 10.

## What is simulated (§39)

- **Invoicing** - `infra/adapters/invoicing.py` records invoices in memory and behaves
  like a real idempotent provider. Swap in QuickBooks/Stripe behind the same `submit()`.
- **Technician and customer messaging** - `infra/adapters/notifier.py` records messages
  (visible at `/messages`) instead of sending SMS or email.
- **Authentication** - requests are authorized with an API key (`FIELDPROOF_API_KEY`).
  Connect an identity provider for per-user access in production.

## Operational notes

- Audio transcription uses Amazon Transcribe in AWS mode. Locally, a voice note can be
  uploaded as text (`.txt` or `text/*`) and is used as its own transcript.
- The in-process event bus serves a single API process. Multi-process deployments use
  AWS mode, where the DynamoDB lock serializes runs across Lambdas.

## License

MIT - see [LICENSE](LICENSE).
