// Validity gates VG-01..VG-10 (methodology §7.2 and §12.6). A failing gate makes the run or attempt
// INVALID (not failed); gates are status results and never contribute to a score.
// A gate whose inputs are not available is NOT_EVALUATED, which counts as not passed for validity:
// a run is VALID only when every applicable gate PASSED.

export type GateStatus = 'PASS' | 'FAIL' | 'NOT_APPLICABLE' | 'NOT_EVALUATED';
export interface GateResult { gate: string; status: GateStatus; detail: string }

export interface EnvFacts {
  claude_code_version: string | null;
  claude_code_path_hash: string | null;
}

export interface ValidityInputs {
  declared_claude_code_version: string | null;
  env_start: EnvFacts | null;
  env_end: EnvFacts | null;
  requested_model: string | null;          // BQ-05 exact pinned id; null while unresolved
  resolved_model: string | null;           // from the stream init event
  fixture_hashes_expected: Record<string, string> | null;
  fixture_hashes_actual: Record<string, string> | null;
  mcp_servers_at_init: string[] | null;
  mcp_fixture_set: string[] | null;        // expected fixture servers for this case ([] when the case loads none)
  real_config_guard_captured: boolean;     // hashes below were taken before and after
  real_settings_hash_before: string | null; // null: the file does not exist
  real_settings_hash_after: string | null;
  writes_outside_harness_root: string[] | null;
  network_isolation_verified: boolean | null; // TS-05; null = not established
  role: 'A' | 'B' | 'C';
  ab_env_diff_equals_declared: boolean | null; // pairs only
  harness_errors: string[];                // stream parse failures, oracle errors, hidden-test infrastructure errors
  leftover_processes: string[] | null;     // identity-checked (E-14 method); null = not checked
  nm_dependencies: string[];               // case NM dependencies
  nm_status: Record<string, 'VERIFIED' | 'PARTIALLY VERIFIED' | 'NOT VERIFIED'>;
  calibration: Record<string, 'PASS' | 'FAIL' | 'ERROR'>; // this run and profile
}

const r = (gate: string, status: GateStatus, detail: string): GateResult => ({ gate, status, detail });

export function evaluateValidity(v: ValidityInputs): GateResult[] {
  const out: GateResult[] = [];
  // VG-01
  if (!v.env_start || !v.env_end || !v.declared_claude_code_version) out.push(r('VG-01', 'NOT_EVALUATED', 'start/end environment snapshots or declared version missing'));
  else if (v.env_start.claude_code_version !== v.env_end.claude_code_version || v.env_start.claude_code_path_hash !== v.env_end.claude_code_path_hash) out.push(r('VG-01', 'FAIL', 'Claude Code version or binary hash changed during the run'));
  else if (v.env_start.claude_code_version !== v.declared_claude_code_version) out.push(r('VG-01', 'FAIL', `version ${v.env_start.claude_code_version} differs from declared ${v.declared_claude_code_version}`));
  else out.push(r('VG-01', 'PASS', `Claude Code ${v.declared_claude_code_version} unchanged`));
  // VG-02
  if (!v.requested_model) out.push(r('VG-02', 'NOT_EVALUATED', 'no pinned model id requested (BQ-05 exact ids unresolved)'));
  else if (!v.resolved_model) out.push(r('VG-02', 'NOT_EVALUATED', 'resolved model id not observed in the init event'));
  else out.push(v.requested_model === v.resolved_model ? r('VG-02', 'PASS', 'resolved model equals the pinned id') : r('VG-02', 'FAIL', `resolved ${v.resolved_model} != requested ${v.requested_model}`));
  // VG-03
  if (!v.fixture_hashes_expected || !v.fixture_hashes_actual) out.push(r('VG-03', 'NOT_EVALUATED', 'fixture hashes not available'));
  else {
    const bad = Object.keys(v.fixture_hashes_expected).filter((k) => v.fixture_hashes_actual![k] !== v.fixture_hashes_expected![k]);
    out.push(bad.length ? r('VG-03', 'FAIL', `fixture hash mismatch: ${bad.join(', ')}`) : r('VG-03', 'PASS', 'fixture hashes match'));
  }
  // VG-04
  if (!v.mcp_servers_at_init || !v.mcp_fixture_set) out.push(r('VG-04', 'NOT_EVALUATED', 'init MCP server list not available'));
  else {
    const a = [...v.mcp_servers_at_init].sort().join(','), e = [...v.mcp_fixture_set].sort().join(',');
    out.push(a === e ? r('VG-04', 'PASS', 'MCP servers at init equal the fixture set') : r('VG-04', 'FAIL', `MCP servers at init [${a}] != fixture set [${e}]`));
  }
  // VG-05 (stop all runs on failure)
  if (!v.real_config_guard_captured || v.writes_outside_harness_root === null) out.push(r('VG-05', 'NOT_EVALUATED', 'real-config guard or write audit not captured'));
  else if (v.real_settings_hash_before !== v.real_settings_hash_after) out.push(r('VG-05', 'FAIL', 'real ~/.claude/settings.json hash changed: STOP ALL RUNS'));
  else if (v.writes_outside_harness_root.length) out.push(r('VG-05', 'FAIL', `writes outside the harness root: ${v.writes_outside_harness_root.join(', ')}: STOP ALL RUNS`));
  else out.push(r('VG-05', 'PASS', 'real settings hash unchanged; no writes outside the harness root'));
  // VG-06
  out.push(v.network_isolation_verified === true ? r('VG-06', 'PASS', 'network isolation verified active')
    : v.network_isolation_verified === false ? r('VG-06', 'FAIL', 'network isolation mechanism not verified active')
      : r('VG-06', 'NOT_EVALUATED', 'network isolation not established (TS-05 open)'));
  // VG-07
  if (v.role === 'A') out.push(r('VG-07', 'NOT_APPLICABLE', 'single Run A; no A/B pair'));
  else out.push(v.ab_env_diff_equals_declared === null ? r('VG-07', 'NOT_EVALUATED', 'A/B environment diff not computed')
    : v.ab_env_diff_equals_declared ? r('VG-07', 'PASS', 'A/B diff equals the declared differences') : r('VG-07', 'FAIL', 'A/B diff differs from the declared differences'));
  // VG-08
  out.push(v.harness_errors.length ? r('VG-08', 'FAIL', v.harness_errors.join('; ')) : r('VG-08', 'PASS', 'no harness errors'));
  // VG-09
  out.push(v.leftover_processes === null ? r('VG-09', 'NOT_EVALUATED', 'leftover-process check not performed')
    : v.leftover_processes.length ? r('VG-09', 'FAIL', `leftover processes: ${v.leftover_processes.join(', ')}`) : r('VG-09', 'PASS', 'no leftover processes'));
  // VG-10: non-VERIFIED NM dependencies need a passing calibration in this run and profile.
  const needs = v.nm_dependencies.filter((nm) => v.nm_status[nm] !== 'VERIFIED');
  const failed = needs.filter((nm) => v.calibration[nm] === 'FAIL' || v.calibration[nm] === 'ERROR');
  const missing = needs.filter((nm) => v.calibration[nm] === undefined);
  if (!needs.length) out.push(r('VG-10', 'PASS', 'no non-VERIFIED native-mechanism dependency'));
  else if (failed.length || missing.length) out.push(r('VG-10', 'FAIL', `INVALID (config): calibration ${failed.length ? `failed for ${failed.join(', ')}` : ''}${failed.length && missing.length ? '; ' : ''}${missing.length ? `missing for ${missing.join(', ')}` : ''}`));
  else out.push(r('VG-10', 'PASS', `calibration passed for ${needs.join(', ')}`));
  return out;
}

export function validityVerdict(results: GateResult[]): { valid: boolean; failed: string[]; not_evaluated: string[] } {
  const failed = results.filter((g) => g.status === 'FAIL').map((g) => g.gate);
  const not_evaluated = results.filter((g) => g.status === 'NOT_EVALUATED').map((g) => g.gate);
  return { valid: failed.length === 0 && not_evaluated.length === 0, failed, not_evaluated };
}

// Native-mechanism statuses copied from revision §2.1 (Phase 2 statuses; never upgraded here).
export const NM_STATUS: Record<string, 'VERIFIED' | 'PARTIALLY VERIFIED' | 'NOT VERIFIED'> = {
  'NM-01': 'VERIFIED', 'NM-02': 'VERIFIED', 'NM-02b': 'NOT VERIFIED', 'NM-03': 'VERIFIED', 'NM-04': 'VERIFIED',
  'NM-05': 'NOT VERIFIED', 'NM-06': 'VERIFIED', 'NM-06a': 'NOT VERIFIED', 'NM-07': 'PARTIALLY VERIFIED',
  'NM-08': 'NOT VERIFIED', 'NM-09': 'NOT VERIFIED', 'NM-10': 'NOT VERIFIED', 'NM-11': 'NOT VERIFIED',
  'NM-12': 'VERIFIED', 'NM-13': 'VERIFIED', 'NM-14': 'VERIFIED', 'NM-15': 'VERIFIED', 'NM-16': 'NOT VERIFIED',
  'NM-17': 'VERIFIED', 'NM-18': 'VERIFIED', 'NM-19': 'VERIFIED', 'NM-20': 'NOT VERIFIED', 'NM-21': 'NOT VERIFIED',
  'NM-22': 'NOT VERIFIED', 'NM-23': 'NOT VERIFIED', 'NM-24': 'NOT VERIFIED', 'NM-25': 'NOT VERIFIED',
  'NM-26': 'PARTIALLY VERIFIED', 'NM-27': 'VERIFIED', 'NM-28': 'NOT VERIFIED', 'NM-29': 'NOT VERIFIED',
};
