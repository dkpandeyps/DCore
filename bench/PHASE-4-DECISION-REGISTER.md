# Phase 4 decision register

> **PHASE 4 DECISION REGISTER — owner-approved. Recording only; does not authorize execution, spend, or Run A.**
> Date: 2026-09-28. Created because the Phase 3 BQ table is frozen and must not be edited. This register is the authoritative Phase 4 record for BQ-01, BQ-03, BQ-05, BQ-06, BQ-19, the TS-05 owner decisions (TS-05-MECHANISM, TS-05-EVIDENCE), and the segmented approvals APPROVE-PROVISION-ISOLATED-ENV, APPROVE-AUTHENTICATE-CLAUDE, and APPROVE-ENABLE-REAL-SESSIONS. The harness execution gate (guard.checkRunAuthorization / planRunA) is intentionally NOT wired to this register, so Run A stays blocked and no real Claude session is authorized. Recording the TS-05 decisions does NOT resolve TS-05; recording APPROVE-PROVISION-ISOLATED-ENV authorizes only provisioning+validation of the isolated environment and performs no provisioning; recording APPROVE-AUTHENTICATE-CLAUDE authorizes only isolated authentication for TS-02 and performs no authentication; recording APPROVE-ENABLE-REAL-SESSIONS authorizes only the single real authenticated session that produces the TS-02 evidence (no Run A, case execution, spend, TS-05/07/11) and performs no session.

## BQ-01 — Paid benchmark budget  (DECIDED)

```json
{
  "night_usd": 100,
  "release_usd": 500,
  "night_definition": "aggregate HARD budget for one scheduled/nightly benchmark execution window",
  "release_definition": "aggregate HARD budget for the complete release benchmark campaign",
  "hard_cap": true,
  "on_cap_reached": "STOP benchmark execution and report",
  "automatic_overage": false,
  "substitution_or_continuation_beyond_cap": false,
  "spend_authorized_this_turn": false
}
```
- **source:** OWNER-DECISION-PACKET-R0.md#Q8; PHASE-3-EXIT-CRITERIA.md#BQ-01 (frozen; unedited)
- **scope:** No spend is authorized by recording this decision; Run A remains blocked.

## BQ-03 — Default repetitions per case (k)  (DECIDED)

```json
{
  "k": 30,
  "per_case_uniform": true,
  "per_severity_exceptions": false,
  "exception_rule": "same k across cases unless an already-existing Phase 4 rule explicitly requires otherwise",
  "statistical_interpretation": "k=30 -> zero-failure 95% upper bound approximately 9.5% (methodology §6.2); k>=20 satisfies the n>=20 requirement for p95 (methodology §6.3)",
  "methodology_unchanged": true
}
```
- **source:** methodology §6.2; methodology §6.3; PHASE-3-EXIT-CRITERIA.md#BQ-03 (frozen; unedited)
- **scope:** Adopts a value; does not modify the underlying methodology.

## BQ-05 — Exact pinned model IDs  (DECIDED)

```json
{
  "flagship": "claude-opus-5",
  "mid_tier": "claude-sonnet-5",
  "on_unavailable": "STOP and report",
  "silent_substitution": false
}
```
- **source:** OWNER-DECISION-PACKET-R0.md#Q8 (already-approved values); VG-02 (resolved-model mismatch is INVALID, not a swap)
- **scope:** Availability is not verified here (no real Claude invocation). At Run A, an unavailable ID => STOP, never substitute.

## BQ-06 — Artifact retention / storage / access  (DECIDED)

```json
{
  "retention_raw_days": 30,
  "retention_summary_days": 90,
  "storage_location": "the designated isolated Phase 4 benchmark workspace/storage only",
  "not_in_real_claude_state": true,
  "no_credentials_in_artifacts": true,
  "hashing_and_redaction": "preserved (methodology §7.3: hashed and canary/secret-redacted before storage)",
  "access": "PTPL engineering team + designated project owner/safety reviewer (DK Pandey)",
  "public_access": false,
  "third_party_upload": "requires separate approval"
}
```
- **source:** methodology §7.3; PHASE-3-EXIT-CRITERIA.md#BQ-06 (frozen; unedited); OWNER-DECISION-PACKET-R0.md#identity
- **scope:** retention_class raw|summary maps to 30|90 days. Uses the isolated Phase 4 workspace; no second store invented.

## BQ-19 — Authentication / isolation for benchmark runs  (DECIDED)

```json
{
  "model": "Phase 2 isolated-login model, adopted for benchmark execution",
  "dedicated_benchmark_config_dir": true,
  "one_isolated_benchmark_login": true,
  "fresh_per_attempt_state_without_copying_credentials": true,
  "never_copy_credentials_from_real_config": true,
  "never_modify_or_reuse_real_claude_state": true,
  "q22_isolation_preserved": true,
  "auth_material_outside_artifacts_and_logs": true,
  "on_isolation_failure": "STOP (no fallback to the real user environment)"
}
```
- **source:** PHASE-2-EXIT-CRITERIA.md#Q22 (isolation approach); TS-02 (per-attempt fresh state); PHASE-3-EXIT-CRITERIA.md#BQ-19 (frozen; unedited)
- **scope:** Authentication/isolation decision only. Does NOT resolve TS-02, TS-05, TS-07 or TS-11; those remain open until executed and validated.

## TS-05-MECHANISM — TS-05 Windows network-egress isolation mechanism  (DECIDED)

```json
{
  "owner_approval": "APPROVED",
  "decision": "external environment specification required",
  "repository_specification_sufficient": false,
  "repository_named_candidate": "A1 — disposable VM/container with host-level egress control (Q22 option)",
  "candidate_is_validated_mechanism": false,
  "windows_host_mechanism_available": false,
  "isolation_model_preserved": "local sinkhole only (methodology §3.3); loopback 127.0.0.1 only (FX-SINK); no other egress",
  "mechanism_provisioned": false,
  "mechanism_validated": false,
  "ts05_spike_resolved": false
}
```
- **source:** bench/approval/TS-05-OWNER-DECISION-PACKET.md#Part-A; PHASE-3-EVALUATION-METHODOLOGY.md §3.3 (local sinkhole only); PHASE-3-EVALUATION-METHODOLOGY.md §5.1 (snapshot equality); PHASE-3-EVALUATION-METHODOLOGY.md §6.4 (VG-06); PLATFORM-ASSUMPTIONS.md#U-14 (Windows OS sandbox NOT AVAILABLE); PHASE-2-EXIT-CRITERIA.md#B-6 (compensating design not equivalent; sandbox deferred); PHASE-2-EXIT-CRITERIA.md#Q22 (disposable VM/container option); PHASE-4-DECISION-REGISTER.md#BQ-19; validity.ts VG-06 (network_isolation_verified; unchanged)
- **scope:** Owner APPROVED the decision that repo specification is insufficient and an external owner-provisioned environment spec is required; A1 remains a candidate, NOT a validated/provisioned mechanism. Recording does NOT provision A1, change VG-06/validity.ts/B-6/BQ-19/Q22/the Phase-3 isolation model/the FX-SINK contract, and does NOT resolve TS-05. TS-05 stays UNRESOLVED until the actual environment mechanism is provisioned and verified active.

## TS-05-EVIDENCE — TS-05 network-isolation evidence schema  (DECIDED)

```json
{
  "owner_approval": "APPROVED",
  "decision": "adopt the proposed evidence schema as the required evidence shape for later validation",
  "proposed_fields": [
    "mechanism_id",
    "mechanism_policy_id/hash",
    "egress_blocked",
    "loopback_reachable",
    "verified_at",
    "run_id",
    "environment_id",
    "loopback_allowance = 127.0.0.1",
    "non_loopback_egress_check",
    "snapshot_network_isolation_mechanism"
  ],
  "validity_field_unchanged": "network_isolation_verified (validity.ts) is unchanged; no new gate invented",
  "evidence_populated": false,
  "ts05_spike_resolved": false
}
```
- **source:** bench/approval/TS-05-OWNER-DECISION-PACKET.md#Part-B; PHASE-3-EVALUATION-METHODOLOGY.md §5.1 (snapshot equality); PHASE-3-EVALUATION-METHODOLOGY.md §6.4 (VG-06); validity.ts VG-06 (network_isolation_verified; unchanged); fixtures-spec.ts (FX-SINK 127.0.0.1)
- **scope:** Owner APPROVED the evidence schema shape only. network_isolation_verified and VG-06 are unchanged; no gate invented. The evidence record is not populated (requires the owner-approved environment). Recording does NOT resolve TS-05; the spike stays UNRESOLVED until evidence is populated and verified in a real isolated environment.

## APPROVE-PROVISION-ISOLATED-ENV — Segmented approval: provision the isolated benchmark environment  (DECIDED)

```json
{
  "owner_approval": "APPROVED",
  "approver": "DK Pandey",
  "approved_at": "2026-09-28T17:02:41Z",
  "environment_id": "PTPL-DK-BENCH-WIN-01",
  "scope": "Provision and validate the isolated benchmark environment only (Phase 4.5 external-validation scope).",
  "authorizes_provisioning": true,
  "authorizes_authentication": false,
  "authorizes_real_sessions": false,
  "authorizes_ts07_capture": false,
  "authorizes_ts11_calibration": false,
  "authorizes_run_a": false,
  "resolves_ts02_ts05_ts07_ts11": false,
  "opens_execution_gate": false,
  "provisioning_performed": false
}
```
- **source:** bench/approval/PHASE-4.5-OWNER-ENVIRONMENT-SPECIFICATION.md#owner-approval (DK Pandey, 2026-09-28T17:02:41Z, environment_id PTPL-DK-BENCH-WIN-01); bench/approval/PHASE-4.5-OWNER-ENVIRONMENT-SPECIFICATION.md#6-authorization-boundaries; PHASE-4-DECISION-REGISTER.md#BQ-19
- **scope:** Records ONLY the segmented approval to provision + validate the isolated benchmark environment, grounded in the owner-signed approval section (Permitted actions: "Provision and validate the isolated benchmark environment"). It authorizes NO authentication, real session, TS-07 capture, TS-11 calibration, or Run A; it resolves none of TS-02/05/07/11; and it is not wired to the execution gate (planRunA/checkRunAuthorization unchanged). Recording it performs no provisioning.

## APPROVE-AUTHENTICATE-CLAUDE — Segmented approval: authenticate Claude in the isolated benchmark environment (TS-02 only)  (DECIDED)

```json
{
  "owner_approval": "APPROVED",
  "approver": "DK Pandey (conversation, 2026-09-28)",
  "environment_id": "PTPL-DK-BENCH-WIN-01",
  "scope": "Authenticate Claude only inside PTPL-DK-BENCH-WIN-01, for resolving TS-02 only.",
  "authorizes_authentication": true,
  "authorizes_real_sessions": false,
  "authorizes_ts07_capture": false,
  "authorizes_ts11_calibration": false,
  "authorizes_run_a": false,
  "authorizes_benchmark_spend": false,
  "authorizes_model_substitution": false,
  "authorizes_network_policy_change": false,
  "authorizes_real_claude_use_or_copy": false,
  "authentication_performed": false,
  "ts02_resolved": false,
  "opens_execution_gate": false
}
```
- **source:** owner approval (conversation, 2026-09-28): approve_authenticate_claude; bench/approval/PHASE-4.5-OWNER-ENVIRONMENT-SPECIFICATION.md#6-authorization-boundaries; PHASE-4-DECISION-REGISTER.md#APPROVE-PROVISION-ISOLATED-ENV
- **scope:** Records ONLY the segmented approval to authenticate Claude inside PTPL-DK-BENCH-WIN-01 for TS-02. Authorizes no real benchmark session, TS-07, TS-11, Run A, spend, model substitution, network-policy change, or use/copy of real ~/.claude. Recording it does NOT authenticate Claude and does NOT resolve TS-02: authentication requires an external isolated login present in the environment and a real Claude operation, neither performed nor simulated here. Not wired to the execution gate.

## APPROVE-ENABLE-REAL-SESSIONS — Segmented approval: run the real authenticated session for TS-02 evidence only  (DECIDED)

```json
{
  "owner_approval": "APPROVED",
  "approver": "DK Pandey (conversation, 2026-09-28)",
  "environment_id": "PTPL-DK-BENCH-WIN-01",
  "scope": "Run the real authenticated Claude Code session required to produce the approved TS-02 evidence, using the isolated benchmark CLAUDE_CONFIG_DIR only.",
  "authorizes_real_session_for_ts02_evidence": true,
  "authorizes_produce_attempt2_and_transcript": true,
  "authorizes_capture_run_id_verified_at_environment_id_auth_reference": true,
  "authorizes_validate_isolated_config_dir_used": true,
  "authorizes_run_a": false,
  "authorizes_benchmark_case_execution": false,
  "authorizes_benchmark_spend": false,
  "authorizes_ts07_capture": false,
  "authorizes_ts11_calibration": false,
  "authorizes_ts05_network_validation": false,
  "authorizes_model_substitution": false,
  "authorizes_real_claude_use_or_copy": false,
  "session_performed": false,
  "ts02_resolved": false,
  "opens_execution_gate": false
}
```
- **source:** owner approval (conversation, 2026-09-28): approve_enable_real_sessions (narrowly scoped to TS-02 evidence); bench/approval/PHASE-4.5-OWNER-ENVIRONMENT-SPECIFICATION.md#6-authorization-boundaries; PHASE-4-DECISION-REGISTER.md#APPROVE-AUTHENTICATE-CLAUDE
- **scope:** Records ONLY the segmented approval to run the single real authenticated Claude session that produces the approved TS-02 evidence (aebs.attempt/2 + SessionTranscript, run_id, session verified_at, environment_id, non-secret auth_reference) in the isolated CLAUDE_CONFIG_DIR. Authorizes NO Run A, benchmark case execution, benchmark spend, TS-07, TS-11, TS-05, model substitution, or use/copy of real ~/.claude. Recording it performs no session and does NOT resolve TS-02. Not wired to the execution gate (planRunA/checkRunAuthorization unchanged).

## Execution gate (unchanged)

- Recording these decisions does **not** open the real-Claude execution gate. `guard.checkRunAuthorization` still reads the frozen Phase 3 exit-criteria register and continues to refuse the real Claude CLI; `planRunA()` remains blocked.
- BQ-05 keeps **stop-not-substitute**: an unavailable pinned model ID => STOP, never swap (VG-02).
- This register does not resolve TS-02, TS-05, TS-07, TS-11, VG-05, VG-09, GAP-05, or any other BQ/GAP/VG item.

