# Owner review — version-agnostic dkskill compatibility architecture (proposal)

> **Status: PROPOSAL FOR OWNER REVIEW (2026-09-29). NOTHING IN THIS DOCUMENT IS APPROVED OR IMPLEMENTED.**
> **Purpose:** record the read-only investigation findings of 2026-09-28/29 and the proposed compatibility
> architecture so the owner can review it. It changes no decision, approval, gate, budget, pin or validity state.
> **Frozen and unchanged by this document:** Phase 4 benchmark pin Claude Code **2.1.283**, SHA-256
> `9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A`, `ATTR_VALID_FOR = ['2.1.283']`, TS-07
> **UNRESOLVED**, Run A **blocked and unauthorized**, and the decision register (`bench/PHASE-4-DECISION-REGISTER.*`,
> `bench/src/phase4-register.ts`).
> **No proposed answer below is accepted. No owner question is answered on the owner's behalf.**
> **Sources:** `PLATFORM-ASSUMPTIONS.md` (V-01…V-22, U-01…U-20), `MASTER-SPEC.md` (MP-7, SP-8, §15.1),
> `platform-validation/HANDS-ON-VALIDATION-REPORT.md`, `bench/src/ts02.ts`, `bench/src/attribution.ts`,
> `bench/src/validity.ts`, `bench/src/runA.ts`, `bench/approval/PHASE-4-*`. This document quotes them and changes none of them.
> **Naming:** "dkskill" is the product name used by the owner; `MASTER-SPEC.md` calls the same product AEOS.

---

## 1. Executive decision context

- **Benchmark reproducibility requires an exact pinned CLI identity.** A benchmark result is only reproducible and
  comparable if the exact Claude Code executable is known. Phase 4 pins that identity as version + binary SHA-256, and
  refuses any other binary with no substitution (`bench/src/ts02.ts`, `verifyPinnedCli`).
- **dkskill product compatibility must not be permanently coupled to one CLI version.** Ordinary dkskill users run their
  own Claude Code, which updates often. On this machine 2.1.282, 2.1.283 and 2.1.284 were installed on 2026-09-25,
  2026-09-26 and 2026-09-28. The product needs a way to support more than one version, based on evidence.
- **These are separate concerns.** Neither may weaken the other. The product-compatibility work proposed here never
  changes, extends or relaxes the Phase 4 benchmark pin, and the benchmark pin never becomes the product's support policy.

## 2. Current approved benchmark identity

| Item | Value |
|---|---|
| Approved version | Claude Code **2.1.283** |
| Approved SHA-256 (owner-confirmed 2026-09-28) | `9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A` |
| Where it is pinned | `bench/src/ts02.ts` → `PINNED_CLI` (the only full-hash occurrence in the repository) |
| Currently on PATH | `C:\Users\Dharmendra Pandey\.local\bin\claude.exe`: **2.1.284**, SHA-256 `0416631E846F743110DA5282409776FA1313E65F33A588AAE066EAF8DB0FDA7D` (does **not** match the pin) |

**Result of the read-only local search (2026-09-29): FOUND_APPROVED_2_1_283.** Two local files match the approved
SHA-256 exactly:

| Path | Size (bytes) | Last write (local) |
|---|---|---|
| `C:\Users\Dharmendra Pandey\.local\share\claude\versions\2.1.283` | 244,960,928 | 2026-09-26 10:50:15 |
| `C:\Users\Dharmendra Pandey\.local\bin\claude.exe.old.1790618725109.29904` | 244,960,928 | 2026-09-26 10:50:14 |

The files were hashed by reading them only. They were **not copied, moved, executed or modified**, and nothing points
at them: PATH and the repository are unchanged.

**Risk for the owner to note:** both files belong to the Claude Code auto-updater's version store and backup-rename
scheme, so a future update or clean-up may remove them. Whether to preserve them is an owner decision (see H-Q5).

Other binaries were found and hashed; none match. For completeness:
- `versions\2.1.282`: `FC0E3AF0…CA4484`
- the Desktop-bundled `claude-code\2.1.281`: `39BE063C…A051067C`
- the Desktop-bundled `claude-code\2.1.280`: `6D3F8FF8…C7C3F50`
- two copies of the Agent SDK-bundled `claude.exe` 0.2.117: `1EA41BAA…EFEFA1`

## 3. Proposed compatibility architecture (three planes plus a separate Benchmark plane)

```
            dkskill core (policy, workflows, constitution)     ← version-agnostic, never branches on version
                              │  consumes only these interfaces
                              ▼
     ┌──────────── Host Compatibility Layer (HCL) ─────────────┐
     │ Identity probe → Capability model → Profile resolver     │
     │        │                 │                 │            │
     │        ▼                 ▼                 ▼            │
     │  facet adapters: hook-protocol@N · stream-schema@N ·     │
     │  attribution@N · settings-layout@N · permission-mode@N   │
     └──────────────────────────────────────────────────────────┘
                              │ reads, never writes
                              ▼
     Compatibility Registry (data, versioned, signed): profiles, matrix, certification records
                              ▲ written only by
     Certification plane (probe harness + regression + behavioral diff + owner sign-off)

     Benchmark plane (bench/): pins an exact profile + exact binary hash. It never uses runtime resolution.
```

**The planes:**
1. **dkskill core.** Never branches on the CLI version. It asks capability questions only, for example "can a
   PreToolUse hook deny with a reason the model sees?" (V-03).
2. **Host Compatibility Layer (HCL).** Establishes the host's identity, resolves a profile and runs the capability
   checks. Its adapters are organised **by facet, not by version**: a profile selects one version of each facet, so a new
   Claude Code release usually only adds a registry row. New adapter code is written only for a facet whose behaviour was
   shown to differ.
3. **Compatibility Registry / Certification plane.** The registry is versioned data holding profiles, the matrix and
   certification records. Only the certification process writes to it: probe harness, regression, behavioural diff and
   owner sign-off.
4. **Benchmark plane (separate).** `bench/` pins an exact identity and never uses runtime resolution.

Only the benchmark pins by binary hash. Runtime identifies the host by version, platform and distribution channel,
plus live self-checks.

## 4. Compatibility profile — `dkskill.compat_profile/1`

```jsonc
{
  "schema": "dkskill.compat_profile/1",
  "profile_id": "cc-2.1.283-win32-native@1",          // immutable once certified; changes → @2
  "host": {
    "product": "claude_code",
    "version_range": { "exact": ["2.1.283"] },          // exact list by default; ranges only after certification
    "platform": ["win32-x64"],
    "channel": ["native_installer"],                    // native_installer | npm | desktop_bundled | agent_sdk_bundled
    "binary_sha256": ["9DBE16…DE3A"]                     // OPTIONAL for runtime; REQUIRED for benchmark profiles
  },
  "facets": {                                           // each points at an immutable, content-hashed facet version
    "hook_protocol":    { "id": "hookproto@1",  "sha256": "…" },
    "stream_schema":    { "id": "stream@1",     "sha256": "…" },
    "attribution":      { "id": "attr@1",       "sha256": "…" },
    "settings_layout":  { "id": "settings@1",   "sha256": "…" },
    "permission_modes": { "id": "permmode@1",   "sha256": "…" }   // e.g. default-mode `auto` (V-13)
  },
  "capabilities": { "CAP-HOOK-PRE-DENY": "VERIFIED", "CAP-HOOK-TIMEOUT-FAILCLOSED": "NOT_AVAILABLE", "…": "…" },
  "limitations": ["V-21: PreToolUse timeout fails OPEN", "U-11: shell parsing not validated"],
  "evidence": [{ "kind": "hands_on_report", "ref": "platform-validation/HANDS-ON-VALIDATION-REPORT.md", "sha256": "…" }],
  "certification": { "status": "PROBED", "record": null },       // see §6 for statuses
  "supersedes": null
}
```

The profile above is an **illustration of the schema**. It is not a certified or registered profile.

**Rules:**
- A facet version is immutable and content-addressed.
- A profile names facets by id and hash, so any change is visible.
- A profile never inherits silently: "same as 2.1.283" has to be written out as the same facet ids and hashes,
  backed by evidence for the new version.

## 5. Capability model

**The version number is only a lookup key.** Behaviour is established by evidence, in four tiers:

| Tier | What it answers | How | When |
|---|---|---|---|
| T0 Identity | Which host is this? | Version, platform, channel. Hash only where a reproducible baseline is required. | Every start |
| T1 Certified profile lookup | Which facet versions and capabilities were proven for this identity? | Registry match on identity. No match means UNVERIFIED. | Every start |
| T2 Live self-checks (cheap, no model spend) | Are the critical capabilities working in this session? | The nonce heartbeat that PreToolUse must observe (V-20); SessionStart context received (V-18); hook config loaded; own hooks present (U-09). | Session start, and periodically |
| T3 Passive stream conformance | Is the host emitting formats we understand? | Every event and permission text is checked against the profile's `stream@N` and `attr@N`. An unknown type, field or message is an anomaly, never a guess. | Continuously |

**Capability states:**

| State | Meaning |
|---|---|
| `VERIFIED` | Demonstrated by recorded evidence for this identity |
| `PARTIALLY_VERIFIED` | Demonstrated only in part or under stated limits |
| `NOT_VERIFIED` | No sufficient evidence |
| `NOT_AVAILABLE` | Evidence shows the host does not provide it |
| `DEGRADED_AT_RUNTIME` | The certified profile says it works but the T2 check failed. A T2 failure always overrides a certified claim for that session. |

**Capabilities dkskill actually depends on**, taken from `PLATFORM-ASSUMPTIONS.md`. The statuses are as recorded
there for 2.1.283 on Windows 11; none carry over to any other version.

| Capability | Source | Criticality |
|---|---|---|
| PreToolUse / PostToolUse intercepts tool calls, including in subagents | V-01, V-12, U-20 | Critical |
| MCP tool matchers | V-02, U-01 | Critical |
| A hook can deny with a reason the model sees | V-03 | Critical |
| `allow` cannot override deny or ask | V-04 | Critical (dkskill never emits `allow`) |
| `updatedInput` (narrowing only) | V-05, U-07 | Optional |
| Subagent `tools` / `disallowedTools` | V-06, V-22 | High |
| Skill tool and invocation flags | V-07, V-08 | High |
| Hook environment ids (`session_id`, `transcript_path`, …) | V-09 | High |
| Settings precedence and managed settings | V-11, U-13 | High |
| Permission-mode ceiling; default `auto` | V-13 | High |
| Protected paths | V-14 | Medium |
| Multiple hooks: concurrency and deny precedence | V-16, U-16 | High |
| Stop hook blocking | V-17, U-12 | Medium |
| SessionStart injection, including after compaction | V-18, U-06 | High |
| Config reload | V-19 | Low |
| Hook-presence heartbeat | V-20, U-09 | Critical (it is the T2 base) |
| Hook-timeout semantics (known to fail **open**) | V-21 | Critical limitation |
| Stream-json event schema | TS-07 | Critical for benchmark and attribution |
| Denial / permission message texts (A1–A8) | attr@1, TS-07 | Critical for attribution |

## 6. Version / capability matrix — `dkskill.compat_matrix/1`

```jsonc
{
  "schema": "dkskill.compat_matrix/1",
  "generated_from": "registry@<sha256>",
  "rows": [{
    "version": "2.1.283",
    "platform": "win32-x64",
    "channel": "native_installer",
    "binary_sha256": "9DBE16…DE3A",
    "detected_capabilities": { "CAP-…": "VERIFIED | PARTIALLY_VERIFIED | NOT_VERIFIED | NOT_AVAILABLE" },
    "supported_status": "SUPPORTED | SUPPORTED_WITH_LIMITATIONS | UNVERIFIED | UNSUPPORTED | BLOCKED",
    "validation_status": "CERTIFIED | PROBED | NOT_VALIDATED | FAILED | REVOKED",
    "profile": "cc-2.1.283-win32-native@1 | null",
    "attribution_table": "attr@1 | null",
    "known_limitations": ["…"],
    "evidence_refs": ["…"],
    "certified_at": null, "certified_by": null
  }]
}
```

The matrix is generated from the registry. Nobody edits it by hand.

**What existing evidence supports today.** No row below is a certification. No version is certified.

| Version | Platform | Supported | Validation | Profile / attr | Basis |
|---|---|---|---|---|---|
| **2.1.283 (existing evidence)** | Windows 11 | at most `SUPPORTED_WITH_LIMITATIONS` for the Phase 2 V-items | `PROBED` (Phase 2 hands-on, 38 sessions); **attribution not certified**, because TS-07 is unresolved | would be `cc-2.1.283-win32-native@1` (not yet created); attr@1 pending TS-07 | `platform-validation/HANDS-ON-VALIDATION-REPORT.md`, `PLATFORM-ASSUMPTIONS.md` |
| **2.1.284 (unvalidated)** | Windows 11 | `UNVERIFIED` | `NOT_VALIDATED` | none | no evidence; the only repository mention is a VG-01 negative test (`bench/test/scoring.test.ts`) |
| **Other versions (currently unverified):** 2.1.280–2.1.282, Agent SDK 0.2.117 | Windows 11 | `UNVERIFIED` | `NOT_VALIDATED` | none | none |
| **Other platforms (currently unverified):** any version | macOS / Linux | `UNVERIFIED` | `NOT_VALIDATED` | none | evidence is Windows-only (HANDS-ON-VALIDATION-REPORT §905) |

## 7. Certification lifecycle

```
NEW_RELEASE_SEEN ─▶ UNVERIFIED ─▶ PROBING ─▶ REGRESSION ─▶ BEHAVIORAL_DIFF ─▶ CERTIFICATION_REVIEW ─▶ CERTIFIED ─▶ PUBLISHED
                        │            │           │                │                    │
                        └────────────┴───────────┴────── FAILED / BLOCKED ◀────────────┘          REVOKED ◀── (post-release defect)
```

1. **NEW_RELEASE_SEEN → UNVERIFIED.** An identity row is added as `UNVERIFIED`. Users on that version get the
   unverified behaviour in §8, which depends on H-Q1.
2. **PROBING.** This generalises the Phase 2 hands-on work and the TS-07 capture method:
   - It runs in an isolated `CLAUDE_CONFIG_DIR` on the certification plane.
   - It captures stream samples, at least one denial for each attribution rule, hook-protocol probes for every
     Critical and High capability, and FXH-marker checks.
   - It needs its own owner approval and budget, separate from any benchmark.
3. **REGRESSION.** The dkskill host-conformance suite (`MASTER-SPEC.md` §15.1) runs against the new identity.
4. **BEHAVIORAL_DIFF.** Each facet is compared with the latest certified profile, using captured samples and not
   source inspection (`bench/approval/PHASE-4-ENVIRONMENT-OWNER-HANDOFF.md`:37). There are three outcomes per facet:
   - **Identical:** reuse the facet id and hash.
   - **Different:** a new facet version is written, for example `attr@2`.
   - **Unclassifiable:** blocks certification.
5. **CERTIFICATION_REVIEW → CERTIFIED.** An owner-signed record lists the identity, facet choices, evidence hashes,
   limitations and decision. Certification is never inferred from a passing run or from semver distance.
6. **PUBLISHED.** A registry update is published. A code release is needed only when a new facet version was required.
7. **FAILED / BLOCKED** can happen at any stage before certification.
8. **REVOKED.** A defect found after publication flips the row to `REVOKED`, and runtime then treats it as unsupported (§8).

## 8. Failure semantics — the no-false-success principle

| Situation | Behaviour |
|---|---|
| `BLOCKED` / `UNSUPPORTED` / `REVOKED` version | Do not claim enforcement. Refuse to enforce and say so plainly, e.g. "Claude Code X.Y.Z is not supported by dkskill vN: <reason>. Supported: <list>. Run `dkskill doctor`." |
| `UNVERIFIED` version | **Unresolved product/safety decision: H-Q1.** This document does not choose. |
| T2 self-check fails (e.g. heartbeat not seen) | Treat that capability as `DEGRADED_AT_RUNTIME` and fail closed for anything that depends on it. The status message names the missing capability. |
| Unknown stream event, field or permission text (T3) | Record an **anomaly**. **Attribution never guesses:** the result is `A9/unknown` with `table_valid:false`, never the closest-looking rule. In the benchmark, the attempt is invalidated (VG gate) rather than scored. |
| **Identity mismatch in the benchmark** | **Fail closed**: hard refuse with no substitution. Report pinned and observed identities separately (as `verifyPinnedCli` in `bench/src/ts02.ts` now does). |
| Registry missing or signature invalid | Treat every version as `UNVERIFIED`. Don't fall back to built-in guesses. |
| Hook timeout | V-21 is fail-open on 2.1.283. This is a documented host limitation, not something the design can fix, so critical hooks need latency budgets (U-10). |

**No false success:**
- A run on an uncertified host can never produce a result labelled certified.
- Aggregated reports show the host identity next to every result.
- Enforcement is reported per layer as active, unavailable or not verified (`MASTER-SPEC.md` SP-8), never assumed.

## 9. Benchmark / product separation

- **Benchmark profiles are immutable reproducibility anchors.** They pin an exact binary SHA-256 and exact facet
  versions. They are never edited, extended or widened. Phase 4's anchor is 2.1.283 / `9DBE16…DE3A` / attr@1.
- **Compatibility profiles are product support records.** They describe which hosts dkskill supports and with what
  limitations. They can be added, superseded or revoked through the §7 lifecycle, without touching any benchmark
  profile.
- **Results from different CLI identities are never silently combined.** Every benchmark record carries the full host
  identity: version, binary hash, channel, platform, profile id, attribution table id and hash, stream schema id.
  Comparison and aggregation must refuse to merge records whose identities differ, as an extension of VG-01
  (`bench/src/validity.ts`). Compatibility test runs are labelled `compat`, never `baseline`.

## 10. Migration plan (FUTURE WORK — nothing here is approved or started)

Phase 4 stays frozen throughout: 2.1.283, `9DBE16…DE3A`, attr@1, `ATTR_VALID_FOR = ['2.1.283']`, TS-07 unresolved,
Run A blocked. **Each step is future work and requires its own owner approval before it starts.**

| Step | Future work | Owner approval |
|---|---|---|
| **M0** | Documentation only: turn the §5 capability table into a capability catalogue with stable ids mapped to V/U ids. Nothing in `bench/` changes. | Required: approval of the catalogue |
| **M1** | Shadow registry with exactly one benchmark profile, `bench-p4-baseline`, mirroring today's constants (version, hash, attr@1, stream schema). It is read-only and not consumed by `bench/`, so it adds no behaviour change. It is built outside the Phase 4 modules. | Required |
| **M2** | Equivalence proof: the registry copy of attr@1 is byte-identical to `bench/src/attribution.ts` (same content hash). The frozen constants remain authoritative for Phase 4. | Required |
| **M3** | Runtime HCL for dkskill users (identity, profile lookup, T2/T3 checks) as a separate module. `bench/` keeps its own `verifyPinnedCli` and never uses runtime resolution. It must not be started before the owner decides its location. | Required, including where it lives |
| **M4** | Certification harness generalising the TS-07 capture method. Its first use is TS-07 itself on 2.1.283 under the existing TS-07 approval requirements. Any second version needs separate approvals. | Required (real sessions, spend) |
| **M5** | Second profile: certify a second version if the owner chooses. If behaviour differs, the first `attr@2` gets its own file, and attr@1 is never edited. | Required |
| **M6** | Every benchmark record carries the full host identity, and comparison tooling refuses to merge records with different identities. | Required |

The design's recommendation on attr@1: a certified version always gets a new profile and is never appended to
`ATTR_VALID_FOR`, so Phase 4 artefacts never change meaning after the fact. Whether attr@1 may ever cover another
version is owner question H-Q4, and this document does not decide it.

## 11. Owner questions (unanswered — the owner decides)

- **H-Q1:** Default runtime policy for UNVERIFIED versions: refuse, or run in degraded mode with T2 checks? The design recommends degraded mode with a loud status, but it is a product and safety decision.
- **H-Q2:** Support window: only the latest certified versions, or the latest N releases? Who owns certification?
- **H-Q3:** Which channels and platforms are in scope (native, npm, Desktop-bundled, SDK-bundled; macOS, Linux)?
- **H-Q4:** May an attribution table ever extend `valid_for`, or must each certified version get a new table or profile id?
- **H-Q5:** How are the approved 2.1.283 binary and future benchmark binaries preserved, given licensing and storage?
- **H-Q6:** Is registry signing required, and by whom?
- **H-Q7:** Should certification runs share the Phase 4 isolated environment (PTPL-DK-BENCH-WIN-01) or use a separate one?

**H-Q1 remains an unresolved product/safety decision.** The recommendation stated in it is the design's suggestion
only; it is not adopted and not recorded as a decision.

## 12. Current status (2026-09-29)

- **No compatibility runtime has been implemented.** No HCL, registry, profile file or `/runtime/` directory exists.
- **No new version has been certified.** No version of Claude Code is certified by the §7 lifecycle, including 2.1.283.
- **2.1.284 is unvalidated.**
- **2.1.283 remains the frozen Phase 4 benchmark identity:** SHA-256
  `9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A`, `ATTR_VALID_FOR = ['2.1.283']`.
- **TS-07 has not yet been executed**, so it remains UNRESOLVED.
- **Run A remains blocked** (`planRunA().may_start === false`, `checkRunAuthorization().authorized === false`) and unauthorized.
- The only code change made during this investigation is the diagnostic-only fix to `verifyPinnedCli()` in
  `bench/src/ts02.ts`, with tests in `bench/test/ts02.test.ts`. It changed what a mismatch reports, not what is allowed,
  and it is not a validation of any version.
