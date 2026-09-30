// M9 — Network-Isolation Verification engine. Deterministic, READ-ONLY, OFFLINE, FAIL-CLOSED.
// It performs NO live network contact and NO system/network configuration change: it is a pure function over
// supplied observation records. Only L4 (INDEPENDENT_VERIFICATION), FRESH, in-scope, contradiction-free evidence
// yields VERIFIED. Configuration/claim/host-state/controlled-behavior alone can never reach VERIFIED. The current
// environment stays UNVERIFIED (no L4 evidence exists) and M8 stays EXECUTION_BLOCKED. It never modifies M8.
import { sha256, canonicalJson } from '../src/canonical.ts';
import type { HostIdentity } from './hcl-types.ts';
import type {
  NetworkIsolationRequest, NetworkIsolationObservation, NetworkIsolationEvidence, NetworkIsolationVerification,
  NetworkIsolationAudit, VerificationLevel, VerificationState, FreshnessState, M8NetworkResult, IsolationScope,
  MechanismAssessment, WindowsMechanism,
} from './network-isolation-types.ts';

export const FROZEN_ENVIRONMENT = 'PTPL-DK-BENCH-WIN-01';
export const FROZEN_HOST: HostIdentity = { product: 'claude-code', version: '2.1.283', platform: 'win32', architecture: 'x64', channel: 'native', binary_sha256: '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A', executable_source: 'native' };
export const WINDOWS_MECHANISMS: WindowsMechanism[] = [
  'WINDOWS_FIREWALL_STATE', 'FIREWALL_PROFILES', 'EFFECTIVE_FIREWALL_RULES', 'NETWORK_ADAPTER_STATE', 'ROUTING_STATE',
  'ACTIVE_CONNECTIONS', 'DNS_CONFIG', 'PROXY_CONFIG', 'PROCESS_NETWORK_ASSOCIATION', 'OS_NETWORK_POLICY',
  'EXTERNAL_CONNECTION_ATTEMPTS', 'ISOLATED_ENV_CONTROLS',
];
const LEVEL_RANK: Record<VerificationLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };
const SECRET_RE = /(sk-[a-z0-9]{6}|eyJ[a-zA-Z0-9_-]{6,}\.[a-zA-Z0-9_-]{6,}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|access_token=|refresh_token=|api[_-]?key=|bearer\s+[a-z0-9]{6}|xoxb-[a-z0-9-]+|password=)/i;
export function containsSecret(v: unknown): boolean {
  if (typeof v === 'string') return SECRET_RE.test(v);
  if (Array.isArray(v)) return v.some(containsSecret);
  if (v !== null && typeof v === 'object') return Object.values(v as Record<string, unknown>).some(containsSecret);
  return false;
}

// ---- freshness --------------------------------------------------------------------------------------------
export function assessFreshness(observed_at: string | null, expires_at: string | null, max_age_ms: number | null, now: string): FreshnessState {
  if (!observed_at) return 'UNKNOWN';
  const t = Date.parse(observed_at), n = Date.parse(now);
  if (Number.isNaN(t) || Number.isNaN(n)) return 'UNKNOWN';
  if (expires_at) { const e = Date.parse(expires_at); if (!Number.isNaN(e) && n >= e) return 'EXPIRED'; }
  if (max_age_ms != null && n - t > max_age_ms) return 'STALE';
  return 'FRESH';
}

// ---- normalize an observation into hashed, scoped evidence -------------------------------------------------
export function toEvidence(req: NetworkIsolationRequest, obs: NetworkIsolationObservation, now: string): NetworkIsolationEvidence {
  const freshness = obs.revoked ? 'UNKNOWN' : assessFreshness(obs.observed_at, obs.expires_at, obs.max_age_ms, now);
  const applicable = obs.environment_id === req.environment_id && (obs.host_id == null || obs.host_id === req.host_identity.binary_sha256) &&
    (obs.os == null || obs.os === req.os) && (obs.architecture == null || obs.architecture === req.architecture);
  // A claim proves at most its own scope; it never proves a broader scope than requested.
  const in_scope = obs.scope === req.requested_scope || scopeSubsumes(req.requested_scope, obs.scope);
  const raw_hash = sha256(canonicalJson({ mechanism: obs.mechanism, claim: obs.claim, source: obs.source, observed_at: obs.observed_at }));
  const normalized_hash = sha256(canonicalJson({ ...obs }));
  return { schema: 'dkskill.network_isolation_evidence/1', evidence_id: `evi_${obs.observation_id}`, observation: obs, freshness, raw_hash, normalized_hash, in_scope, applicable };
}
// requested scope is satisfiable by an observation scope only when the observation is at least as strong / same.
function scopeSubsumes(requested: IsolationScope, observed: IsolationScope): boolean {
  if (requested === observed) return true;
  // A HOST_ONLY / OUTBOUND_DENY host-wide proof subsumes a PROCESS_ONLY / ENVIRONMENT_ONLY request.
  const strong: IsolationScope[] = ['HOST_ONLY', 'NETWORK_NAMESPACE', 'OUTBOUND_DENY'];
  const weakRequests: IsolationScope[] = ['PROCESS_ONLY', 'ENVIRONMENT_ONLY'];
  return strong.includes(observed) && weakRequests.includes(requested);
}

// ---- contradiction detection (never pick the favorable observation) ---------------------------------------
export function detectContradictions(items: NetworkIsolationEvidence[]): string[] {
  const out: string[] = [];
  const fresh = items.filter((i) => i.freshness === 'FRESH' && i.applicable);
  const isolationClaims = fresh.filter((i) => i.observation.signal === 'ISOLATION_SUPPORTING');
  const leaks = fresh.filter((i) => i.observation.signal === 'LEAK_OBSERVED' || i.observation.signal === 'UNKNOWN_TRAFFIC');
  if (isolationClaims.length && leaks.length) out.push(`CONTRADICTION: isolation claimed (${isolationClaims.map((i) => i.observation.observation_id).join(',')}) but leak/unknown traffic observed (${leaks.map((i) => i.observation.observation_id).join(',')})`);
  // conflicting policies of the same class with opposite signals
  if (fresh.some((i) => i.observation.evidence_class === 'CONFIGURATION_EVIDENCE' && i.observation.signal === 'ISOLATION_SUPPORTING') &&
      fresh.some((i) => i.observation.evidence_class === 'CONFIGURATION_EVIDENCE' && i.observation.signal === 'LEAK_OBSERVED')) out.push('CONTRADICTION: conflicting firewall/policy configurations');
  return out;
}

// ---- achieved level ---------------------------------------------------------------------------------------
export function achievedLevel(items: NetworkIsolationEvidence[]): VerificationLevel {
  let best: VerificationLevel = 'L0';
  for (const i of items) {
    const o = i.observation;
    const counts = i.applicable && i.in_scope && i.freshness === 'FRESH' && (o.result === 'OBSERVED' || o.result === 'SUPPORTED') && o.signal === 'ISOLATION_SUPPORTING' && !o.revoked;
    // L4 requires INDEPENDENT_VERIFICATION with an OBSERVED result.
    const level = counts ? (o.evidence_class === 'INDEPENDENT_VERIFICATION' && o.result === 'OBSERVED' ? 'L4' : o.level) : 'L0';
    if (o.evidence_class === 'INDEPENDENT_VERIFICATION' && (!counts || o.result !== 'OBSERVED')) continue;
    if (LEVEL_RANK[level] > LEVEL_RANK[best]) best = level;
  }
  return best;
}

// ---- strict verification predicate ------------------------------------------------------------------------
export function networkIsolationVerified(items: NetworkIsolationEvidence[]): boolean {
  if (detectContradictions(items).length) return false;
  const l4 = items.find((i) => i.observation.evidence_class === 'INDEPENDENT_VERIFICATION' && i.observation.result === 'OBSERVED' && i.applicable && i.in_scope && i.freshness === 'FRESH' && i.observation.signal === 'ISOLATION_SUPPORTING' && !i.observation.revoked);
  return !!l4 && achievedLevel(items) === 'L4';
}

// ---- mechanism assessment (deterministic; UNKNOWN unless independently observed) ---------------------------
export function assessMechanisms(items: NetworkIsolationEvidence[]): MechanismAssessment[] {
  return WINDOWS_MECHANISMS.map((m) => {
    const it = items.find((i) => i.observation.mechanism === m && i.applicable);
    if (!it) return { mechanism: m, result: 'UNKNOWN', note: 'not independently observed; requires future authorized read-only collection' };
    return { mechanism: m, result: it.observation.result, note: `${it.observation.evidence_class}/${it.freshness}/${it.observation.signal}` };
  });
}

// ---- verification (fail-closed) ---------------------------------------------------------------------------
export function runVerification(input: {
  request: NetworkIsolationRequest; observations: NetworkIsolationObservation[]; now: string; verifier?: string | null;
  synthetic_test_only?: boolean; method?: string;
}): NetworkIsolationVerification {
  const { request: req } = input;
  const items = input.observations.map((o) => toEvidence(req, o, input.now));
  const contradictions = detectContradictions(items);
  const level = achievedLevel(items);
  const reasons: string[] = [];

  const revoked = items.some((i) => i.observation.revoked);
  const anyExpired = items.some((i) => i.observation.evidence_class === 'INDEPENDENT_VERIFICATION' && i.freshness === 'EXPIRED');
  const anyFailedSource = items.some((i) => i.observation.result === 'UNSUPPORTED' && i.observation.evidence_class === 'INDEPENDENT_VERIFICATION');
  const verified = networkIsolationVerified(items);

  let state: VerificationState;
  let network_isolation: M8NetworkResult;
  if (revoked) { state = 'REVOKED'; network_isolation = 'UNVERIFIED'; reasons.push('evidence revoked'); }
  else if (anyExpired) { state = 'EXPIRED'; network_isolation = 'UNVERIFIED'; reasons.push('independent evidence expired'); }
  else if (contradictions.length) { state = 'BLOCKED'; network_isolation = 'BLOCKED'; reasons.push(...contradictions); }
  else if (anyFailedSource) { state = 'FAILED'; network_isolation = 'FAILED'; reasons.push('independent verification source reported UNSUPPORTED'); }
  else if (verified) { state = 'VERIFIED'; network_isolation = 'VERIFIED'; reasons.push('L4 independent verification: OBSERVED, FRESH, in-scope, no contradictions'); }
  else { state = 'UNVERIFIED'; network_isolation = 'UNVERIFIED'; reasons.push(`achieved_level=${level}; L4 independent verification absent — configuration/claim/host-state/controlled-behavior alone are insufficient`); }

  // proven scope never exceeds the strongest fresh, in-scope, isolation-supporting evidence.
  const provenScope = verified ? (items.find((i) => i.observation.evidence_class === 'INDEPENDENT_VERIFICATION' && i.freshness === 'FRESH' && i.observation.signal === 'ISOLATION_SUPPORTING')?.observation.scope ?? null) : null;

  const base: Omit<NetworkIsolationVerification, 'audit_hash'> = {
    schema: 'dkskill.network_isolation_verification/1', version: 1, synthetic_test_only: input.synthetic_test_only ?? false,
    verification_id: `verif-${req.request_id}`, environment_id: req.environment_id, host_identity: req.host_identity,
    os: req.os, architecture: req.architecture, verification_method: input.method ?? 'read-only offline evidence assessment (no live probe)',
    observation_source: items.length ? 'supplied-observations' : 'none', observation_timestamp: input.now,
    requested_scope: req.requested_scope, proven_scope: provenScope, achieved_level: level,
    freshness_state: items.length ? worstFreshness(items) : 'UNKNOWN', evidence_items: items,
    evidence_hashes: items.map((i) => i.normalized_hash), mechanisms_evaluated: assessMechanisms(items),
    contradictions, limitations: buildLimitations(level, provenScope, req.requested_scope),
    verifier: input.verifier ?? null, state, network_isolation, reasons,
  };
  return { ...base, audit_hash: sha256(canonicalJson(base)) };
}
function worstFreshness(items: NetworkIsolationEvidence[]): FreshnessState {
  const order: FreshnessState[] = ['EXPIRED', 'STALE', 'UNKNOWN', 'FRESH'];
  for (const f of order) if (items.some((i) => i.freshness === f)) return f;
  return 'UNKNOWN';
}
function buildLimitations(level: VerificationLevel, proven: IsolationScope | null, requested: IsolationScope): string[] {
  const l: string[] = [];
  if (level !== 'L4') l.push('No L4 independent verification present; host-level network isolation remains UNVERIFIED.');
  if (proven && proven !== requested) l.push(`Proven scope is ${proven}; the requested scope ${requested} is not fully proven.`);
  if (level === 'L1') l.push('Configuration evidence only: the verifier may be observing its own configuration (not independent).');
  return l;
}

// ---- M8 adapter (pure, fail-closed; only VERIFIED satisfies EP-13) -----------------------------------------
export function networkIsolationToM8Gate(v: NetworkIsolationVerification): M8NetworkResult {
  // Fail closed: any state other than VERIFIED keeps M8 EXECUTION_BLOCKED. Never auto-authorizes execution.
  return v.state === 'VERIFIED' && v.network_isolation === 'VERIFIED' ? 'VERIFIED' : (v.network_isolation === 'BLOCKED' ? 'BLOCKED' : v.network_isolation === 'FAILED' ? 'FAILED' : 'UNVERIFIED');
}

// ---- immutable hash-chained audit -------------------------------------------------------------------------
export function auditRecordHash(rec: Omit<NetworkIsolationAudit, 'record_hash'>): string { return sha256(canonicalJson(rec)); }
export function buildAuditRecord(v: NetworkIsolationVerification, now: string, previous_record_hash: string | null = null): NetworkIsolationAudit {
  const base: Omit<NetworkIsolationAudit, 'record_hash'> = {
    schema: 'dkskill.network_isolation_audit/1', version: 1, audit_id: `audit-${v.verification_id}`, verification_id: v.verification_id,
    environment_id: v.environment_id, state: v.state, network_isolation: v.network_isolation, achieved_level: v.achieved_level,
    evidence_hashes: v.evidence_hashes, timestamp: now, previous_record_hash,
  };
  return { ...base, record_hash: auditRecordHash(base) };
}
export function chainAuditRecords(records: Omit<NetworkIsolationAudit, 'record_hash' | 'previous_record_hash'>[]): NetworkIsolationAudit[] {
  const out: NetworkIsolationAudit[] = []; let prev: string | null = null;
  for (const r of records) { const base = { ...r, previous_record_hash: prev } as Omit<NetworkIsolationAudit, 'record_hash'>; const record_hash = auditRecordHash(base); out.push({ ...base, record_hash }); prev = record_hash; }
  return out;
}
export function verifyAuditChain(records: NetworkIsolationAudit[]): boolean {
  let prev: string | null = null;
  for (const r of records) { if (r.previous_record_hash !== prev) return false; const { record_hash, ...rest } = r; if (auditRecordHash(rest) !== record_hash) return false; prev = record_hash!; }
  return true;
}
