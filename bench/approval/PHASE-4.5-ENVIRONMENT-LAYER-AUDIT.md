# Phase 4.5 — Environment Layer Implementation Audit (READ-ONLY)

> **Read-only audit (2026-09-28).** No code changed, no tests changed, no provisioning, no Claude login/execution,
> no network-policy change, no benchmark spend, no `/runtime/`, real `~/.claude` untouched. Audited
> `bench/src/environ.ts`, `bench/test/environ.test.ts`, `bench/PHASE-4.5-ENVIRONMENT-LAYER.md` against the Phase 4
> decision register, the environment packets/checklist/intake, the TS-05 decision packet, and the existing
> `guard.ts` / `validity.ts` / `runA.ts` / `phase4-register.ts`.

## 1. Audit conclusion

**`PASS_WITH_GAPS`.**

No CRITICAL/HIGH validity or security defect. Isolation reuses the single existing guard, credentials are never read/copied, `network_isolation_verified` is never fabricated, model IDs are never substituted, Claude is never invoked, and the readiness layer cannot open the Run A gate. The gaps are test-coverage shortfalls and minor informational-state / evidence-hygiene items, none of which affect the execution gate.

## 2. Findings

### F1 — readinessState maps a repo-check FAIL to `EXTERNAL_INPUTS_MISSING` — LOW
- **Component:** `environ.readinessState`
- **Requirement:** repository readiness distinct from external readiness (audit Q5).
- **Observed:** `if (!repoOk) return 'EXTERNAL_INPUTS_MISSING'`. A failed repository check (validation_result `FAIL`) is reported with the same state label as "external inputs absent."
- **Evidence:** `environ.ts` `readinessState` first branch; `validation_result` set from `REPO_CHECKS`.
- **Impact:** a genuine provisioning defect could be read as "waiting on the owner." Mitigated because `ReadinessEvidence.validation_result === 'FAIL'` and the failing `checks[]` still expose the true cause.
- **Recommendation:** either add a distinct signal for repo-prep failure or document that `EXTERNAL_INPUTS_MISSING` + `validation_result:'FAIL'` means a repo-side failure.

### F2 — `READY_FOR_OWNER_AUTHORIZATION` does not require TS-02 successful-session evidence — MEDIUM
- **Component:** `environ.readinessState`
- **Requirement:** TS-02 evidence is a *successful isolated `aebs.attempt/2` session* (validation packet §1); "cannot make an unresolved authentication state appear verified" (audit Q2).
- **Observed:** reaching `READY_FOR_OWNER_AUTHORIZATION` requires only a **present** `auth_reference` string (any non-empty value) + BQ-05 model match + `network_isolation_verified===true`. It does **not** require proof the isolated login actually authenticated a session.
- **Evidence:** `inputsPresent = ... && ev.auth_reference`; `auth_reference` is an opaque, unvalidated string.
- **Impact:** the **informational** state can read "ready for owner authorization" without a proven session. **No execution risk** — Run A stays gated (`AUTHORIZED_FOR_RUN_A` still needs `checkRunAuthorization().authorized && planRunA().may_start`, both false). It does not mark auth "verified"; there is no `auth_verified` field. The risk is a misleading readiness label, not a bypass.
- **Recommendation:** document that owner authorization is the step that validates the session, or require a session-evidence reference (`aebs.attempt/2`) before `READY_FOR_OWNER_AUTHORIZATION`.

### F3 — readiness evidence embeds absolute paths (incl. real home) — LOW
- **Component:** `environ.buildReadinessEvidence` / `verifyBenchEnv`
- **Requirement:** BQ-06 keeps auth material out of artifacts; general hygiene for stored evidence.
- **Observed:** `checks[].detail` includes `env.config_dir` and `REAL_CLAUDE_DIR` (which contains the OS username), and `config_dir_hash` hashes the raw absolute `config_dir`. These are inside the hash-chained record.
- **Evidence:** `verifyBenchEnv` detail strings; `config_dir_hash: sha256(canonicalJson({config_dir: env.config_dir}))`.
- **Impact:** if a readiness record is persisted/shared, it leaks the local home path (mild PII), not credentials. In-memory only today (the module writes nothing).
- **Recommendation:** when this evidence is persisted, store path *identities* (hashes/relative forms), not raw absolute paths, in `detail`.

### F4 — evidence timestamp defaults to wall-clock — LOW/INFO
- **Component:** `provisionBenchEnv` / `buildReadinessEvidence`
- **Observed:** `created_at` defaults to `new Date().toISOString()`; evidence is only reproducible when `createdAt` is injected.
- **Impact:** non-deterministic `created_at`/`record_hash` across runs unless a clock is supplied. No test asserts fixed hashes, so nothing breaks.
- **Recommendation:** inject a clock for reproducible/committed evidence.

### F5 — guard resolves symlinks only for existing paths — INFO
- **Component:** `guard.canon` (reused, not modified) via `provisionBenchEnv`
- **Observed:** `canon` falls back to `resolve()` on `ENOENT`, so a *not-yet-existing* root whose parent is a symlink into a protected root may not be caught at provision time.
- **Impact:** negligible in practice (roots are real temp dirs). **Defense in depth exists:** `verifyBenchEnv` re-checks `isInside(config_dir, REAL_CLAUDE_DIR)` after creation, when symlinks resolve.
- **Recommendation:** none required; note for hardening.

### F6 — test coverage gaps for stated security claims — MEDIUM
- **Component:** `test/environ.test.ts`
- **Observed / not covered:**
  - (a) **protected-root rejection** via `provisionBenchEnv` (only real `~/.claude` is asserted); the `benchmark-design`/`platform-validation` protected roots are not exercised at the environ level.
  - (b) the **`AUTHORIZED_FOR_RUN_A` gating branch** is never exercised (real gate always false), so the test proves it is *not* reached but not that it correctly requires **both** `authorized` and `may_start` — that branch is unverified by test (verified by inspection: `authorize().authorized && plan().may_start`).
  - (c) **repo-check FAIL → `validation_result:'FAIL'`** path is untested (hard to trigger without breaking provisioning).
- **Impact:** the claims are correct **by construction** (they reuse the guard tested elsewhere and a strict `&&`), but are not independently asserted here.
- **Recommendation:** add (a) a protected-root rejection test, and (b) a `readinessState` test injecting `authorize`/`plan` doubles to prove the `AUTHORIZED_FOR_RUN_A` branch requires both. (Not added during this audit to keep the suite unchanged; correctness established by inspection below.)

### F7 — no regression in adjacent systems — INFO (positive)
- **Observed:** `environ.ts` imports from `guard`, `fixtures`, `canonical`, `runA`, `phase4-register` and **modifies none**; it does not touch `validity.ts`, `scorer.ts`, `attribution.ts`, the fixture builders, case/prompt definitions, the decision register, or the Run A authorization path.
- **Evidence:** full suite 132/132 (122 prior all still green + 10 new); reconciliation 92/92/90/77/15 unchanged; gates still false.

## 3. Requirement traceability

| Requirement | Implementation mapping | Verdict |
|---|---|---|
| **TS-02** isolated config/state | `provisionBenchEnv` (isolated `CLAUDE_CONFIG_DIR` via `assertIsolatedConfigDir`; fresh `R/` via `buildRunRoot`); `verifyBenchEnv` (isolation, freshness, no-credential-copy). Login = external (`auth_reference`). | Repo parts covered; F2 (session evidence not required by state) |
| **TS-05** network isolation | `validateTs05Structure` (shape), `deriveNetworkVerified` (external-evidence-only, strict, never fabricated). VG-06/`validity.ts` **unchanged**. Mechanism = external. | Correct; not confused with fixture loopback |
| **TS-07** pinned CLI + attr@1 | CLI identity recorded as input; `checkModelPinning` for BQ-05; **sample capture/attr@1 comparison NOT in environ** (real-session/future). | Identity-recording only, as intended |
| **TS-11** NM calibration | **Not implemented in environ** (calibration orchestration is separate/future); environ does not touch VG-10/NM_STATUS. | Correctly out of scope; no side effects |
| **BQ-01** budget | environ spends nothing; no Claude invocation. | Honored |
| **BQ-03** k (repetitions) | unrelated; untouched. | N/A |
| **BQ-05** model IDs | `checkModelPinning` compares to `phase4ModelIds()`, flags mismatch, **never substitutes**, never invokes Claude. | Honored |
| **BQ-06** retention/storage | environ persists nothing to the repo (evidence returned in-memory); F3 applies when persisted. | Honored; F3 note |
| **BQ-19** auth/isolation | isolated config dir, no credential copy, no real-`~/.claude` reuse (guard throws → STOP-on-isolation-failure), auth material never in the record (only a reference). | Honored |

## 4. Test adequacy

**Covered (real properties, not just happy paths):** real `~/.claude` rejection; fresh-root requirement; missing external inputs represented (not invented); `network_isolation_verified` null when evidence absent/incomplete and on a wrong `loopback_allowance`; BQ-05 mismatch flagged with no substitution; evidence hash determinism + chain tamper detection + broken-link detection; state transitions across the external boundary; never marks unresolved external verified; Run A stays unauthorized even with a full synthetic external set.

**Not covered (see F6):** protected-root rejection at the environ level; the `AUTHORIZED_FOR_RUN_A` branch with injected open-gate doubles; the repo-check-FAIL → `validation_result:'FAIL'` path. These claims are correct by inspection but not independently asserted.

## 5. External dependencies remaining (genuine)
- Isolated Claude **login/credentials** (external; carried only as `auth_reference`).
- **OS-level Windows network-egress isolation** (external infrastructure; U-14 sandbox NOT AVAILABLE, B-6 deferred).
- **Real Claude execution** — TS-07 stream/attr@1 capture and TS-11 calibration sessions.
- **Run A authorization** (owner; `checkRunAuthorization` reads the frozen exit-criteria).

## 6. Recommendation for next phase

Conclusion is **PASS_WITH_GAPS** — no blocker. The **next validation step remains external and owner-gated** (owner environment specification → explicit approval → provisioning → evidence capture → preflight), unchanged by this audit. Optional, non-blocking **repository** follow-ups: close the F6 test gaps (protected-root rejection; injected-gate `AUTHORIZED_FOR_RUN_A` branch) and apply F3 evidence-path hygiene when readiness evidence is first persisted. None of these change validity/gate/decision semantics.

---

**Stop boundary confirmed:** no Claude execution/login, no network-policy change, no benchmark spend, no `/runtime/`, no fixture/prompt/validity/gate changes, real `~/.claude` untouched. TS-02/05/07/11 remain UNRESOLVED; `planRunA().may_start` and `checkRunAuthorization().authorized` remain `false`.

---

## Follow-up (2026-09-28) — F1/F3/F4/F6 addressed; F2 preserved as external

The original findings above are unchanged (historical record). This section records the repo-side remediation, limited to `bench/src/environ.ts`, `bench/test/environ.test.ts`, and `bench/PHASE-4.5-ENVIRONMENT-LAYER.md`.

- **F6 — CLOSED (tests added).** New tests: (a) protected-root rejection at the environ layer for the non-home `protectedRoots()` (`benchmark-design` / `platform-validation`) and their subdirs; (b) `readinessState` reaches `AUTHORIZED_FOR_RUN_A` **only** when *both* injected gate doubles are open, and never with the real (closed) default gate; (c) a repository-check failure yields `validation_result:'FAIL'` and state `REPO_PREP_FAILED`. No production gate weakened; `planRunA`/`checkRunAuthorization`/validity/decision semantics unchanged.
- **F1 — CLOSED (accurate state).** Added a distinct informational `REPO_PREP_FAILED` state; a repo-check failure no longer maps to `EXTERNAL_INPUTS_MISSING`. This extends the informational readiness vocabulary only (confined to `environ.ts`, referenced nowhere else); it introduces **no** executable gate and does not touch `planRunA`/`checkRunAuthorization`.
- **F3 — CLOSED (path hygiene).** `buildReadinessEvidence` redacts the local home directory (`redactPath` → `~`) from `checks[].detail` and the `config_dir_hash` input, so persisted evidence does not embed the OS username / absolute home path. TS-05 evidence fields and BQ-06 unchanged; live `verifyBenchEnv` detail retained for diagnosis.
- **F4 — CLOSED (deterministic clock).** Injectable `clock` on `provisionBenchEnv` and `buildReadinessEvidence`; production defaults to the wall clock. Schema and semantics unchanged.
- **F2 — INTENTIONALLY OPEN (external).** Not upgraded: no `auth_verified` field, no new authorization requirement. Documented in `PHASE-4.5-ENVIRONMENT-LAYER.md` as an external/owner-gated validation requirement; the repository never fabricates authentication evidence. TS-02 remains unresolved pending real isolated-session authentication.
- **F5 — INFO (unchanged).** Guard symlink behavior is reused as-is; `verifyBenchEnv` post-creation re-check remains the defense in depth. No change.

**Post-remediation validation:** full suite **137/137** pass (was 132; +5 environ tests); reconciliation 92/92/90/77/15; `planRunA().may_start=false`; `checkRunAuthorization().authorized=false`; `/runtime/` absent; real `~/.claude` untouched; 21 staged fixture files + manifest unchanged. **Conclusion after remediation: PASS** (F2 remains an external validation requirement by design, not a repo defect).
