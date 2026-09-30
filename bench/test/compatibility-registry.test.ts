import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRegistry, registryJson, renderMarkdown, canCertify, isSafetyCritical, VALIDATION_STATES, CERTIFICATION_STATES, FACET_FAMILIES } from '../tools/gen-compatibility-registry.ts';
import { buildCatalogue } from '../tools/gen-capability-catalogue.ts';
import { canonicalFile } from '../src/canonical.ts';
import { PHASE4_DECISIONS } from '../src/phase4-register.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const reg = buildRegistry();
const M0 = buildCatalogue();
const M0_IDS = new Set(M0.capabilities.map((c) => c.id));
const CAP_STATES = new Set(['VERIFIED', 'PARTIALLY_VERIFIED', 'NOT_YET_VALIDATED', 'NOT_AVAILABLE', 'DEGRADED_AT_RUNTIME']);

test('1. schema and registry_version are correct', () => {
  assert.equal(reg.schema, 'dkskill.compat_registry/1');
  assert.equal(reg.registry_version, 1);
});

test('2 & 14(det). registry JSON is deterministic/canonical and equals the committed artifact', () => {
  assert.equal(registryJson(), canonicalFile(buildRegistry()));
  assert.equal(readFileSync(join(DIR, 'compatibility-registry.json'), 'utf8'), registryJson());
  assert.equal(readFileSync(join(DIR, 'COMPATIBILITY-REGISTRY.md'), 'utf8'), renderMarkdown());
  // no nondeterministic wall-clock: generated_at is a fixed source date.
  assert.match(reg.generated_at, /^\d{4}-\d{2}-\d{2}$/);
});

test('3 & 4. profile IDs are unique, immutable-form identifiers', () => {
  const ids = reg.profiles.map((p) => p.profile_id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /@\d+$/, `${id} must carry an immutable @version suffix`);
});

test('5 & 24. every capability reference resolves to an M0 capability', () => {
  for (const p of reg.profiles) {
    assert.equal(Object.keys(p.capability_refs).length, M0.capabilities.length, p.profile_id);
    for (const [id, state] of Object.entries(p.capability_refs)) {
      assert.ok(M0_IDS.has(id), `${p.profile_id}: ${id} not in M0`);
      assert.ok(CAP_STATES.has(state), `${p.profile_id}: ${id} state ${state}`);
    }
  }
});

test('6 & 7. facet structures are valid and attribution facet references are explicit', () => {
  for (const f of Object.values(reg.facets)) {
    assert.match(f.facet_id, /@\d+$/, f.facet_id);
    assert.ok((FACET_FAMILIES as readonly string[]).includes(f.family), f.family);
    assert.ok((VALIDATION_STATES as readonly string[]).includes(f.validation_status), f.validation_status);
  }
  // the 2.1.283 profile references the attribution facet explicitly; unvalidated profiles set it null (explicit).
  const p283 = reg.profiles.find((p) => p.version === '2.1.283')!;
  assert.equal(p283.attribution_ref, 'attribution@1');
  assert.ok('attribution' in p283.facet_refs);
  for (const p of reg.profiles) assert.ok('attribution_ref' in p, p.profile_id);
});

test('8. certification metadata is required/consistent for CERTIFIED (and none is CERTIFIED here)', () => {
  for (const p of reg.profiles) {
    if (p.certification_status === 'CERTIFIED') {
      assert.equal(p.certification.certified, true, p.profile_id);
      assert.ok(p.certification.authority && p.certification.certified_at && p.certification.certification_review_ref, p.profile_id);
    } else {
      assert.equal(p.certification.certified, false, p.profile_id);
    }
  }
  assert.equal(reg.profiles.some((p) => p.certification_status === 'CERTIFIED'), false);
});

test('9. a CERTIFIED profile cannot contain an unresolved safety-critical capability', () => {
  for (const p of reg.profiles) {
    if (p.certification_status === 'CERTIFIED') assert.ok(canCertify(p.capability_refs), `${p.profile_id} certified with unresolved safety-critical cap`);
  }
  // and the gate itself is real: 2.1.283 (with a PARTIALLY_VERIFIED safety-critical cap) is NOT certifiable.
  const p283 = reg.profiles.find((p) => p.version === '2.1.283')!;
  assert.equal(canCertify(p283.capability_refs), false);
  assert.ok(M0.capabilities.some((c) => isSafetyCritical(c)), 'there is at least one safety-critical capability');
});

test('10. UNVERIFIED != UNSUPPORTED semantics are present (H-Q1)', () => {
  assert.match(reg.metadata.safety_rule as string, /UNVERIFIED != UNSUPPORTED/);
  assert.match(reg.metadata.safety_rule as string, /H-Q1/);
  assert.equal((reg.metadata.owner_architecture as any)['H-Q1'], 'REFUSE enforcement on UNVERIFIED hosts.');
});

test('11. no automatic version inheritance (2.1.284 does not inherit 2.1.283)', () => {
  assert.match(reg.metadata.no_silent_compatibility as string, /does NOT inherit/i);
  const p284 = reg.profiles.find((p) => p.version === '2.1.284')!;
  for (const state of Object.values(p284.capability_refs)) assert.equal(state, 'NOT_YET_VALIDATED');
  assert.equal(p284.attribution_ref, null);
  for (const v of Object.values(p284.facet_refs)) assert.equal(v, null);
});

test('12 & 13 & 14 & 15. platform, architecture, channel and binary identity fields are explicit', () => {
  for (const p of reg.profiles) {
    assert.ok(typeof p.platform === 'string' && p.platform.length > 0, p.profile_id);
    assert.ok(typeof p.architecture === 'string' && p.architecture.length > 0, p.profile_id);
    assert.ok(typeof p.channel === 'string' && p.channel.length > 0, p.profile_id);
    assert.ok('binary_sha256' in p && 'product' in p && 'version' in p, p.profile_id);   // explicit (may be null when unvalidated)
  }
  const p283 = reg.profiles.find((p) => p.version === '2.1.283')!;
  assert.equal(p283.binary_sha256, '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A');
});

test('16 & revocation vocabulary. revocation is explicit and lifecycle states are valid', () => {
  for (const p of reg.profiles) {
    assert.equal(typeof p.revoked, 'boolean', p.profile_id);
    assert.ok(['active', 'superseded', 'revoked'].includes(p.lifecycle_state), p.profile_id);
    if (p.revoked) assert.ok(p.revocation && p.lifecycle_state === 'revoked', p.profile_id);
  }
  assert.match(reg.metadata.revocation_rule as string, /MUST NOT silently fall back/);
});

test('17. supersession references resolve and do not mutate the superseded record', () => {
  const byId = new Map(reg.profiles.map((p) => [p.profile_id, p]));
  for (const p of reg.profiles) {
    if (p.supersedes) {
      assert.ok(byId.has(p.supersedes), `${p.profile_id} supersedes missing ${p.supersedes}`);
      // the superseded record still exists as its own immutable record (present + hashed).
      assert.ok(byId.get(p.supersedes)!.record_hash, 'superseded record retains its own hash');
    }
    assert.ok('superseded_by' in p);
  }
});

test('18 & 19. no fabricated signatures or certification evidence', () => {
  assert.equal(reg.integrity.signature_status, 'UNSIGNED_DESIGN');
  assert.equal(reg.integrity.signature_reference, null);
  for (const p of reg.profiles) {
    assert.equal(p.signature_status, 'UNSIGNED_DESIGN', p.profile_id);
    assert.equal(p.signature_reference, null, p.profile_id);
    assert.equal(p.certification.certified_at, null, p.profile_id);   // no fabricated certification timestamp
    assert.ok(p.record_hash && /^sha256:[0-9a-f]{64}$/.test(p.record_hash), p.profile_id);
  }
});

test('20 & 21. 2.1.283 and 2.1.284 are NOT CERTIFIED', () => {
  const p283 = reg.profiles.find((p) => p.version === '2.1.283')!;
  const p284 = reg.profiles.find((p) => p.version === '2.1.284')!;
  assert.equal(p283.certification_status, 'NOT_CERTIFIED');
  assert.match(p283.limitations.join(' '), /TS-07/);
  assert.equal(p284.certification_status, 'NOT_CERTIFIED');
});

test('22 & 23. macOS and Linux have no fabricated certification', () => {
  for (const plat of ['darwin', 'linux']) {
    const p = reg.profiles.find((x) => x.platform === plat)!;
    assert.ok(p, plat);
    assert.equal(p.certification_status, 'NOT_CERTIFIED', plat);
    assert.equal(p.validation_status, 'NOT_VALIDATED', plat);
    assert.equal(p.binary_sha256, null, plat);
    assert.equal(p.certification.certified, false, plat);
  }
});

test('25. Markdown/JSON profile counts agree', () => {
  const md = renderMarkdown();
  assert.match(md, new RegExp(`\\*\\*Profiles:\\*\\* ${reg.profiles.length}\\b`));
  const rowCount = (md.match(/^\| (cc-|scope-)/gm) ?? []).length;
  assert.equal(rowCount, reg.profiles.length);
});

test('26. capability IDs contain no Claude Code version strings', () => {
  for (const p of reg.profiles) for (const id of Object.keys(p.capability_refs)) {
    assert.ok(!/\d+\.\d+\.\d+/.test(id) && !/CC-\d/.test(id), id);
  }
});

test('27. /runtime/ is not created by M1', () => {
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  assert.equal(existsSync(join(TEST_DIR, '..', 'runtime')), false);
});

test('28. M1 does not change the Phase 4 decision register', () => {
  assert.deepEqual(Object.keys(PHASE4_DECISIONS).sort(), ['APPROVE-AUTHENTICATE-CLAUDE', 'APPROVE-ENABLE-REAL-SESSIONS', 'APPROVE-PROVISION-ISOLATED-ENV', 'BQ-01', 'BQ-03', 'BQ-05', 'BQ-06', 'BQ-19', 'TS-05-EVIDENCE', 'TS-05-MECHANISM']);
  const f = reg.metadata.frozen_phase4_state as any;
  assert.deepEqual(f.attr_valid_for, ['2.1.283']);
  assert.equal(f.ts07, 'UNRESOLVED');
  assert.equal(f.run_a, 'BLOCKED_AND_UNAUTHORIZED');
});
