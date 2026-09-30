// M0 — dkskill Capability Catalogue generator (DESIGN/SPEC ONLY; no runtime consumers).
// Single source of truth for bench/compatibility/capability-catalogue.json and CAPABILITY-CATALOGUE.md.
// Every capability is grounded in existing repository evidence (PLATFORM-ASSUMPTIONS.md V-/U- items,
// platform-validation E- experiments, DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md §5) or is
// explicitly NOT_YET_VALIDATED. Nothing here certifies a version/platform or changes any Phase 4 state.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');

export const CRITICALITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export const STATES = ['VERIFIED', 'PARTIALLY_VERIFIED', 'NOT_YET_VALIDATED', 'NOT_AVAILABLE', 'DEGRADED_AT_RUNTIME'] as const;
export const REQUIRED_FOR = ['core_safety_enforcement', 'optional_functionality', 'benchmark_attribution_only'] as const;

export interface EvidenceRef { source: string; ref: string; phase: 'Phase 2' | 'Phase 3' | 'Phase 4' | 'proposal'; status: string }
export interface Capability {
  id: string;
  name: string;
  description: string;
  criticality: (typeof CRITICALITY)[number];
  state: (typeof STATES)[number];
  required_for: (typeof REQUIRED_FOR)[number];
  host_facet_dependency: string;
  limitations: string[];
  evidence_refs: EvidenceRef[];
  certification_requirement: string;
  failure_behavior: string;
  safe_degradation: boolean;
  blocks_certification: boolean;
  platform_version_sensitivity: string;
}

const PA = (ref: string, status: string): EvidenceRef => ({ source: 'PLATFORM-ASSUMPTIONS.md', ref, phase: 'Phase 2', status });
const HANDS = (ref: string, status: string): EvidenceRef => ({ source: 'platform-validation/HANDS-ON-VALIDATION-REPORT.md', ref, phase: 'Phase 2', status });
const REVIEW = (ref: string): EvidenceRef => ({ source: 'DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md', ref, phase: 'proposal', status: 'PROPOSED' });

export const CAPABILITIES: Capability[] = [
  {
    id: 'CAP-HOOK-PRETOOLUSE-INTERCEPT', name: 'PreToolUse interception',
    description: 'A PreToolUse hook (matcher "*"/""/none) observes and can block tool calls that reach execution.',
    criticality: 'CRITICAL', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'hook-protocol',
    limitations: ['Only calls that reach execution are seen; calls rejected earlier by native validation/deny never reach PreToolUse (U-20).'],
    evidence_refs: [PA('V-01', 'VERIFIED (hands-on)'), PA('V-12', 'VERIFIED'), PA('U-20', 'limitation'), HANDS('E-01', 'PARTIALLY VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate a PreToolUse hook observes and denies a tool call that reaches execution.',
    failure_behavior: 'No pre-execution enforcement; dkskill must refuse certified enforcement on this host (H-Q1).',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'Hook protocol may change across versions; re-verify per profile.',
  },
  {
    id: 'CAP-HOOK-POSTTOOLUSE-INTERCEPT', name: 'PostToolUse interception',
    description: 'A PostToolUse hook observes tool calls after execution (post-hoc observation, not prevention).',
    criticality: 'HIGH', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'hook-protocol',
    limitations: ['Post-hoc only: cannot prevent the side effect; shares V-01 evidence with PreToolUse rather than an independent experiment.'],
    evidence_refs: [PA('V-01', 'VERIFIED (hands-on)'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate a PostToolUse hook fires with the executed tool call.',
    failure_behavior: 'No post-execution observation; reconciliation/audit degrades; enforcement relies on PreToolUse.',
    safe_degradation: true, blocks_certification: false, platform_version_sensitivity: 'Hook protocol may change across versions.',
  },
  {
    id: 'CAP-HOOK-SUBAGENT-INTERCEPT', name: 'Subagent tool-call interception',
    description: 'Hooks observe tool calls inside subagents; events carry agent_id and agent_type.',
    criticality: 'CRITICAL', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'hook-protocol',
    limitations: ['Subagent calls rejected earlier by native validation never reach the hook (U-20).'],
    evidence_refs: [PA('V-01', 'VERIFIED (hands-on)'), PA('V-12', 'VERIFIED'), PA('U-20', 'limitation'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate hook events for subagent tool calls include agent_id/agent_type.',
    failure_behavior: 'Subagent actions unpoliced; refuse certified enforcement for subagent scenarios (H-Q1).',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'Subagent event shape may change across versions.',
  },
  {
    id: 'CAP-MCP-MATCHER', name: 'MCP tool matchers',
    description: 'Hook matchers (mcp__.* and "*") intercept MCP tool calls.',
    criticality: 'CRITICAL', state: 'PARTIALLY_VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'hook-protocol',
    limitations: ['Verified for local stdio MCP servers only; other MCP server types (plugin/remote) untested (U-01). Only tools whose names match the pattern are covered.'],
    evidence_refs: [PA('V-02', 'VERIFIED'), PA('V-01', 'VERIFIED (hands-on, local stdio)'), PA('U-01', 'untested: non-stdio MCP'), HANDS('E-15', 'PARTIALLY VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile and per MCP server type: demonstrate matcher interception.',
    failure_behavior: 'Unmatched MCP calls are unpoliced; refuse certified enforcement for those MCP types.',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'MCP wiring and server types vary; re-verify per type/version.',
  },
  {
    id: 'CAP-HOOK-DENY-REASON-VISIBLE', name: 'Hook deny reason visibility',
    description: 'A hook can block a call (exit 2 or permissionDecision:"deny") with a reason the model sees.',
    criticality: 'CRITICAL', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'hook-protocol',
    limitations: [],
    evidence_refs: [PA('V-03', 'VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate a deny with a model-visible reason.',
    failure_behavior: 'Denials without a visible reason; model cannot self-correct; refuse certified enforcement.',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'Decision protocol may change across versions.',
  },
  {
    id: 'CAP-PERMISSION-PRECEDENCE', name: 'allow/deny/ask precedence',
    description: 'allow cannot override stronger deny/ask rules or managed permissions.',
    criticality: 'CRITICAL', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'permission-model',
    limitations: ['dkskill never emits allow (MASTER-SPEC S-9); a foreign hook allow can loosen native checks and is reported (V-16/U-16).'],
    evidence_refs: [PA('V-04', 'VERIFIED'), PA('V-11', 'VERIFIED'), PA('V-16', 'VERIFIED (hands-on)'), HANDS('E-05', 'VERIFIED / PARTIALLY VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate deny/ask beats allow.',
    failure_behavior: 'Precedence unreliable; enforcement cannot be trusted; refuse certified enforcement.',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'Permission model may change across versions.',
  },
  {
    id: 'CAP-UPDATEDINPUT-NARROWING', name: 'updatedInput narrowing',
    description: 'A hook can narrow (normalize/restrict) tool input via updatedInput.',
    criticality: 'MEDIUM', state: 'PARTIALLY_VERIFIED', required_for: 'optional_functionality', host_facet_dependency: 'hook-protocol',
    limitations: ['Only narrowing normalizations demonstrated; composition of updatedInput across multiple hooks is untested (U-07).'],
    evidence_refs: [PA('V-05', 'PARTIALLY VERIFIED'), PA('U-07', 'composition untested'), HANDS('E-05', 'PARTIALLY VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate narrowing and (future) multi-hook composition.',
    failure_behavior: 'Optional narrowing unavailable; dkskill omits the feature; core enforcement unaffected.',
    safe_degradation: true, blocks_certification: false, platform_version_sensitivity: 'Hook input-rewrite semantics may change.',
  },
  {
    id: 'CAP-SUBAGENT-TOOL-RESTRICTIONS', name: 'Subagent tools/disallowedTools enforcement',
    description: 'Subagent tools allowlist and disallowedTools denylist (incl mcp__*) are enforced; nesting has a depth limit.',
    criticality: 'HIGH', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'agents',
    limitations: ['Plugin agents honor tools/disallowedTools but ignore their frontmatter hooks/permissionMode/mcpServers (V-22/U-05); role policy must come from global/plugin-level hooks keyed on agent_type.'],
    evidence_refs: [PA('V-06', 'VERIFIED'), PA('V-22', 'VERIFIED (hands-on)'), PA('U-05', 'plugin frontmatter not relied on'), HANDS('E-16', 'VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate tool-list enforcement for local and plugin agents.',
    failure_behavior: 'Subagent tool restrictions unenforced; refuse certified enforcement for subagent tool policy.',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'Agent frontmatter handling may change across versions.',
  },
  {
    id: 'CAP-SKILL-TOOL-FLAGS', name: 'Skill tool and invocation flags',
    description: 'The Skill tool invokes skills; disable-model-invocation and user-invocable flags restrict invocation.',
    criticality: 'HIGH', state: 'PARTIALLY_VERIFIED', required_for: 'optional_functionality', host_facet_dependency: 'skills',
    limitations: ['No mechanism hides a skill from both model and user while allowing runtime invocation (V-08).'],
    evidence_refs: [PA('V-07', 'VERIFIED'), PA('V-08', 'PARTIALLY VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate Skill invocation and the invocation-restriction flags.',
    failure_behavior: 'Skill invocation controls unavailable; dkskill limits skill-based features.',
    safe_degradation: true, blocks_certification: false, platform_version_sensitivity: 'Skill flag semantics may change across versions.',
  },
  {
    id: 'CAP-HOOK-ENV-IDENTIFIERS', name: 'Hook environment identifiers',
    description: 'Hooks run as separate processes with session_id, prompt_id, agent_id, transcript_path; CLAUDE_PLUGIN_DATA is persistent plugin storage.',
    criticality: 'HIGH', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'hook-protocol',
    limitations: ['No general runtime-state API; dkskill owns its state.'],
    evidence_refs: [PA('V-09', 'VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate the identifier set is present in hook input/env.',
    failure_behavior: 'dkskill cannot correlate events/state; enforcement correlation degrades; refuse where correlation is required.',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'Identifier set may change across versions.',
  },
  {
    id: 'CAP-SETTINGS-PRECEDENCE', name: 'Settings precedence',
    description: 'Settings allow/deny/ask rules apply and deny beats allow across the settings hierarchy.',
    criticality: 'HIGH', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'permission-model',
    limitations: [],
    evidence_refs: [PA('V-11', 'VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate settings precedence (deny beats allow).',
    failure_behavior: 'Settings-based policy unreliable; refuse certified enforcement.',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'Settings hierarchy may change across versions.',
  },
  {
    id: 'CAP-MANAGED-SETTINGS', name: 'Managed settings',
    description: 'Managed (organization) settings can restrict permissions and bypass modes.',
    criticality: 'HIGH', state: 'PARTIALLY_VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'permission-model',
    limitations: ['Mechanism documented but requires organizational deployment; not validated hands-on in the isolated environment (U-13).'],
    evidence_refs: [PA('V-11', 'VERIFIED (rule); managed deployment untested'), PA('U-13', 'org deployment untested'), REVIEW('§5')],
    certification_requirement: 'Per host profile with org deployment: demonstrate managed settings restrict permissions/bypass modes.',
    failure_behavior: 'Managed-settings hardening unavailable; dkskill relies on user/project settings; refuse claims that depend on managed settings.',
    safe_degradation: true, blocks_certification: false, platform_version_sensitivity: 'Managed-settings support varies by deployment/version.',
  },
  {
    id: 'CAP-PERMISSION-MODE-CEILING', name: 'Permission-mode ceiling and default behavior',
    description: 'dkskill can impose autonomy restrictions on top of the host permission mode (restrict-only ceiling).',
    criticality: 'HIGH', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'permission-modes',
    limitations: ['Ceiling only: restrict, never grant. On 2.1.283 the default mode is auto and its classifier may approve routine actions; bypassPermissions loosens checks.'],
    evidence_refs: [PA('V-13', 'VERIFIED (as a ceiling only)'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate a ceiling restriction holds and identify the default mode/classifier behavior.',
    failure_behavior: 'Autonomy ceiling unenforceable; refuse certified enforcement of autonomy limits.',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'Default mode and classifier behavior are version-sensitive (auto on 2.1.283).',
  },
  {
    id: 'CAP-PROTECTED-PATHS', name: 'Protected configuration paths',
    description: 'The host protects some configuration paths (.claude/, ~/.claude/, .git, .mcp.json, shell rc files).',
    criticality: 'MEDIUM', state: 'PARTIALLY_VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'filesystem',
    limitations: ['dkskill-owned state is not covered by native protection. In auto mode the classifier decides protected writes; bypassPermissions allows them.'],
    evidence_refs: [PA('V-14', 'PARTIALLY VERIFIED'), HANDS('E-11', 'PARTIALLY VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: enumerate protected paths and demonstrate protection under the default mode.',
    failure_behavior: 'Config paths writable; dkskill must protect its own state independently.',
    safe_degradation: true, blocks_certification: false, platform_version_sensitivity: 'Protected-path set and mode behavior vary by version.',
  },
  {
    id: 'CAP-HOOK-CONCURRENCY', name: 'Multiple hook concurrency',
    description: 'Multiple hooks on one event all run concurrently; start order follows configuration order; completion order is non-deterministic.',
    criticality: 'HIGH', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'hook-protocol',
    limitations: ['dkskill must be order-independent; it cannot rely on running first or on completion order (U-16).'],
    evidence_refs: [PA('V-16', 'VERIFIED (hands-on)'), PA('U-16', 'ordering'), HANDS('E-04', 'VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate concurrent hook execution and order-independence.',
    failure_behavior: 'Coexistence with foreign hooks unreliable; refuse certified enforcement where order matters.',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'Concurrency model may change across versions.',
  },
  {
    id: 'CAP-DENY-PRECEDENCE', name: 'Deny precedence across hooks',
    description: 'Deny beats allow; a settings deny beats a hook allow; exit 2 blocks; exit 1 is non-blocking.',
    criticality: 'CRITICAL', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'hook-protocol',
    limitations: ['A hook allow can loosen native checks (it overrode a working-directory block), so dkskill never emits allow and reports foreign allow (U-16).'],
    evidence_refs: [PA('V-16', 'VERIFIED (hands-on)'), PA('V-04', 'VERIFIED'), HANDS('E-05', 'VERIFIED / PARTIALLY VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate deny precedence (exit 2 blocks; settings deny beats hook allow).',
    failure_behavior: 'A deny may not hold; enforcement cannot be trusted; refuse certified enforcement.',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'Decision-combination rules may change across versions.',
  },
  {
    id: 'CAP-STOP-HOOK', name: 'Stop hook blocking',
    description: 'A Stop hook can block turn end and coexists with other Stop hooks; loop guard is stop_hook_active.',
    criticality: 'MEDIUM', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'hook-protocol',
    limitations: ['The gate must honor stop_hook_active to avoid loops (U-12).'],
    evidence_refs: [PA('V-17', 'VERIFIED (hands-on)'), PA('U-12', 'loop guard'), HANDS('E-06', 'VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate Stop-hook blocking and stop_hook_active handling.',
    failure_behavior: 'Turn-end gating unavailable; dkskill loses end-of-turn checks; degrade to pre-execution gating.',
    safe_degradation: true, blocks_certification: false, platform_version_sensitivity: 'Stop-hook protocol may change across versions.',
  },
  {
    id: 'CAP-SESSIONSTART-CONTEXT', name: 'SessionStart context injection',
    description: 'SessionStart additionalContext reaches the model at startup; each new session gets its own.',
    criticality: 'HIGH', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'hook-protocol',
    limitations: ['Content must be ≤ ~9,000 characters; larger content is silently truncated (U-06).'],
    evidence_refs: [PA('V-18', 'VERIFIED (hands-on)'), PA('U-06', 'size limit'), HANDS('E-07', 'VERIFIED'), HANDS('E-08', 'VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate SessionStart context delivery and the size limit.',
    failure_behavior: 'Session rules not delivered; dkskill cannot brief the model; refuse certified enforcement that depends on the brief.',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'Context delivery and size limit vary by version.',
  },
  {
    id: 'CAP-COMPACTION-CONTEXT', name: 'Context redelivery after compaction',
    description: 'SessionStart additionalContext is re-delivered after compaction (source: compact).',
    criticality: 'HIGH', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'hook-protocol',
    limitations: ['Shares the ≤ ~9,000-character limit (U-06); relies on the compaction event firing SessionStart.'],
    evidence_refs: [PA('V-18', 'VERIFIED (hands-on, source: compact)'), PA('U-06', 'size limit'), HANDS('E-07', 'VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate context redelivery on compaction.',
    failure_behavior: 'Rules lost after compaction; long sessions become unbriefed; refuse certified enforcement for long sessions.',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'Compaction event behavior is version-sensitive.',
  },
  {
    id: 'CAP-CONFIG-RELOAD', name: 'Configuration reload',
    description: 'User-scope settings/hook changes apply to a running session within ~1s and emit ConfigChange.',
    criticality: 'LOW', state: 'VERIFIED', required_for: 'optional_functionality', host_facet_dependency: 'settings',
    limitations: ['Verified at user scope; anything that can write the settings file changes live enforcement — watch ConfigChange (U-04).'],
    evidence_refs: [PA('V-19', 'VERIFIED (hands-on, user scope)'), PA('U-04', 'watch ConfigChange'), HANDS('E-09', 'VERIFIED'), REVIEW('§5')],
    certification_requirement: 'Per host profile: demonstrate live reload and ConfigChange emission.',
    failure_behavior: 'Live reconfiguration unavailable; dkskill requires session restart for config changes.',
    safe_degradation: true, blocks_certification: false, platform_version_sensitivity: 'Reload timing/event may change across versions.',
  },
  {
    id: 'CAP-HOOK-HEARTBEAT', name: 'Hook-presence heartbeat',
    description: 'A runtime command can detect whether PreToolUse saw its own call (nonce heartbeat) — the T2 self-check base.',
    criticality: 'CRITICAL', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'hook-protocol',
    limitations: ['Detects missing hooks; it does not prevent them being disabled (U-09).'],
    evidence_refs: [PA('V-20', 'VERIFIED (hands-on)'), PA('U-09', 'detect only'), HANDS('E-12', 'VERIFIED'), REVIEW('§5 T2')],
    certification_requirement: 'Per host profile: demonstrate the nonce heartbeat detects hook presence/absence.',
    failure_behavior: 'dkskill cannot confirm its hooks are active; per H-Q1 it must refuse certified enforcement (DEGRADED_AT_RUNTIME if a certified profile then fails T2).',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'Heartbeat mechanism depends on hook protocol/version.',
  },
  {
    id: 'CAP-HOOK-TIMEOUT-FAILOPEN', name: 'Hook timeout semantics (fails open)',
    description: 'On PreToolUse hook timeout the hook is cancelled and the tool call PROCEEDS (fail-open).',
    criticality: 'CRITICAL', state: 'VERIFIED', required_for: 'core_safety_enforcement', host_facet_dependency: 'hook-protocol',
    limitations: ['KNOWN CRITICAL LIMITATION: fail-open. dkskill hooks need an internal deadline well below the configured timeout (V-21/U-10).'],
    evidence_refs: [PA('V-21', 'VERIFIED (hands-on on Windows): fail-open'), PA('U-10', 'internal deadline needed'), HANDS('E-02', 'VERIFIED (Windows)'), REVIEW('§5')],
    certification_requirement: 'Per host profile: record the timeout behavior; certification must document fail-open and the compensating internal deadline.',
    failure_behavior: 'On timeout the action executes unchecked; dkskill must self-bound its hook runtime and record the fail-open posture.',
    safe_degradation: false, blocks_certification: false, platform_version_sensitivity: 'Timeout behavior is platform/version-sensitive (verified on Windows/2.1.283 only).',
  },
  {
    id: 'CAP-STREAM-SCHEMA', name: 'stream-json event schema',
    description: 'The host emits a stream-json event schema the harness/HCL can parse (the stream@N facet).',
    criticality: 'HIGH', state: 'PARTIALLY_VERIFIED', required_for: 'benchmark_attribution_only', host_facet_dependency: 'stream',
    limitations: ['Parsed against the Phase 2/3 corpus for 2.1.283 only; unknown types/fields are anomalies, never guessed. Not validated for other versions (TS-07/U-17).'],
    evidence_refs: [{ source: 'bench/src/parser.ts', ref: 'parseTranscript / stream@N', phase: 'Phase 3', status: 'implemented for 2.1.283 corpus' }, HANDS('E-03', 'PARTIALLY VERIFIED'), PA('U-17', 'not verified beyond 2.1.283'), REVIEW('§5 T3')],
    certification_requirement: 'Per host profile: capture stream samples and confirm the schema (stream@N facet) on the pinned version.',
    failure_behavior: 'Unparseable events are anomalies; attribution/scoring cannot proceed; refuse certified attribution.',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'HIGH: revalidate per version (TS-07). Frozen benchmark pin is 2.1.283.',
  },
  {
    id: 'CAP-ATTRIBUTION-TEXT', name: 'Permission/attribution text (attr@N)',
    description: 'Denial/permission message strings map to attribution classes (the attr@N facet).',
    criticality: 'HIGH', state: 'PARTIALLY_VERIFIED', required_for: 'benchmark_attribution_only', host_facet_dependency: 'attribution',
    limitations: ['attr@1 is valid ONLY for Claude Code 2.1.283 (ATTR_VALID_FOR); on any other version every error is A9/unknown until the table is re-derived. TS-07 UNRESOLVED.'],
    evidence_refs: [{ source: 'bench/src/attribution.ts', ref: "attr@1, ATTR_VALID_FOR ['2.1.283']", phase: 'Phase 3', status: 'valid for 2.1.283 only' }, PA('U-17', 'version stability not verified'), { source: 'benchmark-design/PHASE-3-EXIT-CRITERIA.md', ref: 'TS-07', phase: 'Phase 4', status: 'UNRESOLVED' }, REVIEW('§5 T3')],
    certification_requirement: 'Per host profile: re-derive/confirm attr@N against captured permission events on the pinned version.',
    failure_behavior: 'Errors attributed A9/unknown; attribution completeness drops; refuse certified attribution for that version.',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'HIGH: attr table is version-pinned; a new version requires re-derivation (TS-07). Frozen: attr@1 = 2.1.283.',
  },
  {
    id: 'CAP-HOST-IDENTITY-DETECT', name: 'Host identity / version / platform / channel detection',
    description: 'The HCL identity probe determines the host product, version, platform and release channel to resolve a compatibility profile (T1).',
    criticality: 'HIGH', state: 'NOT_YET_VALIDATED', required_for: 'core_safety_enforcement', host_facet_dependency: 'identity-probe',
    limitations: ['Proposed in the owner review (§5 T1) but not implemented or validated. A benchmark environment snapshot is listed as a harness piece not yet built. Channel detection has no evidence.'],
    evidence_refs: [REVIEW('§5 T1'), { source: 'bench/README.md', ref: 'environment snapshot (not yet built)', phase: 'Phase 4', status: 'NOT_YET_VALIDATED' }],
    certification_requirement: 'Future: implement and validate a reliable identity probe (product/version/platform/channel) with recorded evidence.',
    failure_behavior: 'No identity => no profile match => UNVERIFIED host => refuse certified enforcement (H-Q1).',
    safe_degradation: false, blocks_certification: true, platform_version_sensitivity: 'By definition detects platform/version/channel; must be validated per platform.',
  },
];

export interface Catalogue { schema: 'dkskill.capability_catalogue/1'; version: 1; metadata: Record<string, unknown>; capabilities: Capability[] }

export function buildCatalogue(): Catalogue {
  return {
    schema: 'dkskill.capability_catalogue/1',
    version: 1,
    metadata: {
      title: 'dkskill Capability Catalogue (M0)',
      status: 'M0_DESIGN_COMPLETE_NOT_IMPLEMENTED',
      purpose: 'Canonical, version-independent capability vocabulary for the future dkskill Host Compatibility Layer (HCL). Design/spec only; no runtime consumers.',
      criticality_values: [...CRITICALITY],
      state_values: [...STATES],
      required_for_values: [...REQUIRED_FOR],
      state_semantics: {
        VERIFIED: 'Capability demonstrated by recorded evidence for a specific host identity (here, the Phase 2 hands-on identity / benchmark pin 2.1.283).',
        PARTIALLY_VERIFIED: 'Demonstrated only in part or under stated limits.',
        NOT_YET_VALIDATED: 'No sufficient current evidence; a defined future validation is required (maps to the owner review NOT_VERIFIED).',
        NOT_AVAILABLE: 'Demonstrated to be absent on the relevant host/platform.',
        DEGRADED_AT_RUNTIME: 'A certified profile claims the capability but a live T2 self-check failed this session; the T2 failure overrides the certified claim for that session. (Runtime-only state; no capability is catalogued in this state.)',
      },
      distinctions: {
        known_to_exist: 'The capability exists on some host (evidence recorded).',
        validated_for_profile: 'The capability is VERIFIED for a specific host compatibility profile.',
        required_by_feature: 'A dkskill feature depends on the capability (dependency model).',
        certified_for_production: 'A signed certification record exists for the host profile (H-Q4/H-Q6). M0 certifies nothing.',
      },
      safety_semantics: 'UNVERIFIED != UNSUPPORTED. However, an UNVERIFIED safety-critical capability means dkskill MUST NOT claim certified enforcement on that host (H-Q1: refuse enforcement on unverified hosts).',
      version_independence: 'Capability IDs are stable semantic identities and are NEVER tied to a single Claude Code version (no CAP-CC-2.1.283-* IDs). A new version normally adds a compatibility profile/facet when behavior differs; it does not create a new capability.',
      dependency_model: 'dkskill feature -> required capabilities -> host compatibility profile -> facet adapter -> evidence/certification. Data/specification relationship only; the HCL and runtime resolver are NOT implemented in M0.',
      owner_architecture: {
        'H-Q1': 'REFUSE enforcement on UNVERIFIED hosts.',
        'H-Q2': 'Support the latest 3 CERTIFIED versions initially; expandable by explicit owner decision.',
        'H-Q3': 'Windows, macOS, Linux in certification scope with certified Claude Code channels.',
        'H-Q4': 'Every certified host version/facet gets an immutable compatibility profile and attribution record.',
        'H-Q5': 'Approved benchmark binaries preserved as immutable artifacts (product/version/platform/channel/SHA-256).',
        'H-Q6': 'Compatibility registry requires signed updates; certification/signing authority is the PTPL/dkskill owner.',
        'H-Q7': 'Certification environments are separate from the Phase 4 benchmark environment.',
      },
      frozen_phase4_state: {
        benchmark_claude_code_version: '2.1.283',
        pinned_sha256: '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A',
        attr_valid_for: ['2.1.283'],
        ts07: 'UNRESOLVED',
        run_a: 'BLOCKED_AND_UNAUTHORIZED',
        claude_code_2_1_284: 'UNVALIDATED',
        runtime_dir: 'ABSENT',
        note: 'M0 changes none of the above; it certifies no version or platform.',
      },
      not_implemented: {
        M1_compatibility_registry: false,
        M2_attribution_equivalence: false,
        M3_host_compatibility_layer: false,
        M4_certification_harness: false,
        M5_additional_profile_certification: false,
        M6_benchmark_product_separation: false,
      },
      source_documents: [
        'PLATFORM-ASSUMPTIONS.md (V-01..V-22, U-01..U-20)',
        'platform-validation/HANDS-ON-VALIDATION-REPORT.md (E-00..E-17)',
        'DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md (§5 capability model)',
        'bench/src/attribution.ts (attr@1); bench/src/parser.ts (stream)',
        'benchmark-design/PHASE-3-EXIT-CRITERIA.md (TS-07)',
      ],
      capability_count: CAPABILITIES.length,
    },
    capabilities: CAPABILITIES,
  };
}

export function catalogueJson(): string {
  return canonicalFile(buildCatalogue());
}

export function renderMarkdown(): string {
  const cat = buildCatalogue();
  const byState: Record<string, number> = {};
  const byCrit: Record<string, number> = {};
  for (const c of cat.capabilities) { byState[c.state] = (byState[c.state] ?? 0) + 1; byCrit[c.criticality] = (byCrit[c.criticality] ?? 0) + 1; }
  const rows = cat.capabilities.map((c) => `| ${c.id} | ${c.name} | ${c.criticality} | ${c.state} | ${c.required_for} | ${c.host_facet_dependency} |`);
  const details = cat.capabilities.map((c) => [
    `### ${c.id} — ${c.name}`,
    '', c.description, '',
    `- **Criticality:** ${c.criticality} · **State:** ${c.state} · **Required for:** ${c.required_for} · **Host facet:** ${c.host_facet_dependency}`,
    `- **Safe degradation permitted:** ${c.safe_degradation} · **Blocks certification:** ${c.blocks_certification}`,
    `- **Failure behavior:** ${c.failure_behavior}`,
    `- **Certification requirement:** ${c.certification_requirement}`,
    `- **Platform/version sensitivity:** ${c.platform_version_sensitivity}`,
    c.limitations.length ? `- **Known limitations:** ${c.limitations.join(' ')}` : '- **Known limitations:** none recorded',
    `- **Evidence:** ${c.evidence_refs.map((e) => `${e.source}#${e.ref} (${e.phase}, ${e.status})`).join('; ')}`,
    '',
  ].join('\n'));

  return [
    '# dkskill Capability Catalogue (M0)',
    '',
    '**STATUS: M0 DESIGN COMPLETE / NOT YET IMPLEMENTED IN RUNTIME**',
    '',
    'M0 defines the capability *vocabulary* only. It creates no runtime consumers and certifies no version or platform.',
    '',
    '- M1 compatibility registry — **not implemented**',
    '- M2 attribution equivalence — **not implemented**',
    '- M3 Host Compatibility Layer (HCL) — **not implemented**',
    '- M4 certification harness — **not implemented**',
    '- M5 additional profile certification — **not implemented**',
    '- M6 benchmark/product separation — **not implemented**',
    '- **No new version or platform is certified by M0.**',
    '',
    '## Frozen Phase 4 state (unchanged by M0)',
    '',
    '- Benchmark Claude Code version: **2.1.283**; pinned SHA-256 `9DBE16…DE3A`.',
    "- `ATTR_VALID_FOR`: `['2.1.283']`. TS-07: **UNRESOLVED**. Run A: **BLOCKED/UNAUTHORIZED**. 2.1.284: **UNVALIDATED**. `/runtime/`: **absent**.",
    '',
    '## Capability states (canonical semantics)',
    '',
    ...Object.entries(cat.metadata.state_semantics as Record<string, string>).map(([k, v]) => `- **${k}:** ${v}`),
    '',
    '### Distinctions',
    ...Object.entries(cat.metadata.distinctions as Record<string, string>).map(([k, v]) => `- **${k.replace(/_/g, ' ')}:** ${v}`),
    '',
    '## Safety semantics',
    '',
    `${cat.metadata.safety_semantics as string}`,
    '',
    '## Version independence',
    '',
    `${cat.metadata.version_independence as string}`,
    '',
    '## Dependency model (specification only)',
    '',
    `${cat.metadata.dependency_model as string}`,
    '',
    '## Counts',
    '',
    `- **Capabilities:** ${cat.capabilities.length}`,
    `- **By state:** ${Object.entries(byState).sort().map(([k, n]) => `${k}=${n}`).join(', ')}`,
    `- **By criticality:** ${Object.entries(byCrit).sort().map(([k, n]) => `${k}=${n}`).join(', ')}`,
    '',
    '## Capability summary',
    '',
    '| ID | Name | Criticality | State | Required for | Host facet |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    '## Capability details',
    '',
    ...details,
  ].join('\n') + '\n';
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'capability-catalogue.json'), catalogueJson());
  writeFileSync(join(OUT, 'CAPABILITY-CATALOGUE.md'), renderMarkdown());
  console.log(`M0 capability catalogue: ${CAPABILITIES.length} capabilities written to bench/compatibility/`);
}

// Only write when run directly (so importing this module in tests has no side effects).
if (process.argv[1]?.endsWith('gen-capability-catalogue.ts')) main();
