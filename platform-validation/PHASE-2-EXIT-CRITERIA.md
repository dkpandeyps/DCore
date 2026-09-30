# PHASE 2 EXIT CRITERIA

> **Phase 2:** Claude Code platform capability validation for AEOS.
> **Host validated:** Claude Code **2.1.283**.
> **Method:**
> - Stage 1: a review of the official Claude Code documentation, plus read-only inspection of the local `~/.claude/settings.json`.
> - **Stage 2 (2026-09-27): hands-on execution** in an isolated `CLAUDE_CONFIG_DIR` on Windows 11. 38 sessions, $0.79. See [HANDS-ON-VALIDATION-REPORT.md](HANDS-ON-VALIDATION-REPORT.md).
> - No AEOS code was built, and the real configuration, gstack and paysec were not modified (verified by hash and git state).
> **Related:** [ROADMAP.md § Phase 2](../ROADMAP.md#phase-2-claude-code-platform-capability-validation) (evidence table) · [ARCHITECTURAL-DECISIONS.md](ARCHITECTURAL-DECISIONS.md) (AD-nn) · [PLATFORM-ASSUMPTIONS.md](../PLATFORM-ASSUMPTIONS.md) (V-nn, U-nn)

---

## Verified

These are known to work, within the stated limits.

| # | Capability | Limit |
|---|---|---|
| 1 | Hooks observe tool calls: PreToolUse/PostToolUse with `"*"`, `""` or none; subagent calls carry `agent_id` and `agent_type` | `EndConversation` is excluded. MCP coverage by `"*"` is not included. |
| 2 | Hooks block tool calls: exit code 2, or `permissionDecision: "deny"` with a reason visible to the model. `allow` cannot override stronger deny rules. | — |
| 4 | Subagents can have restricted tools: `tools` allowlist, `disallowedTools` denylist (including `mcp__*`), and a nesting depth limit | Plugin agents have limitations with their own hooks, permissionMode and mcpServers. |
| 5 | A skill can invoke another skill through the `Skill` tool, and this is restrictable | — |
| 7 | Persistent state through AEOS-managed files. Hooks are separate processes. `session_id`, `prompt_id`, `agent_id`, `transcript_path` and `CLAUDE_PLUGIN_DATA` are available. | There is no general runtime-state API. |
| 10 | Permissions outside the model: allow/deny/ask rules, deny wins, managed settings restrict permissions and bypass modes, OS-level sandboxing | Managed settings need organizational deployment. |
| 11 | Tool interception: Bash, PowerShell, Edit, Write, NotebookEdit, WebFetch, Agent, Skill, `mcp__…` | Shell content needs parsing plus sandboxing. |
| 12 | Autonomy levels, **as a ceiling only** | AEOS can restrict; it must never loosen. |
| — | Explicit `mcp__.*` matcher interception | Only matching tool names are covered. |

## Partially Verified

These work, but with important limitations.

| # | Capability | Limitation |
|---|---|---|
| 3 | Modify or approve tool calls | `updatedInput` modifies input. `allow` can skip a prompt in some circumstances, but deny/ask rules and managed permissions still apply. AEOS will not use `allow` (AD-02). |
| 6 | Hidden/internal skills | `disable-model-invocation` and `user-invocable: false` each hide a skill from only one side. No combined hidden-and-runtime-invocable mechanism was found (AD-04). |
| 8 | Long-lived processes | MCP servers live for the session, and detached processes can survive. Claude Code does not manage detached lifecycles (AD-09). |
| 9 | User vs model instruction attribution | `UserPromptSubmit` exists. Tool calls carry no guaranteed origin field (AD-10). |
| 13 | Preventing safety-configuration modification | Some paths are protected. AEOS state isn't. Shell manipulation can bypass Edit/Write rules. Hooks can be disabled for a run. Managed settings are stronger but need an administrator (AD-06). |

## Hands-on results (2026-09-27)

| U-item | Status after hands-on | Headline result |
|---|---|---|
| U-01 | PARTIALLY VERIFIED | `"*"` **did** catch local stdio MCP tools; deny and `updatedInput` work. Plugin and remote MCP untested. |
| U-02 | PARTIALLY VERIFIED | `UserPromptSubmit` means the input channel, not a human. Not fired for subagent prompts or Stop continuations. Restart-only autonomy works. |
| U-03 | PARTIALLY VERIFIED (Windows) | Detached processes survive normal exit **and** a Claude Code kill. No host cleanup. |
| U-04 | VERIFIED (user scope) | Hook changes apply mid-session within about 1 s; `ConfigChange` fires. |
| U-05 | VERIFIED | Plugin agent ignores `hooks`, `permissionMode` and `mcpServers`; honors `tools` and `disallowedTools`. |
| U-06 | VERIFIED | Delivered at startup and after `/compact`; clean per session; **≤ 9,000 characters** (silent truncation above). |
| U-07 | PARTIALLY VERIFIED | Two rewrites: only one survives. |
| U-08 | PARTIALLY VERIFIED | Deny rules plus native PowerShell analysis hold, **except for interpreter one-liners**. |
| U-09 | VERIFIED | Nonce heartbeat detects disabled hooks. |
| U-10 | PARTIALLY VERIFIED (Windows) | Median 120-131 ms, p95 129-234 ms. **Timeout fails open.** |
| U-11 | PARTIALLY VERIFIED | Naive matching insufficient; PowerShell AST adequate in a long-lived process; bash parser not validated. |
| U-12 | VERIFIED | Stop blocking works alongside gstack- and paysec-shaped hooks and a failing hook. |
| U-13 | NOT VERIFIED | Owner question. Remote managed settings observed for the account. |
| U-14 | PARTIALLY VERIFIED | **Sandbox NOT AVAILABLE** in this Windows configuration. |
| U-15 | PARTIALLY VERIFIED (Windows, Node 24) | 4 concurrent writers, 2,000 of 2,000 rows. |
| U-16 | VERIFIED | Concurrent execution, configuration-ordered start, non-deterministic finish. A hook `allow` loosens native checks. |
| U-17 | NOT VERIFIED | Only 2.1.283 tested. |
| U-20 (new) | PARTIALLY VERIFIED | Calls rejected by deny rules never reach PreToolUse. |

## Unresolved

These still require hands-on testing. Each maps to an entry in PLATFORM-ASSUMPTIONS. The table below is the original Phase 2 test list; the hands-on outcomes are in the section above.

| ID | Question | Test needed |
|---|---|---|
| U-01 | Does `"*"` capture MCP tools, including plugin MCP tools? | Log calls through a `"*"`-only hook against a test MCP server |
| U-02 | Which prompt sources fire `UserPromptSubmit` (typed, slash-command expansion, scheduled or loop, cross-session, subagent), and with which fields? | Prompt-source matrix |
| U-03 | What happens to detached processes when Claude Code exits (normal, signal, terminal close), on Windows, macOS and Linux? | Survival test per OS |
| U-04 | Do hook configuration changes take effect mid-session? | Add, modify and remove a hook mid-session |
| U-05 | Which plugin-agent frontmatter fields (hooks, permissionMode, mcpServers) are ignored, and are plugin `agent_type` values stable? | Plugin-agent test |
| U-06 | SessionStart `additionalContext`: does it work, what is its size limit, and does it persist across compaction and resume? (SK-4) | Injection test |
| U-07 | How does `updatedInput` compose with other mutating hooks? | Two-mutator test |
| U-08 | Can AEOS state and settings be tampered with through indirect shell paths, with each defense layer on and off? | Red-team suite |
| U-09 | Can AEOS detect that its hooks are not running (e.g. with `disableAllHooks`)? | Detection test |
| U-10 | What are hook latency and timeout behavior per OS, especially Windows? | Latency benchmark |
| U-11 | Is shell (bash and PowerShell) parser accuracy adequate on the policy corpora? (SK-6) | Corpus test |
| U-12 | Can a Stop hook block turn end, alongside the existing gstack and paysec Stop hooks? | Coexistence test |
| U-13 | Are managed settings available in the target deployment? | Owner confirmation (ROADMAP Q20) |
| U-14 | Can sandbox filesystem and network controls cover AEOS state paths, per OS? | Sandbox test |
| U-15 | Is `node:sqlite` stable per OS and Node version? (SK-7) | Stress test |
| U-16 | In what order do hooks on the same event run, and how are their decisions combined? | Multi-hook test |
| U-17 | Is behavior stable beyond Claude Code 2.1.283? | Re-validation per version |

## Architectural consequences

The verified results force these design changes. All of them are already applied to MASTER-SPEC (MP-1 to MP-8) and PROPOSED-SYSTEM-ARCHITECTURE (§1.1, principles A-K).

1. **The runtime is the source of truth.** The model proposes; AEOS validates policy, permissions, state, evidence and completion (AD-01).
2. **AEOS only restricts.** Hooks return `deny`, `ask` or no decision, never `allow`. `updatedInput` is used only for narrowing (AD-02).
3. **Autonomy levels are ceilings** layered on Claude Code's own mode, which on 2.1.283 defaults to `auto` (AD-02).
4. **AEOS owns its state**, and that state needs its own protection (AD-03, AD-06).
5. **Specialists are not Claude Code skills.** They are runtime-served cards, controlled subagents or runtime code (AD-04).
6. **Role policy is enforced globally** by `agent_type`, because plugin agents can't be relied on to carry their own hooks or permissions (AD-05).
7. **Safety uses five layers of defense in depth**, and the known gaps are stated (AD-06).
8. **A Hook Compatibility Manager** is required before any installation. This machine already has gstack and paysec Stop hooks (AD-07).
9. **MCP is gated by an explicit `mcp__.*` matcher** (AD-08).
10. **Detached processes are managed**, and no safety property depends on them (AD-09).
11. **User-only relaxation is an unresolved security boundary.** Tightening is allowed from any source; relaxation goes out of band (AD-10).
12. **The constitution falls back to stub embedding** unless SK-4 validates (AD-11).

## Remaining blockers before runtime implementation

### Must be resolved before any AEOS runtime code (R2) is written

| ID | Blocker | Why it blocks |
|---|---|---|
| B-1 | **U-10** hook latency and timeout behavior per OS | The policy hook runs on every tool call. If latency or timeout semantics are unacceptable, especially on Windows, the enforcement architecture changes (for example, the daemon becomes mandatory). |
| B-2 | **U-11 / SK-6** shell parsing approach and accuracy | This is the core of the safety engine. The parser choice (pure JS vs the PowerShell parser API) shapes the runtime's dependencies. |
| B-3 | **U-12, U-16, U-04** hook coexistence, ordering and reload | This must be known before designing the installer and the Stop gate, because this machine already carries two foreign Stop hooks. |
| B-4 | **U-06 / SK-4** constitution delivery | Decides the skill-stub format and the token model, which in turn sets the IO-39 targets. |
| B-5 | **U-02** plus a decision on the relaxation channel | Either validate a relaxation channel, or explicitly accept the restart-only fallback for R2. This is a design decision the owner must make (ROADMAP Q21). |
| B-6 | **U-14** sandbox availability and coverage per OS | Defense-in-depth layer 3 underpins the protection claims (AD-06), and the R2 safety exit criteria depend on it. |
| B-7 | R0-blocking open questions **Q1, Q2, Q3, Q5, Q7, Q8, Q11**, plus Phase 2 questions **Q20, Q21, Q22** (ROADMAP) | Naming, license, the paysec relationship, host scope, default autonomy, model set and budget, and ownership. Also managed-settings availability, the relaxation fallback, and approval of the isolated hands-on test environment. **Q22 is a prerequisite for resolving B-1 to B-6.** |

### Not blocking R2 (a safe fallback is already defined)

| ID | Item | Fallback |
|---|---|---|
| U-01 | MCP `"*"` coverage | The explicit matcher is adopted |
| U-03 | Detached-process exit behavior | R2 has no mandatory daemon. **This blocks R3** (browser driver). |
| U-05 | Plugin-agent field behavior | Global enforcement is adopted |
| U-07 | `updatedInput` composition | Narrow-only; otherwise `ask` |
| U-09 | Hook-absence detection | State the limit; degrade conservatively |
| U-13 | Managed-settings availability | Layers 1-3 and 5 stand alone |
| U-15 | `node:sqlite` stability | JSONL fallback |
| U-17 | Version stability | Record the validated version; `doctor` warns |

### Blocker status after hands-on validation (2026-09-27, before owner decisions)

This is the evidence-only assessment, kept as a record. The final disposition after the owner decisions is under [Final blocker disposition](#final-blocker-disposition-2026-09-27).

| Blocker | Status | Evidence | What closes it |
|---|---|---|---|
| B-1 | **PARTIALLY RESOLVED** | U-10: Windows latency measured; timeout fails open | Owner accepts the Windows-first evidence and the revised budget (≤ 150 ms median, ≤ 250 ms p95, internal deadline), **or** measure on macOS and Linux |
| B-2 | **PARTIALLY RESOLVED** | U-11: PowerShell AST adequate; naive matching insufficient | Owner accepts PowerShell-first, with a bash parser validated before Bash-tool enforcement is enabled, **or** validate a bash parser now |
| B-3 | **RESOLVED** | U-12, U-16, U-04 | — |
| B-4 | **RESOLVED** | U-06 | — |
| B-5 | **PARTIALLY RESOLVED** | U-02: restart-only mechanism works; human attribution not available | Owner decision Q21 (adopt restart-only) |
| B-6 | **PARTIALLY RESOLVED** | U-14, U-08: no sandbox on Windows; interpreter bypass | Owner accepts the compensating design (OS ACLs on AEOS state, opaque-exec policy, integrity checks), **or** test the sandbox on other operating systems |
| B-7 | **UNRESOLVED** | — | Owner decisions Q1, Q2, Q3, Q5, Q7, Q8, Q11, Q20, Q21, Q22 (Q22 is effectively answered by the isolated-environment approval used for this validation) |

## Owner decisions (2026-09-27)

These are the owner's approved decisions on the Phase 2 blockers and the B-7 questions. They are the authoritative record. ROADMAP, PLATFORM-ASSUMPTIONS, ARCHITECTURAL-DECISIONS, MASTER-SPEC and the hands-on report reference this table.

| ID | Owner decision | Deliberately deferred (still open) |
|---|---|---|
| **B-1** | **Accept the Windows-first latency budget:** ≤ 150 ms median and ≤ 250 ms p95 per hook call. No macOS or Linux measurement is required for Phase 2. **Separately:** hands-on, a PreToolUse hook timeout **fails open** (the tool call proceeds), so AEOS must **not** rely on hook timeouts as a safety boundary. | macOS and Linux latency measurement |
| **B-2** | **Accept PowerShell-first shell parsing.** **No Bash parser is validated.** Until one is: AEOS claims no semantic Bash enforcement, never auto-approves Bash commands, and stops or asks per the configured safety policy. Bash is not treated as unrestricted, and Claude Code's native permissions still apply. This posture is not equivalent to validated Bash enforcement. | Bash parser selection and validation (a Phase 3/platform-validation item) |
| **B-5 / Q21** | **Accept restart-only autonomy relaxation for R2** until an in-session relaxation channel is validated. | Validating an in-session relaxation channel |
| **B-6** | **Accept the Windows compensating design:** OS ACLs on AEOS state, the opaque-exec policy, and integrity checks. This is **not** equivalent to an OS sandbox and must never be described as one. | Cross-platform sandbox testing |
| **Q1** | Keep **AEOS** as the working product name and namespace for R0/R1 specification work. | Final product name (a pre-release decision) |
| **Q2** | Treat the project as **proprietary/internal** for now. | Public licensing, to revisit if the project becomes public |
| **Q3** | **Coexist** with the existing paysec fork during development. Do **not** reuse paysec code. | Migration guidance |
| **Q5** | **Claude Code only until R8.** Other hosts require explicit adapters and safety-cap validation before they are supported. | Host tiers beyond Claude Code (R8) |
| **Q7** | **L1** is the default autonomy level for interactive sessions. A project may explicitly configure L2. | — |
| **Q8** | Use the **current Claude flagship plus one mid-tier model** for benchmark design. **No paid-evaluation budget is set.** | The paid-eval dollar budget. Owner decision required **before any paid benchmark execution**. |
| **Q11** | **Not supplied.** Team size, spec owner and safety reviewer are owner-supplied organizational metadata. None is invented. | Team size, spec owner, safety reviewer. Required **before the relevant R0 safety-review gate** (MASTER-SPEC §18.2). |
| **Q20** | For Phase 2, **assume managed settings are unavailable** to individual users. Managed settings are documented as a **recommended organizational** defense-in-depth layer. No claim is made that the tested individual environment has a local `managed-settings.json`: none was found. | Organizational deployment of managed settings |
| **Q22** | The owner **explicitly approves** the isolated scratch environment used for Phase 2 hands-on validation (`platform-validation/scratch`, separate `CLAUDE_CONFIG_DIR`). | — |

## Final blocker disposition (2026-09-27)

These statuses reflect the owner decisions above. The underlying evidence statuses are unchanged; they are not upgraded by the decisions.

| Blocker | Final status | Basis | Evidence status (unchanged) |
|---|---|---|---|
| B-1 | **RESOLVED by owner acceptance** of a documented fallback | Windows-first budget accepted; timeout fail-open documented as not a safety boundary | U-10 PARTIALLY VERIFIED (Windows only) |
| B-2 | **RESOLVED by owner acceptance** | PowerShell-first accepted; no validated Bash parser, so a conservative Bash posture applies (no auto-approve; stop or ask per policy) | U-11 PARTIALLY VERIFIED |
| B-3 | **RESOLVED by evidence** | Hands-on | U-12, U-16, U-04 VERIFIED |
| B-4 | **RESOLVED by evidence** | Hands-on | U-06 VERIFIED |
| B-5 | **RESOLVED by owner acceptance** | Restart-only relaxation adopted for R2 (Q21) | U-02 PARTIALLY VERIFIED; the restart-only mechanism VERIFIED in simulation |
| B-6 | **RESOLVED by owner acceptance** | Windows compensating design accepted, and not equivalent to a sandbox | U-14 PARTIALLY VERIFIED (sandbox NOT AVAILABLE on Windows); U-08 PARTIALLY VERIFIED |
| B-7 | **RESOLVED: owner decisions recorded** for Q1, Q2, Q3, Q5, Q7, Q8, Q11, Q20, Q21, Q22 | For Q8 (budget) and Q11 (ownership metadata), the recorded decision is an **explicit deferral with a gate**, not a supplied value | — |

## Exit decision

**Phase 2 satisfies its documented exit criteria** (re-assessed after the owner decisions, 2026-09-27). **Phase 3 has not been started.**

| Criterion | Status |
|---|---|
| 1. B-1 to B-6 resolved with hands-on evidence or explicitly accepted by the owner with a documented fallback | Met. B-3 and B-4 by evidence; B-1, B-2, B-5 and B-6 by owner acceptance. |
| 2. PLATFORM-ASSUMPTIONS statuses updated from the evidence | Met (hands-on update and owner-decision annotations) |
| 3. Affected ADs revised where results contradicted them | Met (AD-01 to AD-13) |
| 4. The R0-blocking open questions (B-7) have owner decisions | Met. Two are decided as gated deferrals: Q8 budget and Q11 ownership metadata. |

- **What is complete:**
  - the documentation-level validation of all 13 capability questions
  - the hands-on validation on Windows (U-01 to U-20; see HANDS-ON-VALIDATION-REPORT)
  - the architectural decisions **AD-01 to AD-13**
  - the owner decisions above
- **Carried forward as open items.** None blocks Phase 2 exit, but each gates a later step:

  | Open item | Gates |
  |---|---|
  | Bash parser validation | Any claim of semantic Bash enforcement. Until then, the conservative posture applies. |
  | Sandbox testing on other operating systems | Any cross-platform sandbox claim |
  | macOS and Linux latency | A non-Windows latency budget |
  | Other Claude Code versions (U-17) | Supported-version claims |
  | Final product name (Q1) | Pre-release |
  | Final public licensing (Q2) | Any public release |
  | Paid benchmark budget (Q8) | Paid benchmark execution |
  | Organizational ownership metadata (Q11) | The R0 safety-review gate |
  | Untested MCP server types (U-01) | Claims about MCP coverage |
  | Untested prompt sources (U-02) | An in-session relaxation channel |
  | `auto` and `bypassPermissions` mode behavior | Claims about those modes |
  | Managed-settings deployment (Q20) | Organizational use of layer 4 |

Phase 2 may exit when **all** of the following hold (the criteria as originally documented, now met):
1. Blockers B-1 to B-6 are each resolved with recorded hands-on evidence (host version, OS, date, procedure, result), or explicitly accepted by the owner with a documented fallback.
2. PLATFORM-ASSUMPTIONS statuses are updated from that evidence.
3. The affected ADs are revised if any result contradicts them.
4. The R0-blocking open questions (B-7) have owner decisions.

### Constraints for completing validation

- Hands-on tests must run in an **isolated environment**: a scratch project, and a separate Claude Code configuration directory (for example via `CLAUDE_CONFIG_DIR`) or a disposable VM or container.
- They must **not modify** `~/.claude/settings.json`, gstack, paysec or any production system.
- The one deliberate exception is **read-only observation** of how the existing gstack and paysec Stop hooks behave. Where coexistence tests need foreign hooks, use copies with the same shape in the isolated configuration.
