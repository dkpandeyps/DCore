# dkskill Signed Registry Publication & Governance Layer (M6)

**STATUS: M6 IMPLEMENTED / NO REAL HOST CERTIFIED / NOTHING PUBLISHED TO PRODUCTION**

M6 (`bench/compatibility/registry-governance.ts`, `registry-governance-types.ts`) governs whether an already-created
M5 publication proposal MAY be applied to a compatibility registry. It is deterministic and **fail-closed**: it
never certifies, probes, executes Claude, infers compatibility, creates evidence, fabricates signatures, or mutates
the **production** registry (mutations act on an in-memory registry STATE object only).

## Purpose & architecture
```
M4 CERTIFICATION -> M5 PROFILE -> M5 PUBLICATION PROPOSAL -> M6 GOVERNANCE VALIDATION -> SIGNATURE VALIDATION
  -> PUBLICATION AUTHORIZATION -> ATOMIC REGISTRY UPDATE (in-memory) -> IMMUTABLE PUBLICATION RECORD
```

## Governance state machine
`REQUESTED -> VALIDATING -> APPROVED -> APPLYING -> PUBLISHED`, plus `REJECTED | FAILED | REVOKED | SUPERSEDED |
ROLLED_BACK`. Signature states: `UNSIGNED | SIGNED | SIGNATURE_INVALID | SIGNATURE_MISSING | SIGNER_UNAUTHORIZED`.

## Governance gates (GG-01…GG-25)
Valid proposal schema; exact source profile; M5 state valid; M4 CERTIFIED; all M5 gates PASS; exact identity;
version; platform; architecture; channel; binary SHA-256; evidence-chain integrity; owner approval; publication
authorization bound; authorized signer; signature present; signature valid; **non-synthetic profile (GG-18)**;
registry precondition matches; no conflicting active profile; supersession/revocation consistency; immutable-history
consistency; no forbidden mutation; atomic-update preconditions; rollback safety. Each returns `PASS | FAIL | BLOCKED
| NOT_RUN`; **absence of failure is never PASS**. Publication happens **only when all 25 gates PASS**.

## Authorization model
Explicit `PublicationAuthorization` bound to the exact proposal via `authorization_payload_hash` (over proposal id,
profile id, version, platform, architecture, channel, binary SHA-256, operation). Changing any bound field
invalidates the authorization. Authorization is never inferred from certification, M5 state, history, fixtures, or
file/repo access.

## Signing model
A deterministic (non-cryptographic) signer stand-in; **no real private keys**. Distinguishes `AUTHORIZED_SIGNER`
from `UNAUTHORIZED_SIGNER` and `SYNTHETIC_TEST_SIGNER`. A synthetic signer is rejected for production
(`SIGNER_UNAUTHORIZED`). Missing signature → `SIGNATURE_MISSING`, fail-closed.

## Registry preconditions & atomic update
Compare-and-swap: the request carries the expected registry hash/schema/version and target state; a changed
registry → `STALE_REGISTRY_HASH_MISMATCH` → BLOCKED (no auto-merge, no overwrite, no repair). `applyRegistryMutation`
validates the whole mutation, builds the complete next state, verifies, and returns it; on any failure nothing is
applied (no partial state). Registry identity = `SHA-256(canonical registry)` (no fs metadata/timestamps).

## Immutable history
Each success emits a hash-chained `dkskill.registry_publication_record/1`
(`record_hash = SHA-256(canonical(record without record_hash))`, plus `previous_record_hash`).
`verifyPublicationHistory` fails closed on a broken chain, duplicate id, modified/reordered record, or invalid hash.

## Supersession / revocation / rollback
Supersession creates a NEW profile + immutable supersession record (old profile preserved, both binaries kept).
Revocation creates an explicit revocation record; a revoked profile never becomes active via ordinary publication.
Rollback creates an explicit immutable **reversal** record and never erases history.

## Conflict handling (all rejected; no auto-resolution)
duplicate profile id; same version/platform/arch/channel with a different binary; stale registry; targeting a
revoked/superseded profile; cross-platform/version/channel replacement; unsigned; unauthorized/synthetic signer;
synthetic profile; missing owner authorization.

## Synthetic boundary
`synthetic_test_only === true` ⇒ GG-18 FAIL ⇒ REJECTED. The M4→M5→M6 synthetic path is proven: CERTIFIED →
publication REJECTED → governance REJECTED. The mechanics fixture uses a clearly-labelled DEMO host
(`claude-code-MECHANICS-DEMO`) on an in-memory DEMO registry, isolated from production.

## Current results
- **`cc-2.1.283-win32-x64-native@1`** → NOT_CERTIFIED → M5 blocked → **M6 REJECTED**; production registry unchanged.
- **synthetic profile** → M4 CERTIFIED → M5 REJECTED → **M6 REJECTED** (GG-18).
- **DEMO mechanics fixture** → all 25 gates PASS → PUBLISHED into the **DEMO** in-memory registry only (proves the
  atomic-mutation + publication-record mechanics without touching production).
- Production certified/published count: **ZERO**.

## Statements
**M6 does not certify hosts, does not execute Claude Code, and does not authorize Run A.** It performs no production
publication, mutates no production registry, and creates no `/runtime/`.
