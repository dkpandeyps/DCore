// M8 — deterministic execution-gate demonstration artifacts + SYNTHETIC_TEST_ONLY fixtures.
// Executes NO Claude, authenticates nothing, spends nothing, accesses no network, performs no live discovery.
// The current real target returns EXECUTION_BLOCKED (network isolation UNVERIFIED — never fabricated). The
// all-pass fixture is a SYNTHETIC_TEST_ONLY gate-mechanics demonstration and does NOT execute Claude Code.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile } from '../src/canonical.ts';
import {
  FROZEN_TARGET, ALLOWED_TESTS, buildExecutionAuthorization, evaluateEvidenceExecutionGate, m3Resolve,
  runPostflight, buildExecutionRecord, RESOURCE_LIMITS,
} from '../compatibility/evidence-execution.ts';
import type {
  ExecutionRequest, ExecutionAuthorization, EnvironmentSnapshot, ExecutionTarget,
} from '../compatibility/evidence-execution-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
export const FIXED = () => '2026-09-29T00:00:00Z';
export const SYN = 'SYNTHETIC_TEST_ONLY';

export function frozenEnv(over: Partial<EnvironmentSnapshot> = {}): EnvironmentSnapshot {
  return {
    schema: 'dkskill.evidence_execution_env_snapshot/1', environment_id: FROZEN_TARGET.environment_id, os: 'Windows 11',
    platform: 'win32', architecture: 'x64', claude_code_version: '2.1.283', binary_sha256: FROZEN_TARGET.binary_sha256,
    config_directory_identity: 'isolated-cfg://PTPL-DK-BENCH-WIN-01 (dedicated)', isolation_status: 'ISOLATED',
    credential_status: 'ISOLATED_EMPTY', network_status: 'UNVERIFIED', toolchain_identity: 'node>=24; win32-x64',
    timestamp: FIXED(), ...over,
  };
}
export function frozenAuth(over: Partial<ExecutionAuthorization> = {}): ExecutionAuthorization {
  return { ...buildExecutionAuthorization({ authorization_id: 'exec-auth-283', authorized_by: 'OWNER-EXEC-REF', target: FROZEN_TARGET, allowed_tests: ['TS-07', 'TS-11'], clock: FIXED }), ...over };
}

// Base request = current real target, all local safety attested, but network isolation UNVERIFIED.
export function baseRequest(over: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    request_id: 'exec-req-real-283', m7_plan_id: 'plan-req-real-283', target: { ...FROZEN_TARGET },
    authorization: frozenAuth(), environment: frozenEnv(), requested_tests: ['TS-07', 'TS-11'],
    config_dir: { expected_config_dir: 'isolated-cfg://PTPL-DK-BENCH-WIN-01', observed_config_dir: 'isolated-cfg://PTPL-DK-BENCH-WIN-01', is_dedicated_isolated: true, points_to_real_claude: false, path_overlaps_real_claude: false, credential_copied_from_real: false, ownership_ok: true },
    credential: { api_key_injected: false, unauthorized_token_present: false, dedicated_config_dir: true, real_claude_credential_copy: false, credential_state_known: true, secret_persisted_in_evidence: false },
    processes: [{ process_identity: 'claude-code', executable_path: 'isolated/claude', hash: FROZEN_TARGET.binary_sha256, start_time: FIXED(), parent: 'evidence-runner', approved: true }],
    filesystem: { allowed_roots: ['evidence-ws', 'isolated-cfg'], observed_write_roots: ['evidence-ws'], unexpected_write: false, touches_real_claude: false, touches_production_registry: false, touches_runtime_dir: false, state_known: true },
    network: { isolation_status: 'UNVERIFIED', observation_source: 'UNAVAILABLE', destinations: [], violation: false, secret_in_payload: false },
    m3_resolution: m3Resolve(FROZEN_TARGET), synthetic_target: false, mechanics_demo: false,
    requested_run_a: false, requested_benchmark: false, requested_publication: false, requested_registry_mutation: false,
    substitute_binary: false, substitute_model: false, toolchain_identity: 'node>=24; win32-x64', ...over,
  };
}

// All-pass gate mechanics (SYNTHETIC_TEST_ONLY): network VERIFIED as a hypothetical demonstration only.
export function mechanicsAllPassRequest(): ExecutionRequest {
  return baseRequest({ request_id: 'exec-req-mechanics-demo', mechanics_demo: true, network: { isolation_status: 'VERIFIED', observation_source: 'MECHANICS_DEMO', destinations: [], violation: false, secret_in_payload: false } });
}

export const fixtures = {
  currentReal: () => baseRequest(),
  networkUnverified: () => baseRequest({ request_id: 'exec-req-net-unverified' }),
  binaryMismatch: () => baseRequest({ request_id: 'exec-req-bin-mismatch', environment: frozenEnv({ binary_sha256: 'A'.repeat(64) }) }),
  versionMismatch: () => baseRequest({ request_id: 'exec-req-ver-mismatch', target: { ...FROZEN_TARGET, version: '2.1.999' }, environment: frozenEnv({ claude_code_version: '2.1.999' }) }),
  platformMismatch: () => baseRequest({ request_id: 'exec-req-plat-mismatch', target: { ...FROZEN_TARGET, platform: 'linux' }, environment: frozenEnv({ platform: 'linux' }) }),
  archMismatch: () => baseRequest({ request_id: 'exec-req-arch-mismatch', target: { ...FROZEN_TARGET, architecture: 'arm64' }, environment: frozenEnv({ architecture: 'arm64' }) }),
  channelMismatch: () => baseRequest({ request_id: 'exec-req-chan-mismatch', target: { ...FROZEN_TARGET, channel: 'beta' } }),
  environmentMismatch: () => baseRequest({ request_id: 'exec-req-env-mismatch', target: { ...FROZEN_TARGET, environment_id: 'OTHER-ENV' }, environment: frozenEnv({ environment_id: 'OTHER-ENV' }) }),
  realClaudeDetected: () => baseRequest({ request_id: 'exec-req-real-claude', config_dir: { ...baseRequest().config_dir, points_to_real_claude: true } }),
  unsafeConfigDir: () => baseRequest({ request_id: 'exec-req-unsafe-cfg', config_dir: { ...baseRequest().config_dir, is_dedicated_isolated: false, ownership_ok: false } }),
  credentialAmbiguous: () => baseRequest({ request_id: 'exec-req-cred-ambig', credential: { ...baseRequest().credential, credential_state_known: false }, environment: frozenEnv({ credential_status: 'AMBIGUOUS' }) }),
  missingAuthorization: () => baseRequest({ request_id: 'exec-req-no-auth', authorization: null }),
  authorizationMismatch: () => baseRequest({ request_id: 'exec-req-auth-mismatch', authorization: frozenAuth({ target_binary_sha256: 'B'.repeat(64) }) }),
  expiredAuthorization: () => baseRequest({ request_id: 'exec-req-auth-expired', authorization: frozenAuth({ expiration: '2020-01-01T00:00:00Z' }) }),
  revokedAuthorization: () => baseRequest({ request_id: 'exec-req-auth-revoked', authorization: frozenAuth({ authorization_state: 'REVOKED' }) }),
  runARequest: () => baseRequest({ request_id: 'exec-req-run-a', requested_run_a: true }),
  benchmarkRequest: () => baseRequest({ request_id: 'exec-req-benchmark', requested_benchmark: true }),
  publicationRequest: () => baseRequest({ request_id: 'exec-req-publication', requested_publication: true }),
  registryMutationRequest: () => baseRequest({ request_id: 'exec-req-registry', requested_registry_mutation: true }),
  unexpectedProcess: () => baseRequest({ request_id: 'exec-req-proc', processes: [{ process_identity: 'evil.exe', executable_path: 'x', hash: null, start_time: FIXED(), parent: '?', approved: false }] }),
  unexpectedWrite: () => baseRequest({ request_id: 'exec-req-fs', filesystem: { ...baseRequest().filesystem, unexpected_write: true } }),
  networkViolation: () => baseRequest({ request_id: 'exec-req-net-violation', network: { isolation_status: 'FAILED', observation_source: 'live-probe', destinations: [{ process: 'claude', host: 'example.com', port: 443, protocol: 'https', timestamp: FIXED(), allowed: false, source: 'live-probe' }], violation: true, secret_in_payload: false } }),
  secretDetected: () => baseRequest({ request_id: 'exec-req-secret', credential: { ...baseRequest().credential, secret_persisted_in_evidence: true }, network: { isolation_status: 'VERIFIED', observation_source: 'live-probe', destinations: [], violation: false, secret_in_payload: true } }),
  m7PlanMismatch: () => baseRequest({ request_id: 'exec-req-no-plan', m7_plan_id: null }),
  m3Mismatch: () => baseRequest({ request_id: 'exec-req-m3', target: { ...FROZEN_TARGET, binary_sha256: 'C'.repeat(64) }, environment: frozenEnv({ binary_sha256: 'C'.repeat(64) }), m3_resolution: m3Resolve({ ...FROZEN_TARGET, binary_sha256: 'C'.repeat(64) }) }),
  syntheticTarget: () => baseRequest({ request_id: 'exec-req-synthetic', synthetic_target: true }),
  binarySubstitution: () => baseRequest({ request_id: 'exec-req-bin-sub', substitute_binary: true }),
  modelSubstitution: () => baseRequest({ request_id: 'exec-req-model-sub', substitute_model: true }),
  mechanicsAllPass: () => mechanicsAllPassRequest(),
};

export function postflightFailureSample() {
  return runPostflight({ processes_cleaned: true, unexpected_process: false, filesystem_ok: true, real_claude_unchanged: false, production_registry_unchanged: true, runtime_absent: true, evidence_integrity_ok: true, secret_found: false, network_observation_integrity_ok: true, authorization_scope_ok: true, target_identity_ok: true, benchmark_invoked: false, run_a_executed: false, publication_done: false, certification_side_effect: false });
}
export function auditRecordSample() {
  const gate = evaluateEvidenceExecutionGate(fixtures.currentReal());
  return buildExecutionRecord({ execution_id: 'exec-283-attempt-1', gate, authorization_id: 'exec-auth-283', plan_id: 'plan-req-real-283', postflight: null, evidence_hashes: [], clock: FIXED, previous_audit_hash: null });
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const g = (req: ExecutionRequest) => evaluateEvidenceExecutionGate(req);
  const files: [string, unknown][] = [
    ['exec-sample-current-real-blocked.json', g(fixtures.currentReal())],
    ['exec-sample-network-unverified.json', g(fixtures.networkUnverified())],
    ['exec-sample-binary-mismatch.json', g(fixtures.binaryMismatch())],
    ['exec-sample-authorization-mismatch.json', g(fixtures.authorizationMismatch())],
    ['exec-sample-run-a-rejected.json', g(fixtures.runARequest())],
    ['exec-sample-benchmark-rejected.json', g(fixtures.benchmarkRequest())],
    ['exec-sample-mechanics-all-pass.json', g(fixtures.mechanicsAllPass())],
    ['exec-sample-postflight-failure.json', postflightFailureSample()],
    ['exec-sample-audit-record.json', auditRecordSample()],
  ];
  for (const [name, obj] of files) writeFileSync(join(OUT, name), canonicalFile(obj));
  const real = g(fixtures.currentReal());
  console.log(`M8 samples: current-real=${real.decision} (net=${real.network_isolation}, stops=${real.stop_codes.join('|')}); mechanics=${g(fixtures.mechanicsAllPass()).decision}; limits(wall=${RESOURCE_LIMITS.max_wall_clock_ms})`);
}

if (process.argv[1]?.endsWith('gen-evidence-execution-sample.ts')) main();
