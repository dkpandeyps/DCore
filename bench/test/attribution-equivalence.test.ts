import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildEquivalence, equivalenceJson, renderMarkdown, EQUIV_STATES } from '../tools/gen-attribution-equivalence.ts';
import { canonicalFile } from '../src/canonical.ts';
import { ATTR_1, ATTR_VALID_FOR, FXH_MARKERS } from '../src/attribution.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { buildCatalogue } from '../tools/gen-capability-catalogue.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const e = buildEquivalence();

test('1. schema and version are correct', () => {
  assert.equal(e.schema, 'dkskill.attribution_equivalence/1');
  assert.equal(e.version, 1);
});

test('2 & 3. A1-A8 all exist with no duplicate pattern IDs', () => {
  const ids = e.patterns.map((p) => p.pattern);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8']) assert.ok(ids.includes(a), a);
});

test('4. all pattern equivalence states are valid; evidence-level is EQUIVALENT; real-host is NOT_VALIDATED', () => {
  for (const p of e.patterns) {
    assert.ok((EQUIV_STATES as readonly string[]).includes(p.equivalence_state), p.pattern);
    assert.equal(p.equivalence_state, 'EQUIVALENT', p.pattern);
    assert.equal(p.real_host_state, 'NOT_VALIDATED', p.pattern);
  }
});

test('5. FXH markers are represented and attribute to hook:foreign:<marker>', () => {
  assert.deepEqual(e.fxh_markers.markers, [...FXH_MARKERS]);
  assert.equal(e.fxh_markers.results.length, FXH_MARKERS.length);
  for (const r of e.fxh_markers.results) assert.equal(r.equivalence_state, 'EQUIVALENT', r.marker);
  assert.equal(e.fxh_markers.sut_marker_layer, 'hook:sut:SUTMARK');
});

test('6 & 7. unknown event / unknown permission text do not silently classify (A9 sentinel, no guess)', () => {
  assert.equal(e.unknown_input_behavior.unknown_event.result_rule, 'A9');
  assert.equal(e.unknown_input_behavior.unknown_event.guesses, false);
  assert.equal(e.unknown_input_behavior.unknown_permission_text.result_rule, 'A9');
  assert.equal(e.unknown_input_behavior.unknown_permission_text.guesses, false);
  assert.equal(e.unknown_input_behavior.a9_is_unknown_sentinel, true);
});

test('8. malformed input and wrong version do not claim success', () => {
  assert.equal(e.unknown_input_behavior.malformed_or_incomplete.result_rule, 'A9');
  assert.equal(e.unknown_input_behavior.unknown_host_version.result_rule, 'A9');
  assert.equal(e.unknown_input_behavior.unknown_host_version.table_valid, false);
});

test('9 & 16. output is deterministic/canonical and equals the committed artifacts', () => {
  assert.equal(equivalenceJson(), canonicalFile(buildEquivalence()));
  assert.equal(readFileSync(join(DIR, 'attribution-equivalence.json'), 'utf8'), equivalenceJson());
  assert.equal(readFileSync(join(DIR, 'ATTRIBUTION-EQUIVALENCE.md'), 'utf8'), renderMarkdown());
});

test('10 & 11 & 12. attr@1 source is unchanged, ATTR_VALID_FOR is [2.1.283], and no attr@2 is invented', () => {
  assert.deepEqual(ATTR_1.map((r) => r.id), ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8']);   // A9 is the sentinel, not in ATTR_1
  assert.deepEqual([...ATTR_VALID_FOR], ['2.1.283']);
  assert.equal(e.attr1_immutable, true);
  assert.equal(e.attribution_table_id, 'attr@1');
  // No attr@2 is DEFINED as a table/facet id anywhere in the record (prose mentions are allowed).
  assert.equal(e.attribution_facet_ref, 'attribution@1');
  assert.ok(!/attr@2/.test(JSON.stringify(e.attr1_pattern_ids)) && !/attr@2/.test(String(e.attribution_table_id)));
  assert.equal(e.unknown_input_behavior.no_new_a9_pattern_invented, true);
});

test('13. the M1 registry remains structurally valid and references attribution@1', () => {
  const reg = buildRegistry();
  assert.equal(reg.schema, 'dkskill.compat_registry/1');
  const p283 = reg.profiles.find((p) => p.version === '2.1.283')!;
  assert.equal(p283.attribution_ref, 'attribution@1');
  assert.equal(e.attribution_facet_ref, 'attribution@1');
  assert.equal(e.stream_facet_ref, 'stream_schema@1');
  assert.equal(e.host_profile_ref, p283.profile_id);
});

test('14. the M0 catalogue is unchanged (schema + count)', () => {
  const cat = buildCatalogue();
  assert.equal(cat.schema, 'dkskill.capability_catalogue/1');
  assert.equal(cat.capabilities.length, 25);
});

test('15. no certification claim without real-host evidence; TS-07 recorded UNRESOLVED', () => {
  assert.match(e.certification_impact, /NONE/);
  assert.equal(e.equivalence.real_host, 'NOT_VALIDATED');
  assert.equal((e.metadata.frozen_phase4_state as any).ts07, 'UNRESOLVED');
  const s = JSON.stringify(e);
  assert.ok(!/"CERTIFIED"/.test(s), 'no CERTIFIED status asserted');
});

test('overall equivalence is evidence-level only, real-host not validated', () => {
  assert.equal(e.equivalence.structural, 'EQUIVALENT');
  assert.equal(e.equivalence.evidence_level, 'EQUIVALENT');
  assert.equal(e.equivalence.real_host, 'NOT_VALIDATED');
  assert.equal(e.equivalence.overall, 'EVIDENCE_LEVEL_EQUIVALENT__REAL_HOST_NOT_VALIDATED');
});
