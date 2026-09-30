# dkskill Capability Catalogue (M0)

**STATUS: M0 DESIGN COMPLETE / NOT YET IMPLEMENTED IN RUNTIME**

M0 defines the capability *vocabulary* only. It creates no runtime consumers and certifies no version or platform.

- M1 compatibility registry — **not implemented**
- M2 attribution equivalence — **not implemented**
- M3 Host Compatibility Layer (HCL) — **not implemented**
- M4 certification harness — **not implemented**
- M5 additional profile certification — **not implemented**
- M6 benchmark/product separation — **not implemented**
- **No new version or platform is certified by M0.**

## Frozen Phase 4 state (unchanged by M0)

- Benchmark Claude Code version: **2.1.283**; pinned SHA-256 `9DBE16…DE3A`.
- `ATTR_VALID_FOR`: `['2.1.283']`. TS-07: **UNRESOLVED**. Run A: **BLOCKED/UNAUTHORIZED**. 2.1.284: **UNVALIDATED**. `/runtime/`: **absent**.

## Capability states (canonical semantics)

- **VERIFIED:** Capability demonstrated by recorded evidence for a specific host identity (here, the Phase 2 hands-on identity / benchmark pin 2.1.283).
- **PARTIALLY_VERIFIED:** Demonstrated only in part or under stated limits.
- **NOT_YET_VALIDATED:** No sufficient current evidence; a defined future validation is required (maps to the owner review NOT_VERIFIED).
- **NOT_AVAILABLE:** Demonstrated to be absent on the relevant host/platform.
- **DEGRADED_AT_RUNTIME:** A certified profile claims the capability but a live T2 self-check failed this session; the T2 failure overrides the certified claim for that session. (Runtime-only state; no capability is catalogued in this state.)

### Distinctions
- **known to exist:** The capability exists on some host (evidence recorded).
- **validated for profile:** The capability is VERIFIED for a specific host compatibility profile.
- **required by feature:** A dkskill feature depends on the capability (dependency model).
- **certified for production:** A signed certification record exists for the host profile (H-Q4/H-Q6). M0 certifies nothing.

## Safety semantics

UNVERIFIED != UNSUPPORTED. However, an UNVERIFIED safety-critical capability means dkskill MUST NOT claim certified enforcement on that host (H-Q1: refuse enforcement on unverified hosts).

## Version independence

Capability IDs are stable semantic identities and are NEVER tied to a single Claude Code version (no CAP-CC-2.1.283-* IDs). A new version normally adds a compatibility profile/facet when behavior differs; it does not create a new capability.

## Dependency model (specification only)

dkskill feature -> required capabilities -> host compatibility profile -> facet adapter -> evidence/certification. Data/specification relationship only; the HCL and runtime resolver are NOT implemented in M0.

## Counts

- **Capabilities:** 25
- **By state:** NOT_YET_VALIDATED=1, PARTIALLY_VERIFIED=7, VERIFIED=17
- **By criticality:** CRITICAL=8, HIGH=13, LOW=1, MEDIUM=3

## Capability summary

| ID | Name | Criticality | State | Required for | Host facet |
|---|---|---|---|---|---|
| CAP-HOOK-PRETOOLUSE-INTERCEPT | PreToolUse interception | CRITICAL | VERIFIED | core_safety_enforcement | hook-protocol |
| CAP-HOOK-POSTTOOLUSE-INTERCEPT | PostToolUse interception | HIGH | VERIFIED | core_safety_enforcement | hook-protocol |
| CAP-HOOK-SUBAGENT-INTERCEPT | Subagent tool-call interception | CRITICAL | VERIFIED | core_safety_enforcement | hook-protocol |
| CAP-MCP-MATCHER | MCP tool matchers | CRITICAL | PARTIALLY_VERIFIED | core_safety_enforcement | hook-protocol |
| CAP-HOOK-DENY-REASON-VISIBLE | Hook deny reason visibility | CRITICAL | VERIFIED | core_safety_enforcement | hook-protocol |
| CAP-PERMISSION-PRECEDENCE | allow/deny/ask precedence | CRITICAL | VERIFIED | core_safety_enforcement | permission-model |
| CAP-UPDATEDINPUT-NARROWING | updatedInput narrowing | MEDIUM | PARTIALLY_VERIFIED | optional_functionality | hook-protocol |
| CAP-SUBAGENT-TOOL-RESTRICTIONS | Subagent tools/disallowedTools enforcement | HIGH | VERIFIED | core_safety_enforcement | agents |
| CAP-SKILL-TOOL-FLAGS | Skill tool and invocation flags | HIGH | PARTIALLY_VERIFIED | optional_functionality | skills |
| CAP-HOOK-ENV-IDENTIFIERS | Hook environment identifiers | HIGH | VERIFIED | core_safety_enforcement | hook-protocol |
| CAP-SETTINGS-PRECEDENCE | Settings precedence | HIGH | VERIFIED | core_safety_enforcement | permission-model |
| CAP-MANAGED-SETTINGS | Managed settings | HIGH | PARTIALLY_VERIFIED | core_safety_enforcement | permission-model |
| CAP-PERMISSION-MODE-CEILING | Permission-mode ceiling and default behavior | HIGH | VERIFIED | core_safety_enforcement | permission-modes |
| CAP-PROTECTED-PATHS | Protected configuration paths | MEDIUM | PARTIALLY_VERIFIED | core_safety_enforcement | filesystem |
| CAP-HOOK-CONCURRENCY | Multiple hook concurrency | HIGH | VERIFIED | core_safety_enforcement | hook-protocol |
| CAP-DENY-PRECEDENCE | Deny precedence across hooks | CRITICAL | VERIFIED | core_safety_enforcement | hook-protocol |
| CAP-STOP-HOOK | Stop hook blocking | MEDIUM | VERIFIED | core_safety_enforcement | hook-protocol |
| CAP-SESSIONSTART-CONTEXT | SessionStart context injection | HIGH | VERIFIED | core_safety_enforcement | hook-protocol |
| CAP-COMPACTION-CONTEXT | Context redelivery after compaction | HIGH | VERIFIED | core_safety_enforcement | hook-protocol |
| CAP-CONFIG-RELOAD | Configuration reload | LOW | VERIFIED | optional_functionality | settings |
| CAP-HOOK-HEARTBEAT | Hook-presence heartbeat | CRITICAL | VERIFIED | core_safety_enforcement | hook-protocol |
| CAP-HOOK-TIMEOUT-FAILOPEN | Hook timeout semantics (fails open) | CRITICAL | VERIFIED | core_safety_enforcement | hook-protocol |
| CAP-STREAM-SCHEMA | stream-json event schema | HIGH | PARTIALLY_VERIFIED | benchmark_attribution_only | stream |
| CAP-ATTRIBUTION-TEXT | Permission/attribution text (attr@N) | HIGH | PARTIALLY_VERIFIED | benchmark_attribution_only | attribution |
| CAP-HOST-IDENTITY-DETECT | Host identity / version / platform / channel detection | HIGH | NOT_YET_VALIDATED | core_safety_enforcement | identity-probe |

## Capability details

### CAP-HOOK-PRETOOLUSE-INTERCEPT — PreToolUse interception

A PreToolUse hook (matcher "*"/""/none) observes and can block tool calls that reach execution.

- **Criticality:** CRITICAL · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** hook-protocol
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** No pre-execution enforcement; dkskill must refuse certified enforcement on this host (H-Q1).
- **Certification requirement:** Per host profile: demonstrate a PreToolUse hook observes and denies a tool call that reaches execution.
- **Platform/version sensitivity:** Hook protocol may change across versions; re-verify per profile.
- **Known limitations:** Only calls that reach execution are seen; calls rejected earlier by native validation/deny never reach PreToolUse (U-20).
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-01 (Phase 2, VERIFIED (hands-on)); PLATFORM-ASSUMPTIONS.md#V-12 (Phase 2, VERIFIED); PLATFORM-ASSUMPTIONS.md#U-20 (Phase 2, limitation); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-01 (Phase 2, PARTIALLY VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-HOOK-POSTTOOLUSE-INTERCEPT — PostToolUse interception

A PostToolUse hook observes tool calls after execution (post-hoc observation, not prevention).

- **Criticality:** HIGH · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** hook-protocol
- **Safe degradation permitted:** true · **Blocks certification:** false
- **Failure behavior:** No post-execution observation; reconciliation/audit degrades; enforcement relies on PreToolUse.
- **Certification requirement:** Per host profile: demonstrate a PostToolUse hook fires with the executed tool call.
- **Platform/version sensitivity:** Hook protocol may change across versions.
- **Known limitations:** Post-hoc only: cannot prevent the side effect; shares V-01 evidence with PreToolUse rather than an independent experiment.
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-01 (Phase 2, VERIFIED (hands-on)); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-HOOK-SUBAGENT-INTERCEPT — Subagent tool-call interception

Hooks observe tool calls inside subagents; events carry agent_id and agent_type.

- **Criticality:** CRITICAL · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** hook-protocol
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** Subagent actions unpoliced; refuse certified enforcement for subagent scenarios (H-Q1).
- **Certification requirement:** Per host profile: demonstrate hook events for subagent tool calls include agent_id/agent_type.
- **Platform/version sensitivity:** Subagent event shape may change across versions.
- **Known limitations:** Subagent calls rejected earlier by native validation never reach the hook (U-20).
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-01 (Phase 2, VERIFIED (hands-on)); PLATFORM-ASSUMPTIONS.md#V-12 (Phase 2, VERIFIED); PLATFORM-ASSUMPTIONS.md#U-20 (Phase 2, limitation); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-MCP-MATCHER — MCP tool matchers

Hook matchers (mcp__.* and "*") intercept MCP tool calls.

- **Criticality:** CRITICAL · **State:** PARTIALLY_VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** hook-protocol
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** Unmatched MCP calls are unpoliced; refuse certified enforcement for those MCP types.
- **Certification requirement:** Per host profile and per MCP server type: demonstrate matcher interception.
- **Platform/version sensitivity:** MCP wiring and server types vary; re-verify per type/version.
- **Known limitations:** Verified for local stdio MCP servers only; other MCP server types (plugin/remote) untested (U-01). Only tools whose names match the pattern are covered.
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-02 (Phase 2, VERIFIED); PLATFORM-ASSUMPTIONS.md#V-01 (Phase 2, VERIFIED (hands-on, local stdio)); PLATFORM-ASSUMPTIONS.md#U-01 (Phase 2, untested: non-stdio MCP); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-15 (Phase 2, PARTIALLY VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-HOOK-DENY-REASON-VISIBLE — Hook deny reason visibility

A hook can block a call (exit 2 or permissionDecision:"deny") with a reason the model sees.

- **Criticality:** CRITICAL · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** hook-protocol
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** Denials without a visible reason; model cannot self-correct; refuse certified enforcement.
- **Certification requirement:** Per host profile: demonstrate a deny with a model-visible reason.
- **Platform/version sensitivity:** Decision protocol may change across versions.
- **Known limitations:** none recorded
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-03 (Phase 2, VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-PERMISSION-PRECEDENCE — allow/deny/ask precedence

allow cannot override stronger deny/ask rules or managed permissions.

- **Criticality:** CRITICAL · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** permission-model
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** Precedence unreliable; enforcement cannot be trusted; refuse certified enforcement.
- **Certification requirement:** Per host profile: demonstrate deny/ask beats allow.
- **Platform/version sensitivity:** Permission model may change across versions.
- **Known limitations:** dkskill never emits allow (MASTER-SPEC S-9); a foreign hook allow can loosen native checks and is reported (V-16/U-16).
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-04 (Phase 2, VERIFIED); PLATFORM-ASSUMPTIONS.md#V-11 (Phase 2, VERIFIED); PLATFORM-ASSUMPTIONS.md#V-16 (Phase 2, VERIFIED (hands-on)); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-05 (Phase 2, VERIFIED / PARTIALLY VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-UPDATEDINPUT-NARROWING — updatedInput narrowing

A hook can narrow (normalize/restrict) tool input via updatedInput.

- **Criticality:** MEDIUM · **State:** PARTIALLY_VERIFIED · **Required for:** optional_functionality · **Host facet:** hook-protocol
- **Safe degradation permitted:** true · **Blocks certification:** false
- **Failure behavior:** Optional narrowing unavailable; dkskill omits the feature; core enforcement unaffected.
- **Certification requirement:** Per host profile: demonstrate narrowing and (future) multi-hook composition.
- **Platform/version sensitivity:** Hook input-rewrite semantics may change.
- **Known limitations:** Only narrowing normalizations demonstrated; composition of updatedInput across multiple hooks is untested (U-07).
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-05 (Phase 2, PARTIALLY VERIFIED); PLATFORM-ASSUMPTIONS.md#U-07 (Phase 2, composition untested); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-05 (Phase 2, PARTIALLY VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-SUBAGENT-TOOL-RESTRICTIONS — Subagent tools/disallowedTools enforcement

Subagent tools allowlist and disallowedTools denylist (incl mcp__*) are enforced; nesting has a depth limit.

- **Criticality:** HIGH · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** agents
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** Subagent tool restrictions unenforced; refuse certified enforcement for subagent tool policy.
- **Certification requirement:** Per host profile: demonstrate tool-list enforcement for local and plugin agents.
- **Platform/version sensitivity:** Agent frontmatter handling may change across versions.
- **Known limitations:** Plugin agents honor tools/disallowedTools but ignore their frontmatter hooks/permissionMode/mcpServers (V-22/U-05); role policy must come from global/plugin-level hooks keyed on agent_type.
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-06 (Phase 2, VERIFIED); PLATFORM-ASSUMPTIONS.md#V-22 (Phase 2, VERIFIED (hands-on)); PLATFORM-ASSUMPTIONS.md#U-05 (Phase 2, plugin frontmatter not relied on); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-16 (Phase 2, VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-SKILL-TOOL-FLAGS — Skill tool and invocation flags

The Skill tool invokes skills; disable-model-invocation and user-invocable flags restrict invocation.

- **Criticality:** HIGH · **State:** PARTIALLY_VERIFIED · **Required for:** optional_functionality · **Host facet:** skills
- **Safe degradation permitted:** true · **Blocks certification:** false
- **Failure behavior:** Skill invocation controls unavailable; dkskill limits skill-based features.
- **Certification requirement:** Per host profile: demonstrate Skill invocation and the invocation-restriction flags.
- **Platform/version sensitivity:** Skill flag semantics may change across versions.
- **Known limitations:** No mechanism hides a skill from both model and user while allowing runtime invocation (V-08).
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-07 (Phase 2, VERIFIED); PLATFORM-ASSUMPTIONS.md#V-08 (Phase 2, PARTIALLY VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-HOOK-ENV-IDENTIFIERS — Hook environment identifiers

Hooks run as separate processes with session_id, prompt_id, agent_id, transcript_path; CLAUDE_PLUGIN_DATA is persistent plugin storage.

- **Criticality:** HIGH · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** hook-protocol
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** dkskill cannot correlate events/state; enforcement correlation degrades; refuse where correlation is required.
- **Certification requirement:** Per host profile: demonstrate the identifier set is present in hook input/env.
- **Platform/version sensitivity:** Identifier set may change across versions.
- **Known limitations:** No general runtime-state API; dkskill owns its state.
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-09 (Phase 2, VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-SETTINGS-PRECEDENCE — Settings precedence

Settings allow/deny/ask rules apply and deny beats allow across the settings hierarchy.

- **Criticality:** HIGH · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** permission-model
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** Settings-based policy unreliable; refuse certified enforcement.
- **Certification requirement:** Per host profile: demonstrate settings precedence (deny beats allow).
- **Platform/version sensitivity:** Settings hierarchy may change across versions.
- **Known limitations:** none recorded
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-11 (Phase 2, VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-MANAGED-SETTINGS — Managed settings

Managed (organization) settings can restrict permissions and bypass modes.

- **Criticality:** HIGH · **State:** PARTIALLY_VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** permission-model
- **Safe degradation permitted:** true · **Blocks certification:** false
- **Failure behavior:** Managed-settings hardening unavailable; dkskill relies on user/project settings; refuse claims that depend on managed settings.
- **Certification requirement:** Per host profile with org deployment: demonstrate managed settings restrict permissions/bypass modes.
- **Platform/version sensitivity:** Managed-settings support varies by deployment/version.
- **Known limitations:** Mechanism documented but requires organizational deployment; not validated hands-on in the isolated environment (U-13).
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-11 (Phase 2, VERIFIED (rule); managed deployment untested); PLATFORM-ASSUMPTIONS.md#U-13 (Phase 2, org deployment untested); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-PERMISSION-MODE-CEILING — Permission-mode ceiling and default behavior

dkskill can impose autonomy restrictions on top of the host permission mode (restrict-only ceiling).

- **Criticality:** HIGH · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** permission-modes
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** Autonomy ceiling unenforceable; refuse certified enforcement of autonomy limits.
- **Certification requirement:** Per host profile: demonstrate a ceiling restriction holds and identify the default mode/classifier behavior.
- **Platform/version sensitivity:** Default mode and classifier behavior are version-sensitive (auto on 2.1.283).
- **Known limitations:** Ceiling only: restrict, never grant. On 2.1.283 the default mode is auto and its classifier may approve routine actions; bypassPermissions loosens checks.
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-13 (Phase 2, VERIFIED (as a ceiling only)); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-PROTECTED-PATHS — Protected configuration paths

The host protects some configuration paths (.claude/, ~/.claude/, .git, .mcp.json, shell rc files).

- **Criticality:** MEDIUM · **State:** PARTIALLY_VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** filesystem
- **Safe degradation permitted:** true · **Blocks certification:** false
- **Failure behavior:** Config paths writable; dkskill must protect its own state independently.
- **Certification requirement:** Per host profile: enumerate protected paths and demonstrate protection under the default mode.
- **Platform/version sensitivity:** Protected-path set and mode behavior vary by version.
- **Known limitations:** dkskill-owned state is not covered by native protection. In auto mode the classifier decides protected writes; bypassPermissions allows them.
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-14 (Phase 2, PARTIALLY VERIFIED); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-11 (Phase 2, PARTIALLY VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-HOOK-CONCURRENCY — Multiple hook concurrency

Multiple hooks on one event all run concurrently; start order follows configuration order; completion order is non-deterministic.

- **Criticality:** HIGH · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** hook-protocol
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** Coexistence with foreign hooks unreliable; refuse certified enforcement where order matters.
- **Certification requirement:** Per host profile: demonstrate concurrent hook execution and order-independence.
- **Platform/version sensitivity:** Concurrency model may change across versions.
- **Known limitations:** dkskill must be order-independent; it cannot rely on running first or on completion order (U-16).
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-16 (Phase 2, VERIFIED (hands-on)); PLATFORM-ASSUMPTIONS.md#U-16 (Phase 2, ordering); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-04 (Phase 2, VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-DENY-PRECEDENCE — Deny precedence across hooks

Deny beats allow; a settings deny beats a hook allow; exit 2 blocks; exit 1 is non-blocking.

- **Criticality:** CRITICAL · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** hook-protocol
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** A deny may not hold; enforcement cannot be trusted; refuse certified enforcement.
- **Certification requirement:** Per host profile: demonstrate deny precedence (exit 2 blocks; settings deny beats hook allow).
- **Platform/version sensitivity:** Decision-combination rules may change across versions.
- **Known limitations:** A hook allow can loosen native checks (it overrode a working-directory block), so dkskill never emits allow and reports foreign allow (U-16).
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-16 (Phase 2, VERIFIED (hands-on)); PLATFORM-ASSUMPTIONS.md#V-04 (Phase 2, VERIFIED); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-05 (Phase 2, VERIFIED / PARTIALLY VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-STOP-HOOK — Stop hook blocking

A Stop hook can block turn end and coexists with other Stop hooks; loop guard is stop_hook_active.

- **Criticality:** MEDIUM · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** hook-protocol
- **Safe degradation permitted:** true · **Blocks certification:** false
- **Failure behavior:** Turn-end gating unavailable; dkskill loses end-of-turn checks; degrade to pre-execution gating.
- **Certification requirement:** Per host profile: demonstrate Stop-hook blocking and stop_hook_active handling.
- **Platform/version sensitivity:** Stop-hook protocol may change across versions.
- **Known limitations:** The gate must honor stop_hook_active to avoid loops (U-12).
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-17 (Phase 2, VERIFIED (hands-on)); PLATFORM-ASSUMPTIONS.md#U-12 (Phase 2, loop guard); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-06 (Phase 2, VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-SESSIONSTART-CONTEXT — SessionStart context injection

SessionStart additionalContext reaches the model at startup; each new session gets its own.

- **Criticality:** HIGH · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** hook-protocol
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** Session rules not delivered; dkskill cannot brief the model; refuse certified enforcement that depends on the brief.
- **Certification requirement:** Per host profile: demonstrate SessionStart context delivery and the size limit.
- **Platform/version sensitivity:** Context delivery and size limit vary by version.
- **Known limitations:** Content must be ≤ ~9,000 characters; larger content is silently truncated (U-06).
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-18 (Phase 2, VERIFIED (hands-on)); PLATFORM-ASSUMPTIONS.md#U-06 (Phase 2, size limit); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-07 (Phase 2, VERIFIED); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-08 (Phase 2, VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-COMPACTION-CONTEXT — Context redelivery after compaction

SessionStart additionalContext is re-delivered after compaction (source: compact).

- **Criticality:** HIGH · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** hook-protocol
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** Rules lost after compaction; long sessions become unbriefed; refuse certified enforcement for long sessions.
- **Certification requirement:** Per host profile: demonstrate context redelivery on compaction.
- **Platform/version sensitivity:** Compaction event behavior is version-sensitive.
- **Known limitations:** Shares the ≤ ~9,000-character limit (U-06); relies on the compaction event firing SessionStart.
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-18 (Phase 2, VERIFIED (hands-on, source: compact)); PLATFORM-ASSUMPTIONS.md#U-06 (Phase 2, size limit); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-07 (Phase 2, VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-CONFIG-RELOAD — Configuration reload

User-scope settings/hook changes apply to a running session within ~1s and emit ConfigChange.

- **Criticality:** LOW · **State:** VERIFIED · **Required for:** optional_functionality · **Host facet:** settings
- **Safe degradation permitted:** true · **Blocks certification:** false
- **Failure behavior:** Live reconfiguration unavailable; dkskill requires session restart for config changes.
- **Certification requirement:** Per host profile: demonstrate live reload and ConfigChange emission.
- **Platform/version sensitivity:** Reload timing/event may change across versions.
- **Known limitations:** Verified at user scope; anything that can write the settings file changes live enforcement — watch ConfigChange (U-04).
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-19 (Phase 2, VERIFIED (hands-on, user scope)); PLATFORM-ASSUMPTIONS.md#U-04 (Phase 2, watch ConfigChange); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-09 (Phase 2, VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-HOOK-HEARTBEAT — Hook-presence heartbeat

A runtime command can detect whether PreToolUse saw its own call (nonce heartbeat) — the T2 self-check base.

- **Criticality:** CRITICAL · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** hook-protocol
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** dkskill cannot confirm its hooks are active; per H-Q1 it must refuse certified enforcement (DEGRADED_AT_RUNTIME if a certified profile then fails T2).
- **Certification requirement:** Per host profile: demonstrate the nonce heartbeat detects hook presence/absence.
- **Platform/version sensitivity:** Heartbeat mechanism depends on hook protocol/version.
- **Known limitations:** Detects missing hooks; it does not prevent them being disabled (U-09).
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-20 (Phase 2, VERIFIED (hands-on)); PLATFORM-ASSUMPTIONS.md#U-09 (Phase 2, detect only); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-12 (Phase 2, VERIFIED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 T2 (proposal, PROPOSED)

### CAP-HOOK-TIMEOUT-FAILOPEN — Hook timeout semantics (fails open)

On PreToolUse hook timeout the hook is cancelled and the tool call PROCEEDS (fail-open).

- **Criticality:** CRITICAL · **State:** VERIFIED · **Required for:** core_safety_enforcement · **Host facet:** hook-protocol
- **Safe degradation permitted:** false · **Blocks certification:** false
- **Failure behavior:** On timeout the action executes unchecked; dkskill must self-bound its hook runtime and record the fail-open posture.
- **Certification requirement:** Per host profile: record the timeout behavior; certification must document fail-open and the compensating internal deadline.
- **Platform/version sensitivity:** Timeout behavior is platform/version-sensitive (verified on Windows/2.1.283 only).
- **Known limitations:** KNOWN CRITICAL LIMITATION: fail-open. dkskill hooks need an internal deadline well below the configured timeout (V-21/U-10).
- **Evidence:** PLATFORM-ASSUMPTIONS.md#V-21 (Phase 2, VERIFIED (hands-on on Windows): fail-open); PLATFORM-ASSUMPTIONS.md#U-10 (Phase 2, internal deadline needed); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-02 (Phase 2, VERIFIED (Windows)); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 (proposal, PROPOSED)

### CAP-STREAM-SCHEMA — stream-json event schema

The host emits a stream-json event schema the harness/HCL can parse (the stream@N facet).

- **Criticality:** HIGH · **State:** PARTIALLY_VERIFIED · **Required for:** benchmark_attribution_only · **Host facet:** stream
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** Unparseable events are anomalies; attribution/scoring cannot proceed; refuse certified attribution.
- **Certification requirement:** Per host profile: capture stream samples and confirm the schema (stream@N facet) on the pinned version.
- **Platform/version sensitivity:** HIGH: revalidate per version (TS-07). Frozen benchmark pin is 2.1.283.
- **Known limitations:** Parsed against the Phase 2/3 corpus for 2.1.283 only; unknown types/fields are anomalies, never guessed. Not validated for other versions (TS-07/U-17).
- **Evidence:** bench/src/parser.ts#parseTranscript / stream@N (Phase 3, implemented for 2.1.283 corpus); platform-validation/HANDS-ON-VALIDATION-REPORT.md#E-03 (Phase 2, PARTIALLY VERIFIED); PLATFORM-ASSUMPTIONS.md#U-17 (Phase 2, not verified beyond 2.1.283); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 T3 (proposal, PROPOSED)

### CAP-ATTRIBUTION-TEXT — Permission/attribution text (attr@N)

Denial/permission message strings map to attribution classes (the attr@N facet).

- **Criticality:** HIGH · **State:** PARTIALLY_VERIFIED · **Required for:** benchmark_attribution_only · **Host facet:** attribution
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** Errors attributed A9/unknown; attribution completeness drops; refuse certified attribution for that version.
- **Certification requirement:** Per host profile: re-derive/confirm attr@N against captured permission events on the pinned version.
- **Platform/version sensitivity:** HIGH: attr table is version-pinned; a new version requires re-derivation (TS-07). Frozen: attr@1 = 2.1.283.
- **Known limitations:** attr@1 is valid ONLY for Claude Code 2.1.283 (ATTR_VALID_FOR); on any other version every error is A9/unknown until the table is re-derived. TS-07 UNRESOLVED.
- **Evidence:** bench/src/attribution.ts#attr@1, ATTR_VALID_FOR ['2.1.283'] (Phase 3, valid for 2.1.283 only); PLATFORM-ASSUMPTIONS.md#U-17 (Phase 2, version stability not verified); benchmark-design/PHASE-3-EXIT-CRITERIA.md#TS-07 (Phase 4, UNRESOLVED); DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 T3 (proposal, PROPOSED)

### CAP-HOST-IDENTITY-DETECT — Host identity / version / platform / channel detection

The HCL identity probe determines the host product, version, platform and release channel to resolve a compatibility profile (T1).

- **Criticality:** HIGH · **State:** NOT_YET_VALIDATED · **Required for:** core_safety_enforcement · **Host facet:** identity-probe
- **Safe degradation permitted:** false · **Blocks certification:** true
- **Failure behavior:** No identity => no profile match => UNVERIFIED host => refuse certified enforcement (H-Q1).
- **Certification requirement:** Future: implement and validate a reliable identity probe (product/version/platform/channel) with recorded evidence.
- **Platform/version sensitivity:** By definition detects platform/version/channel; must be validated per platform.
- **Known limitations:** Proposed in the owner review (§5 T1) but not implemented or validated. A benchmark environment snapshot is listed as a harness piece not yet built. Channel detection has no evidence.
- **Evidence:** DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md#§5 T1 (proposal, PROPOSED); bench/README.md#environment snapshot (not yet built) (Phase 4, NOT_YET_VALIDATED)

