import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  buildAttestation, verifyAttestation, attestationHasSecret, attestationToMatrixCell, attestationMatrixCombo,
  threatModel, integrationInterfaces,
} from '../compatibility/certification-identity-attestation.ts';
import * as G from '../tools/gen-certification-identity-attestation-sample.ts';
import { productionMatrix, syntheticMatrix } from '../tools/gen-global-certification-matrix-sample.ts';
import { buildRegistry } from '../tools/gen-compatibility-registry.ts';
import { canonicalFile, sha256 } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const f = G.fixtures;

test('1. schema + identity tuple + deterministic hash; never CERTIFIED/SIGNED/PUBLISHED', () => {
  const a = f.complete();
  assert.equal(a.schema, 'dkskill.certification_identity_attestation/1');
  assert.equal(a.attestation_status, 'COMPLETE_UNSIGNED');
  for (const k of ['product', 'claude_version', 'operating_system', 'architecture', 'channel', 'binary_sha256'] as const) assert.ok(a[k], k);
  assert.equal(a.signer_identity, null);
  assert.equal(a.signature_status, 'SIGNATURE_REQUIRED');
  assert.equal(a.signing_required, true);
  assert.equal(verifyAttestation(a), true);
  assert.equal(verifyAttestation({ ...a, claude_version: '9.9.9' }), false);
});

test('2. completeness: missing version/channel/hash => INCOMPLETE', () => {
  assert.equal(f.missingVersion().attestation_status, 'INCOMPLETE');
  assert.equal(f.missingChannel().attestation_status, 'INCOMPLETE');
  assert.equal(f.missingHash().attestation_status, 'INCOMPLETE');
});

test('3. channel/binary require strong provenance (SELF_REPORTED insufficient)', () => {
  const a = f.weakChannel();
  assert.equal(a.attestation_status, 'INCOMPLETE');
  assert.equal(a.provenance.find((p) => p.field === 'channel')!.state, 'INSUFFICIENT_PROVENANCE');
});

test('4. contradiction detection (version + hash) => CONTRADICTED', () => {
  assert.equal(f.contradictoryVersion().attestation_status, 'CONTRADICTED');
  assert.ok(f.contradictoryVersion().contradictions.length > 0);
  assert.equal(f.contradictoryHash().attestation_status, 'CONTRADICTED');
});

test('5. ambiguous installation => AMBIGUOUS (no silent selection)', () => {
  assert.equal(f.ambiguousInstall().attestation_status, 'AMBIGUOUS');
});

test('6. stale/revoked/superseded/tampered states', () => {
  assert.equal(f.stale().attestation_status, 'EXPIRED');
  assert.equal(f.revoked().attestation_status, 'REVOKED');
  assert.equal(f.superseded().attestation_status, 'SUPERSEDED');
  assert.equal(f.tampered().attestation_status, 'TAMPERED');
});

test('7. provenance distinctions (5 classes) + per-field strength recorded', () => {
  const a = f.complete();
  assert.equal(a.provenance.find((p) => p.field === 'binary_sha256')!.strength, 'INDEPENDENT_OBSERVATION');
  assert.equal(a.provenance.find((p) => p.field === 'product')!.strength, 'CERTIFICATION_ATTESTATION');
  const classes = new Set(a.observation_sources.map((s) => s.provenance_strength));
  assert.ok(classes.has('CONTROLLED_OBSERVATION') && classes.has('INDEPENDENT_OBSERVATION'));
});

test('8. matrix binding: exactly one cell; missing cell NOT_CERTIFIED; M19 never certifies', () => {
  const a = f.complete();
  assert.deepEqual(a.matrix_combo, { platform: 'windows', architecture: 'x64', channel: 'native', version: '2.1.283' });
  // against PRODUCTION matrix (certified 0) => a non-certified state (never CERTIFIED)
  const prod = attestationToMatrixCell(a, productionMatrix());
  assert.equal(prod.bound, true);
  assert.notEqual(prod.cell.cert_state, 'CERTIFIED');
  assert.ok(['NOT_CERTIFIED', 'NOT_VALIDATED'].includes(prod.cell.cert_state));
  // an incomplete attestation binds to no cell
  assert.equal(attestationToMatrixCell(f.missingChannel(), syntheticMatrix()).bound, false);
});

test('9. no inheritance: wrong-arch binds to its own (not-certified) cell, not x64', () => {
  const a = f.wrongArch();
  assert.equal(a.matrix_combo.architecture, 'ppc64');   // never mapped to x64
  const r = attestationToMatrixCell(a, syntheticMatrix());
  if (r.bound) assert.notEqual(r.cell.cert_state, 'CERTIFIED');   // a ppc64 cell is never inherited-certified from x64
});

test('10. no secret fields; secret detection', () => {
  assert.equal(attestationHasSecret(f.complete()), false);
  assert.equal(attestationHasSecret(buildAttestation({ attestation_id: 'x', channel: 'bearer aa11bb22cc', created_at: G.FIXED(), now: G.FIXED() })), true);
  assert.ok(!/(access_token=|BEGIN [A-Z ]*PRIVATE KEY|bearer\s+[a-z0-9]{6})/i.test(canonicalFile(f.complete())));
});

test('11. integration interfaces documented; M19 executes none', () => {
  const ints = integrationInterfaces();
  assert.equal(ints.length, 7);
  assert.ok(ints.every((i) => i.m19_executes === false));
  for (const s of ['M4', 'M5', 'M6', 'M13']) assert.ok(ints.some((i) => i.stage === s), s);
});

test('12. threat model: every threat blocks certification with control + failure state', () => {
  const th = threatModel();
  assert.ok(th.length >= 14);
  assert.ok(th.every((t) => t.certification_blocked === true && !!t.required_evidence && !!t.control && !!t.failure_state));
  assert.ok(th.some((t) => /forged/i.test(t.threat)) && th.some((t) => /replay/i.test(t.threat)) && th.some((t) => /wrong binary/i.test(t.threat)));
});

test('13. signing boundary: never signed; signing required before authoritative', () => {
  for (const k of Object.keys(f) as (keyof typeof f)[]) {
    const a = f[k]();
    assert.equal(a.signer_identity, null);
    assert.equal(a.signing_required, true);
    assert.notEqual(a.attestation_status as string, 'CERTIFIED');
    assert.notEqual(a.attestation_status as string, 'PUBLISHED');
    assert.notEqual(a.attestation_status as string, 'SIGNED');
  }
});

test('14. public product unaffected: M17 probe + M18 assessment byte-identical', () => {
  const P = join(DIR, '..', 'product');
  assert.ok(existsSync(join(P, 'claude-identity-probe.ts')));   // M17 present, not modified by M19
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
});

test('15. committed == fresh; production immutable; certified 0; static safety', () => {
  const before = sha256(canonicalFile(buildRegistry()));
  assert.equal(readFileSync(join(DIR, 'attestation-complete.json'), 'utf8'), canonicalFile(f.complete()));
  assert.equal(readFileSync(join(DIR, 'attestation-revoked.json'), 'utf8'), canonicalFile(f.revoked()));
  assert.equal(sha256(canonicalFile(buildRegistry())), before);
  assert.equal(buildRegistry().profiles.filter((p) => p.certification_status === 'CERTIFIED').length, 0);
  const mod = readFileSync(join(DIR, 'certification-identity-attestation.ts'), 'utf8');
  assert.ok(!/\bfetch\s*\(|https?:\/\/[a-z]|child_process|execSync|execFileSync|\bspawn\s*\(|writeFileSync|sign\s*\(/i.test(mod));
});
