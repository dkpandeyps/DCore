# dkskill Compatibility Certification Harness (M4)

**STATUS: M4 CERTIFICATION HARNESS IMPLEMENTED / NO CURRENT HOST CERTIFIED**

The harness (`bench/compatibility/certification.ts`, `certification-types.ts`) is the deterministic,
repository-side machinery that evaluates a certification candidate through explicit gates and produces immutable,
hash-chained evidence and a certification decision. It uses the **M3 HCL as the enforcement decision boundary
(never bypassed)**, consumes M0/M1/M2 without duplication, executes no Claude, resolves no TS-07/TS-11, mutates no
registry, and fabricates no owner approval. **Owner review is required before CERTIFIED.**

## Pipeline
```
HOST_IDENTITY -> PROFILE_RESOLUTION -> CAPABILITY_PROBES -> FACET_PROBES -> ATTRIBUTION_PROBES
  -> BEHAVIORAL_COMPARISON -> LIMITATION_CHECK -> CERTIFICATION_GATES -> CERTIFICATION_DECISION -> IMMUTABLE EVIDENCE
```
Every stage has an explicit status; there is no implicit success. `NOT_RUN`/`UNKNOWN` are never treated as `PASS`.

## Certification gates (all mandatory)
`CG-01` exact host identity · `CG-02` exact registry profile · `CG-03` environment identity (separate cert
environment + isolation evidence) · `CG-04` required capability coverage · `CG-05` critical capability
verification (state VERIFIED **and** probe PASS) · `CG-06` facet verification · `CG-07` attribution verification
· `CG-08` stream-schema verification · `CG-09` limitation acceptance · `CG-10` regression comparison · `CG-11`
evidence integrity (hash chain) · `CG-12` no-secret evidence · `CG-13` owner review · `CG-14` TS-07 · `CG-15`
TS-11. Each returns `PASS | FAIL | BLOCKED | NOT_RUN` with reasons.

## Decision
`CERTIFIED | NOT_CERTIFIED | BLOCKED | FAILED | REVOKED`. **CERTIFIED requires every mandatory gate PASS**
(including owner review). Any mandatory `BLOCKED`/`FAIL`/`NOT_RUN` prevents certification. Lifecycle states:
`NEW_RELEASE_SEEN, UNVERIFIED, PROBING, REGRESSION, BEHAVIORAL_DIFF, CERTIFICATION_REVIEW, CERTIFIED, PUBLISHED,
FAILED, BLOCKED, REVOKED`.

## Safety-critical rule (not weakened)
A candidate MUST NOT become CERTIFIED when a required safety-critical capability is `NOT_YET_VALIDATED`,
`PARTIALLY_VERIFIED` (where full verification is required), `NOT_AVAILABLE`, `DEGRADED_AT_RUNTIME`, or its probe is
`FAIL`/`UNKNOWN`/`NOT_RUN` (CG-05).

## Attribution
`ATTR_VALID_FOR = ['2.1.283']` is preserved. attr@1 may be PROBED but not real-host CERTIFIED until TS-07 is
resolved (CG-14). A9/unknown is invalid for attribution; no attr@2 is invented; no other version silently uses
attr@1.

## Regression & behavioral difference
`compareRegression(baseline, candidate)` → `NO_BEHAVIORAL_CHANGE | BEHAVIORAL_CHANGE | INCONCLUSIVE` (no semver
assumption). A behavioral change blocks certification (CG-10); a difference never mutates an existing facet — it
requires new evidence → review → a new profile/facet where justified.

## Evidence
Immutable `dkskill.certification_evidence/1` records, hash-chained
(`record_hash = SHA-256(canonical(record incl. previous_record_hash))`), tamper-evident, redacted (home paths →
`~`), and **never** containing credentials/tokens/API keys/secrets. No signatures are fabricated (owner/future).

## Environment separation (H-Q7)
Certification environments are distinct from the Phase 4 benchmark environment (`environment_type: certification`).
Missing environment/isolation evidence → CG-03 `BLOCKED`.

## No registry mutation
The harness never mutates the M1 registry. On CERTIFIED it emits a **proposed_update** artifact; registry
publication is a separate controlled operation.

## Multi-platform / multi-channel / binary identity
No platform/channel hardcoding; channel and binary SHA-256 are part of identity (via HCL). Missing macOS/Linux
evidence → NOT_VALIDATED/BLOCKED, never guessed. No arbitrary binary is executed.

## Current results
- **`cc-2.1.283-win32-x64-native@1` → `NOT_CERTIFIED`** (no live probes; TS-07/TS-11 unresolved; a safety-critical
  capability is PARTIALLY_VERIFIED; no owner approval). See `certification-sample-2.1.283.json`.
- **`synthetic-test-only@1` → `CERTIFIED`** — **SYNTHETIC_TEST_ONLY**, existing solely to prove the engine's
  mechanics; it is not a real Claude Code certification and does not alter the production registry. See
  `certification-sample-synthetic.json`.
- 2.1.284, macOS, Linux → NOT_VALIDATED / NOT_CERTIFIED.

## Boundaries
M4 does not certify a real host, does not resolve TS-07/TS-11, does not authorize Run A, does not enable
production dkskill enforcement, and creates no `/runtime/`. M5 (profile certification) and M6 (benchmark/product
separation) are not implemented.
