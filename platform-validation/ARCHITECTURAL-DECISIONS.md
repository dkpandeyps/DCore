# AEOS Architectural Decisions: Phase 2 Platform Validation

> **Scope.** Decisions forced or constrained by the Phase 2 validation of Claude Code capabilities.
> **Evidence baseline:** Claude Code **2.1.283**.
> - **Stage 1:** a review of the official Claude Code documentation, plus read-only inspection of the local `~/.claude/settings.json`.
> - **Stage 2 (2026-09-27):** hands-on execution in an isolated `CLAUDE_CONFIG_DIR` on Windows 11: 38 headless sessions and experiments E-00 to E-17. See [HANDS-ON-VALIDATION-REPORT.md](HANDS-ON-VALIDATION-REPORT.md).
> - Hands-on evidence is **Windows-only** unless stated otherwise.
> **Status vocabulary:** VERIFIED · PARTIALLY VERIFIED · NOT VERIFIED · NOT AVAILABLE.
> **Related:**
> - [ROADMAP.md § Phase 2](../ROADMAP.md#phase-2-claude-code-platform-capability-validation)
> - [PHASE-2-EXIT-CRITERIA.md](PHASE-2-EXIT-CRITERIA.md)
> - [PLATFORM-ASSUMPTIONS.md](../PLATFORM-ASSUMPTIONS.md): V-nn and U-nn
> - [MASTER-SPEC.md §5.1](../MASTER-SPEC.md): MP-n
> - [PROPOSED-SYSTEM-ARCHITECTURE.md §1.1](../PROPOSED-SYSTEM-ARCHITECTURE.md): principles A-K
>
> **Confidence scale:**
> - **High:** directly supported by VERIFIED evidence.
> - **Medium:** supported by PARTIALLY VERIFIED evidence, or depends on untested behavior that has a safe fallback.
> - **Low:** depends on unresolved behavior with no complete fallback yet.

## Index

| ID | Decision | Confidence |
|---|---|---|
| AD-01 | Runtime enforcement | High |
| AD-02 | Autonomy ceiling | High |
| AD-03 | Persistent state | High |
| AD-04 | Specialist capability delivery | High |
| AD-05 | Plugin-agent enforcement | High |
| AD-06 | Safety configuration protection | Medium |
| AD-07 | Hook compatibility | High |
| AD-08 | MCP interception | High (local stdio MCP) / NOT VERIFIED (plugin and remote MCP) |
| AD-09 | Detached runtime lifecycle | High (Windows) |
| AD-10 | User authority boundary | Medium |
| AD-11 | Constitution and context delivery | High |
| AD-12 | Hook latency budget and timeout handling (new, from hands-on) | High (Windows) |
| AD-13 | Shell command analysis (new, from hands-on) | Medium |

---

## AD-01: Runtime enforcement

### Decision
AEOS enforces policy, permissions, state transitions, evidence and completion **in its runtime and hooks, outside model reasoning**. The model proposes actions, and AEOS validates them. Run status is computed by the runtime from verifier evidence and is never accepted from the model.

### Evidence
From the documentation review:
- PreToolUse/PostToolUse with matcher `"*"`, `""` or none match tool calls. Subagent calls include `agent_id` and `agent_type`. `EndConversation` is excluded. (VERIFIED)
- Hooks block with exit 2 or `permissionDecision: "deny"`. (VERIFIED)
- Settings rules and managed settings enforce permissions outside the model. There is no general runtime-state API. (VERIFIED)

**Hands-on (2026-09-27):**
- `"*"` hooks fired for every tool call that reached execution, including subagent calls, which were tagged with `agent_type`. (E-00, E-01, E-16)
- Deny and exit 2 blocked calls (E-05, cases 1 and 2).
- Calls rejected earlier by deny rules **never reached** PreToolUse (U-20, E-11).

### Why
- gstack's central weakness is prose-only orchestration (GSTACK-ARCHITECTURE-ANALYSIS §0, §9).
- The host provides interception points but no state or orchestration facility, so enforcement must be built, and it can be.

### Alternatives Considered
1. **Prose-only rules** (the gstack model). Rejected: unenforceable.
2. **Rely only on Claude Code permission rules.** Rejected: pattern rules miss indirect shell forms (E-11: an interpreter bypass), and they cannot express run-level state.
3. **An external supervisor wrapping Claude Code.** Rejected for v1: it can't see tool calls without hooks anyway.

### Consequence
- AEOS needs a runtime (a CLI plus hooks) with state, policy and verification engines (PSA §2).
- Hook coverage is described as "every tool call that reaches execution". The audit trail doesn't include calls that native deny rules rejected before any hook (U-20).

### Confidence
High.

### Remaining Validation
- Latency on macOS and Linux (U-10; see AD-12).
- Behavior on other host versions (U-17).
- Whether `PermissionDenied` or `PostToolUseFailure` hooks can observe pre-hook rejections (U-20).

---

## AD-02: Autonomy ceiling

### Decision
AEOS autonomy and guard levels are **ceilings**. They can make Claude Code more restrictive and never less. AEOS hooks:
- return only `deny`, `ask` or no decision
- **never return `allow`**
- use `updatedInput` only for provably narrowing normalizations
- never loosen permission rules or managed settings

Effective behavior is the most restrictive of Claude Code's mode and rules, managed settings, and AEOS level, guard and scope.

### Evidence
- From the documentation review: PreToolUse can deny or ask; `allow` cannot override stronger deny rules; `updatedInput` modifies input.
- **Hands-on (E-05):**
  - Case 3: `allow` from one hook plus `deny` from another resulted in **blocked**.
  - Case 9: a hook `allow` against a settings deny rule resulted in **blocked**.
  - **Case 7: a hook `allow` made a `New-Item` run that Claude Code natively blocked** ("may only access files in the allowed working directories"). Case 8, the control without `allow`, was blocked.
  - `ask` in a headless session resulted in blocked (case 6).
  - With two rewrites, only one survived (case 4, U-07).

### Why
Case 7 demonstrates empirically that `allow` **loosens** native controls. An AEOS that emitted `allow` would be a weakening layer. Only monotonic restriction composes safely with host and organizational controls.

### Alternatives Considered
1. **AEOS as the permission authority** (return `allow` for actions AEOS deems safe). Rejected: case 7 proves it weakens native checks.
2. **Map AEOS levels onto Claude Code permission modes.** Rejected as the mechanism: modes are coarse and user-switchable. They are used as inputs only.

### Consequence
- MASTER-SPEC AU-0, S-9, SP-1a. PSA §2.6.
- **Foreign hooks that emit `allow` weaken the session.** The Hook Compatibility Manager reports them (AD-07). AEOS's own `deny` still wins over them (case 3).

### Confidence
High.

### Remaining Validation
- Which rewrite wins when several hooks mutate a call (U-07).
- Behavior in `auto` and `bypassPermissions` modes, which hands-on testing did not cover.
- Other host versions (U-17).

---

## AD-03: Persistent state

### Decision
AEOS maintains its **own** persistent state layer: an event-sourced log plus a rebuildable index, keyed by project, worktree and session. It uses hook-provided identifiers for correlation.

### Evidence
- From the documentation review: hooks are separate processes; `session_id`, `prompt_id`, `agent_id` and `transcript_path` are available; there is no runtime-state API; `CLAUDE_PLUGIN_DATA` is persistent. (VERIFIED)
- **Hands-on:**
  - Every probe invocation was a new process with its own pid (E-01).
  - Hook input carried `session_id`, `prompt_id`, `tool_use_id`, `permission_mode` and `transcript_path` (E-03).
  - The test state files (session snapshots, heartbeats) worked across hook invocations and sessions (E-10, E-12).
  - `node:sqlite` in WAL mode handled 4 concurrent writer processes with 2,000 of 2,000 rows (E-17, Node 24 on Windows).

### Why
Phase sequencing, evidence freshness, scopes, consents and resumability need durable cross-call state, and hook processes are ephemeral.

### Alternatives Considered
1. **Conversation-held state.** Rejected: compaction and forgery.
2. **`transcript_path` as the state source.** Rejected: host-internal format with untrusted content.
3. **A daemon holding state in memory.** Rejected as the source of truth: detached processes are unmanaged (AD-09).

### Consequence
- PSA §2.3, MASTER-SPEC §14.1.
- The SQLite index is viable on Windows with Node 24. The JSONL fallback stays.

### Confidence
High.

### Remaining Validation
`node:sqlite` on other operating systems and Node versions (U-15).

---

## AD-04: Specialist capability delivery

### Decision
Specialist and internal capabilities are **not hidden Claude Code skills**. They are delivered as one of:
- runtime-served phase cards and reference packs
- controlled subagents with host-enforced tool lists
- runtime code

Skills are thin user-facing entry points.

### Evidence
- From the documentation review: `disable-model-invocation` and `user-invocable: false` each hide a skill from only one side, and no combined mechanism was found. (PARTIALLY VERIFIED)
- **Hands-on:**
  - A test skill invoked as `/aeostest-skill` fired `UserPromptExpansion`, then `UserPromptSubmit` (E-10).
  - Subagent tool allowlists were host-enforced (E-16).
  - Hidden-skill behavior itself was **not** hands-on tested.

### Why
Critical internals must not depend on a visibility mechanism that doesn't exist. Specialists as skills would cost catalog tokens and could be invoked out of context.

### Alternatives Considered
1. **Skills with `disable-model-invocation: true`.** Rejected: blocks runtime invocation too.
2. **Skills with `user-invocable: false`.** Rejected: the model can invoke them out of flow.
3. **Inline specialist text** (gstack). Rejected: token cost.

### Consequence
- PSA §3.2, MASTER-SPEC §7.1, MP-5.
- The phase-card server and the delegation manager are core runtime features.

### Confidence
High.

### Remaining Validation
None for the decision.

---

## AD-05: Plugin-agent enforcement

### Decision
Role policy for subagents is enforced by **global or plugin-level AEOS PreToolUse hooks keyed on `agent_type` and `agent_id`**, plus each role's `tools` and `disallowedTools`. AEOS does not rely on a plugin agent's own `hooks`, `permissionMode` or `mcpServers`. An unregistered `agent_type` is evaluated under the parent run's policy.

### Evidence
**Hands-on (E-16)**, same frontmatter declared on a plugin agent and a local agent:

| Field | Plugin agent | Local agent |
|---|---|---|
| `tools` / `disallowedTools` | Honored (the agent had only PowerShell and Read; no Write, no file) | Honored |
| Frontmatter `hooks` | **Ignored** | Fired |
| `permissionMode: acceptEdits` | **Ignored** (hook input showed `default`) | Honored (`acceptEdits`) |
| `mcpServers` | **Ignored** | Inconclusive |

- Global hooks saw all agent calls, with `agent_type` `aeostest:probe-agent` and `local-probe-agent`.
- A plugin-level `hooks/hooks.json` fired for both parent and agent calls.

### Why
AEOS ships as a plugin, so its role agents are plugin agents, and their own hook and permission settings are ignored. Enforcement must come from hooks that always run.

### Alternatives Considered
1. **Agent-frontmatter hooks.** Rejected: ignored for plugin agents (E-16).
2. **Copy agent definitions into user `~/.claude/agents/`.** Rejected as the default: it modifies user configuration (MP-8). It may be offered as a consented option.
3. **Tool allowlists only.** Rejected: they restrict *which* tools, not *how*.

### Consequence
- PSA §2.11.
- AEOS hooks ship as plugin-level `hooks/hooks.json` (verified to fire) and key role policy on the namespaced `agent_type` `<plugin>:<agent>`.

### Confidence
High.

### Remaining Validation
- Whether `agent_type` naming is stable across host versions (U-17).
- Local-agent `mcpServers` behavior (inconclusive, and not required).

---

## AD-06: Safety configuration protection

### Decision
Protection of safety configuration and AEOS-owned state uses **defense in depth**:
1. Claude Code deny/ask rules on AEOS paths, proposed with consent.
2. AEOS PreToolUse enforcement, including classifying interpreter one-liners as `opaque-exec`, which means `ask` or `deny`.
3. Sandbox controls **where available**.
4. Managed settings where deployed.
5. Protected AEOS state: OS ACLs on state and key files, hash-chained and signed security records, and fail-closed to `lockdown` on integrity failure.

**On Windows, where the sandbox was not available, layers 2 and 5 carry the load that layer 3 would.**

**Owner-accepted (B-6, 2026-09-27):** the Windows compensating design (OS ACLs on AEOS state, the opaque-exec policy and integrity checks) is accepted. It is **not equivalent to an OS sandbox**, and documents, `aeos doctor` and the constitution must never present it as one.

### Evidence
**Hands-on (E-11, E-13):**
- Deny rules blocked the Read, Write and Edit tools before PreToolUse.
- Claude Code's native PowerShell analysis blocked `Set-Content`, `>` redirects, `Get-Content`, `Copy-Item` and a variable-built path into the denied folder.
- `.claude/` writes were blocked as a sensitive file.
- The model could not overwrite the config directory's `settings.json` in `default` mode.
- **`node -e "fs.writeFileSync('protected/…')"` bypassed the deny rules and wrote the file.**
- **`sandbox.enabled: true` had no observable effect** and produced no sandbox activity in the debug log. The sandbox is NOT AVAILABLE in this Windows configuration.
- `disableAllHooks` for a run removed all hooks, and this was detectable (E-12).

### Why
- The interpreter bypass and the missing Windows sandbox mean no single layer holds.
- AEOS state must be unreachable by default (ACLs, locations outside the working directories), and interpreter execution must be gated.

### Alternatives Considered
1. **Claude Code protected paths only.** Rejected: they don't cover AEOS paths, and interpreters bypass deny rules.
2. **AEOS hooks only.** Rejected: hooks can be disabled for a run, and on timeout they fail open (AD-12).
3. **Require a sandbox.** Rejected: NOT AVAILABLE on this Windows configuration.
4. **Require managed settings.** Rejected as a hard requirement. They are recommended for organizations.

### Consequence
- MASTER-SPEC MP-4, SP-8, SP-10. PSA §2.3 and §2.6.
- `aeos doctor` reports the sandbox as *unavailable* on Windows, and reports the compensating controls separately. The two are never shown as equivalent.
- The constitution states the interpreter-execution limit.

### Confidence
Medium.

### Remaining Validation
- The sandbox on macOS and Linux (U-14). **Deferred** by the owner decision; not required for Phase 2.
- `auto` and `bypassPermissions` modes.
- OS-ACL protection of AEOS state as a design, which is untested.
- Managed-settings availability (U-13).

---

## AD-07: Hook compatibility

### Decision
A **Hook Compatibility Manager**:
- detects, classifies and reports all readable hooks, with their overlaps and conflicts
- produces a consented installation report with a diff, a backup and a rollback
- adds only ownership-marked AEOS entries
- **never** edits, reorders, removes or disables another owner's hook
- watches `ConfigChange`
- reports foreign hooks that emit `allow` or `updatedInput`

### Evidence
- The real `~/.claude/settings.json` holds gstack and paysec Stop hooks (read-only observation).
- **Hands-on (E-04, E-05, E-06, E-09):**
  - Hooks from several entries and several sources all run, **concurrently**.
  - Start order follows configuration order in 6 of 6 calls. **Completion order is non-deterministic.**
  - No ordering control was found.
  - A failing hook (exit 1) is non-blocking.
  - With two `updatedInput` hooks, one rewrite is lost.
  - The Stop gate worked alongside gstack- and paysec-shaped copies, including the unknown `_paysec_source` field, and a failing Stop hook.
  - A user-settings change applied mid-session within about 1 s and emitted `ConfigChange`.
  - Shell-string hook commands started 0.7-1.4 s later than `command`+`args` hooks.

### Why
Coexistence is the normal case. Foreign hooks can weaken AEOS (`allow`), conflict with it (`updatedInput`), or slow it (string commands). Silent overwrites would break other tools.

### Alternatives Considered
1. **Write AEOS hooks directly.** Rejected: MP-8.
2. **Refuse to install beside foreign hooks.** Rejected.
3. **Wrap foreign hooks in an AEOS dispatcher.** Rejected: it modifies other owners' configuration.

### Consequence
- PSA §2.17, MASTER-SPEC MP-6 and MP-8.
- AEOS hook decisions must be order-independent.
- **A restart is not required** after user-scope hook changes (U-04), but `ConfigChange` must be treated as a potential tamper signal.
- AEOS hook entries use `command`+`args`, never shell strings.

### Confidence
High.

### Remaining Validation
- Reload for project, plugin and managed scopes.
- Which foreign-hook sources are readable for the scan.
- Which `updatedInput` wins (U-07).

---

## AD-08: MCP interception

### Decision
AEOS registers an **explicit `mcp__.*` PreToolUse matcher** alongside `"*"`. Both are now evidenced to intercept local MCP tools. The explicit matcher remains the declared coverage mechanism. MCP tools must be classified by policy, and unknown ones default to `ask`.

### Evidence
**Hands-on (E-15)**, local stdio server via `--mcp-config`:
- **`"*"` captured all three MCP calls**, with tool name `mcp__aeostestmcp__echo_text` and full input.
- `mcp__.*` captured all three.
- Deny blocked the call before the server received it.
- `updatedInput` rewrote the text the server received.

Plugin-provided, remote and claude.ai-connector MCP servers were not tested.

### Why
MCP tools act on external systems. Explicit coverage is cheap, and it doesn't rest on untested server types.

### Alternatives Considered
1. **`"*"` only.** Now evidenced for local servers, but not for plugin or remote ones. Kept as a second line.
2. **Per-server matchers only.** Rejected as primary: it misses servers added later.

### Consequence
- MASTER-SPEC SP-1, PSA §2.6.
- `updatedInput` on MCP inputs reaches the external server, so the narrowing-only rule applies.

### Confidence
High for local stdio MCP servers. NOT VERIFIED for plugin and remote servers.

### Remaining Validation
- Plugin-provided MCP (`mcp__plugin_…`), remote HTTP/SSE servers and claude.ai connectors (U-01).

---

## AD-09: Detached runtime lifecycle

### Decision
Any detached process AEOS starts runs under a **Process Lifecycle Manager**. It provides:
- a single-instance lock with identity (pid, start time, command line)
- heartbeats
- health checks that never kill a busy process
- idle self-expiry
- orphan detection at session start and in `aeos doctor`
- identity-verified cleanup
- crash detection by heartbeat staleness

**No safety or verification guarantee may depend on a detached process being alive.**

### Evidence
**Hands-on on Windows (E-14):**
- Processes spawned by a SessionStart hook (detached, unref) and by the model via PowerShell `Start-Process` **survived normal session exit**.
- A hook-spawned process **survived an abrupt kill of Claude Code**.
- Claude Code didn't track or clean them up.
- A forced stop was detected through a stale heartbeat.
- Identity-verified cleanup stopped every test process, and the final sweep found none alive.

### Why
On Windows, the host leaves detached processes running indefinitely. Without AEOS-owned lifecycle management they leak and hold locks.

### Alternatives Considered
1. **No daemons.** Rejected as absolute, but minimized.
2. **An MCP server as the session-scoped host** (ROADMAP Q4). Still a candidate for session-bound services. Its lifecycle is host-managed per the documentation, but not hands-on tested.
3. **Rely on host or OS cleanup.** Rejected: evidenced **false** on Windows.

### Consequence
- PSA §2.18, MASTER-SPEC S-7 and S-10.
- Self-expiry and orphan scans are mandatory, not optional.

### Confidence
High on Windows.

### Remaining Validation
macOS and Linux (U-03).

---

## AD-10: User authority boundary

### Decision
- AEOS does **not** claim to distinguish human-authored instructions from model-generated ones.
- **Tightening** is accepted from any source.
- **Relaxation is restart-only:** the autonomy level is frozen per session at SessionStart, and a higher level takes effect only in a new session started by the user.
- In-session attempts to change relaxation state are denied.
- `UserPromptSubmit` is used for context and audit, never as authority.
- **Adopted by the owner for R2 (Q21, 2026-09-27)** until an in-session relaxation channel is validated.

### Evidence
**Hands-on (E-10):**
- `UserPromptSubmit` fired for each input-channel message and for slash commands (after `UserPromptExpansion`).
- It did **not** fire for subagent prompts or Stop-hook continuations.
- Tool calls carry the `prompt_id` of the triggering input message.
- **Restart-only simulation:**
  - The frozen READ_ONLY level denied every write, even after an out-of-band change to EXECUTE.
  - The model's attempt to edit the level file was denied.
  - A new session picked up EXECUTE, and the write succeeded.
- Untested: scheduled or loop prompts, cross-session messages, interactive TUI input.
- `UserPromptSubmit` identifies the **input channel**. In headless or SDK use, any controlling process is "the user".

### Why
- No verified human-attribution signal exists.
- The restart-only mechanism is technically workable and removes the need for one.
- Honest limits are safer than an unverified guarantee.

### Alternatives Considered
1. **Trust `UserPromptSubmit` content.** Rejected: channel, not human.
2. **An out-of-band confirmation command.** Possible, but its strength depends on AEOS-state protection (AD-06), which is PARTIALLY VERIFIED.
3. **Treat AskUserQuestion answers as authority for relaxation.** Not validated; not used.

### Consequence
- MASTER-SPEC AU-2, AU-2a, S-8. PSA §2.6.
- Raising autonomy costs a session restart.
- `prompt_id` gives auditable binding of tool calls to input messages.

### Confidence
Medium. The mechanism is evidenced and owner-adopted, but the protection of the level file still rests on AD-06, which is PARTIALLY VERIFIED.

### Remaining Validation
- The untested prompt sources (U-02).
- Validation of any in-session relaxation channel. Deferred; restart-only applies until then.

---

## AD-11: Constitution and context delivery

### Decision
The constitution is delivered through **SessionStart `additionalContext`**:
- It is re-issued on `source: compact`, and should be on `resume`.
- It must be **≤ 9,000 characters**, with the critical rules first.
- Every phase card still starts by querying `aeos run status`.

The stub-embedded fallback is kept only for hosts without SessionStart.

### Evidence
**Hands-on (E-07, E-08):**
- A rule token was delivered at startup and recalled after 3 intervening turns.
- `/compact` fired PreCompact, then **SessionStart with `source: compact`**, then PostCompact. The re-injected rule was recalled.
- A new session got its own clean token.
- Size:

  | Characters | Result |
  |---|---|
  | 4,000 and 9,000 | Delivered |
  | 11,000, 20,000 and 60,000 | Tail **silently truncated**; the hook still reported success |

- What was verified is the delivery mechanism. The model's *compliance* with the rules is behavior, not a guarantee.

### Why
- SessionStart delivery is verified, including after compaction, so the token-efficiency goal (IO-39) is achievable.
- The truncation limit forces a hard size budget.

### Alternatives Considered
1. **Stub-embedded only.** Rejected as the default: it repeats the constitution per skill.
2. **A CLAUDE.md import.** Weaker; optional with consent.

### Consequence
- PSA §2.2: a constitution budget of ≤ 1,200 tokens, and **≤ 9,000 characters**.
- The IO-39 targets are no longer provisional on SK-4.

### Confidence
High.

### Remaining Validation
- The exact cut-off between 9,000 and 11,000 characters.
- `source: resume` behavior.
- Other host versions.

---

## AD-12: Hook latency budget and timeout handling (new)

### Decision
- AEOS policy hooks are **Node processes declared with `command`+`args`**. Never PowerShell or shell-string commands.
- AEOS logic inside a hook targets under 10 ms.
- The **latency budget is ≤ 150 ms median and ≤ 250 ms p95 per hook call on Windows**. This replaces the unachievable p95 < 50 ms.
- Every AEOS hook enforces an **internal deadline well below its configured timeout**. On overrun it returns `deny` or `ask` itself rather than being cancelled, because a **cancelled hook fails open**.
- Heavy work (PowerShell AST parsing) runs in a long-lived helper under AD-09, with an in-process fail-closed fallback.

### Evidence
**Hands-on on Windows (E-01, E-02):**
- In-harness PreToolUse latency: median 120-131 ms, p95 129-234 ms, of which node startup is about 23 ms and hook work 1-6 ms.
- Offline spawn cost: PowerShell 1.3 s, Git Bash 254 ms.
- A hook with `timeout: 3` sleeping 8 s was **cancelled at about 4.2 s, and the tool call then executed**.
- Shell-string hooks started 0.7-1.4 s late (E-04).

### Why
About 95 ms of every call is spawn and harness overhead that AEOS can't remove. A timeout silently disables enforcement for that call.

### Alternatives Considered
1. **Keep p95 < 50 ms.** Rejected: physically unachievable per call on Windows.
2. **A daemon-only policy decision.** Rejected: it adds a single point of failure, and AD-09 requires a fail-closed fallback. It is allowed as an accelerator.
3. **Long timeouts.** Rejected: the stall adds latency, and a timeout still fails open.

### Consequence
- MASTER-SPEC AP-8 is revised.
- PSA §2.1 performance budget is revised.
- **Owner-accepted (B-1, 2026-09-27):** the Windows-first budget (≤ 150 ms median, ≤ 250 ms p95). macOS and Linux measurement is not required for Phase 2.
- **A hook timeout is not a safety boundary** (MASTER-SPEC S-11). The internal deadline is a mitigation, not a guarantee.

### Confidence
High on Windows.

### Remaining Validation
macOS and Linux latency, and timeout behavior on other operating systems (U-10). Deferred by the owner decision.

---

## AD-13: Shell command analysis (new)

### Decision
- AEOS never relies on string matching for shell policy.
- It uses **shell-specific parsers**:
  - the Windows PowerShell AST, hosted in a long-lived helper process
  - a POSIX/bash parser, to be selected and validated before AEOS claims semantic enforcement of Bash commands
- Constructs a static parser cannot resolve are classified **`opaque`**, which means `ask`: variable-as-command, `Invoke-Expression`/`iex`, `-EncodedCommand`, interpreter `-e`/`-c`, and decode-then-execute pipelines.
- AEOS complements Claude Code's native PowerShell analysis rather than duplicating it.

### Evidence
**Hands-on (E-03):**
- On the parse-only corpus, naive splitting scored **7/27** (POSIX) and **5/17** (PowerShell).
- The PowerShell AST scored **14/17**. Its 3 failures were dynamic constructs.
- A POSIX tokenizer scored 20/27.
- The PowerShell parser costs about 36 ms per command but about 1 s per process start.
- The hook receives the raw command string.
- Claude Code natively flagged `cmd /c` inside a compound command and refused a nested `powershell -Command` ("cannot be validated").
- The isolated Windows session exposed **no Bash tool**, only PowerShell.

### Why
String matching fails on quoting, nesting and chaining. A per-call PowerShell process would take the budget from AD-12 many times over.

### Alternatives Considered
1. **Regex rules.** Rejected (evidence above).
2. **Claude Code native analysis only.** Rejected: interpreter one-liners pass it (AD-06).
3. **A single cross-shell parser.** Rejected: PowerShell and POSIX grammars differ.

### Consequence
- MASTER-SPEC SP-2, SP-3 and SP-9 stand.
- The PowerShell helper is a managed long-lived process (AD-09).
- **Owner-accepted (B-2, 2026-09-27):** PowerShell-first parsing. **No Bash command parser has been validated.**
- Until one is separately validated (deferred):
  - AEOS makes **no claim of reliable semantic enforcement** of Bash commands.
  - Bash commands get a **conservative posture**. AEOS never auto-approves them (it never emits `allow`), and stops or asks according to the configured safety policy. Bash is never treated as unrestricted.
  - Claude Code's native permissions remain independently enforced.
  - This posture is **not** equivalent to a validated Bash enforcement layer (MASTER-SPEC SP-2a).

### Confidence
Medium: PowerShell is validated, bash is not.

### Remaining Validation
Selection and accuracy of a bash/POSIX parser on the corpus (U-11). Deferred to Phase 3/platform validation. It is the precondition for any claim of semantic Bash enforcement.
