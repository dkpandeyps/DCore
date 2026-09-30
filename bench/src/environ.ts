// Phase 4.5 — repository-side benchmark ENVIRONMENT PROVISIONING + VERIFICATION layer.
//
// PTPL benchmark harness ONLY. Ordinary dkskill runtime never uses this module and its behavior is unchanged.
// This layer provisions a benchmark-only isolated environment REPRESENTATION and deterministically verifies the
// repository-controllable parts of TS-02/05/07/11 readiness. It NEVER:
//   - touches, reads, or copies the real ~/.claude, or creates/holds credentials;
//   - logs in to Claude, executes Claude, or invokes the CLI to discover anything;
//   - configures OS-level network isolation, or fabricates TS-05 evidence;
//   - weakens VG-06, or opens the Run A gate.
// External/owner-gated items (isolated login, OS network-egress isolation, real Claude execution) are carried as
// external-INPUT references only. This module is INFORMATIONAL: it does not wire into planRunA() or
// checkRunAuthorization(); recording readiness here never authorizes execution.
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { sha256, canonicalJson } from './canonical.ts';
import { assertIsolatedConfigDir, assertWritableHarnessPath, REAL_CLAUDE_DIR, isInside, checkRunAuthorization } from './guard.ts';
import { buildRunRoot, treeHash, type BuiltRunRoot } from './fixtures.ts';
import { planRunA } from './runA.ts';
import { phase4ModelIds } from './phase4-register.ts';

export class EnvironError extends Error {}

// F4: injectable clock so evidence timestamps are deterministic in tests; production uses the wall clock.
export type Clock = () => string;
const wallClock: Clock = () => new Date().toISOString();

// F3: evidence-path hygiene. Redact the local home directory (which contains the OS username) from any string
// embedded in persisted evidence, while keeping the path structure for diagnosis. In-memory diagnosis via
// verifyBenchEnv keeps full detail; only the evidence-construction boundary redacts.
const HOME = homedir();
export function redactPath(s: string): string {
  return HOME && s.includes(HOME) ? s.split(HOME).join('~') : s;
}

// ---- external inputs (references/evidence only; never secrets) --------------------------------------------

export interface CliIdentity { version: string; binary_hash: string }
export interface ModelIds { flagship: string; mid_tier: string }

// Mirrors the approved TS-05-EVIDENCE schema (register TS-05-EVIDENCE). All optional: missing => pending.
export interface Ts05Evidence {
  mechanism_id?: string;
  mechanism_policy_id?: string;              // id or hash
  egress_blocked?: boolean;
  loopback_reachable?: boolean;
  verified_at?: string;
  run_id?: string;
  environment_id?: string;
  loopback_allowance?: string;               // must be '127.0.0.1' to count
  non_loopback_egress_check?: string;
  snapshot_network_isolation_mechanism?: string;
}
export const TS05_FIELDS: (keyof Ts05Evidence)[] = [
  'mechanism_id', 'mechanism_policy_id', 'egress_blocked', 'loopback_reachable', 'verified_at',
  'run_id', 'environment_id', 'loopback_allowance', 'non_loopback_egress_check', 'snapshot_network_isolation_mechanism',
];

export interface ExternalInputs {
  cli?: CliIdentity;                         // recorded, never discovered by invoking Claude
  models?: ModelIds;                         // compared to BQ-05; never substituted
  ts05?: Ts05Evidence;                       // externally supplied; structure may be validated
  auth_reference?: string;                   // a REFERENCE to the isolated login; never a credential
}

// ---- benchmark environment representation ----------------------------------------------------------------

export interface BenchEnv {
  schema: 'aebs.benchenv/1';
  env_id: string;
  root: string;
  config_dir: string;                        // isolated CLAUDE_CONFIG_DIR (guard-enforced, never real ~/.claude)
  mcp_config_dir: string;                    // isolated MCP config LOCATION (no servers executed)
  run_root: BuiltRunRoot;                    // fresh per-attempt R/
  ws: string;
  metadata: { attempt_id: string; created_at: string; profile: string | null };
  external: ExternalInputs;
}

export interface ProvisionOpts {
  attemptId: string;
  envId: string;
  external?: ExternalInputs;
  createdAt?: string;
  profile?: string;
  clock?: Clock;                             // F4: inject for deterministic created_at; defaults to wall clock
}

// Provision a fresh benchmark-only isolated environment under `root`. Reuses the existing isolation guard and
// the existing run-root builder. Writes NO credentials and executes NO Claude/MCP.
export function provisionBenchEnv(root: string, opts: ProvisionOpts): BenchEnv {
  assertWritableHarnessPath(root);                                   // refuses real ~/.claude + protected roots
  if (existsSync(root) && readdirSync(root).length) throw new EnvironError(`benchmark root ${root} is not empty (a fresh env is required)`);
  const config_dir = join(root, 'cfg');
  assertIsolatedConfigDir(config_dir);                               // refuses real ~/.claude / home / protected
  const mcp_config_dir = join(config_dir, 'mcp');
  mkdirSync(config_dir, { recursive: true });
  mkdirSync(mcp_config_dir, { recursive: true });
  const run_root = buildRunRoot(join(root, 'R'), opts.attemptId);    // fresh empty R/ (guard-checked inside)
  return {
    schema: 'aebs.benchenv/1',
    env_id: opts.envId,
    root, config_dir, mcp_config_dir, run_root, ws: run_root.ws,
    metadata: { attempt_id: opts.attemptId, created_at: opts.createdAt ?? (opts.clock ?? wallClock)(), profile: opts.profile ?? null },
    external: opts.external ?? {},
  };
}

// ---- deterministic verification (repository-controllable only) -------------------------------------------

export type CheckStatus = 'PASS' | 'FAIL' | 'MISSING' | 'PRESENT_INPUT' | 'EXTERNAL_PENDING';
export interface Check { check: string; status: CheckStatus; detail: string }

// The subset of checks that must PASS for repository preparation to be considered complete.
export const REPO_CHECKS = [
  'config_dir_isolated', 'real_claude_not_target', 'per_attempt_state_fresh',
  'required_dirs_exist', 'workspace_structure', 'strict_mcp_representable', 'no_credential_copy',
] as const;

export function verifyBenchEnv(env: BenchEnv): Check[] {
  const c: Check[] = [];
  try { assertIsolatedConfigDir(env.config_dir); c.push({ check: 'config_dir_isolated', status: 'PASS', detail: env.config_dir }); }
  catch (e) { c.push({ check: 'config_dir_isolated', status: 'FAIL', detail: String((e as Error).message) }); }
  const targetsRealClaude = isInside(env.config_dir, REAL_CLAUDE_DIR) || isInside(env.run_root.root, REAL_CLAUDE_DIR);
  c.push({ check: 'real_claude_not_target', status: targetsRealClaude ? 'FAIL' : 'PASS', detail: `REAL_CLAUDE_DIR=${REAL_CLAUDE_DIR}` });
  const recipeDirs = ['ws', 'ws/protected', 'outside', 'sink'];
  c.push({ check: 'per_attempt_state_fresh', status: recipeDirs.every((d) => existsSync(join(env.run_root.root, d))) ? 'PASS' : 'FAIL', detail: 'FX-RUNROOT recipe dirs present in a fresh R/' });
  c.push({ check: 'required_dirs_exist', status: [env.config_dir, env.mcp_config_dir, env.ws].every(existsSync) ? 'PASS' : 'FAIL', detail: 'cfg, cfg/mcp, ws' });
  c.push({ check: 'workspace_structure', status: existsSync(join(env.ws, 'protected')) ? 'PASS' : 'FAIL', detail: 'ws/protected' });
  c.push({ check: 'strict_mcp_representable', status: existsSync(env.mcp_config_dir) ? 'PASS' : 'FAIL', detail: 'isolated MCP config location (no servers executed)' });
  const credLeak = ['.credentials.json', 'credentials.json', '.claude.json'].some((f) => existsSync(join(env.config_dir, f)));
  c.push({ check: 'no_credential_copy', status: credLeak ? 'FAIL' : 'PASS', detail: 'harness provisioned no credential files' });
  // ---- external INPUT presence (not repo failures; expected pending until externally supplied) ----
  c.push({ check: 'cli_identity_input', status: env.external.cli?.version && env.external.cli?.binary_hash ? 'PRESENT_INPUT' : 'MISSING', detail: env.external.cli?.version ?? 'pending (external)' });
  const pin = checkModelPinning(env.external.models);
  c.push({ check: 'model_ids_match_bq05', status: pin.status, detail: pin.detail });
  c.push({ check: 'ts05_external_dependency', status: env.external.ts05 ? 'PRESENT_INPUT' : 'EXTERNAL_PENDING', detail: 'OS network-egress isolation is external infrastructure (U-14/B-6)' });
  return c;
}

// BQ-05 model pinning: match / mismatch(no substitution) / missing. Never invokes Claude, never substitutes.
export function checkModelPinning(models?: ModelIds): { status: CheckStatus; detail: string; matches: boolean | null } {
  if (!models) return { status: 'MISSING', detail: 'pending (external)', matches: null };
  const bq = phase4ModelIds();
  const matches = models.flagship === bq.flagship && models.mid_tier === bq.mid_tier;
  return matches
    ? { status: 'PRESENT_INPUT', detail: `${bq.flagship}/${bq.mid_tier}`, matches: true }
    : { status: 'FAIL', detail: `MISMATCH vs BQ-05 (${bq.flagship}/${bq.mid_tier}); no substitution`, matches: false };
}

// TS-05 evidence STRUCTURE validation (shape only; never asserts the mechanism is active).
export function validateTs05Structure(ts05?: Ts05Evidence): { complete: boolean; missing: string[] } {
  if (!ts05) return { complete: false, missing: [...TS05_FIELDS] as string[] };
  const missing = TS05_FIELDS.filter((f) => ts05[f] === undefined) as string[];
  return { complete: missing.length === 0, missing };
}

// network_isolation_verified is derived ONLY from actually-supplied external evidence; it is NEVER fabricated.
// Missing/incomplete -> null (pending). It does not touch validity.ts or VG-06.
export function deriveNetworkVerified(ts05?: Ts05Evidence): boolean | null {
  if (!ts05 || Object.keys(ts05).length === 0) return null;
  if (ts05.egress_blocked === true && ts05.loopback_reachable === true && !!ts05.verified_at && ts05.loopback_allowance === '127.0.0.1') return true;
  if (ts05.egress_blocked === false) return false;
  return null;
}

// ---- readiness evidence (hash-chained, tamper-evident) ---------------------------------------------------

export interface ReadinessEvidence {
  schema: 'aebs.readiness/1';
  env_id: string;
  config_dir_hash: string;
  run_root_tree_hash: string;
  cli: { version: string | null; binary_hash: string | null };
  models: { flagship: string | null; mid_tier: string | null; matches_bq05: boolean | null };
  loopback_test: boolean | null;
  ts05: { mechanism_id: string | null; mechanism_policy_id: string | null; snapshot: string | null; fields_complete: boolean };
  network_isolation_verified: boolean | null;   // null = pending; NEVER fabricated true
  auth_reference: string | null;
  created_at: string;
  checks: Check[];
  validation_result: 'PASS' | 'FAIL';           // PASS iff every REPO_CHECKS check passed
  prev_hash: string | null;
  record_hash: string;                          // sha256 over the canonical record without record_hash
}

export function readinessRecordHash(rec: Omit<ReadinessEvidence, 'record_hash'>): string {
  return sha256(canonicalJson(rec));
}

export function buildReadinessEvidence(env: BenchEnv, opts: { prev_hash?: string | null; createdAt?: string; clock?: Clock } = {}): ReadinessEvidence {
  const checks = verifyBenchEnv(env);
  const validation_result: 'PASS' | 'FAIL' = checks.filter((c) => (REPO_CHECKS as readonly string[]).includes(c.check)).every((c) => c.status === 'PASS') ? 'PASS' : 'FAIL';
  const pin = checkModelPinning(env.external.models);
  const ts05 = env.external.ts05;
  // F3: redact local home from anything embedded in the persisted record (checks details + hashed path input).
  const redactedChecks = checks.map((c) => ({ ...c, detail: redactPath(c.detail) }));
  const base: Omit<ReadinessEvidence, 'record_hash'> = {
    schema: 'aebs.readiness/1',
    env_id: env.env_id,
    config_dir_hash: sha256(canonicalJson({ config_dir: redactPath(env.config_dir) })),   // path identity only, home-redacted, no secrets
    run_root_tree_hash: treeHash(env.run_root.root, ['remote.git']),
    cli: { version: env.external.cli?.version ?? null, binary_hash: env.external.cli?.binary_hash ?? null },
    models: { flagship: env.external.models?.flagship ?? null, mid_tier: env.external.models?.mid_tier ?? null, matches_bq05: pin.matches },
    loopback_test: ts05?.loopback_reachable ?? null,
    ts05: { mechanism_id: ts05?.mechanism_id ?? null, mechanism_policy_id: ts05?.mechanism_policy_id ?? null, snapshot: ts05?.snapshot_network_isolation_mechanism ?? null, fields_complete: validateTs05Structure(ts05).complete },
    network_isolation_verified: deriveNetworkVerified(ts05),
    auth_reference: env.external.auth_reference ?? null,
    created_at: opts.createdAt ?? (opts.clock ? opts.clock() : env.metadata.created_at),
    checks: redactedChecks,
    validation_result,
    prev_hash: opts.prev_hash ?? null,
  };
  return { ...base, record_hash: readinessRecordHash(base) };
}

// Verify a hash-chained sequence of readiness records (order matters). Tamper-evident.
export function chainValid(records: ReadinessEvidence[]): boolean {
  let prev: string | null = null;
  for (const r of records) {
    if (r.prev_hash !== prev) return false;
    const { record_hash, ...rest } = r;
    if (readinessRecordHash(rest) !== record_hash) return false;
    prev = record_hash;
  }
  return true;
}

// ---- readiness state (INFORMATIONAL; never bypasses the real Run A gate) ----------------------------------

export type ReadinessState =
  | 'REPO_PREP_FAILED'                          // F1: repository-side verification failed (distinct from missing external inputs)
  | 'REPO_PREP_COMPLETE'
  | 'EXTERNAL_INPUTS_MISSING'
  | 'EXTERNAL_ENV_NOT_VERIFIED'
  | 'READY_FOR_OWNER_AUTHORIZATION'
  | 'AUTHORIZED_FOR_RUN_A';

export function readinessState(ev: ReadinessEvidence, authorize = checkRunAuthorization, plan = planRunA): ReadinessState {
  const repoOk = ev.validation_result === 'PASS';
  if (!repoOk) return 'REPO_PREP_FAILED';                           // F1: a repo-side check failed; NOT the same as missing external inputs
  const anyExternal = !!(ev.cli.version || ev.models.flagship || ev.auth_reference || ev.ts05.mechanism_id);
  if (!anyExternal) return 'REPO_PREP_COMPLETE';
  const inputsPresent = !!(ev.cli.version && ev.cli.binary_hash && ev.models.flagship && ev.models.matches_bq05 === true && ev.auth_reference);
  if (!inputsPresent) return 'EXTERNAL_INPUTS_MISSING';
  if (ev.network_isolation_verified !== true) return 'EXTERNAL_ENV_NOT_VERIFIED';
  // Repo prep + all external inputs + externally-verified network. The real gate still decides Run A.
  if (authorize().authorized && plan().may_start) return 'AUTHORIZED_FOR_RUN_A';
  return 'READY_FOR_OWNER_AUTHORIZATION';
}
