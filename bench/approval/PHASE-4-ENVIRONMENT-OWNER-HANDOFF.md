# Phase 4 — Environment Owner Handoff

> **Owner-facing handoff (2026-09-28).** Explains exactly what the owner must supply before actual
> TS-02/05/07/11 validation is legally permitted. This document **is not owner approval** and provisions,
> selects, validates, and authorizes nothing. No environment values are populated; A1 is **not** selected.

---

## 1. Current repository state
- **All four spikes UNRESOLVED:** TS-02, TS-05, TS-07, TS-11.
- **TS-05:** the owner decisions `TS-05-MECHANISM` and `TS-05-EVIDENCE` are **APPROVED**, but the concrete mechanism/evidence is **not provisioned or populated** — **TS-05 itself remains UNRESOLVED**.
- **Run A is UNAUTHORIZED:** `planRunA().may_start = false`, `checkRunAuthorization().authorized = false`.
- **No environment provisioned.** No isolated login, no network mechanism, no pinned CLI captured.
- **No benchmark execution performed;** no benchmark spend; `/runtime/` absent; real `~/.claude` untouched.
- **Harness state:** 122/122 tests pass; reconciliation 92 / 92 / 90 / 77 / 15; 21 fixture files staged (behavior-only entries still deferred).

---

## 2. Owner-supplied environment requirements

### TS-02 — isolated Claude environment
Supply: **environment identity**; **isolation type** (disposable VM / container / scratch `CLAUDE_CONFIG_DIR`); the **benchmark `CLAUDE_CONFIG_DIR`** (guard-approved, must not overlap real `~/.claude`); **fresh-per-attempt state** method (fresh `R/` + config re-created from the profile template, per BQ-19); **authentication method** (one isolated benchmark login); **explicit no-credential-copying from real `~/.claude`** (BQ-19); **proof the harness cannot access/use real `~/.claude`** (guard refusal + VG-05 real-settings hash unchanged); **credential/artifact separation** (auth material outside artifacts/logs).

### TS-05 — network isolation
Supply: the **selected concrete mechanism**; **policy identity/version/hash**; **environment identity**; **exact egress policy**; **loopback allowance (`127.0.0.1`)**; **non-loopback egress prohibition**; **activation method**; **verification method** (mechanism verified active); the **methodology §5.1 snapshot representation** (`snapshot_network_isolation_mechanism`, subject to snapshot equality); and the **approved 10-field evidence schema** — `mechanism_id`, `mechanism_policy_id/hash`, `egress_blocked`, `loopback_reachable`, `verified_at`, `run_id`, `environment_id`, `loopback_allowance = 127.0.0.1`, `non_loopback_egress_check`, `snapshot_network_isolation_mechanism`.

Explicitly:
- **A1 (disposable VM/container) is only a candidate** — not a completed choice.
- **"Loopback-only fixture behavior" is insufficient** as proof of network isolation.
- **VG-06 requires the isolation mechanism to be verified active** (`network_isolation_verified = true`); this document does not change VG-06 or that field.

### TS-07 — pinned Claude Code
Supply: **exact CLI version**; **executable identity/hash**; **version-pinning method**; **exact model IDs from BQ-05** (flagship `claude-opus-5`, mid-tier `claude-sonnet-5`; stop-not-substitute); **stream capture** method; **per-rule permission samples**; the **attr@1 A1–A8** samples (≥1 denial per rule); the **FXH markers** (`FXH-STOP-G/-P/-OBS/-FAIL/-SLOW/-DENY/-ALLOW/-REWR-A/-REWR-B/-V1/-V2`).

Explicitly preserve:
- **attr@1 is valid only for the pinned version documented in the existing packet (CLI 2.1.283);** any other version ⇒ every error `A9/unknown`, `table_valid: false` until re-derived.
- **Source inspection cannot establish compatibility** — captured samples from the pinned CLI are required.

### TS-11 — NM calibration
Supply calibration for the **18 non-VERIFIED NMs**: `NM-02b, NM-05, NM-06a, NM-07, NM-08, NM-09, NM-10, NM-11, NM-16, NM-20, NM-21, NM-22, NM-23, NM-24, NM-25, NM-26, NM-28, NM-29`, via the **17-probe calibration set** (CAL-NM-02b,05,06a,07,08,10,11,16,20,21,22,23,24,25,26,28,29) — **NM-09 excluded** (CFG v1.1 does not depend on it; TS-10 informational; no dependent case).
- **Required evidence:** one `aebs.calibration/1` record per non-VERIFIED NM **per profile**.
- **VG-10 relationship:** a failed/missing probe for an NM a selected case depends on ⇒ that case is INVALID (config) in that profile and excluded from scores.
- **Calibration must not upgrade a Phase-2 status** (a passing probe = calibration PASS only).

---

## 3. Owner completion sequence
1. Owner supplies the environment specification (§2 fields).
2. Owner **explicitly approves** the supplied specification (separate from this document).
3. Environment is provisioned according to that specification.
4. Evidence is captured **without exposing credentials**.
5. Repository-side preflight checks the supplied evidence.
6. **Only after preflight passes** may actual TS-02/05/07/11 validation be considered.
7. **Run A remains separately gated and unauthorized** until every applicable Run-A prerequisite passes.

*Completing this handoff does not automatically authorize validation.*

---

## 4. Required owner attestations *(blank / unapproved)*

- [ ] Isolated environment exists.
- [ ] Authentication is isolated (one dedicated benchmark login).
- [ ] Real `~/.claude` is not used or copied.
- [ ] Network egress policy is active.
- [ ] `127.0.0.1` remains reachable.
- [ ] Non-loopback egress is blocked.
- [ ] Pinned CLI version is installed.
- [ ] Model IDs match BQ-05 (`claude-opus-5`, `claude-sonnet-5`).
- [ ] Required evidence can be captured.
- [ ] Owner authorizes the validation environment.

---

## 5. Evidence submission checklist

| Spike | Evidence to supply | State |
|---|---|---|
| TS-02 | `aebs.attempt/2` + `SessionTranscript` from an isolated session; VG-05 real-settings hash before/after; VG-09 no leftover processes; environment id | `PENDING` / `NOT PROVIDED` |
| TS-05 | populated 10-field evidence record (`egress_blocked`, `loopback_reachable`, `mechanism_id`, `mechanism_policy_id/hash`, `verified_at`, `run_id`, `environment_id`, `non_loopback_egress_check`, `snapshot_network_isolation_mechanism`) | `PENDING` / `NOT PROVIDED` |
| TS-07 | pinned CLI version + binary hash; stream-json samples; ≥1 denial per attr@1 A1–A8; FXH markers; per-rule comparison artifact | `PENDING` / `NOT PROVIDED` |
| TS-11 | 17 `aebs.calibration/1` records per profile (CAL-NM set; NM-09 excluded) | `PENDING` / `NOT PROVIDED` |

*No hashes, IDs, timestamps, outputs, CLI versions, network-policy identifiers, or calibration results are fabricated here.*

---

## 6. Explicit non-authorization

This handoff:
- **is not owner approval;**
- does **not** provision anything;
- does **not** validate anything;
- does **not** resolve TS-02/05/07/11;
- does **not** authorize Claude execution;
- does **not** authorize Run A.

TS-02, TS-05, TS-07, TS-11 remain **UNRESOLVED**; `planRunA().may_start` and `checkRunAuthorization().authorized` remain `false`.
