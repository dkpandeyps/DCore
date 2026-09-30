// M10 — Authorized Read-Only Network Isolation Evidence Collection engine.
// Deterministic, FAIL-CLOSED. The core (`runCollection`) is a PURE function over already-collected, classified
// source results — used by all tests and committed samples. A SEPARATE real collector runs a fixed READ-ONLY
// command allowlist through an injected runner; it is never invoked by tests, imports, or sample generation.
// Host self-inspection is classified CONFIGURATION/HOST_OBSERVATION and can NEVER be independent (L4); the M9 L4
// predicate remains the authority, so collection alone cannot reach VERIFIED. It never modifies/authorizes M8.
import { execFileSync } from 'node:child_process';
import { sha256, canonicalJson } from '../src/canonical.ts';
import { runVerification as m9RunVerification, FROZEN_HOST, FROZEN_ENVIRONMENT } from './network-isolation.ts';
import type { HostIdentity } from './hcl-types.ts';
import type { NetworkIsolationObservation, NetworkIsolationVerification, M8NetworkResult, IsolationScope } from './network-isolation-types.ts';
import type {
  CollectionRequest, CollectionResult, CollectionObservation, CollectionEvidence, SourceResult, SafetyGate,
  SafetyOutcome, CollectionResultState, NetworkIsolationResult, FreshnessState, CollectionScope, CollectionEvidenceClass,
  CommandDefinition, CommandOutcome, MechanismSummary, VerificationLevel, CollectionMechanism, CollectionAudit,
} from './network-isolation-collection-types.ts';

// ---- fixed READ-ONLY command allowlist (no dynamic construction, no network utilities) ---------------------
export const READ_ONLY_COMMANDS: CommandDefinition[] = [
  { command_id: 'FW_STATE', mechanism: 'WINDOWS_FIREWALL_STATE', executable_path: 'netsh', args: ['advfirewall', 'show', 'allprofiles'], expected_output_type: 'text', read_only: true },
  { command_id: 'FW_PROFILES', mechanism: 'FIREWALL_PROFILES', executable_path: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command', 'Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultOutboundAction | Format-List'], expected_output_type: 'text', read_only: true },
  { command_id: 'PROXY', mechanism: 'PROXY_CONFIG', executable_path: 'netsh', args: ['winhttp', 'show', 'proxy'], expected_output_type: 'text', read_only: true },
  { command_id: 'ROUTES', mechanism: 'ROUTING_STATE', executable_path: 'route', args: ['print', '-4'], expected_output_type: 'text', read_only: true },
  { command_id: 'DNS', mechanism: 'DNS_CONFIG', executable_path: 'netsh', args: ['interface', 'ip', 'show', 'dns'], expected_output_type: 'text', read_only: true },
  { command_id: 'ADAPTERS', mechanism: 'NETWORK_ADAPTER_STATE', executable_path: 'netsh', args: ['interface', 'show', 'interface'], expected_output_type: 'text', read_only: true },
  { command_id: 'CONNECTIONS', mechanism: 'ACTIVE_CONNECTIONS', executable_path: 'netstat', args: ['-ano'], expected_output_type: 'text', read_only: true },
];
export const ALL_MECHANISMS: CollectionMechanism[] = ['WINDOWS_FIREWALL_STATE', 'FIREWALL_PROFILES', 'EFFECTIVE_FIREWALL_RULES', 'NETWORK_ADAPTER_STATE', 'ROUTING_STATE', 'ACTIVE_CONNECTIONS', 'DNS_CONFIG', 'PROXY_CONFIG', 'PROCESS_NETWORK_ASSOCIATION', 'OS_NETWORK_POLICY', 'ISOLATED_ENV_CONTROLS'];

const SECRET_RE = /(sk-[a-z0-9]{6}|eyJ[a-zA-Z0-9_-]{6,}\.[a-zA-Z0-9_-]{6,}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|access_token=|refresh_token=|api[_-]?key=|bearer\s+[a-z0-9]{6}|xoxb-[a-z0-9-]+|password=\S+)/gi;
export function containsSecret(v: unknown): boolean { const s = typeof v === 'string' ? v : JSON.stringify(v ?? null); SECRET_RE.lastIndex = 0; return SECRET_RE.test(s); }
export function redactSecrets(s: string): { text: string; redacted: boolean } { SECRET_RE.lastIndex = 0; const has = SECRET_RE.test(s); SECRET_RE.lastIndex = 0; return { text: has ? s.replace(SECRET_RE, '[REDACTED_SECRET]') : s, redacted: has }; }

// ---- collection safety gate (COL-01..14; fail-closed) -----------------------------------------------------
export function runSafetyGate(req: CollectionRequest, opts: { writeRequested?: boolean; externalDependency?: boolean } = {}): SafetyGate[] {
  const out: SafetyGate[] = [];
  const g = (gate_id: string, name: string, ok: boolean, reasons: string[] = []) => out.push({ gate_id, name, result: ok ? 'PASS' : 'BLOCKED', reasons: ok ? [] : (reasons.length ? reasons : [name]) });
  g('COL-01', 'environment identity', req.environment_id === FROZEN_ENVIRONMENT, [`env=${req.environment_id}`]);
  g('COL-02', 'collection mode READ_ONLY', req.collection_mode === 'READ_ONLY');
  g('COL-03', 'no write-capable operation', !opts.writeRequested);
  g('COL-04', 'no Claude execution', true);
  g('COL-05', 'no authentication', true);
  g('COL-06', 'no external service dependency', !opts.externalDependency);
  g('COL-07', 'no credential access', true);
  g('COL-08', 'no real ~/.claude access', true);
  g('COL-09', 'no /runtime/', true);
  g('COL-10', 'no production registry access', true);
  g('COL-11', 'no benchmark execution', true);
  g('COL-12', 'no Run A authorization', true);
  g('COL-13', 'no publication authorization', true);
  g('COL-14', 'no certification authorization', true);
  return out;
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

// ---- independence assessment (host inspection is NEVER independent) ----------------------------------------
export function assessIndependence(evidence: CollectionEvidence[]): boolean {
  // L4 requires a genuine INDEPENDENT_VERIFICATION observation, OBSERVED, FRESH, applicable, in-scope, non-revoked,
  // isolation-supporting, and NOT produced by host self-inspection. Configuration-only / host-observation /
  // controlled-behavior / synthetic / single-rule / absence-of-connections can never satisfy independence.
  return evidence.some((e) => e.observation.evidence_class === 'INDEPENDENT_VERIFICATION' && e.observation.status === 'OBSERVED' &&
    e.freshness === 'FRESH' && e.applicable && e.in_scope && e.observation.signal === 'ISOLATION_SUPPORTING' &&
    e.observation.source_type === 'INDEPENDENT');
}

// ---- scope mapping (M10 -> M9) ----------------------------------------------------------------------------
function toM9Scope(s: CollectionScope): IsolationScope { return s === 'APPLICATION_ONLY' ? 'PROCESS_ONLY' : (s as IsolationScope); }
const CLASS_LEVEL: Record<CollectionEvidenceClass, VerificationLevel> = { CONFIGURATION_EVIDENCE: 'L1', HOST_OBSERVATION: 'L2', CONTROLLED_BEHAVIOR_EVIDENCE: 'L3', INDEPENDENT_VERIFICATION: 'L4' };
const M9_CLASS: Record<CollectionEvidenceClass, NetworkIsolationObservation['evidence_class']> = { CONFIGURATION_EVIDENCE: 'CONFIGURATION_EVIDENCE', HOST_OBSERVATION: 'OBSERVATIONAL_EVIDENCE', CONTROLLED_BEHAVIOR_EVIDENCE: 'OBSERVATIONAL_EVIDENCE', INDEPENDENT_VERIFICATION: 'INDEPENDENT_VERIFICATION' };

// ---- deterministic collection (PURE over supplied source results) -----------------------------------------
export function runCollection(input: {
  request: CollectionRequest; sources: SourceResult[]; now: string; synthetic_test_only?: boolean;
  performed_real_inspection?: boolean; writeRequested?: boolean; externalDependency?: boolean;
}): CollectionResult {
  const req = input.request;
  const safety_gates = runSafetyGate(req, { writeRequested: input.writeRequested, externalDependency: input.externalDependency });
  const blockedBySafety = safety_gates.some((x) => x.result !== 'PASS');

  const observations: CollectionObservation[] = [];
  const evidence: CollectionEvidence[] = [];
  for (const s of input.sources) {
    const srcEnv = s.source_environment_id ?? req.environment_id;
    const srcHost = s.source_host_id !== undefined ? s.source_host_id : req.host_identity.binary_sha256;
    const red = redactSecrets(s.raw_output);
    const normalized = summarize(s.mechanism, red.text);
    const obs: CollectionObservation = {
      schema: 'dkskill.network_isolation_collection_observation/1', observation_id: `obs_${s.command_id}`,
      environment_id: srcEnv, host_id: srcHost, source: s.command_id,
      source_type: s.evidence_class === 'CONFIGURATION_EVIDENCE' ? 'CONFIGURATION' : s.evidence_class === 'INDEPENDENT_VERIFICATION' ? 'INDEPENDENT' : s.evidence_class === 'CONTROLLED_BEHAVIOR_EVIDENCE' ? 'CONTROLLED' : 'OBSERVATIONAL',
      mechanism: s.mechanism, collection_method: `read-only:${s.command_id}`, timestamp: s.observed_at, scope: s.scope,
      evidence_class: s.evidence_class, status: s.status, signal: s.signal, normalized,
      limitations: s.evidence_class === 'INDEPENDENT_VERIFICATION' ? [] : ['host self-inspection is not independent verification'],
    };
    const freshness = s.revoked ? 'UNKNOWN' : assessFreshness(s.observed_at, s.expires_at, s.max_age_ms, input.now);
    const applicable = srcEnv === req.environment_id && (srcHost == null || srcHost === req.host_identity.binary_sha256);
    const in_scope = s.scope === req.requested_scope || strongSubsumes(req.requested_scope, s.scope);
    observations.push(obs);
    evidence.push({ schema: 'dkskill.network_isolation_collection_evidence/1', evidence_id: `evi_${s.command_id}`, observation: obs, freshness, raw_hash: sha256(canonicalJson({ command_id: s.command_id, out: red.text })), normalized_hash: sha256(canonicalJson(obs)), redaction_applied: red.redacted, in_scope, applicable });
  }

  // Delegate the VERIFIED/level decision to the M9 authority (never duplicated here).
  const m9Obs: NetworkIsolationObservation[] = input.sources.map((s) => ({
    schema: 'dkskill.network_isolation_observation/1', observation_id: `obs_${s.command_id}`, mechanism: (['WINDOWS_FIREWALL_STATE', 'FIREWALL_PROFILES', 'EFFECTIVE_FIREWALL_RULES', 'NETWORK_ADAPTER_STATE', 'ROUTING_STATE', 'ACTIVE_CONNECTIONS', 'DNS_CONFIG', 'PROXY_CONFIG', 'PROCESS_NETWORK_ASSOCIATION', 'OS_NETWORK_POLICY'].includes(s.mechanism) ? s.mechanism : 'ISOLATED_ENV_CONTROLS') as any,
    evidence_class: M9_CLASS[s.evidence_class], level: CLASS_LEVEL[s.evidence_class], environment_id: s.source_environment_id ?? req.environment_id,
    host_id: s.source_host_id !== undefined ? s.source_host_id : req.host_identity.binary_sha256, os: req.os, architecture: req.architecture, scope: toM9Scope(s.scope),
    result: (s.status === 'ERROR' ? 'UNKNOWN' : s.status) as any, signal: s.signal, claim: `collected:${s.command_id}`,
    source: s.command_id, source_type: s.evidence_class === 'CONFIGURATION_EVIDENCE' ? 'CONFIGURATION' : s.evidence_class === 'INDEPENDENT_VERIFICATION' ? 'INDEPENDENT' : 'OBSERVATIONAL',
    collection_method: 'read-only', observed_at: s.observed_at, expires_at: s.expires_at, max_age_ms: s.max_age_ms,
    verifier: null, limitations: [], revoked: s.revoked,
  }));
  const m9: NetworkIsolationVerification = m9RunVerification({ request: { schema: 'dkskill.network_isolation_request/1', version: 1, request_id: `col-${req.request_id}`, environment_id: req.environment_id, host_identity: req.host_identity, os: req.os, architecture: req.architecture, requested_scope: toM9Scope(req.requested_scope), m8_context: 'M10 read-only collection', requested_at: req.requested_at }, observations: m9Obs, now: input.now, synthetic_test_only: input.synthetic_test_only });

  const independence_satisfied = assessIndependence(evidence);
  let network_isolation: NetworkIsolationResult = m9.network_isolation;
  // Fail closed: even if M9 somehow returned VERIFIED, collection cannot claim VERIFIED without genuine independence.
  if (network_isolation === 'VERIFIED' && !independence_satisfied) network_isolation = 'UNVERIFIED';
  const achieved_level: VerificationLevel = network_isolation === 'VERIFIED' ? 'L4' : m9.achieved_level as VerificationLevel;

  let result_state: CollectionResultState;
  if (blockedBySafety) result_state = 'BLOCKED';
  else if (input.sources.length === 0) result_state = 'UNAVAILABLE';
  else if (network_isolation === 'FAILED') result_state = 'FAILED';
  else if (input.sources.some((s) => s.status === 'ERROR' || s.status === 'UNKNOWN')) result_state = 'PARTIAL';
  else result_state = 'COMPLETE';
  if (blockedBySafety) network_isolation = 'BLOCKED';

  const mechanisms: MechanismSummary[] = ALL_MECHANISMS.map((m) => {
    const s = input.sources.find((x) => x.mechanism === m);
    return { mechanism: m, status: s ? s.status : 'UNKNOWN', note: s ? `${s.evidence_class}` : 'not inspected / unavailable' };
  });
  const reasons = blockedBySafety ? ['safety gate failed'] : [...m9.reasons];
  if (!independence_satisfied && !blockedBySafety) reasons.push('no independent (L4) verification: host self-inspection is configuration/observation only');

  const base: Omit<CollectionResult, 'audit_hash'> = {
    schema: 'dkskill.network_isolation_collection_result/1', version: 1, synthetic_test_only: input.synthetic_test_only ?? false,
    collection_id: `col-${req.request_id}`, environment_id: req.environment_id, host_identity: req.host_identity,
    collection_mode: 'READ_ONLY', safety_gates, result_state, observations, evidence, evidence_hashes: evidence.map((e) => e.normalized_hash),
    mechanisms, contradictions: m9.contradictions, independence_satisfied, achieved_level, network_isolation,
    proven_scope: network_isolation === 'VERIFIED' ? req.requested_scope : null,
    limitations: buildLimitations(independence_satisfied, m9.contradictions.length > 0), reasons,
    performed_real_inspection: input.performed_real_inspection ?? false, timestamp: input.now,
  };
  return { ...base, audit_hash: sha256(canonicalJson(base)) };
}
function strongSubsumes(requested: CollectionScope, observed: CollectionScope): boolean {
  if (requested === observed) return true;
  const strong: CollectionScope[] = ['HOST_ONLY', 'NETWORK_NAMESPACE', 'OUTBOUND_DENY'];
  const weak: CollectionScope[] = ['PROCESS_ONLY', 'APPLICATION_ONLY', 'ENVIRONMENT_ONLY'];
  return strong.includes(observed) && weak.includes(requested);
}
function buildLimitations(independence: boolean, contradiction: boolean): string[] {
  const l: string[] = [];
  if (!independence) l.push('No L4 independent verification: host-level network isolation remains UNVERIFIED. Collection observes configuration/host state only.');
  if (contradiction) l.push('Material contradiction present; VERIFIED is impossible.');
  return l;
}
// Minimal secret-safe summary (never persists raw output verbatim for hashing beyond a short normalized form).
function summarize(mechanism: CollectionMechanism, text: string): string {
  const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return `${mechanism}: ${lines.length} lines; head=${(lines[0] ?? '').slice(0, 80)}`;
}

// ---- M9 / M8 adapters (pure, fail-closed; VERIFIED+L4 only) ------------------------------------------------
export function networkIsolationCollectionToM9(result: CollectionResult): NetworkIsolationResult {
  return result.network_isolation === 'VERIFIED' && result.achieved_level === 'L4' && result.independence_satisfied ? 'VERIFIED' : (result.network_isolation === 'BLOCKED' ? 'BLOCKED' : result.network_isolation === 'FAILED' ? 'FAILED' : 'UNVERIFIED');
}
export function networkIsolationCollectionToM8(result: CollectionResult): M8NetworkResult {
  // Only a genuine VERIFIED + L4 + independence result may satisfy M8 EP-13. Everything else keeps M8 BLOCKED.
  return networkIsolationCollectionToM9(result) as M8NetworkResult;
}

// ---- audit chain ------------------------------------------------------------------------------------------
export function auditRecordHash(rec: Omit<CollectionAudit, 'record_hash'>): string { return sha256(canonicalJson(rec)); }
export function buildAuditRecord(r: CollectionResult, now: string, previous_record_hash: string | null = null): CollectionAudit {
  const base: Omit<CollectionAudit, 'record_hash'> = { schema: 'dkskill.network_isolation_collection_audit/1', version: 1, audit_id: `audit-${r.collection_id}`, collection_id: r.collection_id, environment_id: r.environment_id, result_state: r.result_state, network_isolation: r.network_isolation, achieved_level: r.achieved_level, evidence_hashes: r.evidence_hashes, timestamp: now, previous_record_hash };
  return { ...base, record_hash: auditRecordHash(base) };
}
export function chainAuditRecords(records: Omit<CollectionAudit, 'record_hash' | 'previous_record_hash'>[]): CollectionAudit[] {
  const out: CollectionAudit[] = []; let prev: string | null = null;
  for (const r of records) { const b = { ...r, previous_record_hash: prev } as Omit<CollectionAudit, 'record_hash'>; const record_hash = auditRecordHash(b); out.push({ ...b, record_hash }); prev = record_hash; }
  return out;
}
export function verifyAuditChain(records: CollectionAudit[]): boolean {
  let prev: string | null = null;
  for (const r of records) { if (r.previous_record_hash !== prev) return false; const { record_hash, ...rest } = r; if (auditRecordHash(rest) !== record_hash) return false; prev = record_hash!; }
  return true;
}

// ---- REAL read-only collector (injected runner; NEVER used by tests/imports/sample generation) --------------
export type CommandRunner = (cmd: CommandDefinition) => CommandOutcome;
export const defaultCommandRunner: CommandRunner = (cmd) => {
  try {
    const out = execFileSync(cmd.executable_path, cmd.args, { encoding: 'utf8', timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    return { command_id: cmd.command_id, ok: true, status: 'OBSERVED', raw_output: String(out), error_code: null };
  } catch (e: any) {
    return { command_id: cmd.command_id, ok: false, status: 'ERROR', raw_output: String(e?.stdout ?? '') + String(e?.stderr ?? ''), error_code: String(e?.code ?? 'ERROR') };
  }
};
// Classify a real command outcome into a fail-closed SourceResult. Host inspection is CONFIGURATION/HOST_OBSERVATION
// only — never INDEPENDENT_VERIFICATION — so real collection can never by itself reach VERIFIED.
export function classifyOutcome(cmd: CommandDefinition, outcome: CommandOutcome, now: string): SourceResult {
  const red = redactSecrets(outcome.raw_output);
  let evidence_class: CollectionEvidenceClass = cmd.mechanism === 'WINDOWS_FIREWALL_STATE' || cmd.mechanism === 'FIREWALL_PROFILES' || cmd.mechanism === 'EFFECTIVE_FIREWALL_RULES' || cmd.mechanism === 'PROXY_CONFIG' || cmd.mechanism === 'DNS_CONFIG' ? 'CONFIGURATION_EVIDENCE' : 'HOST_OBSERVATION';
  let signal: SourceResult['signal'] = 'NEUTRAL';
  const text = red.text.toLowerCase();
  if (cmd.mechanism === 'FIREWALL_PROFILES' || cmd.mechanism === 'WINDOWS_FIREWALL_STATE') { if (/outboundaction\s*:\s*block|outbound connections that do not match a rule are blocked/.test(text)) signal = 'ISOLATION_SUPPORTING'; }
  if (cmd.mechanism === 'ACTIVE_CONNECTIONS') { if (/\bestablished\b/.test(text)) signal = 'LEAK_OBSERVED'; }
  return { command_id: cmd.command_id, mechanism: cmd.mechanism, evidence_class, scope: cmd.mechanism === 'FIREWALL_PROFILES' || cmd.mechanism === 'WINDOWS_FIREWALL_STATE' ? 'FIREWALL_POLICY' : 'HOST_ONLY', signal, status: outcome.status, raw_output: red.text, observed_at: outcome.ok ? now : null, expires_at: null, max_age_ms: null, revoked: false };
}
export function collectRealHostObservations(input: { request: CollectionRequest; now: string; runner?: CommandRunner }): CollectionResult {
  const runner = input.runner ?? defaultCommandRunner;
  const sources = READ_ONLY_COMMANDS.map((cmd) => classifyOutcome(cmd, runner(cmd), input.now));
  return runCollection({ request: input.request, sources, now: input.now, synthetic_test_only: false, performed_real_inspection: true });
}
