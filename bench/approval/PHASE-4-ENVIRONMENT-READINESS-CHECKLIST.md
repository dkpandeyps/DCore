# Phase 4 — Environment-Readiness Checklist (TS-02, TS-05, TS-07, TS-11)

> **Read-only consolidation (2026-09-28).** Consolidates the four unresolved spikes into an execution-readiness
> matrix from existing authoritative artifacts. No spike executed, no environment provisioned, no network call,
> no Claude run, no gate/semantics change. All four spikes remain **UNRESOLVED**.

**Sources consolidated (no terminology replaced):** `PHASE-4-ENVIRONMENT-VALIDATION-PACKET.md`, `TS-05-OWNER-DECISION-PACKET.md`, `PHASE-4-DECISION-REGISTER.md/.json`, `PHASE-3-EVALUATION-METHODOLOGY.md §3.3/§5.1/§6.4`, `PHASE-3-EXIT-CRITERIA.md` (TS-07/TS-11 rows), `PHASE-3-V1.1-REVISION.md §2.1/§3`, `PLATFORM-ASSUMPTIONS.md U-14`, `PHASE-2-EXIT-CRITERIA.md` (B-6, Q22, isolation), `attribution.ts`, `validity.ts`, `guard.ts`, `driver.ts`, `fixtures-spec.ts`, `runA.ts`.

---

## TS-02 — isolated per-attempt login

1. **Spike question:** per-attempt fresh config without copying credentials (owner-approved isolated environment required) (`runA.ts`).
2. **Acceptance criterion:** a fresh per-attempt isolated `CLAUDE_CONFIG_DIR` state established without copying real credentials, demonstrated by a successful real Claude session under it, with the real `~/.claude` never used.
3. **Current status:** **UNRESOLVED.**
4. **Repository-grounded now:** guard refuses the real `~/.claude`, its subdirs, and the protected Phase-2/3 dirs (`assertIsolatedConfigDir`/`protectedRoots`); `driver.ts` launches with `CLAUDE_CONFIG_DIR` + fixed `ENV_ALLOW`; `config.ts` builds settings with **no credential/token reference and no read/copy from `~/.claude`**; BQ-19 isolation model (dedicated dir, one isolated login, fresh per-attempt state, never copy/reuse real state, STOP on isolation failure). **This is the isolated-`CLAUDE_CONFIG_DIR` arrangement — NOT end-to-end login/session validation.**
5. **Requires owner-provisioned environment access:** the dedicated benchmark login + isolated environment (BQ-19 / Q22).
6. **Requires an actual pinned Claude Code session:** yes — one successful session launched under the isolated `CLAUDE_CONFIG_DIR`.
7. **Exact evidence to capture:** an `aebs.attempt/2` record + `SessionTranscript` from the isolated session; VG-05 evidence (real `~/.claude/settings.json` hash identical before/after — baseline `sha256:fcc19c71f3aa35bc…`; write audit empty); VG-09 no leftover processes. **Credentials must never be read/copied from the real `~/.claude`.**
8. **PASS when:** a real isolated session succeeds AND VG-05 shows the real config untouched AND no credential copy occurred.
9. **FAIL when:** the isolated login cannot authenticate, OR VG-05 detects a real-`~/.claude` change / out-of-root write (⇒ STOP ALL RUNS), OR credentials would need copying from real `~/.claude`.
10. **NOT_EVALUATED/UNRESOLVED when:** no owner-approved environment / no isolated session run yet (current state).
11. **Validity gate(s):** VG-05 (real-config guard + write audit), VG-09 (leftover process).
12. **Blocks Run A:** **Yes** (`runA.ts` blocker `TS-02`).
13. **Dependencies:** none on other spikes; prerequisite (with TS-05) for the real sessions that TS-07/TS-11 need.
14. **Source refs:** `runA.ts`; `guard.ts`; `driver.ts`; `config.ts`; register `BQ-19`; methodology §4.1/§3.3; `PHASE-2-EXIT-CRITERIA.md` Q22.

---

## TS-05 — Windows network-egress isolation

1. **Spike question:** network isolation on Windows not established: VG-06 cannot pass (`runA.ts`).
2. **Acceptance criterion:** a named mechanism with a pinned policy that **blocks all non-loopback egress while leaving `127.0.0.1` reachable**, **verified active**, and recorded in the environment snapshot (§5.1) ⇒ `network_isolation_verified = true`.
3. **Current status:** **UNRESOLVED.** Owner decisions **TS-05-MECHANISM = APPROVED** and **TS-05-EVIDENCE = APPROVED** (register), but the concrete mechanism/evidence is **not provisioned or validated**.
4. **Repository-grounded now:** isolation **model** = local sinkhole only (§3.3); FX-SINK binds `127.0.0.1`, no other egress (`fixtures-spec.ts`); mechanism is an environment-snapshot field under **snapshot equality** (§5.1); VG-06 requires **verified active** (§6.4, `validity.ts network_isolation_verified`). Approved decisions: **external environment specification required**; **A1 (disposable VM/container) is a candidate, NOT a validated/provisioned mechanism**; the **approved evidence schema is a requirement, not populated evidence**. *(Loopback-only fixture design is **not** sufficient by itself — VG-06 requires the mechanism verified active.)*
5. **Requires owner-provisioned environment access:** yes — an external owner-provisioned environment specifying and running the egress mechanism (A1 candidate). `PLATFORM-ASSUMPTIONS.md U-14`: OS sandbox NOT AVAILABLE on Windows; `B-6`: compensating design not equivalent, sandbox testing deferred.
6. **Requires an actual pinned Claude Code session:** no — the isolation attestation is host/environment-level, not a Claude run (though it must be active during any real session).
7. **Exact evidence to capture (approved TS-05-EVIDENCE schema, not yet populated):** `mechanism_id`, `mechanism_policy_id/hash`, `egress_blocked`, `loopback_reachable`, `verified_at`, `run_id`, `environment_id`, `loopback_allowance = 127.0.0.1`, `non_loopback_egress_check`, `snapshot_network_isolation_mechanism` (§5.1 snapshot value).
8. **PASS when:** the mechanism is provisioned, `egress_blocked = true` and `loopback_reachable = true` verified active, snapshot value equal across paired A/B ⇒ `network_isolation_verified = true` ⇒ VG-06 PASS.
9. **FAIL when:** `network_isolation_verified = false` (mechanism not verified active) ⇒ VG-06 FAIL.
10. **NOT_EVALUATED/UNRESOLVED when:** `network_isolation_verified = null` — mechanism not established (current state).
11. **Validity gate(s):** VG-06.
12. **Blocks Run A:** **Yes** (`runA.ts` blocker `TS-05`; unchanged by the approved decisions).
13. **Dependencies:** must be active during the real sessions required by TS-07/TS-11.
14. **Source refs:** `TS-05-OWNER-DECISION-PACKET.md`; register `TS-05-MECHANISM`/`TS-05-EVIDENCE`; methodology §3.3/§5.1/§6.4; `validity.ts` VG-06; `fixtures-spec.ts`; `U-14`; `B-6`; `Q22`; `BQ-19`.

---

## TS-07 — Phase-4 CLI stream / attribution validation

1. **Spike question:** stream schema and `attr@1` strings must be re-validated on the Phase 4 Claude Code version (`runA.ts`).
2. **Acceptance criterion:** the `attr@1` strings and stream-event schema are confirmed against the **pinned Phase-4 CLI version**; `attr@1` is valid **only for 2.1.283** — any other version ⇒ every error `A9/unknown`, `table_valid: false` until re-derived.
3. **Current status:** **UNRESOLVED.**
4. **Repository-grounded now:** `attribution.ts` `ATTR_VALID_FOR = ['2.1.283']`; the eight patterns **A1–A8** (with sources E-03/E-05/E-10/E-11/E-13) + `A9` fallback; FXH markers (`FXH-STOP-G/-P/-OBS/-FAIL/-SLOW/-DENY/-ALLOW/-REWR-A/-REWR-B/-V1/-V2`); exit-criteria TS-07 "Mark attribution `unknown`; re-derive the table". *(Compatibility must NOT be inferred from source code alone.)*
5. **Requires owner-provisioned environment access:** the pinned Phase-4 CLI install (identity depends on **BQ-05** exact ids — unresolved — and the not-yet-built environment snapshot).
6. **Requires an actual pinned Claude Code session:** **yes** — capture real stream-json + permission events from the pinned CLI.
7. **Exact evidence to capture:** the pinned CLI/version identity + binary hash (environment snapshot); stream-json event samples covering the lifecycle; **at least one denial per rule A1–A8**; the eight `attr@1` regex patterns compared verbatim; the FXH markers for A1 hook attribution; a per-rule comparison artifact (match/mismatch/new) + stream-schema confirmation.
8. **PASS when:** the pinned version is confirmed (added to `ATTR_VALID_FOR` or a re-derived table produced) and every A1–A8 pattern + the stream schema match ⇒ `table_valid: true`.
9. **FAIL when:** captured strings/schema diverge from `attr@1` on the pinned version (⇒ re-derive the table).
10. **NOT_EVALUATED/UNRESOLVED when:** no pinned-version capture yet (current state) — every error stays `A9/unknown`, `table_valid: false`.
11. **Validity gate(s):** attribution `table_valid` (U-17) — attribution completeness feeds evidence/scoring.
12. **Blocks Run A:** **Yes** (`runA.ts` blocker `TS-07`).
13. **Dependencies:** needs the isolated-session capability (TS-02) and active network isolation (TS-05) during capture; the pinned version depends on BQ-05.
14. **Source refs:** `attribution.ts`; `PHASE-3-EXIT-CRITERIA.md` TS-07; register `BQ-05`; methodology §4.1 (driver flags); `PHASE-4-ENVIRONMENT-VALIDATION-PACKET.md §3`.

---

## TS-11 — NM calibration

1. **Spike question:** do the NOT_VERIFIED/PARTIALLY_VERIFIED native mechanisms behave as assumed on the Phase-4 CLI version? (`runA.ts` / exit-criteria TS-11).
2. **Acceptance criterion:** for every selected case's non-VERIFIED NM, a calibration probe passes (behavior == assumption) in each profile; else the dependent case is INVALID (config) via VG-10. **Calibration never upgrades a Phase-2 status.**
3. **Current status:** **UNRESOLVED.**
4. **Repository-grounded now:** the **18 non-VERIFIED NMs** — `NM-02b, NM-05, NM-06a, NM-07, NM-08, NM-09, NM-10, NM-11, NM-16, NM-20, NM-21, NM-22, NM-23, NM-24, NM-25, NM-26, NM-28, NM-29` (`validity.ts NM_STATUS` + revision §2.1 definitions); the **17-probe calibration set** (revision §3: CAL-NM-02b,05,06a,07,08,10,11,16,20,21,22,23,24,25,26,28,29) which **excludes NM-09** (CFG v1.1 does not depend on it — lint CFG-L01; TS-10 informational; no dependent case); per-NM→dependent-case map; VG-10 rule.
5. **Requires owner-provisioned environment access:** yes — the owner-approved environment to run the probes.
6. **Requires an actual pinned Claude Code session:** **yes** — real calibration-probe sessions (explicitly "real sessions, not authorized").
7. **Exact evidence to capture:** one `aebs.calibration/1` record per non-VERIFIED NM **per profile** (throw-away `R/`, sentinel files), recording observed behavior vs the §2.1 assumption.
8. **PASS when (per run+profile):** every dependent case's NM probe passes ⇒ VG-10 PASS. **Note:** a passing probe yields calibration PASS only; it does **NOT** set the NM to VERIFIED (status upgrade requires a separate owner-approved process).
9. **FAIL when:** a probe fails or is missing for an NM a selected case depends on ⇒ every attempt of that case in that profile is INVALID (config) and excluded from scores (VG-10).
10. **NOT_EVALUATED/UNRESOLVED when:** no calibration run yet (current state).
11. **Validity gate(s):** VG-10 (per-case validity).
12. **Blocks Run A:** **Yes** (`runA.ts` blocker `TS-11` when selected cases depend on non-VERIFIED NMs).
13. **Dependencies:** needs the isolated-session capability (TS-02) and active network isolation (TS-05) during probe sessions; shares the pinned-version dependency with TS-07 (BQ-05).
14. **Source refs:** `PHASE-3-V1.1-REVISION.md §2.1/§3`; `PHASE-3-EXIT-CRITERIA.md` TS-11; `validity.ts` VG-10 + `NM_STATUS`; catalog `nm_dependencies`; `PHASE-4-ENVIRONMENT-VALIDATION-PACKET.md §4`.

---

### Run A Readiness Summary

| Spike | Status | Blocker | Evidence still missing | Owner/environment action required | Real-Claude action required |
|---|---|---|---|---|---|
| TS-02 | UNRESOLVED | `runA.ts` TS-02 | successful isolated `aebs.attempt/2` session + VG-05/VG-09 evidence | owner-approved isolated env + dedicated benchmark login (BQ-19/Q22) | yes — one isolated session |
| TS-05 | UNRESOLVED (decisions APPROVED) | `runA.ts` TS-05 / VG-06 | provisioned mechanism + populated TS-05-EVIDENCE record (`network_isolation_verified` not set true) | external environment specification (A1 candidate) — provision + verify active | no (host/env-level attestation) |
| TS-07 | UNRESOLVED | `runA.ts` TS-07 | pinned CLI capture: stream samples + A1–A8 denials + comparison artifact | pinned Phase-4 CLI (BQ-05) + environment snapshot | yes — real capture session |
| TS-11 | UNRESOLVED | `runA.ts` TS-11 / VG-10 | 17 `aebs.calibration/1` records per profile | owner-approved env to run probes | yes — real calibration sessions |

---

### Earliest Legal Next Action

**Proposal (not execution):** the earliest legal action is an **owner-provided environment specification** — because every remaining validation requires either an owner-provisioned isolated environment (TS-02, TS-05, TS-11) or the pinned Phase-4 CLI (TS-07/TS-11 via BQ-05), none of which exists yet.

- **TS-05 is explicitly blocked on this:** the approved `TS-05-MECHANISM` decision is *"external environment specification required"*; no repository-only step can advance it (A1 is a candidate, not a provisioned/validated mechanism).
- No spike can move to PASS with a repository-only action. The only repository-only work still open is **harness scaffolding** noted elsewhere (environment snapshot, VG-05 write audit, VG-09 process check) — none of which validates a spike and all of which still leave TS-02/05/07/11 UNRESOLVED.

**Therefore: an owner-provisioned environment specification (isolated login environment + network-egress mechanism + pinned Phase-4 CLI) is required before any actual TS-02/05/07/11 validation can begin.** This checklist proposes that action; it does not take it.

---

### Explicit Stop Boundary

This consolidation:
- performs **no network calls**;
- does **not** provision/configure a VM, container, firewall, or network policy;
- does **not** execute Claude;
- does **not** create `/runtime/`;
- does **not** touch the real `~/.claude`;
- does **not** spend benchmark budget;
- does **not** change validity semantics (VG-05/06/09/10, `network_isolation_verified`, `attr@1` all unchanged);
- does **not** authorize Run A.
