# Platform Assumptions Register

> **Purpose.** Track every assumption AEOS makes about its Tier-1 host (Claude Code), with an explicit verification status, so that unverified behavior never quietly becomes architecture (MASTER-SPEC MP-7).
> **Status vocabulary:** **VERIFIED** · **PARTIALLY VERIFIED** · **NOT VERIFIED** · **NOT AVAILABLE**. Only these four values are used.
> **Validation baseline:** Phase 2, against **Claude Code 2.1.283** (the version installed on the analysis machine).
> - **Method, stage 1:** a review of the official Claude Code documentation (hooks, permissions, permission modes, subagents, skills), plus read-only inspection of the local `~/.claude/settings.json`.
> - **Method, stage 2 (2026-09-27): hands-on execution** in an isolated `CLAUDE_CONFIG_DIR` on Windows 11 with Claude Code 2.1.283. 38 headless sessions, $0.79. Items carrying a "Hands-on result" line were executed; see [platform-validation/HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md) (experiments E-00 to E-17).
> - Hands-on evidence covers **Windows only**. Where an item says "(hands-on on Windows)", macOS and Linux remain unverified.
> - Full evidence is in [ROADMAP.md § Phase 2](ROADMAP.md#phase-2-claude-code-platform-capability-validation); decisions are in [platform-validation/ARCHITECTURAL-DECISIONS.md](platform-validation/ARCHITECTURAL-DECISIONS.md).
> **Rule for changes.** A status may be raised only by adding recorded evidence (the test, the host version, the date, the result) to the Phase 2 table or to a successor validation record. A status is lowered as soon as contrary evidence appears.

---

## 1. Assumptions the architecture may rely on

These are VERIFIED or PARTIALLY VERIFIED. They may be used **within their stated limits**.

| ID | Assumption | Status | Limit that must be respected |
|---|---|---|---|
| V-01 | PreToolUse/PostToolUse with matcher `"*"`, `""` or none match tool calls that **reach execution**, including calls inside subagents (which carry `agent_id` and `agent_type`) | VERIFIED (hands-on) | `EndConversation` is excluded. Calls rejected earlier by Claude Code's validation or deny rules never reach PreToolUse (U-20). `"*"` caught local stdio MCP tools hands-on; other MCP server types are untested (U-01). |
| V-02 | Explicit `mcp__.*` matchers intercept MCP tools | VERIFIED | Only tools whose names match the pattern are covered. |
| V-03 | A hook can block a tool call (exit code 2, or `permissionDecision: "deny"` with a reason the model sees) | VERIFIED | — |
| V-04 | `allow` cannot override stronger deny/ask rules or managed permissions | VERIFIED | AEOS still never emits `allow` (MASTER-SPEC S-9). |
| V-05 | `updatedInput` can modify tool input | PARTIALLY VERIFIED | Only narrowing normalizations. Composition with other hooks is untested (U-07). |
| V-06 | Subagent `tools` allowlist and `disallowedTools` denylist (including `mcp__*`) are enforced; nesting has a depth limit | VERIFIED | Plugin agents' own hooks, permissionMode and mcpServers are **not** relied on (U-05). |
| V-07 | The `Skill` tool can invoke skills, and skill use can be restricted by permissions and tool lists | VERIFIED | — |
| V-08 | `disable-model-invocation` blocks automatic model invocation; `user-invocable: false` hides a skill from the `/` menu | PARTIALLY VERIFIED | No mechanism hides a skill from both model and user while allowing runtime invocation. |
| V-09 | Hooks run as separate processes. `session_id`, `prompt_id`, `agent_id` and `transcript_path` are available. `CLAUDE_PLUGIN_DATA` is persistent plugin storage | VERIFIED | There is no general runtime-state API, so AEOS owns its state. |
| V-10 | MCP servers can live for a session; detached OS processes can stay alive | PARTIALLY VERIFIED | Claude Code does not manage detached lifecycles (U-03). |
| V-11 | Settings allow/deny/ask rules apply, deny beats allow, managed settings can restrict permissions and bypass modes, and OS-level sandboxing exists for shell tools | VERIFIED | Managed settings need organizational deployment (U-13). Sandbox coverage of AEOS paths is untested (U-14). |
| V-12 | Tool names Bash, PowerShell, Edit, Write, NotebookEdit, WebFetch, Agent, Skill and `mcp__…` are interceptable | VERIFIED | Shell content needs parsing plus sandboxing, not pattern matching. |
| V-13 | AEOS can impose autonomy restrictions on top of Claude Code's permission mode | VERIFIED (as a ceiling only) | Restrict only; never grant. On 2.1.283, `auto` is the default mode and its classifier may approve routine actions. |
| V-14 | Claude Code protects some configuration paths (`.claude/`, `~/.claude/`, `.git`, `.mcp.json`, shell rc files, …) | PARTIALLY VERIFIED | AEOS-owned state is not covered. In `auto` mode the classifier decides protected writes, and `bypassPermissions` allows them. |
| V-15 | `UserPromptSubmit` exists | PARTIALLY VERIFIED | It is **not** a verified origin signal (U-02). |
| V-16 | Multiple hooks on one event all run, concurrently. Start order follows configuration order; completion order is non-deterministic. Deny beats allow; a settings deny beats a hook `allow`; exit 2 blocks; exit 1 is non-blocking | VERIFIED (hands-on) | AEOS must be order-independent. **A hook `allow` loosens native checks** (it overrode a working-directory block), so AEOS never emits it, and foreign `allow` hooks are reported (U-16). |
| V-17 | A Stop hook can block turn end and coexists with other Stop hooks, including gstack- and paysec-shaped entries; the loop guard is `stop_hook_active` | VERIFIED (hands-on) | The gate must honor `stop_hook_active` (U-12). |
| V-18 | SessionStart `additionalContext` reaches the model at startup and again after compaction (`source: compact`); each new session gets its own | VERIFIED (hands-on) | Keep it **≤ 9,000 characters**: larger content is silently truncated (U-06). |
| V-19 | User-scope settings (hook) changes apply to a running session within about 1 s and emit `ConfigChange` | VERIFIED (hands-on, user scope) | Anything that can write the settings file changes live enforcement. Watch `ConfigChange` (U-04). |
| V-20 | A runtime command can detect whether PreToolUse saw its own call (nonce heartbeat) | VERIFIED (hands-on) | It detects missing hooks; it doesn't prevent disabling them (U-09). |
| V-21 | PreToolUse hook timeout: the hook is cancelled and **the tool call proceeds** | VERIFIED (hands-on on Windows) | Fail-open. AEOS hooks need an internal deadline well below the configured timeout (U-10). |
| V-22 | Plugin agents honor `tools` and `disallowedTools` and ignore their frontmatter `hooks`, `permissionMode` and `mcpServers`; plugin-level `hooks/hooks.json` fires for plugin sessions | VERIFIED (hands-on) | Role policy comes from global or plugin-level hooks keyed on `agent_type` `<plugin>:<agent>` (U-05). |

---

# Assumptions That Must NOT Become Architecture

The assumptions below are **unresolved**. No AEOS design, requirement or guarantee may depend on any of them unless a documented fallback preserves safety when the assumption is false. Each entry records why it is unsafe to rely on, what the design does instead, and what would resolve it.

> **All entries in this section are UNRESOLVED ASSUMPTIONS.**

### U-01: A generic `"*"` matcher definitely captures every MCP tool
- **Status:** PARTIALLY VERIFIED (hands-on, 2026-09-27)
- **Hands-on result:** `"*"` **did** capture MCP tool calls from a local stdio server, as did `mcp__.*`. Input was visible, deny blocked the call before the server, and `updatedInput` reached the server (E-15). Plugin-provided and remote MCP servers were not tested. Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Why unsafe:** If `"*"` silently misses MCP tools, a policy that registers only `"*"` leaves every MCP tool ungated.
- **Design instead:** Register an explicit `mcp__.*` matcher (V-02) alongside `"*"` (AD-08). Document that MCP tools whose names don't match `mcp__` are outside coverage.
- **Resolve by:** Hands-on test: a `"*"`-only hook logging calls to a test MCP server's tools, including plugin-provided MCP tools.

### U-02: Perfect user-vs-model instruction attribution
- **Status:** PARTIALLY VERIFIED (hands-on, 2026-09-27)
- **Hands-on result:** Prompt-source matrix: `UserPromptSubmit` fires for input-channel messages and slash commands (after `UserPromptExpansion`), and **not** for subagent prompts or Stop-hook continuations. It identifies the *input channel*, not a human. The restart-only autonomy mechanism **works** in simulation (E-10). Scheduled and loop prompts, cross-session messages and interactive TUI input were not tested. Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Owner decision (B-5 / Q21, 2026-09-27):** restart-only autonomy relaxation is accepted for R2 until an in-session relaxation channel is validated. The status above is unchanged: human attribution remains unestablished. Record: [PHASE-2-EXIT-CRITERIA.md](platform-validation/PHASE-2-EXIT-CRITERIA.md#owner-decisions-2026-09-27).
- **Why unsafe:**
  - Tool calls carry no guaranteed origin field.
  - It is untested whether `UserPromptSubmit` also fires for scheduled or loop prompts, cross-session messages, subagent prompts or slash-command expansions.
  - Answers to runtime questions (AskUserQuestion) are not established as user-authored for security purposes.

  A relaxation keyed on an origin signal could be triggered by the model or by injected content.
- **Design instead:**
  - Tightening is allowed from any source.
  - Relaxation needs an out-of-band confirmation that cannot be completed from a tool call, and the policy engine denies in-session relaxation attempts.
  - The limit is stated to the user (PSA §2.6; MASTER-SPEC AU-2, S-8; AD-10).
- **Resolve by:** Hands-on test matrix recording which sources fire `UserPromptSubmit` and with which fields, plus a threat analysis of the out-of-band channel.

### U-03: Detached processes are cleaned up automatically
- **Status:** PARTIALLY VERIFIED (hands-on on Windows, 2026-09-27)
- **Hands-on result:** On Windows, detached processes **survive** both normal session exit and an abrupt kill of Claude Code. Claude Code does not clean them up. A stale heartbeat detects a crash (E-14). The assumption "cleaned up automatically" is **false on Windows**. macOS and Linux were not tested. Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Why unsafe:** Orphaned daemons (browser, policy accelerator, boards) leak resources, hold locks, keep listeners open and may keep acting after the session ends. Windows process-tree behavior differs from Unix.
- **Design instead:** Process Lifecycle Manager (PSA §2.18), covering startup, health check, idle timeout, cleanup, crash recovery and orphan detection. No safety guarantee may depend on a daemon (MASTER-SPEC S-10; AD-09).
- **Resolve by:** Hands-on tests on Windows, macOS and Linux. Start a detached process from a hook and from a command, exit Claude Code normally, by signal and by closing the terminal, then observe survival.

### U-04: Hooks reload dynamically during an active session
- **Status:** VERIFIED (hands-on, user-scope settings, 2026-09-27)
- **Hands-on result:** A user-settings hook change took effect in the running session within about 1 s, with a `ConfigChange` event (`source: user_settings`) (E-09). Project, plugin and managed scopes were not tested. Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Why unsafe:** If the configuration is snapshotted at start, a newly installed or removed hook takes effect only after a restart. Assuming live reload would leave a session unprotected, or wrongly protected, without anyone knowing.
- **Design instead:** The Hook Compatibility Manager tells the user when a restart is required after any change (PSA §2.17). The runtime detects whether its hooks are active (U-09) instead of assuming it.
- **Resolve by:** Hands-on test: add, modify and remove a hook mid-session, then observe when each takes effect, including the `ConfigChange` event.

### U-05: Plugin agents always honor their own hook, permission and MCP configuration
- **Status:** VERIFIED (hands-on, 2026-09-27)
- **Hands-on result:** A plugin agent **ignored** its frontmatter `hooks`, `permissionMode` and `mcpServers`, and **honored** `tools` and `disallowedTools`. A local agent honored `hooks` and `permissionMode`. Global and plugin-level hooks saw every agent call, tagged with `agent_type` `<plugin>:<agent>` (E-16). Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Why unsafe:** Role limits declared only inside a plugin agent's frontmatter may not apply.
- **Design instead:**
  - Global AEOS PreToolUse hooks enforce role policy keyed on `agent_type`/`agent_id`.
  - Tool allowlists (V-06) are still declared.
  - Unregistered agent types inherit the parent run's policy (PSA §2.11; AD-05).
- **Resolve by:** Hands-on test with a plugin-distributed agent declaring hooks, `permissionMode` and `mcpServers`. Confirm which are ignored.

### U-06: SessionStart (and compaction-related) hooks can reliably inject the constitution
- **Status:** VERIFIED (hands-on, 2026-09-27)
- **Hands-on result:** SessionStart `additionalContext` was delivered at startup, persisted across turns, was **re-delivered after `/compact`** (`source: compact`), and each new session got a clean set. Content beyond about **9,000 characters** is silently truncated: 9,000 was delivered and 11,000 was not (E-07, E-08). Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Why unsafe:** If injected context is size-limited, dropped or not re-injected after compaction, the model loses the rules it needs.
- **Design instead:**
  - Fallback: the constitution is embedded in each skill stub.
  - Every phase card begins with `aeos run status`, so position is re-read from the runtime.
  - Run state lives in the runtime, not the conversation (PSA §2.2; AD-11).
- **Resolve by:** Hands-on tests of `additionalContext` size limits, persistence across compaction, and behavior on resume.

### U-07: `updatedInput` behaves uniformly across tools and composes predictably with other hooks
- **Status:** PARTIALLY VERIFIED (hands-on, 2026-09-27)
- **Hands-on result:** With two hooks rewriting the same call, **only one rewrite survived**; the other was silently discarded (E-05, case 4). Whether configuration order or completion order decides was not established. Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Why unsafe:** When several mutators touch the same call, for example AEOS plus another tool's hook, the resulting input may be unpredictable.
- **Design instead:** Only narrowing normalizations. If the engine can't prove a rewrite narrows the call, it returns `ask` instead. Overlapping mutators are reported by the Hook Compatibility Manager (PSA §2.6, §2.17).
- **Resolve by:** Hands-on tests with two mutating hooks on the same tool.

### U-08: AEOS-owned state and safety configuration cannot be tampered with by the model
- **Status:** PARTIALLY VERIFIED (hands-on, 2026-09-27)
- **Hands-on result:** Deny rules plus Claude Code's native PowerShell analysis blocked the file tools, cmdlets, redirects and a variable-built path. **An interpreter one-liner (`node -e`) bypassed the deny rules** and wrote into the denied folder. The model could not overwrite the config directory's `settings.json` in `default` mode (E-11, E-13). `auto` and `bypassPermissions` modes were not tested. Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Why unsafe:**
  - Shell-based file manipulation (`cp`, interpreters, `sh -c`) can bypass simple Edit/Write rules.
  - Claude Code's protected paths don't cover AEOS locations.
  - Hooks can be disabled for a run through explicit settings.
- **Design instead:** Five-layer defense in depth plus signed security records. Any integrity failure falls back to `lockdown` (MP-4; MASTER-SPEC SP-10; AD-06).
- **Resolve by:** A red-team suite that attempts to modify AEOS state and settings through every tool path, with and without the sandbox and managed settings, on all three OSes.

### U-09: AEOS can detect when its own hooks are not running
- **Status:** VERIFIED (hands-on, 2026-09-27)
- **Hands-on result:** A nonce heartbeat distinguished hooks active (`HOOKS_ACTIVE`) from `disableAllHooks` (`HOOKS_INACTIVE`) (E-12). Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Why unsafe:** Without detection, a session with hooks disabled looks protected.
- **Design instead:** A heartbeat written by the hooks, compared with runtime calls made by phase cards. On a mismatch, degrade to a max of L1 with a visible warning. Until this is validated, `aeos doctor` and the constitution state that hook presence is not confirmed.
- **Resolve by:** Hands-on tests with `disableAllHooks` and with the hooks removed mid-session.

### U-10: Hook latency is acceptable (p95 < 50 ms), including on Windows
- **Status:** PARTIALLY VERIFIED (hands-on on Windows, 2026-09-27)
- **Hands-on result:** Windows in-harness PreToolUse latency for a Node `command`+`args` hook: median 120-131 ms, p95 129-234 ms, of which about 95 ms is spawn and harness overhead. **p95 < 50 ms is not achievable on Windows.** A PowerShell hook costs about 1.3 s; a shell-string hook starts 0.7-1.4 s late. **A timed-out hook is cancelled and the tool call proceeds (fail-open)** (E-01, E-02). macOS and Linux were not measured. Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Owner decision (B-1, 2026-09-27):** the Windows-first budget is accepted (≤ 150 ms median, ≤ 250 ms p95). macOS and Linux measurement is deferred and not required for Phase 2. **Hook timeouts fail open, so AEOS must not rely on a hook timeout as a safety boundary.** Record: [PHASE-2-EXIT-CRITERIA.md](platform-validation/PHASE-2-EXIT-CRITERIA.md#owner-decisions-2026-09-27).
- **Why unsafe:** One policy evaluation runs per tool call. Slow hooks degrade the experience, and hooks that time out may fail in ways that are not specified.
- **Design instead:** An in-process evaluator with a minimal start path; an optional daemon as an accelerator only. Timeout behavior is treated as fail-closed for AEOS's own decisions.
- **Resolve by:** Latency benchmark per OS; hands-on timeout-behavior test.

### U-11: Shell command parsing is accurate enough for policy (bash and PowerShell)
- **Status:** PARTIALLY VERIFIED (hands-on, 2026-09-27)
- **Hands-on result:** Naive matching scored 7/27 (POSIX) and 5/17 (PowerShell). The PowerShell AST scored 14/17; its remaining failures are dynamic constructs that must be opaque. A POSIX tokenizer scored 20/27. PowerShell parsing costs about 36 ms per command but about 1 s to start the process. **No bash AST parser was validated**, and no Bash tool was exposed on this Windows setup (E-03). Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Owner decision (B-2, 2026-09-27):** PowerShell-first parsing is accepted. **No Bash command parser is validated.** AEOS therefore claims no semantic Bash enforcement. It applies a conservative posture instead: it never auto-approves Bash commands, and stops or asks per the configured safety policy. Bash is not unrestricted, and Claude Code's native permissions still apply. Parser validation is deferred. Record: [PHASE-2-EXIT-CRITERIA.md](platform-validation/PHASE-2-EXIT-CRITERIA.md#owner-decisions-2026-09-27).
- **Why unsafe:** Parser gaps become policy bypasses.
- **Design instead:** Unparseable input is `ask`; interpreter one-liners are `opaque-exec`; the sandbox (layer 3) backs up parsing (MASTER-SPEC SP-2, SP-3, SP-9).
- **Resolve by:** Parser accuracy on the ≥300-command destructive corpus and the benign corpus.

### U-12: A Stop hook can reliably block turn end, and coexists with other Stop hooks
- **Status:** VERIFIED (hands-on, 2026-09-27)
- **Hands-on result:** A Stop hook `{"decision":"block"}` was honored alongside gstack- and paysec-shaped copies and a failing Stop hook. All five hooks ran on both passes, and the second pass carried `stop_hook_active: true` (E-06). Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Why unsafe:** If Stop blocking is unavailable or conflicts with the gstack and paysec Stop hooks already installed, completion gating by hook fails.
- **Design instead:** The runtime computes status and never records `done` without evidence, regardless of hooks. The Stop gate is additive (MASTER-SPEC VR-6).
- **Resolve by:** Hands-on test of Stop blocking alongside two existing foreign Stop hooks, in an isolated configuration directory.

### U-13: Managed settings are available in the target deployment
- **Status:** NOT VERIFIED (owner question; observed: no local managed-settings.json, server-managed remote settings fetched for the account)
- **Owner decision (Q20, 2026-09-27):** for Phase 2, managed settings are assumed **unavailable** to individual users, and are documented as a recommended **organizational** layer. No local `managed-settings.json` exists in the tested environment. Record: [PHASE-2-EXIT-CRITERIA.md](platform-validation/PHASE-2-EXIT-CRITERIA.md#owner-decisions-2026-09-27).
- **Why unsafe:** Layer 4 exists only where an organization deploys it.
- **Design instead:** Layers 1-3 and 5 must stand on their own, and `aeos doctor` reports layer 4 as active or unavailable (MASTER-SPEC SP-8).
- **Resolve by:** Confirm with the deploying organization (ROADMAP Q20).

### U-14: Sandbox filesystem and network controls can cover AEOS state paths on every OS
- **Status:** PARTIALLY VERIFIED (hands-on, 2026-09-27)
- **Hands-on result:** **Sandbox: NOT AVAILABLE** in this Windows configuration. Enabling it had no observable effect, and the debug log showed no sandbox activity. Layer coverage: deny rules and native PowerShell analysis as described in U-08 (E-11). Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Owner decision (B-6, 2026-09-27):** the Windows compensating design is accepted: OS ACLs on AEOS state, the opaque-exec policy, and integrity checks. It is **not equivalent to an OS sandbox**. Cross-platform sandbox testing is deferred. Record: [PHASE-2-EXIT-CRITERIA.md](platform-validation/PHASE-2-EXIT-CRITERIA.md#owner-decisions-2026-09-27).
- **Why unsafe:** Layer 3 is the backstop for shell-based tampering (U-08). Its availability and configuration on Windows are untested here.
- **Design instead:** Treat layer 3 as "reported, not assumed". Without it, the effective protection of AEOS state is PARTIALLY VERIFIED at best, and the constitution says so.
- **Resolve by:** Hands-on sandbox tests per OS.

### U-15: `node:sqlite` is stable across supported OSes and Node versions
- **Status:** PARTIALLY VERIFIED (hands-on, Node 24 on Windows, 2026-09-27)
- **Hands-on result:** 4 concurrent WAL-mode writers inserted 2,000 of 2,000 rows with no errors (E-17). Other Node versions and operating systems were not tested. Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Why unsafe:** The state index would be unreliable.
- **Design instead:** The index is a rebuildable cache, and a JSONL-only fallback exists (MASTER-SPEC ST-6).
- **Resolve by:** A cross-OS stress test.

### U-16: Multiple hooks on the same event combine in a known order with known precedence
- **Status:** VERIFIED (hands-on, 2026-09-27)
- **Hands-on result:** Matching hooks run **concurrently**. Start order follows configuration order (and source order), and completion order is **non-deterministic**. No ordering control was found. Deny beats allow. A settings deny beats a hook `allow`. Exit 2 blocks. A failing hook is non-blocking. **A hook `allow` overrode a native working-directory block** (E-04, E-05). Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Why unsafe:** With AEOS, gstack, paysec, plugin and project hooks all on the same event, ordering and decision combination determine the outcome.
- **Design instead:** AEOS decisions are designed to be correct regardless of order: deny and ask only, and no reliance on running first. Overlaps are reported (PSA §2.17).
- **Resolve by:** Hands-on test with multiple hooks returning different decisions.

### U-17: Hook and permission behavior is stable across Claude Code versions
- **Status:** NOT VERIFIED beyond 2.1.283
- **Deferred (2026-09-27):** validation on other Claude Code versions remains open and is not required for Phase 2 exit. Record: [PHASE-2-EXIT-CRITERIA.md](platform-validation/PHASE-2-EXIT-CRITERIA.md#owner-decisions-2026-09-27).
- **Why unsafe:** Host updates can change semantics.
- **Design instead:** Record the validated host version. `aeos doctor` warns when running on an unvalidated version, and host-conformance tests run per supported version (MASTER-SPEC §15.1).
- **Resolve by:** Re-running the validation suite on each new host version.

### U-18: Any undocumented Claude Code behavior
- **Status:** NOT VERIFIED by definition
- **Why unsafe:** Undocumented behavior can change without notice.
- **Design instead:** Prohibited as an architectural dependency (MP-7). It may be used only as an optimization, with a fallback.

### U-19: Any behavior not explicitly demonstrated by the validation
- **Status:** NOT VERIFIED by definition
- **Why unsafe:** Plausible does not mean verified. This catch-all prevents extrapolating from nearby verified facts, for example assuming that because hooks block Bash they also block every MCP tool.
- **Design instead:** Add a new U-entry, with a fallback, before any design uses the behavior.

### U-20: PreToolUse observes every *attempted* tool call (added from hands-on testing)
- **Status:** PARTIALLY VERIFIED (hands-on, 2026-09-27)
- **Hands-on result:** Of 10 attempted calls, PreToolUse saw the 7 that passed Claude Code's own validation. It **never saw** the 3 `Write`, `Edit` and `Read` calls rejected by path deny rules, nor calls failing tool validation ("file has not been read yet") (E-11, E-13). Evidence: [HANDS-ON-VALIDATION-REPORT.md](platform-validation/HANDS-ON-VALIDATION-REPORT.md).
- **Why unsafe:** An AEOS audit trail built only from PreToolUse under-reports attempts, specifically the ones native controls stopped.
- **Design instead:** Describe hook coverage as "every tool call that reaches execution". Treat the audit trail as covering executed and hook-decided calls, not all attempts. Enforcement is unaffected, because rejected calls do not run.
- **Resolve by:** Checking whether a `PermissionDenied` or `PostToolUseFailure` hook observes those rejections (not tested).

---

## 2. Change log

- 2026-09-27: created from Phase 2 validation (Claude Code 2.1.283).
- 2026-09-27: hands-on validation.
  - U-01 to U-16 updated with executed evidence, except U-13, which was observed only.
  - Added V-16 to V-22 and U-20.
  - V-01 reworded to "calls that reach execution".
  - Resolved items: U-04, U-05, U-06, U-09, U-12 and U-16 are now VERIFIED. Their entries stay below as records, but they no longer block architecture.
- 2026-09-27: owner decisions recorded against U-02 (restart-only), U-10 (Windows budget; timeout is not a safety boundary), U-11 (no validated Bash parser; conservative Bash posture, corrected wording 2026-09-27), U-13 (managed settings assumed unavailable), U-14 (compensating design, not a sandbox) and U-17 (deferred). **No status was upgraded by these decisions.**
