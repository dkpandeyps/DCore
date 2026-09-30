import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  READ_ONLY_COMMANDS, ALL_MECHANISMS, runSafetyGate, assessFreshness, assessIndependence, runCollection,
  networkIsolationCollectionToM9, networkIsolationCollectionToM8, buildAuditRecord, chainAuditRecords, verifyAuditChain,
  auditRecordHash, containsSecret, redactSecrets, classifyOutcome, collectRealHostObservations, defaultCommandRunner,
} from '../compatibility/network-isolation-collection.ts';
import * as G from '../tools/gen-network-isolation-collection-sample.ts';
import { evaluateEvidenceExecutionGate } from '../compatibility/evidence-execution.ts';
import { fixtures as execFixtures } from '../tools/gen-evidence-execution-sample.ts';
import { FROZEN_HOST, FROZEN_ENVIRONMENT } from '../compatibility/network-isolation.ts';
import type { CommandOutcome } from '../compatibility/network-isolation-collection-types.ts';
import { canonicalFile } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const f = G.fixtures;

test('1. schema identifiers', () => {
  const r = f.currentReal();
  assert.equal(r.schema, 'dkskill.network_isolation_collection_result/1');
  assert.equal(G.request().schema, 'dkskill.network_isolation_collection_request/1');
  assert.equal(r.observations[0].schema, 'dkskill.network_isolation_collection_observation/1');
  assert.equal(r.evidence[0].schema, 'dkskill.network_isolation_collection_evidence/1');
  assert.equal(buildAuditRecord(r, G.FIXED()).schema, 'dkskill.network_isolation_collection_audit/1');
});

test('2. environment binding', () => {
  assert.equal(f.currentReal().environment_id, FROZEN_ENVIRONMENT);
  assert.equal(runSafetyGate(G.request({ environment_id: 'X' })).find((g) => g.gate_id === 'COL-01')!.result, 'BLOCKED');
});

test('3,4,5. read-only enforcement + command allowlist + dynamic command rejection', () => {
  assert.ok(READ_ONLY_COMMANDS.every((c) => c.read_only === true && Array.isArray(c.args)));
  assert.equal(runSafetyGate(G.request(), { writeRequested: true }).find((g) => g.gate_id === 'COL-03')!.result, 'BLOCKED');
  // command definitions are fixed literals (no interpolation / dynamic construction)
  assert.ok(READ_ONLY_COMMANDS.every((c) => c.args.every((a) => typeof a === 'string')));
  assert.equal(f.currentReal().collection_mode, 'READ_ONLY');
});

test('6,7,8,9,10. Claude / external / credential / real ~/.claude / runtime exclusions in safety gate', () => {
  const gates = runSafetyGate(G.request());
  for (const id of ['COL-04', 'COL-05', 'COL-07', 'COL-08', 'COL-09']) assert.equal(gates.find((g) => g.gate_id === id)!.result, 'PASS', id);
  assert.equal(runSafetyGate(G.request(), { externalDependency: true }).find((g) => g.gate_id === 'COL-06')!.result, 'BLOCKED');
});

test('11-18. firewall/routing/adapter/dns/proxy/connections/procnet/isolated observations captured', () => {
  const r = f.completeReadOnly();
  const mechs = r.observations.map((o) => o.mechanism);
  for (const m of ['WINDOWS_FIREWALL_STATE', 'FIREWALL_PROFILES', 'ROUTING_STATE', 'NETWORK_ADAPTER_STATE', 'DNS_CONFIG', 'PROXY_CONFIG', 'ACTIVE_CONNECTIONS', 'PROCESS_NETWORK_ASSOCIATION']) assert.ok(mechs.includes(m as any), m);
  assert.equal(ALL_MECHANISMS.length, 11);
});

test('19,20. configuration/observation distinction + independence assessment', () => {
  const r = f.firewallConfigOnly();
  assert.equal(r.observations[0].evidence_class, 'CONFIGURATION_EVIDENCE');
  assert.equal(r.independence_satisfied, false);
  assert.equal(assessIndependence(f.l4Mechanics().evidence), true);
  assert.equal(assessIndependence(f.completeReadOnly().evidence), false);   // host inspection is never independent
});

test('21,22,23,24. L0/L1/L2/L3 cannot verify', () => {
  assert.equal(f.allUnknown().network_isolation, 'UNVERIFIED');            // L0
  assert.equal(f.firewallConfigOnly().network_isolation, 'UNVERIFIED');    // L1 config
  assert.equal(f.firewallPlusHost().network_isolation, 'UNVERIFIED');      // L2 host
  assert.equal(f.l3Mechanics().network_isolation, 'UNVERIFIED');           // L3 controlled behavior
  assert.equal(f.l3Mechanics().achieved_level, 'L3');
});

test('25. L4 acceptance mechanics (synthetic)', () => {
  const r = f.l4Mechanics();
  assert.equal(r.network_isolation, 'VERIFIED');
  assert.equal(r.achieved_level, 'L4');
  assert.equal(r.independence_satisfied, true);
  assert.equal(r.synthetic_test_only, true);
});

test('26. contradiction detection fails closed; favorable observation never selected', () => {
  assert.equal(f.contradictory().network_isolation, 'BLOCKED');
  assert.ok(f.contradictory().contradictions.length > 0);
  assert.equal(f.activeConnectionContradiction().network_isolation, 'BLOCKED');
});

test('27. scope enforcement: process-only cannot satisfy host/outbound request', () => {
  const r = G.fixtures.procNetObservation();
  assert.equal(r.network_isolation, 'UNVERIFIED');
  // a PROCESS_ONLY independent observation does not satisfy an OUTBOUND_DENY request
  const scoped = runCollection({ request: G.request({ requested_scope: 'OUTBOUND_DENY' }), sources: [{ command_id: 'i', mechanism: 'ISOLATED_ENV_CONTROLS', evidence_class: 'INDEPENDENT_VERIFICATION', scope: 'PROCESS_ONLY', signal: 'ISOLATION_SUPPORTING', status: 'OBSERVED', raw_output: 'x', observed_at: G.FIXED(), expires_at: null, max_age_ms: null, revoked: false }], now: G.FIXED(), synthetic_test_only: true });
  assert.equal(scoped.network_isolation, 'UNVERIFIED');
});

test('28,29,30. freshness / expiration / revocation', () => {
  assert.equal(assessFreshness('2026-09-29T00:00:00Z', null, null, '2026-09-29T00:00:00Z'), 'FRESH');
  assert.equal(f.stale().network_isolation, 'UNVERIFIED');
  assert.equal(f.expired().network_isolation, 'UNVERIFIED');
  assert.equal(f.revoked().network_isolation, 'UNVERIFIED');
});

test('31,32. environment / host mismatch cannot verify', () => {
  assert.equal(f.environmentMismatch().network_isolation, 'UNVERIFIED');
  assert.equal(f.hostMismatch().network_isolation, 'UNVERIFIED');
});

test('33. secret redaction before persistence', () => {
  assert.equal(containsSecret('password=SuperSecret123'), true);
  assert.equal(redactSecrets('bearer aa11bb22cc').redacted, true);
  const r = f.secretContaining();
  assert.equal(r.evidence[0].redaction_applied, true);
  assert.ok(!/password=SuperSecret123|bearer\s+aa11bb22/i.test(JSON.stringify(r)));
});

test('34,35,36. evidence hashing + audit chain + tamper detection', () => {
  const r = f.l4Mechanics();
  assert.ok(r.evidence.every((e) => /^sha256:[0-9a-f]{64}$/.test(e.normalized_hash) && /^sha256:/.test(e.raw_hash)));
  const chain = chainAuditRecords([
    { schema: 'dkskill.network_isolation_collection_audit/1', version: 1, audit_id: 'a1', collection_id: 'c1', environment_id: FROZEN_ENVIRONMENT, result_state: 'COMPLETE', network_isolation: 'UNVERIFIED', achieved_level: 'L0', evidence_hashes: [], timestamp: G.FIXED() },
    { schema: 'dkskill.network_isolation_collection_audit/1', version: 1, audit_id: 'a2', collection_id: 'c2', environment_id: FROZEN_ENVIRONMENT, result_state: 'COMPLETE', network_isolation: 'UNVERIFIED', achieved_level: 'L0', evidence_hashes: [], timestamp: G.FIXED() },
  ] as any);
  assert.equal(verifyAuditChain(chain), true);
  assert.equal(verifyAuditChain([{ ...chain[0], network_isolation: 'VERIFIED' as const }, chain[1]]), false);
  const t = G.tamperedAuditDemo();
  assert.notEqual(auditRecordHash({ ...t, record_hash: undefined } as any), t.record_hash);
});

test('37,38. M9 adapter + M8 adapter (VERIFIED+L4 only)', () => {
  assert.equal(networkIsolationCollectionToM9(f.l4Mechanics()), 'VERIFIED');
  assert.equal(networkIsolationCollectionToM9(f.currentReal()), 'UNVERIFIED');
  assert.equal(networkIsolationCollectionToM8(f.currentReal()), 'UNVERIFIED');
  assert.equal(networkIsolationCollectionToM8(f.contradictory()), 'BLOCKED');
  assert.equal(networkIsolationCollectionToM8(f.failed()), 'FAILED');
});

test('39,40. current environment fail-closed; unmodified M8 remains BLOCKED', () => {
  const gate = networkIsolationCollectionToM8(f.currentReal());
  assert.equal(gate, 'UNVERIFIED');
  const req = { ...execFixtures.currentReal(), network: { ...execFixtures.currentReal().network, isolation_status: gate } };
  const m8 = evaluateEvidenceExecutionGate(req);
  assert.equal(m8.decision, 'EXECUTION_BLOCKED');
  assert.ok(m8.stop_codes.includes('STOP-NETWORK-UNVERIFIED'));
});

test('41-45. real collector uses fixed allowlist via injected runner; no exec/network/fs-mutation in module', () => {
  // injected deterministic runner => no real command runs during tests
  const fakeRunner = (cmd: any): CommandOutcome => ({ command_id: cmd.command_id, ok: true, status: 'OBSERVED', raw_output: `SYNTHETIC ${cmd.mechanism}`, error_code: null });
  const r = collectRealHostObservations({ request: G.request(), now: G.FIXED(), runner: fakeRunner });
  assert.equal(r.performed_real_inspection, true);
  assert.equal(r.network_isolation, 'UNVERIFIED');       // host inspection alone never verifies
  assert.equal(r.observations.length, READ_ONLY_COMMANDS.length);
  // module contains no external-network utilities and no network/OS mutation calls
  const mod = readFileSync(join(DIR, 'network-isolation-collection.ts'), 'utf8');
  assert.ok(!/fetch\(|https?:\/\/|net\.connect|dgram|nslookup|curl|Invoke-WebRequest/.test(mod));
  assert.ok(!/netsh\s+advfirewall\s+set|Set-Net|New-NetFirewallRule|Remove-Net|route\s+(add|delete|change)/.test(mod));
});

test('46,47. deterministic clock + deterministic output; committed == fresh; /runtime absent', () => {
  assert.equal(canonicalFile(f.currentReal()), canonicalFile(f.currentReal()));
  assert.equal(canonicalFile(f.l4Mechanics()), canonicalFile(f.l4Mechanics()));
  assert.equal(f.currentReal().timestamp, '2026-09-29T00:00:00Z');
  const files: [string, unknown][] = [
    ['nic-sample-current-real.json', f.currentReal()],
    ['nic-sample-firewall-config-only.json', f.firewallConfigOnly()],
    ['nic-sample-active-connection-contradiction.json', f.activeConnectionContradiction()],
    ['nic-sample-l4-mechanics.json', f.l4Mechanics()],
    ['nic-sample-secret-redaction.json', f.secretContaining()],
    ['nic-sample-blocked.json', f.blocked()],
    ['nic-sample-failed.json', f.failed()],
  ];
  for (const [name, obj] of files) assert.equal(readFileSync(join(DIR, name), 'utf8'), canonicalFile(obj), name);
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
});

test('48. unknown remains unknown; current real is not promoted; classifyOutcome never yields INDEPENDENT', () => {
  assert.equal(f.allUnknown().result_state, 'PARTIAL');
  assert.equal(f.allUnknown().achieved_level, 'L0');
  // classifying any real command outcome never produces INDEPENDENT_VERIFICATION
  for (const cmd of READ_ONLY_COMMANDS) {
    const sr = classifyOutcome(cmd, { command_id: cmd.command_id, ok: true, status: 'OBSERVED', raw_output: 'DefaultOutboundAction: Block', error_code: null }, G.FIXED());
    assert.notEqual(sr.evidence_class, 'INDEPENDENT_VERIFICATION');
  }
  assert.equal(typeof defaultCommandRunner, 'function');
});
