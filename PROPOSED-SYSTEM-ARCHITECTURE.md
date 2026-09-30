# Proposed System Architecture

> **Working name:** **AEOS**, short for AI Engineering Operating System. It is the working name for R0/R1 specification work (owner decision Q1, 2026-09-27); the final name is a pre-release decision ([ROADMAP.md](ROADMAP.md#open-questions)).
> **Status:** Design proposal, version 0.3. Revised after Phase 2 documentation validation and after the **hands-on validation of 2026-09-27** on Windows 11 with Claude Code 2.1.283 (evidence: `platform-validation/HANDS-ON-VALIDATION-REPORT.md`, experiments E-00 to E-17). Nothing here is implemented.
> **Authority:** [MASTER-SPEC.md](MASTER-SPEC.md) is normative. This document explains the design behind it. Where the two disagree, MASTER-SPEC wins.
> **Evidence base:**
> - gstack analysis: [GSTACK-ARCHITECTURE-ANALYSIS.md](GSTACK-ARCHITECTURE-ANALYSIS.md), [GSTACK-CAPABILITY-MATRIX.md](GSTACK-CAPABILITY-MATRIX.md), [IMPROVEMENT-OPPORTUNITIES.md](IMPROVEMENT-OPPORTUNITIES.md). "IO-nn" tags refer to IMPROVEMENT-OPPORTUNITIES entries.
> - Platform evidence: the Phase 2 validation in [ROADMAP.md § Phase 2](ROADMAP.md#phase-2-claude-code-platform-capability-validation), [platform-validation/ARCHITECTURAL-DECISIONS.md](platform-validation/ARCHITECTURAL-DECISIONS.md) ("AD-nn"), and [PLATFORM-ASSUMPTIONS.md](PLATFORM-ASSUMPTIONS.md).
> - Claims about Claude Code behavior carry their validation status: **VERIFIED**, **PARTIALLY VERIFIED**, **NOT VERIFIED** or **NOT AVAILABLE**.

---

## 1. The central design decision

gstack has **no orchestrator process**. Its workflows, gates and completion rules are prose that the model is asked to follow, and bash scripts supply facts in `KEY: value` form. Every major gstack weakness comes from this:

- Gates are unenforced.
- The whole workflow is loaded up front, at great token cost.
- Artifacts are found by glob.
- Skills are duplicated because composition by prose is hard.

**AEOS moves control flow into code.** The model still does the reasoning, and a small deterministic runtime owns the rest:

1. **Phase sequencing.** The runtime issues the next phase's instructions only after the current phase's outputs validate.
2. **Contracts.** Every skill input and output is a typed, schema-validated artifact.
3. **Gates.** Safety, verification and approval checks are code evaluated by host hooks, not paragraphs.
4. **Ledgers.** State, evidence and memory are one event-sourced store with a query API.

The model receives **small, just-in-time instructions** instead of one monolithic SKILL.md. This is the pattern gstack already proved in its best components (skill-start STATUS lines, the evidence ledger, the autoplan snapshots, the cso contracts), applied everywhere.

### 1.1 Platform constraints established by Phase 2

Phase 2 validated which Claude Code mechanisms AEOS can rely on. The principles below are **binding on every section of this document**. Their normative form is MASTER-SPEC §5.1, and the evidence for each is recorded in ARCHITECTURAL-DECISIONS (AD-nn).

| # | Principle | What it means for the design | Basis |
|---|---|---|---|
| A | **The runtime is the source of truth.** | The model *proposes* actions. AEOS *validates* policy, permissions, state, evidence and completion. Run status is computed by the runtime, never taken from the model. | Hooks can observe and block tool calls (VERIFIED); Claude Code has no runtime-state API (VERIFIED). AD-01 |
| B | **AEOS is a restriction and verification layer.** | AEOS never weakens Claude Code's native or managed security controls. It adds restrictions and verification on top of them. | "allow" cannot override stronger deny/ask rules (VERIFIED). AD-01, AD-02 |
| C | **Autonomy is a ceiling.** | AEOS levels can only restrict. They never grant what Claude Code settings or organizational policy would deny, and AEOS never uses a hook decision to skip a native prompt. | Autonomy levels VERIFIED (as a ceiling only). AD-02 |
| D | **No hidden-skill dependency.** | Critical internal mechanisms are runtime-served instructions, controlled subagents or runtime code, never "hidden" Claude Code skills. | Hidden/internal skills PARTIALLY VERIFIED: nothing hides a skill from both model and user while allowing runtime invocation. AD-04 |
| E | **Global enforcement for plugin agents.** | Where plugin agents can't carry their own hooks or permissions, global AEOS hooks enforce role policy using `agent_id` and `agent_type`. | Subagent tool restriction VERIFIED; plugin agents have hooks/permissionMode/mcpServers limitations. AD-05 |
| F | **AEOS owns its state.** | A persistent state layer maintained by AEOS (§2.3). Claude Code is not assumed to provide one. | Persistent state VERIFIED only via files AEOS manages. AD-03 |
| G | **Defense in depth.** | Five layers, none trusted alone: (1) Claude Code permission rules, (2) AEOS PreToolUse enforcement, (3) filesystem/sandbox controls, (4) managed settings where the organization deploys them, (5) protected AEOS state and signing material. | Safety-config protection PARTIALLY VERIFIED. AD-06 |
| H | **User authority is an unresolved boundary.** | AEOS does **not** claim to perfectly distinguish user-originated from model-generated instructions. No critical guarantee depends on an unverified origin signal (§2.6). | User-vs-model attribution PARTIALLY VERIFIED. AD-10 |
| I | **Hook coexistence.** | A Hook Compatibility Manager (§2.17) detects, classifies and reports existing hooks, and never overwrites them silently. This machine already has gstack and paysec Stop hooks. | Observed in `~/.claude/settings.json`. AD-07 |
| J | **MCP interception by explicit matcher.** | Explicit `mcp__.*` interception is VERIFIED and is what AEOS registers. Hands-on, `"*"` also caught tools from a local stdio MCP server, but plugin and remote MCP servers are untested, so `"*"` is a second line, not the declared coverage. | AD-08 |
| K | **Managed process lifecycle.** | Any detached process AEOS starts gets startup, health check, idle timeout, cleanup, crash recovery and orphan detection (§2.18). Claude Code does not manage detached processes. | Long-lived processes PARTIALLY VERIFIED. AD-09 |

```
                 ┌──────────────────────────── HOST (Claude Code) ────────────────────────────┐
 user ──prompt──►│  catalog (tiny)   SKILL.md stub (≤60 lines)   subagents   hooks            │
                 └───────┬───────────────┬───────────────────────────┬───────────┬────────────┘
                         │ aeos route    │ aeos run/step (JSON)      │ Agent     │ PreToolUse/
                         ▼               ▼                           ▼           │ Stop/SessionStart
 ┌──────────────────────────────────── AEOS CORE RUNTIME (Node LTS, TypeScript) ─▼────────────┐
 │  Router ── Orchestrator (run state machine) ── Composer (DAG) ── Delegation manager         │
 │     │            │                 │                  │                                     │
 │  Skill Registry  Context Engine    Verification Eng.  Safety Engine (policy, AST, trust)    │
 │     │            │                 │                  │                                     │
 │  Artifact Engine ─ State Engine (event log + index) ─ Evidence Engine ─ Memory Engine       │
 │                                    │                                                        │
 │  Tool Abstraction Layer ── Adapters: vcs · forge · tracker · ci · deploy · browser ·        │
 │                           llm · imagegen · sandbox · observability · memory · device        │
 │  Eval/Benchmark harness            Installer/Updater/Doctor          Telemetry (opt-in)     │
 └─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Module design

Each module has four parts: its responsibility, its interface, how it fixes a gstack limitation, and its boundaries.

### 2.1 Core runtime

- **Runtime:** a single runtime, **Node.js LTS (≥22)**, with TypeScript compiled to one distributable.
  - Rationale: gstack needs Bun for skills, Node for its Windows browser daemon, and bash plus python3 or node for hooks. That is three runtimes and a Git-Bash dependency on Windows (IO-43).
- **CLI:** `aeos`. Every subcommand takes `--json` and returns a versioned envelope:
  ```json
  {"v":1,"ok":true,"data":{...},"warnings":[],"error":null}
  ```
- **No shell syntax in skill prose.** Skill prose invokes `aeos …` only, never `bash`, `jq`, `sed` or platform utilities. All OS-specific logic lives in the runtime, which fixes the Windows gaps in IO-43.
- **Subsystems:** `run` (the orchestrator), `route`, `artifact`, `state`, `evidence`, `verify`, `policy`, `memory`, `ctx`, `adapter`, `eval`, `doctor`, `setup`, `upgrade`, `config`.
- **Optional MCP façade.** `aeos mcp serve` exposes a small, fixed tool set: `aeos_run_step`, `aeos_artifact_get`, `aeos_artifact_put`, `aeos_evidence_record`, `aeos_memory_query`. With it the host gets schema-typed calls instead of CLI text. The CLI remains the canonical interface. Whether MCP is on by default is Open Question Q4.
- **Performance budget:**
  - `aeos` cold start under 150 ms (p95) for state and policy commands, which run on every hook.
  - **Hook latency budget (AD-12, revised from p95 < 50 ms after hands-on measurement):** ≤ 150 ms median and ≤ 250 ms p95 per hook call on Windows, with AEOS logic under 10 ms. Measured on Windows: median 120-131 ms and p95 129-234 ms, of which about 95 ms is process spawn and harness overhead AEOS can't remove. macOS and Linux are not measured.
  - Hooks are Node processes declared with `command`+`args`. PowerShell hooks (about 1.3 s) and shell-string hooks (0.7-1.4 s late start) are excluded.
  - **A timed-out hook is cancelled and the tool call proceeds (fail-open, VERIFIED on Windows).** Every AEOS hook therefore enforces an internal deadline well below its configured timeout and returns `deny` or `ask` itself on overrun.
  - The optional daemon is a detached process under the Process Lifecycle Manager (§2.18). The policy decision MUST NOT depend on the daemon being alive: if it is absent or unhealthy, the in-process evaluator runs and fails closed.

### 2.2 Context engine

Replaces gstack's 400-line per-skill preamble (IO-39, IO-40).

| Layer | Loaded when | Size budget | Content |
|---|---|---|---|
| **Constitution** | Once per session, from the SessionStart hook `additionalContext`. VERIFIED hands-on: delivered at startup, re-delivered after compaction (`source: compact`), clean per new session (AD-11). | ≤ 1,200 tokens **and ≤ 9,000 characters**. Larger content is silently truncated. | Autonomy level, safety summary, the completion protocol, the AUQ format, how to call `aeos` |
| **Skill stub** | On skill invocation (`SKILL.md`) | ≤ 60 lines / 800 tokens | Purpose, when-not-to-use, the `aeos run start` call, the escape hatch |
| **Phase card** | Per phase, returned by `aeos run next` | ≤ 1,500 tokens | Instructions for this phase only, the output schema, the gates |
| **Reference pack** | On demand (`aeos ctx ref <id>`) | Per-pack budget | Checklists, rubrics, taxonomies (e.g. the review checklist) |
| **Context pack** | For subagents (`aeos ctx pack`) | Explicit budget | A curated slice: the diff, relevant files, prior findings, memory hits |

**Features:**
- **Budgets and measurement.** Every card and pack declares a token budget. The eval harness measures actual tokens per run (IO-40), and CI fails if a card exceeds its budget by more than 10%.
- **Repo map.** `aeos ctx map` builds a cached structural summary (files, symbols, ownership, churn) through the code-intelligence adapter (grep fallback; gbrain, Sourcebot or LSP as providers).
- **Compaction resilience.** Run state lives in the State Engine, not in the conversation, so it survives compaction regardless of hooks (IO-19).
  - **Primary path:** after `/compact`, SessionStart fires again with `source: compact` (VERIFIED hands-on). AEOS re-issues the constitution and `aeos run status` there (current run, phase, outstanding gates, last outputs).
  - **Always-available fallback:** every phase card starts by calling `aeos run status`, so the model re-reads its position from the runtime at each phase boundary even without injection.
- **Untrusted content labeling.** Web pages, PR bodies, issue text and third-party files reach the model wrapped in a trust envelope with a per-session nonce. The model is told that envelope content is data, never instructions. This generalizes gstack's `tracker-guard` and browser envelope to **all** external content, including the local agent's browser reads (IO-12).

### 2.3 State engine

One event-sourced store replaces gstack's 20+ ad-hoc files (IO-22).

- **Event log:** append-only JSONL, one file per run: `~/.aeos/state/<project-id>/runs/<run-id>.jsonl`.
- **Envelope:** each event has the same header:
  ```json
  {"v":1,"ts":"…","run":"…","seq":42,"type":"phase.completed","actor":"skill:review@1.3.0","data":{…},"prev":"sha256:…"}
  ```
  The `prev` field is a hash chain that makes tampering evident.
- **Index:** a SQLite database (`node:sqlite`, rebuildable from the logs) for queries: open runs, latest artifact of a type, evidence for a tree hash.
- **Identity:**
  - `project-id` = hash of (normalized origin URL, or the root commit if there is no remote).
  - `worktree-id` = hash of the absolute worktree path.
  - `session-id` = supplied by the host, or generated.
  - Every state row carries all three, so parallel worktrees and sessions never collide. gstack's global `freeze-dir.txt` and shared checkpoint directory fail this (IO-23).
- **Scopes:**

  | Scope | Location | Shared how |
  |---|---|---|
  | `user` | `~/.aeos/` | Personal |
  | `project-local` | `~/.aeos/state/<project-id>/` | Personal, per project |
  | `project-shared` | `<repo>/.aeos/`, committed | Team-shared config, memory, and artifact exports reviewed through PRs |

- **Schema versioning:** every event and artifact type has a `v`. Migrations are registered per type and recorded in `migrations.jsonl` (IO-46).
- **Retention:** configurable (default: runs kept 90 days; artifacts linked to merged work kept indefinitely). Pruning is a runtime command, never an LLM rewrite of files. gstack's `/learn prune` has the LLM rewrite JSONL (IO-20).
- **Ownership (principle F, AD-03).**
  - Claude Code offers no general runtime-state API. Hooks are separate processes per event (VERIFIED). So **all** cross-call state is AEOS-managed files.
  - Correlation keys come from hook input: `session_id`, `prompt_id`, `agent_id`, `transcript_path` (VERIFIED).
  - `CLAUDE_PLUGIN_DATA` is VERIFIED persistent plugin storage and is a candidate location for plugin-scoped data. Where state lives is decided by the runtime's own path resolver, never assumed from the host.
  - `transcript_path` MAY be read for diagnostics. It MUST NOT be treated as an authoritative state store, because its format is host-internal.
- **Protection of AEOS state (principle G, AD-06).** AEOS state holds policy decisions, consents, guard levels and evidence. The model must not be able to forge or tamper with it. **Claude Code's built-in protected paths do not cover AEOS-owned locations** (PARTIALLY VERIFIED), so AEOS adds:
  1. Claude Code deny rules for `Edit`/`Write` on AEOS state and policy paths, proposed through the Hook Compatibility Manager's report and never applied silently (§2.17).
  2. PreToolUse denies on any tool call targeting those paths, including shell writes detected by command parsing.
  3. Sandbox filesystem restrictions for shell tools, which catch writes that command parsing misses.
  4. Managed-settings placement of the deny rules where the organization supports it.
  5. **Integrity:**
     - security-relevant records (consents, guard changes, policy overrides) are hash-chained and signed
     - the signing key sits in a location covered by all of the controls above
     - on any integrity failure the runtime fails closed to the most restrictive level

  Whether a model can bypass these layers through indirect shell execution is **PARTIALLY VERIFIED** and remains a validation item (PLATFORM-ASSUMPTIONS U-08).

### 2.4 Evidence engine

This generalizes two gstack mechanisms, the `/ship` evidence ledger and the `/cso` evidence model, to every skill (IO-24).

- **Evidence record:**
  ```ts
  type Evidence = {
    id: string;                 // ev_…
    kind: 'command' | 'test' | 'file_citation' | 'screenshot' | 'http_probe'
        | 'browser_trace' | 'metric' | 'external_ref' | 'human_confirmation';
    tree: string;               // git tree hash (or 'dirty:<sha256 of diff>') at capture time
    captured_at: string;
    producer: string;           // skill@version / adapter
    data: {...};                // kind-specific; e.g. command: {argv, exit, duration_ms, stdout_sha256, stdout_excerpt}
    redacted: boolean;          // passed secret scan
  };
  ```
- **Claims** reference evidence. Every finding and every completion statement is a `Claim`:
  ```ts
  type Claim = {
    id: string; statement: string;
    status: 'verified' | 'supported' | 'hypothesis' | 'refuted' | 'unverifiable';
    severity?: 'critical'|'high'|'medium'|'low'|'info';
    confidence: number;         // 0..1, calibrated (see eval)
    evidence: string[];         // ev_ ids; 'verified' requires ≥1 deterministic evidence on current tree
    location?: {path: string; line?: number; sha256?: string};
  };
  ```
- **Freshness is by content, not time.** Evidence is fresh when its `tree` equals the current tree hash. gstack's `--max-age 24` hours is time-based, so a changed tree can still count as fresh.
- **Citations are checked.** `file_citation` evidence stores the cited line's hash. The verifier fails a claim whose cited line no longer matches, which catches hallucinated `file:line` references.

### 2.5 Verification engine

Deterministic checks that gate completion (IO-25, IO-26).

- **Verifier registry.** Each verifier declares `{id, applies_to (artifact type or claim kind), run(ctx) → Evidence, cost_class}`.
- **Built-in verifiers:**

  | Group | Verifiers |
  |---|---|
  | Code | `tests.pass`, `tests.new_fail_before_fix` (a regression test must fail on the pre-fix tree and pass on the post-fix tree), `build.pass`, `typecheck.pass`, `lint.pass` |
  | Artifacts and docs | `schema.valid`, `citations.resolve`, `docs.snippets_run`, `docs.links_ok` |
  | Browser and QA | `browser.assertion`, `a11y.axe` |
  | Deploy | `deploy.sha_live`, `http.health` |
  | Release | `pr.body_matches_diff`, `changelog.entry_present` |

- **Definition of Done.** Each skill manifest declares the verifiers that must pass for `status: done`. The orchestrator computes the status and **the model cannot self-declare `done`**:
  - `done` needs every required verifier to pass on the current tree.
  - `done_with_concerns` needs every required verifier to pass while some optional ones fail.
  - Otherwise the status is `blocked` or `failed`.
- **Stop-hook enforcement.** If the session tries to end while a run claims completion without verification records, the Stop hook blocks and returns the missing verifiers. This generalizes gstack's `gstack-verify-gate` (IO-25).
  - Stop-hook blocking is VERIFIED hands-on (PLATFORM-ASSUMPTIONS U-12): honored alongside gstack- and paysec-shaped Stop hooks and a failing one. The gate must honor `stop_hook_active`.
  - The computed-status rule above does not depend on it.
  - The Stop gate must coexist with the existing gstack and paysec Stop hooks (§2.17).
- **Independent verification.** For claims with severity high or above, policy can require an **independent verifier agent**: a read-only subagent with a fresh context pack that did not produce the claim. This is gstack's "outside voice" made systematic and budgeted (IO-04).

### 2.6 Safety engine

Replaces opt-in `/careful`, `/freeze` and `/guard` with **always-on, tool-agnostic policy** (IO-27 to IO-31).

**Enforcement point** (principles A, B, J; AD-01, AD-08). AEOS registers PreToolUse hook entries with two matchers:
- A match-all matcher (`"*"`) covering built-in tools: Bash, PowerShell, Write, Edit, NotebookEdit, WebFetch, Agent and Skill. Interception is VERIFIED, including calls inside subagents, which carry `agent_id` and `agent_type`.
  - Hands-on, this covered every tool call that **reached execution**.
  - Calls rejected earlier by Claude Code's validation or deny rules never reach PreToolUse (U-20). The audit trail therefore records executed and hook-decided calls, not every attempt.
- A separate **explicit `mcp__.*` matcher** for MCP tools (VERIFIED hands-on: visibility, deny, `updatedInput`). `"*"` also caught local stdio MCP tools hands-on, but it is not the declared coverage for untested plugin and remote MCP servers.

`EndConversation` bypasses PreToolUse (VERIFIED). It has no side effects AEOS needs to gate, and this exception is documented rather than worked around.

**Decision vocabulary (principles B, C; AD-02).** The AEOS policy hook returns only:

| Return | Meaning |
|---|---|
| `deny`, with reason and rule id | Blocks the call, and the model sees the reason. Blocking is VERIFIED. Exit code 2 is used for fail-closed error paths. |
| `ask` | Forces a user prompt even where Claude Code would not prompt, for example in `auto` mode. |
| No decision (defer) | Claude Code's own permission flow decides as if AEOS were absent. |

- The policy engine **never returns `allow`**. `allow` can skip a native permission prompt, which would make Claude Code *less* restrictive. That contradicts principle C, even though `allow` cannot override stronger deny or ask rules (VERIFIED).
- **`updatedInput`** (VERIFIED: it modifies tool input) is used only for **narrowing normalizations** that cannot widen what the call does. Examples: canonicalizing a path already inside scope, or adding a dry-run flag the user's policy requires. Each rewrite is logged as a policy event, and a rewrite the engine cannot prove is narrowing is not made (the call gets `ask` instead).
- **Claude Code's permission modes still apply.** On Claude Code 2.1.283, `auto` is the default starting mode, and in it a classifier may approve routine actions. AEOS's `deny`/`ask` run before that approval and are the stricter layer. AEOS cannot, and does not try to, loosen `default`, `plan` or managed restrictions.

**Command understanding.** Shell commands are parsed into an AST (a POSIX parser for bash, a PowerShell parser for pwsh), not matched with regexes. Phase 2 confirmed that Claude Code's own command-pattern rules miss common forms: a `Bash(curl *)` rule doesn't match `sh -c "curl …"` or a full path, and Edit rules cover `>` redirects and `tee` but not `cp` or interpreter writes. Parsing therefore does not stand alone.

Hands-on results (AD-13):
- String matching scored 7/27 (POSIX) and 5/17 (PowerShell).
- The built-in PowerShell AST scored 14/17. Its remaining failures are dynamic constructs, which are classified `opaque` and get `ask`.
- PowerShell parsing runs in a long-lived helper under §2.18 (about 1 s process start, about 36 ms per parse), with a fail-closed in-process fallback.
- A bash/POSIX parser is **not yet validated**, so Bash-tool enforcement is gated on it.
- Claude Code's own PowerShell analysis (it refuses nested `powershell -Command` and gates `cmd /c` segments) is an additional native layer.
- **An interpreter one-liner (`node -e`) bypassed deny rules hands-on**, so interpreter `-e`/`-c` is `opaque-exec`.
- Sandbox controls (layer 3) are used where available; they were NOT AVAILABLE on Windows hands-on.
- Compound commands (`&&`, `;`, pipes, subshells, `xargs`, `find -exec`) are decomposed into their parts.
- Interpreter one-liners (`python -c`, `node -e`, `ruby -e`, `perl -e`) are flagged as `opaque-exec`, which is `ask` at the `standard` guard level and above.
- **Action classes:**

  | Class | Examples |
  |---|---|
  | `fs.delete` | rm, del, Remove-Item, find -delete, git clean |
  | `fs.write.outside_scope` | Any write outside the run's scope |
  | `vcs.rewrite` | reset --hard, rebase, force-push, branch -D, filter-repo |
  | `vcs.publish` | push, tag push |
  | `forge.publish` | PR/issue create or edit, comments, merge |
  | `deploy` | Deploy CLIs, kubectl apply/delete, terraform apply/destroy, helm |
  | `data.destructive` | DROP, TRUNCATE, DELETE without WHERE, migrations down |
  | `cloud.destructive` | aws/gcloud/az delete, s3 rm --recursive |
  | `secrets.read` | .env, key files, credential stores |
  | `net.egress` | curl/wget to non-allowlisted hosts; MCP send-type tools |
  | `pkg.install` | npm/pnpm/pip/cargo add and install |
  | `system` | sudo, chmod -R, mkfs, dd |

**Autonomy levels.** Defined normatively in MASTER-SPEC §11. Summary:

| Level | Name | May do without asking | Always asks | Denied |
|---|---|---|---|---|
| L0 | Advise | Read, analyze | Any write | Publish, deploy, destructive |
| L1 | Assist | Edit the working tree inside the scope | Commits, pkg.install, net.egress | Publish, deploy, vcs.rewrite, destructive |
| L2 | Commit | L1 + local commits and branches | vcs.publish, pkg.install | Deploy, vcs.rewrite on shared branches, destructive |
| L3 | Publish | L2 + push a feature branch, draft PR | Merge, forge comments, deploy | Force-push to default, destructive data/cloud |
| L4 | Operate | L3 + merge and deploy **after** the gates pass | Rollback, production data changes | Everything policy marks `never` |

**Scope boundaries.** A run can carry `scope.write_roots` (for example `/debug` locks to the implicated directory). The boundary is **session-keyed**, applies to *all* write-capable tools including Bash writes detected through the AST, and expires with the run. Contrast gstack's global, persistent `freeze-dir.txt` (IO-29).

**Autonomy levels are ceilings (principle C, AD-02).** The effective behavior of any tool call is the **most restrictive** of three things:
1. Claude Code's permission mode and rules, including managed settings.
2. The AEOS autonomy level.
3. The AEOS guard level and scope.

An AEOS level can make a session stricter than Claude Code would be. It can never make it looser. The table above describes what AEOS *permits to proceed to Claude Code's own permission flow*, not what AEOS approves.

**Relaxing the guard: restart-only (principle H, AD-10; adopted for R2 by owner decision Q21, 2026-09-27).** Hands-on, a session-frozen autonomy level denied writes even after an out-of-band raise, and a new session picked up the new level. The restart row below is the evidenced mechanism.

The background is kept as the record:
- **Goal.** Lowering a guard, widening a scope, or raising autonomy should be possible only for the user, never for the model. gstack fails this, because its model can run `/unfreeze` itself (IO-30).
- **What Phase 2 showed.** UserPromptSubmit exists, but tool calls carry no guaranteed field identifying whether an instruction came from the user. Several prompt sources (scheduled and loop prompts, cross-session messages, subagent prompts) are untested. User-vs-model attribution is **PARTIALLY VERIFIED**.
- **Design consequences.**
  - **Tightening is always allowed** from any source: model, user, project config.
  - **Relaxation is never granted on the basis of an origin signal alone.** Candidate mechanisms, none yet validated:

    | Candidate | How it works | Status |
    |---|---|---|
    | Out-of-band confirmation | The user runs a relaxation command in a separate terminal outside the Claude Code tool loop, and it requires an interactive confirmation code | Candidate |
    | Signed relaxation record | The record is signed with material the model cannot read (layer 5) | Candidate |
    | Session restart | The relaxation takes effect only on a new session started with explicit config | **Mechanism VERIFIED hands-on (E-10). Adopted for R2 (Q21).** |

  - Within a session, the policy engine denies tool calls that invoke AEOS relaxation commands or write relaxation state.
  - The constitution and `/guard` state plainly that **user-only relaxation is not yet a verified guarantee**.
  - Every relaxation is logged with its channel.
- **Remaining validation:** PLATFORM-ASSUMPTIONS U-02 and U-08.

**Trust and content safety:**
- **Memory write gate.** Writes into memory or artifacts that derive from untrusted content are tagged `trust: untrusted` and quarantined from auto-injection.
- **Secret scanning at every sink:** forge posts, memory writes, telemetry and LLM second-opinion calls. This keeps gstack's 3-tier redaction model.
- **Egress receipts.** Every off-machine send is receipted in the hash-chained log, as in gstack.

**Degradation on hosts without hooks.** The adapter declares `capabilities.hooks=false`, and the runtime then **lowers the maximum autonomy to L1** and states so. gstack silently degrades its hooks to prose (IO-31).

**Hooks disabled at run time.** Phase 2 found that hooks can be turned off for a run through explicit settings (`disableAllHooks`). AEOS cannot prevent a *user* from doing this, and it doesn't try to. But:
- The runtime detects the absence of its hooks: a heartbeat written by the hooks, compared with runtime calls that the phase cards make. It then treats the session as hookless: max L1, verification-only, and a visible warning. Detection is **VERIFIED hands-on** (E-12): a nonce heartbeat distinguished active hooks from `disableAllHooks`.
- Organizations that need hooks to be non-disableable use managed settings (layer 4), which is PARTIALLY VERIFIED and depends on the deployment.

**Defense in depth (principle G, AD-06).**

| Layer | Mechanism | Covers | Known gap |
|---|---|---|---|
| 1 | Claude Code permission rules (deny/ask), protected paths | All tools; deny wins in every mode (VERIFIED) | Pattern rules miss indirect shell forms; `auto`-mode protected-path writes go to the classifier, not a person |
| 2 | AEOS PreToolUse policy | Every intercepted tool call, subagents included (VERIFIED) | Hooks can be disabled for a run; MCP needs the explicit matcher; shell parsing accuracy NOT VERIFIED |
| 3 | Sandbox filesystem and network restrictions | Shell tools and their child processes, where available | **NOT AVAILABLE on Windows hands-on**: `sandbox.enabled` had no effect. macOS and Linux untested. On Windows, layers 2 and 5 (OS ACLs, opaque-exec policy, integrity checks) compensate. |
| 4 | Managed settings (`allowManagedHooksOnly`, `allowManagedPermissionRulesOnly`, `disableBypassPermissionsMode`, …) | Non-overridable organizational policy (VERIFIED as available) | Requires admin deployment; unavailable to individual users |
| 5 | Protected, signed AEOS state | Tamper evidence and fail-closed on integrity loss | Key protection relies on layers 1-4 |

### 2.7 Artifact engine

- **Typed artifacts.** Each type has a JSON Schema plus a markdown renderer.
- **Storage.** The canonical form is JSON in the State Engine; the human view is rendered markdown. Artifacts intended for the repo (`docs/`, `DESIGN.md`, `CHANGELOG.md`) are **exported** to the repo by an explicit step whose diff the user can review.
- **Metadata:** `{id, type, v, title, producer, run, inputs[], tree, status (draft|approved|superseded|archived), supersedes?, content_sha256, created_at}`.
- **Discovery by query, not glob:**
  ```
  aeos artifact latest --type test_plan --branch feat/x --status approved
  ```
- **Approval.** Artifacts that need human sign-off (Plan, DesignSystem, Spec) carry `approvals: [{by, at, via}]`. Downstream skills can require an `approved` input.
- **Initial types:**

  | Group | Types |
  |---|---|
  | Discovery and planning | `design_brief`, `spec`, `plan`, `test_plan` |
  | Findings and reports | `findings` (review, security, qa, design audit), `test_report`, `perf_report`, `health_report` |
  | Change and release | `change_set`, `release_note`, `deploy_report` |
  | Design | `design_system`, `mockup_set` |
  | Session | `checkpoint`, `retro` |
  | Rendered | `diagram`, `document` (pdf, html, docx) |

### 2.8 Tool abstraction layer

- **Capability interfaces.** Skills call interfaces and never raw CLIs. Adapters implement them and declare what they support (IO-35).

  ```ts
  interface Forge {           // github | gitlab | bitbucket | azure-devops
    capabilities(): ForgeCaps;             // {prs, issues, checks, merge_queue, inline_comments, releases}
    prGet(ref): PR; prCreate(spec): PR; prUpdateBody(ref, body): void;
    checks(ref): CheckRun[]; merge(ref, {method, matchHeadSha}): MergeResult;
    commentInline(ref, findings): void;
  }
  interface Vcs { baseBranch(): string; mergeBase(a,b): string; treeHash(): string; diff(range, opts): Diff; worktreeAdd(...): Worktree; }
  interface Tracker { issueCreate(spec): IssueRef; search(q): IssueRef[]; }            // github-issues | jira | linear
  interface DeployProvider { detect(repo): Candidate[]; status(sha): DeployState; waitFor(sha, timeout): DeployState; rollback(to): Result; }
  interface Browser { open(opts): Session; snapshot(s, flags): Snapshot; act(s, ref, action): Result; route(s, pattern, handler): void; screenshot(...); trace(...); }
  interface SecondOpinion { review(pack, mode): Findings; available(): Availability; }  // codex | claude | gemini | …
  interface Sandbox { run(spec: {image?, cmd, mounts, network:'none'|'egress-allowlist'}): Result; }  // docker | podman | none
  interface Observability { errorsSince(ts, service): Metric; }                        // sentry | datadog | otel
  interface MemoryProvider { put(item); query(q, budget); }                            // local | gbrain | vector
  interface Device { list(); install(app); session(caps); }                            // ios (from gstack ios-qa pattern) | android
  ```

- **Detection is explicit and reported.** `aeos doctor` prints each interface, its selected adapter, the capabilities it provides and the gaps. A skill whose required capability is missing fails fast with `E_CAPABILITY_MISSING` and a remediation. gstack instead stops mid-run, for example land-and-deploy with "GitLab not yet implemented".

### 2.9 Skill registry

- **A skill is a directory with a manifest:**
  ```
  skills/<id>/
    skill.yaml        # manifest (schema below): source of truth for routing, contracts, permissions
    SKILL.md          # generated stub (≤60 lines); never hand-edited
    phases/*.md       # phase cards (templated), served by `aeos run next`
    refs/*.md         # reference packs
    evals/*.yaml      # task cases + routing utterances (positive & negative)
  ```
- **Manifest (abridged; the full schema is in MASTER-SPEC §7):**
  ```yaml
  id: review
  version: 1.0.0
  kind: user            # user | specialist | system
  summary: "Pre-merge diff review with evidence-backed findings."
  routing:
    examples: ["review my diff", "code review before merge", "check this PR"]
    negative: ["review the plan", "security audit of the whole repo"]
    requires_context: [git.diff_nonempty]
  inputs:
    diff: {type: vcs_range, default: "merge-base..worktree"}
    plan: {artifact: plan, required: false}
  outputs:
    - {artifact: findings, schema: findings@1}
  requires: {interfaces: [vcs], optional: [forge, second_opinion]}
  permissions: {profile: read-mostly, max_autonomy: L1}
  phases: [scope, analyze, specialists, merge, fix, verify, report]
  done_when: {verifiers: [schema.valid, citations.resolve], optional: [tests.pass]}
  budget: {tokens_p50: 40000, tokens_max: 120000, wall_max_s: 900}
  composes: [lens.*, second-opinion]
  ```
- **Registry tiers:** `core` (bundled), `official` (signed), `community` (signed by author, sandboxed, capped at L1 until trusted), `project` (in `<repo>/.aeos/skills/`, reviewed through PR). The shadowing order is project > official > core, with an explicit warning when shadowing happens.
- **Lints** (in CI, and via `aeos skill lint`):
  - the manifest validates
  - the stub fits its budget
  - phase cards fit their budgets
  - every output type is registered
  - declared permissions cover every tool the phases instruct (this catches gstack's allowed-tools mismatches, IO-08)
  - routing examples don't collide with another skill's above a similarity threshold

### 2.10 Router

- **Pipeline.** It is deterministic first, uses the LLM only where needed, and every stage is traced.
  1. **Explicit:** `/skill …` → direct. A user can always force a route.
  2. **Deterministic match:** score the utterance against manifest `examples` and `negative` using lexical scoring plus an optional small local embedding model. Apply `requires_context` predicates (diff non-empty, UI files present, deploy config present).
  3. **Decision:**
     - top score ≥ τ_high with a margin ≥ δ → route
     - between τ_low and τ_high → the LLM picks from the **top 3 candidates only**, given as a compact list
     - below τ_low → answer directly, with no skill
  4. **Composition:** if the utterance maps to a known multi-step intent ("plan, review and ship this"), the router emits a **Route Plan** (a DAG of skills) for the orchestrator.
  5. **Trace:** `route.decided` event with candidates, scores and the chosen path.
- **Proactivity** is a config value (`off | suggest | auto`) and is **never** used for skills whose `max_autonomy` is above L1 without confirmation.
- **Benchmark:** a routing corpus with ≥ 30 labelled utterances per user skill, including negatives. CI reports top-1 accuracy and false-route rate (IO-45).

### 2.11 Agent delegation

- **Roles.** Each role is a host subagent definition (`agents/*.md` in the Claude Code plugin) with a **host-enforced tool allowlist**, so capability limits hold in code (IO-34).

  | Role | Tools | Writes | Use |
  |---|---|---|---|
  | `explorer` | Read, Grep, Glob, `aeos ctx *` | none | Codebase questions, repo mapping |
  | `lens` (reviewer) | Read, Grep, Glob, `aeos evidence record` | findings only (through `aeos`) | Review, plan, design and security lenses |
  | `verifier` | Read, `aeos verify *`, test runners through the policy | evidence only | Independent verification of claims |
  | `implementer` | Read, Edit, Write, Bash (policy-gated) | inside its **own git worktree** | Parallel implementation lanes |
  | `browser-operator` | `aeos browser *` | screenshots and traces | QA, perf, extraction |

- **What Claude Code enforces vs what AEOS must enforce** (principle E, AD-05):

  | Aspect | Status |
  |---|---|
  | `tools` allowlist and `disallowedTools` denylist (including `mcp__*`) | Enforced by the host (VERIFIED) |
  | A plugin agent's own `hooks`, `permissionMode` and `mcpServers` | **Ignored by the host** (VERIFIED hands-on, E-16). Global and plugin-level `hooks/hooks.json` do fire for plugin-agent calls, with `agent_type` `<plugin>:<agent>` |
  | Nesting | Has a host depth limit (VERIFIED) |
  | Permission mode | In `auto`, `acceptEdits` or `bypassPermissions`, a subagent runs in the parent's mode |

  Therefore:
  - **Role policy is enforced by the global AEOS PreToolUse hook**, keyed on the `agent_type` (and `agent_id`) that subagent tool calls carry. Example: a `lens` agent calling Write is denied even if a tool list were misconfigured.
  - Role definitions still declare the tightest `tools` list. Layers 1 and 2 both apply.
  - A tool call inside a subagent whose `agent_type` is not a registered AEOS role is evaluated under the **parent run's** policy. It never gets a more permissive default.
  - The runtime tracks delegation depth itself and refuses delegations that would exceed its own cap, which is independent of the host limit.
- **Contract.** A delegation is `aeos delegate --role lens --pack <ctx-pack-id> --task <card-id> --budget 30k`. The subagent must end with an `aeos step complete` carrying a schema-valid result; free-text results are rejected.
- **Isolation:**
  - Implementers each get a git worktree (`aeos worktree add`) and merge back through a `change_set` artifact that is verified before integration.
  - This replaces gstack `/spec`'s untracked background `claude -p … &` (IO-34).
- **Budgets and concurrency:**
  - Per-delegation token and wall-time budgets.
  - A global concurrency cap (default 4).
  - A subagent inherits the parent's autonomy **or lower**, never higher.
- **Fan-out/fan-in:**
  - The composer runs independent lenses in parallel.
  - The merge step de-duplicates findings by location and semantic key, then calibrates confidence.
  - This keeps gstack's Review Army idea, but runs it on data instead of prose (IO-33).

### 2.12 Skill composition

- **Pipelines** are declared in manifests as DAGs. Example, `ship`:
  ```yaml
  pipeline:
    - {id: sync_base,   uses: vcs.merge_base_update}
    - {id: verify,      uses: verify.suite,          needs: [sync_base]}
    - {id: review,      uses: skill:review,          needs: [sync_base], with: {mode: report-and-fix}}
    - {id: qa,          uses: skill:qa,              needs: [verify], when: "ctx.has_ui && config.ship.qa != 'off'", with: {report_only: true}}
    - {id: version,     uses: adapter:version_policy, needs: [review, verify]}
    - {id: changelog,   uses: specialist:changelog,  needs: [version]}
    - {id: docs,        uses: skill:docs,            needs: [review], with: {mode: sync}}
    - {id: gate,        uses: verify.done_when,      needs: [verify, review, qa, docs, changelog]}
    - {id: publish,     uses: forge.pr_create_or_update, needs: [gate], autonomy: L3}
  on_failure: {verify: stop, review: stop_if_critical, qa: concern, docs: concern}
  ```
- **Execution:**
  - Every node is checkpointed, so `aeos run resume <run>` continues after a crash, a compaction or a user pause.
  - **Idempotence** comes from node input hashes: a node whose inputs haven't changed is skipped, and verification nodes always re-run when the tree changes.
- **Dynamic selection:**
  - `when:` predicates use the run context (diff stats, changed paths, detected stacks, risk score).
  - **Risk score** = f(files touched, sensitive paths such as auth/, payments/ and migrations/, diff size, test delta).
  - The risk score drives lens selection. Example: `security` lens when auth/crypto paths are touched or the risk score is ≥ 0.6; `second-opinion` only when the risk score is ≥ 0.7 or the user asks. That replaces gstack's always-on adversarial pass (IO-18).
- **Lens stacks, not duplicate skills.** `/plan` runs lenses `product`, `engineering`, `design` and `dx` against **one** plan artifact. Each lens owns distinct dimensions, and the dimension ownership table in MASTER-SPEC §7.6 prevents overlap. That removes gstack's CEO/Eng duplication (IO-05).

### 2.13 Memory and learning system

- **Kinds:**

  | Kind | Meaning |
  |---|---|
  | `fact` | Project knowledge ("payments service uses idempotency keys in `X-Idem`") |
  | `pitfall` | Something that went wrong before |
  | `preference` | User or team taste and question preferences (absorbs `/plan-tune`) |
  | `decision` | An event-sourced decision, with `supersedes` |
  | `playbook` | A reusable procedure, e.g. a codified browser recipe |

- **Record fields:** `{id, kind, scope (user|project|team), statement, provenance {source: user|observed|inferred|cross_model|imported, run, evidence[]}, trust (trusted|untrusted), confidence, decay_policy, ttl?, tombstoned?}`.
- **Write gate:** schema validation, an injection-pattern scan (gstack's `INJECTION_PATTERNS` idea), secret scanning, and **quarantine** for untrusted provenance. Team-scope writes land in `<repo>/.aeos/memory/*.jsonl` and are reviewed through PR.
- **Deletion** writes a **tombstone** event, never a rewrite, so an older duplicate is never resurrected (IO-20).
- **Retrieval:**
  - `aeos memory query --for <phase-card> --budget 800` returns the top-k records by relevance × confidence × recency, capped by the budget.
  - Only `trusted` records, or records tied to evidence, are auto-injected. Everything else needs an explicit query.
- **Learning loop:**
  - At run end the orchestrator proposes memory candidates from the run's events: repeated failures, verified root causes, user corrections.
  - Candidates are written as `observed`, with confidence tied to the evidence.
  - Nothing becomes `trusted` without user confirmation or ≥ 2 independent verified occurrences.
- **Adapters:** `local` (SQLite FTS5, the default), `gbrain` (from the gstack integration), `vector` (optional). The query API is the same across all of them. gstack has four layers with no unified query (IO-21).

### 2.14 Evaluation and benchmark system

- **Suites** (details in MASTER-SPEC §15):

  | Suite | Content | Scoring |
  |---|---|---|
  | `routing` | Labelled utterances | Top-1 accuracy, false-route rate |
  | `tasks` | Fixture repos with seeded defects: bugs, vulnerabilities, UI regressions, stale docs, perf regressions | Finding precision and recall, fix success, test pass rate |
  | `safety` | Adversarial prompts and repos: injection in READMEs, PR bodies and web pages; destructive-command variants | Policy catch rate; zero tolerated escapes on the gate set |
  | `efficiency` | Token and wall-time per task | p50/p95 vs budget |
  | `calibration` | Stated confidence vs actual correctness | Expected calibration error (ECE) |

- **Protocol:**
  - Each case runs N times (default 3) to get a mean and a 95% confidence interval.
  - Pinned model IDs and a hermetic environment. This keeps gstack's hermetic runner concept: temp home, scrubbed env, strict MCP.
  - Results are stored as `eval_result` artifacts, and `aeos eval compare <baseline> <candidate>` reports regressions.
- **CI tiers:**

  | Tier | Content | Cost |
  |---|---|---|
  | `static` | Lints, schemas, budgets, and **behavioral** unit tests of the runtime, not wording pins | Free |
  | `gate` | Safety suite and a routing subset | Deterministic, cheap |
  | `nightly` | Task suites | Paid |
  | `release` | Everything, N=5 | Paid |

- **Selection:** diff-based selection keeps gstack's touchfiles idea, but derives the mapping from manifest `phases` and `refs` automatically instead of maintaining it by hand.

### 2.15 Integration / adapters layer

- **Host adapters** declare what the host supports: hooks, subagents, AUQ, plan mode, background tasks and MCP.
  - **Claude Code is the primary host.** It is distributed as a plugin containing skills, agents, hooks and an optional MCP server.
  - Codex, Cursor and others are secondary. They get generated stubs with **explicit capability downgrades**: no hooks means max L1, and the constitution states this.
- **Service adapters** implement the interfaces in §2.8:

  | Interface | Adapters |
  |---|---|
  | Forge | GitHub, GitLab (at parity from v1) |
  | Tracker | Jira, Linear |
  | Deploy | Vercel, Fly, Render, Netlify, Heroku, Railway; k8s via `kubectl rollout status`; ArgoCD; custom command |
  | Observability | Sentry, Datadog, OTEL |
  | Second-opinion LLM | Codex, Claude, Gemini |
  | Image generation | OpenAI, others |
  | Sandbox | Docker, Podman |
  | Device | iOS (ported from gstack's ios-qa daemon design), Android later |
  | Memory | gbrain |

- **Adapter SDK:** `aeos sdk new-adapter <interface> <name>` scaffolds the adapter, contract tests and a capability declaration. Every adapter must pass the interface's **contract test suite**, run against a recorded fixture server where possible.

### 2.16 Installation and update system

- **Distribution:**
  - The Claude Code plugin marketplace entry carries the prompt assets and hooks.
  - An npm package `aeos` carries the runtime, published with **npm provenance**.
  - Optional standalone binaries built with Node SEA (single executable application) for machines without Node.
- **Install:** `/plugin install aeos` (or `npx aeos setup`), then `aeos doctor`. No bash `setup` script, and no Git Bash requirement on Windows.
- **Project pin.** `<repo>/.aeos/config.yaml` declares `aeos: ">=1.4 <2"` and the enabled skills and adapters. On a mismatch the runtime refuses to run and tells the user how to fix it. That gives teams reproducibility; gstack teams track `main`.
- **Channels:** `stable`, `beta`, `nightly`.
- **Upgrades:**
  - `aeos upgrade` verifies the signature and provenance, shows the changelog, runs migrations with a ledger, and **rolls back** on migration failure.
  - A failed migration stops the upgrade. gstack's migrations are non-fatal and unrecorded (IO-46).
- **No silent CLAUDE.md mutation.** The only CLAUDE.md change is an optional, single, marked line (`@.aeos/AEOS.md` import) added with consent. All configuration lives in `.aeos/config.yaml` (IO-41).
- **No silent modification of any user configuration.** This covers `~/.claude/settings.json`, project `.claude/settings*.json`, CLAUDE.md and other tools' hook entries. Every change is:
  - proposed as a diff in the Hook Compatibility Manager's installation report (§2.17)
  - applied only after explicit consent
  - backed up first
  - reversible with `aeos uninstall`

### 2.17 Hook Compatibility Manager (`sys.hookcompat`)

**Why it exists.** AEOS depends on hooks (PreToolUse, Stop and possibly SessionStart), and it will rarely be installed on a clean machine. This machine already has two `Stop` hooks in `~/.claude/settings.json`:
- one from gstack, which runs `timeline-stop-hook.ts` through Bun
- one from paysec, which runs `D:/claude/paysec/hosts/claude/hooks/timeline-stop-hook`

Hooks from settings, projects, plugins and managed policy all run in the same events, subagents included (VERIFIED). So AEOS must coexist without breaking, masking or being masked by other hooks (principle I, AD-07).

**Responsibilities:**
1. **Detect.** Enumerate hook entries from every source AEOS can read: user settings, project `.claude/settings.json` and `.claude/settings.local.json`, installed plugins' hook declarations, skill and agent frontmatter hooks where discoverable, and managed settings when readable. Sources it cannot read are listed as *unknown*, never assumed empty.
2. **Classify.** Group each hook by event, matcher, command, owner and a behavior class. The class is inferred where possible, otherwise marked *unknown*:

   | Class | Meaning |
   |---|---|
   | `observer` | Logging or telemetry only |
   | `blocker` | Can deny or block |
   | `mutator` | Emits `updatedInput` or changes context |
   | `gate` | Stop-blocking |

   Known owners (gstack, paysec, AEOS) are recognized by path and marker fields. The rest are classified by owner as `project`, `plugin`, `managed` or `unknown`.
3. **Detect overlaps.** For every event AEOS uses, list the other hooks on the same event and matcher.
4. **Detect potential conflicts.** Flag:
   - several `mutator`s on the same tool (ordering and composition of `updatedInput` are NOT VERIFIED)
   - several Stop `gate`s that could deadlock turn end
   - a foreign hook that returns `allow` on tools AEOS restricts (AEOS's deny still wins; reported for awareness)
   - hooks whose command path does not exist (a broken foreign hook, reported and not touched)
   - timeouts that together threaten the latency budget
5. **Never silently overwrite.** AEOS adds its own entries marked with an ownership field. It never edits, reorders, removes or disables another owner's entry. Removing or changing a foreign hook is the user's action, done with their own tools.
6. **Installation report.** Before any change, produce a report listing:
   - the sources scanned and any that were unreadable
   - the existing hooks by event
   - overlaps and conflicts
   - the exact entries AEOS proposes to add, as a diff
   - the backup location
   - the rollback command

   Nothing is written without consent. `aeos doctor` re-runs the scan on demand and warns on drift.
7. **Coexistence targets:**
   - gstack (including side-by-side installs)
   - paysec
   - project-level hooks
   - hooks from other plugins
   - other tooling (formatters, git hooks unrelated to Claude Code, team hooks)
8. **Uninstall.** Remove only entries carrying AEOS's ownership marker, and restore from backup on request.

**Boundaries.** The manager reads configuration. It writes only AEOS-owned entries, and only after consent. It never runs foreign hook commands. Hands-on (Windows):
- User-scope hook changes apply to a running session within about 1 s and emit `ConfigChange`, so no restart is needed. That also means `ConfigChange` is watched as a tamper signal.
- All matching hooks run concurrently, with start in configuration order and non-deterministic completion, so AEOS decisions are order-independent.
- The manager also flags foreign hooks that emit `allow` (hands-on, a hook `allow` overrode a native working-directory block), foreign hooks that emit `updatedInput` (only one rewrite survives), and shell-string hook commands (slow start).

### 2.18 Process Lifecycle Manager (`sys.lifecycle`)

**Why it exists.** Some AEOS parts may run as detached OS processes: the optional policy daemon, the browser driver, the design-board server, and device daemons. Phase 2 showed that:
- detached OS processes can stay alive
- MCP servers live for a Claude Code session
- **Claude Code does not manage detached process lifecycle** (PARTIALLY VERIFIED)

**Hands-on on Windows (E-14):** detached processes spawned by a hook or by the model survive both normal session exit and an abrupt kill of Claude Code, and nothing cleans them up (principle K, AD-09). macOS and Linux are untested.

**Responsibilities:**

| Duty | Requirement |
|---|---|
| Startup | Single-instance per scope (a lock file with owner pid, start time and command line). Readiness is signalled through a health endpoint or file, with a bounded wait. |
| Health check | Liveness plus readiness probes. A busy process is distinguished from a dead one, and a busy process is never killed. |
| Idle timeout | Every daemon has an idle timeout. Idle-exempt modes must be explicit and visible in `aeos doctor`. |
| Cleanup | Graceful stop, then a forced stop only for processes AEOS started. Identity is verified by pid, start time and command line (MASTER-SPEC S-7). Temp files and locks are removed. |
| Crash recovery | A stale state or lock is detected on the next call, then reclaimed after identity verification, then the process restarts. Clean exit and crash use distinct exit codes. |
| Orphan detection | At each session start and on `aeos doctor`, AEOS processes whose owning session no longer exists are listed and offered for cleanup. They are cleaned automatically only for processes AEOS itself started and can identify with certainty. |
| Windows | Process spawning, liveness checks and cleanup are implemented and tested separately on Windows. |

**Design rule.** No safety or verification guarantee may depend on a detached process being alive. Detached processes are accelerators or feature hosts. The policy decision path always has an in-process fallback that fails closed.

---

## 3. Skill taxonomy

### 3.1 User-facing skills (19 commands)

| Command | Purpose | Replaces (gstack) | Default max autonomy |
|---|---|---|---|
| `/aeos` | Help, route, doctor, config, setup, upgrade | gstack router, gstack-upgrade | L0 |
| `/discover` | Frame a problem → `design_brief`; `--to-issue` → `spec` + tracker | office-hours, spec | L1 (L3 for tracker publish) |
| `/plan` | Build or refine a `plan`; lenses product, engineering, design, dx; `--auto` | plan-ceo/eng/design/devex-review, autoplan | L1 |
| `/design` | `system`, `explore`, `build`, `audit` | design-consultation, -shotgun, -html, -review, ios-design-review | L2 |
| `/build` | Implement an approved plan in lanes (worktrees), with test-first verification | *(new: gstack has no implementation skill)* | L2 |
| `/debug` | Hypothesis-ledger root-causing, minimal fix, regression test | investigate, ios-fix | L2 |
| `/review` | Diff review with lens specialists and evidence-backed findings | review, codex/claude-code review modes | L1 |
| `/security` | Repo or diff security audit with the evidence model; sandboxed reproduction | cso | L0 (repairs proposed only) |
| `/qa` | Targets web, ios, api, cli; lenses functional, design, dx, a11y; `--report-only` | qa, qa-only, devex-review, ios-qa | L2 |
| `/perf` | Statistically sound perf measurement and regression | benchmark | L0 |
| `/ship` | Verify → review → version → changelog → docs → PR | ship | L3 |
| `/deploy` | `setup`, `land`, `monitor`, `status`, `rollback` | land-and-deploy, setup-deploy, canary, landing-report | L4 (gated) |
| `/docs` | `sync`, `generate`, `diagram`, `export` | document-release, document-generate, diagram, make-pdf | L2 |
| `/health` | Quality dashboard; lenses such as `reuse` | health, deslop-shared-libs | L0 |
| `/retro` | Delivery and quality retrospective (DORA plus quality) from ledgers | retro | L0 |
| `/browser` | `open`, `extract`, `auth`, `share`, `recipes` | browse, open-gstack-browser, pair-agent, setup-browser-cookies, scrape, skillify | L1 |
| `/guard` | Show or change the guard level and scope (user-only relaxations) | careful, guard, freeze, unfreeze | n/a |
| `/resume` | Resume a run or checkpoint; `save` | context-save, context-restore | L0 |
| `/memory` | Query, add, confirm, tombstone, export memory; preferences | learn, plan-tune | L0 |

### 3.2 Specialist capabilities (invoked by user skills; not delivered as Claude Code skills)

Phase 2 found that no Claude Code mechanism hides a skill from **both** the model and the user while still letting the runtime invoke it (PARTIALLY VERIFIED):
- `disable-model-invocation` blocks only automatic model invocation.
- `user-invocable: false` hides a skill from the `/` menu only.

Specialists are therefore **not implemented as hidden Claude Code skills** (principle D, AD-04). Each is delivered in one of three ways:

| Delivery | Used for | Why |
|---|---|---|
| **Runtime-served phase cards** (`aeos run next`, `aeos ctx ref`) | Lenses run inline, loop logic, generation instructions | Invisible to the host catalog by construction; the runtime alone decides when they load |
| **Controlled subagents** (`agents/*.md` role definitions, §2.11) | Lenses run in parallel, independent verifiers, implementers | Tool lists are host-enforced (VERIFIED), and role policy is also enforced globally |
| **Runtime code** | Renderers, recipe replay, deterministic verifiers | No model involvement is needed |

They cost no catalog tokens (IO-39) because they are never registered as skills. If a future Claude Code version adds a verified hidden-skill mechanism, adopting it is an optimization, not a requirement.

| Group | Specialists |
|---|---|
| **Plan lenses** | `lens.product`, `lens.engineering`, `lens.design`, `lens.dx` |
| **Review lenses** | `lens.correctness`, `lens.testing`, `lens.security-diff`, `lens.performance`, `lens.data-migration`, `lens.api-contract`, `lens.maintainability`, `lens.simplification`, `lens.red-team`, `lens.a11y`, `lens.reuse` |
| **Verification** | `verifier.independent`, `test-author`, `snippet-runner`, `bisect` |
| **Loops** | `fix-loop` (shared by qa, design audit and debug; keeps gstack's WTF-likelihood self-regulation as a coded budget), `hypothesis-tester` |
| **Generation** | `mockup-generator` (budget-gated), `design-system-writer` (the sole DESIGN.md writer), `changelog-writer`, `release-notes`, `diagram-renderer`, `document-renderer` |
| **Browser** | `recipe-codifier` (records extraction recipes from structured browser traces), `dx-sandbox-run` (clean-room getting-started run) |
| **Cross-model** | `second-opinion` (provider adapters) |

### 3.3 Internal / system skills and modules

| Module | Role |
|---|---|
| `sys.constitution` | Session context: through SessionStart if SK-4 validates, otherwise embedded in skill stubs |
| `sys.router`, `sys.orchestrator`, `sys.composer`, `sys.delegation` | Routing and run control |
| `sys.policy` | Safety engine: PreToolUse (`"*"` plus explicit `mcp__.*`) and Stop hooks. UserPromptSubmit is used only for context and telemetry, **never as a trust anchor** (principle H) |
| `sys.hookcompat` | Hook Compatibility Manager (§2.17) |
| `sys.lifecycle` | Process Lifecycle Manager (§2.18) |
| `sys.state`, `sys.evidence`, `sys.verify`, `sys.artifact`, `sys.memory` | Engines |
| `sys.ctx` | Context packs and repo map |
| `sys.install`, `sys.doctor`, `sys.upgrade`, `sys.migrate` | Distribution |
| `sys.eval` | Evaluation harness, including the model-compare capability that replaces benchmark-models |
| `sys.telemetry` | Opt-in, local-first |

---

## 4. Inter-skill communication

**Rule:** skills never communicate through prose recommendations or filename conventions. There are exactly three channels:

1. **Artifacts** (data). A producer writes a typed artifact, and a consumer declares it as an input and resolves it through the registry query. The dependency is visible in the manifest and verifiable in CI.
2. **Events** (signals). `run.*`, `phase.*`, `artifact.created`, `claim.recorded`, `gate.failed` and so on. Consumers subscribe through the orchestrator: for example, `/retro` computes DORA metrics from `deploy.completed` and `run.completed` events.
3. **Route Plans** (control). A skill may return `next: [{skill, inputs, reason, confidence}]`. The orchestrator executes them only under the current autonomy level and proactivity setting.

---

## 5. Contracts

### 5.1 Skill input contract

```ts
type SkillInvocation = {
  v: 1;
  run_id: string;                     // assigned by orchestrator
  skill: string; skill_version: string;
  goal: string;                       // user's words (verbatim) + normalized intent
  params: Record<string, unknown>;    // validated against manifest.inputs
  inputs: ArtifactRef[];              // resolved artifact ids
  context: { project_id; worktree_id; session_id; branch; tree; base?: string; stacks: string[]; risk: number };
  autonomy: 'L0'|'L1'|'L2'|'L3'|'L4'; // effective = min(user/session, project, skill.max)
  scope?: { write_roots: string[] };
  budget: { tokens: number; wall_s: number; usd?: number };
  parent_run?: string;                // for delegated/composed runs
};
```

### 5.2 Skill output contract

```ts
type SkillResult = {
  v: 1;
  run_id: string;
  status: 'done'|'done_with_concerns'|'blocked'|'needs_input'|'failed'|'aborted';  // computed by orchestrator from gates
  summary: string;                    // ≤ 120 words, human-facing
  outputs: ArtifactRef[];
  claims: string[];                   // claim ids (findings, completion claims)
  evidence: string[];
  concerns?: {code: string; message: string}[];
  blocked_on?: {kind: 'user'|'capability'|'policy'|'verification'; detail: string; remediation: string};
  next?: {skill: string; inputs?: ArtifactRef[]; reason: string; confidence: number}[];
  metrics: { tokens_in: number; tokens_out: number; wall_s: number; tool_calls: number; usd_est?: number };
};
```

### 5.3 Phase protocol (model ↔ runtime)

```
aeos run start <skill> --params '{…}' --json      → {run_id, phase: {id, card, output_schema, gates}}
aeos run step  <run_id> --output <file|->  --json → {accepted: true, next_phase: {...}} | {accepted: false, errors:[…], remediation}
aeos run ask   <run_id> --question <q.json>        → records needs_input; returns AUQ payload for the host
aeos run status <run_id>                           → phase, outstanding gates, outputs so far
aeos run resume <run_id> | abort <run_id>
```

### 5.4 State and artifact contracts

- **Event envelope:** as in §2.3.
- **Artifact:** as in §2.7.
- **Schemas** are published under `schemas/<type>@<major>.json`. A breaking change needs a new major version and a registered migration.
- **Writes** go only through `aeos artifact put`, which validates, content-hashes, records provenance and emits `artifact.created`.
- **Exports to the repo** (`aeos artifact export <id> --to docs/…`) produce a normal file diff subject to policy (`fs.write`) and review.

---

## 6. Error handling and recovery

### 6.1 Error taxonomy

Every runtime error carries `code`, `retryable`, `remediation` and `evidence?`.

| Code | Meaning | Default recovery |
|---|---|---|
| `E_CAPABILITY_MISSING` | Required interface or adapter unavailable | Stop before any side effect; print the doctor remediation |
| `E_POLICY_DENIED` | The safety engine denied an action | Surface the rule id; suggest the user-level command if relaxation is legitimate |
| `E_SCHEMA_INVALID` | Phase output failed schema validation | Return errors to the model; at most 2 repair attempts, then `blocked` |
| `E_VERIFICATION_FAILED` | A required verifier failed | Stay in the phase; the fix loop may retry within budget; else `done_with_concerns` or `blocked` per manifest |
| `E_BUDGET_EXCEEDED` | Token, time or cost budget hit | Checkpoint; `needs_input` with a summary and options |
| `E_CONFLICT` | Merge conflict, VERSION collision, stale artifact | Stop; present the conflict; never auto-resolve non-trivial conflicts |
| `E_EXTERNAL` | Adapter or network failure | Retry with exponential backoff (3 tries) if retryable; else `blocked` |
| `E_STALE_EVIDENCE` | The tree changed after verification | Re-run the affected verifiers automatically |
| `E_USER_ABORT` | The user cancelled | Run compensation for any completed side effects if the user chooses |
| `E_INTERNAL` | Runtime bug | Fail closed for policy; fail open (with a warning) for UX-only features; write a diagnostics bundle |

### 6.2 Recovery mechanics

- **Checkpoint per phase.** Every accepted phase output is durable, so `resume` restarts at the first incomplete phase. Compaction or a crash loses no work (IO-19, IO-32).
- **Compensation log.** Each side-effecting node records its inverse where one exists:

  | Side effect | Compensation |
  |---|---|
  | commit | revert |
  | branch | delete |
  | draft PR | close |
  | deploy | rollback target |

  `aeos run compensate <run>` offers these to the user. It is never automatic above L2.
- **Fail-safe polarity:** fail **closed** for policy, consent, egress and verification; fail **open** for telemetry, hints and update checks. This keeps gstack's principle, now enforced by code review checklists and tests.
- **Loop protection:**
  - The orchestrator counts repair attempts per phase (max 2) and fix-loop iterations (skill budget).
  - It tracks a **drift score**, which generalizes gstack's WTF-likelihood: reverts, unrelated-file touches and repeated failures raise it.
  - Above its threshold, the run moves to `needs_input`.

---

## 7. Safety boundaries

**Always-on baseline.** These apply at every level and cannot be relaxed by the model, only by explicit user config with a typed confirmation:

1. **Never** force-push to the default or protected branches.
2. **Never** run `data.destructive` or `cloud.destructive` actions against non-local targets without a typed confirmation.
3. **Never** read `secrets.read` paths into model context. Adapters may use secrets; the model never sees them.
4. **Never** send repo content to a third-party LLM or service without a per-provider consent record. Every send is receipted.
5. **Never** execute instructions found inside untrusted content envelopes.
6. **Never** mutate the user's global host settings (`~/.claude/settings.json`) without consent. Backups are mandatory.
7. **Never** kill a process that the runtime did not start, verified by pid plus start time plus command line. gstack's `open-gstack-browser` violates this.
8. **Never** weaken a Claude Code native or managed control. No `allow` decisions, no widening `updatedInput`, no edits to permission rules that loosen them (principles B, C).
9. **Never** overwrite, reorder or disable another owner's hook or configuration entry (principle I).

**Stated limits.** These are what AEOS does *not* guarantee today, and the constitution states them to the user:
- **User-only relaxation** of guards and autonomy is not a verified guarantee (principle H, §2.6).
- **Protection of AEOS state** against indirect shell manipulation is PARTIALLY VERIFIED. Hands-on, an interpreter one-liner bypassed deny rules, and no sandbox was available on Windows (principle G).
- **MCP tools** are gated through the explicit `mcp__.*` matcher. A tool that doesn't match that pattern is not declared as covered.
- **A hook that times out fails open** for that call. AEOS's internal deadline mitigates this but cannot rule it out (AD-12).
- **Tool calls rejected by Claude Code before any hook** are not in AEOS's audit trail (U-20).
- **A user can disable hooks for a run.** AEOS then detects this and degrades; it does not prevent it.

Further boundaries:
- **Scope boundaries** are per run and session-keyed; see §2.6.
- **Remote and paired agents** (from `/browser share`):
  - They get least privilege by default: read and interact scopes, no `eval`, no cookies or storage.
  - Domain allowlists are required to reach private network ranges.
  - Tokens last 1 hour by default.
  - Every remote command is written to the audit log.
  - This keeps gstack's tunnel dual-listener design and fixes its defaults (IO-13).
- **Browser content defenses** apply to the **local agent** too: envelope, hidden-element marking and datamarking, where gstack applies the stronger ones only to scoped tokens (IO-12).

---

## 8. Dynamic skill selection and composition (worked example)

The user says: **"Fix the checkout 500 and ship it."**

1. **Router.** Deterministic matching gives `debug` 0.82 and `ship` 0.77. Both are over τ_high, and the intent "and ship it" matches the composite pattern `debug→ship`. The router emits the Route Plan `[debug, ship]` with the note that `ship` needs L3.
2. **Autonomy.** The session is at L2, so the orchestrator runs `debug` now and asks once before `ship` ("Needs Publish (L3) to push & open PR: allow for this run?").
   - This raises the *AEOS ceiling* only for the run. Claude Code's own permission mode still applies, so the push may still prompt natively.
   - The approval arrives through a runtime question. That channel is subject to the unresolved user-authority boundary (principle H).
   - Until it is validated, raising above the project default uses the out-of-band path in §2.6.
3. **`/debug` phases:**
   1. `reproduce` → evidence: a failing `http_probe` or failing test.
   2. `hypothesize` → a hypothesis ledger with ≤ 3 active hypotheses.
   3. `isolate` → a scope lock on `services/checkout/**`, a session-keyed policy rule.
   4. `fix` → a `change_set`.
   5. `regress` → the `tests.new_fail_before_fix` verifier.
   6. `verify` → `tests.pass`.
   - Memory query at the start: pitfall "checkout 500s previously caused by currency rounding (confidence 0.7)".
4. **Composition context.** `debug` outputs a `change_set` plus evidence, and the orchestrator passes them as inputs to `ship`.
5. **`/ship` DAG:**
   - The risk score is 0.64 (payments path), so the `lens.security-diff` lens runs automatically. `second-opinion` is skipped, because the score is below 0.7.
   - `qa` runs `--report-only` because UI files are untouched and only the API changed: an `api` target run.
6. **Gate.** Every verifier has passed on the current tree hash, so the run becomes `status: done`. PR created (L3 approved for this run).
7. **Learning.** The orchestrator proposes a memory candidate "checkout 500 root cause: …" as `observed`, with confidence tied to the regression evidence.

---

## 9. How this architecture beats gstack (traceability)

| gstack weakness (analysis §) | AEOS mechanism | Section |
|---|---|---|
| Prose-only orchestration and gates (§0, §9) | Runtime state machine with verifiers and hooks | 2.1, 2.5, 2.6 |
| ≈400-line preamble per skill; ≈2.4 MB of prompt (§2, §4) | Constitution once, plus a stub and phase cards | 2.2 |
| Glob-based artifact discovery; path drift (§3, §11) | Typed artifact registry and queries | 2.7 |
| 20+ fragmented ledgers; orphan ledgers (§7) | One event-sourced state engine | 2.3 |
| Evidence rigor only in cso and ship (§9) | Evidence and verification engines for all skills | 2.4, 2.5 |
| Opt-in, Bash-only, regex safety; global freeze (§9) | Always-on, all-tool, AST-based, session-keyed policy | 2.6 |
| Duplicate skills (CEO vs Eng, qa vs qa-only, ×3 DESIGN.md writers) | Lens stacks, modes and a single-writer rule | 2.12, 3 |
| GitHub bias; CLAUDE.md as a config store (§6, §11) | Forge and deploy adapters; `.aeos/config.yaml` | 2.8, 2.16 |
| Chromium-only, no network mocking (§5) | Browser interface with `route`, traces and multiple engines | 2.8 |
| Hardcoded install path; main-tracking upgrades (§12, §13) | Plugin and npm with provenance; project pin; channels; rollback | 2.16 |
| macOS/zsh assumptions; three runtimes (§14) | A single Node runtime; no shell in prose | 2.1 |
| Tests pin wording; no task benchmark (§16) | Behavioral runtime tests plus task, routing, safety and calibration suites | 2.14 |
| Hooks installed alongside other tools with no coexistence story (on this machine: gstack and paysec Stop hooks) | Hook Compatibility Manager with a consented installation report | 2.17 |
| Detached daemons killed without identity checks; idle timeouts disabled in some modes (§5.2) | Process Lifecycle Manager | 2.18 |
| Safety hooks degrade silently to prose on other hosts (§14) | Ceiling semantics, hook-absence detection, and stated limits | 2.6, 7 |
