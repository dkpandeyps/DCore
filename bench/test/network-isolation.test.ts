import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FROZEN_ENVIRONMENT, FROZEN_HOST, WINDOWS_MECHANISMS, assessFreshness, toEvidence, detectContradictions,
  achievedLevel, networkIsolationVerified, runVerification, networkIsolationToM8Gate, buildAuditRecord,
  chainAuditRecords, verifyAuditChain, auditRecordHash, containsSecret,
} from '../compatibility/network-isolation.ts';
import * as G from '../tools/gen-network-isolation-sample.ts';
import { evaluateEvidenceExecutionGate, FROZEN_TARGET } from '../compatibility/evidence-execution.ts';
import { fixtures as execFixtures, frozenEnv } from '../tools/gen-evidence-execution-sample.ts';
import { canonicalFile } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const f = G.fixtures;

test('1. schema identifiers', () => {
  const v = f.currentReal();
  assert.equal(v.schema, 'dkskill.network_isolation_verification/1');
  assert.equal(G.request().schema, 'dkskill.network_isolation_request/1');
  assert.equal(v.evidence_items.length === 0 || v.evidence_items[0].schema === 'dkskill.network_isolation_evidence/1', true);
  assert.equal(buildAuditRecord(v, G.FIXED()).schema, 'dkskill.network_isolation_audit/1');
});

test('2,3,4. environment / host / scope binding', () => {
  const v = f.currentReal();
  assert.equal(v.environment_id, FROZEN_ENVIRONMENT);
  assert.equal(v.host_identity.binary_sha256, FROZEN_HOST.binary_sha256);
  assert.equal(v.requested_scope, 'OUTBOUND_DENY');
});

test('5,6. freshness + expiration', () => {
  assert.equal(assessFreshness('2026-09-29T00:00:00Z', null, null, '2026-09-29T00:00:00Z'), 'FRESH');
  assert.equal(assessFreshness('2026-09-01T00:00:00Z', null, 3600000, '2026-09-29T00:00:00Z'), 'STALE');
  assert.equal(assessFreshness('2026-09-29T00:00:00Z', '2026-01-01T00:00:00Z', null, '2026-09-29T00:00:00Z'), 'EXPIRED');
  assert.equal(assessFreshness(null, null, null, '2026-09-29T00:00:00Z'), 'UNKNOWN');
  assert.equal(f.expired().state, 'EXPIRED');
  assert.equal(f.stale().network_isolation, 'UNVERIFIED');
});

test('7. revocation', () => {
  assert.equal(f.revoked().state, 'REVOKED');
  assert.equal(f.revoked().network_isolation, 'UNVERIFIED');
});

test('8. conflicting evidence => BLOCKED', () => {
  assert.equal(f.conflictingPolicies().state, 'BLOCKED');
  assert.equal(f.contradictory().state, 'BLOCKED');
  assert.equal(networkIsolationToM8Gate(f.contradictory()), 'BLOCKED');
});

test('9,10,11,12. missing / unsupported / unknown / stale evidence cannot verify', () => {
  assert.equal(f.missingFirewall().network_isolation, 'UNVERIFIED');
  assert.equal(f.unsupportedSource().state, 'FAILED');
  assert.equal(f.unknownObservation().state, 'BLOCKED');   // unknown traffic contradicts isolation
  assert.equal(f.stale().network_isolation, 'UNVERIFIED');
});

test('13,14,15. scope / environment / host mismatch cannot verify', () => {
  assert.equal(f.scopeMismatch().network_isolation, 'UNVERIFIED');
  assert.equal(f.environmentMismatch().network_isolation, 'UNVERIFIED');
  assert.equal(f.hostMismatch().network_isolation, 'UNVERIFIED');
});

test('16,17,18,19. L0/L1/L2/L3 rejection (only L4 verifies)', () => {
  assert.equal(f.claimedOnly().network_isolation, 'UNVERIFIED');       // L0
  assert.equal(f.configurationOnly().network_isolation, 'UNVERIFIED'); // L1
  assert.equal(f.hostObserved().network_isolation, 'UNVERIFIED');      // L2
  assert.equal(f.controlledBehavior().network_isolation, 'UNVERIFIED');// L3
  assert.equal(f.controlledBehavior().achieved_level, 'L3');
});

test('20. L4 acceptance mechanics', () => {
  const v = f.l4Mechanics();
  assert.equal(v.state, 'VERIFIED');
  assert.equal(v.achieved_level, 'L4');
  assert.equal(v.network_isolation, 'VERIFIED');
  assert.equal(v.proven_scope, 'OUTBOUND_DENY');
  assert.equal(networkIsolationVerified(v.evidence_items), true);
});

test('21. synthetic-only isolation: L4 fixture flagged and does not affect real state', () => {
  assert.equal(f.l4Mechanics().synthetic_test_only, true);
  assert.equal(f.currentReal().synthetic_test_only, false);
  assert.equal(f.currentReal().network_isolation, 'UNVERIFIED');
});

test('22,23. M8 adapter + fail-closed', () => {
  assert.equal(networkIsolationToM8Gate(f.l4Mechanics()), 'VERIFIED');
  assert.equal(networkIsolationToM8Gate(f.currentReal()), 'UNVERIFIED');
  assert.equal(networkIsolationToM8Gate(f.expired()), 'UNVERIFIED');
  assert.equal(networkIsolationToM8Gate(f.unsupportedSource()), 'FAILED');
  // any non-VERIFIED state must not satisfy EP-13
  for (const k of ['currentReal', 'claimedOnly', 'configurationOnly', 'hostObserved', 'controlledBehavior', 'stale', 'expired', 'revoked', 'contradictory', 'scopeMismatch'] as const)
    assert.notEqual(networkIsolationToM8Gate(f[k]()), 'VERIFIED', k);
});

test('24. current environment remains UNVERIFIED; M8 remains BLOCKED (unmodified M8)', () => {
  const gate = networkIsolationToM8Gate(f.currentReal());
  assert.equal(gate, 'UNVERIFIED');
  // wire the fail-closed adapter output into the REAL unmodified M8 gate -> still BLOCKED
  const req = { ...execFixtures.currentReal(), network: { ...execFixtures.currentReal().network, isolation_status: gate } };
  const m8 = evaluateEvidenceExecutionGate(req);
  assert.equal(m8.decision, 'EXECUTION_BLOCKED');
  assert.ok(m8.stop_codes.includes('STOP-NETWORK-UNVERIFIED'));
});

test('25,26,27,28,29,30. no auto-authorization / execution / claude / auth / network / fs mutation', () => {
  // M9 exposes no executor and no authorization mutation; it is a pure verification function.
  const mod = readFileSync(join(DIR, 'network-isolation.ts'), 'utf8');
  assert.ok(!/child_process|execSync|spawn|fetch\(|https?:\/\/|net\.connect|dgram/.test(mod));   // no exec / no network
  assert.ok(!/writeFileSync|createWriteStream|unlinkSync|rmSync/.test(mod));                      // no filesystem mutation
  assert.equal(typeof (globalThis as any).__m9_executor, 'undefined');
});

test('31,32. audit hash chain + tamper detection', () => {
  const chain = chainAuditRecords([
    { schema: 'dkskill.network_isolation_audit/1', version: 1, audit_id: 'a1', verification_id: 'v1', environment_id: FROZEN_ENVIRONMENT, state: 'UNVERIFIED', network_isolation: 'UNVERIFIED', achieved_level: 'L0', evidence_hashes: [], timestamp: G.FIXED() },
    { schema: 'dkskill.network_isolation_audit/1', version: 1, audit_id: 'a2', verification_id: 'v2', environment_id: FROZEN_ENVIRONMENT, state: 'UNVERIFIED', network_isolation: 'UNVERIFIED', achieved_level: 'L0', evidence_hashes: [], timestamp: G.FIXED() },
  ] as any);
  assert.equal(verifyAuditChain(chain), true);
  assert.match(chain[0].record_hash!, /^sha256:[0-9a-f]{64}$/);
  assert.equal(verifyAuditChain([{ ...chain[0], state: 'VERIFIED' as const }, chain[1]]), false);
  // the tampered sample record's hash no longer matches its content
  const t = G.tamperedAuditDemo();
  assert.notEqual(auditRecordHash({ ...t, record_hash: undefined } as any), t.record_hash);
});

test('33. contradiction handling never picks the favorable observation', () => {
  const v = f.contradictory();
  assert.equal(v.achieved_level, 'L4');          // an L4 observation is present
  assert.equal(v.state, 'BLOCKED');              // but the leak contradiction blocks verification
  assert.equal(v.network_isolation, 'BLOCKED');
  assert.ok(v.contradictions.length > 0);
});

test('34,35. safe provenance + secret exclusion', () => {
  const v = f.l4Mechanics();
  for (const e of v.evidence_items) { assert.ok(e.raw_hash && e.normalized_hash); assert.ok(!!e.observation.source); }
  assert.equal(containsSecret({ claim: 'bearer aa11bb22cc' }), true);
  assert.equal(containsSecret(v), false);
  const blob = JSON.stringify(v) + JSON.stringify(f.currentReal());
  assert.ok(!/(access_token=|refresh_token=|BEGIN [A-Z ]*PRIVATE KEY|bearer\s+[a-z0-9]{6}|password=)/i.test(blob));
});

test('36,37. deterministic timestamps + deterministic verification result; committed == fresh; /runtime absent', () => {
  assert.equal(canonicalFile(f.currentReal()), canonicalFile(f.currentReal()));
  assert.equal(canonicalFile(f.l4Mechanics()), canonicalFile(f.l4Mechanics()));
  assert.equal(f.currentReal().observation_timestamp, '2026-09-29T00:00:00Z');
  const files: [string, unknown][] = [
    ['ni-sample-current-real-unverified.json', f.currentReal()],
    ['ni-sample-configuration-only.json', f.configurationOnly()],
    ['ni-sample-l4-mechanics.json', f.l4Mechanics()],
    ['ni-sample-contradictory.json', f.contradictory()],
    ['ni-sample-expired.json', f.expired()],
    ['ni-sample-revoked.json', f.revoked()],
  ];
  for (const [name, obj] of files) assert.equal(readFileSync(join(DIR, name), 'utf8'), canonicalFile(obj), name);
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
});

test('extra. Windows mechanisms evaluated; achievedLevel / verified predicate', () => {
  assert.equal(WINDOWS_MECHANISMS.length, 12);
  assert.equal(f.currentReal().mechanisms_evaluated.length, 12);
  assert.ok(f.currentReal().mechanisms_evaluated.every((m) => m.result === 'UNKNOWN'));
  assert.equal(achievedLevel(f.l4Mechanics().evidence_items), 'L4');
  assert.equal(networkIsolationVerified(f.configurationOnly().evidence_items), false);
});
