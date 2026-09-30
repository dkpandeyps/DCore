// M13 — Global Compatibility Certification Infrastructure engine (design + provisioning planning).
// Pure, deterministic, FAIL-CLOSED, DESIGN ONLY. No network, no shell, no OS/network change, no Claude, no auth, no
// spend, no real provisioning. Never emits VERIFIED/CERTIFIED/EXECUTION_ALLOWED/PUBLISHED. Trust boundaries are never
// collapsed; no cross-platform/version/arch/channel inheritance; the current workstation is never a control plane.
import { sha256, canonicalJson } from '../src/canonical.ts';
import type {
  CertificationInfrastructurePlan, CertificationEnvironment, CertificationObserver, EnforcementBoundary, EvidenceStore,
  EnvironmentLifecycle, Threat, ScaleModel, PublicPrivateBoundary, VersionMatrixPolicy, Platform, TrustPlane,
  LifecycleState, EnvReadiness, InfrastructureAudit, Visibility,
} from './certification-infrastructure-types.ts';

export const SUPPORTED_PLATFORMS: Platform[] = ['windows', 'macos', 'linux'];
export const TRUST_PLANES: TrustPlane[] = ['CERTIFICATION_CONTROL_PLANE', 'CERTIFICATION_TEST_ENVIRONMENT', 'EVIDENCE_STORE', 'REGISTRY_PUBLICATION_CONTROL'];
export const LIFECYCLE_STATES: LifecycleState[] = ['PROVISIONED', 'READY', 'PROBING', 'EVIDENCE_CAPTURED', 'EVIDENCE_VALIDATED', 'CERTIFICATION_REVIEW', 'CERTIFIED', 'PUBLISHED', 'REVOKED', 'DESTROYED'];

// ---- independence contract (same authority as M9/M12; host self-report is never independent) ----------------
export function observerIsIndependent(o: CertificationObserver | null): boolean {
  return !!o && !o.is_host_self_report && o.external_to_certified_host && !!o.identity && !!o.enforcement_identity &&
    o.enforcement_identity !== o.identity && o.environment_bound && o.freshness_established && o.tamper_evident &&
    !!o.observation_path && !!o.evidence_path;
}
export function boundaryEstablishesDenial(b: EnforcementBoundary | null): boolean {
  return !!b && b.kind !== 'NONE' && b.establishable && b.minimal && !b.requires_overbroad_change &&
    b.demonstrates_denied_connectivity && b.enforcement_actually_enforced;
}

// ---- NO inheritance: a certified facet is exactly one independently-evidenced identity ----------------------
export function inheritsCertification(): boolean { return false; }
export function versionMatrixPolicy(): VersionMatrixPolicy {
  return { no_version_inheritance: true, no_platform_inheritance: true, no_architecture_inheritance: true, no_channel_inheritance: true, rule: 'one certified facet = one independently evidenced identity; no 2.1.283->2.1.284, Windows->macOS, macOS->Linux, or x64->arm64 inheritance without a future owner-approved rule' };
}

// ---- forbidden automatic lifecycle transitions -------------------------------------------------------------
export function lifecycle(): EnvironmentLifecycle {
  return {
    schema: 'dkskill.certification_environment_lifecycle/1', states: LIFECYCLE_STATES,
    forbidden_auto_transitions: [
      { from: 'EVIDENCE_CAPTURED', to: 'CERTIFIED', reason: 'M4 (with owner review) is the certification authority; capture never auto-certifies' },
      { from: 'EVIDENCE_CAPTURED', to: 'EVIDENCE_VALIDATED', reason: 'validation requires M7/M9 checks, not mere capture' },
      { from: 'CERTIFIED', to: 'PUBLISHED', reason: 'M5/M6 (signed, owner-authorized) is the publication authority; certification never auto-publishes' },
    ],
    destroy_recreate_supported: true,
  };
}
export function isForbiddenAutoTransition(from: LifecycleState, to: LifecycleState): boolean {
  return lifecycle().forbidden_auto_transitions.some((t) => t.from === from && t.to === to);
}

// ---- environment readiness (design-time; never VERIFIED/CERTIFIED) -----------------------------------------
export function assessEnvironment(env: CertificationEnvironment): CertificationEnvironment {
  const reasons: string[] = [];
  let readiness: EnvReadiness;
  if (env.is_current_workstation && env.trust_plane === 'CERTIFICATION_CONTROL_PLANE') { readiness = 'BLOCKED'; reasons.push('the current workstation must NEVER be the certification control plane'); }
  else if (env.trust_plane !== 'CERTIFICATION_TEST_ENVIRONMENT') { readiness = 'BLOCKED'; reasons.push('L4 readiness applies to a dedicated CERTIFICATION_TEST_ENVIRONMENT'); }
  else if (env.is_current_workstation) { readiness = 'BLOCKED'; reasons.push('the current workstation is not a dedicated certification environment; no OS/network change is made to it'); }
  else if (!env.reproducible_identity) { readiness = 'BLOCKED'; reasons.push('reproducible host/binary identity required'); }
  else if (!env.credentials_isolated) { readiness = 'BLOCKED'; reasons.push('credentials must be isolated from developer credentials (no reuse)'); }
  else if (!observerIsIndependent(env.observer)) { readiness = 'BLOCKED'; reasons.push('a genuine independent observer (external, enforcer-distinct, bound, fresh, tamper-evident) is required; host self-report rejected'); }
  else if (!boundaryEstablishesDenial(env.enforcement_boundary)) { readiness = 'BLOCKED'; reasons.push('a minimal enforced outbound-deny boundary demonstrating denied connectivity is required'); }
  else if (env.requires_paid_infrastructure) { readiness = 'REQUIRES_PAID_INFRASTRUCTURE_AUTHORIZATION'; reasons.push('design is valid but real provisioning needs paid infrastructure — STOP pending separate owner confirmation'); }
  else readiness = 'READY_FOR_L4_VERIFICATION';
  return { ...env, readiness, reasons };
}

// ---- threat model -----------------------------------------------------------------------------------------
export function buildThreatModel(): Threat[] {
  const t = (threat_id: string, threat: string, control: string, evidence: string, failure_behavior: string, residual_risk: string): Threat => ({ threat_id, threat, control, evidence, failure_behavior, residual_risk });
  return [
    t('TH-01', 'host self-attestation treated as independent', 'independent observer required (M9); self-report rejected', 'observer independence contract', 'BLOCKED (never L4)', 'observer collusion (mitigated by trust-boundary separation)'),
    t('TH-02', 'compromised test host', 'test host is untrusted by design; enforcement + observation are external', 'external enforcement/observation evidence', 'evidence from a compromised host cannot alone certify; fail closed', 'sophisticated host+observer co-compromise'),
    t('TH-03', 'compromised observer', 'observer distinct from enforcer; tamper-evident, environment-bound', 'tamper-evident provenance', 'contradiction/failed integrity => BLOCKED', 'observer+enforcer co-compromise'),
    t('TH-04', 'compromised enforcement point', 'enforcement distinct from observer; controlled denied-test must be observed', 'controlled-behavior evidence', 'denial not demonstrable => BLOCKED', 'enforcer+observer collusion'),
    t('TH-05', 'stale evidence', 'freshness required (observed_at/expiry/max_age)', 'freshness metadata', 'stale => cannot verify', 'clock skew (bounded)'),
    t('TH-06', 'replayed evidence', 'environment binding + freshness + hash chain', 'nonce/binding + audit chain', 'replay detected => BLOCKED', 'replay within freshness window (bounded)'),
    t('TH-07', 'tampered evidence', 'sha256 hashing + hash-chained audit', 'raw+normalized hashes', 'hash mismatch => BLOCKED', 'hash collision (negligible)'),
    t('TH-08', 'wrong Claude binary', 'exact binary SHA-256 (M8 EP-03)', 'binary identity evidence', 'mismatch => HARD STOP', 'supply-chain of the pinned binary (out of scope)'),
    t('TH-09', 'wrong version', 'exact version (M8 EP-02)', 'version identity', 'mismatch => HARD STOP', 'none material'),
    t('TH-10', 'wrong platform', 'exact platform (M8 EP-04); no cross-platform inference', 'platform identity', 'mismatch => HARD STOP', 'none material'),
    t('TH-11', 'wrong architecture', 'exact architecture (M8 EP-05)', 'arch identity', 'mismatch => HARD STOP', 'none material'),
    t('TH-12', 'credential leakage', 'no secrets persisted; secret-free evidence store', 'secret scan', 'secret detected => reject/redact, fail closed', 'out-of-band leakage (process hygiene)'),
    t('TH-13', 'cross-environment credential reuse', 'per-environment isolated credentials; no copying', 'credential isolation record', 'reuse detected => BLOCKED', 'operator error (procedural)'),
    t('TH-14', 'registry tampering', 'signed, immutable, hash-chained registry (M6)', 'signature + hash chain', 'tamper => rejected', 'signing-key compromise (key mgmt)'),
    t('TH-15', 'unauthorized publication', 'M5/M6 owner-authorized signed publication only', 'authorization + signature', 'unauthorized => rejected', 'authority key compromise'),
    t('TH-16', 'environment substitution', 'environment binding + reproducible identity', 'environment id binding', 'mismatch => BLOCKED', 'identity spoofing (mitigated by binding)'),
    t('TH-17', 'synthetic evidence accidentally promoted', 'synthetic_test_only flag; M5 PG-13 / M6 GG-18 reject synthetic', 'synthetic flag propagation', 'synthetic => cannot publish', 'flag stripping (guarded by tests)'),
    t('TH-18', 'network isolation falsely inferred', 'only M9 L4 independent verification; inference rejected', 'independent verification', 'inference => UNVERIFIED', 'observer collusion'),
    t('TH-19', 'unknown capability treated as verified', 'M0/M3 states preserved; UNKNOWN never upgraded', 'capability state records', 'unknown => not verified', 'none material'),
  ];
}

// ---- scale / cost + public-private boundary ----------------------------------------------------------------
export function scaleModel(): ScaleModel {
  return {
    per_platform_environment: 'one dedicated environment per platform (windows/macos/linux); no shared state',
    per_version_environment: 'one environment per certified Claude Code version/channel facet; no inheritance',
    environment_recreation: 'environments are reproducibly provisioned and destroy/recreate on demand',
    evidence_retention: 'immutable hashed evidence retained privately; public artifacts carry only approved fields',
    credential_isolation: 'per-environment ephemeral credentials, never developer/OAuth credentials, never cross-environment',
    concurrency: 'independent environments may certify concurrently; no shared trust plane',
    audit_retention: 'hash-chained audit retained; never rewritten (revocation/correction appends)',
    cost_boundaries: 'design-only in this phase; real paid infrastructure requires separate owner confirmation (REQUIRES_PAID_INFRASTRUCTURE_AUTHORIZATION)',
  };
}
export function publicPrivateBoundary(): PublicPrivateBoundary {
  return {
    public_items: ['source code', 'capability catalogue', 'approved compatibility profiles', 'signed public registry', 'installation/use instructions'],
    private_items: ['certification credentials', 'certification hosts', 'observer infrastructure', 'private evidence payloads', 'internal audit material', 'benchmark credentials', 'infrastructure secrets', 'private network addresses'],
    rule: 'private material is NEVER placed in the public repository; public compatibility artifacts contain only owner-approved published fields',
  };
}
export function isPubliclyShareable(item: string): boolean { return publicPrivateBoundary().public_items.includes(item); }

// ---- observer / evidence-store / boundary reference designs -------------------------------------------------
export function referenceObserver(): CertificationObserver {
  return {
    schema: 'dkskill.certification_observer/1', observer_id: 'obs-external-control-plane', identity: 'external-control-plane',
    enforcement_identity: 'network-egress-enforcer', trust_plane: 'CERTIFICATION_CONTROL_PLANE', external_to_certified_host: true,
    is_host_self_report: false, observation_path: 'control-plane observes egress attempts from the certified environment',
    evidence_path: 'observations -> hashed evidence -> EVIDENCE_STORE', environment_bound: true, freshness_established: true,
    tamper_evident: true, provenance: 'control-plane attestation with environment binding + timestamps',
    failure_behavior: 'unavailable/contradictory observation => BLOCKED (fail closed); never inferred',
  };
}
export function referenceEvidenceStore(): EvidenceStore {
  return { schema: 'dkskill.certification_evidence_store/1', store_id: 'evidence-store-private', trust_plane: 'EVIDENCE_STORE', hashing: 'sha256', tamper_detection: true, freshness_tracking: true, environment_binding: true, secret_free: true, retention_policy: 'immutable; append-only; private', visibility: 'PRIVATE' };
}
function reproEnv(id: string, platform: Platform, arch: string, requiresPaid = true): CertificationEnvironment {
  const boundary: EnforcementBoundary = { schema: 'dkskill.certification_enforcement_boundary/1', boundary_id: `bnd-${id}`, kind: 'INFRA_EGRESS', enforcement_identity: 'network-egress-enforcer', establishable: true, minimal: true, requires_overbroad_change: false, demonstrates_denied_connectivity: true, enforcement_actually_enforced: true };
  return assessEnvironment({ schema: 'dkskill.certification_environment/1', environment_id: id, trust_plane: 'CERTIFICATION_TEST_ENVIRONMENT', platform, architecture: arch, channel: 'native', claude_code_version: null, binary_sha256: null, reproducible_identity: true, credentials_isolated: true, is_current_workstation: false, requires_paid_infrastructure: requiresPaid, observer: referenceObserver(), enforcement_boundary: boundary, lifecycle_state: 'PROVISIONED', readiness: 'BLOCKED', reasons: [] });
}

// ---- the reference infrastructure plan (deterministic) -----------------------------------------------------
export function buildInfrastructurePlan(): CertificationInfrastructurePlan {
  const environment_templates = [
    reproEnv('cert-win-x64', 'windows', 'x64'),
    reproEnv('cert-macos-arm64', 'macos', 'arm64'),
    reproEnv('cert-linux-x64', 'linux', 'x64'),
  ];
  const anyPaid = environment_templates.some((e) => e.requires_paid_infrastructure);
  const base: Omit<CertificationInfrastructurePlan, 'audit_hash'> = {
    schema: 'dkskill.certification_infrastructure/1', version: 1, synthetic_test_only: true, plan_id: 'dkskill-cert-infra-plan',
    infrastructure_status: 'DESIGN_VALIDATED',
    provisioning_status: anyPaid ? 'REQUIRES_PAID_INFRASTRUCTURE_AUTHORIZATION' : 'PLANNED',
    trust_planes: TRUST_PLANES, environment_templates, observer_architecture: referenceObserver(), evidence_store: referenceEvidenceStore(),
    lifecycle: lifecycle(), version_matrix_policy: versionMatrixPolicy(), threat_model: buildThreatModel(), scale_model: scaleModel(),
    public_private_boundary: publicPrivateBoundary(), supported_platforms: SUPPORTED_PLATFORMS,
    current_workstation_role: 'PTPL-DK-BENCH-WIN-01 is NOT a control plane and is not modified; it remains UNVERIFIED',
    l4_readiness_current_host: 'BLOCKED', m8_state: 'EXECUTION_BLOCKED', m9_state: 'UNVERIFIED', certified_profiles: 0, publication: 'NONE',
    reasons: ['design validated; real provisioning requires separate paid-infrastructure authorization; nothing certified or published; current host unchanged'],
  };
  return { ...base, audit_hash: sha256(canonicalJson(base)) };
}

// ---- adapters (fail-closed; design NEVER emits VERIFIED/CERTIFIED/ALLOWED) ----------------------------------
export function infraToM9(): 'UNVERIFIED' { return 'UNVERIFIED'; }
export function infraToM8(): 'UNVERIFIED' { return 'UNVERIFIED'; }
export function infraToM4(): 'NOT_CERTIFIED' { return 'NOT_CERTIFIED'; }

// ---- audit chain ------------------------------------------------------------------------------------------
export function auditRecordHash(rec: Omit<InfrastructureAudit, 'record_hash'>): string { return sha256(canonicalJson(rec)); }
export function buildAuditRecord(plan: CertificationInfrastructurePlan, now: string, previous_record_hash: string | null = null): InfrastructureAudit {
  const base: Omit<InfrastructureAudit, 'record_hash'> = {
    schema: 'dkskill.certification_infrastructure_audit/1', version: 1, audit_id: `audit-${plan.plan_id}`, plan_id: plan.plan_id,
    infrastructure_status: plan.infrastructure_status, provisioning_status: plan.provisioning_status,
    environments: plan.environment_templates.length, threats: plan.threat_model.length, certified_profiles: 0, timestamp: now, previous_record_hash,
  };
  return { ...base, record_hash: auditRecordHash(base) };
}
export function chainAuditRecords(records: Omit<InfrastructureAudit, 'record_hash' | 'previous_record_hash'>[]): InfrastructureAudit[] {
  const out: InfrastructureAudit[] = []; let prev: string | null = null;
  for (const r of records) { const b = { ...r, previous_record_hash: prev } as Omit<InfrastructureAudit, 'record_hash'>; const record_hash = auditRecordHash(b); out.push({ ...b, record_hash }); prev = record_hash; }
  return out;
}
export function verifyAuditChain(records: InfrastructureAudit[]): boolean {
  let prev: string | null = null;
  for (const r of records) { if (r.previous_record_hash !== prev) return false; const { record_hash, ...rest } = r; if (auditRecordHash(rest) !== record_hash) return false; prev = record_hash!; }
  return true;
}
