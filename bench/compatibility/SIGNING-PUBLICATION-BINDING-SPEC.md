# dkskill M6 Signing ↔ Publication Binding & Key-Management Lifecycle Specification (M21)

**STATUS: M21 COMPLETE (DESIGN ONLY) / NO SIGNING / NO KEY GENERATION / NO EXECUTION / NO REGISTRY MUTATION /
M17–M20 UNCHANGED / CURRENT HOST UNVERIFIED / M8 = EXECUTION_BLOCKED / CERTIFIED = 0 / GAP-01 & GAP-02 STILL OPEN**

M21 specifies — design level only — the authoritative chain from a `COMPLETE_UNSIGNED` attestation through M4/M5/M6
signing/governance to an immutable registry update bound to exactly one M13 matrix cell, plus the signing-key
lifecycle. It closes/refines only **GAP-03** (signing↔publication binding) and **GAP-04** (key-management lifecycle);
**GAP-01/GAP-02 remain OPEN**. It generates no keys, imports none, signs nothing, accesses no keychain/HSM/KMS/
credentials/`~/.claude`, contacts no network, and mutates no registry. It preserves existing M5/M6 terminology and
introduces **no new governance state** (`dkskill.signing_publication_binding_spec/1`).

## Core principle
A signature authenticates an **exact** governed publication payload; an authorization authorizes an **exact** proposal;
a proposal references an **exact** certification and attestation; a certification references an **exact** identity; a
registry update applies only to an **exact** M13 cell. Historical records are immutable; rotation/revocation never
rewrite history; **no valid signature may be transplanted** to another object, cell, registry, product, or environment.

## Authoritative object graph (M21-A, 9 objects)
`identity attestation → M4 certification result → M5 certification profile → M5 publication proposal → M6
authorization → M6 signature payload → M6 publication record → registry entry/version → M13 matrix cell`. Each object
has a canonical identifier, content hash, predecessor/successor, immutable fields, mutable lifecycle metadata, trust
boundary, authority, and publication-state reference.

## Signature payload (M21-B)
Binds: attestation_hash, certification_result_hash, publication_proposal_hash, exact M13 cell, registry identity +
version/update identity, publication record identity, signer identity, signing-key identity/version, authorization
identity/hash, canonical serialization version, schema versions, timestamp/freshness. Prevents signing-one/publishing-
another (attestation, cell, proposal), reuse across registry versions, reuse after supersession, cross-product/
environment replay. **Algorithm status: OPEN_DESIGN_DECISION** (not frozen). Canonical serialization: project canonical
JSON + `sha256:<hex>`.

## Bindings (M21-C/D/E, all fail-closed)
- **attestation↔certification:** exact `attestation_hash` reference; mismatch/superseded/revoked/tampered/replay →
  REJECTED; missing → BLOCKED; **"latest attestation" FORBIDDEN**.
- **certification↔proposal:** binds certification_result_hash + attestation_hash + exact profile + exact cell +
  proposed delta + expected precondition; different certification/attestation/cell/profile-hash → REJECTED; precondition
  differs/stale → BLOCKED; superseded/revoked → REJECTED.
- **proposal↔authorization:** `authorization_payload_hash` over the exact proposal; proposal-B-with-auth-A → REJECTED;
  wildcard / latest-proposal / implicit inheritance → FORBIDDEN; expired → BLOCKED; revoked/replay → REJECTED.

## Signer identity (M21-F)
Distinct roles: human owner/approver, signing authority, signing key, trust root, publication system — never conflated.
Who approves publication follows existing M6 governance; where M6 underspecifies, an OPEN GAP is preserved (no new
signer chosen).

## Key identity + lifecycle (M21-G/H)
Key metadata: key_id, signer identity, algorithm, public-key fingerprint, creation/activation/expiration time, status,
predecessor/successor key, trust-root reference (no private material). Lifecycle states: `PROPOSED → GENERATED →
REGISTERED → ACTIVE → {RETIRED|REVOKED|COMPROMISED}`, each with allowed predecessor/successor, authorization
requirement, publication impact, whether prior signatures remain valid, and whether new signatures are permitted.
`ACTIVE` may sign; `RETIRED` cannot sign new but prior signatures remain verifiable.

## Rotation / revocation / compromise (M21-I/J/K)
Rotation: new distinct key_id; trust root recognizes authorized successor; old signatures independently verifiable; old
key cannot sign after retirement; no historical rewrite; auditable (trust-root continuity → OPEN GAP if undefined).
Revocation: distinct from ARTIFACT/PROFILE/ATTESTATION/REGISTRY-ENTRY revocation; effective time + affected key_id +
affected signatures recorded; historical publication validity per effective time; future publication blocked; no
historical mutation. Compromise: stop new signing, identify affected signatures, earliest-trustworthy-boundary, revoke,
replace, assess/supersede as required, preserve audit; **production recovery policy → OPEN_DESIGN_GAP** (not invented).

## Signed publication record (M21-L)
Binds signature payload + signature + signer + key + authorization + attestation + certification + proposal + matrix
cell + registry precondition + resulting state + timestamp + schema versions. Integrity verification is **separate**
from signer authorization, key validity, publication authorization, and certification validity (never conflated).

## Registry atomicity (M21-M)
`proposal validated → authorization validated → signature validated → precondition validated → applied → resulting
hash recorded`. Any failure → **NO_REGISTRY_MUTATION**. Protections: concurrent proposals (compare-and-swap), stale
proposals (precondition hash), replayed signatures (bound identities), duplicate publication (publication_id), wrong
version/cell, partial application (all-or-nothing).

## Immutable history (M21-N)
old attestation→certification→proposal→publication→registry state remain auditable; supersession creates a NEW record;
revocation never rewrites history; key rotation never rewrites historical signatures; no in-place mutation of historical
certification evidence.

## Trust root (M21-O)
Authenticates authorized signer keys; keys become trusted via registration; rotation recognizes authorized successors;
revoked keys cease to be trusted; trust-root changes are governed. **Bootstrap → OPEN_DESIGN_GAP.**

## Verification layers (M21-P, 10, ordered)
1 canonical hash integrity, 2 signature cryptographic validity, 3 key validity, 4 signer authorization, 5 publication
authorization, 6 attestation validity, 7 certification validity, 8 matrix-cell validity, 9 registry precondition, 10
registry resulting-state consistency. **A lower layer's success never implies a higher layer**; each failure is
fail-closed.

## Replay protection (M21-Q, 9 vectors)
signature/publication/authorization/attestation/cross-registry/cross-product/cross-cell/cross-environment/superseded-
record replay — each bound to the identities/hashes that make transplant impossible.

## M13 matrix binding (M21-R)
Exactly `platform × architecture × channel × version` (+ runtime facet where applicable); no version/platform/arch/
channel inheritance, no "latest certified" substitution, no sibling-cell reuse. If the exact cell differs across
attestation/certification/proposal/signature payload/publication record/registry entry → **rejected**.

## M5 / M6 lifecycle (M21-S/T, preserved)
M5: `DRAFT, REVIEW_REQUIRED, APPROVED_FOR_PUBLICATION, PUBLISHED, REJECTED, REVOKED, SUPERSEDED` — signable/publishable
= APPROVED_FOR_PUBLICATION; supersedable = PUBLISHED. M6: `REQUESTED, VALIDATING, APPROVED, APPLYING, PUBLISHED,
REJECTED, FAILED, REVOKED, SUPERSEDED, ROLLED_BACK` — forbidden transitions defined (e.g., REQUESTED→PUBLISHED,
VALIDATING→APPLYING, REJECTED→PUBLISHED, PUBLISHED→APPLYING). No M5/M6 implementation modified.

## Security threat model (M21-U, 20 threats)
attestation/certification/proposal/authorization substitution, signature replay, wrong-cell publication, cross-registry/
product replay, stale authorization, revoked-key signing, compromised key, signer impersonation, trust-root
substitution, key-rotation confusion, publication rollback, concurrent stale proposal, registry precondition bypass,
historical-record mutation, signature payload ambiguity, canonicalization mismatch — each with binding/control,
detection, fail-closed state, and **history intact = true**.

## Privacy / secret boundary (M21-V)
Never includes private keys, credentials, OAuth tokens, cookies, API keys, user files, `~/.claude` contents, secrets, or
environment secrets. Design-time assertion: **NO_PRIVATE_KEY_MATERIAL_IN_PUBLIC_ARTIFACTS** (asserted, not implemented).

## Synthetic fixtures (M21-W, 20, SYNTHETIC_TEST_ONLY)
SX-01 valid complete binding (still unsigned); SX-02…SX-20 mismatches/replays/key states/rollback/canonicalization →
fail-closed. No fixture is signed with a real key or mutates the production registry.

## Future test specification (M21-X, 18)
attestation/certification/proposal/authorization binding, signature-payload determinism, key identity + lifecycle,
rotation, revocation, compromised-key, trust-root, replay, matrix-cell exactness, registry precondition, immutable
history, publication atomicity, secret exclusion, static no-execution/no-network/no-real-key guarantees.

## Gap status (M21-Y)
- **GAP-03 → REFINED** (signing↔publication binding contract specified).
- **GAP-04 → PARTIALLY_DEFINED** (key lifecycle specified). Newly recorded: GAP-03R (M6 payload field-contract
  completeness), GAP-04R-ALGO (algorithm selection), GAP-04R-ROOT (trust-root bootstrap), GAP-04R-STORE (key-storage
  provider), GAP-04R-RECOVERY (compromised-key recovery for existing data).
- **GAP-01 & GAP-02 remain OPEN_DESIGN_GAP** (unchanged).

## Statement
Design/specification only; no runtime signing/key-management; no frozen artifact modified; production registry immutable
(certified 0); no signing, no key generation, no execution, no authentication, no network, no registry mutation;
`/runtime/` absent; `~/.claude` untouched.
