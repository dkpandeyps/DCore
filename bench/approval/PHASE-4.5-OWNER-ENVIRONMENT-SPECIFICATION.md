# Phase 4.5 — Owner Environment Specification (INTAKE / SCHEMA)

> **Documentation/schema only (2026-09-28).** Provisions nothing, authenticates nothing, configures no network,
> runs no Claude, performs no TS-07/TS-11/Run A, spends no budget. All owner fields are **blank** and must be
> filled by the owner; nothing here is fabricated. This is not a generic handoff packet — it is the precise
> intake schema for the missing external-environment facts and the segmented approvals.

Preserved decisions: **BQ-01** ($100 night / $500 release hard caps), **BQ-03** (k=30), **BQ-05** (exact model
IDs `claude-opus-5` / `claude-sonnet-5`, no substitution), **BQ-06** (retention/access/redaction), **BQ-19**
(isolated benchmark `CLAUDE_CONFIG_DIR`; never use/reuse real `~/.claude`), **B-6** (Windows OS sandbox
unavailable; compensating ACLs ≠ OS sandbox). TS-02/05/07/11 remain UNRESOLVED.

---

## A. Repository-controlled inputs (already implemented / validated — owner supplies nothing here)

Provided by `bench/src/environ.ts` (137/137 tests): isolated `CLAUDE_CONFIG_DIR`; fresh per-attempt `R/`;
isolated MCP configuration location; real `~/.claude` protection (guard); workspace/process hygiene;
credential-copy prevention; CLI/model identity **capture** (records inputs; no substitution; never invokes
Claude); hash-chained, home-redacted, deterministic readiness evidence; TS-05 evidence **structure** validation.
These are the consumers of the Section B inputs; they do not substitute for them and never fabricate them.

## B. Owner / external inputs that must be supplied

Each field below is `NOT PROVIDED` until the owner fills it. Format column shows the acceptable shape.

### 1. Environment identity

| Field | Required value | Format | Supplies / approves | Validation | Required before |
|---|---|---|---|---|---|
| `environment_id` | `NOT PROVIDED` | stable string, used across all TS evidence | Owner (PTPL) | consistency across TS-02/05/07/11 evidence | TS-02/05/07/11, Run A |
| `host_or_vm_id` | `NOT PROVIDED` | identifier of the isolated host/VM/container | Owner | matches isolation mechanism | TS-02/05, Run A |
| `os_version` | `NOT PROVIDED` | e.g. Windows 11 build | Owner | snapshot equality | TS-05, TS-07 |
| `architecture` | `NOT PROVIDED` | e.g. x64 | Owner | snapshot equality | TS-07 |
| `isolation_mechanism` | `NOT PROVIDED` | disposable VM / container / scratch (Q22) | Owner | matches TS-05 mechanism | TS-02/05, Run A |
| `created_or_verified_at` | `NOT PROVIDED` | ISO-8601 UTC | Owner | freshness | TS-02/05, Run A |
| `owner_approver` | `NOT PROVIDED` | role/name (PTPL owner) | Owner | present in approval section | all |

*(No unnecessary personal information is requested.)*

### 2. Claude authentication — TS-02

| Field | Required value | Format | Supplies / approves | Validation | Required before |
|---|---|---|---|---|---|
| `isolated_auth_mechanism` | `NOT PROVIDED` | description of the isolated login method | Owner | not a copy of real `~/.claude` | TS-02, Run A |
| `benchmark_config_root` | `NOT PROVIDED` | isolated `CLAUDE_CONFIG_DIR` path | Owner (repo enforces isolation) | guard `assertIsolatedConfigDir` | TS-02, Run A |
| `no_credential_copy_affirmation` | `NOT PROVIDED` | true | Owner | VG-05 real-settings hash unchanged | TS-02, Run A |
| `auth_reference` | `NOT PROVIDED` | opaque reference to the isolated login (never a credential) | Owner | reference resolvable | TS-02 |
| `authenticated_session_evidence` | `NOT PROVIDED` | `aebs.attempt/2` + `SessionTranscript` (by reference) | Owner (from a real session, separately authorized) | repo consumes by reference; never fabricated | TS-02, Run A |
| `verified_at` | `NOT PROVIDED` | ISO-8601 UTC | Owner | — | TS-02 |
| `environment_id` / `run_id` | `NOT PROVIDED` | matches Section 1 | Owner | consistency | TS-02 |

> **`auth_reference` alone is insufficient** to prove authenticated-session evidence. There is **no `auth_verified`
> gate**. TS-02 remains UNRESOLVED until real authenticated-session evidence exists. The repository never
> fabricates authentication evidence.

### 3. Claude CLI identity — TS-07

| Field | Required value | Format | Supplies / approves | Validation | Required before |
|---|---|---|---|---|---|
| `cli_version` | `NOT PROVIDED` | exact version string | Owner | equals pinned Phase-4 version; `attr@1` valid only for 2.1.283 | TS-07, Run A |
| `cli_binary_hash` | `NOT PROVIDED` | `sha256:<hex>` | Owner | environment snapshot | TS-07 |
| `executable_path` | `NOT PROVIDED` | path to the pinned CLI | Owner | resolvable | TS-07 |
| `verified_at` | `NOT PROVIDED` | ISO-8601 UTC | Owner | — | TS-07 |
| `environment_id` | `NOT PROVIDED` | matches Section 1 | Owner | consistency | TS-07 |

> No version substitution; no silent upgrade/downgrade. **If the exact pinned CLI cannot be provided, TS-07 remains BLOCKED.**

### 4. Model identity — BQ-05 / TS-07

| Field | Required value | Format | Supplies / approves | Validation | Required before |
|---|---|---|---|---|---|
| `flagship_model_id` | `claude-opus-5` (confirm) | exact ID | Owner | equals BQ-05; `checkModelPinning` | TS-07, Run A |
| `mid_tier_model_id` | `claude-sonnet-5` (confirm) | exact ID | Owner | equals BQ-05; `checkModelPinning` | TS-07, Run A |
| `tier_to_model_map` | `NOT PROVIDED` | which model per benchmark tier | Owner | no substitution | Run A |

> No substitution. **If a pinned model is unavailable, do not authorize a fallback** (BQ-05 stop-not-substitute).

### 5. Windows network isolation — TS-05 (approved 10-field schema, verbatim)

| Field | Required value | Format | Supplies / approves | Validation | Required before |
|---|---|---|---|---|---|
| `mechanism_id` | `NOT PROVIDED` | string | Owner | `validateTs05Structure` | TS-05, Run A |
| `mechanism_policy_id/hash` | `NOT PROVIDED` | id or `sha256:<hex>` | Owner | pins the exact policy | TS-05 |
| `egress_blocked` | `NOT PROVIDED` | boolean `true` | Owner | non-loopback blocked | TS-05, Run A |
| `loopback_reachable` | `NOT PROVIDED` | boolean `true` | Owner | 127.0.0.1 reachable | TS-05, Run A |
| `verified_at` | `NOT PROVIDED` | ISO-8601 UTC | Owner | — | TS-05 |
| `run_id` | `NOT PROVIDED` | string | Owner | consistency | TS-05 |
| `environment_id` | `NOT PROVIDED` | matches Section 1 | Owner | consistency | TS-05 |
| `loopback_allowance` | `NOT PROVIDED` | `127.0.0.1` | Owner | must equal 127.0.0.1 | TS-05 |
| `non_loopback_egress_check` | `NOT PROVIDED` | result + method | Owner | reproducible; egress blocked | TS-05, Run A |
| `snapshot_network_isolation_mechanism` | `NOT PROVIDED` | string | Owner | §5.1 snapshot equality (A/B) | TS-05, Run A |

Require: **non-loopback egress blocked**; **`127.0.0.1` loopback reachable**; **active OS-level mechanism**;
**reproducible verification evidence**. Explicitly insufficient: the FX-SINK loopback binding; repository
structure checks; an unverified Windows firewall configuration; compensating ACLs (not equivalent to an OS
sandbox — B-6). `network_isolation_verified = true` only with complete approved external evidence; VG-06 unchanged.

### 6. Authorization boundaries (separate approvals — do not collapse)

| Approval | Value | Supplies | Required before |
|---|---|---|---|
| `approve_provision_isolated_env` | `APPROVED` — DK Pandey, 2026-09-28T17:02:41Z, env `PTPL-DK-BENCH-WIN-01` (transcribed from the signed approval section's Permitted actions; recorded in register `APPROVE-PROVISION-ISOLATED-ENV`) | Owner | provisioning |
| `approve_authenticate_claude` | `APPROVED` — DK Pandey, 2026-09-28 (conversation); isolated auth for TS-02 only; recorded in register `APPROVE-AUTHENTICATE-CLAUDE`. NOTE: authentication not performed — no external isolated login is present in the environment. | Owner | TS-02 auth |
| `approve_enable_real_sessions` | `APPROVED (narrow)` — DK Pandey, 2026-09-28 (conversation); scoped ONLY to the single real authenticated session that produces the TS-02 evidence (aebs.attempt/2 + transcript, run_id, verified_at, environment_id, non-secret auth_reference) in the isolated config; recorded in register `APPROVE-ENABLE-REAL-SESSIONS`. Does NOT authorize Run A, benchmark case execution, spend, TS-05/07/11, or model substitution. | Owner | any real session |
| `approve_ts07_capture` | `NOT PROVIDED` | Owner | TS-07 |
| `approve_ts11_calibration` | `NOT PROVIDED` | Owner | TS-11 |
| `approve_run_a` | `NOT PROVIDED` | Owner | Run A |

### 7. BQ-06 evidence handling (no credentials requested or stored here)

| Field | Value | Format |
|---|---|---|
| `evidence_storage_location` | `NOT PROVIDED` | explicit local path (BQ-06) |
| `retention_period` | `NOT PROVIDED` | raw 30d / summary 90d (BQ-06 default; confirm) |
| `access_control` | `NOT PROVIDED` | PTPL engineering + DK Pandey (BQ-06) |
| `redaction_policy` | `NOT PROVIDED` | canary/secret redacted before storage (BQ-06) |
| `credential_exclusion` | `NOT PROVIDED` | affirm: no auth material in artifacts/logs (BQ-19) |
| `hash_integrity_mechanism` | `NOT PROVIDED` | e.g. hash-chained readiness/evidence records |

### 8. Benchmark budget (already approved; recorded, not authorized)

- Night aggregate hard cap: **$100**. Release aggregate hard cap: **$500**.
- **No spend is authorized by this document.** No overage; no substitution; no continuation after cap (BQ-01).

---

## Readiness matrix

All statuses begin `MISSING / UNVERIFIED` unless the repository already holds authoritative proof (it does not for
any external condition). Repository-side structure checks are **not** external verification.

| Requirement | Owner input | Evidence | Validation | Status | Gate dependency |
|---|---|---|---|---|---|
| TS-02 | isolated auth + config root (§2) | `aebs.attempt/2` authenticated-session + VG-05/VG-09 | repo consumes by reference; guard/VG-05 | MISSING / UNVERIFIED | blocks Run A |
| TS-05 | 10-field network isolation (§5) | `egress_blocked`+`loopback_reachable`+active mechanism | `validateTs05Structure` + external attestation; VG-06 | MISSING / UNVERIFIED | blocks Run A |
| TS-07 | pinned CLI (§3) + models (§4) | stream + A1–A8 denials + FXH; `attr@1` compare | real-session capture (owner-authorized) | MISSING / UNVERIFIED | blocks Run A |
| TS-11 | real-session authorization (§6) | 17 `aebs.calibration/1` per profile (NM-09 excluded) | VG-10; never upgrades Phase-2 status | MISSING / UNVERIFIED | blocks Run A |
| BQ-05 | model IDs (§4) | exact IDs confirmed | `checkModelPinning` (no substitution) | MISSING / UNVERIFIED | blocks TS-07 / Run A |
| BQ-06 | evidence handling (§7) | storage/retention/access/redaction | policy present | MISSING / UNVERIFIED | blocks Run A |
| BQ-19 | isolation + no-credential-copy (§1/§2) | isolated config + VG-05 unchanged | guard + VG-05 | repo-enforced; owner affirmation MISSING | blocks Run A |
| Run A authorization | segmented approvals (§6) | explicit owner authorization | `checkRunAuthorization` (frozen exit-criteria) | MISSING / UNVERIFIED | — |

---

## Owner completion / approval section *(leave blank — do not fabricate)*

- Specification approved by: `DK Pandey`
- Approval timestamp (ISO-8601 UTC): `2026-09-28T17:02:41Z`
- Environment identifier (`environment_id`): `PTPL-DK-BENCH-WIN-01`
- Scope approved: `Phase 4.5 external environment validation only; Run A remains separately blocked and unauthorized`
- Permitted actions: `Provision and validate the isolated benchmark environment; validate TS-02 isolated authentication, TS-05 network isolation, TS-07 pinned CLI/model identity, and TS-11 calibration only when their respective prerequisites and segmented approvals are satisfied`
- Prohibited actions: `Run A; benchmark spend; model substitution; use or reuse of real ~/.claude; copying credentials from real ~/.claude; and any action outside the explicitly approved Phase 4.5 external-validation scope`
- Expiration / revalidation requirement: `Revalidate approval if the benchmark environment, OS, network-isolation mechanism, Claude CLI/version, model, authentication configuration, or benchmark configuration changes`

> Completing this repository template is **not** owner approval; approval is the explicit, signed act above.
> Nothing here authorizes provisioning, authentication, real sessions, TS-07/TS-11, Run A, or spend.

**Run A remains BLOCKED and UNAUTHORIZED.** `planRunA().may_start = false`; `checkRunAuthorization().authorized = false`.
