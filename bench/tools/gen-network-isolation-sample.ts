// M9 — deterministic network-isolation verification artifacts + SYNTHETIC_TEST_ONLY fixtures.
// READ-ONLY, OFFLINE: no live network contact, no firewall/adapter/route/DNS/proxy change, no live discovery.
// The current environment stays UNVERIFIED (no L4 evidence). The L4 mechanics fixture is SYNTHETIC_TEST_ONLY and
// does NOT change the real M8 state. Executes no Claude, authenticates nothing, spends nothing. Fixed clock.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { FROZEN_ENVIRONMENT, FROZEN_HOST, runVerification, buildAuditRecord } from '../compatibility/network-isolation.ts';
import type {
  NetworkIsolationRequest, NetworkIsolationObservation, IsolationScope, EvidenceClass, VerificationLevel, Signal,
  ObservationResult, WindowsMechanism,
} from '../compatibility/network-isolation-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
export const FIXED = () => '2026-09-29T00:00:00Z';
export const SYN = 'SYNTHETIC_TEST_ONLY';

export function request(over: Partial<NetworkIsolationRequest> = {}): NetworkIsolationRequest {
  return {
    schema: 'dkskill.network_isolation_request/1', version: 1, request_id: 'ni-req-real', environment_id: FROZEN_ENVIRONMENT,
    host_identity: FROZEN_HOST, os: 'Windows 11', architecture: 'x64', requested_scope: 'OUTBOUND_DENY',
    m8_context: 'future TS-07/TS-11 evidence session on cc-2.1.283-win32-x64-native@1', requested_at: FIXED(), ...over,
  };
}

function obs(o: Partial<NetworkIsolationObservation> & { observation_id: string; evidence_class: EvidenceClass; level: VerificationLevel; result: ObservationResult; signal: Signal }): NetworkIsolationObservation {
  return {
    schema: 'dkskill.network_isolation_observation/1', mechanism: o.mechanism ?? 'WINDOWS_FIREWALL_STATE',
    environment_id: o.environment_id ?? FROZEN_ENVIRONMENT, host_id: o.host_id ?? FROZEN_HOST.binary_sha256,
    os: o.os ?? 'Windows 11', architecture: o.architecture ?? 'x64', scope: o.scope ?? 'OUTBOUND_DENY',
    claim: o.claim ?? `${SYN} ${o.evidence_class} observation`, source: o.source ?? 'synthetic-source',
    source_type: o.source_type ?? (o.evidence_class === 'INDEPENDENT_VERIFICATION' ? 'INDEPENDENT' : o.evidence_class === 'CONFIGURATION_EVIDENCE' ? 'CONFIGURATION' : o.evidence_class === 'OBSERVATIONAL_EVIDENCE' ? 'OBSERVATIONAL' : 'CLAIM'),
    collection_method: o.collection_method ?? 'synthetic', observed_at: o.observed_at ?? FIXED(),
    expires_at: o.expires_at ?? null, max_age_ms: o.max_age_ms ?? null, verifier: o.verifier ?? 'SYNTHETIC-VERIFIER',
    limitations: o.limitations ?? [], revoked: o.revoked ?? false,
    observation_id: o.observation_id, evidence_class: o.evidence_class, level: o.level, result: o.result, signal: o.signal,
  };
}

// A fully-supporting L4 independent-verification observation (SYNTHETIC_TEST_ONLY).
const L4_OK = () => obs({ observation_id: 'l4-indep', mechanism: 'EXTERNAL_CONNECTION_ATTEMPTS', evidence_class: 'INDEPENDENT_VERIFICATION', level: 'L4', result: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', source: 'external-observer', claim: `${SYN} independent observer: all outbound connection attempts denied` });
const CFG_OK = () => obs({ observation_id: 'cfg-deny', evidence_class: 'CONFIGURATION_EVIDENCE', level: 'L1', result: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', claim: `${SYN} firewall outbound=deny` });
const HOST_OK = () => obs({ observation_id: 'host-state', mechanism: 'FIREWALL_PROFILES', evidence_class: 'OBSERVATIONAL_EVIDENCE', level: 'L2', result: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', claim: `${SYN} all profiles: outbound blocked` });
const BEHAVIOR_OK = () => obs({ observation_id: 'behavior', mechanism: 'ACTIVE_CONNECTIONS', evidence_class: 'OBSERVATIONAL_EVIDENCE', level: 'L3', result: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', claim: `${SYN} controlled local probe: outbound blocked` });

function verify(observations: NetworkIsolationObservation[], over: Partial<NetworkIsolationRequest> = {}, synthetic = true) {
  return runVerification({ request: request(over), observations, now: FIXED(), verifier: 'SYNTHETIC-VERIFIER', synthetic_test_only: synthetic });
}

export const fixtures = {
  currentReal: () => runVerification({ request: request({ request_id: 'ni-req-current-real' }), observations: [], now: FIXED(), verifier: null, synthetic_test_only: false }),
  claimedOnly: () => verify([obs({ observation_id: 'claim', evidence_class: 'CLAIM', level: 'L0', result: 'SUPPORTED', signal: 'ISOLATION_SUPPORTING', claim: `${SYN} operator claims offline` })]),
  configurationOnly: () => verify([CFG_OK()]),
  hostObserved: () => verify([CFG_OK(), HOST_OK()]),
  controlledBehavior: () => verify([CFG_OK(), HOST_OK(), BEHAVIOR_OK()]),
  l4Mechanics: () => verify([CFG_OK(), HOST_OK(), BEHAVIOR_OK(), L4_OK()]),
  verifiedDeny: () => verify([L4_OK()]),
  missingFirewall: () => verify([]),
  stale: () => verify([obs({ observation_id: 'l4-stale', mechanism: 'EXTERNAL_CONNECTION_ATTEMPTS', evidence_class: 'INDEPENDENT_VERIFICATION', level: 'L4', result: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', observed_at: '2026-09-01T00:00:00Z', max_age_ms: 3600000 })]),
  expired: () => verify([obs({ observation_id: 'l4-exp', mechanism: 'EXTERNAL_CONNECTION_ATTEMPTS', evidence_class: 'INDEPENDENT_VERIFICATION', level: 'L4', result: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', expires_at: '2026-01-01T00:00:00Z' })]),
  revoked: () => verify([obs({ observation_id: 'l4-rev', mechanism: 'EXTERNAL_CONNECTION_ATTEMPTS', evidence_class: 'INDEPENDENT_VERIFICATION', level: 'L4', result: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', revoked: true })]),
  incomplete: () => verify([CFG_OK()]),   // config present but no L4
  unsupportedSource: () => verify([obs({ observation_id: 'l4-unsup', mechanism: 'EXTERNAL_CONNECTION_ATTEMPTS', evidence_class: 'INDEPENDENT_VERIFICATION', level: 'L4', result: 'UNSUPPORTED', signal: 'ISOLATION_SUPPORTING' })]),
  conflictingPolicies: () => verify([obs({ observation_id: 'cfg-deny', evidence_class: 'CONFIGURATION_EVIDENCE', level: 'L1', result: 'OBSERVED', signal: 'ISOLATION_SUPPORTING' }), obs({ observation_id: 'cfg-allow', evidence_class: 'CONFIGURATION_EVIDENCE', level: 'L1', result: 'OBSERVED', signal: 'LEAK_OBSERVED', claim: `${SYN} conflicting rule allows outbound` })]),
  contradictory: () => verify([L4_OK(), obs({ observation_id: 'leak', mechanism: 'ACTIVE_CONNECTIONS', evidence_class: 'OBSERVATIONAL_EVIDENCE', level: 'L3', result: 'OBSERVED', signal: 'LEAK_OBSERVED', claim: `${SYN} active outbound connection observed` })]),
  unknownObservation: () => verify([obs({ observation_id: 'unk', mechanism: 'ACTIVE_CONNECTIONS', evidence_class: 'OBSERVATIONAL_EVIDENCE', level: 'L3', result: 'UNKNOWN', signal: 'UNKNOWN_TRAFFIC', claim: `${SYN} unknown traffic` }), L4_OK()]),
  scopeMismatch: () => verify([obs({ observation_id: 'l4-proc', mechanism: 'PROCESS_NETWORK_ASSOCIATION', evidence_class: 'INDEPENDENT_VERIFICATION', level: 'L4', result: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', scope: 'PROCESS_ONLY', claim: `${SYN} process-only outbound denied` })], { requested_scope: 'HOST_ONLY' }),
  environmentMismatch: () => verify([obs({ observation_id: 'l4-otherenv', mechanism: 'EXTERNAL_CONNECTION_ATTEMPTS', evidence_class: 'INDEPENDENT_VERIFICATION', level: 'L4', result: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', environment_id: 'OTHER-ENV' })]),
  hostMismatch: () => verify([obs({ observation_id: 'l4-otherhost', mechanism: 'EXTERNAL_CONNECTION_ATTEMPTS', evidence_class: 'INDEPENDENT_VERIFICATION', level: 'L4', result: 'OBSERVED', signal: 'ISOLATION_SUPPORTING', host_id: 'F'.repeat(64) })]),
};

export function tamperedAuditDemo() {
  const v = fixtures.currentReal();   // genuinely UNVERIFIED
  const rec = buildAuditRecord(v, FIXED(), null);
  return { ...rec, network_isolation: 'VERIFIED' as const, state: 'VERIFIED' as const };   // flipped after hashing -> record_hash stale
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const files: [string, unknown][] = [
    ['ni-sample-current-real-unverified.json', fixtures.currentReal()],
    ['ni-sample-claimed-only.json', fixtures.claimedOnly()],
    ['ni-sample-configuration-only.json', fixtures.configurationOnly()],
    ['ni-sample-host-observed.json', fixtures.hostObserved()],
    ['ni-sample-controlled-behavior.json', fixtures.controlledBehavior()],
    ['ni-sample-l4-mechanics.json', fixtures.l4Mechanics()],
    ['ni-sample-stale.json', fixtures.stale()],
    ['ni-sample-expired.json', fixtures.expired()],
    ['ni-sample-revoked.json', fixtures.revoked()],
    ['ni-sample-contradictory.json', fixtures.contradictory()],
    ['ni-sample-scope-mismatch.json', fixtures.scopeMismatch()],
    ['ni-sample-environment-mismatch.json', fixtures.environmentMismatch()],
    ['ni-sample-tampered-audit.json', tamperedAuditDemo()],
  ];
  for (const [name, obj] of files) writeFileSync(join(OUT, name), canonicalFile(obj));
  const r = fixtures.currentReal();
  console.log(`M9 samples: current-real=${r.state}/${r.network_isolation} (level ${r.achieved_level}); l4-mechanics=${fixtures.l4Mechanics().state}; contradictory=${fixtures.contradictory().state}; config-only=${fixtures.configurationOnly().state}`);
}

if (process.argv[1]?.endsWith('gen-network-isolation-sample.ts')) main();
