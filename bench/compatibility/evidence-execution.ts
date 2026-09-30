// M8 — Controlled Real Evidence Session Authorization & Execution Gate engine.
// Deterministic, repository-side, FAIL-CLOSED. Decides ONLY whether a FUTURE evidence-session executor MAY
// execute. It NEVER executes Claude, authenticates, spends, runs Run A / the benchmark, certifies, publishes, or
// mutates the production registry. Default EXECUTION_DISABLED / DRY_RUN. No bypass flags. The current real target
// returns EXECUTION_BLOCKED (network isolation UNVERIFIED). Unknown safety condition => fail closed.
import { sha256, canonicalJson } from '../src/canonical.ts';
import { resolveProfile, staticIdentityProbe } from './hcl.ts';
import { buildRegistry, type Registry } from '../tools/gen-compatibility-registry.ts';
import type { HostIdentity } from './hcl-types.ts';
import type {
  ExecutionTarget, ExecutionAuthorization, AuthorizationState, EnvironmentSnapshot, ExecutionRequest,
  ExecutionPreflight, PreflightGate, GateOutcome, ExecutionGate, ExecutionDecision, ExecutionState, StopCode,
  StopCondition, NetworkIsolationStatus, ResourceLimits, ResourceUsage, PostflightResult, PostflightCheck,
  PostflightOutcome, ExecutionRecord, ExecutionMode,
} from './evidence-execution-types.ts';

// ---- frozen target (exact; no wildcard / range / substitution) --------------------------------------------
export const FROZEN_TARGET: ExecutionTarget = {
  profile_id: 'cc-2.1.283-win32-x64-native@1', version: '2.1.283',
  binary_sha256: '9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A',
  platform: 'win32', architecture: 'x64', channel: 'native', environment_id: 'PTPL-DK-BENCH-WIN-01',
};
export const ALLOWED_TESTS = ['TS-07', 'TS-11'] as const;
export const RESOURCE_LIMITS: ResourceLimits = {
  max_wall_clock_ms: 900000, max_process_count: 8, max_filesystem_output_bytes: 25 * 1024 * 1024,
  max_evidence_artifact_bytes: 8 * 1024 * 1024, max_network_destinations: 4, max_retries: 1,
};
// Detects secret VALUES (not field names): scans string values only, so keys like `api_key_injected` never match.
const SECRET_RE = /(sk-[a-z0-9]{6}|eyJ[a-zA-Z0-9_-]{6,}\.[a-zA-Z0-9_-]{6,}|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|access_token=|refresh_token=|api[_-]?key=|bearer\s+[a-z0-9]{6}|xoxb-[a-z0-9-]+)/i;
export function containsSecret(v: unknown): boolean {
  if (typeof v === 'string') return SECRET_RE.test(v);
  if (Array.isArray(v)) return v.some(containsSecret);
  if (v !== null && typeof v === 'object') return Object.values(v as Record<string, unknown>).some(containsSecret);
  return false;
}

// ---- authorization (dedicated; disjoint; bound to exact target) --------------------------------------------
export function authorizationPayloadHash(target: ExecutionTarget, tests: readonly string[]): string {
  return sha256(canonicalJson({ profile_id: target.profile_id, version: target.version, binary_sha256: target.binary_sha256, platform: target.platform, architecture: target.architecture, channel: target.channel, environment_id: target.environment_id, tests: [...tests].sort() }));
}
export function buildExecutionAuthorization(input: {
  authorization_id: string; authorized_by: string; target: ExecutionTarget; allowed_tests: ('TS-07' | 'TS-11')[];
  clock: () => string; expiration?: string | null;
}): ExecutionAuthorization {
  return {
    schema: 'dkskill.evidence_execution_authorization/1', version: 1, authorization_id: input.authorization_id,
    authorized_by: input.authorized_by, authorized_role: 'evidence-session-operator',
    target_profile_id: input.target.profile_id, target_version: input.target.version, target_binary_sha256: input.target.binary_sha256,
    target_platform: input.target.platform, target_architecture: input.target.architecture, target_channel: input.target.channel,
    allowed_tests: input.allowed_tests, allowed_environment_id: input.target.environment_id,
    authorization_timestamp: input.clock(), expiration: input.expiration ?? null,
    authorization_payload_hash: authorizationPayloadHash(input.target, input.allowed_tests), authorization_state: 'VALID',
  };
}
// Never inferred from M5/M6/M7 or prior TS-02 authorization. Bound to the exact target and requested tests.
export function validateAuthorization(auth: ExecutionAuthorization | null, target: ExecutionTarget, requestedTests: readonly string[], now: string): AuthorizationState {
  if (!auth) return 'MISSING';
  if (auth.authorization_state === 'REVOKED') return 'REVOKED';
  if (auth.expiration && auth.expiration <= now) return 'EXPIRED';
  if (auth.authorization_state === 'EXPIRED') return 'EXPIRED';
  const bound = auth.authorization_payload_hash === authorizationPayloadHash(target, auth.allowed_tests);
  const identityOk = auth.target_profile_id === target.profile_id && auth.target_version === target.version &&
    auth.target_binary_sha256 === target.binary_sha256 && auth.target_platform === target.platform &&
    auth.target_architecture === target.architecture && auth.target_channel === target.channel &&
    auth.allowed_environment_id === target.environment_id;
  const scopeOk = requestedTests.every((t) => auth.allowed_tests.includes(t as any));
  if (!bound || !identityOk || !scopeOk) return 'MISMATCHED';
  return 'VALID';
}

// ---- M3 boundary --------------------------------------------------------------------------------------------
export function m3Resolve(target: ExecutionTarget, registry: Registry = buildRegistry()): string {
  const id: Partial<HostIdentity> = { product: 'claude-code', version: target.version, platform: target.platform, architecture: target.architecture, channel: target.channel, binary_sha256: target.binary_sha256 };
  const probe = staticIdentityProbe(id);
  if (probe.identity_status !== 'IDENTIFIED') return `UNIDENTIFIED:${probe.identity_status}`;
  return resolveProfile(probe.identity, registry).state;
}

// ---- preflight gates (EP-01..25; no implicit PASS; fail-closed) --------------------------------------------
export function runPreflight(req: ExecutionRequest): ExecutionPreflight {
  const t = req.target, e = req.environment, a = req.authorization;
  const gates: PreflightGate[] = [];
  const g = (gate_id: string, name: string, ok: boolean, opts: { block?: boolean; critical?: boolean; reasons?: string[] } = {}) =>
    gates.push({ gate_id, name, result: ok ? 'PASS' : (opts.block ? 'BLOCKED' : 'FAIL'), safety_critical: opts.critical ?? true, reasons: ok ? [] : (opts.reasons ?? [name]) });
  const eq = (x: string | null, y: string | null) => x != null && y != null && x === y;
  const eqi = (x: string | null, y: string | null) => x != null && y != null && x.toUpperCase() === y.toUpperCase();

  g('EP-01', 'exact target profile', t.profile_id === FROZEN_TARGET.profile_id, { reasons: [`profile=${t.profile_id}`] });
  g('EP-02', 'exact Claude version', eq(t.version, FROZEN_TARGET.version) && eq(e.claude_code_version, FROZEN_TARGET.version), { reasons: [`target=${t.version}`, `env=${e.claude_code_version}`] });
  g('EP-03', 'exact binary hash', eqi(t.binary_sha256, FROZEN_TARGET.binary_sha256) && eqi(e.binary_sha256, FROZEN_TARGET.binary_sha256), { reasons: [`target=${t.binary_sha256?.slice(0, 12)}`, `env=${e.binary_sha256?.slice(0, 12)}`] });
  g('EP-04', 'exact platform', eq(t.platform, FROZEN_TARGET.platform) && eq(e.platform, FROZEN_TARGET.platform), { reasons: [`target=${t.platform}`, `env=${e.platform}`] });
  g('EP-05', 'exact architecture', eq(t.architecture, FROZEN_TARGET.architecture) && eq(e.architecture, FROZEN_TARGET.architecture), { reasons: [`target=${t.architecture}`] });
  g('EP-06', 'exact channel', eq(t.channel, FROZEN_TARGET.channel), { reasons: [`channel=${t.channel}`] });
  g('EP-07', 'exact environment', t.environment_id === FROZEN_TARGET.environment_id && e.environment_id === FROZEN_TARGET.environment_id && (!a || a.allowed_environment_id === FROZEN_TARGET.environment_id), { reasons: [`target=${t.environment_id}`, `env=${e.environment_id}`] });
  g('EP-08', 'isolated config directory', req.config_dir.is_dedicated_isolated && req.config_dir.ownership_ok && !!req.config_dir.observed_config_dir, { block: !req.config_dir.observed_config_dir, reasons: [`isolated=${req.config_dir.is_dedicated_isolated}`, `owned=${req.config_dir.ownership_ok}`] });
  g('EP-09', 'real ~/.claude exclusion', !req.config_dir.points_to_real_claude && !req.config_dir.path_overlaps_real_claude && !req.config_dir.credential_copied_from_real, { reasons: ['symlink/overlap/copy to real ~/.claude'] });
  g('EP-10', 'credential safety', !req.credential.api_key_injected && !req.credential.unauthorized_token_present && req.credential.dedicated_config_dir && !req.credential.real_claude_credential_copy && req.credential.credential_state_known && !req.credential.secret_persisted_in_evidence, { block: !req.credential.credential_state_known, reasons: [`state_known=${req.credential.credential_state_known}`] });
  g('EP-11', 'process policy', req.processes.every((p) => p.approved), { reasons: req.processes.filter((p) => !p.approved).map((p) => `unapproved:${p.process_identity}`) });
  g('EP-12', 'filesystem policy', req.filesystem.state_known && !req.filesystem.unexpected_write && !req.filesystem.touches_real_claude && !req.filesystem.touches_production_registry && !req.filesystem.touches_runtime_dir, { block: !req.filesystem.state_known, reasons: [`unexpected_write=${req.filesystem.unexpected_write}`, `real_claude=${req.filesystem.touches_real_claude}`] });
  // EP-13 network isolation: PASS only on VERIFIED. Never inferred; a synthetic/assumed source cannot mark it PASS.
  const netVerified = req.network.isolation_status === 'VERIFIED';
  g('EP-13', 'network isolation', netVerified, { block: req.network.isolation_status === 'UNVERIFIED', reasons: [`status=${req.network.isolation_status}`, `source=${req.network.observation_source}`] });
  const authState = validateAuthorization(a, t, req.requested_tests, e.timestamp);
  g('EP-14', 'explicit execution authorization', authState === 'VALID', { block: authState === 'MISSING', reasons: [`auth=${authState}`] });
  g('EP-15', 'TS-07/TS-11 scope', req.requested_tests.length > 0 && req.requested_tests.every((x) => (ALLOWED_TESTS as readonly string[]).includes(x)), { reasons: [`tests=${req.requested_tests.join(',')}`] });
  g('EP-16', 'Run A exclusion', !req.requested_run_a, { reasons: ['Run A requested'] });
  g('EP-17', 'benchmark exclusion', !req.requested_benchmark, { reasons: ['benchmark requested'] });
  g('EP-18', 'publication exclusion', !req.requested_publication, { reasons: ['publication requested'] });
  g('EP-19', 'registry mutation exclusion', !req.requested_registry_mutation, { reasons: ['registry mutation requested'] });
  g('EP-20', 'M7 evidence-plan binding', !!req.m7_plan_id, { block: !req.m7_plan_id, reasons: ['no M7 plan bound'] });
  g('EP-21', 'M3 exact profile resolution', req.m3_resolution === 'EXACT_MATCH', { block: req.m3_resolution !== 'EXACT_MATCH' && !req.m3_resolution.startsWith('REVOKED'), reasons: [`m3=${req.m3_resolution}`] });
  g('EP-22', 'synthetic-only exclusion', !req.synthetic_target, { reasons: ['synthetic target cannot execute as real'] });
  g('EP-23', 'binary substitution exclusion', !req.substitute_binary, { reasons: ['binary substitution requested'] });
  g('EP-24', 'model substitution exclusion', !req.substitute_model, { reasons: ['model substitution requested'] });
  g('EP-25', 'toolchain identity', !!req.toolchain_identity && req.toolchain_identity === e.toolchain_identity, { block: !req.toolchain_identity, reasons: [`toolchain=${req.toolchain_identity}`] });

  const all_safety_critical_pass = gates.filter((x) => x.safety_critical).every((x) => x.result === 'PASS');
  return {
    schema: 'dkskill.evidence_execution_preflight/1', version: 1, request_id: req.request_id, target: t, environment: e,
    gates, network_isolation: req.network.isolation_status, all_safety_critical_pass,
  };
}

// ---- gate -> stop-code mapping ------------------------------------------------------------------------------
const GATE_STOP: Record<string, StopCode> = {
  'EP-01': 'STOP-SCOPE-VIOLATION', 'EP-02': 'STOP-VERSION-MISMATCH', 'EP-03': 'STOP-BINARY-MISMATCH',
  'EP-04': 'STOP-PLATFORM-MISMATCH', 'EP-05': 'STOP-ARCHITECTURE-MISMATCH', 'EP-06': 'STOP-CHANNEL-MISMATCH',
  'EP-07': 'STOP-ENVIRONMENT-MISMATCH', 'EP-08': 'STOP-CONFIG-DIR-UNSAFE', 'EP-09': 'STOP-REAL-CLAUDE-DIR-DETECTED',
  'EP-10': 'STOP-CREDENTIAL-AMBIGUOUS', 'EP-11': 'STOP-PROCESS-VIOLATION', 'EP-12': 'STOP-FILESYSTEM-VIOLATION',
  'EP-13': 'STOP-NETWORK-UNVERIFIED', 'EP-14': 'STOP-AUTHORIZATION-MISSING', 'EP-15': 'STOP-SCOPE-VIOLATION',
  'EP-16': 'STOP-RUN-A-DETECTED', 'EP-17': 'STOP-BENCHMARK-DETECTED', 'EP-18': 'STOP-PUBLICATION-DETECTED',
  'EP-19': 'STOP-REGISTRY-MUTATION-DETECTED', 'EP-20': 'STOP-EVIDENCE-INTEGRITY', 'EP-21': 'STOP-SCOPE-VIOLATION',
  'EP-22': 'STOP-SCOPE-VIOLATION', 'EP-23': 'STOP-BINARY-MISMATCH', 'EP-24': 'STOP-SCOPE-VIOLATION',
  'EP-25': 'STOP-UNKNOWN-CONDITION',
};

// ---- execution decision ------------------------------------------------------------------------------------
export function evaluateEvidenceExecutionGate(req: ExecutionRequest): ExecutionGate {
  const preflight = runPreflight(req);
  const authState = validateAuthorization(req.authorization, req.target, req.requested_tests, req.environment.timestamp);
  const stop_codes: StopCode[] = [];
  const reasons: string[] = [];
  let decision: ExecutionDecision;
  let execution_state: ExecutionState;

  if (authState === 'EXPIRED') { decision = 'EXECUTION_EXPIRED'; execution_state = 'BLOCKED'; stop_codes.push('STOP-AUTHORIZATION-EXPIRED'); }
  else if (authState === 'REVOKED') { decision = 'EXECUTION_REVOKED'; execution_state = 'REVOKED'; stop_codes.push('STOP-AUTHORIZATION-REVOKED'); }
  else {
    if (authState === 'MISSING') stop_codes.push('STOP-AUTHORIZATION-MISSING');
    else if (authState === 'MISMATCHED') stop_codes.push('STOP-AUTHORIZATION-MISMATCH');
    for (const gate of preflight.gates) {
      if (gate.result !== 'PASS') { const code = GATE_STOP[gate.gate_id]; if (code && !stop_codes.includes(code)) stop_codes.push(code); reasons.push(`${gate.gate_id}:${gate.result}`); }
    }
    if (containsSecret(req) || req.network.secret_in_payload || req.credential.secret_persisted_in_evidence) stop_codes.push('STOP-SECRET-DETECTED');
    const allPass = preflight.all_safety_critical_pass && authState === 'VALID' && stop_codes.length === 0;
    decision = allPass ? 'EXECUTION_ALLOWED' : 'EXECUTION_BLOCKED';
    execution_state = allPass ? 'READY' : 'BLOCKED';
  }
  if (stop_codes.length === 0 && decision !== 'EXECUTION_ALLOWED') stop_codes.push('STOP-UNKNOWN-CONDITION');   // fail closed

  return {
    schema: 'dkskill.evidence_execution_gate/1', version: 1, request_id: req.request_id,
    synthetic_test_only: req.synthetic_target || req.mechanics_demo, target: req.target, preflight,
    authorization_state: authState, network_isolation: req.network.isolation_status, decision, execution_state,
    stop_codes, reasons, execution_mode: 'EXECUTION_DISABLED', execution_enabled: false,
  };
}

// ---- future executor (DEFAULT OFF; no bypass flags) --------------------------------------------------------
export function executeEvidenceExecution(gate: ExecutionGate, opts: { mode?: ExecutionMode; dedicated_execution_authorization?: string | null } = {}): {
  schema: 'dkskill.evidence_execution_run/1'; execution_mode: ExecutionMode; executed: false; claude_invoked: false;
  authenticated: false; benchmark_invoked: false; spent: false; reason: string;
} {
  const mode = opts.mode ?? 'EXECUTION_DISABLED';
  // Execution is possible ONLY when the gate ALLOWS, network is VERIFIED, a dedicated authorization exists, and
  // LIVE is explicitly requested. Even then M8 performs nothing — it downgrades to DRY_RUN. There are NO bypass
  // flags (--force/--unsafe/--skip-preflight/--ignore-safety/--allow-unknown do not exist).
  const eligible = mode === 'LIVE' && gate.decision === 'EXECUTION_ALLOWED' && gate.network_isolation === 'VERIFIED' && !!opts.dedicated_execution_authorization;
  return {
    schema: 'dkskill.evidence_execution_run/1', execution_mode: eligible ? 'DRY_RUN' : mode,
    executed: false, claude_invoked: false, authenticated: false, benchmark_invoked: false, spent: false,
    reason: eligible
      ? 'Gate ALLOWED and eligible, but M8 performs no real execution — downgraded to DRY_RUN; nothing executed.'
      : 'Execution disabled (default). No Claude execution, no authentication, no spend, no benchmark, no Run A.',
  };
}

// ---- stop conditions (deterministic; unknown => fail closed) -----------------------------------------------
export function evaluateStopConditions(req: ExecutionRequest): { stop: boolean; conditions: StopCondition[] } {
  const t = req.target, e = req.environment, c: StopCondition[] = [];
  const add = (code: StopCode, description: string, triggered: boolean) => c.push({ code, description, triggered, fail_closed: true });
  add('STOP-BINARY-MISMATCH', 'binary hash != frozen', !!e.binary_sha256 && e.binary_sha256.toUpperCase() !== FROZEN_TARGET.binary_sha256!.toUpperCase());
  add('STOP-VERSION-MISMATCH', 'version != frozen', !!t.version && t.version !== FROZEN_TARGET.version);
  add('STOP-PLATFORM-MISMATCH', 'platform != frozen', !!t.platform && t.platform !== FROZEN_TARGET.platform);
  add('STOP-ARCHITECTURE-MISMATCH', 'arch != frozen', !!t.architecture && t.architecture !== FROZEN_TARGET.architecture);
  add('STOP-CHANNEL-MISMATCH', 'channel != frozen', !!t.channel && t.channel !== FROZEN_TARGET.channel);
  add('STOP-ENVIRONMENT-MISMATCH', 'environment != frozen', e.environment_id !== FROZEN_TARGET.environment_id);
  add('STOP-CONFIG-DIR-UNSAFE', 'config dir unsafe', !req.config_dir.is_dedicated_isolated || !req.config_dir.ownership_ok);
  add('STOP-REAL-CLAUDE-DIR-DETECTED', 'real ~/.claude detected', req.config_dir.points_to_real_claude || req.config_dir.path_overlaps_real_claude || req.config_dir.credential_copied_from_real);
  add('STOP-CREDENTIAL-AMBIGUOUS', 'credential ambiguous', !req.credential.credential_state_known);
  add('STOP-NETWORK-UNVERIFIED', 'network unverified', req.network.isolation_status !== 'VERIFIED' && req.network.isolation_status !== 'NOT_APPLICABLE');
  add('STOP-NETWORK-VIOLATION', 'network violation', req.network.violation);
  add('STOP-PROCESS-VIOLATION', 'unapproved process', req.processes.some((p) => !p.approved));
  add('STOP-FILESYSTEM-VIOLATION', 'filesystem violation', req.filesystem.unexpected_write || req.filesystem.touches_real_claude || req.filesystem.touches_production_registry || req.filesystem.touches_runtime_dir);
  add('STOP-AUTHORIZATION-MISSING', 'authorization missing', !req.authorization);
  add('STOP-AUTHORIZATION-MISMATCH', 'authorization mismatch', validateAuthorization(req.authorization, t, req.requested_tests, e.timestamp) === 'MISMATCHED');
  add('STOP-AUTHORIZATION-EXPIRED', 'authorization expired', validateAuthorization(req.authorization, t, req.requested_tests, e.timestamp) === 'EXPIRED');
  add('STOP-AUTHORIZATION-REVOKED', 'authorization revoked', req.authorization?.authorization_state === 'REVOKED');
  add('STOP-SCOPE-VIOLATION', 'scope violation', req.requested_tests.some((x) => !(ALLOWED_TESTS as readonly string[]).includes(x)) || req.requested_tests.length === 0);
  add('STOP-RUN-A-DETECTED', 'Run A requested', req.requested_run_a);
  add('STOP-BENCHMARK-DETECTED', 'benchmark requested', req.requested_benchmark);
  add('STOP-PUBLICATION-DETECTED', 'publication requested', req.requested_publication);
  add('STOP-REGISTRY-MUTATION-DETECTED', 'registry mutation requested', req.requested_registry_mutation);
  add('STOP-SECRET-DETECTED', 'secret detected', containsSecret(req) || req.network.secret_in_payload || req.credential.secret_persisted_in_evidence);
  add('STOP-EVIDENCE-INTEGRITY', 'no M7 plan bound', !req.m7_plan_id);
  add('STOP-UNKNOWN-CONDITION', 'm3 not exact', req.m3_resolution !== 'EXACT_MATCH');
  return { stop: c.some((x) => x.triggered), conditions: c };
}

// ---- resource limits ---------------------------------------------------------------------------------------
export function checkResourceLimits(usage: ResourceUsage, limits: ResourceLimits = RESOURCE_LIMITS): { ok: boolean; exceeded: string[] } {
  const exceeded: string[] = [];
  if (usage.wall_clock_ms > limits.max_wall_clock_ms) exceeded.push('wall_clock_ms');
  if (usage.process_count > limits.max_process_count) exceeded.push('process_count');
  if (usage.filesystem_output_bytes > limits.max_filesystem_output_bytes) exceeded.push('filesystem_output_bytes');
  if (usage.evidence_artifact_bytes > limits.max_evidence_artifact_bytes) exceeded.push('evidence_artifact_bytes');
  if (usage.network_destinations > limits.max_network_destinations) exceeded.push('network_destinations');
  if (usage.retries > limits.max_retries) exceeded.push('retries');
  return { ok: exceeded.length === 0, exceeded };
}

// ---- postflight (mandatory; never auto-invokes M4) ---------------------------------------------------------
export function runPostflight(input: {
  processes_cleaned: boolean; unexpected_process: boolean; filesystem_ok: boolean; real_claude_unchanged: boolean;
  production_registry_unchanged: boolean; runtime_absent: boolean; evidence_integrity_ok: boolean; secret_found: boolean;
  network_observation_integrity_ok: boolean; authorization_scope_ok: boolean; target_identity_ok: boolean;
  benchmark_invoked: boolean; run_a_executed: boolean; publication_done: boolean; certification_side_effect: boolean;
}): PostflightResult {
  const checks: PostflightCheck[] = [];
  const p = (check_id: string, name: string, ok: boolean, reasons: string[] = []) => checks.push({ check_id, name, result: ok ? 'PASS' : 'FAIL', reasons: ok ? [] : (reasons.length ? reasons : [name]) });
  p('PF-01', 'process cleanup', input.processes_cleaned);
  p('PF-02', 'no unexpected process', !input.unexpected_process);
  p('PF-03', 'filesystem audit', input.filesystem_ok);
  p('PF-04', 'real ~/.claude unchanged', input.real_claude_unchanged);
  p('PF-05', 'production registry unchanged', input.production_registry_unchanged);
  p('PF-06', '/runtime/ absent', input.runtime_absent);
  p('PF-07', 'evidence integrity', input.evidence_integrity_ok);
  p('PF-08', 'secret scan', !input.secret_found);
  p('PF-09', 'network observation integrity', input.network_observation_integrity_ok);
  p('PF-10', 'authorization scope compliance', input.authorization_scope_ok);
  p('PF-11', 'target identity compliance', input.target_identity_ok);
  p('PF-12', 'no benchmark invocation', !input.benchmark_invoked);
  p('PF-13', 'no Run A execution', !input.run_a_executed);
  p('PF-14', 'no publication', !input.publication_done);
  p('PF-15', 'no certification side effect', !input.certification_side_effect);
  const session_result = checks.every((c) => c.result === 'PASS') ? 'SESSION_OK' : 'SESSION_FAILED';
  return { checks, session_result, auto_certification_invoked: false };
}

// ---- immutable audit record (hash-chained) -----------------------------------------------------------------
export function auditHash(rec: Omit<ExecutionRecord, 'audit_hash'>): string { return sha256(canonicalJson(rec)); }
export function buildExecutionRecord(input: {
  execution_id: string; gate: ExecutionGate; authorization_id: string | null; plan_id: string | null;
  postflight: PostflightResult | null; evidence_hashes: string[]; clock: () => string; previous_audit_hash?: string | null;
}): ExecutionRecord {
  const base: Omit<ExecutionRecord, 'audit_hash'> = {
    schema: 'dkskill.evidence_execution_record/1', version: 1, execution_id: input.execution_id,
    authorization_id: input.authorization_id, plan_id: input.plan_id, target: input.gate.target,
    binary_sha256: input.gate.target.binary_sha256, environment_id: input.gate.target.environment_id,
    preflight_results: input.gate.preflight.gates.map((x) => ({ gate_id: x.gate_id, result: x.result })),
    execution_state: input.gate.execution_state, decision: input.gate.decision,
    stop_reason: input.gate.stop_codes[0] ?? null,
    postflight_results: input.postflight ? input.postflight.checks.map((x) => ({ check_id: x.check_id, result: x.result })) : [],
    evidence_hashes: input.evidence_hashes, timestamp: input.clock(), previous_audit_hash: input.previous_audit_hash ?? null,
  };
  return { ...base, audit_hash: auditHash(base) };
}
export function chainExecutionRecords(records: (Omit<ExecutionRecord, 'audit_hash' | 'previous_audit_hash'>)[]): ExecutionRecord[] {
  const out: ExecutionRecord[] = []; let prev: string | null = null;
  for (const r of records) { const base = { ...r, previous_audit_hash: prev } as Omit<ExecutionRecord, 'audit_hash'>; const audit_hash = auditHash(base); out.push({ ...base, audit_hash }); prev = audit_hash; }
  return out;
}
export function verifyAuditChain(records: ExecutionRecord[]): boolean {
  let prev: string | null = null;
  for (const r of records) {
    if (r.previous_audit_hash !== prev) return false;
    const { audit_hash, ...rest } = r;
    if (auditHash(rest) !== audit_hash) return false;
    prev = audit_hash!;
  }
  return true;
}
