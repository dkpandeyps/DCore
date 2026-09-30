// M11 — deterministic network-isolation PATH ASSESSMENT artifacts + SYNTHETIC_TEST_ONLY fixtures.
// DESIGN ONLY: no network, no shell, no OS/network change, no Claude, no auth, no spend. The current real
// environment is never VERIFIED (baseline stays UNVERIFIED / L0 / independence=false). Synthetic L4 path fixtures
// are SYNTHETIC_TEST_ONLY and never affect M8/M9/registry/certification/publication. Fixed clock.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { FROZEN_HOST, FROZEN_ENVIRONMENT } from '../compatibility/network-isolation.ts';
import { assessPath, TARGET_PROFILE, buildAuditRecord } from '../compatibility/network-isolation-path.ts';
import type { PathAssessmentRequest, PathEvidenceSource, IndependenceClass, Signal } from '../compatibility/network-isolation-path-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
export const FIXED = () => '2026-09-29T00:00:00Z';
export const SYN = 'SYNTHETIC_TEST_ONLY';

export function request(over: Partial<PathAssessmentRequest> = {}): PathAssessmentRequest {
  return { schema: 'dkskill.network_isolation_path_assessment/1', version: 1, request_id: 'path-req', environment_id: FROZEN_ENVIRONMENT, target_profile_id: TARGET_PROFILE, host_identity: FROZEN_HOST, os: 'Windows 11', architecture: 'x64', requested_at: FIXED(), ...over };
}

function src(o: Partial<PathEvidenceSource> & { source_id: string; independence_class: IndependenceClass; signal: Signal }): PathEvidenceSource {
  return { source_id: o.source_id, description: o.description ?? `${SYN} ${o.independence_class}`, independence_class: o.independence_class, signal: o.signal, observed_at: o.observed_at ?? FIXED(), expires_at: o.expires_at ?? null, max_age_ms: o.max_age_ms ?? null, revoked: o.revoked ?? false, applicable: o.applicable ?? true, enforcement_demonstrated: o.enforcement_demonstrated ?? false };
}
const INDEP_OK = () => src({ source_id: 'indep', independence_class: 'INDEPENDENT_OBSERVER', signal: 'ISOLATION_SUPPORTING', enforcement_demonstrated: true });
const EXT_CP = () => src({ source_id: 'ext-cp', independence_class: 'EXTERNAL_CONTROL_PLANE', signal: 'ISOLATION_SUPPORTING', enforcement_demonstrated: true });

function run(sources: PathEvidenceSource[], over: Partial<Parameters<typeof assessPath>[0]> = {}, synthetic = true) {
  return assessPath({ request: request(), sources, now: FIXED(), synthetic_test_only: synthetic, ...over });
}

export const fixtures = {
  currentReal: () => assessPath({ request: request({ request_id: 'path-current-real' }), sources: [], now: FIXED(), synthetic_test_only: false, outbound_connections_observed: true, outbound_deny_policy_observed: false }),
  selfReportedOnly: () => run([src({ source_id: 's', independence_class: 'SELF_REPORTED', signal: 'ISOLATION_SUPPORTING' })]),
  configurationOnly: () => run([src({ source_id: 'c', independence_class: 'CONFIGURATION_OBSERVED', signal: 'ISOLATION_SUPPORTING' })]),
  hostObservedOnly: () => run([src({ source_id: 'h', independence_class: 'HOST_STATE_OBSERVED', signal: 'ISOLATION_SUPPORTING' })]),
  controlledBehaviorOnly: () => run([src({ source_id: 'b', independence_class: 'CONTROLLED_BEHAVIOR_OBSERVED', signal: 'ISOLATION_SUPPORTING', enforcement_demonstrated: true })]),
  independentObserverMissing: () => run([src({ source_id: 'c', independence_class: 'CONFIGURATION_OBSERVED', signal: 'ISOLATION_SUPPORTING' }), src({ source_id: 'h', independence_class: 'HOST_STATE_OBSERVED', signal: 'ISOLATION_SUPPORTING' })]),
  independentObserverPresent: () => run([INDEP_OK()]),
  externallyEnforcedBoundary: () => run([EXT_CP()]),
  observerPresentEnforcementMissing: () => run([src({ source_id: 'indep', independence_class: 'INDEPENDENT_OBSERVER', signal: 'ISOLATION_SUPPORTING', enforcement_demonstrated: false })]),
  contradictoryEvidence: () => run([INDEP_OK(), src({ source_id: 'leak', independence_class: 'HOST_STATE_OBSERVED', signal: 'LEAK_OBSERVED' })]),
  staleEvidence: () => run([src({ source_id: 'indep', independence_class: 'INDEPENDENT_OBSERVER', signal: 'ISOLATION_SUPPORTING', enforcement_demonstrated: true, observed_at: '2026-09-01T00:00:00Z', max_age_ms: 3600000 })]),
  expiredEvidence: () => run([src({ source_id: 'indep', independence_class: 'INDEPENDENT_OBSERVER', signal: 'ISOLATION_SUPPORTING', enforcement_demonstrated: true, expires_at: '2026-01-01T00:00:00Z' })]),
  revokedEvidence: () => run([src({ source_id: 'indep', independence_class: 'INDEPENDENT_OBSERVER', signal: 'ISOLATION_SUPPORTING', enforcement_demonstrated: true, revoked: true })]),
  environmentMismatch: () => run([INDEP_OK()], { environment_matches: false }),
  profileMismatch: () => run([INDEP_OK()], { profile_matches: false }),
  tamperedEvidence: () => run([INDEP_OK()], { tampered: true }),
  syntheticL4Mechanics: () => run([INDEP_OK(), EXT_CP()]),
};

export function tamperedAuditDemo() {
  const rec = buildAuditRecord(fixtures.currentReal(), FIXED(), [], null);
  return { ...rec, path_status: 'FEASIBLE_WITH_PREREQUISITES' as const };   // flipped after hashing -> record_hash stale
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const files: [string, unknown][] = [
    ['nip-sample-current-real.json', fixtures.currentReal()],
    ['nip-sample-self-reported-only.json', fixtures.selfReportedOnly()],
    ['nip-sample-configuration-only.json', fixtures.configurationOnly()],
    ['nip-sample-host-observed-only.json', fixtures.hostObservedOnly()],
    ['nip-sample-controlled-behavior-only.json', fixtures.controlledBehaviorOnly()],
    ['nip-sample-independent-observer-missing.json', fixtures.independentObserverMissing()],
    ['nip-sample-independent-observer-present.json', fixtures.independentObserverPresent()],
    ['nip-sample-externally-enforced-boundary.json', fixtures.externallyEnforcedBoundary()],
    ['nip-sample-observer-present-enforcement-missing.json', fixtures.observerPresentEnforcementMissing()],
    ['nip-sample-contradictory.json', fixtures.contradictoryEvidence()],
    ['nip-sample-stale.json', fixtures.staleEvidence()],
    ['nip-sample-expired.json', fixtures.expiredEvidence()],
    ['nip-sample-revoked.json', fixtures.revokedEvidence()],
    ['nip-sample-environment-mismatch.json', fixtures.environmentMismatch()],
    ['nip-sample-profile-mismatch.json', fixtures.profileMismatch()],
    ['nip-sample-synthetic-l4-mechanics.json', fixtures.syntheticL4Mechanics()],
  ];
  for (const [name, obj] of files) writeFileSync(join(OUT, name), canonicalFile(obj));
  const r = fixtures.currentReal();
  console.log(`M11 samples: current-real=${r.path_status} (real net=${r.current_real_network_isolation}/${r.current_real_achieved_level}); indep-present=${fixtures.independentObserverPresent().path_status}; contradiction=${fixtures.contradictoryEvidence().path_status}; envmismatch=${fixtures.environmentMismatch().path_status}; tampered=${fixtures.tamperedEvidence().path_status}`);
}

if (process.argv[1]?.endsWith('gen-network-isolation-path-sample.ts')) main();
