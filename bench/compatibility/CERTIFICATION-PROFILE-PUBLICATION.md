# dkskill Certification Profile & Evidence Publication Layer (M5)

**STATUS: M5 IMPLEMENTED / NO REAL HOST CERTIFIED / NOTHING PUBLISHED**

M5 (`bench/compatibility/profile.ts`, `profile-types.ts`) turns an M4 `CertificationResult` (+ its evidence chain)
into a deterministic, immutable, auditable **certification-profile candidate**, a **publication decision** (15
gates), and a **registry-update proposal** — **without mutating the production registry**. It consumes M0–M4
without duplicating their logic and never certifies a real host, publishes, or authorizes Run A.

## Purpose & pipeline
```
… M4 CERTIFICATION DECISION -> IMMUTABLE EVIDENCE -> M5 CERTIFICATION PROFILE -> PUBLICATION PROPOSAL
```
No production registry mutation is a side effect. A proposal is an artifact, never an applied change
(`applies_to_registry: false`).

## Schemas
- `dkskill.certification_profile/1` — the profile candidate (identity tuple, evidence refs, evidence-chain head,
  environment id, owner-review ref, issuer/signature, publication status, supersession/revocation, `synthetic_test_only`).
- `dkskill.compatibility_registry_update_proposal/1` — a proposed `ADD_PROFILE | UPDATE_STATUS | SUPERSEDE_PROFILE |
  REVOKE_PROFILE | NONE` operation; never applied.
- `dkskill.certification_publication/1` — the combined M5 artifact `{ profile, publication, proposal }`.

## Profile & publication lifecycle
Publication states: `DRAFT -> REVIEW_REQUIRED -> APPROVED_FOR_PUBLICATION -> PUBLISHED`, plus terminal
`REJECTED | REVOKED | SUPERSEDED`. A profile reaches `PUBLISHED` **only** when all 15 publication gates PASS.
There is **no automatic publication** merely because M4 returned CERTIFIED.

## Publication gates (each PASS | FAIL | BLOCKED | NOT_RUN; absence never implies PASS)
`PG-01` exact host identity · `PG-02` exact compat-profile ref · `PG-03` exact version · `PG-04` exact binary
identity · `PG-05` platform/architecture/channel · `PG-06` M4 state CERTIFIED · `PG-07` all mandatory M4 gates
passed · `PG-08` evidence-chain integrity · `PG-09` no required evidence missing · `PG-10` no unresolved
safety-critical limitation · `PG-11` owner approval · `PG-12` certification environment validity · `PG-13` **no
synthetic-test-only publication** · `PG-14` publication authorization (explicit + valid non-synthetic signature) ·
`PG-15` supersession/revocation consistency.

## Synthetic boundary (mandatory)
`synthetic_test_only === true` ⇒ `PG-13` FAIL ⇒ publication `REJECTED`, **even if every other gate passes**. A
synthetic profile can never be published, inserted into the production registry, or claimed as a real certification.
A synthetic signer is labeled `SYNTHETIC_TEST_ONLY` and can never be a production signer (`PG-14` requires a valid
non-synthetic issuer).

## Signing model
`UNSIGNED | SIGNED | SIGNATURE_INVALID | SIGNATURE_MISSING`. No signatures are fabricated and no private keys exist
in the repo. Production publication requires `SIGNED` with a valid, non-synthetic issuer.

## Evidence & immutability
Deterministic canonical serialization (consistent with M4). `artifact_hash = SHA-256(canonical(artifact without
artifact_hash))`; `previous_artifact_hash` supports chaining; tampering is detectable. No secrets are emitted.

## Registry proposal model
A CERTIFIED, publishable candidate yields an `ADD_PROFILE`/`SUPERSEDE_PROFILE` proposal; otherwise `UPDATE_STATUS`
or `REVOKE_PROFILE`. Registry publication remains a separate, explicit, owner-approved operation. The production
registry stays byte-identical.

## Supersession / revocation
Published profiles are historically immutable; a new release creates a NEW profile with `supersedes_*`, never a
mutation. A revoked profile (`PG-15`) is not publication-eligible; a superseded profile remains immutable.

## Latest-3 policy (H-Q2)
`activeCertifiedSet()` derives the supported set ONLY from profiles that are actually PUBLISHED + CERTIFIED,
non-revoked, non-superseded, non-synthetic — not "latest 3 installed", not automatic. **Currently the production
certified set is ZERO** (`productionCertifiedCount() === 0`); the smaller set is represented explicitly, never
padded to three.

## Multi-platform / channel
Every published profile requires exact platform + architecture + channel + version + binary identity. No platform,
channel, architecture, or version substitution or inference.

## Current results
- **`cc-2.1.283-win32-x64-native@1`** → M4 `NOT_CERTIFIED` → M5 publication **DRAFT / blocked** (PG-06/PG-07 FAIL,
  PG-09/PG-10 BLOCKED, PG-11/PG-14 NOT_RUN). See `profile-sample-2.1.283.json`.
- **`synthetic-test-only-profile@1`** → M4 `CERTIFIED` → M5 publication **REJECTED** (PG-13). Proves synthetic
  certification cannot escape into production. See `profile-sample-synthetic.json` (`SYNTHETIC_TEST_ONLY`).
- Production certified/published set: **ZERO**.

## Statements
**M5 does not certify any real host. M5 does not publish anything. M5 does not authorize Run A**, does not modify
the production compatibility registry, and creates no `/runtime/`. M6 (benchmark/product separation) is not
implemented.
