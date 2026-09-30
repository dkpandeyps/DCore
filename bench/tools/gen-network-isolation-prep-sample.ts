// M12-PREP — deterministic preparation-decision artifacts + SYNTHETIC_TEST_ONLY fixtures.
// No network, no shell, no OS/network change, no Claude, no auth, no spend. On the REAL single host no independent
// observer exists, so the real result is BLOCKED with ZERO changes applied. Synthetic fixtures demonstrate the
// change-control mechanics only and never affect the real host, M8, M9, the registry, certification, or publication.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import { FROZEN_ENVIRONMENT } from '../compatibility/network-isolation.ts';
import { TARGET_PROFILE } from '../compatibility/network-isolation-path.ts';
import { runPreparation, buildAuditRecord } from '../compatibility/network-isolation-prep.ts';
import type { PrepPlan, IndependentObserver, IsolationBoundary, PlannedChange, ApplyOutcome } from '../compatibility/network-isolation-prep-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
export const FIXED = () => '2026-09-29T00:00:00Z';
export const SYN = 'SYNTHETIC_TEST_ONLY';

const request = () => ({ environment_id: FROZEN_ENVIRONMENT, target_profile_id: TARGET_PROFILE });

// No independent observer available on the real single host.
const NO_OBSERVER: IndependentObserver = { proposed: false, identity: null, enforcement_identity: null, observation_mechanism: null, is_same_host_self_report: false, external: false, binds_to_environment: false, freshness_established: false, tamper_protected: false };
const SELF_OBSERVER: IndependentObserver = { proposed: true, identity: 'this-host-self-report', enforcement_identity: 'this-host', observation_mechanism: 'netsh/netstat (self)', is_same_host_self_report: true, external: false, binds_to_environment: true, freshness_established: true, tamper_protected: false };
const GOOD_OBSERVER: IndependentObserver = { proposed: true, identity: `${SYN} external-observer`, enforcement_identity: `${SYN} network-egress-enforcer`, observation_mechanism: 'external control-plane egress observation', is_same_host_self_report: false, external: true, binds_to_environment: true, freshness_established: true, tamper_protected: true };

const GOOD_BOUNDARY: IsolationBoundary = { establishable: true, minimal: true, requires_overbroad_change: false, demonstrates_denied_connectivity: true, enforcement_actually_enforced: true };
const OVERBROAD_BOUNDARY: IsolationBoundary = { ...GOOD_BOUNDARY, minimal: false, requires_overbroad_change: true };
const NODENY_BOUNDARY: IsolationBoundary = { ...GOOD_BOUNDARY, demonstrates_denied_connectivity: false, enforcement_actually_enforced: false };

function change(id: string, applied = false): PlannedChange {
  return { schema: 'dkskill.network_isolation_prep_change/1', change_id: id, operation: `${SYN} set egress-deny at external boundary`, reason: 'establish outbound-deny isolation boundary', component: 'external network boundary', previous_state: 'allow-all outbound', new_state: 'deny-all outbound (explicit minimal allowlist)', authorization_scope: 'M12-AUTH: NETWORK_ISOLATION_ENVIRONMENT_PREPARATION_ONLY', rollback_operation: 'restore prior egress policy from recorded snapshot', applied, synthetic_only: true, verification_result: 'pending independent observation', timestamp: FIXED() };
}

function plan(option_id: string, option_name: string, observer: IndependentObserver, boundary: IsolationBoundary, rationale: string): PrepPlan {
  return { schema: 'dkskill.network_isolation_prep_plan/1', option_id, option_name, independence_rationale: rationale, required_changes: [change('CHG-01'), change('CHG-02')], boundary, observer };
}

function prep(p: PrepPlan, over: { apply_outcome?: ApplyOutcome; synthetic?: boolean } = {}) {
  return runPreparation({ request: request(), plan: p, now: FIXED(), apply_outcome: over.apply_outcome, synthetic_test_only: over.synthetic ?? true });
}

export const fixtures = {
  // REAL: OPT-HOST-PLUS-OBSERVER but no independent observer exists on a single host -> BLOCKED, zero changes.
  currentReal: () => runPreparation({ request: request(), plan: plan('OPT-HOST-PLUS-OBSERVER', 'host outbound-deny + independent observer', NO_OBSERVER, GOOD_BOUNDARY, 'requires an observer external to the enforced host; none is available on this single self-hosted machine'), now: FIXED(), synthetic_test_only: false }),
  noObserver: () => prep(plan('OPT-HOST-PLUS-OBSERVER', 'host + observer', NO_OBSERVER, GOOD_BOUNDARY, 'no observer')),
  selfReportObserverRejected: () => prep(plan('OPT-HOST-PLUS-OBSERVER', 'host + observer', SELF_OBSERVER, GOOD_BOUNDARY, 'observer is host self-report -> rejected')),
  observerAvailablePrepared: () => prep(plan('OPT-EXT-EGRESS', 'infra egress policy + independent control plane', GOOD_OBSERVER, GOOD_BOUNDARY, 'external control plane enforces; a distinct independent observer attests')),
  overbroadChangeBlocked: () => prep(plan('OPT-HOST-PLUS-OBSERVER', 'host + observer', GOOD_OBSERVER, OVERBROAD_BOUNDARY, 'boundary needs host-wide overbroad changes')),
  cannotDemonstrateDenial: () => prep(plan('OPT-EXT-EGRESS', 'infra egress + observer', GOOD_OBSERVER, NODENY_BOUNDARY, 'denial not demonstrable/enforced')),
  applyFailure: () => prep(plan('OPT-EXT-EGRESS', 'infra egress + observer', GOOD_OBSERVER, GOOD_BOUNDARY, 'apply fails'), { apply_outcome: 'FAILED' }),
  environmentMismatch: () => runPreparation({ request: { environment_id: 'OTHER-ENV', target_profile_id: TARGET_PROFILE }, plan: plan('OPT-EXT-EGRESS', 'infra egress + observer', GOOD_OBSERVER, GOOD_BOUNDARY, 'mismatch'), now: FIXED(), synthetic_test_only: true }),
  syntheticPreparedMechanics: () => prep(plan('OPT-DEDICATED-MACHINE', 'dedicated isolated machine + independent verifier', GOOD_OBSERVER, GOOD_BOUNDARY, 'dedicated machine enforced; distinct independent verifier attests')),
};

export function tamperedAuditDemo() {
  const rec = buildAuditRecord(fixtures.currentReal(), FIXED(), null);
  return { ...rec, final_state: 'PREPARED_FOR_L4_VERIFICATION' as const };   // flipped after hashing -> stale hash
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const files: [string, unknown][] = [
    ['nprep-sample-current-real-blocked.json', fixtures.currentReal()],
    ['nprep-sample-no-observer.json', fixtures.noObserver()],
    ['nprep-sample-self-report-observer-rejected.json', fixtures.selfReportObserverRejected()],
    ['nprep-sample-observer-available-prepared.json', fixtures.observerAvailablePrepared()],
    ['nprep-sample-overbroad-blocked.json', fixtures.overbroadChangeBlocked()],
    ['nprep-sample-cannot-demonstrate-denial.json', fixtures.cannotDemonstrateDenial()],
    ['nprep-sample-apply-failure.json', fixtures.applyFailure()],
    ['nprep-sample-environment-mismatch.json', fixtures.environmentMismatch()],
    ['nprep-sample-synthetic-prepared-mechanics.json', fixtures.syntheticPreparedMechanics()],
  ];
  for (const [name, obj] of files) writeFileSync(join(OUT, name), canonicalFile(obj));
  const r = fixtures.currentReal();
  console.log(`M12-PREP samples: current-real=${r.final_state} (observer_established=${r.independent_observer_established}, changes_applied=${r.changes_applied.length}); prepared-synth=${fixtures.observerAvailablePrepared().final_state}; overbroad=${fixtures.overbroadChangeBlocked().final_state}; apply-fail=${fixtures.applyFailure().final_state}`);
}

if (process.argv[1]?.endsWith('gen-network-isolation-prep-sample.ts')) main();
