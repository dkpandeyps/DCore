// M13 — deterministic certification-infrastructure DESIGN artifacts + SYNTHETIC_TEST_ONLY fixtures.
// Design/planning only: no network, no shell, no OS/network change, no Claude, no auth, no spend, no real
// provisioning. Never emits VERIFIED/CERTIFIED/EXECUTION_ALLOWED/PUBLISHED. Writes the reference plan JSON.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import {
  buildInfrastructurePlan, assessEnvironment, observerIsIndependent, referenceObserver, referenceEvidenceStore,
  buildAuditRecord,
} from '../compatibility/certification-infrastructure.ts';
import type { CertificationEnvironment, CertificationObserver, EnforcementBoundary, Platform } from '../compatibility/certification-infrastructure-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
export const FIXED = () => '2026-09-29T00:00:00Z';
export const SYN = 'SYNTHETIC_TEST_ONLY';

function goodBoundary(id: string): EnforcementBoundary { return { schema: 'dkskill.certification_enforcement_boundary/1', boundary_id: id, kind: 'INFRA_EGRESS', enforcement_identity: 'network-egress-enforcer', establishable: true, minimal: true, requires_overbroad_change: false, demonstrates_denied_connectivity: true, enforcement_actually_enforced: true }; }
const selfObserver = (): CertificationObserver => ({ ...referenceObserver(), observer_id: 'obs-self', identity: 'this-host', enforcement_identity: 'this-host', is_host_self_report: true, external_to_certified_host: false });

function env(over: Partial<CertificationEnvironment>): CertificationEnvironment {
  return assessEnvironment({ schema: 'dkskill.certification_environment/1', environment_id: over.environment_id ?? 'cert-test', trust_plane: over.trust_plane ?? 'CERTIFICATION_TEST_ENVIRONMENT', platform: over.platform ?? 'linux', architecture: over.architecture ?? 'x64', channel: over.channel ?? 'native', claude_code_version: over.claude_code_version ?? null, binary_sha256: over.binary_sha256 ?? null, reproducible_identity: over.reproducible_identity ?? true, credentials_isolated: over.credentials_isolated ?? true, is_current_workstation: over.is_current_workstation ?? false, requires_paid_infrastructure: over.requires_paid_infrastructure ?? false, observer: over.observer !== undefined ? over.observer : referenceObserver(), enforcement_boundary: over.enforcement_boundary !== undefined ? over.enforcement_boundary : goodBoundary('bnd'), lifecycle_state: 'PROVISIONED', readiness: 'BLOCKED', reasons: [] });
}

export const fixtures = {
  singleHostNoObserver: () => env({ environment_id: 'single-host', observer: null }),
  independentObserver: () => env({ environment_id: 'indep-obs' }),
  externalControlPlane: () => env({ environment_id: 'ext-cp', observer: referenceObserver() }),
  enforcedEgress: () => env({ environment_id: 'egress', enforcement_boundary: goodBoundary('bnd-egress') }),
  selfReportRejected: () => env({ environment_id: 'self', observer: selfObserver() }),
  currentWorkstationRejected: () => env({ environment_id: 'PTPL-DK-BENCH-WIN-01', platform: 'windows', is_current_workstation: true }),
  currentWorkstationAsControlPlaneRejected: () => env({ environment_id: 'PTPL-DK-BENCH-WIN-01', platform: 'windows', is_current_workstation: true, trust_plane: 'CERTIFICATION_CONTROL_PLANE' }),
  noReproducibleIdentity: () => env({ environment_id: 'norepro', reproducible_identity: false }),
  credentialsNotIsolated: () => env({ environment_id: 'credleak', credentials_isolated: false }),
  noEnforcement: () => env({ environment_id: 'nobnd', enforcement_boundary: null }),
  overbroadBoundary: () => env({ environment_id: 'overbroad', enforcement_boundary: { ...goodBoundary('b'), minimal: false, requires_overbroad_change: true } }),
  cannotDemonstrateDenial: () => env({ environment_id: 'nodeny', enforcement_boundary: { ...goodBoundary('b'), demonstrates_denied_connectivity: false, enforcement_actually_enforced: false } }),
  requiresPaidInfra: () => env({ environment_id: 'paid', requires_paid_infrastructure: true }),
  readyDesign: () => env({ environment_id: 'ready', requires_paid_infrastructure: false }),
  windowsTemplate: () => env({ environment_id: 'cert-win', platform: 'windows', architecture: 'x64', requires_paid_infrastructure: false }),
  macosTemplate: () => env({ environment_id: 'cert-macos', platform: 'macos', architecture: 'arm64', requires_paid_infrastructure: false }),
  linuxTemplate: () => env({ environment_id: 'cert-linux', platform: 'linux', architecture: 'x64', requires_paid_infrastructure: false }),
};

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const plan = buildInfrastructurePlan();
  writeFileSync(join(OUT, 'certification-infrastructure-plan.json'), canonicalFile(plan));
  writeFileSync(join(OUT, 'cert-infra-sample-single-host-no-observer.json'), canonicalFile(fixtures.singleHostNoObserver()));
  writeFileSync(join(OUT, 'cert-infra-sample-ready-design.json'), canonicalFile(fixtures.readyDesign()));
  writeFileSync(join(OUT, 'cert-infra-sample-requires-paid.json'), canonicalFile(fixtures.requiresPaidInfra()));
  writeFileSync(join(OUT, 'cert-infra-sample-current-workstation-rejected.json'), canonicalFile(fixtures.currentWorkstationAsControlPlaneRejected()));
  writeFileSync(join(OUT, 'cert-infra-sample-self-report-rejected.json'), canonicalFile(fixtures.selfReportRejected()));
  writeFileSync(join(OUT, 'cert-infra-audit.json'), canonicalFile(buildAuditRecord(plan, FIXED(), null)));
  console.log(`M13 infra: status=${plan.infrastructure_status}/${plan.provisioning_status}; envs=${plan.environment_templates.length}; threats=${plan.threat_model.length}; ready-design=${fixtures.readyDesign().readiness}; single-host=${fixtures.singleHostNoObserver().readiness}; current-host-cp=${fixtures.currentWorkstationAsControlPlaneRejected().readiness}; certified=${plan.certified_profiles}`);
}

if (process.argv[1]?.endsWith('gen-certification-infrastructure-sample.ts')) main();
