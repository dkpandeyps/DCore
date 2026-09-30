# dkskill Attribution Equivalence (M2)

**STATUS: M2 EQUIVALENCE ANALYSIS COMPLETE / RUNTIME NOT IMPLEMENTED**

## 1. Scope

Static, repository-only equivalence between the existing `attr@1` implementation and the registered
`attribution@1` / `stream_schema@1` facets for the pinned benchmark host `cc-2.1.283-win32-x64-native@1`. No Claude execution.

## 2. Sources inspected

- `bench/src/attribution.ts` (attr@1: A1–A8, A9 sentinel, `attribute()`, `ATTR_VALID_FOR`, `FXH_MARKERS`)
- `bench/src/parser.ts` (stream-json parsing)
- `test/driver-parser.test.ts` (attr@1 rule/layer assertions); `test/helpers.ts` `TEXT.*` (Phase 2 observed texts)
- `bench/compatibility/compatibility-registry.json` (M1); `bench/compatibility/capability-catalogue.json` (M0)
- Phase 2/3 validation evidence; TS-07 material (`benchmark-design/PHASE-3-EXIT-CRITERIA.md`)

## 3. attr@1 definition

Table `attr@1`, valid for `["2.1.283"]`. Patterns: A1, A2, A3, A4, A5, A6, A7, A8 plus the A9/unknown sentinel. **attr@1 is preserved unchanged; no attr@2 is created.**

## 4. stream_schema@1 definition

Registered facet `stream_schema@1` (M1, PROBED): the stream-json event/permission text forms parsed for the 2.1.283 corpus. Unknown types/fields are anomalies, never guessed.

## 5. A1–A8 equivalence matrix

| Pattern | Condition | Expected (rule/layer) | attribute() (rule/layer) | Evidence | Equivalence | Real-host |
|---|---|---|---|---|---|---|
| A1 | PreToolUse hook error (a hook denied the call) | A1/hook:unattributed | A1/hook:unattributed | TEXT.A1 | EQUIVALENT | NOT_VALIDATED |
| A2 | Native permission rule denied a PowerShell command | A2/native_rule | A2/native_rule | TEXT.A2 | EQUIVALENT | NOT_VALIDATED |
| A3 | Native path check: write/access outside allowed dirs | A3/native_path | A3/native_path | TEXT.A3 | EQUIVALENT | NOT_VALIDATED |
| A3w | Native path check (output-redirection variant) | A3/native_path | A3/native_path | TEXT.A3w | EQUIVALENT | NOT_VALIDATED |
| A4 | Native protected-file block (sensitive file) | A4/native_protected | A4/native_protected | TEXT.A4 | EQUIVALENT | NOT_VALIDATED |
| A5 | Native shell analysis (nested/expandable/multi-op) | A5/native_shell_analysis | A5/native_shell_analysis | TEXT.A5 | EQUIVALENT | NOT_VALIDATED |
| A6 | Directory denied by permission settings | A6/native_rule | A6/native_rule | TEXT.A6 | EQUIVALENT | NOT_VALIDATED |
| A7 | Validation: file not read yet | A7/validation | A7/validation | TEXT.A7 | EQUIVALENT | NOT_VALIDATED |
| A8 | Ask unanswered (permission requested, not granted) | A8/ask_unanswered | A8/ask_unanswered | TEXT.A8 | EQUIVALENT | NOT_VALIDATED |

Equivalence counts (evidence-level): EQUIVALENT=9. Real-host state for all: NOT_VALIDATED (TS-07).

## 6. FXH marker comparison

Foreign markers: FXH-STOP-G, FXH-STOP-P, FXH-OBS, FXH-FAIL, FXH-SLOW, FXH-DENY, FXH-ALLOW, FXH-REWR-A, FXH-REWR-B, FXH-V1, FXH-V2. Each attributes a hook-error to `hook:foreign:<marker>` — all EQUIVALENT. SUT marker → `hook:sut:SUTMARK`; unmarked hook error → `hook:unattributed`. Real-host: NOT_VALIDATED.

## 7. Parser behavior

Permission/error text from stream-json events is passed to `attribute()`. The parser does not synthesize events; unknown types/fields are anomalies.

## 8. Unknown-input behavior

- Unknown event (`TEXT.FAIL`) → rule A9 (prevention false); **does not guess**.
- Unknown permission text → rule A9; **does not guess**.
- Unknown host version (2.2.0) → rule A9, table_valid=false; dependent claim unverified.
- Malformed/empty → rule A9; no success claimed.
- A9 is the pre-existing **unknown sentinel**, not a guessed classification; **no new A9 pattern is invented**.

## 9. Evidence limitations

- Static/evidence-level only: attr@1 is compared against Phase 2 OBSERVED texts, not a live 2.1.283 capture.
- TS-07 UNRESOLVED: real-host stream/attribution behavior for the pinned CLI is not captured; real-host equivalence is NOT_VALIDATED.
- attribution@1 / stream_schema@1 facets are PROBED (M1), not CERTIFIED.
- attr@1 is valid only for 2.1.283 (ATTR_VALID_FOR); any other version => A9/unknown until re-derived.

## 10. Real-host validation status

**NOT_VALIDATED.** No live 2.1.283 stream/permission capture exists (TS-07 UNRESOLVED). Static match against Phase 2 observed texts is not real-host proof.

## 11. Conclusion (limited to what evidence supports)

- **Structural equivalence:** EQUIVALENT.
- **Evidence-level equivalence:** EQUIVALENT (attr@1 classifies every Phase 2 observed sample as expected).
- **Real-host behavioral equivalence:** NOT_VALIDATED.
- **Overall:** EVIDENCE_LEVEL_EQUIVALENT__REAL_HOST_NOT_VALIDATED.
- **Certification impact:** NONE. M2 establishes implementation-level and evidence-level equivalence only. Real-host behavioral equivalence requires TS-07 (UNRESOLVED). No certification is claimed; attr@1 remains unchanged; no attr@2 is created.

## 12. Impact on M3

M3 MAY use attr@1 as the registered attribution@1 facet with PROBED status and the stated limitations; it must NOT treat it as certified or as real-host-validated until TS-07 is resolved.

## 13. TS-07

TS-07 remains **UNRESOLVED**: real-host equivalence evidence is absent. M2 does not resolve it and does not attempt to.

