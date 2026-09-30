import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMatrix, matrixCell, latest3, inheritsCertification, defaultRecord, verifyMatrix, profileCertState } from '../compatibility/global-certification-matrix.ts';
import * as G from '../tools/gen-global-certification-matrix-sample.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { canonicalFile, sha256 } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');

test('1. schema + dimensions + immutable records', () => {
  const m = G.syntheticMatrix();
  assert.equal(m.schema, 'dkskill.global_certification_matrix/1');
  assert.ok(m.records.every((r) => r.schema === 'dkskill.global_certification_record/1' && r.immutable === true));
  assert.equal(m.requires_signed_authorization, true);
});

test('2. production matrix has ZERO certified cells (immutability)', () => {
  assert.equal(G.productionMatrix().certified_count, 0);
  assert.ok(G.productionMatrix().records.every((r) => r.cert_state !== 'CERTIFIED'));
});

test('3. every combination has an explicit state; no missing => certified', () => {
  const m = G.syntheticMatrix();
  const expected = m.dimensions.platforms.length * m.dimensions.architectures.length * m.dimensions.channels.length * m.dimensions.versions.length;
  assert.equal(m.records.length, expected);
  assert.ok(m.records.every((r) => ['CERTIFIED', 'NOT_CERTIFIED', 'NOT_VALIDATED', 'BLOCKED', 'FAILED', 'REVOKED', 'SUPERSEDED'].includes(r.cert_state)));
});

test('4. missing combination defaults to NOT_CERTIFIED', () => {
  const m = G.syntheticMatrix();
  const cell = matrixCell(m, { platform: 'linux', architecture: 'arm64', channel: 'native', version: '2.1.286' });
  assert.equal(cell.cert_state, 'NOT_CERTIFIED');
  const d = defaultRecord({ platform: 'macos', architecture: 'arm64', channel: 'native', version: '9.9.9' }, true);
  assert.equal(d.cert_state, 'NOT_CERTIFIED');
});

test('5. certified cells are signed; certified implies evidence + signed', () => {
  const m = G.syntheticMatrix();
  const certified = m.records.filter((r) => r.cert_state === 'CERTIFIED');
  assert.ok(certified.length > 0);
  assert.ok(certified.every((r) => r.signed === true && r.evidence_ref !== null && r.profile_id !== null));
});

test('6. unsigned cannot be certified: non-certified cells are not signed', () => {
  const m = G.syntheticMatrix();
  assert.ok(m.records.filter((r) => r.cert_state !== 'CERTIFIED').every((r) => r.signed === false));
});

test('7. latest-3 policy: top 3 certified versions only; revoked/not-certified excluded', () => {
  const m = G.syntheticMatrix();
  assert.deepEqual(m.latest_3_certified_versions, ['2.1.286', '2.1.285', '2.1.284']);
  assert.ok(!m.latest_3_certified_versions.includes('2.1.282'));   // revoked
  assert.ok(!m.latest_3_certified_versions.includes('2.1.281'));   // not certified
});

test('8. fewer than 3 certified => no filling with guesses', () => {
  const m = buildMatrix({ registry: buildRegistry(), synthetic_test_only: false });
  assert.equal(m.certified_count, 0);
  assert.deepEqual(latest3(m.records), []);
});

test('9,10,11. no version/platform/architecture inheritance', () => {
  assert.equal(inheritsCertification(), false);
  const m = G.syntheticMatrix();
  assert.ok(m.no_inheritance.version && m.no_inheritance.platform && m.no_inheritance.architecture && m.no_inheritance.channel);
  // certified windows x64 2.1.283 does NOT make windows arm64 2.1.283 certified
  assert.equal(matrixCell(m, { platform: 'windows', architecture: 'x64', channel: 'native', version: '2.1.283' }).cert_state, 'CERTIFIED');
  assert.equal(matrixCell(m, { platform: 'windows', architecture: 'arm64', channel: 'native', version: '2.1.283' }).cert_state, 'NOT_CERTIFIED');
  // certified windows 2.1.283 does NOT make macos 2.1.286 certified
  assert.equal(matrixCell(m, { platform: 'macos', architecture: 'arm64', channel: 'native', version: '2.1.286' }).cert_state, 'NOT_CERTIFIED');
});

test('12. revoked / superseded states surfaced from registry', () => {
  assert.equal(profileCertState({ revoked: true } as any), 'REVOKED');
  assert.equal(profileCertState({ lifecycle_state: 'superseded' } as any), 'SUPERSEDED');
});

test('13. matrix hash + tamper detection', () => {
  const m = G.syntheticMatrix();
  assert.match(m.matrix_hash!, /^sha256:[0-9a-f]{64}$/);
  assert.equal(verifyMatrix(m), true);
  assert.equal(verifyMatrix({ ...m, certified_count: 999 }), false);
});

test('14. deterministic; committed == fresh; production immutable; /runtime absent', () => {
  assert.equal(canonicalFile(G.syntheticMatrix()), canonicalFile(G.syntheticMatrix()));
  const before = sha256(canonicalFile(buildRegistry()));
  G.syntheticMatrix(); G.productionMatrix();
  assert.equal(sha256(canonicalFile(buildRegistry())), before);
  assert.equal(readFileSync(join(DIR, 'global-certification-matrix-production.json'), 'utf8'), canonicalFile(G.productionMatrix()));
  assert.equal(readFileSync(join(DIR, 'global-certification-matrix-synthetic.json'), 'utf8'), canonicalFile(G.syntheticMatrix()));
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
});

test('15. synthetic matrix flagged; production not synthetic', () => {
  assert.equal(G.syntheticMatrix().synthetic_test_only, true);
  assert.equal(G.productionMatrix().synthetic_test_only, false);
  assert.ok(G.syntheticMatrix().records.filter((r) => r.cert_state === 'CERTIFIED').every((r) => r.synthetic_test_only === true));
});
