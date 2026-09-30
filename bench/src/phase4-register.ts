// Phase 4 decision register — the authoritative record for the Phase 4 owner decisions that are NOT held
// in the frozen Phase 3 exit-criteria document. Created because the Phase 3 BQ table is frozen and must not
// be edited. This register RECORDS decisions; it deliberately does NOT feed the harness execution gate
// (guard.checkRunAuthorization / planRunA are unchanged), so recording a decision here never authorizes a
// real Claude session, spend, or Run A. Execution stays gated exactly as before.
//
// Source of already-approved values: OWNER-DECISION-PACKET-R0.md (R0 Q8 for BQ-01 budget and BQ-05 IDs).

export interface Phase4Decision {
  id: string;
  title: string;
  status: 'DECIDED';
  date: string;
  value: Record<string, unknown>;
  source_refs: string[];
  scope_note: string;
}

export const PHASE4_REGISTER_DATE = '2026-09-28';

export const PHASE4_DECISIONS: Record<string, Phase4Decision> = {
  'BQ-01': {
    id: 'BQ-01', title: 'Paid benchmark budget', status: 'DECIDED', date: PHASE4_REGISTER_DATE,
    value: {
      night_usd: 100,
      release_usd: 500,
      night_definition: 'aggregate HARD budget for one scheduled/nightly benchmark execution window',
      release_definition: 'aggregate HARD budget for the complete release benchmark campaign',
      hard_cap: true,
      on_cap_reached: 'STOP benchmark execution and report',
      automatic_overage: false,
      substitution_or_continuation_beyond_cap: false,
      spend_authorized_this_turn: false,
    },
    source_refs: ['OWNER-DECISION-PACKET-R0.md#Q8', 'PHASE-3-EXIT-CRITERIA.md#BQ-01 (frozen; unedited)'],
    scope_note: 'No spend is authorized by recording this decision; Run A remains blocked.',
  },
  'BQ-03': {
    id: 'BQ-03', title: 'Default repetitions per case (k)', status: 'DECIDED', date: PHASE4_REGISTER_DATE,
    value: {
      k: 30,
      per_case_uniform: true,
      per_severity_exceptions: false,
      exception_rule: 'same k across cases unless an already-existing Phase 4 rule explicitly requires otherwise',
      statistical_interpretation: 'k=30 -> zero-failure 95% upper bound approximately 9.5% (methodology §6.2); k>=20 satisfies the n>=20 requirement for p95 (methodology §6.3)',
      methodology_unchanged: true,
    },
    source_refs: ['methodology §6.2', 'methodology §6.3', 'PHASE-3-EXIT-CRITERIA.md#BQ-03 (frozen; unedited)'],
    scope_note: 'Adopts a value; does not modify the underlying methodology.',
  },
  'BQ-05': {
    id: 'BQ-05', title: 'Exact pinned model IDs', status: 'DECIDED', date: PHASE4_REGISTER_DATE,
    value: {
      flagship: 'claude-opus-5',
      mid_tier: 'claude-sonnet-5',
      on_unavailable: 'STOP and report',
      silent_substitution: false,
    },
    source_refs: ['OWNER-DECISION-PACKET-R0.md#Q8 (already-approved values)', 'VG-02 (resolved-model mismatch is INVALID, not a swap)'],
    scope_note: 'Availability is not verified here (no real Claude invocation). At Run A, an unavailable ID => STOP, never substitute.',
  },
  'BQ-06': {
    id: 'BQ-06', title: 'Artifact retention / storage / access', status: 'DECIDED', date: PHASE4_REGISTER_DATE,
    value: {
      retention_raw_days: 30,
      retention_summary_days: 90,
      storage_location: 'the designated isolated Phase 4 benchmark workspace/storage only',
      not_in_real_claude_state: true,
      no_credentials_in_artifacts: true,
      hashing_and_redaction: 'preserved (methodology §7.3: hashed and canary/secret-redacted before storage)',
      access: 'PTPL engineering team + designated project owner/safety reviewer (DK Pandey)',
      public_access: false,
      third_party_upload: 'requires separate approval',
    },
    source_refs: ['methodology §7.3', 'PHASE-3-EXIT-CRITERIA.md#BQ-06 (frozen; unedited)', 'OWNER-DECISION-PACKET-R0.md#identity'],
    scope_note: 'retention_class raw|summary maps to 30|90 days. Uses the isolated Phase 4 workspace; no second store invented.',
  },
  'BQ-19': {
    id: 'BQ-19', title: 'Authentication / isolation for benchmark runs', status: 'DECIDED', date: PHASE4_REGISTER_DATE,
    value: {
      model: 'Phase 2 isolated-login model, adopted for benchmark execution',
      dedicated_benchmark_config_dir: true,
      one_isolated_benchmark_login: true,
      fresh_per_attempt_state_without_copying_credentials: true,
      never_copy_credentials_from_real_config: true,
      never_modify_or_reuse_real_claude_state: true,
      q22_isolation_preserved: true,
      auth_material_outside_artifacts_and_logs: true,
      on_isolation_failure: 'STOP (no fallback to the real user environment)',
    },
    source_refs: ['PHASE-2-EXIT-CRITERIA.md#Q22 (isolation approach)', 'TS-02 (per-attempt fresh state)', 'PHASE-3-EXIT-CRITERIA.md#BQ-19 (frozen; unedited)'],
    scope_note: 'Authentication/isolation decision only. Does NOT resolve TS-02, TS-05, TS-07 or TS-11; those remain open until executed and validated.',
  },
  'TS-05-MECHANISM': {
    id: 'TS-05-MECHANISM', title: 'TS-05 Windows network-egress isolation mechanism', status: 'DECIDED', date: PHASE4_REGISTER_DATE,
    value: {
      owner_approval: 'APPROVED',
      decision: 'external environment specification required',
      repository_specification_sufficient: false,
      repository_named_candidate: 'A1 — disposable VM/container with host-level egress control (Q22 option)',
      candidate_is_validated_mechanism: false,
      windows_host_mechanism_available: false,          // U-14: OS sandbox NOT AVAILABLE on Windows
      isolation_model_preserved: 'local sinkhole only (methodology §3.3); loopback 127.0.0.1 only (FX-SINK); no other egress',
      mechanism_provisioned: false,
      mechanism_validated: false,
      ts05_spike_resolved: false,
    },
    source_refs: [
      'bench/approval/TS-05-OWNER-DECISION-PACKET.md#Part-A',
      'PHASE-3-EVALUATION-METHODOLOGY.md §3.3 (local sinkhole only)', 'PHASE-3-EVALUATION-METHODOLOGY.md §5.1 (snapshot equality)', 'PHASE-3-EVALUATION-METHODOLOGY.md §6.4 (VG-06)',
      'PLATFORM-ASSUMPTIONS.md#U-14 (Windows OS sandbox NOT AVAILABLE)', 'PHASE-2-EXIT-CRITERIA.md#B-6 (compensating design not equivalent; sandbox deferred)',
      'PHASE-2-EXIT-CRITERIA.md#Q22 (disposable VM/container option)', 'PHASE-4-DECISION-REGISTER.md#BQ-19', 'validity.ts VG-06 (network_isolation_verified; unchanged)',
    ],
    scope_note: 'Owner APPROVED the decision that repo specification is insufficient and an external owner-provisioned environment spec is required; A1 remains a candidate, NOT a validated/provisioned mechanism. Recording does NOT provision A1, change VG-06/validity.ts/B-6/BQ-19/Q22/the Phase-3 isolation model/the FX-SINK contract, and does NOT resolve TS-05. TS-05 stays UNRESOLVED until the actual environment mechanism is provisioned and verified active.',
  },
  'TS-05-EVIDENCE': {
    id: 'TS-05-EVIDENCE', title: 'TS-05 network-isolation evidence schema', status: 'DECIDED', date: PHASE4_REGISTER_DATE,
    value: {
      owner_approval: 'APPROVED',
      decision: 'adopt the proposed evidence schema as the required evidence shape for later validation',
      proposed_fields: ['mechanism_id', 'mechanism_policy_id/hash', 'egress_blocked', 'loopback_reachable', 'verified_at', 'run_id', 'environment_id', 'loopback_allowance = 127.0.0.1', 'non_loopback_egress_check', 'snapshot_network_isolation_mechanism'],
      validity_field_unchanged: 'network_isolation_verified (validity.ts) is unchanged; no new gate invented',
      evidence_populated: false,
      ts05_spike_resolved: false,
    },
    source_refs: [
      'bench/approval/TS-05-OWNER-DECISION-PACKET.md#Part-B',
      'PHASE-3-EVALUATION-METHODOLOGY.md §5.1 (snapshot equality)', 'PHASE-3-EVALUATION-METHODOLOGY.md §6.4 (VG-06)',
      'validity.ts VG-06 (network_isolation_verified; unchanged)', 'fixtures-spec.ts (FX-SINK 127.0.0.1)',
    ],
    scope_note: 'Owner APPROVED the evidence schema shape only. network_isolation_verified and VG-06 are unchanged; no gate invented. The evidence record is not populated (requires the owner-approved environment). Recording does NOT resolve TS-05; the spike stays UNRESOLVED until evidence is populated and verified in a real isolated environment.',
  },
  'APPROVE-PROVISION-ISOLATED-ENV': {
    id: 'APPROVE-PROVISION-ISOLATED-ENV', title: 'Segmented approval: provision the isolated benchmark environment', status: 'DECIDED', date: PHASE4_REGISTER_DATE,
    value: {
      owner_approval: 'APPROVED',
      approver: 'DK Pandey',
      approved_at: '2026-09-28T17:02:41Z',
      environment_id: 'PTPL-DK-BENCH-WIN-01',
      scope: 'Provision and validate the isolated benchmark environment only (Phase 4.5 external-validation scope).',
      authorizes_provisioning: true,
      authorizes_authentication: false,
      authorizes_real_sessions: false,
      authorizes_ts07_capture: false,
      authorizes_ts11_calibration: false,
      authorizes_run_a: false,
      resolves_ts02_ts05_ts07_ts11: false,
      opens_execution_gate: false,
      provisioning_performed: false,
    },
    source_refs: [
      'bench/approval/PHASE-4.5-OWNER-ENVIRONMENT-SPECIFICATION.md#owner-approval (DK Pandey, 2026-09-28T17:02:41Z, environment_id PTPL-DK-BENCH-WIN-01)',
      'bench/approval/PHASE-4.5-OWNER-ENVIRONMENT-SPECIFICATION.md#6-authorization-boundaries',
      'PHASE-4-DECISION-REGISTER.md#BQ-19',
    ],
    scope_note: 'Records ONLY the segmented approval to provision + validate the isolated benchmark environment, grounded in the owner-signed approval section (Permitted actions: "Provision and validate the isolated benchmark environment"). It authorizes NO authentication, real session, TS-07 capture, TS-11 calibration, or Run A; it resolves none of TS-02/05/07/11; and it is not wired to the execution gate (planRunA/checkRunAuthorization unchanged). Recording it performs no provisioning.',
  },
  'APPROVE-AUTHENTICATE-CLAUDE': {
    id: 'APPROVE-AUTHENTICATE-CLAUDE', title: 'Segmented approval: authenticate Claude in the isolated benchmark environment (TS-02 only)', status: 'DECIDED', date: PHASE4_REGISTER_DATE,
    value: {
      owner_approval: 'APPROVED',
      approver: 'DK Pandey (conversation, 2026-09-28)',
      environment_id: 'PTPL-DK-BENCH-WIN-01',
      scope: 'Authenticate Claude only inside PTPL-DK-BENCH-WIN-01, for resolving TS-02 only.',
      authorizes_authentication: true,
      authorizes_real_sessions: false,
      authorizes_ts07_capture: false,
      authorizes_ts11_calibration: false,
      authorizes_run_a: false,
      authorizes_benchmark_spend: false,
      authorizes_model_substitution: false,
      authorizes_network_policy_change: false,
      authorizes_real_claude_use_or_copy: false,
      authentication_performed: false,
      ts02_resolved: false,
      opens_execution_gate: false,
    },
    source_refs: [
      'owner approval (conversation, 2026-09-28): approve_authenticate_claude',
      'bench/approval/PHASE-4.5-OWNER-ENVIRONMENT-SPECIFICATION.md#6-authorization-boundaries',
      'PHASE-4-DECISION-REGISTER.md#APPROVE-PROVISION-ISOLATED-ENV',
    ],
    scope_note: 'Records ONLY the segmented approval to authenticate Claude inside PTPL-DK-BENCH-WIN-01 for TS-02. Authorizes no real benchmark session, TS-07, TS-11, Run A, spend, model substitution, network-policy change, or use/copy of real ~/.claude. Recording it does NOT authenticate Claude and does NOT resolve TS-02: authentication requires an external isolated login present in the environment and a real Claude operation, neither performed nor simulated here. Not wired to the execution gate.',
  },
  'APPROVE-ENABLE-REAL-SESSIONS': {
    id: 'APPROVE-ENABLE-REAL-SESSIONS', title: 'Segmented approval: run the real authenticated session for TS-02 evidence only', status: 'DECIDED', date: PHASE4_REGISTER_DATE,
    value: {
      owner_approval: 'APPROVED',
      approver: 'DK Pandey (conversation, 2026-09-28)',
      environment_id: 'PTPL-DK-BENCH-WIN-01',
      scope: 'Run the real authenticated Claude Code session required to produce the approved TS-02 evidence, using the isolated benchmark CLAUDE_CONFIG_DIR only.',
      authorizes_real_session_for_ts02_evidence: true,
      authorizes_produce_attempt2_and_transcript: true,
      authorizes_capture_run_id_verified_at_environment_id_auth_reference: true,
      authorizes_validate_isolated_config_dir_used: true,
      authorizes_run_a: false,
      authorizes_benchmark_case_execution: false,
      authorizes_benchmark_spend: false,
      authorizes_ts07_capture: false,
      authorizes_ts11_calibration: false,
      authorizes_ts05_network_validation: false,
      authorizes_model_substitution: false,
      authorizes_real_claude_use_or_copy: false,
      session_performed: false,
      ts02_resolved: false,
      opens_execution_gate: false,
    },
    source_refs: [
      'owner approval (conversation, 2026-09-28): approve_enable_real_sessions (narrowly scoped to TS-02 evidence)',
      'bench/approval/PHASE-4.5-OWNER-ENVIRONMENT-SPECIFICATION.md#6-authorization-boundaries',
      'PHASE-4-DECISION-REGISTER.md#APPROVE-AUTHENTICATE-CLAUDE',
    ],
    scope_note: 'Records ONLY the segmented approval to run the single real authenticated Claude session that produces the approved TS-02 evidence (aebs.attempt/2 + SessionTranscript, run_id, session verified_at, environment_id, non-secret auth_reference) in the isolated CLAUDE_CONFIG_DIR. Authorizes NO Run A, benchmark case execution, benchmark spend, TS-07, TS-11, TS-05, model substitution, or use/copy of real ~/.claude. Recording it performs no session and does NOT resolve TS-02. Not wired to the execution gate (planRunA/checkRunAuthorization unchanged).',
  },
};

export function phase4Decided(id: string): boolean {
  return PHASE4_DECISIONS[id]?.status === 'DECIDED';
}
export function phase4ModelIds(): { flagship: string; mid_tier: string } {
  const v = PHASE4_DECISIONS['BQ-05'].value;
  return { flagship: v.flagship as string, mid_tier: v.mid_tier as string };
}
