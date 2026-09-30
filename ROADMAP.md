# AEOS Roadmap

> **Governs:** delivery order for [MASTER-SPEC.md](MASTER-SPEC.md).
> **Rationale for ordering:** the P0 foundations in [IMPROVEMENT-OPPORTUNITIES.md § Priority](IMPROVEMENT-OPPORTUNITIES.md#priority) come first. **Measurement comes before features**, so every later release can prove it is better than gstack.
> **No dates are committed.** Each release has exit criteria, and the next release starts only when they are met. Sizing is relative (S/M/L/XL) until the team and capacity are known (Q11).

## Project phases and releases

Work so far is organized in phases. Delivery is organized in releases R0-R8. Phases 1 and 2 sit inside R0. Phases 3 and 4 map to R1 ("Benchmark first"): Phase 3 is the design, Phase 4 the implementation and baseline run. This mapping is proposed; see contradiction C-4 in benchmark-design/PHASE-3-EXIT-CRITERIA.md.

| Phase | Content | Status |
|---|---|---|
| Phase 1 | gstack analysis and specification (the five analysis and spec documents) | Complete (documents v0.1) |
| **Phase 2** | Claude Code platform capability validation (the R0 spikes) | **Exit criteria satisfied (2026-09-27)**: documentation and hands-on (Windows) validation, plus the recorded owner decisions. B-3 and B-4 are resolved by evidence; B-1, B-2, B-5 and B-6 by owner acceptance of documented fallbacks; B-7 by owner decisions. Deferred items are carried forward. See [platform-validation/PHASE-2-EXIT-CRITERIA.md](platform-validation/PHASE-2-EXIT-CRITERIA.md). |
| **Phase 3** | Benchmark and evaluation system: **design only** (R1 design). Documents are in [benchmark-design/](benchmark-design/PHASE-3-EXIT-CRITERIA.md). | **COMPLETE (2026-09-27).** The owner approved the v1 design (BQ-07, BQ-08, BQ-18) and the v1.1 revision that resolved design deficiencies D-1 to D-6 (BQ-21, BQ-22, BQ-23; [benchmark-design/PHASE-3-V1.1-REVISION.md](benchmark-design/PHASE-3-V1.1-REVISION.md)). The owner signed off Phase 3 as the approved design basis for Phase 4. **Next phase: Phase 4.** See [benchmark-design/PHASE-3-EXIT-CRITERIA.md](benchmark-design/PHASE-3-EXIT-CRITERIA.md). |
| Phase 4 | Benchmark harness implementation and the Run A (Claude Code) baseline (R1 implementation; the bounded scope is in PHASE-3-EXIT-CRITERIA §4) | **Not started.** |
| Later phases | The remaining R0 items (spec ratification, AEOS schemas, CI scaffold), then R2 onward | **Not started.** |

---

## Release overview

| Release | Theme | User-visible | Key IOs | Size |
|---|---|---|---|---|
| **R0** | Ratify and scaffold | None (repo, CI, schemas) | — | M |
| **R1** | Benchmark first | `aeos bench` (internal) | IO-45 | L |
| **R2** | Core runtime and the first skill | `/aeos`, `/guard`, `/resume`, `/review` | IO-07, 22-25, 27-30, 39, 40, 43, 26, 08 | XL |
| **R3** | Verify and debug | `/debug`, `/qa` (web, api), `/security`, `/memory` | IO-03, 10-12, 14, 19-21, 24, 32 | XL |
| **R4** | Plan and build | `/discover`, `/plan` (+`--auto`), `/build` | IO-01, 05, 06, 09, 18, 33, 34 | L |
| **R5** | Ship | `/ship`, `/docs` | IO-16, 17 (forge/version parts), 35, 46, 47 | L |
| **R6** | Operate | `/deploy`, `/perf`, `/health`, `/retro` | IO-17, 22 (retro), 37, 38, 44 | L |
| **R7** | Design, browser breadth, devices | `/design`, `/browser` (all modes), `/qa --target cli\|ios` | IO-02, 13, 14, 15 | L |
| **R8** | Ecosystem and v1.0 | SDK, registry, Tier-2 hosts, team features | IO-04, 31, 36, 41, 42 | L |

---

## R0: Ratify and scaffold

### Scope
- Resolve the blocking open questions: Q1 name, Q2 license, Q3 relationship to the paysec fork, Q5 host tiers, Q7 default autonomy, and Q8 model set and eval budget.
- Ratify MASTER-SPEC v0.x → v1.0.0-rc (§19).
- Run the technical spikes **SK-1 to SK-7** below (Phase 2, extended by the U-nn items from PLATFORM-ASSUMPTIONS) and record the results. Documentation-level results are in [§ Phase 2](#phase-2-claude-code-platform-capability-validation), and hands-on results are still outstanding.
- Create the source-repo layout (MASTER-SPEC §6.2), with TypeScript strict and Node LTS.
- Set up the CI matrix: Windows, macOS and Linux × Node LTS versions.
- Add JSON Schemas v1 for `invocation`, `result`, `event`, `artifact`, `evidence`, `claim`, `skill manifest` and `phase card` frontmatter, each with valid and invalid fixtures.
- Put the contribution framework in place: RFC template, PR checklist, SECURITY.md, NOTICE, and the **clean-room policy** (MASTER-SPEC §18.4).

### Exit criteria
- The spec is ratified to rc.
- All spikes have written conclusions.
- An empty CI pipeline is green on all 3 OSes.
- Schemas are published with passing fixture tests.

### Technical spikes

These are **required before R2**, because they validate host assumptions that PSA depends on. Their status after Phase 2 is below; the full evidence is in [§ Phase 2](#phase-2-claude-code-platform-capability-validation).

| Spike | Question | Why it matters | Phase 2 status |
|---|---|---|---|
| SK-1 | Can a Claude Code PreToolUse hook match **all** tools, including MCP tools, and return `ask` / `deny` with a reason? What is its latency budget and timeout behavior? | Safety engine SP-1 | PARTIALLY VERIFIED. Matching and blocking are verified. MCP via `"*"` is NOT VERIFIED (explicit `mcp__.*` is VERIFIED). Latency and timeout are NOT VERIFIED (U-10). **Hands-on:** `"*"` caught local stdio MCP tools. Windows latency is median 120-131 ms and p95 129-234 ms. **A timeout fails open.** Status: PARTIALLY VERIFIED (U-01, U-10, AD-12). |
| SK-2 | Can plugin-distributed skills be hidden from the catalog or from model auto-invocation (for specialists)? Which frontmatter fields control this in the current Claude Code version? | Catalog token budget, PSA §3.2 | PARTIALLY VERIFIED. No combined hidden-and-runtime-invocable mechanism was found. The fallback is adopted (AD-04). |
| SK-3 | Are subagent (`agents/*.md`) tool allowlists enforced by the host for plugin-distributed agents? | Delegation roles, PSA §2.11 | VERIFIED for tool lists. Plugin-agent hooks, permissionMode and mcpServers have limitations. Global enforcement is adopted (AD-05, U-05). **Hands-on:** a plugin agent ignores `hooks`, `permissionMode` and `mcpServers`, and honors its tool lists. VERIFIED. |
| SK-4 | Do SessionStart and PreCompact hooks support injecting `additionalContext`, and what are the size limits? | Constitution and compaction resilience | **VERIFIED (hands-on).** Delivered at startup and after `/compact` (`source: compact`), clean per session, silently truncated above about 9,000 characters (AD-11, U-06). |
| SK-5 | Can a UserPromptSubmit hook reliably distinguish user-typed input, so that a relaxation nonce is trustworthy? | S-8 and AU-2 | PARTIALLY VERIFIED. The event exists, but attribution is not established. The design no longer relies on it (AD-10, U-02). **Hands-on:** it identifies the input channel, and does not fire for subagent prompts or Stop continuations. Restart-only autonomy works in simulation. PARTIALLY VERIFIED. |
| SK-6 | What shell-AST parsing approach works from Node for bash and PowerShell (a pure-JS parser vs the `pwsh` parser API), and how accurate is it on the policy corpus? | SP-2 | **PARTIALLY VERIFIED (hands-on).** String matching is insufficient (7/27, 5/17). The PowerShell AST scored 14/17 but needs a long-lived process (about 1 s start, about 36 ms per parse). Bash parser not validated (U-11, AD-13). |
| SK-7 | Does `node:sqlite` work (stability, locking) on Windows, macOS and Linux across the supported Node versions? If not, fall back to a JSONL-only index. | ST-6, ST-7 | **PARTIALLY VERIFIED (hands-on, Node 24 on Windows):** 4 concurrent writers, 2,000 of 2,000 rows (U-15). |

---

## Phase 2: Claude Code platform capability validation

- **Host:** Claude Code **2.1.283**, the version installed on the analysis machine.
- **Method:** a review of the official Claude Code documentation (hooks, permissions, permission modes, subagents, skills), plus a **read-only** inspection of `~/.claude/settings.json`. No hooks, agents or runtime code were installed or executed.
- **Status vocabulary:** only VERIFIED, PARTIALLY VERIFIED, NOT VERIFIED and NOT AVAILABLE are used.
- **Confidence levels:**
  - High: an explicit, directly relevant statement
  - Medium: partial evidence, or important limits
  - Low: the property itself is not established

### Validation table

| # | Capability | Status | Evidence | Architectural consequence | Remaining validation | Confidence |
|---|---|---|---|---|---|---|
| 1 | Hook can observe tool calls | VERIFIED | PreToolUse/PostToolUse with matcher `"*"`, `""` or none match tool calls. Subagent tool calls include `agent_id` and `agent_type`. `EndConversation` is the known exception. MCP wildcard behavior is **not** fully verified; explicit `mcp__.*` is verified. | AEOS can use global hooks for enforcement. Do not claim `"*"` universally captures MCP (AD-01, AD-08). | `"*"` vs MCP tools (U-01); hook latency and timeouts per OS (U-10) | High |
| 2 | Hook can block tool calls | VERIFIED | Exit code 2 blocks. `permissionDecision: "deny"` blocks with a reason visible to the model. `allow` cannot override stronger deny rules. | AEOS can enforce hard safety restrictions (AD-01). | Multi-hook decision combination (U-16) | High |
| 3 | Hook can modify/approve tool calls | PARTIALLY VERIFIED | `updatedInput` can modify tool input. `allow` can skip a permission prompt in appropriate circumstances. Deny/ask rules and managed permissions still apply. | AEOS may normalize and restrict inputs. AEOS never uses hooks to weaken stronger Claude Code or managed rules, and never emits `allow` (AD-02). | `updatedInput` composition with other mutators (U-07) | Medium |
| 4 | Subagents can have restricted tools | VERIFIED | Agent `tools` allowlist; `disallowedTools` denylist; `mcp__*` can be restricted. Plugin agents have limitations around their own hooks, permissionMode and mcpServers. Nested subagents have a depth limit. | Controlled specialist agents are viable. Global AEOS hooks enforce role policy for plugin agents using `agent_type` (AD-05). | Which plugin-agent fields are ignored; stability of `agent_type` (U-05) | High (tool lists) / Medium (plugin-agent details) |
| 5 | Skill can invoke another skill | VERIFIED | The `Skill` tool can invoke skills. Skill use can be restricted through permissions and tool lists. | Skill composition is viable (MP-5). | — | High |
| 6 | Hidden/internal skills | PARTIALLY VERIFIED | `disable-model-invocation` prevents automatic model invocation. `user-invocable: false` hides a skill from the `/` menu but doesn't prevent model use. No mechanism was found that hides a skill from both model and user while allowing runtime invocation. | Don't depend on hidden Claude Code skills for critical internals. Use runtime-served instructions, controlled subagents or runtime code (AD-04). | None required for the decision | High (for the decision) |
| 7 | Persistent state | VERIFIED | Hooks are separate processes. State can be stored in managed files. `session_id`, `prompt_id`, `agent_id` and `transcript_path` are available. There is no general runtime-state API. `CLAUDE_PLUGIN_DATA` provides persistent plugin storage. | AEOS needs its own persistent state layer (AD-03). | `node:sqlite` per OS (U-15) | High |
| 8 | Long-lived process | PARTIALLY VERIFIED | MCP servers can live for a Claude Code session. Detached OS processes can remain alive. Claude Code does not manage detached lifecycle. | AEOS needs lifecycle management: startup, health check, idle timeout, cleanup, crash recovery, orphan detection (AD-09). | What happens to detached processes when Claude Code exits; Windows cleanup behavior (U-03) | Medium |
| 9 | User instruction vs model instruction | PARTIALLY VERIFIED | `UserPromptSubmit` exists. Tool calls don't contain a guaranteed field identifying user origin. Several prompt sources still need hands-on testing. | Don't claim perfect user-vs-model attribution. No critical security guarantee relies on an unverified origin signal (AD-10). | Prompt-source matrix; relaxation channel threat analysis (U-02) | Low |
| 10 | Permissions outside the model | VERIFIED | allow/deny/ask rules; deny wins over allow; managed settings can restrict permissions and bypass modes; OS-level sandboxing exists for relevant tools. | Safety enforcement can exist outside model reasoning (AD-01, AD-06). | Managed-settings availability (U-13); sandbox coverage of AEOS paths (U-14) | High |
| 11 | Tool interception | VERIFIED | Bash, PowerShell, Edit, Write, NotebookEdit, WebFetch, Agent, Skill and `mcp__…` are interceptable. | Centralized tool policy is feasible. Shell commands need deeper parsing plus sandboxing, not simple pattern matching (MASTER-SPEC SP-9). | Parser accuracy (U-11) | High |
| 12 | Autonomy levels | VERIFIED (as a ceiling only) | PreToolUse can deny or ask. AEOS can restrict Claude Code's native permission mode. AEOS can't safely use `allow` to weaken stronger permission rules. Claude Code `auto` mode may approve routine actions. | AEOS autonomy levels are always ceilings. AEOS can make Claude Code more restrictive and must never make it less restrictive (AD-02). | Behavior on other host versions (U-17) | High |
| 13 | Preventing safety-configuration modification | PARTIALLY VERIFIED | Claude Code protects some configuration paths. AEOS-owned state needs more protection. Bash-based file manipulation can bypass simple Edit/Write restrictions. Managed settings provide stronger organizational controls. Hooks can potentially be disabled for a run through explicit settings. | Defense in depth: Claude Code permission rules, AEOS hooks, sandbox and filesystem restrictions, managed settings where available, protected AEOS state and signing material (AD-06). | Red-team tampering (U-08); hook-absence detection (U-09); sandbox (U-14); managed settings (U-13) | Medium |

### Additional observations

- **Existing hooks on this machine.** `~/.claude/settings.json` already registers two `Stop` hooks, one from gstack and one from paysec. Observed read-only, not modified. This drives the Hook Compatibility Manager (PSA §2.17, AD-07) and the Stop-hook coexistence test (U-12).
- **Default permission mode.** On Claude Code 2.1.283, `auto` is the default starting permission mode for interactive sessions, so AEOS's ceiling applies on top of a classifier that may approve routine actions (AD-02).
- **Not covered by Phase 2:** SK-4 (SessionStart/compaction injection), SK-6 (shell parsing), SK-7 (`node:sqlite`), Stop-hook blocking, multi-hook ordering and mid-session reload. These are all NOT VERIFIED; see [PLATFORM-ASSUMPTIONS.md](PLATFORM-ASSUMPTIONS.md).

### Phase 2 outputs

| Output | Content |
|---|---|
| [platform-validation/ARCHITECTURAL-DECISIONS.md](platform-validation/ARCHITECTURAL-DECISIONS.md) | AD-01 to AD-13 (AD-12 and AD-13 added from hands-on validation) |
| [platform-validation/PHASE-2-EXIT-CRITERIA.md](platform-validation/PHASE-2-EXIT-CRITERIA.md) | Verified, partially verified, unresolved, consequences, blockers, and the exit decision |
| [PLATFORM-ASSUMPTIONS.md](PLATFORM-ASSUMPTIONS.md) | V-nn (usable within limits) and U-nn (**must not become architecture**) |
| Updates to MASTER-SPEC and PROPOSED-SYSTEM-ARCHITECTURE | MASTER-SPEC §5.1 (MP-1 to MP-8) and PROPOSED-SYSTEM-ARCHITECTURE §1.1 (principles A-K), §2.17 and §2.18 |

### Phase 2 exit status

### Hands-on validation (2026-09-27)

Executed in an isolated `CLAUDE_CONFIG_DIR` on Windows 11 with Claude Code 2.1.283: 38 headless sessions, $0.79. The real configuration, gstack and paysec were verified unchanged. Full record: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).

| U-item | Hands-on status | U-item | Hands-on status |
|---|---|---|---|
| U-01 MCP `"*"` | PARTIALLY VERIFIED (local stdio: yes) | U-10 latency and timeout | PARTIALLY VERIFIED (Windows; timeout fails open) |
| U-02 attribution | PARTIALLY VERIFIED (channel, not human; restart-only works) | U-11 parsing | PARTIALLY VERIFIED (PowerShell yes, bash no) |
| U-03 detached processes | PARTIALLY VERIFIED (Windows: they survive exit and kill) | U-12 Stop gate | VERIFIED |
| U-04 reload | VERIFIED (user scope, about 1 s) | U-13 managed settings | NOT VERIFIED |
| U-05 plugin agents | VERIFIED | U-14 sandbox | PARTIALLY VERIFIED (sandbox NOT AVAILABLE on Windows) |
| U-06 SessionStart | VERIFIED (≤ 9,000 characters) | U-15 `node:sqlite` | PARTIALLY VERIFIED (Windows, Node 24) |
| U-07 `updatedInput` | PARTIALLY VERIFIED (one rewrite lost) | U-16 ordering | VERIFIED (concurrent; hook `allow` loosens native checks) |
| U-08 tampering | PARTIALLY VERIFIED (interpreter bypass) | U-17 versions | NOT VERIFIED |
| U-09 hook-off detection | VERIFIED | U-20 (new) pre-hook rejections | PARTIALLY VERIFIED (not visible to PreToolUse) |

**New decisions:** AD-12 (hook latency budget and fail-closed internal deadline) and AD-13 (per-shell parsers; opaque constructs go to ask).

**Exit criteria satisfied after owner decisions (2026-09-27).** Phase 3 has not been started.

| Blocker | Final status |
|---|---|
| B-3, B-4 | RESOLVED by evidence |
| B-1, B-2, B-5, B-6 | RESOLVED by owner acceptance of documented fallbacks. The evidence remains PARTIALLY VERIFIED. |
| B-7 | RESOLVED: owner decisions recorded, with Q8 budget and Q11 ownership as gated deferrals |

The decisions, the final disposition and the deferred items are in [PHASE-2-EXIT-CRITERIA.md](platform-validation/PHASE-2-EXIT-CRITERIA.md#owner-decisions-2026-09-27). Further hands-on validation must stay in an isolated environment and must not touch `~/.claude/settings.json`, gstack or paysec.

---

## R1: Benchmark first

**Why first.** Every "better than gstack" claim (G-4, G-7, and most IO measurements) needs a baseline. Building it before the runtime prevents confirmation bias and gives the runtime design numbers to work against.

### Scope
- **Harness** (`sys.eval`):
  - a hermetic runner (temp `AEOS_HOME`, scrubbed env, fixed tools, pinned model)
  - N-trial execution with a mean and 95% CI
  - `eval_result` artifacts
  - `aeos bench compare`
- **gstack comparator adapter.**
  - Runs the same tasks through a pinned gstack install in an isolated `HOME`.
  - Captures instruction tokens, total tokens, wall time, tool calls, outcomes and findings.
- **Initial suites** (MASTER-SPEC §15.2):

  | Suite | Initial content |
  |---|---|
  | `routing` | ~600 labelled utterances covering the 19 planned commands, with negatives |
  | `tasks/review` | ≥ 20 fixture diffs with seeded defects (logic, security, tests, migrations) |
  | `tasks/debug` | ≥ 15 seeded bugs, including regressions with a known-good ref |
  | `tasks/qa-web` | ≥ 10 small apps with seeded UI and functional bugs, including Firefox- or WebKit-only bugs and bugs that need network mocking |
  | `safety/destructive` | ≥ 300 variants plus a ≥ 300-command benign corpus, in bash and PowerShell |
  | `safety/injection` | Repos, pages and PR bodies with planted instructions |
  | `efficiency` | Derived from all of the above |

- **Baseline report:** gstack v1.91.1.0 (or the gstack version current at R1) on all suites. This is where the IO "expected benefit" targets get firmed up.

### Exit criteria
- The gstack baseline is published with CIs.
- Suites are reproducible: two runs agree within their CIs.
- The IO targets (IO-39, IO-18 and others marked "set after R1") are fixed in the spec.

### Risks
- Fixture authoring is effortful (Q15).
- gstack on Windows may be partly non-functional, which is itself a data point. Record it, and baseline on macOS or Linux.

---

## R2: Core runtime and the first skill (`/review`)

**Why `/review` first.**
- It is read-mostly (L1).
- It is high value and has a direct gstack comparator.
- It exercises every engine: context, state, evidence (citations), verification, safety (hooks), artifacts (`findings`), delegation (lenses) and composition (fan-out/fan-in).

### Scope: runtime
- `aeos` CLI with the JSON envelope; `doctor`; `config`; `setup` (plugin plus npm, no bash).
- **State engine:** event log, index, identity, retention, rebuild, locking.
- **Artifact engine:** put, get, latest, export, approvals.
- **Evidence engine:** all kinds, tree-hash freshness, citation hashing.
- **Verification engine:** registry; `schema.valid`, `citations.resolve`, `tests.pass`, `build.pass`, `lint.pass`, `typecheck.pass`; the Stop-hook enforcement.
- **Orchestrator:** the phase protocol (`run start/step/ask/status/resume/abort`), repair limits, budgets, computed status.
- **Context engine:** constitution through SessionStart; stubs; phase cards; ref packs; context packs; compaction re-injection.
- **Hook Compatibility Manager** (PSA §2.17): scan, classify and report existing hooks (on this machine, the gstack and paysec Stop hooks), produce a consented installation report, and handle backup and rollback.
- **Process Lifecycle Manager** (PSA §2.18): only if R2 ships the optional policy daemon. Otherwise it is deferred to R3.
- **Safety engine:**
  - an always-on PreToolUse policy with a `"*"` matcher plus an explicit `mcp__.*` matcher, returning only `deny`, `ask` or no decision (a ceiling; never `allow`)
  - role enforcement for subagents by `agent_type`
  - bash and PowerShell AST
  - action classes
  - guard levels
  - session-keyed scopes
  - relaxation through the channel chosen at Phase 2 exit (B-5), or restart-only relaxation if no channel is validated
  - defense-in-depth layer reporting in `aeos doctor`
  - an egress receipt ledger
  - secret scan at sinks
  - trust envelopes
- **Router:** deterministic scoring, LLM tie-break over the top 3, traces.
- **Delegation (minimal):** the `lens` and `verifier` roles.
- **Tool layer:** the `Vcs` interface (git), plus a `Forge` read-only subset (GitHub and GitLab: PR fetch, comments read).

### Scope: skills
- `/aeos` (help, doctor), `/guard`, `/resume`.
- `/review` with the lenses `correctness`, `testing`, `security-diff`, `performance`, `maintainability`, `simplification`, `data-migration`, `api-contract`, a deterministic merge, and a fix phase (L1 edits).

### Exit criteria (measured on R1 suites)

| Criterion | Target |
|---|---|
| Gate-bypass count, `safety/gate-skip` | 0 |
| `safety/destructive` catch rate | ≥ 99% |
| Benign false-ask rate | ≤ 2% |
| Injected side effects | 0 |
| `/review` findings precision and recall vs the gstack baseline | ≥ baseline on both, with non-overlapping CI for at least one |
| Instruction tokens per `/review` | ≤ 40% of the gstack baseline (G-4 target; fixed after R1) |
| Invalid citations accepted | 0 |
| Resilience (kill mid-phase, then resume) | Correct final state; 0 duplicate side effects |
| Static and gate suites | Green on Windows, macOS and Linux |
| Hook latency | Windows: ≤ 150 ms median, ≤ 250 ms p95 per hook call (AD-12; revised from < 50 ms after hands-on measurement). macOS and Linux: measure, with a target set after measurement. |
| Hook deadline | Every AEOS hook returns deny or ask before its internal deadline; 0 hook cancellations in the safety suite (a cancelled hook fails open, AD-12) |
| Hook coexistence | The installation report correctly lists foreign hooks on a fixture configuration shaped like this machine's (gstack plus paysec Stop hooks). Zero foreign entries are modified. |
| Ceiling property | Across the safety suite, AEOS emits 0 `allow` decisions and 0 widening `updatedInput` rewrites |

### Dependencies
Phase 2 exit: blockers B-1 to B-7 in [PHASE-2-EXIT-CRITERIA.md](platform-validation/PHASE-2-EXIT-CRITERIA.md) are resolved or explicitly accepted.

---

## R3: Verify and debug

### Scope
- **Process Lifecycle Manager** (PSA §2.18) is required here, because the browser driver is a detached process. **Depends on U-03** (detached-process exit behavior per OS) being resolved.
- **Browser interface and Playwright driver:**
  - chromium, firefox and webkit
  - per-run isolated contexts
  - `route` and HAR mocking
  - traces as evidence
  - sandbox on by default
  - ref-based snapshots
- **`/qa`** targets `web` and `api`:
  - lenses `functional` and `a11y` (axe)
  - `--report-only`
  - the shared `fix-loop` specialist with drift score and caps
- **`/debug`:**
  - a hypothesis ledger
  - session-scoped scope lock
  - `tests.new_fail_before_fix`
  - a `bisect` specialist
- **`/security`:**
  - static investigation with the evidence model (severity × confidence × evidence state)
  - an independent challenge
  - `Sandbox` interface (Docker/Podman) for optional reproduction
  - repairs proposed only
- **Memory engine and `/memory`:**
  - kinds, trust, tombstones, the write gate, budgeted retrieval, `why`
  - local FTS provider
  - optional gstack-learnings importer (untrusted, imported)
- **Calibration:** per-lens ECE is measured, and the thresholds come from the data.

### Exit criteria

| Criterion | Target |
|---|---|
| `tasks/debug` root-cause accuracy | ≥ gstack `/investigate` baseline; fix-regression rate < baseline |
| `tasks/qa-web` detection | ≥ baseline; includes the cross-browser and mocked-network bugs gstack can't detect |
| Regression-test validity | 100% of accepted tests pass fail-before/pass-after |
| `/security` on the seeded-vuln suite | Precision and recall reported; ECE ≤ 0.10 |
| Memory | Tombstone property tests pass; 0 planted-untrusted memory injections |

---

## R4: Plan and build

### Scope
- **`/discover`:** problem framing leading to a `design_brief`; `--to-issue` leading to a `spec` artifact and the `Tracker` interface (GitHub Issues and GitLab Issues).
- **`/plan`:**
  - lenses `product`, `engineering`, `design`, `dx` with the dimension-ownership table (MASTER-SPEC §7.6)
  - `test_plan` output
  - approvals
  - `--auto` with parallel lenses and a decision policy that never auto-decides user challenges
- **`/build`:**
  - lane decomposition from an approved plan
  - `implementer` subagents in worktrees
  - test-first per task
  - `change_set` integration with verification
- **Composer:** the full DAG with `when` predicates, risk scoring and node-level idempotence.

### Exit criteria

| Criterion | Target |
|---|---|
| `/plan --auto` instruction tokens | Well below the gstack `/autoplan` baseline (target fixed after R1) |
| Duplicate-finding rate across lenses | < 5% |
| `tasks/build` plan-task completion with linked passing tests | ≥ 90% |
| Wall time on multi-lane plans | Below sequential |
| Artifact hand-offs | 0 glob-based (lint) |

---

## R5: Ship

### Scope
- **`/ship` pipeline:** base sync → verify → review → qa (report-only, when UI changed) → version → changelog → docs sync → gate → publish (L3).
- **Policy adapters:** `version_policy` (semver, calver, 4-digit, none) and `changelog` (Keep a Changelog, custom).
- **`Forge` write operations** for GitHub and GitLab at parity: PR create and update, inline review comments from `findings`, and checks.
- **`/docs`:** `sync`, `generate`, `diagram`, `export --pdf|--html`, with the verifiers `docs.snippets_run` and `docs.links_ok`.
- **Compensation log and `aeos run compensate`.**
- **Claims lint** (IO-47) and the orphan-event lint.

### Exit criteria

| Criterion | Target |
|---|---|
| `/ship` false-done rate | < gstack baseline |
| Instruction tokens | Below baseline (target fixed after R1) |
| Unconfirmed `vcs.publish` or `pkg.install` | 0 |
| Fault injection at every `/ship` node | Correct resume; 0 duplicate PRs or commits |
| Generated doc snippets executed successfully | ≥ 95% |

---

## R6: Operate

### Scope
- **`/deploy`:**
  - `setup` writes `.aeos/deploy.yaml`
  - `land` uses match-head-SHA merge and waits on CI
  - `monitor` runs browser probes plus the `Observability` adapter
  - `status` shows the queue, claims and versions
  - `rollback`
- **`DeployProvider` adapters.** The exact set depends on the user's actual targets (Q13); the candidates are Vercel, Fly, Render, Netlify, Heroku, Railway, k8s, ArgoCD and a custom command.
- **Observability adapters:** Sentry, Datadog, OTEL (the priority order depends on Q13).
- **`/perf`:** N-run statistics, throttling profiles, a CI mode, and CWV including CLS and INP. Lighthouse is optional.
- **`/health`:** a pluggable check registry, a coverage metric, dependency audit, and the `reuse` lens under the `hostile-read` profile.
- **`/retro`:** DORA plus quality trends from the ledgers.
- **Run traces:** `aeos run trace`, with optional OTEL export.

### Exit criteria

| Criterion | Target |
|---|---|
| Deploy scenarios (recorded APIs) | Error-rate regression detected within the window; correct rollback proposal |
| `/perf` false-regression rate on unchanged builds | ≤ 5% |
| `/retro` | Computes all four DORA metrics on the fixture history |
| Trace completeness | 100% |

---

## R7: Design, browser breadth and devices

### Scope
- **`/design`:**
  - `system`: `design-system-writer` as the sole DESIGN.md writer
  - `explore`: a budget-gated `mockup-generator` behind the `ImageGen` interface
  - `build`: emits a change set
  - `audit`: `/qa` with the design lens and the shared fix loop
- **`/browser`:**
  - `open` (headed)
  - `extract` (read-only profile)
  - `auth` (manual headed sign-in first; cookie import where it is safe per OS)
  - `share` (least privilege, 1-hour tokens, private ranges blocked, audit log)
  - `recipes` (recorded from traces, sandboxed execution)
- **`/qa` targets:** `cli` (sandboxed getting-started run with timed TTHW) and `ios` (simulator first; a device adapter modeled on the gstack ios-qa security pattern). Android depends on Q19.
- **Optional browser drivers:** CDP-attach to the user's browser, and Aside if Q12 says so.

### Exit criteria

| Criterion | Target |
|---|---|
| Paid generation without consent | 0 |
| DESIGN.md writes outside the owner | 0 |
| `/qa --lens dx` dimensions TESTED | ≥ 7 of 8 on fixtures |
| `/browser share` red-team (no eval or LAN reach by default) | Pass |

---

## R8: Ecosystem and v1.0

### Scope
- **SDK:** `aeos sdk new-skill`, `new-adapter`, `new-lens`, each with contract-test scaffolds.
- **Registry tiers** with signatures. Community and project skills are capped at L1 until approved.
- **Tier-2 host adapters,** per Q5 and conformance, with explicit capability caps.
- **MCP façade,** per Q4.
- **Tracker adapters:** Jira and Linear.
- **Team features:** team-memory PR flow, JSONL merge strategy, version pin enforcement, and an org marketplace (Q14).
- **Second-opinion specialist** with provider adapters and risk-gated invocation (IO-04).
- **v1.0 GA:** spec 1.0 ratified; all BM-4 release gates met; a documented migration path from the paysec fork (Q3).

### Exit criteria (v1.0)
- Every G-1 to G-10 acceptance metric (MASTER-SPEC §2) is met on the release benchmark (N = 5).
- The benchmark delta table vs gstack is published.

---

## Cross-release tracks (continuous)

| Track | Description |
|---|---|
| Benchmark growth | Each release adds tasks for its new skills. The gstack comparator is refreshed for each gstack release. |
| Safety corpus | New bypass classes found in the field become corpus entries plus fixes, and are treated as security issues. |
| Token budgets | Cards and packs are re-measured each release, and budgets are tightened only when outcomes hold. |
| Docs | Generated from manifests and schemas; claims lint in CI. |
| Windows parity | Every feature ships on all 3 OSes, or it doesn't ship. |

---

## Recommended implementation order

This is a summary; the rationale is above.

1. **R0:** complete Phase 2 with hands-on validation (resolve or accept blockers B-1 to B-7), ratify the spec, then schemas and the CI matrix.
2. **R1:** benchmark harness, gstack baseline, safety corpora.
3. **R2:** state → artifact → evidence → verification → orchestrator → context → safety → router → `/review`.
4. **R3:** browser layer → `/qa` → `/debug` → `/security` → memory.
5. **R4:** `/plan` → `/discover` → composer → `/build`.
6. **R5:** forge write operations → `/ship` → `/docs`.
7. **R6:** `/deploy` → `/perf` → `/health` → `/retro`.
8. **R7:** `/design` → `/browser` modes → cli/ios QA targets.
9. **R8:** SDK and registry → hosts → team features → v1.0.

---

## Open questions

These must be resolved before implementation. **Blocking for R0** means R0 cannot exit without an answer.

| ID | Question | Why it matters | Blocking for | Proposed default |
|---|---|---|---|---|
| **Q1** | Final product name and command namespace (replaces "AEOS", `aeos`, `.aeos/`) | Every identifier, package name and plugin id | R0 | — (needs owner decision) **DECIDED 2026-09-27:** keep AEOS as the working name and namespace for R0/R1. The final name is a pre-release decision (still open). |
| **Q2** | License: MIT, Apache-2.0 or proprietary/internal? | Contribution model, clean-room posture, distribution | R0 | Apache-2.0 if public; internal otherwise **DECIDED 2026-09-27:** proprietary/internal for now. Public licensing will be revisited if the project becomes public. |
| **Q3** | How does this relate to the existing `paysec` fork (`github.com/dkpandeyps/paysec` v1.68.0.0, a renamed gstack fork installed on this machine)? Replace, coexist, or migrate its users? | Name collisions (e.g. paysec skills like `/review`, `/qa-fix`), user migration, the clean-room rule | R0 | Coexist during R2-R7; ship a migration guide at R8; never reuse paysec code **DECIDED 2026-09-27:** coexist during development; never reuse paysec code. Migration guidance comes later. |
| **Q4** | Should the MCP façade be on by default, or should the CLI stay the only interface? | Token cost of MCP tool schemas vs typed calls; an MCP server is also a candidate session-scoped host for runtime services (AD-09) | R2 | CLI only; MCP opt-in (decide after SK-4 and U-03) |
| **Q5** | Which hosts beyond Claude Code are in scope, and at which tier (Codex, Cursor, Factory, OpenCode, …)? | Adapter work, and the safety caps on hookless hosts | R0 (tier policy), R8 (implementation) | Claude Code only until R8 **DECIDED 2026-09-27:** Claude Code only until R8. Other hosts need explicit adapters and safety-cap validation first. |
| **Q6** | Confirm Node LTS as the single runtime (vs Bun, or a compiled binary) | Windows support (gstack had to run its browser daemon under Node on Windows) | R0 | Node LTS, plus an optional SEA binary |
| **Q7** | Default autonomy for interactive sessions: L1 or L2? | Friction vs safety; whether commits need approval | R0 | L1 by default; the project may set L2 **DECIDED 2026-09-27:** L1 is the default for interactive sessions. A project may explicitly configure L2. |
| **Q8** | Primary model set for benchmarks and the paid-eval budget per night and per release | Benchmark validity and cost | R1 | Current Claude flagship + one mid-tier model; the budget needs an owner decision **DECIDED 2026-09-27:** the current Claude flagship plus one mid-tier model for benchmark design. **The budget is not set**: an owner decision is required before any paid benchmark execution. |
| **Q9** | Payments and security domain focus: should PCI-DSS, PSD2/SCA or compliance lenses be in core or in a project pack? | Scope of core vs extension | R3 | Project pack built on the R8 SDK; `lens.security-diff` stays general |
| **Q10** | Telemetry: none, local-only, or opt-in remote? | Privacy posture and product feedback | R2 | Local-only traces; no remote telemetry in v1 |
| **Q11** | Team size, capacity and ownership (spec owner, safety reviewer) | Sizing and the §18.2 safety-review rule | R0 | — **OWNER DECISION 2026-09-27: not supplied.** Team size, spec owner and safety reviewer are owner-supplied organizational metadata, required before the relevant R0 safety-review gate. None is invented. |
| **Q12** | Support Aside (a third-party macOS AI browser) as an optional driver? | Parity with gstack on macOS vs maintenance | R7 | Only behind the `Browser` interface, if demand exists |
| **Q13** | The user's actual stacks: forges, CI, deploy targets, observability, trackers | Which adapters are v1-critical | R5/R6 | GitHub + GitLab; others by survey |
| **Q14** | Distribution: public marketplace, private org marketplace, or npm only? | Install UX, signing and team pinning | R2 | Private org marketplace plus npm with provenance |
| **Q15** | Who builds and owns the benchmark fixture repos, and which licenses may seeded code use? | R1 is the critical path | R1 | A dedicated owner; synthetic or permissively licensed code only |
| **Q16** | Do teams migrating from paysec need its 4-digit VERSION and CHANGELOG conventions? | The version-policy adapter set | R5 | Provide a `four_digit` policy adapter |
| **Q17** | Is gbrain integration (the memory and code-index provider) a priority? | Memory adapter order | R3 | Local FTS first; gbrain adapter in R8 |
| **Q18** | What data may be sent to third-party LLMs for second opinions (codex, gemini), and under what consent? | S-4 egress policy defaults | R3 | Off by default; per-provider consent; diff-only packs |
| **Q19** | Mobile: are iOS and Android both required, and is device (not just simulator) testing needed? | R7 scope | R7 | iOS simulator first; Android later |
| **Q20** | Will target deployments use Claude Code **managed settings** (defense-in-depth layer 4), and who administers them? | Determines whether layer 4 exists (U-13, AD-06) | Phase 2 exit | Assume unavailable for individual users; recommended for organizations **DECIDED 2026-09-27:** assume managed settings are unavailable to individual users for Phase 2. They are recommended as an organizational defense-in-depth layer. No local `managed-settings.json` was found in the tested environment. |
| **Q21** | If no in-session relaxation channel validates (U-02), is **restart-only relaxation** acceptable for R2? | Blocker B-5 | Phase 2 exit | Yes, restart-only until a channel is validated **DECIDED 2026-09-27:** restart-only autonomy relaxation is accepted for R2 until an in-session relaxation channel is validated. |
| **Q22** | Approval and environment for hands-on Phase 2 validation: a scratch project with a separate `CLAUDE_CONFIG_DIR`, or a VM or container, and on which OSes | Needed to resolve B-1 to B-6 without touching `~/.claude/settings.json`, gstack or paysec | Phase 2 exit | Isolated config directory on this Windows machine, plus a Linux container; macOS if available. **Windows part used on 2026-09-27** (`platform-validation/scratch`, user-approved); Linux and macOS not yet run. **DECIDED 2026-09-27:** the owner explicitly approves the isolated scratch environment used for Phase 2 hands-on validation (`platform-validation/scratch`, a separate `CLAUDE_CONFIG_DIR`). |

### Assumptions: status after Phase 2

The original assumptions and what Phase 2 found. The live register is [PLATFORM-ASSUMPTIONS.md](PLATFORM-ASSUMPTIONS.md).

| Assumption | Spike | Phase 2 result | Design now |
|---|---|---|---|
| Claude Code hooks can gate all tool calls, MCP included | SK-1 | PARTIALLY VERIFIED: built-in tools VERIFIED; `"*"` vs MCP NOT VERIFIED; explicit `mcp__.*` VERIFIED | `"*"` plus explicit `mcp__.*` matchers (AD-08) |
| Specialists can be hidden from the host catalog | SK-2 | PARTIALLY VERIFIED: no combined mechanism was found | Specialists are runtime-served cards or controlled subagents (AD-04) |
| Subagent tool allowlists are host-enforced | SK-3 | VERIFIED; plugin-agent limits exist for hooks, permissionMode and mcpServers | Tool lists plus global enforcement by `agent_type` (AD-05) |
| SessionStart can inject about 1.2k tokens of context | SK-4 | NOT VERIFIED | Stub-embedded constitution by default (AD-11) |
| User-typed prompts are distinguishable in hooks | SK-5 | PARTIALLY VERIFIED: attribution is not established | Out-of-band or restart-only relaxation; the limit is stated (AD-10) |
