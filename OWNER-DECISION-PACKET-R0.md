# Owner-decision packet — R0 / Phase 2 blockers (re-confirmation for the R2 gate)

> **Status: OWNER DECISIONS RECORDED (2026-09-28).** See [§ Recorded owner decisions](#recorded-owner-decisions-2026-09-28). This packet is the single R0 source of truth for these decisions; the frozen Phase 2 / Phase 3 design documents and the Phase 4 artifacts were not modified.
> _(Historical: the packet was originally prepared awaiting decisions; the per-item option blocks below are retained for traceability.)_
> **Purpose:** consolidate the R0-blocking decisions (B-1, B-2, B-5/Q21, B-6, and B-7's Q1, Q2, Q3, Q5, Q7, Q8, Q11, Q20, Q22) into one packet for explicit confirmation before any R2 runtime work.
> **Important:** most of these already have an owner decision recorded on **2026-09-27** in [platform-validation/PHASE-2-EXIT-CRITERIA.md § Owner decisions](platform-validation/PHASE-2-EXIT-CRITERIA.md). This packet does **not** treat those as automatically re-approved. For each item it shows the documented decision and asks you to **confirm it (choice A)** or **choose the alternative (choice B)**, and it requires explicit **values** for the parts recorded as deferred (Q1 final name, Q8 model IDs + budget, Q11 ownership).
> **No proposed default is accepted here. No decision is recorded merely because a default exists.**
> **Sources of truth:** ROADMAP.md, platform-validation/PHASE-2-EXIT-CRITERIA.md, PLATFORM-ASSUMPTIONS.md, MASTER-SPEC.md, platform-validation/ARCHITECTURAL-DECISIONS.md. This packet quotes them; it changes none of them.

---

## Separation notice

These are **R0 / Phase 2 platform-and-governance decisions**. They are **separate** from:
- the already-approved **Phase 3 benchmark design** (RP-1 v1.1, catalog v1.1, methodology v1.1; BQ-07/08/18/21/22/23), and
- the already-applied **Phase 4 case/fixture approvals** (CASE-PROMPTS, FIXTURES skeletons, GAP-07=B, NOT-READY=KEEP_OUT_OF_RUN_A, GAP-08, the field-approval batches, and the 28 reauthored-value approvals).

Deciding the items below does **not** reopen or alter any of those.

---

## Recorded owner decisions (2026-09-28)

**Recorded by owner instruction. No value inferred, defaulted, or substituted.** Recorded here (the R0 decision record) only; the frozen `platform-validation/PHASE-2-EXIT-CRITERIA.md` and all Phase 3/4 artifacts are unchanged.

### Project identity
| Field | Value |
|---|---|
| Product / project name | **dkskill** |
| Command namespace | **dkskill** |
| Project owner | **Dharmendra Kumar Pandey (DK Pandey)** |
| Organization | **PTPL** |

> Note: this is the authoritative R0 identity record. Propagating the working name **AEOS** → **dkskill** into MASTER-SPEC / PROPOSED-SYSTEM-ARCHITECTURE and the benchmark suite id (`aebs`) is a **separate later documentation task**, deliberately NOT done here (those are frozen design docs / Phase 4 artifacts). No rename was applied to code or design docs in this turn.

### Decisions
| ID | Recorded value | Change vs. prior record |
|---|---|---|
| **B-1** | `A` — Windows-first ≤150 ms median / ≤250 ms p95; timeout is fail-open **for availability only, NOT a safety boundary** | confirms 2026-09-27 |
| **B-2** | `A` — PowerShell-first; **no semantic Bash enforcement claim** until a validated Bash parser exists | confirms 2026-09-27 |
| **Q21/B-5** | `A` — R2 restart-only relaxation; no in-session channel validation required for initial R2 | confirms 2026-09-27 |
| **B-6** | `A` — compensating design (OS ACLs + opaque-exec policy + integrity checks); **explicitly NOT a sandbox** | confirms 2026-09-27 |
| **Q1** | product name = **dkskill**; command namespace = **dkskill** | **change/resolve** — was working name AEOS with final name deferred |
| **Q2** | **Apache-2.0** | **change** — was proprietary/internal |
| **Q3** | **coexist**; clean-room boundary preserved; do not modify, absorb, or depend on PaySecure | confirms 2026-09-27 |
| **Q5** | `A` — Claude-Code-only until R8 | confirms 2026-09-27 |
| **Q7** | **L1** default (safer/restricted level is the default) | confirms 2026-09-27 |
| **Q8** | flagship = **claude-opus-5**; mid-tier = **claude-sonnet-5**; budget/night = **USD 100**; budget/release = **USD 500** | **new/resolve** — was "flagship+mid, no budget, IDs deferred" |
| **Q11** | team/capacity = **PTPL engineering team**; spec owner = **DK Pandey**; safety reviewer = **DK Pandey** | **new** — was not supplied |
| **Q20** | `A` — managed settings assumed unavailable at the product layer; org deployment / administrator **not** a prerequisite for R2 | confirms 2026-09-27 |
| **Q22** | **CONFIRMED** — benchmark execution must use a dedicated isolated configuration/environment and must never touch the real `~/.claude` | confirms 2026-09-27 |

### Q8 model-ID pinning constraint (recorded)
- The exact IDs **claude-opus-5** and **claude-sonnet-5** are pinned for benchmark records. **Do not silently substitute newer models.**
- **Availability is not verified in this turn** (verifying would require invoking the real Claude executable, which is out of bounds). At Run A, if **either** pinned ID is unavailable in the actual Claude Code environment, the harness/operator **STOPS and reports** — it does not substitute (this matches VG-02: a resolved-model mismatch is INVALID, not a silent swap).

### Phase 4 decisions NOT resolved by these R0 decisions (still independently required)
Per instruction, the R0 Q8 values are recorded here but do **not** auto-resolve the separate Phase 4 decision records:
- **BQ-01** (paid benchmark budget in the Phase 4 record) — informed by Q8 (USD 100/night, 500/release) but must be set explicitly in the Phase 4 decision record.
- **BQ-05** (exact pinned model IDs in the Phase 4 record) — informed by Q8 (claude-opus-5 / claude-sonnet-5) but must be set explicitly there.
- **BQ-03** (repetitions k), **BQ-06** (artifact retention/storage/access), **BQ-19** (benchmark auth/isolation) — unaffected by these R0 decisions; still required before Run A. (Q22 confirms the isolation *approach* that BQ-19 will build on, but BQ-19 itself is a separate Phase 4 decision.)

---

## 1. B-1 — hook latency / timeout budget

- **Current status:** RESOLVED by owner acceptance (2026-09-27); presented for re-confirmation.
- **Why it blocks:** the policy hook runs on every tool call; if latency/timeout semantics are unacceptable (especially Windows) the enforcement architecture changes (e.g. a daemon becomes mandatory). Blocks R2.
- **Documented evidence:** U-10 (Windows median 120–131 ms, p95 129–234 ms; **timeout fails open**). AD-12, AP-8, PLATFORM-ASSUMPTIONS line 509.
- **Choices:**
  - **A.** Accept the Windows-first evidence and the **≤ 150 ms median / ≤ 250 ms p95** budget; treat hook timeout as **not** a safety boundary (fail-open).
  - **B.** Require macOS **and** Linux measurements before closing B-1.
- **Exact decision required:** `A` or `B`.
- **Unlocks:** R2 enforcement architecture; confirms the HOOK-LAT-001 budget already used in the Phase 3 benchmark.
- **Impact:** **both** — architecture (enforcement design) and benchmark validity (the latency budget).

## 2. B-2 — shell parsing approach

- **Current status:** RESOLVED by owner acceptance (2026-09-27); presented for re-confirmation.
- **Why it blocks:** the parser choice is the core of the safety engine and shapes runtime dependencies. Blocks R2.
- **Documented evidence:** U-11 (PowerShell AST adequate in a long-lived process; naive matching insufficient; **bash parser not validated**). U-08 (interpreter one-liners bypass deny rules). AD-13, SP-2a, SP-9.
- **Choices:**
  - **A.** Accept **PowerShell-first** parsing; until a Bash parser is validated, AEOS claims **no semantic Bash enforcement**, never auto-approves Bash, and stops/asks per policy (native permissions still apply).
  - **B.** Validate a Bash parser **now**, before proceeding.
- **Exact decision required:** `A` or `B`.
- **Unlocks:** R2 safety engine; confirms the conservative Bash posture used by the SHEL-BASH benchmark cases.
- **Impact:** **both** — architecture (safety engine) and benchmark validity (SHEL cases / conformance CC-02).

## 3. Q21 / B-5 — autonomy relaxation channel

- **Current status:** RESOLVED by owner acceptance (2026-09-27, restart-only for R2); presented for re-confirmation.
- **Why it blocks:** whether in-session relaxation is possible determines the autonomy architecture and the RP1-10 / SG-01 benchmark semantics. Blocks R2.
- **Documented evidence:** U-02 (UserPromptSubmit identifies the input channel, not a human; not fired for subagent prompts or Stop continuations; restart-only mechanism works in simulation). AD-10, SK-5.
- **Choices:**
  - **A.** Accept **restart-only** relaxation for R2 until an in-session relaxation channel is validated.
  - **B.** Reject restart-only and require validation of an in-session channel first.
- **Exact decision required:** `A` or `B`.
- **Unlocks:** R2 autonomy design; confirms RP1-10 / SG-01 in the benchmark.
- **Impact:** **both** — architecture (autonomy) and benchmark validity (AUTO-RELAX / SG-01).

## 4. B-6 — sandbox / compensating controls

- **Current status:** RESOLVED by owner acceptance (2026-09-27); presented for re-confirmation.
- **Why it blocks:** defense-in-depth layer 3 underpins the R2 protection claims. Blocks R2.
- **Documented evidence:** U-14 (**sandbox NOT AVAILABLE** on the tested Windows config); U-08 (interpreter bypass). AD-06, SP-8, PLATFORM-ASSUMPTIONS lines 541–551.
- **Choices:**
  - **A.** Accept the documented compensating design — **OS ACLs on AEOS state, the opaque-exec policy, and integrity checks** — reported as compensating controls, **never** as an OS sandbox.
  - **B.** Require sandbox testing on additional operating systems.
- **Exact decision required:** `A` or `B`.
- **Unlocks:** R2 safety exit criteria (defense-in-depth claims).
- **Impact:** primarily **architecture** (defense layer); secondarily benchmark safety-claim wording.

## 5. Q1 — final product name and command namespace

- **Current status:** working name **AEOS** decided for R0/R1; **final product name is deferred (a pre-release decision)** → **unresolved**.
- **Why it blocks:** the command namespace and public identity are needed before release packaging; not strictly an R2 blocker, but requested now.
- **Documented evidence:** PHASE-2-EXIT-CRITERIA Q1; ROADMAP R0.
- **Choices:** none proposed — **owner supplies the value.**
- **Exact decision required:** an explicit **product name** and **command namespace** string (e.g. the `/<name>` prefix). *I will not propose one.*
- **Unlocks:** release packaging / R5+ ship naming.
- **Impact:** neither architecture nor benchmark validity — product/governance (namespacing only).

## 6. Q2 — license

- **Current status:** **proprietary/internal for now** decided (2026-09-27); public licensing deferred → re-confirm or change.
- **Why it blocks:** contribution framework (SECURITY.md, NOTICE) and any external distribution.
- **Documented evidence:** PHASE-2-EXIT-CRITERIA Q2; ROADMAP R0 contribution framework.
- **Choices (documented implications):**
  - **MIT** — permissive; broad reuse; minimal obligations.
  - **Apache-2.0** — permissive with explicit patent grant and NOTICE requirements.
  - **Proprietary/internal** — no external license; internal use only (current recorded decision).
- **Exact decision required:** one of `MIT` / `Apache-2.0` / `proprietary-internal`.
- **Unlocks:** R0 contribution framework; any public release.
- **Impact:** neither — governance/legal.

## 7. Q3 — relationship to paysec

- **Current status:** **coexist** decided (2026-09-27); do not reuse paysec code; migration guidance deferred.
- **Why it blocks:** determines code-reuse boundaries and the clean-room obligation.
- **Documented evidence:** PHASE-2-EXIT-CRITERIA Q3; MASTER-SPEC §18.4 clean-room rule.
- **Choices (documented consequences):**
  - **replace** — AEOS supersedes paysec; migration path required.
  - **coexist** — both run during development; **no paysec code reuse** (current recorded decision).
  - **migrate** — staged move from paysec to AEOS; migration guidance required.
- **Exact decision required:** one of `replace` / `coexist` / `migrate`. **The clean-room requirement (MASTER-SPEC §18.4) is preserved regardless.**
- **Unlocks:** R0 repo/contribution boundaries.
- **Impact:** architecture-adjacent (clean-room / code-reuse boundary); not benchmark validity.

## 8. Q5 — host scope and tier policy

- **Current status:** **Claude Code only until R8** decided (2026-09-27); other hosts need explicit adapters + safety-cap validation.
- **Why it blocks:** host scope sets the adapter surface and the safety-cap validation burden.
- **Documented evidence:** PHASE-2-EXIT-CRITERIA Q5; ROADMAP R8; MASTER-SPEC host tiers.
- **Choices:**
  - **A.** Claude-Code-only until R8 (current recorded decision).
  - **B.** an alternative documented tier policy (broader host set earlier, with the required adapter + safety-cap validation).
- **Exact decision required:** confirm `A`, or specify the alternative tier policy.
- **Unlocks:** R2+ adapter scope; R8 ecosystem.
- **Impact:** **architecture** (adapter surface); benchmark scope is Windows/Claude-Code-only regardless.

## 9. Q7 — default autonomy level

- **Current status:** **L1 default** decided (2026-09-27); a project may configure L2.
- **Why it blocks:** the default ceiling shapes the runtime autonomy model and the AUTO benchmark expectations.
- **Documented evidence:** PHASE-2-EXIT-CRITERIA Q7; MASTER-SPEC §11 (L1/L2 envelopes); RP1-06/07.
- **Choices (documented consequences):**
  - **L1** — commits/push/install gated by approval by default (more restrictive).
  - **L2** — local commits allowed by default; push/install still gated (project-configured).
- **Exact decision required:** confirm `L1` as default, or choose `L2`.
- **Unlocks:** R2 autonomy defaults.
- **Impact:** **both** — architecture (default ceiling) and benchmark validity (AUTO L1/L2 cases).

## 10. Q8 — benchmark models and budget

- **Current status:** model *set* decided (2026-09-27: current flagship + one mid-tier). **No paid-eval budget set; exact model IDs deferred** → **values required before any paid benchmark execution** (also a Run A blocker).
- **Why it blocks:** exact pinned model IDs are required for VG-02 (resolved-model check); budgets gate any paid run.
- **Documented evidence:** PHASE-2-EXIT-CRITERIA Q8; Phase 3 BQ-01, BQ-03, BQ-05, BQ-06.
- **Values required (four, separately — do not conflate):**
  - **flagship model ID:** _explicit string; I will not invent it._
  - **mid-tier model ID:** _explicit string; I will not invent it._
  - **budget per benchmark night (USD):** _explicit value._
  - **budget per release (USD):** _explicit value._
- **Unlocks:** Run A execution (with BQ-19 auth); the benchmark cost/repetition plan.
- **Impact:** **benchmark validity** (model pinning) and execution authorization (spend).

## 11. Q11 — team / capacity / ownership

- **Current status:** **not supplied**; required before the R0 safety-review gate (MASTER-SPEC §18.2) → **unresolved**.
- **Why it blocks:** the safety-review gate for adversarial content and the spec-ownership sign-off cannot proceed without named owners.
- **Documented evidence:** PHASE-2-EXIT-CRITERIA Q11; MASTER-SPEC §18.2.
- **Values required:**
  - **team / capacity definition** (size and sizing basis),
  - **spec owner** (named role),
  - **safety reviewer** (named role for adversarial cases).
- **Unlocks:** the R0 safety-review gate; adversarial-catalog approval (Phase 3 BQ-02).
- **Impact:** neither architecture nor benchmark validity directly — a process/governance gate.

## 12. Q20 — managed settings

- **Current status:** for Phase 2, **assume managed settings unavailable** to individual users (2026-09-27); documented as a recommended organizational layer; no local `managed-settings.json` found (U-13).
- **Why it blocks:** whether managed settings are available changes defense-in-depth layer 5 and the baseline-profile assumptions.
- **Documented evidence:** PHASE-2-EXIT-CRITERIA Q20; U-13; MASTER-SPEC SP-8/SP-10.
- **Choices:**
  - **A.** Keep the documented position: managed settings **not assumed available**; layers 1–3 and 5 stand alone; managed settings recommended organizationally.
  - **B.** Commit to **organizational deployment** of managed settings as a relied-upon control (names an administrator owner).
- **Exact decision required:** confirm `A`, or choose `B` and name the administrator owner.
- **Unlocks:** R2 defense-in-depth claims; baseline-profile assumptions.
- **Impact:** **architecture** (defense layer 5); minor benchmark baseline wording.

## 13. Q22 — isolated validation environment

- **Current status:** the record states this is **"effectively answered"** — the owner **explicitly approved** the isolated scratch environment used for Phase 2 hands-on validation (`platform-validation/scratch`, a separate `CLAUDE_CONFIG_DIR`).
- **What was already established (verbatim intent):** hands-on validation ran in an isolated `CLAUDE_CONFIG_DIR` on Windows 11 (38 sessions, $0.79); the real `~/.claude`, the reference suite and paysec were verified unchanged; further hands-on validation must stay isolated and must not touch `~/.claude/settings.json`, the reference suite or paysec.
- **Why it presented as a blocker:** Q22 is a prerequisite for resolving B-1…B-6 (the hands-on evidence depends on an approved environment), and it is the template for the Phase 4 isolated environment (BQ-19).
- **Choices:** confirm or restate.
- **Exact decision required:** **explicit confirmation** that the isolated-environment approval stands (and, if you wish, that the same isolation model governs Phase 4 execution) — I am **not** treating it as auto-approved.
- **Unlocks:** it underpins B-1…B-6 evidence and informs BQ-19 (benchmark auth/isolation).
- **Impact:** **benchmark validity** (environment isolation) and process.

---

## Phase 4 frozen state (unchanged by this packet)

| Item | State |
|---|---|
| Catalog cases | 92 |
| Executable-form documents | 90 (2 MCP-UNVAL emit provenance only) |
| Executable cases | 77 |
| NOT_READY / KEEP_OUT_OF_RUN_A | 15 |
| Pending executable-case fields | 19 (12 `REQUEST_REAUTHORING` + 7 `KEEP_PENDING_SOURCE_SILENT`) |
| Fixture families with content pending | 6 |
| Run A | **blocked** (`planRunA()` → may_start: false) |
| Real Claude execution | none |
| Benchmark spend | zero |

Prior approvals intact: CASE-PROMPTS=APPROVE_ALL, FIXTURES=APPROVE_ALL_SKELETONS, GAP-07=B, GAP-08=APPROVE_PROPOSED, NOT-READY=KEEP_OUT_OF_RUN_A, REAUTHOR-APPROVAL=APPROVE_28.

---

## How to respond

Reply with a value per item, e.g.:
`B-1: A · B-2: A · Q21: A · B-6: A · Q1: <name>,<namespace> · Q2: proprietary-internal · Q3: coexist · Q5: A · Q7: L1 · Q8: flagship=<id>, mid=<id>, night=$<x>, release=$<y> · Q11: team=<…>, spec_owner=<…>, safety_reviewer=<…> · Q20: A · Q22: confirmed`

I will record only the values you supply, into the appropriate decision records, and will not infer or default anything.
