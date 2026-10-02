# Phase 4 — Automated Environment Architecture Assessment (READ-ONLY)

> **Read-only architectural assessment (2026-09-28).** Provisions nothing, logs in to nothing, executes no
> Claude, changes no network policy, spends no budget, creates no `/runtime/`. It does not supply an owner
> environment specification and does not declare the benchmark environment ready. It assesses *which parts of
> Phase 4 benchmark-environment preparation can be automated/verified by the harness* vs. which genuinely
> require external infrastructure or owner approval — and preserves TS-02/05/07/11, VG-01..VG-10, and the Run A gate.

**Factual inputs:** the Phase 4 packets/register in `bench/approval/` + `bench/PHASE-4-DECISION-REGISTER.*`; `bench/src/{guard,config,driver,fixtures,validity,attribution,runA}.ts`; methodology §3.3/§5.1/§6.4; `PLATFORM-ASSUMPTIONS.md` U-14; `PHASE-2-EXIT-CRITERIA.md` B-6/Q22; and the researched the reference suite architecture (`REFERENCE-ARCHITECTURE-ANALYSIS.md`).

---

## 1. Executive conclusion

**Partially feasible — and the right target.** The harness can **auto-provision and auto-verify** the *repository-controllable* parts of benchmark-environment preparation: the fresh isolated `CLAUDE_CONFIG_DIR` + per-attempt `R/`, real-`~/.claude` protection (VG-05) and leftover-process hygiene (VG-09), CLI version/identity capture, evidence-schema population/validation, loopback reachability, and the calibration/attribution *orchestration + comparison logic*. It **cannot** automate three genuinely external things: (a) the actual isolated Claude **login/credentials**, (b) **OS-level network-egress isolation on Windows** (U-14: sandbox NOT AVAILABLE; B-6: deferred), and (c) anything requiring **real Claude execution** (TS-07 sample capture, TS-11 calibration), which stays behind explicit owner approval and the Run A gate. **Net:** ordinary dkskill users never need the PTPL benchmark environment; PTPL automates everything automatable and supplies only a small, fixed set of external/owner inputs once.

---

## 2. Runtime vs benchmark separation

**Ordinary dkskill users (runtime):** run dkskill against their **own** Claude Code install and their own `~/.claude`. They require **none** of the benchmark apparatus — no isolated login, no network-isolation mechanism, no pinned CLI capture, no calibration, no fixtures, no VG gates. The benchmark-environment preparation must therefore be a **PTPL-internal concern**, not something end users provide or reproduce.

**PTPL benchmark infrastructure (laboratory):** requires the isolated benchmark login, the network-egress isolation mechanism, the pinned Phase-4 CLI + model set (BQ-05), budget (BQ-01), retention/storage (BQ-06), and the calibration/attribution evidence — all inside an isolated environment (BQ-19/Q22) that never touches the real `~/.claude`.

**Consequence:** the manual "owner must reproduce the environment" framing conflates the two. Automation can move most of the PTPL lab prep into the harness, leaving a **minimal external/owner boundary** — which is what §3–§7 delineate.

---

## 3. Requirement classification

No mechanism is invented; each row uses only what the repository already defines.

| Requirement | Classification | Basis |
|---|---|---|
| **TS-02** fresh per-attempt `R/` + isolated `CLAUDE_CONFIG_DIR` | **AUTO-PROVISION** | `fixtures.buildRunRoot` (fresh empty `R/`), `config.ts` (settings built from template), `driver.ts` (`CLAUDE_CONFIG_DIR`, `ENV_ALLOW`) |
| **TS-02** real-`~/.claude` protection + no-credential-copy | **AUTO-VERIFY** | `guard.assertIsolatedConfigDir`/`protectedRoots`; VG-05 real-settings hash; `config.ts` copies nothing |
| **TS-02** leftover-process hygiene | **AUTO-VERIFY** | VG-09 (identity-checked cleanup) |
| **TS-02** the isolated Claude **login/credential** itself | **EXTERNAL-INFRASTRUCTURE** + **OWNER-INPUT** | BQ-19 (one isolated login; never created/copied by the harness) |
| **TS-02** successful-session evidence (`aebs.attempt/2`) | **AUTO-VERIFY** (once a login exists; requires real execution → OWNER-APPROVAL) | validation packet §1 |
| **TS-05** OS-level Windows egress-blocking mechanism | **EXTERNAL-INFRASTRUCTURE** | U-14 (sandbox NOT AVAILABLE); B-6 (deferred); harness must not configure firewall/network |
| **TS-05** loopback reachability + evidence-schema recording + §5.1 snapshot value | **AUTO-VERIFY** | methodology §5.1; TS-05-EVIDENCE schema (recording only) |
| **TS-05** active-enforcement proof (`egress_blocked = true`) | **EXTERNAL-INFRASTRUCTURE** (then AUTO-VERIFY) | VG-06 "verified active"; proving a non-loopback block presupposes the external mechanism |
| **TS-05** mechanism selection + policy | **OWNER-INPUT** | register TS-05-MECHANISM (external env spec required; A1 candidate only) |
| **TS-07** CLI version + binary-hash identity | **AUTO-VERIFY** | environment snapshot; the reference suite `claude-bin`/`version-source` pattern |
| **TS-07** pinned CLI install | **EXTERNAL-INFRASTRUCTURE** + **OWNER-INPUT** | BQ-05 exact ids; not yet built environment snapshot |
| **TS-07** stream/permission sample capture | **OWNER-APPROVAL** (real session) | methodology §4.1; attribution.ts |
| **TS-07** attr@1 A1–A8 comparison logic | **AUTO-VERIFY** (once samples exist) | attribution.ts |
| **TS-11** calibration probe orchestration + `aebs.calibration/1` recording + VG-10 | **AUTO-PROVISION** / **AUTO-VERIFY** (structure) | revision §3; validity.ts VG-10 |
| **TS-11** running the 17 probes (real sessions) | **OWNER-APPROVAL** + **EXTERNAL-INFRASTRUCTURE** | revision §3 ("real sessions, not authorized") |
| **BQ-01/03/05/06/19** decisions | **OWNER-APPROVAL** (recorded) | register (already recorded) |
| **Run A authorization** | **OWNER-APPROVAL** | guard.checkRunAuthorization (frozen exit-criteria) |

---

## 4. Authentication

**Automatable without touching/copying real `~/.claude`:** the harness already (a) builds a fresh isolated `CLAUDE_CONFIG_DIR` distinct from the real one, guard-refusing any path that overlaps it; (b) launches with a scrubbed `ENV_ALLOW` env + injected `CLAUDE_CONFIG_DIR`; (c) verifies the real `~/.claude/settings.json` hash is unchanged (VG-05). **Not automatable:** the harness must **not** create or copy credentials (BQ-19 `never_copy_credentials_from_real_config`). The isolated benchmark **login must pre-exist in the isolated environment** (EXTERNAL/OWNER-INPUT); the harness *consumes* it and *verifies isolation*, but never authenticates on the owner's behalf or reads real credentials. Auth material stays out of artifacts/logs (BQ-19).

---

## 5. Network isolation

**Can the harness genuinely establish and verify TS-05 on the target Windows environment?** **No — not establish.** U-14 records the OS **sandbox as NOT AVAILABLE on Windows** and B-6 accepts a compensating design that **does not cover network egress** and **defers** cross-platform sandbox testing. The harness therefore cannot *create* an OS-level egress block on the bare Windows host, and the stop boundary forbids it configuring firewall/network policy.

**What the harness *can* do (without weakening VG-06):** record the mechanism identity/policy hash and the §5.1 snapshot value; confirm `127.0.0.1` reachability for FX-SINK; and, *given an externally provided mechanism*, verify active enforcement as part of populating the TS-05 evidence record. VG-06 still requires `network_isolation_verified = true` (mechanism verified active) — **not weakened**, and loopback-only fixture behavior is still **not** accepted as proof.

**Precise remaining external dependency:** an **owner-provisioned isolation boundary that actually blocks non-loopback egress while permitting `127.0.0.1`** — per Q22 this is a **disposable VM/container** (or an equivalent host-level control the owner specifies). That boundary is EXTERNAL-INFRASTRUCTURE; the harness verifies and records it but cannot be it.

---

## 6. The reference suite comparison (factual input; no ranking)

From `REFERENCE-ARCHITECTURE-ANALYSIS.md`:
- **Egress control is forensic, not preventive:** hash-chained `security/egress.jsonl` written **fail-closed before every off-machine send**; a CI test fails on an unwired sink. URL validation blocks cloud-metadata endpoints but **explicitly allows localhost/private IPv4**. **No network interception/mocking**; "isolation is process separation, not capability isolation"; the Chromium sandbox is always disabled.
- **CLI/version handling:** `lib/claude-bin`, `version-source`, `eval-model` centralize binary/version/model resolution; discovery and CI output are made deterministic.
- **External tooling:** Docker (cso launcher), ngrok, and other CLIs are detected ad hoc; there is no dependency manifest.

**Patterns dkskill could adopt:**
- A **fail-closed, hash-chained evidence log** written *before* each recorded action — a good shape for the TS-05 evidence record and calibration/attempt evidence (audit integrity).
- A **centralized CLI/version/model resolver** (like `claude-bin`/`version-source`) to AUTO-VERIFY the pinned Phase-4 CLI identity for TS-07 and the BQ-05 model ids.
- **Deterministic CI generation + a test that fails on an unwired sink** — mirrors dkskill's existing "committed == fresh generation" tests.

**Where dkskill benchmark requirements are intentionally stricter (not a ranking, a scope difference):**
- dkskill's VG-06 requires network isolation **verified active (preventive)**; the reference suite's egress receipts are **forensic** and explicitly allow localhost/private IPv4 — so the reference suite's egress pattern is a useful **supplementary audit**, **not** a substitute for VG-06.
- dkskill mandates a **fresh per-attempt isolated config** and **real-`~/.claude` protection** as hard gates (VG-05); the reference suite's isolation is process separation.
- dkskill forbids credential copy and keeps auth material out of artifacts (BQ-19); the reference suite scrubs env per spawn but runs unsandboxed.

---

## 7. Proposed Phase 4.5 architecture (minimum additional layer)

A single **environment provisioning + verification module** (PTPL-internal; not on the ordinary-user path), that:
1. **Auto-provisions** the fresh isolated `CLAUDE_CONFIG_DIR` + per-attempt `R/` (reuses `buildRunRoot`/`config.ts`; no new mechanism).
2. **Auto-verifies** and emits a signed/hash-chained **environment-readiness evidence record**: VG-05 real-settings hash unchanged, VG-09 no leftover processes, CLI version+binary hash (TS-07 identity), model ids == BQ-05, loopback reachable, and the populated TS-05 evidence-schema fields.
3. **Consumes (never creates) the external inputs:** the isolated login, the network-isolation mechanism attestation, the pinned CLI install — each recorded by reference, never by copying secrets.
4. **Does not flip any gate:** it produces evidence only; `planRunA()`/`checkRunAuthorization()` stay behind explicit owner Run A authorization; calibration/attribution capture still require an authorized real session.

This isolates the AUTO boundary (module) from the EXTERNAL/OWNER boundary (login, egress mechanism, pinned CLI, approval), so ordinary users are wholly outside it.

---

## 8. Required future changes

- **Repository implementation (AUTO):** the Phase 4.5 provisioning+verification module; a centralized CLI/version/model resolver; an environment-snapshot capture; a hash-chained evidence log; the VG-05 write audit and VG-09 process check (already listed as "harness pieces not yet built"). *(Implementation is future work — not done here.)*
- **External infrastructure:** the disposable VM/container (or owner-specified host control) providing the egress boundary; the pinned Phase-4 Claude Code install; the isolated benchmark login.
- **Owner approval:** BQ-05 exact ids confirmation; the TS-05 environment specification (external-env-spec-required decision already APPROVED, mechanism not provisioned); explicit authorization to run real sessions (calibration, attribution capture); Run A authorization.
- **Future benchmark execution:** TS-07 sample capture, TS-11 calibration, then scored Run A — all gated, none in scope here.

---

## 9. Preservation requirements (confirmed unchanged)

This assessment proposes **no change** to and preserves:
- **VG-01..VG-10** semantics (incl. VG-06 verified-active, VG-05 real-config protection, VG-10 calibration validity).
- **BQ-01 / BQ-03 / BQ-05 / BQ-06 / BQ-19** decisions as recorded.
- **Exact model pinning** (BQ-05 stop-not-substitute; flagship `claude-opus-5`, mid-tier `claude-sonnet-5`).
- **Network isolation requirements** (VG-06 not weakened; loopback-only fixture behavior not accepted as proof).
- **Fresh-state requirements** (fresh `R/` + isolated config per attempt).
- **Real `~/.claude` protection** (guard + VG-05; no credential copy).
- **Explicit Run A authorization** (`guard.checkRunAuthorization` reads the frozen exit-criteria; `planRunA` stays blocked).

---

## 10. Stop boundary

This assessment performed:
- no provisioning; no Claude login; no Claude execution; no network-policy modification; no benchmark spend; no fixture changes; no prompt changes; no scoring/gate semantic changes; no `/runtime/`.

It is analysis only. TS-02/05/07/11 remain UNRESOLVED; `planRunA().may_start` and `checkRunAuthorization().authorized` remain `false`.
