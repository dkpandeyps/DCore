import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCatalogue, catalogueJson, renderMarkdown, CRITICALITY, STATES, REQUIRED_FOR } from '../tools/gen-capability-catalogue.ts';
import { canonicalFile } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const cat = buildCatalogue();

test('1. the catalogue declares the schema id and version', () => {
  assert.equal(cat.schema, 'dkskill.capability_catalogue/1');
  assert.equal(cat.version, 1);
});

test('2 & 10. capability IDs are unique (no duplicates)', () => {
  const ids = cat.capabilities.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('3. capability IDs are stable non-empty CAP- strings', () => {
  for (const c of cat.capabilities) assert.match(c.id, /^CAP-[A-Z0-9-]+$/, c.id);
});

test('4. criticality values are valid', () => {
  for (const c of cat.capabilities) assert.ok((CRITICALITY as readonly string[]).includes(c.criticality), `${c.id}:${c.criticality}`);
});

test('5. capability states are valid', () => {
  for (const c of cat.capabilities) assert.ok((STATES as readonly string[]).includes(c.state), `${c.id}:${c.state}`);
  // No catalogued capability may start in the runtime-only DEGRADED_AT_RUNTIME state.
  for (const c of cat.capabilities) assert.notEqual(c.state, 'DEGRADED_AT_RUNTIME', c.id);
});

test('6. every capability has the required evidence/status fields', () => {
  for (const c of cat.capabilities) {
    assert.ok(c.name && c.description && c.host_facet_dependency, c.id);
    assert.ok((REQUIRED_FOR as readonly string[]).includes(c.required_for), c.id);
    assert.ok(Array.isArray(c.limitations) && Array.isArray(c.evidence_refs), c.id);
    assert.equal(typeof c.safe_degradation, 'boolean', c.id);
    assert.equal(typeof c.blocks_certification, 'boolean', c.id);
    assert.ok(c.certification_requirement && c.failure_behavior && c.platform_version_sensitivity, c.id);
  }
});

test('7. VERIFIED / PARTIALLY_VERIFIED capabilities carry evidence references', () => {
  for (const c of cat.capabilities) {
    if (c.state === 'VERIFIED' || c.state === 'PARTIALLY_VERIFIED') {
      assert.ok(c.evidence_refs.length > 0, `${c.id} must cite evidence`);
      for (const e of c.evidence_refs) assert.ok(e.source && e.ref && e.phase && e.status, `${c.id} evidence ref incomplete`);
    }
  }
});

test('8. NOT_YET_VALIDATED capabilities do not claim certification (and define a future validation)', () => {
  for (const c of cat.capabilities) {
    if (c.state === 'NOT_YET_VALIDATED') {
      assert.equal(c.blocks_certification, true, `${c.id} unvalidated must block certification`);
      assert.match(c.certification_requirement, /future|implement|validate/i, `${c.id} must define future validation`);
    }
  }
});

test('9. dependency/facet references are structurally valid strings', () => {
  for (const c of cat.capabilities) assert.match(c.host_facet_dependency, /^[a-z][a-z0-9-]*$/, c.id);
});

test('11. markdown and JSON capability counts agree', () => {
  const md = renderMarkdown();
  assert.match(md, new RegExp(`\\*\\*Capabilities:\\*\\* ${cat.capabilities.length}\\b`));
  // one detail heading per capability
  const headings = (md.match(/^### CAP-/gm) ?? []).length;
  assert.equal(headings, cat.capabilities.length);
  assert.equal((cat.metadata as any).capability_count, cat.capabilities.length);
});

test('12. no capability ID is tied to a single Claude Code version', () => {
  for (const c of cat.capabilities) {
    assert.ok(!/\d+\.\d+\.\d+/.test(c.id), `${c.id} must not embed a version`);
    assert.ok(!/CC-\d/.test(c.id), c.id);
  }
});

test('13. H-Q1 safety semantics are represented: an UNVERIFIED safety-critical capability blocks certified enforcement', () => {
  const safety = cat.metadata.safety_semantics as string;
  assert.match(safety, /UNVERIFIED != UNSUPPORTED/);
  assert.match(safety, /H-Q1/);
  // Every safety-critical capability that is not fully VERIFIED and cannot degrade must block certification.
  for (const c of cat.capabilities) {
    if (c.required_for === 'core_safety_enforcement' && c.criticality === 'CRITICAL' && c.state !== 'VERIFIED' && !c.safe_degradation) {
      assert.equal(c.blocks_certification, true, `${c.id} (unverified safety-critical) must block certification`);
    }
  }
  assert.equal((cat.metadata.owner_architecture as any)['H-Q1'], 'REFUSE enforcement on UNVERIFIED hosts.');
});

test('14. JSON is deterministic/canonical and equals the committed artifact', () => {
  assert.equal(catalogueJson(), canonicalFile(buildCatalogue()));                 // canonical
  assert.equal(readFileSync(join(DIR, 'capability-catalogue.json'), 'utf8'), catalogueJson());
  assert.equal(readFileSync(join(DIR, 'CAPABILITY-CATALOGUE.md'), 'utf8'), renderMarkdown());
});

test('15. M0 creates no certification claim and does not change frozen Phase 4 state', () => {
  const s = JSON.stringify(cat);
  assert.ok(!/"certified"\s*:\s*true/i.test(s), 'no certification is asserted');
  const f = cat.metadata.frozen_phase4_state as any;
  assert.equal(f.benchmark_claude_code_version, '2.1.283');
  assert.deepEqual(f.attr_valid_for, ['2.1.283']);
  assert.equal(f.ts07, 'UNRESOLVED');
  assert.equal(f.run_a, 'BLOCKED_AND_UNAUTHORIZED');
  const ni = cat.metadata.not_implemented as Record<string, boolean>;
  for (const [k, v] of Object.entries(ni)) assert.equal(v, false, k);
  assert.equal(cat.metadata.status, 'M0_DESIGN_COMPLETE_NOT_IMPLEMENTED');
});
