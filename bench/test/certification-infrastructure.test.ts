import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SUPPORTED_PLATFORMS, TRUST_PLANES, LIFECYCLE_STATES, observerIsIndependent, boundaryEstablishesDenial,
  inheritsCertification, versionMatrixPolicy, lifecycle, isForbiddenAutoTransition, assessEnvironment, buildThreatModel,
  scaleModel, publicPrivateBoundary, isPubliclyShareable, referenceObserver, referenceEvidenceStore,
  buildInfrastructurePlan, infraToM9, infraToM8, infraToM4, buildAuditRecord, chainAuditRecords, verifyAuditChain,
  auditRecordHash,
} from '../compatibility/certification-infrastructure.ts';
import * as G from '../tools/gen-certification-infrastructure-sample.ts';
import { evaluateEvidenceExecutionGate } from '../compatibility/evidence-execution.ts';
import { fixtures as execFixtures } from '../tools/gen-evidence-execution-sample.ts';
import { canonicalFile } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const f = G.fixtures;
const plan = buildInfrastructurePlan();

test('1. schema identifiers', () => {
  assert.equal(plan.schema, 'dkskill.certification_infrastructure/1');
  assert.equal(plan.environment_templates[0].schema, 'dkskill.certification_environment/1');
  assert.equal(plan.observer_architecture.schema, 'dkskill.certification_observer/1');
  assert.equal(plan.environment_templates[0].enforcement_boundary!.schema, 'dkskill.certification_enforcement_boundary/1');
  assert.equal(plan.evidence_store.schema, 'dkskill.certification_evidence_store/1');
  assert.equal(plan.lifecycle.schema, 'dkskill.certification_environment_lifecycle/1');
  assert.equal(buildAuditRecord(plan, G.FIXED()).schema, 'dkskill.certification_infrastructure_audit/1');
});

test('2. trust boundaries distinct and not collapsed', () => {
  assert.deepEqual(TRUST_PLANES, ['CERTIFICATION_CONTROL_PLANE', 'CERTIFICATION_TEST_ENVIRONMENT', 'EVIDENCE_STORE', 'REGISTRY_PUBLICATION_CONTROL']);
  assert.equal(new Set(TRUST_PLANES).size, 4);
  assert.equal(plan.evidence_store.trust_plane, 'EVIDENCE_STORE');
});

test('3,4,5. single-host / self-report / current-workstation-as-control-plane => BLOCKED', () => {
  assert.equal(f.singleHostNoObserver().readiness, 'BLOCKED');
  assert.equal(f.selfReportRejected().readiness, 'BLOCKED');
  assert.equal(f.currentWorkstationAsControlPlaneRejected().readiness, 'BLOCKED');
  assert.ok(f.currentWorkstationAsControlPlaneRejected().reasons.some((r) => /never be the certification control plane/i.test(r)));
});

test('6. independent observer contract', () => {
  assert.equal(observerIsIndependent(referenceObserver()), true);
  assert.equal(observerIsIndependent({ ...referenceObserver(), is_host_self_report: true }), false);
  assert.equal(observerIsIndependent({ ...referenceObserver(), external_to_certified_host: false }), false);
  assert.equal(observerIsIndependent({ ...referenceObserver(), enforcement_identity: referenceObserver().identity }), false);
  assert.equal(observerIsIndependent(null), false);
});

test('7. enforcement boundary must be minimal + demonstrate enforced denial', () => {
  const b = plan.environment_templates[0].enforcement_boundary!;
  assert.equal(boundaryEstablishesDenial(b), true);
  assert.equal(boundaryEstablishesDenial({ ...b, requires_overbroad_change: true, minimal: false }), false);
  assert.equal(boundaryEstablishesDenial({ ...b, demonstrates_denied_connectivity: false }), false);
  assert.equal(boundaryEstablishesDenial({ ...b, kind: 'NONE' }), false);
});

test('8,9. independent-observer / external-control-plane / enforced-egress => READY_FOR_L4_VERIFICATION', () => {
  assert.equal(f.independentObserver().readiness, 'READY_FOR_L4_VERIFICATION');
  assert.equal(f.externalControlPlane().readiness, 'READY_FOR_L4_VERIFICATION');
  assert.equal(f.enforcedEgress().readiness, 'READY_FOR_L4_VERIFICATION');
});

test('10. wrong binary/version/platform/arch handled via threat model + no inheritance', () => {
  const th = buildThreatModel().map((t) => t.threat_id);
  for (const id of ['TH-08', 'TH-09', 'TH-10', 'TH-11']) assert.ok(th.includes(id), id);
  assert.equal(inheritsCertification(), false);
  const p = versionMatrixPolicy();
  assert.ok(p.no_version_inheritance && p.no_platform_inheritance && p.no_architecture_inheritance && p.no_channel_inheritance);
});

test('11,12. stale/tampered/replayed evidence threats modeled with controls', () => {
  const byId = new Map(buildThreatModel().map((t) => [t.threat_id, t]));
  for (const id of ['TH-05', 'TH-06', 'TH-07']) { const t = byId.get(id)!; assert.ok(t.control && t.evidence && t.failure_behavior && t.residual_risk, id); }
});

test('13. credential leakage / cross-env reuse threats + secret-free evidence store', () => {
  const th = buildThreatModel().map((t) => t.threat_id);
  assert.ok(th.includes('TH-12') && th.includes('TH-13'));
  assert.equal(referenceEvidenceStore().secret_free, true);
  assert.equal(referenceEvidenceStore().visibility, 'PRIVATE');
});

test('14. registry tampering / unauthorized publication / synthetic-promotion threats', () => {
  const th = buildThreatModel().map((t) => t.threat_id);
  for (const id of ['TH-14', 'TH-15', 'TH-17', 'TH-18', 'TH-19']) assert.ok(th.includes(id), id);
  assert.ok(buildThreatModel().length >= 18);
});

test('15. multi-platform templates (windows/macos/linux), no cross-platform inference', () => {
  assert.deepEqual(SUPPORTED_PLATFORMS, ['windows', 'macos', 'linux']);
  const plats = plan.environment_templates.map((e) => e.platform);
  assert.ok(plats.includes('windows') && plats.includes('macos') && plats.includes('linux'));
  assert.equal(f.windowsTemplate().readiness, 'READY_FOR_L4_VERIFICATION');
  assert.equal(f.macosTemplate().readiness, 'READY_FOR_L4_VERIFICATION');
  assert.equal(f.linuxTemplate().readiness, 'READY_FOR_L4_VERIFICATION');
});

test('16. lifecycle: no auto EVIDENCE_CAPTURED->CERTIFIED, no auto CERTIFIED->PUBLISHED', () => {
  assert.deepEqual(LIFECYCLE_STATES.slice(0, 3), ['PROVISIONED', 'READY', 'PROBING']);
  assert.equal(isForbiddenAutoTransition('EVIDENCE_CAPTURED', 'CERTIFIED'), true);
  assert.equal(isForbiddenAutoTransition('CERTIFIED', 'PUBLISHED'), true);
  assert.equal(lifecycle().destroy_recreate_supported, true);
});

test('17. requires-paid-infra => REQUIRES_PAID_INFRASTRUCTURE_AUTHORIZATION; plan reports it', () => {
  assert.equal(f.requiresPaidInfra().readiness, 'REQUIRES_PAID_INFRASTRUCTURE_AUTHORIZATION');
  assert.equal(plan.provisioning_status, 'REQUIRES_PAID_INFRASTRUCTURE_AUTHORIZATION');
});

test('18. reproducible identity + credential isolation required', () => {
  assert.equal(f.noReproducibleIdentity().readiness, 'BLOCKED');
  assert.equal(f.credentialsNotIsolated().readiness, 'BLOCKED');
});

test('19. overbroad boundary / no-enforcement / cannot-demonstrate-denial => BLOCKED', () => {
  assert.equal(f.overbroadBoundary().readiness, 'BLOCKED');
  assert.equal(f.noEnforcement().readiness, 'BLOCKED');
  assert.equal(f.cannotDemonstrateDenial().readiness, 'BLOCKED');
});

test('20. public/private boundary; no secrets public', () => {
  const b = publicPrivateBoundary();
  assert.ok(isPubliclyShareable('capability catalogue'));
  assert.ok(!isPubliclyShareable('certification credentials'));
  assert.ok(b.private_items.includes('private evidence payloads') && b.private_items.includes('infrastructure secrets'));
});

test('21. plan status fields never assert VERIFIED/CERTIFIED/EXECUTION_ALLOWED/PUBLISHED', () => {
  assert.equal(plan.certified_profiles, 0);
  assert.equal(plan.publication, 'NONE');
  assert.equal(plan.l4_readiness_current_host, 'BLOCKED');
  assert.equal(plan.m8_state, 'EXECUTION_BLOCKED');
  assert.equal(plan.m9_state, 'UNVERIFIED');
  assert.ok(['DESIGN_VALIDATED', 'DESIGN_INCOMPLETE', 'BLOCKED'].includes(plan.infrastructure_status));
  // no environment template is READY beyond design-time L4 readiness; none is CERTIFIED/VERIFIED
  assert.ok(plan.environment_templates.every((e) => ['READY_FOR_L4_VERIFICATION', 'BLOCKED', 'FAILED', 'REQUIRES_PAID_INFRASTRUCTURE_AUTHORIZATION'].includes(e.readiness)));
});

test('22,23. adapters fail-closed', () => {
  assert.equal(infraToM9(), 'UNVERIFIED');
  assert.equal(infraToM8(), 'UNVERIFIED');
  assert.equal(infraToM4(), 'NOT_CERTIFIED');
});

test('24. unmodified M8 stays EXECUTION_BLOCKED regardless of infra design', () => {
  const req = { ...execFixtures.currentReal(), network: { ...execFixtures.currentReal().network, isolation_status: infraToM8() } };
  const m8 = evaluateEvidenceExecutionGate(req);
  assert.equal(m8.decision, 'EXECUTION_BLOCKED');
  assert.ok(m8.stop_codes.includes('STOP-NETWORK-UNVERIFIED'));
});

test('25. current workstation is not a control plane and not modified', () => {
  assert.ok(plan.current_workstation_role.includes('NOT a control plane'));
  assert.equal(f.currentWorkstationRejected().readiness, 'BLOCKED');
});

test('26. scale/cost model documents paid-infra boundary', () => {
  const s = scaleModel();
  assert.ok(s.cost_boundaries.includes('REQUIRES_PAID_INFRASTRUCTURE_AUTHORIZATION'));
  assert.ok(s.credential_isolation.toLowerCase().includes('never') && s.per_version_environment.toLowerCase().includes('no inheritance'));
});

test('27. audit chain + tamper detection', () => {
  const chain = chainAuditRecords([
    { schema: 'dkskill.certification_infrastructure_audit/1', version: 1, audit_id: 'a1', plan_id: 'p1', infrastructure_status: 'DESIGN_VALIDATED', provisioning_status: 'REQUIRES_PAID_INFRASTRUCTURE_AUTHORIZATION', environments: 3, threats: 19, certified_profiles: 0, timestamp: G.FIXED() },
    { schema: 'dkskill.certification_infrastructure_audit/1', version: 1, audit_id: 'a2', plan_id: 'p2', infrastructure_status: 'DESIGN_VALIDATED', provisioning_status: 'PLANNED', environments: 3, threats: 19, certified_profiles: 0, timestamp: G.FIXED() },
  ] as any);
  assert.equal(verifyAuditChain(chain), true);
  assert.equal(verifyAuditChain([{ ...chain[0], provisioning_status: 'PLANNED' as const }, chain[1]]), false);
  assert.match(chain[0].record_hash!, /^sha256:[0-9a-f]{64}$/);
});

test('28. static safety: no network/shell/provisioning/OS-mutation in module', () => {
  const mod = readFileSync(join(DIR, 'certification-infrastructure.ts'), 'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|net\.connect|http\.request|https\.request|child_process|execSync|execFileSync/.test(mod));
  assert.ok(!/netsh|Set-Net|New-NetFirewallRule|route\s+(add|delete)|New-AzVM|aws\s|gcloud\s|terraform/.test(mod));
});

test('29. deterministic output; committed plan == fresh; /runtime absent; no secrets', () => {
  assert.equal(canonicalFile(buildInfrastructurePlan()), canonicalFile(buildInfrastructurePlan()));
  assert.equal(readFileSync(join(DIR, 'certification-infrastructure-plan.json'), 'utf8'), canonicalFile(buildInfrastructurePlan()));
  assert.equal(readFileSync(join(DIR, 'cert-infra-sample-ready-design.json'), 'utf8'), canonicalFile(f.readyDesign()));
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
  assert.ok(!/(access_token=|BEGIN [A-Z ]*PRIVATE KEY|bearer\s+[a-z0-9]{6}|sk-[a-z0-9]{6})/i.test(canonicalFile(plan)));
});

test('30. synthetic_test_only labeling; certified count zero everywhere', () => {
  assert.equal(plan.synthetic_test_only, true);
  assert.equal(plan.certified_profiles, 0);
  assert.equal(buildAuditRecord(plan, G.FIXED()).certified_profiles, 0);
});
