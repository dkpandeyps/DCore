// M7 — Certification Evidence Acquisition & Real-Host Validation Orchestration engine.
// Deterministic, repository-side, FAIL-CLOSED. It PRODUCES evidence for M4 to consume; it NEVER certifies,
// publishes, mutates the production registry, authorizes/executes Run A, spends budget, executes Claude, or
// authenticates. Execution defaults to EXECUTION_DISABLED / DRY_RUN. UNKNOWN stays UNKNOWN; INCOMPLETE stays
// INCOMPLETE; expired/revoked evidence cannot satisfy certification. M3 remains the identity/profile authority;
// M4 remains the certification authority. Synthetic fixtures can never become real evidence.
import { sha256, canonicalJson } from '../src/canonical.ts';
import { resolveProfile, staticIdentityProbe } from './hcl.ts';
import { buildRegistry, type Registry } from '../tools/gen-compatibility-registry.ts';
import { chainEvidence, type CertificationResult } from '../compatibility/certification.ts';
import type { EvidenceRecord } from './certification-types.ts';
import type { HostIdentity } from './hcl-types.ts';
import type {
  EvidenceClass, EvidenceScope, EvidenceAuthorization, EvidenceEnvironment, EvidenceRequest, EvidenceArtifact,
  EvidenceProvenance, NormalizedEvidence, NormalizedEvent, EvidenceAssertion, EvidenceItem, EvidencePackage,
  EvidenceSession, Precheck, PrecheckOutcome, EvidenceStatus, CompletenessState, Ts07Status, Ts11Result,
  AssertionState, SessionPlan, ExecutionResult, ExecutionMode, StopCondition, EvidenceFailure, ValidityStatus,
} from './evidence-types.ts';

export const EVIDENCE_CLASSES: EvidenceClass[] = [
  'EV-HOST-IDENTITY', 'EV-BINARY-IDENTITY', 'EV-VERSION', 'EV-PLATFORM', 'EV-ARCHITECTURE', 'EV-CHANNEL',
  'EV-HOOK-PROTOCOL', 'EV-STREAM-SCHEMA', 'EV-ATTRIBUTION', 'EV-SETTINGS', 'EV-PERMISSION-MODES', 'EV-CAPABILITY',
  'EV-BEHAVIORAL-COMPARISON', 'EV-TS07', 'EV-TS11', 'EV-ENVIRONMENT', 'EV-AUTHORIZATION', 'EV-NETWORK', 'EV-TOOLCHAIN',
];

// Secret detection: never persist secrets. Matches API keys, JWTs, private keys, tokens, cookies, bearer.
const SECRET_RE = /(sk-[a-z0-9]{6}|eyJ[a-zA-Z0-9_-]{6,}\.[a-zA-Z0-9_-]{6,}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|access_token|refresh_token|api[_-]?key|"?cookie"?\s*[:=]|bearer\s+[a-z0-9]{6}|xoxb-[a-z0-9-]+)/i;
export function containsSecret(value: unknown): boolean {
  return SECRET_RE.test(typeof value === 'string' ? value : JSON.stringify(value ?? null));
}
// Deterministic redaction: replaces secret-bearing substrings with a marker, recording THAT it happened.
export function redact(value: unknown): { redacted: unknown; redactions: string[] } {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  if (!SECRET_RE.test(s)) return { redacted: value, redactions: [] };
  const out = s.replace(new RegExp(SECRET_RE.source, 'gi'), '[REDACTED_SECRET]');
  const redacted = typeof value === 'string' ? out : safeParse(out);
  return { redacted, redactions: ['REDACTED:secret-pattern-detected-and-removed-before-persistence'] };
}
function safeParse(s: string): unknown { try { return JSON.parse(s); } catch { return s; } }

// ---- request (exact, scoped; identity change invalidates it) ----------------------------------------------
export function requestHash(req: Omit<EvidenceRequest, 'request_hash'>): string { return sha256(canonicalJson(req)); }
export function buildEvidenceRequest(input: {
  request_id: string; identity: HostIdentity; profile_id: string; scope: EvidenceScope; environment_id: string;
  authorization_ref: string | null; clock: () => string; expires_at?: string | null;
}): EvidenceRequest {
  const base: Omit<EvidenceRequest, 'request_hash'> = {
    schema: 'dkskill.evidence_request/1', version: 1, request_id: input.request_id,
    target_host_identity: input.identity, target_profile_id: input.profile_id,
    target_version: input.identity.version, target_binary_sha256: input.identity.binary_sha256,
    target_platform: input.identity.platform, target_architecture: input.identity.architecture,
    target_channel: input.identity.channel, scope: input.scope, environment_id: input.environment_id,
    authorization_ref: input.authorization_ref, requested_at: input.clock(), expires_at: input.expires_at ?? null,
  };
  return { ...base, request_hash: requestHash(base) };
}
export function verifyRequest(req: EvidenceRequest): boolean {
  const { request_hash, ...rest } = req;
  return requestHash(rest) === request_hash;
}

// ---- authorization scope (disjoint; no Run A / publication reuse) ------------------------------------------
export function checkAuthorizationScope(auth: EvidenceAuthorization | null, req: EvidenceRequest): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!auth) return { ok: false, reasons: ['NO_AUTHORIZATION'] };
  if (auth.scope !== 'EVIDENCE_ACQUISITION') reasons.push(`SCOPE_NOT_EVIDENCE_ACQUISITION:${auth.scope}`);
  if (auth.authorizes_run_a as boolean) reasons.push('RUN_A_AUTHORIZATION_REUSE_REJECTED');
  if (auth.authorizes_publication as boolean) reasons.push('PUBLICATION_AUTHORIZATION_REUSE_REJECTED');
  if (auth.authorized_target !== req.target_profile_id) reasons.push('TARGET_MISMATCH');
  if (auth.authorized_environment !== req.environment_id) reasons.push('ENVIRONMENT_MISMATCH');
  const missingTests = req.scope.required_test_ids.filter((t) => !auth.authorized_tests.includes(t));
  if (missingTests.length) reasons.push(`TEST_SCOPE_MISMATCH:${missingTests.join(',')}`);
  return { ok: reasons.length === 0, reasons };
}

// ---- M3 boundary: identity/profile resolution is the authority; block on anything but a clean EXACT_MATCH --
export function m3EvidenceGate(identity: HostIdentity, registry: Registry = buildRegistry()): { allowed: boolean; resolution: string; reasons: string[] } {
  const probe = staticIdentityProbe(identity);
  if (probe.identity_status !== 'IDENTIFIED') return { allowed: false, resolution: `UNIDENTIFIED:${probe.identity_status}`, reasons: [`MISSING:${probe.missing_fields.join(',') || 'none'}`] };
  const res = resolveProfile(probe.identity, registry);
  const allowed = res.state === 'EXACT_MATCH';
  return { allowed, resolution: res.state, reasons: allowed ? [] : [`M3_${res.state}_NO_EXCEPTION`] };
}

// ---- session prechecks (SP-01..15, fail-closed; no implicit PASS) -----------------------------------------
export function runPrechecks(input: {
  request: EvidenceRequest; environment: EvidenceEnvironment; authorization: EvidenceAuthorization | null; registry?: Registry;
}): Precheck[] {
  const { request: r, environment: e, authorization: a } = input;
  const out: Precheck[] = [];
  const p = (gate_id: string, name: string, ok: boolean, blockReason?: string, reasons: string[] = []) =>
    out.push({ gate_id, name, result: ok ? 'PASS' : (blockReason ? 'BLOCKED' : 'FAIL'), reasons: ok ? [] : (reasons.length ? reasons : [blockReason ?? 'FAIL']) });
  const idHasBinary = !!r.target_binary_sha256 && !!e.binary_sha256;
  p('SP-01', 'exact binary present', !!e.binary_sha256, 'no binary identity');
  p('SP-02', 'exact binary SHA-256', idHasBinary && r.target_binary_sha256!.toUpperCase() === e.binary_sha256!.toUpperCase(), undefined, ['binary sha256 mismatch or absent']);
  p('SP-03', 'exact version', !!r.target_version && r.target_version === e.claude_code_version, undefined, ['version mismatch or absent']);
  p('SP-04', 'exact platform', !!r.target_platform && r.target_platform === e.platform, undefined, ['platform mismatch or absent']);
  p('SP-05', 'exact architecture', !!r.target_architecture && r.target_architecture === e.architecture, undefined, ['architecture mismatch or absent']);
  p('SP-06', 'exact channel', !!r.target_channel && r.target_channel === (r.target_host_identity.channel ?? r.target_channel), undefined, ['channel mismatch or absent']);
  p('SP-07', 'exact environment identity', r.environment_id === e.environment_id, undefined, ['environment id mismatch']);
  p('SP-08', 'isolation evidence', !!e.isolation_evidence, 'no isolation evidence');
  p('SP-09', 'credential-state safety', !containsSecret(e.credential_reference) && !containsSecret(e.credential_state), undefined, ['credential material must be a redacted reference, never a secret']);
  p('SP-10', 'network-state evidence', e.network_isolation_status != null, 'network state not evaluated');
  p('SP-11', 'toolchain identity', !!e.toolchain_identity, 'no toolchain identity');
  p('SP-12', 'requested evidence scope', r.scope.required_evidence_classes.length > 0, undefined, ['empty evidence scope']);
  const scope = checkAuthorizationScope(a, r);
  p('SP-13', 'authorization scope', scope.ok, undefined, scope.reasons);
  p('SP-14', 'no Run A authorization', !a || (a.authorizes_run_a as boolean) === false, undefined, ['Run A authorization present — rejected']);
  p('SP-15', 'no production publication authorization', !a || ((a.authorizes_publication as boolean) === false && a.scope !== 'PUBLICATION' && a.scope !== 'REGISTRY_MUTATION'), undefined, ['publication/registry authorization present — rejected']);
  return out;
}
export function prechecksReady(prechecks: Precheck[]): boolean { return prechecks.every((c) => c.result === 'PASS'); }

// ---- raw evidence (immutable; secret-safe) ----------------------------------------------------------------
export function rawContentHash(content: unknown): string { return sha256(canonicalJson(content)); }
export function captureRawEvidence(input: {
  evidence_id: string; evidence_class: EvidenceClass; evidence_type: string; content: unknown; source: string;
  environment_id: string; host_identity: HostIdentity; authorization_ref: string | null; allow_redaction: boolean;
  clock: () => string; producer?: string;
}): { ok: boolean; artifact?: EvidenceArtifact; failure?: EvidenceFailure } {
  let stored = input.content;
  let redaction_status: 'NONE' | 'REDACTED' = 'NONE';
  let redactions: string[] = [];
  if (containsSecret(input.content)) {
    if (!input.allow_redaction) return { ok: false, failure: { code: 'SECRET_DETECTED', message: 'raw evidence contains a secret and redaction is not permitted; capture fails closed', fail_closed: true } };
    const r = redact(input.content);
    stored = r.redacted; redactions = r.redactions; redaction_status = 'REDACTED';
    if (containsSecret(stored)) return { ok: false, failure: { code: 'REDACTION_INCOMPLETE', message: 'secret survived redaction; capture fails closed', fail_closed: true } };
  }
  const content_hash = rawContentHash(stored);
  const provenance: EvidenceProvenance = {
    who: input.authorization_ref ? `authorized:${input.authorization_ref}` : 'unauthorized', what: input.producer ?? 'M7-evidence-capture',
    when: input.clock(), where: input.environment_id, from_binary: input.host_identity.binary_sha256,
    from_environment: input.environment_id, under_authorization: input.authorization_ref, from_raw_artifact: input.evidence_id,
    raw_hash: content_hash, normalization_method: null, normalized_hash: null,
  };
  const artifact: EvidenceArtifact = {
    schema: 'dkskill.certification_evidence/1', evidence_id: input.evidence_id, evidence_class: input.evidence_class,
    evidence_type: input.evidence_type, capture_timestamp: input.clock(), content_hash,
    byte_length: typeof stored === 'string' ? stored.length : canonicalJson(stored).length, source: input.source,
    environment_id: input.environment_id, host_identity: input.host_identity, binary_identity: input.host_identity.binary_sha256,
    provenance, redaction_status, redactions, stored_content: stored, validity: 'VALID',
  };
  return { ok: true, artifact };
}

// ---- normalization (deterministic; never upgrades UNKNOWN/MALFORMED) ---------------------------------------
export function normalizeEvidence(artifact: EvidenceArtifact, events: any[]): NormalizedEvidence {
  const normalized: NormalizedEvent[] = events.map((ev, index) => {
    if (ev == null || typeof ev !== 'object' || ev.malformed === true) return { index, kind: 'MALFORMED', raw_type: ev?.type ?? null, status: 'MALFORMED', attribution_result: null, permission_result: null };
    if (ev.unknown === true || ev.known === false) return { index, kind: 'UNKNOWN', raw_type: ev.type ?? null, status: 'UNKNOWN', attribution_result: ev.attribution ?? null, permission_result: ev.permission ?? null };
    return { index, kind: ev.type ?? 'event', raw_type: ev.type ?? null, status: 'NORMALIZED', attribution_result: ev.attribution ?? null, permission_result: ev.permission ?? null };
  });
  const base: Omit<NormalizedEvidence, 'normalized_hash'> = {
    schema: 'dkskill.evidence_normalized/1', raw_evidence_id: artifact.evidence_id, raw_hash: artifact.content_hash,
    events: normalized,
    attribution_results: normalized.map((n) => n.attribution_result).filter((x): x is string => !!x),
    permission_results: normalized.map((n) => n.permission_result).filter((x): x is string => !!x),
    unknown_count: normalized.filter((n) => n.status === 'UNKNOWN').length,
    malformed_count: normalized.filter((n) => n.status === 'MALFORMED').length,
  };
  return { ...base, normalized_hash: sha256(canonicalJson(base)) };
}

// ---- assertions (UNKNOWN never becomes SUPPORTED by inference) ---------------------------------------------
export function evaluateAssertion(input: {
  assertion_id: string; evidence_class: EvidenceClass; claim: string; item: EvidenceItem | null;
}): EvidenceAssertion {
  const { assertion_id, evidence_class, claim, item } = input;
  if (!item || !item.artifact) return { assertion_id, evidence_class, claim, state: 'UNKNOWN', supporting_evidence: [], provenance_ref: null, reason: 'no evidence acquired' };
  if (item.status === 'INVALID') return { assertion_id, evidence_class, claim, state: 'CONTRADICTED', supporting_evidence: [item.artifact.evidence_id], provenance_ref: item.artifact.evidence_id, reason: 'evidence invalid/contradicted' };
  if (item.status === 'VALID') return { assertion_id, evidence_class, claim, state: 'SUPPORTED', supporting_evidence: [item.artifact.evidence_id], provenance_ref: item.artifact.evidence_id, reason: 'validated evidence supports claim' };
  if (item.status === 'INCOMPLETE') return { assertion_id, evidence_class, claim, state: 'UNSUPPORTED', supporting_evidence: [item.artifact.evidence_id], provenance_ref: item.artifact.evidence_id, reason: 'evidence incomplete' };
  return { assertion_id, evidence_class, claim, state: 'UNKNOWN', supporting_evidence: [], provenance_ref: null, reason: `status=${item.status}` };
}

// ---- provenance validation --------------------------------------------------------------------------------
export function validateProvenance(artifact: EvidenceArtifact): boolean {
  const p = artifact.provenance;
  return !!p.who && !!p.what && !!p.when && !!p.where && p.from_environment === artifact.environment_id &&
    p.from_raw_artifact === artifact.evidence_id && p.raw_hash === artifact.content_hash && p.from_binary === artifact.binary_identity;
}

// ---- per-item validation (fail-closed) --------------------------------------------------------------------
export function validateItem(item: EvidenceItem): EvidenceStatus {
  const a = item.artifact;
  if (!a) return 'INCOMPLETE';
  if (a.validity === 'EXPIRED') return 'EXPIRED';
  if (a.validity === 'REVOKED') return 'REVOKED';
  if (containsSecret(a.stored_content)) return 'INVALID';
  if (rawContentHash(a.stored_content) !== a.content_hash) return 'INVALID';
  if (!validateProvenance(a)) return 'INVALID';
  if (item.normalized) {
    const { normalized_hash, ...rest } = item.normalized;
    if (sha256(canonicalJson(rest)) !== normalized_hash) return 'INVALID';
    if (item.normalized.raw_hash !== a.content_hash) return 'INVALID';
  }
  return 'VALID';
}

// ---- completeness (explicit; TS-07 / TS-11 status surfaced) ------------------------------------------------
export function evaluateCompleteness(required: EvidenceClass[], items: EvidenceItem[]): {
  state: CompletenessState; missing: EvidenceClass[]; ts07: Ts07Status; ts11: Ts11Result;
} {
  const byClass = new Map(items.map((i) => [i.evidence_class, i]));
  const invalid = items.some((i) => i.status === 'INVALID');
  const missing = required.filter((c) => { const it = byClass.get(c); return !it || it.status !== 'VALID'; });
  const ts07Item = byClass.get('EV-TS07');
  const ts07: Ts07Status = !ts07Item || !ts07Item.artifact ? 'UNRESOLVED' : ts07Item.status === 'VALID' ? 'VALID' : (ts07Item.status === 'BLOCKED' ? 'BLOCKED' : 'INCOMPLETE');
  const ts11Item = byClass.get('EV-TS11');
  let ts11: Ts11Result;
  if (!required.includes('EV-TS11')) ts11 = 'NOT_APPLICABLE';
  else if (!ts11Item || !ts11Item.artifact) ts11 = 'INCOMPLETE';
  else if (ts11Item.status === 'VALID') ts11 = 'VERIFIED';
  else if (ts11Item.status === 'BLOCKED') ts11 = 'BLOCKED';
  else ts11 = 'NOT_VERIFIED';
  const state: CompletenessState = invalid ? 'INVALID' : (missing.length === 0 ? 'COMPLETE' : 'INCOMPLETE');
  return { state, missing, ts07, ts11 };
}

// ---- evidence package (immutable, hashable, tamper-detectable) ---------------------------------------------
export function packageHash(pkg: Omit<EvidencePackage, 'package_hash'>): string { return sha256(canonicalJson(pkg)); }
export function buildEvidencePackage(input: {
  package_id: string; request: EvidenceRequest; items: EvidenceItem[]; assertions: EvidenceAssertion[];
  synthetic_test_only: boolean; previous_package_hash?: string | null; clock: () => string;
}): EvidencePackage {
  const r = input.request;
  const comp = evaluateCompleteness(r.scope.required_evidence_classes, input.items);
  const base: Omit<EvidencePackage, 'package_hash'> = {
    schema: 'dkskill.evidence_package/1', version: 1, synthetic_test_only: input.synthetic_test_only,
    package_id: input.package_id, target_profile_id: r.target_profile_id, target_host_identity: r.target_host_identity,
    target_version: r.target_version, target_binary_sha256: r.target_binary_sha256, target_platform: r.target_platform,
    target_architecture: r.target_architecture, target_channel: r.target_channel, environment_id: r.environment_id,
    authorization_ref: r.authorization_ref, evidence_items: input.items, assertions: input.assertions,
    completeness: comp.state, missing_classes: comp.missing, ts07_status: comp.ts07, ts11_status: comp.ts11,
    validity: 'VALID', created_at: input.clock(), previous_package_hash: input.previous_package_hash ?? null,
  };
  return { ...base, package_hash: packageHash(base) };
}

export function verifyEvidencePackage(pkg: EvidencePackage, previous?: EvidencePackage | null): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const { package_hash, ...rest } = pkg;
  if (packageHash(rest) !== package_hash) issues.push('PACKAGE_HASH_MISMATCH');
  for (const it of pkg.evidence_items) {
    if (!it.artifact) { if (it.status !== 'INCOMPLETE') issues.push(`MISSING_ARTIFACT:${it.evidence_class}`); continue; }
    if (rawContentHash(it.artifact.stored_content) !== it.artifact.content_hash) issues.push(`RAW_HASH_CHANGED:${it.evidence_class}`);
    if (!validateProvenance(it.artifact)) issues.push(`PROVENANCE_CHANGED:${it.evidence_class}`);
    if (it.artifact.environment_id !== pkg.environment_id) issues.push(`ENVIRONMENT_IDENTITY_CHANGED:${it.evidence_class}`);
    if (it.artifact.binary_identity !== pkg.target_binary_sha256) issues.push(`BINARY_IDENTITY_CHANGED:${it.evidence_class}`);
    if (it.normalized) { const { normalized_hash, ...nrest } = it.normalized; if (sha256(canonicalJson(nrest)) !== normalized_hash) issues.push(`NORMALIZED_HASH_CHANGED:${it.evidence_class}`); }
  }
  if (previous && pkg.previous_package_hash !== previous.package_hash) issues.push('HISTORY_CHAIN_BROKEN');
  return { ok: issues.length === 0, issues };
}

// ---- expiration / revocation (new status records; never mutate history) ------------------------------------
export function withValidity(pkg: EvidencePackage, validity: ValidityStatus, clock: () => string): EvidencePackage {
  const base: Omit<EvidencePackage, 'package_hash'> = { ...stripHash(pkg), validity, previous_package_hash: pkg.package_hash ?? null, created_at: clock() };
  return { ...base, package_hash: packageHash(base) };
}
function stripHash(pkg: EvidencePackage): Omit<EvidencePackage, 'package_hash'> { const { package_hash, ...rest } = pkg; return rest; }

// ---- M4 integration boundary (adapter; M4 stays the certification authority) -------------------------------
export interface M4EvidenceInputs {
  evidence: EvidenceRecord[];
  ts07: { resolved: boolean; evidence_ref: string | null };
  ts11: { applicable: boolean; resolved: boolean; evidence_ref: string | null };
  unknown_preserved: EvidenceClass[];
  incomplete_preserved: EvidenceClass[];
  synthetic_test_only: boolean;
}
// Exposes ONLY validated, non-expired, non-revoked evidence; preserves UNKNOWN/BLOCKED/INCOMPLETE; never
// synthesizes missing certification evidence; never alters M4 gate logic.
export function evidencePackageToCertificationInputs(pkg: EvidencePackage): M4EvidenceInputs {
  const usable = pkg.validity === 'VALID';
  const validItems = usable ? pkg.evidence_items.filter((i) => i.status === 'VALID' && i.artifact) : [];
  const records = chainEvidence(validItems.map((i) => ({
    schema: 'dkskill.certification_evidence/1' as const, evidence_id: i.artifact!.evidence_id, environment_id: i.artifact!.environment_id,
    host_identity: i.artifact!.host_identity, profile_id: pkg.target_profile_id, probe_id: null,
    observed_result: i.assertion.state, source: i.artifact!.source, timestamp: i.artifact!.capture_timestamp,
    input_hash: i.artifact!.content_hash, output_hash: i.normalized?.normalized_hash ?? null,
    redaction_status: i.artifact!.redaction_status, validation_status: i.status,
  })));
  const ts07Resolved = usable && pkg.ts07_status === 'VALID';
  const ts11Applicable = pkg.ts11_status !== 'NOT_APPLICABLE';
  const ts07Item = pkg.evidence_items.find((i) => i.evidence_class === 'EV-TS07');
  const ts11Item = pkg.evidence_items.find((i) => i.evidence_class === 'EV-TS11');
  return {
    evidence: records,
    ts07: { resolved: ts07Resolved, evidence_ref: ts07Resolved ? ts07Item?.artifact?.evidence_id ?? null : null },
    ts11: { applicable: ts11Applicable, resolved: usable && pkg.ts11_status === 'VERIFIED', evidence_ref: usable && pkg.ts11_status === 'VERIFIED' ? ts11Item?.artifact?.evidence_id ?? null : null },
    unknown_preserved: pkg.evidence_items.filter((i) => i.assertion.state === 'UNKNOWN').map((i) => i.evidence_class),
    incomplete_preserved: pkg.evidence_items.filter((i) => i.status === 'INCOMPLETE' || i.status === 'BLOCKED').map((i) => i.evidence_class),
    synthetic_test_only: pkg.synthetic_test_only,
  };
}

// ---- future real-session execution (DEFAULT OFF) ----------------------------------------------------------
export function planEvidenceSession(input: {
  request: EvidenceRequest; environment: EvidenceEnvironment; authorization: EvidenceAuthorization | null; clock: () => string;
}): SessionPlan {
  return {
    schema: 'dkskill.evidence_session_plan/1', plan_id: `plan-${input.request.request_id}`,
    target_profile_id: input.request.target_profile_id, target_binary_sha256: input.request.target_binary_sha256,
    requested_evidence: input.request.scope.required_evidence_classes, requested_tests: input.request.scope.required_test_ids,
    environment_id: input.environment.environment_id, authorization_ref: input.authorization?.authorization_id ?? null,
    expected_artifacts: input.request.scope.required_evidence_classes,
    expected_stop_conditions: STOP_CONDITION_IDS,
    execution_mode: 'EXECUTION_DISABLED', execution_enabled: false, created_at: input.clock(),
  };
}
// M7 NEVER executes. Even LIVE is refused unless a separate owner-approved evidence-session authorization is
// supplied AND execution is explicitly enabled — neither exists in repository state, so this always refuses.
export function executeEvidenceSession(plan: SessionPlan, opts: { mode?: ExecutionMode; owner_evidence_session_authorization?: string | null } = {}): ExecutionResult {
  const mode = opts.mode ?? 'EXECUTION_DISABLED';
  const authorized = mode === 'LIVE' && !!opts.owner_evidence_session_authorization;
  return {
    schema: 'dkskill.evidence_execution_result/1', plan_id: plan.plan_id, execution_mode: authorized ? 'DRY_RUN' : mode,
    executed: false, claude_invoked: false, authenticated: false, benchmark_invoked: false,
    reason: authorized
      ? 'A separate owner-approved evidence-session authorization would be required AND execution must be explicitly enabled; M7 performs no real execution — downgraded to DRY_RUN, nothing executed.'
      : 'Execution disabled (default). No live evidence session, no Claude execution, no authentication, no benchmark invocation.',
  };
}

// ---- future real-session STOP conditions (all fail-closed) -------------------------------------------------
export const STOP_CONDITION_IDS = [
  'BINARY_HASH_MISMATCH', 'VERSION_MISMATCH', 'PLATFORM_MISMATCH', 'ARCHITECTURE_MISMATCH', 'CHANNEL_MISMATCH',
  'ENVIRONMENT_MISMATCH', 'CREDENTIAL_AMBIGUITY', 'MISSING_ISOLATION_EVIDENCE', 'NETWORK_ISOLATION_UNRESOLVED',
  'AUTHORIZATION_MISMATCH', 'EVIDENCE_SCOPE_MISMATCH', 'UNEXPECTED_EVENT_SCHEMA', 'MALFORMED_STREAM', 'SECRET_DETECTED',
  'UNEXPECTED_PROCESS', 'UNEXPECTED_FILE_MUTATION', 'UNEXPECTED_NETWORK_BEHAVIOR', 'EVIDENCE_INTEGRITY_FAILURE',
];
export function evaluateStopConditions(expected: {
  binary_sha256: string | null; version: string | null; platform: string | null; architecture: string | null;
  channel: string | null; environment_id: string; authorization_id: string | null; scope: EvidenceClass[];
}, observed: Partial<{
  binary_sha256: string; version: string; platform: string; architecture: string; channel: string; environment_id: string;
  authorization_id: string; scope: EvidenceClass[]; credential_ambiguous: boolean; isolation_evidence: string | null;
  network_isolation_status: string | null; event_schema_ok: boolean; stream_malformed: boolean; secret_detected: boolean;
  unexpected_process: boolean; unexpected_file_mutation: boolean; unexpected_network: boolean; evidence_integrity_ok: boolean;
}>): { stop: boolean; conditions: StopCondition[] } {
  const c: StopCondition[] = [];
  const add = (id: string, description: string, triggered: boolean) => c.push({ id, description, triggered, fail_closed: true });
  add('BINARY_HASH_MISMATCH', 'binary sha256 differs from target', observed.binary_sha256 != null && expected.binary_sha256 != null && observed.binary_sha256.toUpperCase() !== expected.binary_sha256.toUpperCase());
  add('VERSION_MISMATCH', 'version differs', observed.version != null && observed.version !== expected.version);
  add('PLATFORM_MISMATCH', 'platform differs', observed.platform != null && observed.platform !== expected.platform);
  add('ARCHITECTURE_MISMATCH', 'architecture differs', observed.architecture != null && observed.architecture !== expected.architecture);
  add('CHANNEL_MISMATCH', 'channel differs', observed.channel != null && observed.channel !== expected.channel);
  add('ENVIRONMENT_MISMATCH', 'environment differs', observed.environment_id != null && observed.environment_id !== expected.environment_id);
  add('CREDENTIAL_AMBIGUITY', 'credential state ambiguous', observed.credential_ambiguous === true);
  add('MISSING_ISOLATION_EVIDENCE', 'no isolation evidence', observed.isolation_evidence === null || observed.isolation_evidence === undefined || observed.isolation_evidence === '');
  add('NETWORK_ISOLATION_UNRESOLVED', 'network isolation unresolved', observed.network_isolation_status != null && observed.network_isolation_status !== 'VERIFIED');
  add('AUTHORIZATION_MISMATCH', 'authorization differs', observed.authorization_id != null && observed.authorization_id !== expected.authorization_id);
  add('EVIDENCE_SCOPE_MISMATCH', 'requested evidence out of scope', (observed.scope ?? []).some((s) => !expected.scope.includes(s)));
  add('UNEXPECTED_EVENT_SCHEMA', 'unexpected event schema', observed.event_schema_ok === false);
  add('MALFORMED_STREAM', 'malformed stream', observed.stream_malformed === true);
  add('SECRET_DETECTED', 'secret detected', observed.secret_detected === true);
  add('UNEXPECTED_PROCESS', 'unexpected process', observed.unexpected_process === true);
  add('UNEXPECTED_FILE_MUTATION', 'unexpected file mutation', observed.unexpected_file_mutation === true);
  add('UNEXPECTED_NETWORK_BEHAVIOR', 'unexpected network behavior', observed.unexpected_network === true);
  add('EVIDENCE_INTEGRITY_FAILURE', 'evidence integrity failure', observed.evidence_integrity_ok === false);
  return { stop: c.some((x) => x.triggered), conditions: c };
}

// ---- session assembly (orchestration; still no execution) --------------------------------------------------
export function assembleSession(input: {
  session_id: string; request: EvidenceRequest; environment: EvidenceEnvironment; authorization: EvidenceAuthorization | null;
  items: EvidenceItem[]; clock: () => string; registry?: Registry;
}): EvidenceSession {
  const prechecks = runPrechecks({ request: input.request, environment: input.environment, authorization: input.authorization, registry: input.registry });
  const failures: EvidenceFailure[] = [];
  const m3 = m3EvidenceGate(input.request.target_host_identity, input.registry);
  if (!m3.allowed) failures.push({ code: 'M3_BOUNDARY', message: `${m3.resolution}: ${m3.reasons.join(';')}`, fail_closed: true });
  const ready = prechecksReady(prechecks) && m3.allowed;
  const items = input.items.map((i) => ({ ...i, status: i.artifact ? validateItem(i) : 'INCOMPLETE' as EvidenceStatus }));
  const comp = evaluateCompleteness(input.request.scope.required_evidence_classes, items);
  let state: EvidenceSession['state'];
  if (!ready) state = failures.length ? 'BLOCKED' : 'BLOCKED';
  else if (items.some((i) => i.status === 'INVALID')) state = 'INVALID';
  else if (comp.state === 'COMPLETE') state = 'COMPLETE';
  else state = 'INCOMPLETE';
  return {
    schema: 'dkskill.evidence_session/1', version: 1, session_id: input.session_id, request_id: input.request.request_id,
    environment_id: input.environment.environment_id, state, prechecks, items, failures,
    started_at: input.clock(), updated_at: input.clock(),
  };
}
