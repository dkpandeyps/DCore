# Phase 4.5 — External Environment Readiness

> **Readiness assessment / preflight (2026-09-28).** No benchmark run, no Claude invocation/authentication, no
> TS-07 capture, no TS-11 calibration, no Run A, no benchmark spend, no network-policy change, no `/runtime/`,
> real `~/.claude` untouched. This is not a second owner handoff packet; it records repository-automatable
> readiness vs. the external/owner prerequisites and the exact missing inputs.

**Owner environment specification present?** **NO — absent/incomplete.** The intake
`PHASE-4-ENVIRONMENT-SPECIFICATION-INTAKE.md` is fully blank (38 `PENDING`/`NOT PROVIDED`, zero filled values);
no owner-supplied specification or approval artifact exists; the prior
`PHASE-4-ENVIRONMENT-SPECIFICATION-REVIEW.md` already concluded `INCOMPLETE`. Per the task's "owner inputs
missing" branch: **nothing is provisioned, no values are guessed, no evidence is fabricated, no gate is opened.**

Preserved authoritative decisions: BQ-19 (isolated benchmark `CLAUDE_CONFIG_DIR`; never use/reuse real
`~/.claude`), BQ-05 (exact pinned model IDs; no substitution), BQ-01 ($100 night / $500 release hard caps),
BQ-03 (k=30), BQ-06 (retention/access/redaction), B-6 (Windows OS sandbox unavailable; compensating design is
not an OS sandbox). TS-02/05/07/11 remain UNRESOLVED.

---

## 1. Repository-side capabilities already validated

Provided by `bench/src/environ.ts` (no duplicate mechanism), evidenced by 137/137 tests and a safe temp-dir
preflight run this step (temp dir; no Claude, no network beyond a local `git init --bare`, no real `~/.claude`):

| Capability | Mechanism | Preflight result |
|---|---|---|
| Fresh isolated `CLAUDE_CONFIG_DIR` | `provisionBenchEnv` + `guard.assertIsolatedConfigDir` | PASS (`config_dir_isolated`) |
| Real `~/.claude` protection | guard refusal (real dir, subdirs, protected roots) | PASS (`real_claude_not_target`) |
| Fresh per-attempt `R/` | `fixtures.buildRunRoot` (empty-root enforced) | PASS (`per_attempt_state_fresh`) |
| Isolated MCP configuration location | `provisionBenchEnv` (`cfg/mcp`; no servers executed) | PASS (`strict_mcp_representable`) |
| Workspace structure | `verifyBenchEnv` (`ws/protected`) | PASS (`workspace_structure`) |
| No credential copy | `verifyBenchEnv` (no credential files provisioned) | PASS (`no_credential_copy`) |
| CLI/model identity capture | `checkModelPinning` (records inputs; flags BQ-05 mismatch; no substitution; never invokes Claude) | ready (input `MISSING` until supplied) |
| Readiness evidence (hash-chained, home-redacted, deterministic clock) | `buildReadinessEvidence` / `chainValid` | PASS (`validation_result: PASS`) |
| TS-05 evidence **structure** validation | `validateTs05Structure` / `deriveNetworkVerified` (never fabricated) | ready (`network_isolation_verified: null`) |

Preflight with **no external inputs** → `readinessState = REPO_PREP_COMPLETE`, `network_isolation_verified = null`,
`cli/models/auth = null`. The repository correctly represents unverified external inputs without fabricating them.

## 2. Owner / external prerequisites (not repository-automatable)

1. **Isolated Claude authentication** — an owner-approved isolated environment with a working isolated login.
2. **OS-level Windows network-egress isolation** — external infrastructure (U-14 sandbox NOT AVAILABLE; B-6 deferred).
3. **Actual Claude execution** — for TS-07 capture and TS-11 calibration, under explicit owner authorization.

None of these may be represented as repository-side evidence.

## 3. Exact TS-02 evidence requirements (isolated authentication)

- Fresh benchmark-only `CLAUDE_CONFIG_DIR` (provided by the repo layer; **verified**).
- Authentication available to the isolated Claude Code session — **external**.
- No copying of credentials from real `~/.claude`, and no use of real `~/.claude` — repo-enforced (guard + VG-05).
- **Evidence that an isolated Claude session actually authenticated:** an `aebs.attempt/2` record + `SessionTranscript`
  from a session launched with the isolated `CLAUDE_CONFIG_DIR`, consumed **by reference** (`external.auth_reference`);
  the repository never fabricates it. **MISSING.**

## 4. Exact TS-05 evidence requirements (Windows network isolation)

Externally verified OS-level egress isolation satisfying the approved 10-field schema (all **MISSING**):
`mechanism_id`, `mechanism_policy_id/hash`, `egress_blocked`, `loopback_reachable`, `verified_at`, `run_id`,
`environment_id`, `loopback_allowance = 127.0.0.1`, `non_loopback_egress_check`,
`snapshot_network_isolation_mechanism`. The evidence must demonstrate: **non-loopback egress blocked**;
**loopback remains reachable**; **the mechanism is actually active** in the benchmark environment.

- The FX-SINK `127.0.0.1` binding does **not** prove VG-06.
- Windows firewall/isolation is **not** verified unless actual evidence exists.
- `network_isolation_verified = true` only with complete approved external evidence; VG-06 semantics unchanged.

## 5. TS-07 capture prerequisites (established; not performed)

- Pinned Phase-4 Claude Code CLI **version + binary hash** (environment snapshot) — BQ-05 exact IDs (`claude-opus-5`, `claude-sonnet-5`).
- `attr@1` is valid **only for CLI 2.1.283**; any other version ⇒ re-derive (`A9/unknown` until then).
- Required capture: stream-json samples + **≥1 denial per rule A1–A8** + FXH markers, compared to `attr@1`.
- **Not performed** — requires a real session and explicit owner authorization (absent).

## 6. TS-11 calibration prerequisites (established; not performed)

- The **17-probe** set (CAL-NM-02b,05,06a,07,08,10,11,16,20,21,22,23,24,25,26,28,29) — **NM-09 excluded**.
- One `aebs.calibration/1` record per non-VERIFIED NM **per profile**; VG-10 invalidates dependent cases on
  failure/absence; **calibration never upgrades a Phase-2 status**.
- **Not performed** — requires real sessions and explicit owner authorization (absent).

## 7. Environment identity and isolation requirements

- A single `environment_id` used consistently across TS-02/05/07/11 evidence — **NOT PROVIDED**.
- Isolation: fresh `CLAUDE_CONFIG_DIR` (repo-provided), OS egress boundary (external), never real `~/.claude`
  (repo-enforced), one isolated login (external), auth material out of artifacts/logs (BQ-19).

## 8. Explicit missing-input status

| Prerequisite | Status |
|---|---|
| Owner environment specification (intake completed) | **MISSING** |
| Explicit owner approval of the specification | **MISSING** |
| `environment_id` | **NOT PROVIDED** |
| Isolated login + authentication evidence (TS-02) | **MISSING** |
| CLI version + binary hash (TS-07) | **MISSING** |
| BQ-05 model IDs confirmation | **MISSING** |
| TS-05 10-field evidence (mechanism active) | **MISSING** |
| Authorization to run real sessions (TS-07 capture / TS-11 calibration) | **MISSING** |

No replacement values were invented for any missing input.

## 9. Readiness result

**`NOT READY` — blocked on the external owner environment specification.** The repository-automatable layer is
`REPO_PREP_COMPLETE` and can consume external evidence by reference, but every external/owner prerequisite is
absent. No preflight of a real specification was possible (none exists); the safe repository demonstration passed.

## 10. Run A status

**Run A remains BLOCKED and UNAUTHORIZED.** `planRunA().may_start = false`; `checkRunAuthorization().authorized =
false`. TS-02, TS-05, TS-07, TS-11 remain **UNRESOLVED**. Recording this readiness changes no gate.
