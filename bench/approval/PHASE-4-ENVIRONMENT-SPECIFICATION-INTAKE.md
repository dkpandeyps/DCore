# Phase 4 — Environment-Specification Intake (TEMPLATE)

> **Intake template only (2026-09-28). No environment has been provisioned.** Every value below is a blank to
> be supplied by the owner; unfilled fields read `PENDING` or `NOT PROVIDED`. Completing this repository
> template is **not** owner approval and does **not** provision, configure, authenticate, execute, or validate
> anything. TS-02, TS-05, TS-07, TS-11 remain **UNRESOLVED**.

**Authoritative basis (terminology preserved; not replaced):** `PHASE-4-ENVIRONMENT-READINESS-CHECKLIST.md`, `PHASE-4-ENVIRONMENT-VALIDATION-PACKET.md`, `TS-05-OWNER-DECISION-PACKET.md`, `PHASE-4-DECISION-REGISTER.md/.json`, and the Phase 3 / platform-validation artifacts those cite (methodology §3.3/§5.1/§6.4; `attribution.ts` attr@1; `validity.ts` VG-06/VG-10; U-14; B-6; Q22; BQ-05; BQ-19).

---

## 1. Isolated Claude environment — TS-02

| Field | Value (owner to supply) |
|---|---|
| Environment identifier | `NOT PROVIDED` |
| Isolation type (disposable VM / container / scratch `CLAUDE_CONFIG_DIR`) | `NOT PROVIDED` |
| Disposable VM/container/scratch-environment description | `NOT PROVIDED` |
| Benchmark-specific `CLAUDE_CONFIG_DIR` (path, guard-approved; must NOT overlap real `~/.claude`) | `NOT PROVIDED` |
| How a fresh per-attempt config/state is created (per BQ-19: fresh `R/` + config re-created from profile template) | `NOT PROVIDED` |
| Explicit confirmation credentials are NOT copied from real `~/.claude` (BQ-19 `never_copy_credentials_from_real_config`) | `PENDING` (must be affirmed) |
| How Claude authentication is performed inside the isolated environment (one isolated benchmark login) | `NOT PROVIDED` |
| Credential handling location + confirmation credentials cannot enter benchmark artifacts/logs (BQ-19 `auth_material_outside_artifacts_and_logs`) | `NOT PROVIDED` |
| Proof the harness cannot access/use real `~/.claude` (guard `assertIsolatedConfigDir`/`protectedRoots`; VG-05 real-settings hash unchanged) | `PENDING` |
| Owner/provisioning authority | `NOT PROVIDED` |
| Exact evidence artifact expected for later validation (`aebs.attempt/2` + `SessionTranscript`; VG-05 before/after hash; VG-09 no leftover processes) | `PENDING` |

*Do not invent credentials, tokens, login results, or environment IDs. The isolated `CLAUDE_CONFIG_DIR` arrangement is distinct from end-to-end login/session validation, which requires an actual session (§6).*

---

## 2. Network isolation — TS-05

Owner decisions on file: **TS-05-MECHANISM = APPROVED** ("external environment specification required"; A1 VM/container is a **candidate, not a completed choice**) and **TS-05-EVIDENCE = APPROVED** (schema only, not populated). VG-06 requires the mechanism **verified active**; `network_isolation_verified` and VG-06 are **unchanged** and must not be altered.

| Field | Value (owner to supply) |
|---|---|
| Selected mechanism (A1 candidate is not yet a completed choice) | `NOT PROVIDED` |
| `mechanism_id` | `NOT PROVIDED` |
| `mechanism_policy_id` / version / hash | `NOT PROVIDED` |
| `environment_id` | `NOT PROVIDED` |
| Exact egress policy | `NOT PROVIDED` |
| Explicit allowance for `127.0.0.1` (`loopback_reachable`) | `PENDING` (must be affirmed = 127.0.0.1 only) |
| Explicit prohibition of non-loopback egress (`egress_blocked`) | `PENDING` (must be affirmed) |
| How the mechanism is activated | `NOT PROVIDED` |
| How active enforcement is verified (`non_loopback_egress_check`) | `NOT PROVIDED` |
| Snapshot representation required by methodology §5.1 (`snapshot_network_isolation_mechanism`; snapshot equality across A/B) | `NOT PROVIDED` |
| Approved TS-05 evidence fields: `mechanism_id`, `mechanism_policy_id/hash`, `egress_blocked`, `loopback_reachable`, `verified_at`, `run_id`, `environment_id`, `loopback_allowance = 127.0.0.1`, `non_loopback_egress_check`, `snapshot_network_isolation_mechanism` | `PENDING` (schema approved; values NOT populated) |
| Owner/provisioning authority | `NOT PROVIDED` |

*Do not declare compliance because a mechanism sounds capable. Do not accept "the fixtures only use loopback" as proof of network isolation (VG-06 requires verified-active enforcement). Do not alter VG-06 or `network_isolation_verified`.*

---

## 3. Pinned Claude Code environment — TS-07 / TS-11

`attr@1` is valid **only for CLI 2.1.283**; any other version ⇒ every error `A9/unknown`, `table_valid: false` until re-derived. Model IDs per register **BQ-05** (`flagship: claude-opus-5`, `mid_tier: claude-sonnet-5`; stop-not-substitute) — the owner must confirm the exact pinned identity captured in the environment snapshot.

| Field | Value (owner to supply) |
|---|---|
| Exact Claude Code CLI version | `NOT PROVIDED` |
| Exact executable/version identity evidence (binary hash + version, environment snapshot) | `NOT PROVIDED` |
| Exact model IDs used (register BQ-05: flagship `claude-opus-5`, mid-tier `claude-sonnet-5` — confirm) | `PENDING` (confirm against snapshot) |
| How the version is pinned | `NOT PROVIDED` |
| How stream output is captured (driver flags: `--input-format/--output-format stream-json --verbose --include-hook-events`) | `NOT PROVIDED` |
| How per-rule permission samples are captured | `NOT PROVIDED` |
| Required `attr@1` A1–A8 samples (≥1 denial per rule; sources E-03/E-05/E-10/E-11/E-13) | `PENDING` |
| Required FXH markers (`FXH-STOP-G/-P/-OBS/-FAIL/-SLOW/-DENY/-ALLOW/-REWR-A/-REWR-B/-V1/-V2`) | `PENDING` |
| Calibration-session evidence for the 17 TS-11 probes (`aebs.calibration/1` per NM per profile: CAL-NM-02b,05,06a,07,08,10,11,16,20,21,22,23,24,25,26,28,29 — **NM-09 excluded**) | `PENDING` |
| Confirmation NM calibration does NOT upgrade Phase-2 status (revision §3) | `PENDING` (must be affirmed) |

*Do not perform calibration or claim compatibility here. Do not infer version compatibility from source code alone — it requires captured samples from the pinned CLI.*

---

## 4. Cross-spike readiness table

| Requirement | TS-02 | TS-05 | TS-07 | TS-11 |
|---|---|---|---|---|
| Owner specification supplied | NOT PROVIDED | NOT PROVIDED | NOT PROVIDED | NOT PROVIDED |
| Environment provisioned | PENDING | PENDING | PENDING | PENDING |
| Evidence available | PENDING | PENDING | PENDING | PENDING |
| Actual validation permitted | PENDING | PENDING | PENDING | PENDING |
| Current status | UNRESOLVED | UNRESOLVED (decisions APPROVED) | UNRESOLVED | UNRESOLVED |

---

## 5. Owner handoff checklist

*(An owner must complete all items before actual validation may begin. Checking these boxes in this repository template is NOT owner approval — approval is a separate, explicit act.)*

- [ ] **Isolated environment specification** supplied (TS-02): environment id, isolation type, benchmark `CLAUDE_CONFIG_DIR`, fresh-per-attempt method, no-credential-copy affirmation.
- [ ] **Network-egress policy** supplied (TS-05): selected mechanism + policy id/hash, `127.0.0.1` allowed, non-loopback egress prohibited, activation + verification method, §5.1 snapshot value.
- [ ] **Pinned CLI version** supplied (TS-07/TS-11): exact version + binary-hash identity + pin method, confirmed model IDs.
- [ ] **Authentication arrangement** supplied (TS-02): isolated login method; credential-handling location; artifacts/logs exclusion affirmed.
- [ ] **Evidence locations** supplied: where `aebs.attempt/2`, VG-05/VG-09 evidence, the TS-05 evidence record, the attr@1 comparison artifact, and the 17 `aebs.calibration/1` records will be stored (BQ-06 retention/access).
- [ ] **Environment identity** supplied: `environment_id` used consistently across TS-02/05/07/11 evidence.
- [ ] **Owner approval** recorded explicitly (separate from this template) authorizing actual validation in the specified environment.

---

## 6. Explicit stop boundary

This artifact does **NOT**:
- provision any environment;
- configure networking;
- create a VM/container;
- perform login;
- execute Claude;
- make network calls;
- run TS-02/05/07/11 validation;
- populate evidence;
- create `/runtime/`;
- touch real `~/.claude`;
- authorize Run A;
- spend benchmark budget.

It is a blank intake template. TS-02, TS-05, TS-07, TS-11 remain UNRESOLVED; `planRunA().may_start` and `checkRunAuthorization().authorized` remain `false`.
