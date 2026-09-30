# Phase 4.5 — repository-side environment layer (`bench/src/environ.ts`)

> Implements the repository-controllable portion of the Phase 4.5 architecture from
> `bench/approval/PHASE-4-AUTOMATED-ENVIRONMENT-ARCHITECTURE-ASSESSMENT.md` (the source of the design rationale).
> **PTPL benchmark harness only** — ordinary dkskill runtime does not use it and is unchanged. This layer is
> **informational**: it does not wire into `planRunA()` / `checkRunAuthorization()`, so it never authorizes execution.

## What it does (repository-automated)
- **`provisionBenchEnv(root, opts)`** — creates a fresh benchmark-only isolated environment: an isolated
  `CLAUDE_CONFIG_DIR` (reusing `guard.assertIsolatedConfigDir`, so the real `~/.claude`/home/protected roots are
  refused), an isolated MCP-config *location* (no servers executed), and a fresh per-attempt `R/` (reusing
  `fixtures.buildRunRoot`). It writes **no credentials** and runs **no Claude/MCP/network**.
- **`verifyBenchEnv(env)`** — deterministic checks: config dir isolated; real `~/.claude` not the target; per-attempt
  state fresh; required dirs exist; workspace structure; strict-MCP representable; no credential copy. External
  inputs (CLI identity, BQ-05 model ids, TS-05 mechanism) are reported as `MISSING`/`EXTERNAL_PENDING`, not failures.
- **`buildReadinessEvidence(env, {prev_hash})`** — a tamper-evident, hash-chained `aebs.readiness/1` record with
  env id, config-dir/`R/` identity hashes, CLI identity, BQ-05 model match, loopback result, TS-05 fields,
  `network_isolation_verified`, auth reference, checks, and `validation_result` (`PASS` iff every `REPO_CHECKS`
  passed). `chainValid()` verifies the chain. **Evidence is never invented** — missing external values are `null`.
- **`readinessState(ev)`** — informational ladder: `REPO_PREP_FAILED` → `REPO_PREP_COMPLETE` →
  `EXTERNAL_INPUTS_MISSING` → `EXTERNAL_ENV_NOT_VERIFIED` → `READY_FOR_OWNER_AUTHORIZATION` →
  `AUTHORIZED_FOR_RUN_A`. `REPO_PREP_FAILED` (F1) is returned when a repository-side check fails
  (`validation_result === 'FAIL'`), distinct from `EXTERNAL_INPUTS_MISSING`. The last state is reached **only**
  when the real gate (`checkRunAuthorization` + `planRunA`) is open — which it is not. This ladder is
  informational and is not wired to the execution gate.

## Evidence hygiene, determinism, and the F2 boundary
- **F3 (path hygiene):** at the evidence-construction boundary (`buildReadinessEvidence`), the local home
  directory is redacted (`redactPath` → `~`) from `checks[].detail` and from the `config_dir_hash` input, so a
  persisted readiness record does not leak the OS username / absolute home path. Live diagnosis via
  `verifyBenchEnv` keeps full detail (in-memory only). The approved TS-05 evidence fields and BQ-06 are unchanged.
- **F4 (deterministic timestamp):** `provisionBenchEnv` and `buildReadinessEvidence` accept an injectable
  `clock`; production defaults to the wall clock. The evidence schema and readiness semantics are unchanged.
- **F2 (external validation requirement — NOT upgraded here):** `READY_FOR_OWNER_AUTHORIZATION` requires a
  present `auth_reference` + BQ-05 model match + externally verified network, but **does not** require proof that
  an isolated Claude session actually authenticated. This is intentional and left external/owner-gated: the
  repository never fabricates authentication evidence, adds no `auth_verified` field, and does not convert this
  into a new authorization requirement (no existing Phase 4 decision permits that). **TS-02 remains unresolved
  pending real isolated-session authentication validation**, which is an owner-gated step, and the Run A gate is
  unaffected.

## What stays external / owner-gated (never done here)
- The isolated Claude **login/credentials** (carried as `external.auth_reference` only; BQ-19).
- **OS-level Windows network-egress isolation** (U-14 sandbox NOT AVAILABLE; B-6 deferred) — supplied as
  `external.ts05` evidence; `network_isolation_verified` is `true` **only** if complete approved external evidence
  is present (`egress_blocked`+`loopback_reachable`+`verified_at`+`loopback_allowance='127.0.0.1'`), else `null`.
- **Real Claude execution** (TS-07 capture, TS-11 calibration) and **Run A authorization** — future gated steps.

## Preserved (unchanged)
VG-01..VG-10 (incl. VG-06 semantics and `validity.ts network_isolation_verified`), BQ-01/03/05/06/19, exact model
pinning (`checkModelPinning` flags mismatch, never substitutes), fresh-state and real-`~/.claude` protection, and
the explicit Run A authorization gate. This module reuses the existing guard and run-root builder rather than
introducing a second mechanism.
