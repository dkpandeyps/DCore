# Phase 4 — Environment-Specification Review (READ-ONLY)

> **Read-only completeness/consistency review (2026-09-28).** Provisions, configures, validates, and
> authorizes nothing. This review first checked whether an owner-supplied environment specification exists.

## Finding: no owner specification supplied
As of this review, **no owner-provided environment specification is present** in the repository or the conversation:
- `bench/approval/PHASE-4-ENVIRONMENT-SPECIFICATION-INTAKE.md` remains **entirely blank** — 38 `PENDING` / `NOT PROVIDED` markers, **zero filled values**.
- No owner-supplied specification file exists in `bench/approval/` (or elsewhere).
- **No explicit owner approval statement** exists (and none is inferred — not from a file's existence, not from a checkbox, not from an assumed identity, and not from the previously approved TS-05 decisions).

Every requirement is therefore classified **MISSING**. The two prior TS-05 decisions (`TS-05-MECHANISM`, `TS-05-EVIDENCE`) remain APPROVED, but that is **not** approval of an environment specification.

---

## 1. Review conclusion

**`INCOMPLETE`**

No environment specification has been supplied, so no required field can pass and no explicit owner approval is present. (Not `INCONSISTENT`/`BLOCKED_PENDING_OWNER_CLARIFICATION`: there is no supplied content to be internally inconsistent or ambiguous — it is simply absent.)

---

## 2. Requirement-by-requirement matrix

| Spike | Requirement | Classification | Supplied value/evidence | Source requirement | Issue/action |
|---|---|---|---|---|---|
| TS-02 | Environment identity | MISSING | — | Handoff §2 / Intake §1 | Owner to supply |
| TS-02 | Isolation type (VM/container/scratch) | MISSING | — | Handoff §2 / Intake §1 | Owner to supply (not merely "an isolated machine") |
| TS-02 | Benchmark `CLAUDE_CONFIG_DIR` (guard-approved) | MISSING | — | Handoff §2; guard.ts | Owner to supply |
| TS-02 | Fresh-per-attempt state method | MISSING | — | Handoff §2; BQ-19 | Owner to supply |
| TS-02 | Isolated authentication method | MISSING | — | Handoff §2; BQ-19 | Owner to supply |
| TS-02 | Explicit no-copy of credentials from real `~/.claude` | MISSING | — | BQ-19 | Owner to affirm |
| TS-02 | Proof/guard preventing harness use of real `~/.claude` | MISSING | — | guard.ts; VG-05 | Owner to supply |
| TS-02 | Credential/artifact separation | MISSING | — | BQ-19 | Owner to affirm |
| TS-02 | Evidence artifact definition (`aebs.attempt/2`, VG-05/VG-09) | MISSING | — | Validation packet §1 | Owner to define |
| TS-05 | Concrete selected mechanism | MISSING | — | TS-05 packet; register TS-05-MECHANISM | A1 remains only a candidate |
| TS-05 | `mechanism_id` | MISSING | — | TS-05-EVIDENCE schema | Owner to supply |
| TS-05 | `mechanism_policy_id` / version / hash | MISSING | — | TS-05-EVIDENCE schema | Owner to supply |
| TS-05 | `environment_id` | MISSING | — | TS-05-EVIDENCE schema | Owner to supply |
| TS-05 | Exact egress policy | MISSING | — | TS-05 packet | Owner to supply |
| TS-05 | `127.0.0.1` allowance | MISSING | — | methodology §3.3; FX-SINK | Owner to affirm |
| TS-05 | Non-loopback egress prohibition | MISSING | — | fixtures-spec.ts; VG-06 | Owner to affirm (loopback-only fixture behavior is NOT proof) |
| TS-05 | Activation method | MISSING | — | TS-05 packet | Owner to supply |
| TS-05 | Active-enforcement verification method | MISSING | — | §6.4/VG-06 (verified active) | Owner to supply |
| TS-05 | Methodology §5.1 snapshot representation | MISSING | — | methodology §5.1 | Owner to supply |
| TS-05 | All 10 approved TS-05 evidence fields populated | MISSING | — | TS-05-EVIDENCE | Schema approved; values not populated |
| TS-07 | Exact Claude Code CLI version | MISSING | — | Validation packet §3 | Owner to supply |
| TS-07 | Executable identity/hash | MISSING | — | Validation packet §3 | Owner to supply |
| TS-07 | Version-pinning method | MISSING | — | Validation packet §3 | Owner to supply |
| TS-07 | Exact BQ-05 model IDs | MISSING | — | register BQ-05 | Owner to confirm (`claude-opus-5`, `claude-sonnet-5`) |
| TS-07 | Stream capture method | MISSING | — | methodology §4.1 | Owner to supply |
| TS-07 | Per-rule permission sample method | MISSING | — | attribution.ts | Owner to supply |
| TS-07 | attr@1 A1–A8 samples | MISSING | — | attribution.ts | Must be captured on the pinned CLI, not inferred from source |
| TS-07 | FXH markers | MISSING | — | attribution.ts FXH_MARKERS | Owner to supply |
| TS-11 | All 18 non-VERIFIED NMs represented | MISSING | — | revision §2.1 | Owner to supply |
| TS-11 | 17-probe calibration set represented | MISSING | — | revision §3 | Owner to supply |
| TS-11 | NM-09 remains excluded from calibration | MISSING | — | revision §3 (CFG-L01) | Owner to affirm |
| TS-11 | Calibration evidence defined (`aebs.calibration/1` per NM per profile) | MISSING | — | revision §3 | Owner to define |
| TS-11 | VG-10 dependency preserved | MISSING | — | validity.ts VG-10 | Owner to affirm |
| TS-11 | Calibration does not upgrade Phase-2 status | MISSING | — | revision §3 | Owner to affirm |
| — | **Explicit owner approval of the specification** | MISSING | — | Handoff §3–4 | Absent; must not be inferred |

*No requirement is `NOT_APPLICABLE` — the authoritative packets require all of the above.*

---

## 3. Conflict analysis

**No conflicts identified.** There is no supplied specification content to conflict with the existing Phase 4 decisions; every field is simply absent (MISSING). No conflict was silently resolved.

---

## 4. Missing owner inputs

The complete owner-input set is missing:
1. Completed environment-specification intake fields (§1–§3 of the intake).
2. Concrete isolated environment specification (TS-02).
3. Concrete network-egress isolation mechanism + policy (TS-05; A1 is only a candidate until explicitly selected and defined).
4. Pinned Claude Code CLI version + identity/hash (TS-07/TS-11).
5. BQ-05 model IDs confirmation.
6. Authentication/isolation arrangement (TS-02).
7. Evidence locations/artifacts (all four spikes).
8. **Explicit owner approval** of the supplied specification.

No replacements are invented for any missing input.

---

## 5. Provisioning readiness

**`NOT READY`.**

No specification and no explicit owner approval are present, so there is nothing to provision from and no authorization to do so. This review does not provision the environment under any circumstance.

---

## 6. Explicit stop boundary

Confirmed — this review:
- created no VM/container;
- configured no firewall/network policy;
- performed no Claude login;
- executed no Claude;
- made no network calls;
- ran no TS-02/05/07/11 validation;
- ran no TS-11 calibration;
- fabricated no evidence;
- changed no validity logic;
- created no `/runtime/`;
- left the real `~/.claude` untouched;
- kept Run A unauthorized;
- spent no benchmark budget.

TS-02, TS-05, TS-07, TS-11 remain **UNRESOLVED**; `planRunA().may_start` and `checkRunAuthorization().authorized` remain `false`.
