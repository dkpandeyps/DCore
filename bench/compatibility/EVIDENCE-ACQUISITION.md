# dkskill Certification Evidence Acquisition & Real-Host Validation Orchestration (M7)

**STATUS: M7 IMPLEMENTED / NO REAL HOST CERTIFIED / NOTHING PUBLISHED / TS-07 UNRESOLVED / TS-11 UNRESOLVED**

M7 (`bench/compatibility/evidence.ts`, `evidence-types.ts`) is an **orchestration and evidence-control** layer.
It **produces** evidence for M4 to consume. It is deterministic and **fail-closed**, and it never certifies a host,
publishes a profile, mutates the production registry, authorizes or executes Run A, spends benchmark budget,
executes Claude, authenticates, or resolves TS-07/TS-11.

## Purpose & boundary
```
EVIDENCE_REQUEST -> ENVIRONMENT_BINDING -> SESSION_PRECHECK -> EVIDENCE_ACQUISITION -> RAW_EVIDENCE_CAPTURE
  -> NORMALIZATION -> PROVENANCE_VALIDATION -> EVIDENCE_ASSERTION -> COMPLETENESS_CHECK -> M4-CONSUMABLE PACKAGE
```
The boundary is strict: **M7 produces evidence; M4 decides certification; M5 governs the publication profile;
M6 governs authorized registry publication.** M7 never performs `EVIDENCE -> CERTIFICATION`.

## Evidence lifecycle (states)
Evidence: `REQUESTED, AUTHORIZED, PRECHECKING, ACQUIRING, CAPTURED, NORMALIZING, VALIDATING, VALID, INVALID,
INCOMPLETE, BLOCKED, EXPIRED, REVOKED`. Session: `REQUESTED -> AUTHORIZED -> PRECHECKING -> READY -> ACQUIRING
-> CAPTURED -> VALIDATING -> COMPLETE`, plus failure states `BLOCKED, FAILED, INVALID, INCOMPLETE, EXPIRED,
REVOKED`. A session reaches `READY` only when every precheck passes and M3 resolves EXACT_MATCH; `COMPLETE` only
when every required evidence item is explicitly evaluated. Assertions: `ASSERTED, SUPPORTED, UNSUPPORTED,
CONTRADICTED, UNKNOWN`.

## Evidence classes (defined != verified)
`EV-HOST-IDENTITY, EV-BINARY-IDENTITY, EV-VERSION, EV-PLATFORM, EV-ARCHITECTURE, EV-CHANNEL, EV-HOOK-PROTOCOL,
EV-STREAM-SCHEMA, EV-ATTRIBUTION, EV-SETTINGS, EV-PERMISSION-MODES, EV-CAPABILITY, EV-BEHAVIORAL-COMPARISON,
EV-TS07, EV-TS11, EV-ENVIRONMENT, EV-AUTHORIZATION, EV-NETWORK, EV-TOOLCHAIN` (19). A class being *defined* never
implies it is *verified*: an unacquired class asserts `UNKNOWN`.

## Evidence request (exact, scoped)
A request binds the exact host identity tuple, profile id, version, binary SHA-256, platform, architecture,
channel, required evidence classes, required test ids, environment id, authorization reference, timestamp, and
optional expiry. `request_hash = SHA-256(canonical(request))`; **any identity change invalidates the request**.
There is no wildcard production evidence request.

## Environment binding
An `EvidenceEnvironment` records `environment_id`, type, OS, platform, architecture, Claude Code version, binary
SHA-256, config-directory *identity* (never contents), isolation evidence, credential-state *description*, a
redacted credential *reference* only, network-isolation status, toolchain identity, `created_at`/`verified_at`.
**No credentials, secrets, OAuth tokens, or API keys are stored, and real `~/.claude` is never copied in.**

## Session prechecks (SP-01…SP-15, fail-closed)
Exact binary; exact binary SHA-256; exact version; exact platform; exact architecture; exact channel; exact
environment identity; isolation evidence; credential-state safety; network-state evidence; toolchain identity;
requested evidence scope; authorization scope; **no Run A authorization**; **no production publication
authorization**. Each is `PASS | FAIL | BLOCKED | NOT_RUN`; **no implicit PASS**; any failed safety precheck
blocks acquisition.

## TS-07 evidence path (currently UNRESOLVED)
Models live stream-schema + attribution@1 acquisition: exact binary/version/host, actual stream observations,
normalized events, attribution observations + parser result, raw + normalized hashes, event ordering,
unknown/malformed handling, permission attribution, provenance, environment identity. **No observations are
fabricated.** With no live observations, TS-07 stays `UNRESOLVED`/`INCOMPLETE`. Synthetic fixtures exist only as
`SYNTHETIC_TEST_ONLY` and can never become real evidence.

## TS-11 evidence path (currently UNRESOLVED)
Binds NM identifier, exact host/profile/version, capability dependency, evidence source, expected vs observed
behavior, calibration result, limitation result, provenance, evidence hashes. Results: `VERIFIED, NOT_VERIFIED,
INCOMPLETE, BLOCKED, NOT_APPLICABLE`. `NOT_VERIFIED` never becomes `VERIFIED` without real evidence.

## Raw evidence (immutable, secret-safe)
Each artifact carries `evidence_id`, class, type, capture timestamp, `content_hash` (SHA-256 over stored,
post-redaction content), byte length, source, environment id, host identity, binary identity, provenance,
redaction status, and stored content. If secrets are present, capture **fails closed** unless redaction is
permitted, and redaction is recorded (the fact, never the secret); a secret that survives redaction fails closed.

## Normalized evidence (deterministic)
Normalization preserves semantic event order, unknown events, malformed-event markers, attribution results, and
permission results; it never guesses missing fields, never converts UNKNOWN to PASS, and never converts malformed
to valid. It keeps a reference to the raw artifact and computes its own `normalized_hash`; both raw and normalized
hashes are retained.

## Provenance
Every artifact answers who/what/when/where/from-which-binary/from-which-environment/under-which-authorization/
from-which-raw-artifact/how-normalized/what-hashes, machine-readably. No unverifiable "observed" claims.

## Completeness
`evaluateCompleteness` returns `COMPLETE | INCOMPLETE | BLOCKED | INVALID`, names every missing class, and
surfaces `ts07_status` and `ts11_status`. With no real stream capture, TS-07 = `INCOMPLETE`/`UNRESOLVED`; with no
valid calibration evidence, TS-11 = `INCOMPLETE`/`UNRESOLVED`.

## Evidence package (immutable, tamper-detectable)
`buildEvidencePackage` yields `package_id`, target identity, environment id, evidence items, assertions,
completeness, TS-07/TS-11 status, validity, `previous_package_hash`, and `package_hash =
SHA-256(canonical(package without package_hash))`. `verifyEvidencePackage` detects changed evidence, changed
provenance, changed hashes, missing artifacts, changed environment identity, changed binary identity, and a broken
history chain. **No package claims certification.**

## Expiration / revocation
`withValidity` creates a NEW `EXPIRED`/`REVOKED` package chained to the prior one; historical evidence is never
mutated. Expired/revoked evidence cannot satisfy M4 certification gates (the adapter exposes none of it).

## M4 integration
`evidencePackageToCertificationInputs` exposes ONLY validated, non-expired, non-revoked evidence; preserves
UNKNOWN/BLOCKED/INCOMPLETE; preserves provenance, exact identity, and evidence hashes; never synthesizes missing
certification evidence; and never alters M4 gate logic. **M4 remains the certification authority** — the M4 gates
are not duplicated here.

## M3 integration
M7 consumes M3 identity/profile resolution. If M3 resolves `NO_MATCH`, `AMBIGUOUS_MATCH`, `REVOKED_PROFILE`,
`INVALID_PROFILE`, or `UNIDENTIFIED`, acquisition is blocked; no evidence-scope exception is invented.

## Authorization boundary
Evidence-acquisition authorization is a **disjoint scope** (`EVIDENCE_ACQUISITION`) from benchmark / Run A /
publication / registry-mutation authorization. `authorizes_run_a` and `authorizes_publication` are structurally
`false`. Run A and publication authorizations are never reused or inferred from M5/M6 state; out-of-scope requests
are rejected.

## Dry-run / execution-disabled default
`planEvidenceSession` always emits `execution_mode: EXECUTION_DISABLED`, `execution_enabled: false`.
`executeEvidenceSession` **never executes**: default `EXECUTION_DISABLED`; even `LIVE` with a supplied owner
evidence-session authorization is downgraded to `DRY_RUN` and performs nothing (`executed:false`,
`claude_invoked:false`, `authenticated:false`, `benchmark_invoked:false`). No such authorization exists in
repository state.

## Benchmark separation
M7 invokes no benchmark suite: no k=30 runs, no budgeted execution, no calibration, no model comparison, no Run A,
no performance benchmarking. Evidence acquisition is entirely separate from benchmark execution.

## Secret handling
Secrets are never persisted. Capture fails closed on detected secrets unless redaction is permitted, redaction is
recorded, and a surviving secret fails closed. Credential material is represented only as a redacted reference.

## Future real-session stop conditions (all fail-closed)
`binary hash mismatch, version/platform/architecture/channel mismatch, environment mismatch, credential
ambiguity, missing isolation evidence, network isolation unresolved, authorization mismatch, evidence scope
mismatch, unexpected event schema, malformed stream, secret detected, unexpected process, unexpected file
mutation, unexpected network behavior, evidence integrity failure.` Every stop fails closed.

## Synthetic fixture boundary
All synthetic fixtures are `SYNTHETIC_TEST_ONLY`. They prove engine mechanics only and can never become real
evidence: `synthetic_test_only` is carried through the package and the M4 adapter, and M5 (`PG-13`) and M6
(`GG-18`) reject synthetic artifacts downstream.

## Current results
- **`cc-2.1.283-win32-x64-native@1`** → identity/environment evidence VALID, but no live observations captured →
  package `INCOMPLETE`, **TS-07 = UNRESOLVED**, **TS-11 = UNRESOLVED**; fed to M4 → **NOT CERTIFIED**.
- **Synthetic TS-07 package** → `COMPLETE` / TS-07 `VALID` (mechanics only, `SYNTHETIC_TEST_ONLY`).
- **Synthetic TS-11 package** → TS-11 `VERIFIED` (mechanics only, `SYNTHETIC_TEST_ONLY`).
- Tampered package → integrity failure detected; revoked package → no usable evidence.

## Statements
**M7 does not certify any host. M7 does not publish any profile. M7 does not authorize Run A.** It executes no
Claude Code, authenticates nothing, spends nothing, mutates no production registry, and creates no `/runtime/`.
