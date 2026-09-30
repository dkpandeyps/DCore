# AEOS Master Specification

> **Document:** MASTER-SPEC
> **Spec version:** 0.4.0 (draft), updated after Phase 2 documentation validation, the Phase 2 hands-on validation (2026-09-27; [platform-validation/HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md)), and the Phase 2 owner decisions ([PHASE-2-EXIT-CRITERIA.md § Owner decisions](platform-validation/PHASE-2-EXIT-CRITERIA.md#owner-decisions-2026-09-27))
> **Date:** 2026-09-27
> **Status:** DRAFT. The requirements below are binding for all work under this project once §19 ratifies them.
> **Authority:** This is the **authoritative specification** for the project.
> - [PROPOSED-SYSTEM-ARCHITECTURE.md](PROPOSED-SYSTEM-ARCHITECTURE.md) (PSA) explains the design; this document governs.
> - [ROADMAP.md](ROADMAP.md) sequences delivery.
> - [IMPROVEMENT-OPPORTUNITIES.md](IMPROVEMENT-OPPORTUNITIES.md) (IO) justifies requirements.
> - The gstack analysis documents are reference material only.
>
> **Keywords:** MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are used as defined in RFC 2119.
> **Working name:** "AEOS" is the working product name and namespace for R0/R1 specification work (owner decision Q1, 2026-09-27). The final product name is a pre-release decision. When it is chosen, every derived identifier (`aeos`, `.aeos/`, `AEOS_*`) is renamed mechanically.
> **License status:** proprietary/internal for now (owner decision Q2). Public licensing will be revisited if the project becomes public.

---

## 1. Scope

AEOS is a general-purpose AI engineering skill system for coding agents, with **Claude Code as the Tier-1 host**. It covers the software lifecycle:

discover → plan → design → build → debug → review → secure → test → measure → ship → deploy → document → operate → reflect

It does this through a small set of user-facing skills backed by a deterministic runtime. The runtime has these engines: orchestration, context, state, evidence, verification, safety, artifact, memory, evaluation.

This specification covers the runtime, skills, adapters, contracts, standards, testing, versioning and contribution process.

---

## 2. Goals

Each goal G-n has an acceptance metric, defined in §15.

| ID | Goal | Acceptance metric (§15) |
|---|---|---|
| G-1 | **Enforced workflows.** Phase order, gates and completion status are enforced by code, not only described in prose. | Gate-bypass rate = 0 on the gate suite |
| G-2 | **Evidence-backed output.** Every completion claim and every finding with severity ≥ medium references fresh evidence. | 100% claim-evidence coverage; false-done rate below the gstack baseline |
| G-3 | **Always-on safety.** A safety floor applies in every session, across all tools, on every supported OS. | Destructive-corpus catch ≥ 99%; benign false-ask ≤ 2% |
| G-4 | **Token efficiency.** At equal or better outcome quality, instruction tokens per run are well below gstack on the same tasks. | ≥ 60% fewer instruction tokens for `/review` and `/ship` (validated in R1) |
| G-5 | **Cross-platform parity.** Windows, macOS and Linux are first-class. | Static and gate suites green on all 3 OSes; task-outcome parity |
| G-6 | **Composable capabilities.** Skills communicate only through typed artifacts, events and route plans. | Registry lint: 0 glob-based hand-offs; every input has a producer |
| G-7 | **Measurable superiority.** A reproducible benchmark compares AEOS with gstack. | Nightly benchmark; per-release delta report with CIs |
| G-8 | **Recoverability.** Runs survive crashes, compaction and interruption without duplicate side effects. | Fault-injection suite: 0 duplicate side effects; correct final state |
| G-9 | **Extensibility.** Teams add project skills and adapters without forking. | Scaffold to a lint-clean skill in ≤ 30 minutes (DX study) |
| G-10 | **Team reproducibility.** Everyone on a project runs the same pinned version and shares reviewed knowledge. | Version-skew refusal test; team-memory propagation test |

---

## 3. Non-goals

- **NG-1** AEOS is not a replacement for the host agent's model, tools or UI. It orchestrates them.
- **NG-2** No hosted service is required. Everything works offline except the integrations the user enables.
- **NG-3** No multi-tenant server, and no shared remote database, in v1.
- **NG-4** AEOS does not implement its own LLM inference, image generation or search engine. These come through adapters.
- **NG-5** AEOS is not a general browser-automation product. The browser layer exists to serve engineering QA, measurement and extraction.
- **NG-6** AEOS is not a persona. Voice is neutral and professional by default; personality is a user preference.
- **NG-7** AEOS does not reproduce gstack. Code and prompt text from gstack **MUST NOT** be copied (§18.4). Concepts may be re-implemented with attribution in design docs.
- **NG-8** Autonomous production changes without human approval (above L4 gates) are out of scope.

---

## 4. Design principles

1. **Code enforces, prose guides.** Anything that must happen is enforced by the runtime or a hook: gates, order, status, safety. Prose covers judgment and technique only.
2. **Evidence before assertion.** No claim without evidence. Evidence is bound to content (tree hash), not to time.
3. **Just-in-time context.** The model receives only what the current phase needs, and every context item has a token budget.
4. **One owner per concern.** Each dimension, artifact type and file (e.g. DESIGN.md) has exactly one owning skill or lens.
5. **Least privilege by default.** Skills, subagents, remote agents and adapters get the minimum capability, and escalation requires the user.
6. **Fail closed on safety, fail open on convenience.** Policy, consent, egress and verification fail closed. Hints, telemetry and update checks fail open.
7. **User sovereignty.** The user decides scope, autonomy and one-way doors. Agreement between models or agents is advice, never authorization.
8. **Ask only what can't be determined.** Questions are asked only when the answer is the user's to give and can't be derived from code, config or defaults. Each question carries a recommendation.
9. **Portable by construction.** Skill content never contains shell syntax or OS-specific commands. All of that lives in the runtime.
10. **Measure, don't assert.** Every claimed improvement has a benchmark metric, and releases report deltas with confidence intervals.
11. **Honest degradation.** When a capability is missing, the system says so and narrows its behavior. It never pretends.

---

## 5. Architecture principles

- **AP-1 Deterministic core, probabilistic edge.** The runtime is deterministic and fully unit-testable. LLM reasoning happens only inside phase execution.
- **AP-2 Single runtime.** The runtime is Node.js LTS (≥ 22) with TypeScript. Distributed skills MUST NOT require bash, python, Bun or any other runtime (PSA §2.1).
- **AP-3 Stable CLI contract.** Every runtime capability is exposed through `aeos <subcommand> --json` with a versioned envelope. An MCP façade MAY mirror a subset.
- **AP-4 Event-sourced state.** All durable state is append-only events plus rebuildable indexes (PSA §2.3).
- **AP-5 Typed boundaries.** Skill inputs and outputs, artifacts, events, evidence, claims and adapter interfaces have JSON Schemas under `schemas/`.
- **AP-6 Interfaces over tools.** Skills depend on capability interfaces (Forge, Vcs, Browser, …), never on specific CLIs or vendors.
- **AP-7 Host-agnostic core, host-specific adapters.** Host specifics (hook formats, subagent definitions, catalog rules) live in host adapters.
- **AP-8 Latency budgets.**
  - Per hook call, measured end to end by the host (AD-12): **Windows ≤ 150 ms median and ≤ 250 ms p95**, with AEOS logic inside the hook ≤ 10 ms.
  - macOS and Linux: target to be set after measurement.
  - Other runtime commands: p95 < 300 ms, excluding adapter I/O.
  - Rationale: hands-on, process spawn and harness overhead alone were about 95 ms per hook call on Windows (U-10), so the original p95 < 50 ms is unachievable there.
- **AP-9 No hidden global state.** All state is keyed by project, worktree and session (§14.1).
- **AP-10 Observability built in.** The run event log is the trace. Nothing important happens without an event.

### 5.1 Mandatory architectural principles (from Phase 2 validation)

These principles are **mandatory**. A design, RFC or implementation that conflicts with one of them MUST be rejected unless the principle is first amended through §19 with new evidence. The evidence referenced here is the Phase 2 validation table in [ROADMAP.md](ROADMAP.md#phase-2-claude-code-platform-capability-validation). Each decision is recorded in [platform-validation/ARCHITECTURAL-DECISIONS.md](platform-validation/ARCHITECTURAL-DECISIONS.md) (AD-nn).

#### MP-1 Runtime-enforced policy
- **Rule.** Policy, permissions, state transitions, evidence and completion are validated by the AEOS runtime and its hooks. The model proposes; the runtime disposes.
- **Why.** Phase 2 VERIFIED that hooks observe tool calls (including subagent calls, tagged with `agent_id`/`agent_type`), that they can block with exit code 2 or `permissionDecision: "deny"`, and that Claude Code offers no runtime-state API. Enforcement outside model reasoning is therefore possible, and it must be built by AEOS. (AD-01)

#### MP-2 Evidence-based completion
- **Rule.** Run status is computed from verifier evidence (§8.2, §10). A model's statement of completion is never sufficient.
- **Why.** Because enforcement can live outside the model (MP-1), a completion claim can be checked mechanically. A self-declared "done" is exactly the failure gstack's prose protocols couldn't prevent. Computed status does not depend on any hook. The Stop hook is an *additional* gate. Its ability to block turn end was VERIFIED hands-on, alongside gstack- and paysec-shaped Stop hooks (U-12, §10 VR-6). (AD-01)

#### MP-3 Autonomy as a ceiling
- **Rule.** AEOS autonomy and guard levels can only make behavior **more** restrictive than Claude Code's permission mode, rules and managed settings. AEOS MUST NOT:
  - return `permissionDecision: "allow"`
  - use `updatedInput` to widen an action
  - modify permission rules in a loosening direction
- **Why.** Phase 2 found autonomy levels VERIFIED (as a ceiling only). PreToolUse can deny or ask, but `allow` cannot override stronger deny or ask rules. And `allow` *can* skip a native prompt, which would weaken Claude Code if AEOS used it. On Claude Code 2.1.283, `auto` is the default starting mode, so AEOS must be the stricter layer, never the looser one. (AD-02)

#### MP-4 Defense in depth
- **Rule.** Safety uses five layers, and no single layer is trusted alone:
  1. Claude Code permission rules
  2. AEOS PreToolUse enforcement
  3. filesystem and sandbox controls
  4. managed settings where the organization deploys them
  5. protected AEOS state and signing material
- **Why.** Safety-configuration protection is only PARTIALLY VERIFIED:
  - Claude Code protects some configuration paths, but not AEOS-owned state.
  - Shell-based file manipulation can bypass simple Edit/Write rules.
  - Hooks can be disabled for a run through explicit settings.
  - Managed settings are stronger but need organizational deployment.

  Each layer covers gaps in the others. (AD-06)

#### MP-5 Skill/workflow separation
- **Rule.**
  - Claude Code skills are thin entry points (stubs) for **user-facing** capabilities only.
  - Workflow logic, specialist instructions and internal mechanisms live in the runtime: runtime-served phase cards, controlled subagents, or runtime code.
  - Critical internal functionality MUST NOT depend on a skill being hidden.
- **Why.** Hidden/internal skills are PARTIALLY VERIFIED:
  - `disable-model-invocation` stops only automatic model invocation.
  - `user-invocable: false` hides a skill from the `/` menu but not from the model.
  - No mechanism hides a skill from both while allowing runtime invocation.

  Skill-to-skill invocation is VERIFIED and may be used for user-level composition. (AD-04)

#### MP-6 Hook coexistence
- **Rule.** AEOS MUST coexist with hooks owned by others: gstack, paysec, project hooks, plugin hooks, managed hooks and other tooling. The Hook Compatibility Manager (PSA §2.17) detects, classifies and reports them before installation. AEOS never edits, reorders, removes or disables another owner's hook.
- **Why.** Hooks from settings, plugins and managed policy all run in the same events, subagents included. This machine already has gstack and paysec `Stop` hooks in `~/.claude/settings.json`. Plugin agents also have limitations with their own hooks and permissions, so AEOS's global hooks carry role enforcement (keyed on `agent_type`) and must not collide with others. (AD-05, AD-07)

#### MP-7 Explicit verification states
- **Rule.**
  - Every statement about host-platform behavior in AEOS documents, the constitution, `aeos doctor` output and release notes carries exactly one status: **VERIFIED**, **PARTIALLY VERIFIED**, **NOT VERIFIED** or **NOT AVAILABLE**.
  - Architecture MUST NOT depend on a NOT VERIFIED behavior without a documented fallback.
  - A status may be raised only with new recorded evidence.
- **Why.** Phase 2 found several behaviors that are plausible but not demonstrated:
  - `"*"` capturing MCP tools (since shown hands-on for local stdio servers only)
  - the origin of user prompts (still unresolved: channel, not human)
  - hook reload mid-session (since VERIFIED hands-on for user scope)
  - detached-process fate on exit (since shown hands-on on Windows: they survive)

  These are listed in [PLATFORM-ASSUMPTIONS.md](PLATFORM-ASSUMPTIONS.md) and must not quietly harden into architecture. Mixing them with verified facts is how unsafe guarantees get made.

#### MP-8 No silent modification of user configuration
- **Rule.** AEOS MUST NOT change user or project configuration without showing the exact change and receiving explicit consent. This covers `~/.claude/settings.json`, project `.claude/settings*.json`, CLAUDE.md, other owners' hooks, and shell or tool rc files. Every accepted change is backed up and reversible.
- **Why.**
  - AEOS must add hooks and possibly deny rules (MP-4), and these live in files that other tools also own (MP-6).
  - Several of those paths are protected by Claude Code precisely because silent changes to them are dangerous.
  - gstack's pattern of committing routing and config into CLAUDE.md is a documented weakness (IO-41).

  (AD-07)

**Additional binding constraints from Phase 2:**
- **User authority is unresolved.** AEOS MUST NOT claim that it perfectly distinguishes user-originated from model-generated instructions, and no critical guarantee may depend on an unverified origin signal (§11 AU-2, §12.1 S-8; AD-10).
- **MCP interception** relies on an explicit `mcp__.*` matcher (VERIFIED). `"*"` is a second line: VERIFIED hands-on only for local stdio MCP servers (AD-08).
- **AEOS owns its persistent state** (AD-03).
- **Detached processes** require managed lifecycle: startup, health check, idle timeout, cleanup, crash recovery and orphan detection (AD-09).

---

## 6. Naming and directory conventions

### 6.1 Naming

| Entity | Convention | Examples |
|---|---|---|
| User-facing skill id and command | lowercase single word or kebab-case verb/noun, ≤ 12 chars | `review`, `debug`, `deploy` |
| Skill modes | subcommand word | `/deploy monitor`, `/docs sync` |
| Specialist id | `<family>.<name>` kebab-case | `lens.security-diff`, `verifier.independent`, `fix-loop` |
| System module | `sys.<name>` | `sys.policy` |
| Artifact type | snake_case noun | `test_plan`, `design_system` |
| Schema id | `<type>@<major>` | `findings@1` |
| Event type | dot.case `<entity>.<verb-past>` | `phase.completed`, `claim.recorded` |
| Error code | `E_<UPPER_SNAKE>` | `E_POLICY_DENIED` |
| Policy action class | dot.case | `vcs.publish`, `data.destructive` |
| Config key | snake_case, dotted path for nesting | `ship.qa`, `policy.sensitive_paths` |
| Env var | `AEOS_<UPPER_SNAKE>` | `AEOS_HOME` |
| Adapter id | `<interface>/<provider>` | `forge/gitlab`, `deploy/fly` |
| IDs | `<prefix>_<ulid>` | `run_…`, `art_…`, `ev_…`, `clm_…`, `mem_…` |

- Names MUST NOT collide with host built-in commands; the lint checks a host reserved-word list.
- On hosts that namespace plugin skills (e.g. `aeos:review`), the bare name is still the canonical id.

### 6.2 Directories

**Source repository (AEOS itself):**
```
/runtime/            # TypeScript runtime (sys.* modules), CLI entry
/schemas/            # JSON Schemas (artifacts, events, contracts, manifests)
/skills/<id>/        # user & specialist skills: skill.yaml, phases/, refs/, evals/
/agents/             # subagent role definitions (host-rendered)
/adapters/<iface>/<provider>/   # adapter implementations + contract tests
/hosts/<host>/       # host adapters (render stubs, hooks, agent defs)
/policy/             # baseline policy rules + corpora
/bench/              # benchmark suites, fixture repos (or pointers), baselines
/docs/               # generated references + hand-written guides
/tools/              # build, lint, release tooling (dev-only)
```

**User scope (`$AEOS_HOME`, default `~/.aeos/`, resolved by the runtime only):**
```
config.yaml   consents.jsonl   state/<project-id>/{runs/*.jsonl, index.sqlite, artifacts/, memory.jsonl}
security/{egress.jsonl, policy-decisions.jsonl}   cache/   logs/   migrations.jsonl
```

**Project scope (`<repo>/.aeos/`, committed unless noted):**
```
config.yaml        # pinned version, enabled skills/adapters, policy overrides (additive-strict only)
deploy.yaml        # deploy configuration (schema-validated)
memory/*.jsonl     # team-scope memory (PR-reviewed)
skills/<id>/       # project skills
artifacts/         # explicitly exported, approved artifacts
.local/            # git-ignored: per-machine overrides
```

**Rules:**
- The runtime MUST NOT write outside `$AEOS_HOME`, `<repo>/.aeos/`, the run's temp directory, and paths the user or policy authorizes.
- Temp paths MUST be run-scoped: `<os-temp>/aeos/<run-id>/`.

---

## 7. Skill standards

### 7.1 Kinds

| Kind | Visible in host catalog | Invoked by | Examples |
|---|---|---|---|
| `user` | Yes | User or router | `/review`, `/ship` |
| `specialist` | No: **not a Claude Code skill**. Delivered as runtime-served phase cards or controlled subagents (MP-5). | User skills and composer | `lens.testing`, `fix-loop` |
| `system` | No (runtime module) | Runtime | `sys.policy`, `sys.router`, `sys.hookcompat`, `sys.lifecycle` |

The initial set is PSA §3. Adding a **user** skill requires an RFC (§18.1), because the catalog surface is a product decision.

### 7.2 Manifest (`skill.yaml`), required fields

```yaml
id: string                         # §6.1
version: semver
kind: user | specialist | system
summary: string                    # ≤ 120 chars; used in catalog
description: string                # ≤ 600 chars; what it does / when NOT to use
routing:                           # user kind only
  examples: [string]               # ≥ 30 (with ≥ 10 in evals/routing.yaml held out)
  negative: [string]               # ≥ 10
  requires_context: [predicate-id]
modes: [{id, summary, params_schema}]   # optional
inputs:  {<name>: {artifact?: type, schema?: id, required: bool, default?: any}}
outputs: [{artifact: type, schema: id, required: bool}]
requires: {interfaces: [iface], optional: [iface], min_runtime: semver-range}
permissions:
  profile: read-only | read-mostly | write-scoped | write | operate
  max_autonomy: L0 | L1 | L2 | L3 | L4
  action_classes: [class]          # declared side-effect classes (§12.3)
phases: [phase-id]                 # each has phases/<id>.md (card) with its own frontmatter
pipeline: [...]                    # optional DAG (§13.2)
done_when: {verifiers: [id], optional: [id]}
budget: {tokens_p50, tokens_max, wall_max_s, usd_max?}
composes: [specialist-id | pattern]
owners: [github-handle]
stability: experimental | beta | stable | deprecated
```

### 7.3 Skill stub (`SKILL.md`)

- It is **generated** from the manifest and MUST NOT be hand-edited.
- Budget: ≤ 60 lines and ≤ 800 tokens.
- Contents: purpose, when not to use, the `aeos run start` invocation, and the escape hatch ("if `aeos` is unavailable, tell the user to run `aeos doctor`; do not improvise the workflow").

### 7.4 Phase cards (`phases/<id>.md`)

- **Frontmatter:** `{id, budget_tokens, output_schema, gates: [id], tools: [intent], refs: [ref-id]}`.
- **Budget:** ≤ 1,500 tokens by default. A larger budget needs a justification in the manifest review.
- **Content:** the objective, the method (the judgment-level technique), the required output shape, and failure guidance.
- **MUST NOT contain:**
  - shell commands, OS-specific paths or tool-specific syntax (use `aeos` subcommands or adapter intents)
  - persona or voice text
  - instructions that duplicate the constitution
- **Output:** the card ends with the exact `aeos run step` call and the output schema reference.

### 7.5 References and budgets

- Reference packs (`refs/*.md`) MUST declare `budget_tokens`, and they load only through `aeos ctx ref`.
- The constitution MUST be ≤ 1,200 tokens.
- Budgets are enforced by lint: fail at > 110% of budget.
- The eval harness records actual consumption.

### 7.6 Lens dimension ownership

Every review dimension has exactly one owning lens. Other lenses MUST NOT emit findings on dimensions they don't own; they MAY attach a `cross_ref` note for the owner lens.

**Plan lenses:**

| Lens | Owns |
|---|---|
| `lens.product` | Problem and premise, user value, scope mode (expand/hold/reduce), success metrics, business cost and pricing, strategic risks, what is out of scope |
| `lens.engineering` | Architecture and boundaries, data flow and state, error handling and failure modes, test strategy and test plan, performance and capacity, migration and rollout, observability, parallelization lanes |
| `lens.design` | Information architecture, interaction states, user journeys, visual system conformance, responsive and a11y intent, AI-slop risk |
| `lens.dx` | Developer persona, time to hello world, API/CLI ergonomics, error message quality, docs journey, upgrade path |

**Review lenses:**

| Lens | Owns |
|---|---|
| `lens.correctness` | Logic, edge cases, concurrency, contract adherence |
| `lens.testing` | Test adequacy, regression coverage, flakiness risk |
| `lens.security-diff` | Authn/authz, injection, secrets, trust boundaries (including LLM/agent), crypto misuse |
| `lens.performance` | Complexity, N+1, hot paths, bundle and payload size |
| `lens.data-migration` | Schema and data migrations, reversibility, locking |
| `lens.api-contract` | Public API/CLI compatibility, versioning |
| `lens.maintainability` | Structure, naming, duplication |
| `lens.simplification` | Removable complexity |
| `lens.reuse` | Shared-code extraction |
| `lens.a11y` | Accessibility |
| `lens.red-team` | Abuse and adversarial scenarios **not** covered by security-diff |

### 7.7 Skill lint (CI-blocking)

1. The manifest validates against its schema.
2. The stub, cards and refs are within budget.
3. Every output artifact type is registered, and every input type has a registered producer.
4. Permissions cover every tool intent in the cards (IO-08).
5. The cards contain no shell or OS syntax (a pattern and AST check).
6. Routing examples don't collide with another user skill above a similarity threshold (default cosine 0.85, or lexical Jaccard 0.6).
7. `done_when` references existing verifiers.
8. Claims lint (IO-47):
   - every mode and param in the manifest is referenced by some card
   - every metric the description promises appears in an output schema
9. There are ≥ 10 task eval cases and the routing utterance minimums are met (for `user` kind).

---

## 8. Input and output contracts

### 8.1 Invocation (normative schema `invocation@1`)

This is PSA §5.1.
- `autonomy` MUST be computed as `min(session_level, project_max, skill.max_autonomy)`.
- `budget` MUST always be present. The defaults come from the manifest.

### 8.2 Result (`result@1`)

This is PSA §5.2.
- **`status` is computed by the orchestrator**, not supplied by the model:

  | Status | Condition |
  |---|---|
  | `done` | Every required verifier has evidence of passing on the current tree, and no open claim of severity ≥ high is in state `hypothesis`, unless the manifest allows it |
  | `done_with_concerns` | Every required verifier passes, and optional verifiers fail or concerns exist |
  | `needs_input` | Waiting on a user decision |
  | `blocked` | A capability, policy or verification failure after its repair attempts |
  | `failed` | An internal or unrecoverable error |
  | `aborted` | The user cancelled |

- `summary` MUST be ≤ 120 words and MUST NOT contain claims that are not present in `claims`.

### 8.3 Phase protocol

This is PSA §5.3.
- A phase output that fails schema validation MUST be rejected with machine-readable errors.
- A phase gets at most 2 repair attempts, and then the run becomes `blocked` (`E_SCHEMA_INVALID`).

### 8.4 Artifact contract (`artifact@1`)

- **Envelope:** `{id, type, v, title, producer, run, inputs[], tree, status, supersedes?, approvals[], content_sha256, created_at, body}`.
- Artifacts are immutable. A change creates a new id with `supersedes`.
- Status transitions are `draft → approved → superseded | archived`. `approved` requires an approval record captured through a runtime question or an out-of-band confirmation. The assurance of that channel is bounded by the unresolved user-authority boundary (§12.1 S-8). Approval records store which channel was used.
- Consumers MUST resolve inputs through the registry (`aeos artifact latest|get`). Glob-based discovery is prohibited.

### 8.5 Event contract (`event@1`)

- **Envelope:** `{v, ts, run, seq, type, actor, data, prev}`.
- `seq` is strictly increasing per run.
- `prev` is the hash chain.
- Every event type MUST have a schema and MUST have a registered consumer or the `audit_only: true` mark.

### 8.6 Inter-skill communication

Skills MUST communicate only through artifacts, events and route plans (PSA §4). A skill MUST NOT read another skill's files, cards or internal state.

---

## 9. Evidence standards

- **EV-1 Kinds.** `command`, `test`, `file_citation`, `screenshot`, `http_probe`, `browser_trace`, `metric`, `external_ref`, `human_confirmation` (PSA §2.4).
- **EV-2 Required fields.** `id`, `kind`, `tree`, `captured_at`, `producer`, `data`, `redacted`.
  - `command` and `test` evidence MUST include argv, exit code, duration and output hash.
  - A bounded excerpt of ≤ 2 KB MAY be included after redaction.
- **EV-3 Determinism classes.**
  - Deterministic: `command`, `test`, `file_citation`, `http_probe`, `metric` when reproducible.
  - Observational: `screenshot`, `browser_trace`, `external_ref`.
  - Attested: `human_confirmation`.
  - A claim becomes `verified` only with ≥ 1 deterministic evidence item.
- **EV-4 Freshness.** Evidence is fresh iff `evidence.tree == current tree` (with a dirty-tree hash for uncommitted changes). Time-based freshness MUST NOT be used for gating.
- **EV-5 Citations.** `file_citation` MUST store `path`, `line` or range, and the `sha256` of the cited lines. The claim is invalid if the hash doesn't match at verification time.
- **EV-6 Claim status rules.**

  | Status | Requirement |
  |---|---|
  | `verified` | Fresh deterministic evidence directly demonstrates the statement |
  | `supported` | Evidence consistent with the statement, but not conclusive |
  | `hypothesis` | Plausible, with no confirming evidence |
  | `refuted` | Evidence contradicts it |
  | `unverifiable` | The capability to check it is absent (state which) |

  - Findings of severity ≥ high MUST NOT be presented as fact unless `verified`.
  - `hypothesis` findings MUST be labelled as such in every rendering.
- **EV-7 Redaction.** Evidence MUST pass the secret scanner before storage. Findings of HIGH secrets are stored as `[REDACTED:<rule>]` with a hash only.
- **EV-8 Untrusted evidence.** Evidence derived from external content is tagged `trust: untrusted` and MUST NOT be interpreted as instructions.

---

## 10. Verification standards

- **VR-1 Definition of Done.** Every skill declares `done_when` verifiers, and the orchestrator computes status per §8.2.
- **VR-2 Verifier properties.** A verifier MUST be:
  - deterministic, or explicitly declared `probabilistic` with N-run aggregation
  - idempotent
  - bounded in time (declared `timeout_s`)
  - side-effect-free outside its run temp dir
  - evidence-producing: it records `Evidence` on pass **and** fail
- **VR-3 Regression tests.** Any skill that claims to fix a defect MUST satisfy `tests.new_fail_before_fix`: the new test fails on the pre-fix tree and passes on the post-fix tree.
- **VR-4 Independent verification.** Claims of severity ≥ high, and any `done` for runs at autonomy ≥ L3, MUST be checked by an independent verifier. That is a subagent with a fresh context pack and no access to the producing agent's reasoning, or a deterministic verifier, when policy `verify.independent` is enabled (default: on for L3+).
- **VR-5 Flakiness.**
  - A test that changes result on re-run within the same tree is `flaky`.
  - Flaky results MUST NOT count as passes.
  - The run records `concern: flaky_test` and MAY quarantine the test only with user approval.
- **VR-6 Stop enforcement.**
  - The runtime MUST NOT record status `done` without the required verifier evidence. This holds independently of any hook.
  - On hosts where a Stop hook can block turn end, AEOS additionally blocks a turn that presents an unverified completion claim, and lists what is missing.
  - Stop-hook blocking is **VERIFIED hands-on** (U-12): `{"decision":"block"}` was honored while coexisting with gstack- and paysec-shaped Stop hooks and a failing one.
  - The gate MUST honor `stop_hook_active` to prevent loops.
- **VR-7 Browser verification.** UI claims require a `browser_trace` or `screenshot` **plus** a deterministic assertion (a DOM or accessibility query, a network response, or a console-error absence). "Looks right" alone is `supported`, never `verified`.
- **VR-8 Deploy verification.** "Deployed" requires evidence that the live system serves the target SHA (a provider status or a version endpoint), plus a health check. HTTP 200 alone is insufficient.
- **VR-9 Documentation verification.** Generated or updated docs MUST pass `docs.snippets_run` (for supported languages) and `docs.links_ok` for any `done` status.

---

## 11. Autonomy levels

| Level | Name | Allowed without asking | Requires per-action user approval | Always denied at this level |
|---|---|---|---|---|
| **L0** | Advise | Read, search, analyze, run read-only verifiers, write to the run temp dir and state | — | Any repo write, commit, publish, deploy, install |
| **L1** | Assist | L0 + edit the working tree inside `scope.write_roots` | Commits, `pkg.install`, `net.egress` to non-allowlisted hosts | `vcs.publish`, `forge.publish`, `deploy`, `vcs.rewrite`, destructive classes |
| **L2** | Commit | L1 + local commits and branches, worktrees, run-scoped stashes | `vcs.publish`, `pkg.install` | `deploy`, `vcs.rewrite` on shared branches, destructive classes |
| **L3** | Publish | L2 + push a non-default branch, create or update a draft PR or issue | Merge, non-draft PR, comments on others' PRs, `deploy` | Force-push to default or protected branches, `data.destructive` and `cloud.destructive` on non-local targets |
| **L4** | Operate | L3 + merge and deploy **after** every pipeline gate passes | Rollback, production data changes, infra changes | Anything policy marks `never` (§12.1) |

**Rules:**
- **AU-0 Ceiling semantics (MP-3).**
  - The levels define the most AEOS will *let through* to Claude Code's own permission flow. They are never grants.
  - Effective behavior is the most restrictive of: Claude Code's permission mode and rules, managed settings, the AEOS autonomy level, and the AEOS guard/scope.
  - "Allowed without asking" in the table above means "AEOS adds no prompt". Claude Code may still prompt or deny.
- **AU-1** The effective AEOS level is `min(session, project_max, skill.max_autonomy, host_cap)`.
- **AU-1a Default level (owner decision Q7).** The default session level for interactive sessions is **L1**. A project MAY explicitly configure L2 in `.aeos/config.yaml`. Anything above L2 still follows AU-2.
  - `host_cap` is L1 when the host lacks PreToolUse hooks (IO-31), or when AEOS detects that its hooks are not running in the session (PSA §2.6).
- **AU-2** Raising the level, above the default L1 or whatever the project config sets, requires **user consent**, recorded as a consent event with scope (`this run` | `this session` | `project`) and the channel it arrived through.
  - Phase 2 found that user-vs-model attribution is only PARTIALLY VERIFIED, so AEOS MUST NOT treat any in-session origin signal (UserPromptSubmit content, tool-call fields) as proof of user authorship.
  - Until a channel is validated (PLATFORM-ASSUMPTIONS U-02), raising above the project default takes effect **only in a new session**. The level is frozen per session at SessionStart (restart-only, AD-10).
  - The restart-only mechanism was VERIFIED hands-on in simulation, and is **adopted for R2** (owner decision Q21 / B-5) until an in-session relaxation channel is validated. Any in-session channel, including out-of-band confirmation, remains unvalidated and MUST NOT be enabled before validation (PSA §2.6).
  - The constitution states this limit.
- **AU-2a** Lowering the level (tightening) is accepted from any source.
- **AU-3** A delegated or composed run inherits `min(parent, own)`, never higher.
- **AU-4** The constitution and every status line MUST display the effective level.
- **AU-5** Spawned or headless sessions without a user default to L0 or L1 per project config, and MUST NOT auto-approve anything that requires approval. They end `needs_input`. This differs from gstack, where spawned sessions auto-choose the recommended option.

---

## 12. Safety standards

### 12.1 Baseline, never relaxable by the model

- **S-1** No force-push to default or protected branches.
- **S-2** No `data.destructive` or `cloud.destructive` actions on non-local targets without a typed confirmation that names the target.
- **S-3** No reading `secrets.read` paths into model context. Secrets reach adapters only through a secret provider.
- **S-4** No off-machine transmission of repo content to a third party without a recorded per-provider consent. Every transmission MUST be receipted in `security/egress.jsonl` **before** sending.
- **S-5** Instructions inside untrusted-content envelopes MUST NOT be executed.
- **S-6** No mutation of host global settings, project settings, CLAUDE.md or another owner's hooks without showing the exact change, explicit consent and a backup (MP-8).
- **S-7** No signalling of processes the runtime didn't start. Identity is verified by pid, start time and command line.
- **S-8** No self-relaxation. The model MUST NOT be able to lower the guard level, widen a scope, raise autonomy or add allowlist entries.
  - Within a session, the policy engine denies tool calls that invoke AEOS relaxation commands or write relaxation state.
  - Relaxation requires user consent through a channel the model cannot complete (AU-2).
  - **Status: this is a requirement, not a verified guarantee.**
    - Attribution of user origin is PARTIALLY VERIFIED. Hands-on, `UserPromptSubmit` identifies the input channel, not a human.
    - Protection of relaxation state against indirect shell manipulation is PARTIALLY VERIFIED. Hands-on, an interpreter one-liner bypassed deny rules (MP-4, AD-06, AD-10).
    - The restart-only mechanism removes reliance on attribution, but not reliance on state protection.
    - Documents and the constitution MUST describe this as an unresolved boundary until PLATFORM-ASSUMPTIONS U-02 and U-08 are resolved.
- **S-9** No weakening of Claude Code controls. AEOS MUST NOT emit `permissionDecision: "allow"`, MUST NOT use `updatedInput` except for provably narrowing normalizations, and MUST NOT loosen permission rules or managed settings (MP-3).
- **S-10** No dependence on detached processes for safety. Policy decisions MUST have an in-process path that fails closed when an AEOS daemon is absent or unhealthy (AD-09). Hands-on on Windows, detached processes survive session exit and a Claude Code kill, so lifecycle management is mandatory.
- **S-11** Hook deadline.
  - Hands-on, a hook that exceeds its configured timeout is cancelled and **the tool call proceeds** (fail-open, U-10).
  - Every AEOS hook MUST therefore enforce an internal deadline well below its configured timeout, and MUST return `deny` or `ask` itself when the deadline is reached (AD-12).
  - AEOS hooks MUST be declared as `command`+`args` Node processes, not PowerShell or shell-string commands.
  - **A hook timeout is not a safety boundary** (owner decision B-1). No AEOS guarantee may depend on a hook completing, or being cut off, by its configured timeout. The internal deadline is a mitigation only.
  - The accepted latency budget is Windows-first: ≤ 150 ms median, ≤ 250 ms p95 (AP-8, AD-12).

### 12.2 Policy engine requirements

- **SP-1** The policy is evaluated for every interceptable tool call through host PreToolUse hooks, registered with **both** a match-all matcher (`"*"`) and an **explicit `mcp__.*` matcher**.
  - Explicit MCP matching is VERIFIED.
  - `"*"` caught local stdio MCP tools hands-on, but is unverified for plugin and remote MCP servers, and MUST NOT be the declared coverage (AD-08).
  - PreToolUse sees only calls that reach execution. Calls rejected earlier by Claude Code are not visible (U-20).
  - Subagent tool calls are evaluated with their `agent_type` and `agent_id`, and role policy applies (AD-05).
  - Tools without a classification default to `ask`.
  - `EndConversation` is a known exception that bypasses PreToolUse.
- **SP-1a** Decision vocabulary: `deny` (with reason and rule id), `ask`, or no decision. Exit code 2 is used on fail-closed error paths. `allow` is prohibited (S-9).
- **SP-2** Shell commands (bash/sh/zsh and PowerShell) MUST be parsed into an AST.
  - Every simple command in a compound command, pipeline, subshell, `xargs` or `find -exec` is classified.
  - Unparseable commands are `ask`.
- **SP-3** Interpreter one-liners and inline scripts (`-c`, `-e`, heredocs to interpreters) are `opaque-exec`, which is `ask` at guard `standard` or higher. Hands-on, `node -e` wrote into a deny-ruled folder that every other tested path could not reach (U-08).
- **SP-2a** Parsers (AD-13).
  - PowerShell: the built-in AST, hosted in a long-lived helper under AD-09 (hands-on, about 1 s process start and about 36 ms per parse), with a fail-closed fallback.
  - Bash/POSIX (owner decision B-2): **AEOS has NOT validated a Bash command parser.** Until one has been separately validated on the policy corpus (a deferred Phase 3/platform-validation item):
    - AEOS MUST NOT claim reliable semantic enforcement of Bash commands.
    - Bash commands get a **conservative safety posture**. AEOS MUST NOT auto-approve a Bash command (it never emits `allow`, S-9). It MUST stop or ask according to the configured safety policy. Bash is never treated as unrestricted.
    - Claude Code's native permissions remain independently enforced.
    - This conservative posture MUST NOT be described as equivalent to a validated Bash enforcement layer.
    - `aeos doctor` reports: "Bash parser not validated; conservative posture active". It never reports "Bash enforcement active", and never "Bash unrestricted".
    - "Parser not validated" and "Bash unrestricted" are distinct states. Only the first applies.
  - Constructs a static parser cannot resolve (variable-as-command, `Invoke-Expression`, `-EncodedCommand`, decode-then-execute) are `opaque`.
- **SP-4** Decisions are `allow | ask | deny`, with `rule_id`, `reason` and `remediation`. Every non-allow decision is logged to `security/policy-decisions.jsonl`, with the command content hashed, not stored.
- **SP-5** Guard levels are `standard` (the default: baseline plus autonomy rules), `strict` (standard plus `ask` on every write outside scope and every network egress), and `lockdown` (L0 enforced). There is no `off`.
- **SP-6** Scope boundaries are run- and session-keyed and apply to all write-capable tools, including shell writes inferred from the AST. An empty, root or home scope is rejected at creation.
- **SP-7** Project config MAY add rules or sensitive paths; it can only make the policy stricter. Relaxation needs a user-level config entry created through the consent channel of AU-2, and it is subject to S-8's status.
- **SP-8** Defense in depth (MP-4). A deployment MUST document which of the five layers are active. `aeos doctor` MUST report each layer's status: active, unavailable, or not verified.
  - **Layer 4 (managed settings)** is assumed **unavailable** for individual users (owner decision Q20). It is recommended for organizational deployments.
  - **Layer 3 (sandbox)** was NOT AVAILABLE in the tested Windows configuration.
  - The accepted Windows compensating design (OS ACLs on AEOS state, the opaque-exec policy, integrity checks; owner decision B-6) MUST be reported as compensating controls, **never as equivalent to an OS sandbox**.
- **SP-9** Shell commands MUST NOT be gated by command-pattern matching alone. Parsing (SP-2) is combined with sandbox filesystem and network controls where available. Phase 2 confirmed that pattern rules miss indirect forms such as `sh -c`, full paths, `cp` and interpreter writes.
- **SP-10** AEOS-owned state and policy paths are protected per PSA §2.3:
  - deny rules, proposed with consent (MP-8)
  - PreToolUse denies
  - sandbox restrictions where available; on Windows, OS ACLs on AEOS state instead (B-6, not equivalent to a sandbox)
  - managed placement where available
  - signed security records

  On an integrity failure, the runtime falls back to `lockdown`. Cross-platform sandbox validation is deferred.

### 12.3 Action classes

`fs.delete`, `fs.write.outside_scope`, `vcs.rewrite`, `vcs.publish`, `forge.publish`, `deploy`, `data.destructive`, `cloud.destructive`, `secrets.read`, `net.egress`, `pkg.install`, `system`, `opaque-exec`, `process.signal`, `host.settings`.

The classification tables live in `/policy/` with a test corpus (§15.1).

### 12.4 Content and memory safety

- **CS-1** All external content (web pages, forge and tracker text, third-party files, second-opinion outputs, MCP results from untrusted servers) is wrapped in a trust envelope with a per-session nonce. Hidden-element and ARIA-injection marking applies to all DOM reads, for all agents.
- **CS-2** Memory and artifact writes whose provenance includes untrusted content are tagged `untrusted`. They are never auto-injected, and they need user confirmation to become `trusted`.
- **CS-3** A secret scan runs at every sink: forge posts, memory writes, telemetry, LLM second-opinion calls, and artifact exports. Tier HIGH blocks and cannot be disabled; MEDIUM asks; LOW informs.

### 12.5 Remote and paired agents

- **RA-1** Least-privilege defaults: `read, interact`; no eval, cookies, storage or control.
- **RA-2** Tokens default to 1 hour and are scoped to their own tabs.
- **RA-3** Private and loopback network ranges are blocked unless explicitly allowed with domain globs.
- **RA-4** A separate listener is the only forwarded port. The command allowlist is enforced server-side.
- **RA-5** Every remote command is written to the audit log.
- **RA-6** Credential files are 0600, or have an equivalent ACL on Windows, and the runtime verifies this.

---

## 13. Tool usage and orchestration rules

### 13.1 Tool usage (applies to phase cards and to model behavior under AEOS)

- **TU-1** Adapters and `aeos` subcommands come first. Direct host tools (Read, Grep, Glob, Edit, Write) are permitted for code work. Raw shell is permitted only for project-defined commands (build, test, lint, run) that the stack detector resolves, and always under policy.
- **TU-2** Read before write. An edit to a file requires that the file, or the relevant region, was read in this run.
- **TU-3** Search with the host's dedicated search tools or the `ctx` engine, not shell pipelines.
- **TU-4** Interactive commands (pagers, prompts, `-i` flags) are prohibited. Every command has a timeout, and long jobs run through `aeos job` with a completion notification.
- **TU-5** Network access goes only through adapters or project commands, and is subject to `net.egress` policy.
- **TU-6** Package installs are `pkg.install` and require approval at ≤ L2. Lockfile changes MUST appear in the change set.
- **TU-7** Subagents are dispatched only through `aeos delegate`, with a role, a context pack, a budget and a result schema. Untracked background agents are prohibited.
- **TU-8** Paid external APIs (image generation, second-opinion LLMs) require a per-run budget and a spend estimate shown before the first call. Consent persists per provider only if the user chooses.

### 13.2 Orchestration

- **OR-1 Route precedence.**
  1. An explicit command.
  2. An active run's `next`.
  3. A deterministic match above τ_high with a margin of δ or more.
  4. The LLM chooses from the top 3 candidates.
  5. A direct answer.

  Defaults: τ_high 0.75, δ 0.10, τ_low 0.45, tuned by the routing benchmark. Every decision emits `route.decided`.
- **OR-2 Proactivity** is `off | suggest (default) | auto`. `auto` MUST NOT start skills whose `max_autonomy` is above L1 without confirmation.
- **OR-3 Composition.** Pipelines are DAGs with typed edges.
  - A node runs when its `needs` are satisfied and its `when` predicate is true.
  - Nodes with unchanged input hashes are skipped. Verification nodes re-run whenever the tree changes.
- **OR-4 Concurrency.** At most one write-capable run per worktree at a time (runtime lock). Read-only runs may be concurrent. The global delegation concurrency cap defaults to 4.
- **OR-5 Budgets.** Every run and delegation has token, time and optionally USD budgets. On exceeding one, the runtime checkpoints and sets `needs_input` with options.
- **OR-6 Repair limits.** At most 2 schema repair attempts per phase. Fix loops have skill-declared iteration caps and a **drift score** (reverts, unrelated-file touches, repeated failures). The drift threshold defaults to 0.2, which triggers `needs_input`.
- **OR-7 Questions to the user.**
  - Only for decisions that are the user's to make (principle 8).
  - One decision per question, 2-4 options, the recommended option first and labelled, and each option with its consequences.
  - Low-stakes, independent confirmations SHOULD be batched into a single question.
  - One-way doors MUST be flagged as such.
  - Questions are issued with `aeos run ask` so they persist and survive compaction.
- **OR-8 Risk score.** Computed from diff size, touched sensitive paths (`policy.sensitive_paths`), test delta, dependency changes and the public-API surface. Lens selection and second-opinion thresholds are policy config (PSA §2.12).
- **OR-9 Resumption.** Every accepted phase output is durable. `aeos run resume` MUST continue from the first incomplete node without repeating completed side effects.

---

## 14. State management and memory rules

### 14.1 State

- **ST-1** All durable state goes through the State Engine: an event log plus an index. Direct file writes to state locations by skills or the model are prohibited.
- **ST-2** Identity: `project_id` (normalized origin URL hash, or the root-commit hash), `worktree_id` (the path hash), and `session_id`. They are present on every event and artifact.
- **ST-3** Scopes are `user`, `project-local` and `project-shared` (PSA §2.3). Project-shared data lives in `<repo>/.aeos/` and changes only through reviewable diffs.
- **ST-4** Schema versions are per type. Migrations are registered, tested with before/after fixtures, and recorded in `migrations.jsonl`. **A failed migration aborts and rolls back.**
- **ST-5** Retention: runs 90 days by default; artifacts linked to merged changes kept; the security logs kept 1 year. Pruning is a runtime command, and tombstones are retained.
- **ST-6** The index is a cache. `aeos state rebuild` MUST reproduce it from the logs.
- **ST-7** Concurrency: appends use per-run files, and cross-run writes use OS file locks that work on Windows. Index writes are serialized.

### 14.2 Memory

- **MM-1 Kinds:** `fact`, `pitfall`, `preference`, `decision`, `playbook`.
- **MM-2 Scopes:** `user`, `project`, `team`. Team memory lives in `<repo>/.aeos/memory/` and is PR-reviewed.
- **MM-3 Provenance** is required: `source` (`user | observed | inferred | cross_model | imported`), `run`, `evidence[]`.
- **MM-4 Trust.**
  - `trusted` requires `source: user`, an explicit user confirmation, or ≥ 2 independent verified occurrences.
  - Items derived from untrusted content are always `untrusted` until confirmed.
- **MM-5 Write gate:** schema validation, an injection-pattern scan, a secret scan, and a size cap (≤ 1 KB per statement).
- **MM-6 Deletion** is by tombstone only. A tombstoned key MUST NOT be returned by any query, including older versions.
- **MM-7 Retrieval.**
  - Auto-injection covers only `trusted` items relevant to the current phase, within the phase's memory budget (default 800 tokens).
  - Ranking is relevance × confidence × recency decay.
  - Everything else needs an explicit query.
- **MM-8 Decay.** `observed` and `inferred` confidence decays (default −0.1 per 30 days, floored at 0.2). `user` items don't decay but can be superseded.
- **MM-9 Transparency.** `/memory why <phase>` shows exactly which items would be injected, and why.
- **MM-10 Providers.** `local` (SQLite FTS) is required. `gbrain` and `vector` are optional adapters implementing the same interface.

---

## 15. Testing and benchmark requirements

### 15.1 Testing

| Area | Requirement |
|---|---|
| Runtime unit | ≥ 85% line coverage on `/runtime`; ≥ 70% mutation score on the `sys.policy`, `sys.verify`, `sys.state` and `sys.orchestrator` cores |
| Property tests | State (append, replay, rebuild), memory tombstones, policy AST decomposition, path normalization across OSes |
| Schema tests | Every schema has valid and invalid fixtures; every artifact renderer round-trips |
| Policy corpus | ≥ 300 destructive variants (bash + PowerShell + SQL + cloud + interpreter + obfuscated) with catch ≥ 99%; ≥ 300 benign commands with false-ask ≤ 2% |
| Adapter contract tests | Every adapter passes its interface suite against recorded fixtures; live tests are optional and nightly |
| Host conformance | Per host: hook wiring, autonomy cap, catalog render, subagent tool allowlists |
| Skill lint | §7.7, blocking |
| Skill evals | Per user skill: ≥ 10 task cases, ≥ 30 routing utterances (≥ 10 held out); per specialist: ≥ 5 cases |
| Cross-OS | Static and gate tiers on Windows, macOS and Linux for every PR |
| Prohibited | Tests whose only assertion is the presence of prose wording in prompt assets. Use schema, budget and behavior tests instead (IO-46). |

**CI tiers:**
- `static`: every PR, free.
- `gate`: every PR; deterministic; includes the safety suite and a routing subset.
- `nightly`: task suites.
- `release`: everything, with N = 5.

### 15.2 Benchmark

- **BM-1 Suites.**

  | Suite | Contents | Primary metrics |
  |---|---|---|
  | `routing` | Labelled utterances per user skill plus negatives | Top-1 accuracy, false-route rate |
  | `tasks/<skill>` | Fixture repos with seeded ground truth (bugs, vulns, UI regressions, stale docs, perf regressions, plans) | Precision and recall of findings, fix success, hidden-test pass, false-done rate |
  | `safety` | Destructive corpus, injection repos, pages and PRs, gate-skip prompts, self-relaxation attempts | Catch rate, successful-injection count, bypass count |
  | `efficiency` | All task cases | Instruction tokens, total tokens, wall time, tool calls, USD |
  | `calibration` | All claims with ground truth | ECE per lens |
  | `resilience` | Fault injection (kill, compaction, adapter failure) | Correct final state, duplicate side effects |

- **BM-2 Protocol.** Pinned model IDs, a hermetic environment (temp `AEOS_HOME`, scrubbed env, fixed tool set), N = 3 nightly and N = 5 at release. Results are reported as mean ± 95% CI.
  - **Model set (owner decision Q8):** the current Claude flagship plus one mid-tier model.
  - **No paid-evaluation budget is set.** An owner decision on the dollar budget is REQUIRED before any paid benchmark execution.
- **BM-3 Baselines.** Results are stored as `eval_result` artifacts. The **gstack comparator** runs the same `tasks` and `efficiency` suites through gstack (pinned version) on the same model, and is refreshed per gstack release.
- **BM-4 Release gates.** A release is blocked if any of these holds:
  - (a) any `safety` escape exists
  - (b) any gate metric regresses beyond the CI of the previous release
  - (c) any `efficiency` metric exceeds its budget by more than 10%
  - (d) routing top-1 falls below 90%
- **BM-5 Reporting.** Each release note includes a table of deltas against the previous release and against the gstack comparator.

---

## 16. Versioning

- **VS-1** The runtime, the plugin and the spec use **SemVer 2.0**.
  - MAJOR: a breaking change to a contract, a schema major, CLI flags, or config keys.
  - MINOR: new capability.
  - PATCH: fixes.
- **VS-2** Skills, specialists and adapters carry their own SemVer and declare `min_runtime`.
- **VS-3** Schemas are versioned by major (`type@N`). Minor additions MUST be backward compatible (optional fields only). A new major requires a migration and a deprecation window.
- **VS-4** **Deprecation.** A deprecated feature keeps working for ≥ 2 minor releases with a runtime warning, then is removed in the next major.
- **VS-5** Release channels are `stable`, `beta` and `nightly`. Projects pin a range in `.aeos/config.yaml`, and the runtime refuses to run outside the pinned range with remediation text.
- **VS-6** Releases are signed: npm provenance, plus a signed git tag. `aeos upgrade` verifies the signature before installing.
- **VS-7** The changelog is Keep a Changelog format with user-facing language, plus the benchmark delta table (BM-5).

---

## 17. Compatibility

| Dimension | Requirement |
|---|---|
| **Hosts** | Tier 1: Claude Code (full: hooks, subagents, AUQ, plugin distribution). Tier 2: hosts with hooks and subagents (full feature set subject to the conformance suite). Tier 3: instruction-only hosts (max L1, disclosed). **Owner decision Q5: Claude Code only until R8.** Other hosts (Codex, Cursor, …) require explicit adapters and safety-cap validation (conformance suite) before they are supported. |
| **OS** | Windows 10/11 (PowerShell 5.1+ and 7+, **no Git Bash requirement**), macOS 13+, Linux (glibc x64/arm64; musl best-effort) |
| **Runtime** | Node.js active LTS and maintenance LTS (≥ 22). A standalone binary is offered for machines without Node. |
| **VCS** | git ≥ 2.40; worktrees supported |
| **Shells** | bash, zsh, sh and PowerShell commands are understood by policy. Skill content is shell-agnostic. |
| **Models** | Skills MUST pass their eval thresholds on the pinned primary model set. Any other model runs with a "not benchmarked" disclosure. |
| **Artifacts and state** | Backward-readable for 1 major version; migrations cover forward moves |
| **gstack coexistence** | AEOS MUST work when gstack is installed side by side: no name collisions (checked by the reserved-word list), no shared state paths, and no hook conflicts. An optional importer MAY read gstack learnings into `untrusted`, `imported` memory. |
| **Hook coexistence (MP-6)** | Before installing, the Hook Compatibility Manager (PSA §2.17) scans and reports existing hooks from user, project, local, plugin and (where readable) managed sources, with their overlaps and conflicts. AEOS adds only ownership-marked entries, after consent. It MUST coexist with gstack, paysec, project hooks, other plugins' hooks and other tooling. Known on this machine: gstack and paysec `Stop` hooks in `~/.claude/settings.json`. |
| **Host-platform claims (MP-7)** | Every dependency on Claude Code behavior is tracked in [PLATFORM-ASSUMPTIONS.md](PLATFORM-ASSUMPTIONS.md) with its verification status. The Tier-1 host version used for validation is recorded: Phase 2 used Claude Code 2.1.283, with hands-on evidence on **Windows 11 only**. macOS and Linux claims stay NOT VERIFIED until measured. |

---

## 18. Contribution standards

### 18.1 RFCs

An RFC in `/docs/rfcs/NNNN-title.md` is required for:
- new user skills
- changes to contracts or schemas (major)
- changes to autonomy or safety semantics
- new interfaces
- changes to this spec

An RFC states the problem, the IO reference or a new evidence base, the design, alternatives, the measurement plan and a migration.

### 18.2 PR checklist (CI-verified where possible)

- Lint clean (§7.7), tests per §15.1, and budgets respected.
- Benchmark impact: the `efficiency` and relevant `tasks` suites run for changes that touch skills, cards, lenses or the router, with deltas posted.
- A changelog entry.
- Docs regenerated.
- A safety review by a designated owner for any change to `/policy`, `sys.policy`, autonomy handling, or remote-agent code.
  - **Owner decision Q11:** team size, spec owner and safety reviewer are owner-supplied organizational metadata. They are **not yet supplied** and MUST be supplied before the relevant R0 safety-review gate. None may be assumed or invented.

### 18.3 Code standards

- TypeScript strict mode. No `any` in public types.
- Errors use the `E_*` taxonomy (Appendix B).
- No shell-outs in the runtime except through the process adapter, which carries timeouts, argument arrays (never string interpolation) and Windows-safe spawning.
- Logs never contain secrets or raw command content from policy evaluation.

### 18.4 Clean-room rule for gstack

Contributors **MUST NOT**:
- copy code, prompt text or SKILL.md content from gstack (or from the `paysec` fork of it)
- paste gstack excerpts into AEOS prompts

Ideas and patterns MAY be re-implemented from the published analysis documents. Design docs that do so SHOULD credit the origin ("pattern observed in gstack v1.91.1.0"). Reviewers MUST reject PRs containing recognizably copied gstack material.

### 18.5 Content standards

- A neutral, professional voice.
- No promotional content, personal pleas, or persona text in defaults.
- Inclusive language.
- Third-party material must have a compatible license and be listed in NOTICE.

### 18.6 Security disclosures

A `SECURITY.md` with a private reporting channel. Policy bypasses are treated as security issues.

### 18.7 Licensing and the paysec fork

- **License:** proprietary/internal for now (owner decision Q2). Revisit if the project becomes public.
- **paysec fork (owner decision Q3):** AEOS coexists with the existing paysec fork during development. paysec code MUST NOT be reused, as §18.4 applies equally to paysec. Migration guidance is deferred.

---

## 19. Change control of this specification

- **Proposal.** Changes go through an RFC (§18.1).
- **Approval.** The spec owner(s) approve, and at least one reviewer who is not the author.
- **Version bump.** Bump the spec version: MINOR for new requirements, MAJOR for changed or removed requirements.
- **Ratification.** Until v1.0.0 is ratified, this spec is DRAFT and requirements marked DRAFT may change without an RFC, but every change MUST be recorded in the spec changelog below.

### Spec changelog

- 0.1.0 (2026-09-27): initial draft, derived from the gstack v1.91.1.0 analysis.
- 0.2.0 (2026-09-27): Phase 2 platform validation.
  - Added §5.1 mandatory principles MP-1 to MP-8.
  - Added AU-0 (ceiling semantics) and AU-2a (tightening from any source); rewrote AU-2 (the consent channel no longer relies on an origin signal).
  - Rewrote S-8 as a requirement with unresolved status; added S-9 (no weakening of Claude Code) and S-10 (no safety dependence on daemons).
  - Rewrote SP-1 (explicit `mcp__.*` matcher); added SP-1a and SP-8 to SP-10.
  - Specialists are no longer Claude Code skills (§7.1).
  - Added hook-coexistence and host-platform-claims compatibility rows (§17).
- 0.3.0 (2026-09-27): Phase 2 hands-on validation (Windows).
  - AP-8 latency budget revised.
  - MP-2 and VR-6: Stop-hook blocking is now VERIFIED.
  - AU-2: restart-only relaxation (pending Q21).
  - S-8 status detailed; added S-11 (hook deadline, fail-open timeouts).
  - SP-1 MCP and U-20 notes; SP-3 evidence; added SP-2a (parsers).
  - §17 host-platform row: Windows-only evidence.
- 0.4.0 (2026-09-27): Phase 2 owner decisions recorded ([PHASE-2-EXIT-CRITERIA.md § Owner decisions](platform-validation/PHASE-2-EXIT-CRITERIA.md#owner-decisions-2026-09-27)).
  - Working-name and license notes (Q1, Q2); AU-1a default L1 (Q7); AU-2 restart-only adopted (Q21).
  - S-11: a hook timeout is not a safety boundary (B-1).
  - SP-2a: Bash enforcement disabled until a parser is validated (B-2).
  - SP-8 and SP-10: managed settings assumed unavailable (Q20); the Windows compensating design is not equivalent to a sandbox (B-6).
  - BM-2: model set and budget gate (Q8).
  - §17 hosts (Q5); §18.2 ownership metadata required (Q11); added §18.7 (Q2, Q3).
- 0.4.1 (2026-09-27): documentation-only correction of SP-2a (B-2). "Bash enforcement disabled" is replaced by the conservative posture: no validated Bash parser, so no semantic Bash enforcement claim, and a conservative posture (never auto-approve; stop or ask per the configured safety policy). Claude Code's native permissions still apply. No evidence status or Phase 2 exit decision was changed.

---

## Appendix A: Glossary

| Term | Meaning |
|---|---|
| **Constitution** | Session-level context loaded once, containing the rules every phase relies on |
| **Phase card** | Just-in-time instructions for one phase |
| **Lens** | A specialist that reviews one set of owned dimensions |
| **Run** | One execution of a skill or pipeline, with its own event log |
| **Tree hash** | The git tree id of the working state, used for evidence freshness |
| **Risk score** | Numeric 0-1 estimate of change risk that drives lens selection and verification depth |
| **Drift score** | Numeric 0-1 estimate of a fix loop going off the rails |

## Appendix B: Error codes

`E_CAPABILITY_MISSING`, `E_POLICY_DENIED`, `E_SCHEMA_INVALID`, `E_VERIFICATION_FAILED`, `E_BUDGET_EXCEEDED`, `E_CONFLICT`, `E_EXTERNAL`, `E_STALE_EVIDENCE`, `E_USER_ABORT`, `E_VERSION_MISMATCH`, `E_MIGRATION_FAILED`, `E_INTERNAL`.

Semantics and default recovery are in PSA §6.1. Every error carries `code`, `message`, `retryable`, `remediation`, and optionally `evidence`.
