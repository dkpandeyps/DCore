# dkskill Evidence-Package ↔ Identity-Attestation Binding Specification (M20)

**STATUS: M20 COMPLETE (DESIGN ONLY) / NO IMPLEMENTATION / NO CERTIFICATION / NO SIGNING / NO EXECUTION /
M17 & M18 & M19 UNCHANGED / CURRENT HOST UNVERIFIED / M8 = EXECUTION_BLOCKED / CERTIFIED = 0**

M20 specifies — at the design level only — how an M7 evidence package becomes the authoritative observation source for
each M19 identity field, how provenance/freshness/contradictions propagate into the attestation, and the exact M4 gate
that consumes a `COMPLETE_UNSIGNED` attestation. It is a specification (`dkskill.evidence_attestation_binding_spec/1`),
not runtime certification: no Claude execution, no authentication, no `~/.claude`/credential access, no network, no
signing, no key generation, no registry mutation. It reuses M19's 8 attestation states + 5 provenance strengths and
introduces **no new state**. Unknown/insufficient evidence remains non-certifiable; `COMPLETE_UNSIGNED ≠ CERTIFIED`.

## Evidence → identity field map (M20-A)
| field | required | M7 class | min provenance | L4 req | contradiction/stale/env-mismatch | may be UNKNOWN | missing→ | contradictory→ | weak→ |
|---|---|---|---|---|---|---|---|---|---|
| product | yes | EV-HOST-IDENTITY | SELF_REPORTED | no | block | no | INCOMPLETE | CONTRADICTED | INCOMPLETE |
| version | yes | EV-VERSION | CONTROLLED_OBSERVATION | no | block | no | INCOMPLETE | CONTRADICTED | INCOMPLETE |
| operating_system | yes | EV-PLATFORM | CONTROLLED_OBSERVATION | no | block | no | INCOMPLETE | CONTRADICTED | INCOMPLETE |
| os_version | no | EV-PLATFORM | LOCAL_OBSERVATION | no | block(if present) | yes | COMPLETE_UNSIGNED | CONTRADICTED | INCOMPLETE |
| architecture | yes | EV-ARCHITECTURE | CONTROLLED_OBSERVATION | no | block | no | INCOMPLETE | CONTRADICTED | INCOMPLETE |
| **channel** | yes | EV-CHANNEL | **CONTROLLED_OBSERVATION** | **yes** | block | no | INCOMPLETE | CONTRADICTED | INCOMPLETE |
| runtime_facet | no | EV-TOOLCHAIN | LOCAL_OBSERVATION | no | block(if present) | yes | COMPLETE_UNSIGNED | CONTRADICTED | INCOMPLETE |
| **binary_sha256** | yes | EV-BINARY-IDENTITY | **CONTROLLED_OBSERVATION** | **yes** | block | no | INCOMPLETE | CONTRADICTED | INCOMPLETE |

## Provenance propagation (M20-B)
Order `SELF_REPORTED < LOCAL_OBSERVATION < CONTROLLED_OBSERVATION < INDEPENDENT_OBSERVATION < CERTIFICATION_ATTESTATION`.
Strength may increase only when a stronger observation **agrees** on the value; it never decreases silently. Multiple
agreeing observations → strongest wins. **Any divergent value contradicts regardless of strength (fail closed) →
CONTRADICTED — a weak divergent observation invalidates a stronger one.** Observations are not reusable across attempts
unless fresh **and** same `environment_id`. Evidence hashes bind observations to the attestation.

## Binary-identity binding (M20-C)
**Authoritative:** exact executable SHA-256 (bytes-only read) from the certified installation inside an L4-isolated
cert env. **Supporting only:** package/archive hash, embedded version metadata (unproven). **Insufficient:** filename,
directory/path, `package.json` version, benchmark binary reference, registry metadata. `binary_sha256` must identify
the exact certified executable. **OPEN DESIGN GAP (GAP-02):** embedded version-resource binding unproven; the exact-
byte-hash path exists but its authority depends on L4 cert-env control.

## Channel-identity binding (M20-D)
Design candidates only: a machine-readable controlled-install attestation (CONTROLLED_OBSERVATION) or an independent
observer of the installed channel (INDEPENDENT_OBSERVATION). Forbidden inference: version/filename/path/OS/architecture/
benchmark/registry/install-date/history. SELF_REPORTED insufficient. **OPEN DESIGN GAP (GAP-01):** no concrete
machine-readable channel evidence source is proven for Claude Code.

## M9 L4 relationship (M20-E)
Authoritative channel + binary depend on the cert environment being M9-L4 independently verified. L4 freshness/env
binding required; L4 absent/stale/revoked/mismatch → M4 gate BLOCKED. **The current real environment remains
L0/UNVERIFIED and M8 remains EXECUTION_BLOCKED.** M9 is not redefined.

## Freshness / environment (M20-F)
`expires_at ≤ now → EXPIRED`; future-dated evidence rejected (→ INCOMPLETE); env mismatch / cross-env copy → INCOMPLETE;
replay caught by freshness + `previous_attestation_hash`; `supersession_reference → SUPERSEDED`; `revocation_reference →
REVOKED`; a stale required-field observation blocks even alongside fresh evidence. No silent refresh, no auto-cert.

## Contradiction rules (M20-G)
version/binary/channel/architecture/OS mismatch → **CONTRADICTED**; environment mismatch → **INCOMPLETE**; installation
mismatch → **AMBIGUOUS**. All within M19's existing states; no new state introduced.

## Exact M4 consumption gate (M20-H)
Conceptual gate **CG-ATT** requires: `COMPLETE_UNSIGNED`; all required-field provenance thresholds; no contradiction/
ambiguity/expiry/revocation/supersession/tamper; valid environment binding; valid evidence hash chain; exact non-revoked
M13 matrix cell; cert env M9-L4 verified; all required M4 gates; no unresolved safety-critical limitation; owner
authorization where M4 requires it. **`COMPLETE_UNSIGNED` ≠ `CERTIFIED`.** Transition (documented, never executed):
`COMPLETE_UNSIGNED → M4 evaluation → certification decision → M5 publication proposal → M6 signing/governance →
immutable registry publication`.

## M4 failure matrix (M20-I, 21 rows)
missing version/channel/hash → INCOMPLETE/BLOCKED; weak channel/binary → INCOMPLETE/BLOCKED; contradictory version/hash/
channel → CONTRADICTED/FAIL; ambiguous installs → AMBIGUOUS/BLOCKED; stale → EXPIRED/BLOCKED; revoked → REVOKED/FAIL;
superseded → SUPERSEDED/FAIL; tampered → TAMPERED/FAIL; env mismatch → INCOMPLETE/BLOCKED; L4 absent/stale/revoked →
COMPLETE_UNSIGNED/BLOCKED; matrix cell missing → COMPLETE_UNSIGNED/FAIL; cell revoked → COMPLETE_UNSIGNED/BLOCKED;
safety-critical unresolved → COMPLETE_UNSIGNED/FAIL; M8 execution evidence unavailable → COMPLETE_UNSIGNED/BLOCKED.
**Every row → NOT_CERTIFIED; none PASS.**

## Evidence hash binding (M20-J)
Chain: `M7 artifact hash → M7 normalized hash → M19 observation evidence_hash → M19 attestation_hash → M4 evidence
reference`. Canonical project JSON + `sha256:<hex>`; content-addressed; **sha256 only** (no new crypto). Missing/
unexpected/substituted evidence or any hash mismatch → BLOCKED.

## Multiple installations (M20-K)
The cert env provisions exactly one intended installation; `installation_ref` names it. No PATH/default/silent/version-
only/filename-only selection; ambiguity → AMBIGUOUS. M7 identifies the selected install via the env provisioning record
(no credentials exposed).

## Observer trust boundary (M20-L)
`local < controlled < independent (M9 L4)`. Product → self; version/OS/arch → controlled; **channel/binary
authoritative → independent (L4)**. Cert environment → env binding + `installation_ref`; M4 owner review → certification
authorization; M6 → signing (M20 signs nothing).

## Public/private boundary (M20-M)
Public product: observe safe identity / accept explicit identity / remain UNKNOWN / resolve compatibility / fail closed
without certification. Certification system: consume controlled + independent evidence / bind exact identity / produce
`COMPLETE_UNSIGNED` / feed M4. Signing & governance: M6 only; M20 does not sign or manage keys.

## Security review (M20-O, 14 threats)
evidence substitution/replay, stale reuse, cross-env replay, hash substitution, observer impersonation/compromise,
cert-env compromise, installation confusion, binary replacement after observation, channel switching after observation,
metadata substitution, malicious registry reference, forged provenance — each with a required control, a failure state,
and `certification_blocked = true`. No M19 control weakened.

## Synthetic fixture specifications (M20-N, 18, SYNTHETIC_TEST_ONLY)
complete → COMPLETE_UNSIGNED; missing channel/hash, weak channel/binary, env mismatch → INCOMPLETE; contradictory
version/binary/channel → CONTRADICTED; ambiguous installs → AMBIGUOUS; stale → EXPIRED; revoked → REVOKED; superseded →
SUPERSEDED; tampered → TAMPERED; L4 absent/stale/revoked & matrix-cell mismatch → COMPLETE_UNSIGNED blocked at M4. None
certified or published.

## Future test specification (M20-Q)
15 future test areas (evidence→field mapping, provenance thresholds, binary/channel binding, L4 dependency, freshness,
env binding, contradictions, multi-install, hash-chain integrity, M4 gate behavior, M13 exact-cell binding, public/
private boundary, secret exclusion, static no-exec/no-network/no-credential). Synthetic-only.

## Open design gaps (M20-R, preserved — not answered by inference)
- **GAP-01** — concrete direct channel evidence source (≥ CONTROLLED) for Claude Code.
- **GAP-02** — concrete binary-binding mechanism proving the exact certified executable without weak metadata.
- **GAP-03** — how M6 signing binds the attestation to the publication record.
- **GAP-04** — M6 key-management lifecycle.

## Statement
Design/specification only; no runtime/certification implementation; no frozen artifact modified; production registry
immutable (certified 0); no Claude execution/authentication; no network; no signing; `/runtime/` absent; `~/.claude`
untouched. The public product does not need to know everything; the certification system must know exactly what it
certifies; authoritative identity belongs at the certification boundary; unknown or insufficient evidence remains
non-certifiable.
