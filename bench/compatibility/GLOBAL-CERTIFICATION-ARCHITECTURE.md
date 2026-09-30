# dkskill Global Certification Architecture (M13-UNIVERSAL)

**STATUS: GLOBAL CERTIFICATION MATRIX IMPLEMENTED / PRODUCTION CERTIFIED COUNT = 0 / NO PUBLICATION / NO INHERITANCE**

This layer defines the universal **global certification matrix** and its lifecycle. It is deterministic, read-only
over registries, and fail-closed. It certifies nothing and publishes nothing; M4/M5/M6 remain the certification/
publication authorities and M9 the L4 authority.

## Certification matrix
A universal matrix over **platform × architecture × channel × version**, with facets and capabilities summarized per
cell. Every individual combination has an explicit `cert_state` ∈ `CERTIFIED, NOT_CERTIFIED, NOT_VALIDATED, BLOCKED,
FAILED, REVOKED, SUPERSEDED`. **No missing combination is ever interpreted as certified** — absent cells default to
`NOT_CERTIFIED`. Registry record states: `PROBED, VALIDATED, CERTIFIED, PUBLISHED, REVOKED, SUPERSEDED, NOT_VALIDATED,
NOT_CERTIFIED`. Records are immutable and matrix integrity is hash-verified (`verifyMatrix`).

## No automatic inheritance
`inheritsCertification()` is always `false`. A certified `windows/x64/native/2.1.283` cell does **not** certify
`windows/arm64/native/2.1.283`, `macos/*`, `linux/*`, or `windows/x64/native/2.1.284`. One certified facet = one
independently evidenced identity (H-Q4/H-Q5).

## Version lifecycle
`NEW_RELEASE_SEEN → UNVERIFIED → PROBING → REGRESSION → BEHAVIORAL_DIFF → CERTIFICATION_REVIEW → CERTIFIED → PUBLISHED
→ FAILED → BLOCKED → REVOKED → SUPERSEDED`. A new Claude Code release starts `UNVERIFIED` and never inherits the
previous release's certification.

## Latest-3 policy (H-Q2)
`latest_3_certified_versions` lists up to three **actually-certified** versions (descending). Revoked/superseded/not-
certified versions are excluded; fewer than three certified → no filling with guesses; a released-but-uncertified
version stays `UNVERIFIED`; a revoked certified version becomes `REVOKED` and is never silently substituted.

## Signed authorization (H-Q6)
`requires_signed_authorization: true`. Certified cells are `signed` with an evidence reference; non-certified cells are
never signed. Registry mutation/publication remains governed by M6 (signed, owner-authorized).

## Certification infrastructure (design reference)
Independent certification environments per platform/version (see `CERTIFICATION-INFRASTRUCTURE.md`): isolated hosts,
reproducible identity, independent observers (M9 L4), enforced network isolation, controlled evidence capture, binary/
version identity, capability/facet/attribution probes, behavioral comparison, evidence hashing, tamper detection,
audit chains, per-environment credential isolation, lifecycle management. `PTPL-DK-BENCH-WIN-01` remains a
development/evidence environment only, never a control plane, and is not modified.

## Production immutability
The production matrix built from the production registry has **zero** certified cells. Synthetic matrices
(`SYNTHETIC_TEST_ONLY`) demonstrate multi-platform/version mechanics and never affect production, M8, M9, or
publication.

## Schemas
`dkskill.global_certification_matrix/1`, `dkskill.global_certification_record/1`.

## Statements
No host is certified merely because the universal architecture exists; no platform is certified without its own
evidence. No Claude execution, no publication, no registry mutation, no network contact.
