# dkskill Certification-Side Identity Attestation Design (M19)

**STATUS: M19 COMPLETE (DESIGN ONLY) / NO CERTIFICATION / NO SIGNING / NO EXECUTION / M17 & M18 UNCHANGED /
CURRENT HOST UNVERIFIED / M8 = EXECUTION_BLOCKED / CERTIFIED = 0**

M19 designs — but does not implement — a certification-side mechanism to bind exact identity (product, version, OS,
OS version, architecture, channel, runtime facet, binary SHA-256) as authoritative evidence in the PTPL certification
pipeline, so a future published profile carries authoritative identity **without** the public product discovering
Claude version/channel on a user's machine. It is deterministic and repository-local; it certifies nothing, signs
nothing, executes no Claude, authenticates nothing, contacts no network, and mutates nothing
(M4/M5/M6/M7/M8/M9/M13/M17/M18/registry all unchanged). It never emits `CERTIFIED`/`SIGNED`/`PUBLISHED`.

## Design objective
Authoritative identity belongs at the **certification boundary**, not through unsafe client-side guessing. The public
product may observe safe identity, receive explicit identity, remain UNKNOWN, resolve compatibility, or remain
UNVERIFIED — unchanged. The certification pipeline (future, separately authorized) is where exact identity is bound to
independent evidence and, only after authorized signing, published.

## Identity-attestation schema
`dkskill.certification_identity_attestation/1`: attestation_id, product, claude_version, operating_system, os_version,
architecture, channel, runtime_facet, binary_sha256, observation_sources, observation_timestamps, evidence_references,
provenance (per field), environment_id, profile_id, installation_ref, ambiguous_installations, evidence_hashes,
attestation_status, signer_identity (null in M19), signature_status, signing_required, created_at, expires_at,
revocation_reference, supersession_reference, previous_attestation_hash, matrix_combo, contradictions, reasons,
attestation_hash. Statuses: `INCOMPLETE, COMPLETE_UNSIGNED, CONTRADICTED, AMBIGUOUS, EXPIRED, REVOKED, SUPERSEDED,
TAMPERED` — **never** CERTIFIED/SIGNED/PUBLISHED.

## Exact identity tuple
`product × version × OS × os_version × architecture × channel × runtime_facet × binary_sha256`. Required for
completeness (M13-resolution fields): product, version, operating_system, architecture, channel, binary_sha256. A
missing/insufficient field keeps the attestation `INCOMPLETE`; no partial identity silently resolves to a different
cell.

## Evidence binding & integration (interfaces only; never executed)
`identity observation → M7 evidence package → identity attestation → M4 certification → M5 publication proposal →
M6 signed governance → immutable registry update → M13 matrix cell`. M9 supplies independent L4 network-isolation
verification; M8 remains the execution gate (still BLOCKED without all gates). M19 documents these interfaces
(`integrationInterfaces()`, all `m19_executes:false`) and reimplements none of them.

## Binary binding
`binary_sha256` must refer to the exact certified executable, evidenced at `CONTROLLED_OBSERVATION` strength or
higher. Filename, version, install directory, package name, benchmark metadata, and registry metadata are each
insufficient. Without binary identity the attestation cannot become complete.

## Channel binding
Channel must be **directly** evidenced (min `CONTROLLED_OBSERVATION`), never inferred from version/filename/path/OS/
architecture/benchmark pin/registry. If channel cannot be evidenced, the attestation remains `INCOMPLETE`.

## Provenance model
Per-field source/observer/time/environment/evidence-hash/strength. Strengths (ordered, not equivalent):
`SELF_REPORTED < LOCAL_OBSERVATION < CONTROLLED_OBSERVATION < INDEPENDENT_OBSERVATION < CERTIFICATION_ATTESTATION`.
Channel and binary require ≥ `CONTROLLED_OBSERVATION`; a `SELF_REPORTED` channel yields `INSUFFICIENT_PROVENANCE` →
`INCOMPLETE`.

## Multiple-installation handling
`installation_ref` names the exact installation certified. `ambiguous_installations = true` → `AMBIGUOUS` (blocked).
No PATH guess, no default-installation assumption, no silent selection.

## Staleness / replay protection
`created_at`/`expires_at` freshness (expired → `EXPIRED`), `environment_id` binding (copied attestation → environment
mismatch), and `previous_attestation_hash` chaining protect against stale/replayed/reused evidence.

## Revocation / supersession
`revocation_reference` → `REVOKED`; `supersession_reference` → `SUPERSEDED`. Neither is authoritative for publication.

## Tamper protection
`attestation_hash = SHA-256(canonical(attestation without hash))`; `verifyAttestation` detects any alteration of
identity/evidence/environment/profile/provenance. Integrity (`attestation_hash`) is explicitly **distinct** from
cryptographic signing — no fake signature is created.

## Signing boundary
`signer_identity = null`, `signature_status = SIGNATURE_REQUIRED`, `signing_required = true`. The existing PTPL
signing authority (M6) would sign the publication before an attestation becomes authoritative. M19 performs no
signing, generates no keys, and mutates no registry.

## M13 global-matrix binding
`attestationMatrixCombo` maps the attestation to exactly one `platform × architecture × channel × version` cell
(read-only via M13 `matrixCell`). A missing cell stays `NOT_CERTIFIED`; there is **no** cross-platform/version/
channel/architecture inheritance. Even a `COMPLETE_UNSIGNED` attestation against the production matrix binds to a
non-certified cell (certified count remains 0).

## Public product interaction (M17/M18 preserved)
Public dkskill continues: observe safe identity, receive explicit identity, remain UNKNOWN, resolve compatibility,
remain UNVERIFIED. It never needs to autonomously discover Claude version/channel. M17 and M18 are byte-identical.

## Security threat model
`threatModel()` (14 threats): forged/copied/stale/revoked attestation; wrong binary/version/channel/OS/architecture/
environment; replay; metadata substitution; malicious registry update; compromised observer; compromised
certification environment; ambiguous installation; tampered attestation. Each names required evidence, control,
failure state, and blocks certification.

## Privacy / secret boundary
The attestation contains only identity/provenance metadata. It never contains credentials, OAuth tokens, API keys,
cookies, session secrets, private signing keys, arbitrary user files, or `~/.claude` contents (`attestationHasSecret`
guards this).

## Statement
Design artifacts only; no product/runtime certification logic; no frozen artifact modified; production registry
immutable (certified 0); no Claude execution/authentication; no network; no signing; `/runtime/` absent; real
`~/.claude` untouched. The public product does not need to know everything; the certification system must know
exactly what it certifies.
