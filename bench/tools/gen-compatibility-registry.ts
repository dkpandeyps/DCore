// M1 — dkskill Compatibility Registry generator (DESIGN + DATA CONTRACT ONLY; no runtime consumers).
// Single source of truth for bench/compatibility/compatibility-registry.json and COMPATIBILITY-REGISTRY.md.
// It LOADS the frozen M0 catalogue (buildCatalogue) and references capability IDs by reference (never copies
// definitions). It certifies no host/version/platform, changes no Phase 4 state, and creates no /runtime/.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile, canonicalJson, sha256 } from '../src/canonical.ts';
import { buildCatalogue } from './gen-capability-catalogue.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
const M1_DESIGN_DATE = '2026-09-29';                       // deterministic source metadata (not a wall clock)

// Validation lifecycle + certification + revocation vocabularies (spec only; M1 executes none of it).
export const VALIDATION_STATES = ['NOT_VALIDATED', 'PROBED', 'REGRESSION', 'CERTIFICATION_REVIEW', 'CERTIFIED', 'FAILED', 'BLOCKED', 'REVOKED'] as const;
export const CERTIFICATION_STATES = ['NOT_CERTIFIED', 'CERTIFIED', 'REVOKED'] as const;
export const LIFECYCLE_STATES = ['active', 'superseded', 'revoked'] as const;
export const CAPABILITY_STATES = ['VERIFIED', 'PARTIALLY_VERIFIED', 'NOT_YET_VALIDATED', 'NOT_AVAILABLE', 'DEGRADED_AT_RUNTIME'] as const;
export const FACET_FAMILIES = ['hook_protocol', 'stream_schema', 'attribution', 'settings_layout', 'permission_modes'] as const;

const M0 = buildCatalogue();
const M0_CAPS = M0.capabilities;
const M0_IDS = new Set(M0_CAPS.map((c) => c.id));

export function isSafetyCritical(cap: { criticality: string; required_for: string }): boolean {
  return cap.criticality === 'CRITICAL' && cap.required_for === 'core_safety_enforcement';
}
// A profile may only be CERTIFIED if every safety-critical capability is VERIFIED for that profile.
const BLOCKING_FOR_CERT = new Set(['UNVERIFIED', 'PARTIALLY_VERIFIED', 'NOT_YET_VALIDATED', 'NOT_AVAILABLE', 'DEGRADED_AT_RUNTIME']);
export function canCertify(capRefs: Record<string, string>): boolean {
  for (const cap of M0_CAPS) {
    if (isSafetyCritical(cap) && BLOCKING_FOR_CERT.has(capRefs[cap.id])) return false;
  }
  return true;
}

// capability_refs for the 2.1.283 identity = the M0 states (Phase 2 hands-on evidence for that identity).
function refs283(): Record<string, string> {
  const o: Record<string, string> = {};
  for (const c of M0_CAPS) o[c.id] = c.state;
  return o;
}
// Any unvalidated host: every capability NOT_YET_VALIDATED (no silent inheritance from another version).
function refsUnvalidated(): Record<string, string> {
  const o: Record<string, string> = {};
  for (const c of M0_CAPS) o[c.id] = 'NOT_YET_VALIDATED';
  return o;
}

export interface Facet { facet_id: string; family: string; validation_status: string; sha256: string | null; evidence_refs: unknown[]; note: string }
const FACETS: Record<string, Facet> = {
  'hook_protocol@1': { facet_id: 'hook_protocol@1', family: 'hook_protocol', validation_status: 'PROBED', sha256: null, evidence_refs: [{ source: 'PLATFORM-ASSUMPTIONS.md', ref: 'V-01,V-03,V-09,V-16,V-20,V-21', phase: 'Phase 2' }], note: 'Hook wire protocol as observed for 2.1.283 (hands-on). Not certified.' },
  'stream_schema@1': { facet_id: 'stream_schema@1', family: 'stream_schema', validation_status: 'PROBED', sha256: null, evidence_refs: [{ source: 'bench/src/parser.ts', ref: 'parseTranscript', phase: 'Phase 3' }, { source: 'platform-validation/HANDS-ON-VALIDATION-REPORT.md', ref: 'E-03', phase: 'Phase 2' }], note: 'stream-json schema parsed for the 2.1.283 corpus only. Unknown types/fields are anomalies, never guessed.' },
  'attribution@1': { facet_id: 'attribution@1', family: 'attribution', validation_status: 'PROBED', sha256: null, evidence_refs: [{ source: 'bench/src/attribution.ts', ref: "attr@1, ATTR_VALID_FOR ['2.1.283']", phase: 'Phase 3' }, { source: 'benchmark-design/PHASE-3-EXIT-CRITERIA.md', ref: 'TS-07', phase: 'Phase 4', status: 'UNRESOLVED' }], note: 'attr@1 valid ONLY for 2.1.283; TS-07 unresolved. No attr@2 is invented.' },
  'settings_layout@1': { facet_id: 'settings_layout@1', family: 'settings_layout', validation_status: 'PROBED', sha256: null, evidence_refs: [{ source: 'PLATFORM-ASSUMPTIONS.md', ref: 'V-04,V-11,V-14,V-19', phase: 'Phase 2' }], note: 'Settings allow/deny/ask layout and precedence as observed for 2.1.283. Not certified.' },
  'permission_modes@1': { facet_id: 'permission_modes@1', family: 'permission_modes', validation_status: 'PROBED', sha256: null, evidence_refs: [{ source: 'PLATFORM-ASSUMPTIONS.md', ref: 'V-13', phase: 'Phase 2' }], note: 'Permission-mode ceiling; default `auto` on 2.1.283. Not certified.' },
};

export interface Profile {
  profile_id: string; product: string; version: string | null; platform: string; architecture: string; channel: string;
  binary_sha256: string | null;
  is_scope_placeholder: boolean;
  validation_status: string; certification_status: string; lifecycle_state: string;
  capability_refs: Record<string, string>;
  facet_refs: Record<string, string | null>;
  attribution_ref: string | null;
  limitations: string[];
  evidence_refs: unknown[];
  certification: { certified: boolean; authority: string | null; certified_at: string | null; certification_review_ref: string | null };
  supersedes: string | null; superseded_by: string | null;
  revoked: boolean; revocation: null | { reason: string; at: string; authority: string };
  signing_authority: string; signature_status: string; signature_reference: string | null;
  previous_record_hash: string | null;
  record_hash?: string;
}

function withHash(p: Omit<Profile, 'record_hash'>): Profile {
  return { ...p, record_hash: sha256(canonicalJson(p)) };
}

const PROFILES: Profile[] = [
  withHash({
    profile_id: 'cc-2.1.283-win32-x64-native@1',
    product: 'claude-code', version: '2.1.283', platform: 'win32', architecture: 'x64', channel: 'native',
    binary_sha256: '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A',
    is_scope_placeholder: false,
    validation_status: 'PROBED', certification_status: 'NOT_CERTIFIED', lifecycle_state: 'active',
    capability_refs: refs283(),
    facet_refs: { hook_protocol: 'hook_protocol@1', stream_schema: 'stream_schema@1', attribution: 'attribution@1', settings_layout: 'settings_layout@1', permission_modes: 'permission_modes@1' },
    attribution_ref: 'attribution@1',
    limitations: [
      'TS-07 UNRESOLVED: stream/attr@1 not re-validated as a certification; attr@1 valid only for this version.',
      'Several safety-relevant capabilities are PARTIALLY_VERIFIED (e.g., MCP matching non-stdio, U-01); a safety-critical capability is not fully VERIFIED, so this profile MUST NOT be CERTIFIED (H-Q1).',
      'Phase 2 evidence is historical observation on this identity, not a certification.',
    ],
    evidence_refs: [
      { evidence_kind: 'hands_on', source: 'platform-validation/HANDS-ON-VALIDATION-REPORT.md', ref: 'E-00..E-17', source_hash: null, validation_phase: 'Phase 2', host: 'claude-code/2.1.283/win32/x64/native', authority: 'PTPL (observed)', status: 'OBSERVED' },
      { evidence_kind: 'assumptions', source: 'PLATFORM-ASSUMPTIONS.md', ref: 'V-01..V-22', source_hash: null, validation_phase: 'Phase 2', host: 'claude-code/2.1.283/win32/x64/native', authority: 'PTPL (observed)', status: 'OBSERVED' },
    ],
    certification: { certified: false, authority: null, certified_at: null, certification_review_ref: null },
    supersedes: null, superseded_by: null, revoked: false, revocation: null,
    signing_authority: 'PTPL/dkskill owner authority (designated)', signature_status: 'UNSIGNED_DESIGN', signature_reference: null,
    previous_record_hash: null,
  }),
  withHash({
    profile_id: 'cc-2.1.284-win32-x64-native@1',
    product: 'claude-code', version: '2.1.284', platform: 'win32', architecture: 'x64', channel: 'native',
    binary_sha256: null,                                   // observed locally but no recorded/validated hash
    is_scope_placeholder: false,
    validation_status: 'NOT_VALIDATED', certification_status: 'NOT_CERTIFIED', lifecycle_state: 'active',
    capability_refs: refsUnvalidated(),                    // NO inheritance from 2.1.283
    facet_refs: { hook_protocol: null, stream_schema: null, attribution: null, settings_layout: null, permission_modes: null },
    attribution_ref: null,
    limitations: ['Observed locally but not validated; no capability, facet or attribution evidence. Does not inherit 2.1.283 compatibility.'],
    evidence_refs: [{ evidence_kind: 'negative_test', source: 'bench/test/scoring.test.ts', ref: 'VG-01 negative (version mismatch)', source_hash: null, validation_phase: 'Phase 4', host: 'claude-code/2.1.284/win32', authority: 'PTPL', status: 'UNVALIDATED' }],
    certification: { certified: false, authority: null, certified_at: null, certification_review_ref: null },
    supersedes: null, superseded_by: null, revoked: false, revocation: null,
    signing_authority: 'PTPL/dkskill owner authority (designated)', signature_status: 'UNSIGNED_DESIGN', signature_reference: null,
    previous_record_hash: null,
  }),
  withHash({
    profile_id: 'scope-darwin-unvalidated@0',
    product: 'claude-code', version: null, platform: 'darwin', architecture: 'UNSPECIFIED', channel: 'UNSPECIFIED',
    binary_sha256: null, is_scope_placeholder: true,
    validation_status: 'NOT_VALIDATED', certification_status: 'NOT_CERTIFIED', lifecycle_state: 'active',
    capability_refs: refsUnvalidated(), facet_refs: { hook_protocol: null, stream_schema: null, attribution: null, settings_layout: null, permission_modes: null },
    attribution_ref: null,
    limitations: ['macOS is in certification scope (H-Q3) but no host is validated or certified; no repository evidence. Scope placeholder only.'],
    evidence_refs: [],
    certification: { certified: false, authority: null, certified_at: null, certification_review_ref: null },
    supersedes: null, superseded_by: null, revoked: false, revocation: null,
    signing_authority: 'PTPL/dkskill owner authority (designated)', signature_status: 'UNSIGNED_DESIGN', signature_reference: null,
    previous_record_hash: null,
  }),
  withHash({
    profile_id: 'scope-linux-unvalidated@0',
    product: 'claude-code', version: null, platform: 'linux', architecture: 'UNSPECIFIED', channel: 'UNSPECIFIED',
    binary_sha256: null, is_scope_placeholder: true,
    validation_status: 'NOT_VALIDATED', certification_status: 'NOT_CERTIFIED', lifecycle_state: 'active',
    capability_refs: refsUnvalidated(), facet_refs: { hook_protocol: null, stream_schema: null, attribution: null, settings_layout: null, permission_modes: null },
    attribution_ref: null,
    limitations: ['Linux is in certification scope (H-Q3) but no host is validated or certified; no repository evidence. Scope placeholder only.'],
    evidence_refs: [],
    certification: { certified: false, authority: null, certified_at: null, certification_review_ref: null },
    supersedes: null, superseded_by: null, revoked: false, revocation: null,
    signing_authority: 'PTPL/dkskill owner authority (designated)', signature_status: 'UNSIGNED_DESIGN', signature_reference: null,
    previous_record_hash: null,
  }),
];

export interface Registry { schema: 'dkskill.compat_registry/1'; registry_version: number; generated_at: string; metadata: Record<string, unknown>; facets: Record<string, Facet>; profiles: Profile[]; integrity: Record<string, unknown> }

export function buildRegistry(): Registry {
  return {
    schema: 'dkskill.compat_registry/1',
    registry_version: 1,
    generated_at: M1_DESIGN_DATE,
    metadata: {
      title: 'dkskill Compatibility Registry (M1)',
      status: 'M1_DESIGN_COMPLETE_NOT_USED_BY_RUNTIME',
      purpose: 'Canonical, immutable data contract mapping an exact Claude Code host identity to a compatibility profile, facets, capability states, attribution reference, evidence, and validation/certification/revocation metadata. Design/data only; no runtime consumers.',
      capability_catalogue_ref: { file: 'bench/compatibility/capability-catalogue.json', schema: M0.schema, capability_count: M0_CAPS.length },
      vocabularies: {
        validation_states: [...VALIDATION_STATES],
        certification_states: [...CERTIFICATION_STATES],
        lifecycle_states: [...LIFECYCLE_STATES],
        capability_states: [...CAPABILITY_STATES],
        facet_families: [...FACET_FAMILIES],
      },
      distinctions: {
        capability_exists: 'The capability exists in Claude Code somewhere.',
        capability_has_evidence: 'Recorded evidence exists (Phase 2/3).',
        capability_validated_on_host: 'The capability state is recorded for a specific host profile (capability_refs).',
        profile_passed_validation: 'validation_status reached a passing lifecycle state for the profile.',
        profile_certified_for_enforcement: 'certification_status === CERTIFIED with signed certification metadata (H-Q4/H-Q6). No profile is certified in M1.',
      },
      safety_rule: 'UNVERIFIED != UNSUPPORTED. BUT an UNVERIFIED safety-critical capability => dkskill MUST NOT claim certified enforcement (H-Q1). A CERTIFIED profile MUST NOT contain an unresolved safety-critical capability (safety-critical = CRITICAL criticality AND required_for core_safety_enforcement, per the M0 catalogue).',
      resolution_rules: 'host identity -> EXACT registry profile -> facets -> capability states -> validation/certification state. No nearest-version, no semver inheritance, no "latest", no silent fallback. No exact valid profile => UNVERIFIED (enforcement refused; diagnostics may still explain the detected host).',
      unknown_profile: 'No exact profile => host is UNVERIFIED => enforcement refused; diagnostics may explain the detected host.',
      unknown_facet: 'Unknown/unvalidated facet => dependent behavior cannot claim certification; no guessing, no silent fallback.',
      unknown_stream_or_attribution: 'Unknown stream event/field/permission text => attribution must not guess => the dependent benchmark/certification result is invalid or unverified.',
      no_silent_compatibility: 'A new Claude Code version does NOT inherit compatibility because it is believed to behave like an older version. Compatibility must be explicitly validated.',
      registry_lifecycle: ['NEW_RELEASE_SEEN', 'UNVERIFIED', 'PROBING', 'REGRESSION', 'BEHAVIORAL_DIFF', 'CERTIFICATION_REVIEW', 'CERTIFIED', 'PUBLISHED', '(terminal/intermediate) FAILED', 'BLOCKED', 'REVOKED'],
      revocation_rule: 'A revoked profile MUST NOT silently fall back to an older profile. Revocation => that host identity is UNVERIFIED => enforcement refused until a new profile is certified.',
      owner_architecture: {
        'H-Q1': 'REFUSE enforcement on UNVERIFIED hosts.',
        'H-Q2': 'Support latest 3 CERTIFIED versions initially; expandable only by explicit owner decision.',
        'H-Q3': 'Certification scope: Windows, macOS, Linux, with certified Claude Code channels explicit.',
        'H-Q4': 'Every certified host version/facet gets an immutable compatibility profile and attribution record; existing records are never mutated.',
        'H-Q5': 'Every approved benchmark binary preserved as an immutable artifact (product/version/platform/channel/SHA-256).',
        'H-Q6': 'Registry updates require signed updates by the designated PTPL/dkskill owner authority.',
        'H-Q7': 'Certification environments are separate from the Phase 4 benchmark environment.',
      },
      frozen_phase4_state: {
        benchmark_claude_code_version: '2.1.283', pinned_sha256: '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A',
        attr_valid_for: ['2.1.283'], ts07: 'UNRESOLVED', ts11: 'UNRESOLVED', run_a: 'BLOCKED_AND_UNAUTHORIZED', runtime_dir: 'ABSENT',
        note: 'M1 changes none of the above and certifies no host/version/platform.',
      },
      not_implemented: {
        M2_attribution_equivalence: false, M3_host_compatibility_layer: false, M4_certification_harness: false,
        M5_additional_profile_certification: false, M6_benchmark_product_separation: false,
      },
      pipeline: 'Capability Catalogue (M0) -> Compatibility Registry (M1) -> Host Compatibility Layer (M3, future) -> Runtime enforcement (future).',
    },
    facets: FACETS,
    profiles: PROFILES,
    integrity: {
      signing_authority: 'PTPL/dkskill owner authority (designated)',
      signature_status: 'UNSIGNED_DESIGN',
      signature_reference: null,
      note: 'Records are canonicalizable and hashable (per-profile record_hash present). Cryptographic signing is NOT implemented in M1; no signature is fabricated.',
      hash_algorithm: 'sha256 over canonical JSON of the record without record_hash',
    },
  };
}

export function registryJson(): string {
  return canonicalFile(buildRegistry());
}

export function renderMarkdown(): string {
  const r = buildRegistry();
  const byVal: Record<string, number> = {};
  const byCert: Record<string, number> = {};
  for (const p of r.profiles) { byVal[p.validation_status] = (byVal[p.validation_status] ?? 0) + 1; byCert[p.certification_status] = (byCert[p.certification_status] ?? 0) + 1; }
  const rows = r.profiles.map((p) => `| ${p.profile_id} | ${p.product} | ${p.version ?? '(none)'} | ${p.platform} | ${p.architecture} | ${p.channel} | ${p.validation_status} | ${p.certification_status} | ${p.lifecycle_state} |`);
  return [
    '# dkskill Compatibility Registry (M1)',
    '',
    '**STATUS: M1 DESIGN COMPLETE / NOT YET USED BY RUNTIME**',
    '',
    '- M0 capability catalogue is complete (frozen source of capability IDs).',
    '- M1 registry is **specification/data only**.',
    '- M2 attribution equivalence — **not implemented**.',
    '- M3 Host Compatibility Layer — **not implemented**.',
    '- M4 certification harness — **not implemented**.',
    '- M5 profile certification — **not implemented**.',
    '- M6 benchmark/product separation — **not implemented**.',
    '- **M1 certifies no current host/version/platform.**',
    '',
    '## Pipeline',
    '',
    '```',
    'Capability Catalogue (M0)',
    '        v',
    'Compatibility Registry (M1)',
    '        v',
    'Host Compatibility Layer (M3, future)',
    '        v',
    'Runtime enforcement (future)',
    '```',
    '',
    '## Frozen Phase 4 state (unchanged by M1)',
    '',
    "- Benchmark version **2.1.283**, pinned SHA-256 `9DBE16…DE3A`; `ATTR_VALID_FOR = ['2.1.283']`; TS-07/TS-11 **UNRESOLVED**; Run A **BLOCKED/UNAUTHORIZED**; `/runtime/` **absent**.",
    '',
    '## Safety rule (H-Q1)',
    '',
    `${r.metadata.safety_rule as string}`,
    '',
    '## Version resolution (no silent fallback)',
    '',
    `${r.metadata.resolution_rules as string}`,
    '',
    `- **Unknown profile:** ${r.metadata.unknown_profile as string}`,
    `- **Unknown facet:** ${r.metadata.unknown_facet as string}`,
    `- **Unknown stream/attribution:** ${r.metadata.unknown_stream_or_attribution as string}`,
    `- **No silent compatibility:** ${r.metadata.no_silent_compatibility as string}`,
    `- **Revocation:** ${r.metadata.revocation_rule as string}`,
    '',
    '## Registry lifecycle (specification only; not executed in M1)',
    '',
    `${(r.metadata.registry_lifecycle as string[]).join(' -> ')}`,
    '',
    '## Facets',
    '',
    '| Facet | Family | Validation | Note |',
    '|---|---|---|---|',
    ...Object.values(r.facets).map((f) => `| ${f.facet_id} | ${f.family} | ${f.validation_status} | ${f.note} |`),
    '',
    'A facet identity is immutable; a behavior change creates a NEW facet identity (never a silent mutation). No `attr@2` or other future facet is invented.',
    '',
    '## Counts',
    '',
    `- **Profiles:** ${r.profiles.length}`,
    `- **Facets:** ${Object.keys(r.facets).length}`,
    `- **Capability references per concrete profile:** ${M0_CAPS.length} (all resolve to M0)`,
    `- **By validation_status:** ${Object.entries(byVal).sort().map(([k, n]) => `${k}=${n}`).join(', ')}`,
    `- **By certification_status:** ${Object.entries(byCert).sort().map(([k, n]) => `${k}=${n}`).join(', ')}`,
    '',
    '## Profiles',
    '',
    '| profile_id | product | version | platform | arch | channel | validation | certification | lifecycle |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '- **2.1.283 / Windows:** historical Phase 2 evidence exists but TS-07 is UNRESOLVED and a safety-critical capability is not fully VERIFIED — therefore **NOT CERTIFIED**.',
    '- **2.1.284 / Windows:** observed locally, not validated — **NOT CERTIFIED**; does not inherit 2.1.283 compatibility.',
    '- **macOS / Linux:** in certification scope (H-Q3) but no repository evidence — **NOT_VALIDATED / NOT CERTIFIED** scope placeholders.',
    '',
    '## Integrity / signing',
    '',
    `- Signing authority: ${r.integrity.signing_authority as string}. Signature status: **${r.integrity.signature_status as string}** (no signature fabricated).`,
    `- ${r.integrity.note as string}`,
    '',
  ].join('\n') + '\n';
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'compatibility-registry.json'), registryJson());
  writeFileSync(join(OUT, 'COMPATIBILITY-REGISTRY.md'), renderMarkdown());
  console.log(`M1 compatibility registry: ${PROFILES.length} profiles, ${Object.keys(FACETS).length} facets, ${M0_CAPS.length} capability refs each -> bench/compatibility/`);
}

if (process.argv[1]?.endsWith('gen-compatibility-registry.ts')) main();
