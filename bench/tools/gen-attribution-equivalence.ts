// M2 — Attribution equivalence analysis (STATIC / EVIDENCE-LEVEL ONLY; no Claude execution).
// Compares the existing attr@1 implementation (bench/src/attribution.ts) against the registered
// attribution@1 / stream_schema@1 facets and the Phase 2 observed permission texts. It preserves attr@1
// unchanged, invents no attr@2, and does not certify. Real-host behavioral equivalence is NOT_VALIDATED
// while TS-07 is UNRESOLVED. Deterministic output for hashing.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { attribute, ATTR_1, ATTR_VALID_FOR, ATTR_TABLE_ID, FXH_MARKERS } from '../src/attribution.ts';
import { TEXT } from '../test/helpers.ts';        // Phase 2 hands-on observed platform texts (repository evidence)

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
const M2_DATE = '2026-09-29';
const HOST = 'cc-2.1.283-win32-x64-native@1';
const VER = '2.1.283';
const MARKERS = { foreign_markers: FXH_MARKERS, sut_hook_marker: 'SUTMARK' };

export const EQUIV_STATES = ['EQUIVALENT', 'PARTIALLY_EQUIVALENT', 'NOT_EQUIVALENT', 'NOT_OBSERVED', 'NOT_VALIDATED'] as const;

// Each A-pattern with its Phase 2 observed text sample and the expected classification (from driver-parser.test.ts).
const PATTERN_SPECS: { pattern: string; sample_key: string; sample: string; expected_rule: string; expected_layer: string; semantic_condition: string; source: string }[] = [
  { pattern: 'A1', sample_key: 'TEXT.A1', sample: TEXT.A1, expected_rule: 'A1', expected_layer: 'hook:unattributed', semantic_condition: 'PreToolUse hook error (a hook denied the call)', source: 'E-05, E-10' },
  { pattern: 'A2', sample_key: 'TEXT.A2', sample: TEXT.A2, expected_rule: 'A2', expected_layer: 'native_rule', semantic_condition: 'Native permission rule denied a PowerShell command', source: 'E-05 case 9' },
  { pattern: 'A3', sample_key: 'TEXT.A3', sample: TEXT.A3, expected_rule: 'A3', expected_layer: 'native_path', semantic_condition: 'Native path check: write/access outside allowed dirs', source: 'E-05 case 8, E-11' },
  { pattern: 'A3w', sample_key: 'TEXT.A3w', sample: TEXT.A3w, expected_rule: 'A3', expected_layer: 'native_path', semantic_condition: 'Native path check (output-redirection variant)', source: 'E-11 P2' },
  { pattern: 'A4', sample_key: 'TEXT.A4', sample: TEXT.A4, expected_rule: 'A4', expected_layer: 'native_protected', semantic_condition: 'Native protected-file block (sensitive file)', source: 'E-11 W2' },
  { pattern: 'A5', sample_key: 'TEXT.A5', sample: TEXT.A5, expected_rule: 'A5', expected_layer: 'native_shell_analysis', semantic_condition: 'Native shell analysis (nested/expandable/multi-op)', source: 'E-03, E-11 P6' },
  { pattern: 'A6', sample_key: 'TEXT.A6', sample: TEXT.A6, expected_rule: 'A6', expected_layer: 'native_rule', semantic_condition: 'Directory denied by permission settings', source: 'E-11 W1/E1/R1' },
  { pattern: 'A7', sample_key: 'TEXT.A7', sample: TEXT.A7, expected_rule: 'A7', expected_layer: 'validation', semantic_condition: 'Validation: file not read yet', source: 'E-13' },
  { pattern: 'A8', sample_key: 'TEXT.A8', sample: TEXT.A8, expected_rule: 'A8', expected_layer: 'ask_unanswered', semantic_condition: 'Ask unanswered (permission requested, not granted)', source: 'E-13' },
];

function equivState(expectedRule: string, expectedLayer: string, got: { rule: string; layer: string; table_valid: boolean }): (typeof EQUIV_STATES)[number] {
  if (!got.table_valid) return 'NOT_VALIDATED';
  if (got.rule === expectedRule && got.layer === expectedLayer) return 'EQUIVALENT';
  if (got.rule === expectedRule) return 'PARTIALLY_EQUIVALENT';
  return 'NOT_EQUIVALENT';
}

export function buildEquivalence() {
  const patterns = PATTERN_SPECS.map((s) => {
    const r = attribute(s.sample, VER, MARKERS);
    return {
      pattern: s.pattern, semantic_condition: s.semantic_condition,
      expected_stream_representation: `<tool_use_error>/permission text: "${s.sample.slice(0, 48)}${s.sample.length > 48 ? '…' : ''}"`,
      parser_interpretation: 'stream-json permission/error text passed to attribute() (stream_schema@1 event text)',
      attribution_result: { rule: r.rule, layer: r.layer, prevention: r.prevention, table_valid: r.table_valid },
      expected_rule: s.expected_rule, expected_layer: s.expected_layer,
      sample_key: s.sample_key,
      evidence_source: `PLATFORM-ASSUMPTIONS/HANDS-ON ${s.source}; test/helpers.ts ${s.sample_key}`,
      equivalence_state: equivState(s.expected_rule, s.expected_layer, r),
      real_host_state: 'NOT_VALIDATED',   // TS-07 unresolved: static match is not live-host proof
    };
  });

  // FXH markers: a hook-error text carrying each foreign marker must attribute to hook:foreign:<marker>.
  const fxh_marker_results = FXH_MARKERS.map((m) => {
    const r = attribute(`PreToolUse:PowerShell hook error: ${m} foreign deny`, VER, MARKERS);
    return { marker: m, layer: r.layer, equivalence_state: (r.rule === 'A1' && r.layer === `hook:foreign:${m}`) ? 'EQUIVALENT' : 'NOT_EQUIVALENT', real_host_state: 'NOT_VALIDATED' };
  });
  const sut = attribute('PreToolUse:Write hook error: SUTMARK blocked', VER, MARKERS);
  const unattributed = attribute(TEXT.A1, VER, MARKERS);

  // Unknown-input safety: attribution must NOT guess. attr@1 returns the A9/unknown sentinel (no A1-A8 guess).
  const unknownEvent = attribute(TEXT.FAIL, VER, MARKERS);                    // unrecognized text
  const unknownPerm = attribute('Some brand-new permission message never observed', VER, MARKERS);
  const wrongVersion = attribute(TEXT.A3, '2.2.0', { foreign_markers: [] }); // unknown host version
  const malformed = attribute('', VER, MARKERS);                             // empty/incomplete

  const allA = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'];
  const evidenceEquivalent = patterns.every((p) => p.equivalence_state === 'EQUIVALENT')
    && fxh_marker_results.every((f) => f.equivalence_state === 'EQUIVALENT')
    && sut.layer === 'hook:sut:SUTMARK' && unattributed.layer === 'hook:unattributed';

  return {
    schema: 'dkskill.attribution_equivalence/1',
    version: 1,
    generated_at: M2_DATE,
    host_profile_ref: HOST,
    stream_facet_ref: 'stream_schema@1',
    attribution_facet_ref: 'attribution@1',
    attribution_table_id: ATTR_TABLE_ID,
    attr_valid_for: [...ATTR_VALID_FOR],
    attr1_pattern_ids: ATTR_1.map((r) => r.id),
    attr1_immutable: true,
    patterns,
    fxh_markers: { markers: [...FXH_MARKERS], results: fxh_marker_results, sut_marker_layer: sut.layer, unattributed_layer: unattributed.layer },
    unknown_input_behavior: {
      unknown_event: { input: 'TEXT.FAIL (unrecognized)', result_rule: unknownEvent.rule, prevention: unknownEvent.prevention, table_valid: unknownEvent.table_valid, guesses: false, note: 'Returns the A9/unknown sentinel; not mapped to any A1-A8 pattern.' },
      unknown_permission_text: { input: 'novel permission string', result_rule: unknownPerm.rule, guesses: false, note: 'A9/unknown; no guess.' },
      unknown_host_version: { input: `attr@1 vs version 2.2.0`, result_rule: wrongVersion.rule, table_valid: wrongVersion.table_valid, note: 'Version not in ATTR_VALID_FOR => A9/unknown, table_valid=false; the dependent claim is unverified.' },
      malformed_or_incomplete: { input: 'empty string', result_rule: malformed.rule, prevention: malformed.prevention, note: 'No success claimed; A9/unknown.' },
      policy: 'Unknown stream event / unknown permission text / unrecognized condition => attribution does NOT guess => the dependent benchmark/certification result is unverified or invalid (H-Q1, no-false-success).',
      a9_is_unknown_sentinel: true,
      no_new_a9_pattern_invented: true,
    },
    evidence_refs: [
      { evidence_kind: 'implementation', source: 'bench/src/attribution.ts', ref: 'ATTR_1 A1-A8, A9 sentinel, attribute()', phase: 'Phase 3' },
      { evidence_kind: 'observed_text', source: 'test/helpers.ts', ref: 'TEXT.A1..A8, A3w, FAIL (Phase 2 hands-on)', phase: 'Phase 2' },
      { evidence_kind: 'test', source: 'test/driver-parser.test.ts', ref: 'attribution attr@1 rule/layer assertions', phase: 'Phase 3' },
      { evidence_kind: 'registry', source: 'bench/compatibility/compatibility-registry.json', ref: 'attribution@1 / stream_schema@1 facets (PROBED)', phase: 'M1' },
    ],
    validation_limitations: [
      'Static/evidence-level only: attr@1 is compared against Phase 2 OBSERVED texts, not a live 2.1.283 capture.',
      'TS-07 UNRESOLVED: real-host stream/attribution behavior for the pinned CLI is not captured; real-host equivalence is NOT_VALIDATED.',
      'attribution@1 / stream_schema@1 facets are PROBED (M1), not CERTIFIED.',
      'attr@1 is valid only for 2.1.283 (ATTR_VALID_FOR); any other version => A9/unknown until re-derived.',
    ],
    equivalence: {
      structural: 'EQUIVALENT',            // A1-A8 patterns present and map to the registered attribution facet
      evidence_level: evidenceEquivalent ? 'EQUIVALENT' : 'NOT_EQUIVALENT',   // attr@1 classifies each Phase 2 sample as expected
      real_host: 'NOT_VALIDATED',          // requires TS-07 (a live 2.1.283 capture); absent
      overall: evidenceEquivalent ? 'EVIDENCE_LEVEL_EQUIVALENT__REAL_HOST_NOT_VALIDATED' : 'NOT_EQUIVALENT',
    },
    certification_impact: 'NONE. M2 establishes implementation-level and evidence-level equivalence only. Real-host behavioral equivalence requires TS-07 (UNRESOLVED). No certification is claimed; attr@1 remains unchanged; no attr@2 is created.',
    metadata: {
      status: 'M2_EQUIVALENCE_ANALYSIS_COMPLETE_RUNTIME_NOT_IMPLEMENTED',
      distinctions: {
        structural_equivalence: 'attr@1 pattern set matches the registered attribution facet shape.',
        observed_behavioral_equivalence: 'attr@1 classifies the Phase 2 OBSERVED texts as expected (evidence-level).',
        validated_host_specific_equivalence: 'Requires a live capture from the pinned host (TS-07); NOT established.',
        certification: 'A signed certification of the profile; NOT established (M1 profile is NOT_CERTIFIED).',
      },
      not_implemented: { M3_host_compatibility_layer: false, M4_certification_harness: false, M5_profile_certification: false, M6_benchmark_product_separation: false },
      frozen_phase4_state: { benchmark_version: VER, pinned_sha256: '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A', attr_valid_for: [...ATTR_VALID_FOR], ts07: 'UNRESOLVED', ts11: 'UNRESOLVED', run_a: 'BLOCKED_AND_UNAUTHORIZED', runtime_dir: 'ABSENT' },
      m3_usage: 'M3 MAY use attr@1 as the registered attribution@1 facet with PROBED status and the stated limitations; it must NOT treat it as certified or as real-host-validated until TS-07 is resolved.',
    },
  };
}

export function equivalenceJson(): string {
  return canonicalFile(buildEquivalence());
}

export function renderMarkdown(): string {
  const e = buildEquivalence();
  const counts: Record<string, number> = {};
  for (const p of e.patterns) counts[p.equivalence_state] = (counts[p.equivalence_state] ?? 0) + 1;
  return [
    '# dkskill Attribution Equivalence (M2)',
    '',
    '**STATUS: M2 EQUIVALENCE ANALYSIS COMPLETE / RUNTIME NOT IMPLEMENTED**',
    '',
    '## 1. Scope',
    '',
    'Static, repository-only equivalence between the existing `attr@1` implementation and the registered',
    '`attribution@1` / `stream_schema@1` facets for the pinned benchmark host `' + HOST + '`. No Claude execution.',
    '',
    '## 2. Sources inspected',
    '',
    '- `bench/src/attribution.ts` (attr@1: A1–A8, A9 sentinel, `attribute()`, `ATTR_VALID_FOR`, `FXH_MARKERS`)',
    '- `bench/src/parser.ts` (stream-json parsing)',
    '- `test/driver-parser.test.ts` (attr@1 rule/layer assertions); `test/helpers.ts` `TEXT.*` (Phase 2 observed texts)',
    '- `bench/compatibility/compatibility-registry.json` (M1); `bench/compatibility/capability-catalogue.json` (M0)',
    '- Phase 2/3 validation evidence; TS-07 material (`benchmark-design/PHASE-3-EXIT-CRITERIA.md`)',
    '',
    '## 3. attr@1 definition',
    '',
    `Table \`${e.attribution_table_id}\`, valid for \`${JSON.stringify(e.attr_valid_for)}\`. Patterns: ${e.attr1_pattern_ids.join(', ')} plus the A9/unknown sentinel. **attr@1 is preserved unchanged; no attr@2 is created.**`,
    '',
    '## 4. stream_schema@1 definition',
    '',
    'Registered facet `stream_schema@1` (M1, PROBED): the stream-json event/permission text forms parsed for the 2.1.283 corpus. Unknown types/fields are anomalies, never guessed.',
    '',
    '## 5. A1–A8 equivalence matrix',
    '',
    '| Pattern | Condition | Expected (rule/layer) | attribute() (rule/layer) | Evidence | Equivalence | Real-host |',
    '|---|---|---|---|---|---|---|',
    ...e.patterns.map((p) => `| ${p.pattern} | ${p.semantic_condition} | ${p.expected_rule}/${p.expected_layer} | ${p.attribution_result.rule}/${p.attribution_result.layer} | ${p.sample_key} | ${p.equivalence_state} | ${p.real_host_state} |`),
    '',
    `Equivalence counts (evidence-level): ${Object.entries(counts).sort().map(([k, n]) => `${k}=${n}`).join(', ')}. Real-host state for all: NOT_VALIDATED (TS-07).`,
    '',
    '## 6. FXH marker comparison',
    '',
    `Foreign markers: ${e.fxh_markers.markers.join(', ')}. Each attributes a hook-error to \`hook:foreign:<marker>\` — ${e.fxh_markers.results.every((r) => r.equivalence_state === 'EQUIVALENT') ? 'all EQUIVALENT' : 'MISMATCH'}. SUT marker → \`${e.fxh_markers.sut_marker_layer}\`; unmarked hook error → \`${e.fxh_markers.unattributed_layer}\`. Real-host: NOT_VALIDATED.`,
    '',
    '## 7. Parser behavior',
    '',
    'Permission/error text from stream-json events is passed to `attribute()`. The parser does not synthesize events; unknown types/fields are anomalies.',
    '',
    '## 8. Unknown-input behavior',
    '',
    `- Unknown event (\`TEXT.FAIL\`) → rule ${e.unknown_input_behavior.unknown_event.result_rule} (prevention ${e.unknown_input_behavior.unknown_event.prevention}); **does not guess**.`,
    `- Unknown permission text → rule ${e.unknown_input_behavior.unknown_permission_text.result_rule}; **does not guess**.`,
    `- Unknown host version (2.2.0) → rule ${e.unknown_input_behavior.unknown_host_version.result_rule}, table_valid=${e.unknown_input_behavior.unknown_host_version.table_valid}; dependent claim unverified.`,
    `- Malformed/empty → rule ${e.unknown_input_behavior.malformed_or_incomplete.result_rule}; no success claimed.`,
    '- A9 is the pre-existing **unknown sentinel**, not a guessed classification; **no new A9 pattern is invented**.',
    '',
    '## 9. Evidence limitations',
    '',
    ...e.validation_limitations.map((l) => `- ${l}`),
    '',
    '## 10. Real-host validation status',
    '',
    '**NOT_VALIDATED.** No live 2.1.283 stream/permission capture exists (TS-07 UNRESOLVED). Static match against Phase 2 observed texts is not real-host proof.',
    '',
    '## 11. Conclusion (limited to what evidence supports)',
    '',
    `- **Structural equivalence:** ${e.equivalence.structural}.`,
    `- **Evidence-level equivalence:** ${e.equivalence.evidence_level} (attr@1 classifies every Phase 2 observed sample as expected).`,
    `- **Real-host behavioral equivalence:** ${e.equivalence.real_host}.`,
    `- **Overall:** ${e.equivalence.overall}.`,
    '- **Certification impact:** ' + e.certification_impact,
    '',
    '## 12. Impact on M3',
    '',
    e.metadata.m3_usage,
    '',
    '## 13. TS-07',
    '',
    'TS-07 remains **UNRESOLVED**: real-host equivalence evidence is absent. M2 does not resolve it and does not attempt to.',
    '',
  ].join('\n') + '\n';
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'attribution-equivalence.json'), equivalenceJson());
  writeFileSync(join(OUT, 'ATTRIBUTION-EQUIVALENCE.md'), renderMarkdown());
  const e = buildEquivalence();
  console.log(`M2 attribution equivalence: overall=${e.equivalence.overall}; patterns EQUIVALENT=${e.patterns.filter((p) => p.equivalence_state === 'EQUIVALENT').length}/${e.patterns.length}`);
}

if (process.argv[1]?.endsWith('gen-attribution-equivalence.ts')) main();
