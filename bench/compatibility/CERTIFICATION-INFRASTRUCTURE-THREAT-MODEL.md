# dkskill Certification Infrastructure Threat Model (M13)

Design-only threat model for the M13 certification infrastructure. Each threat lists control, evidence, failure
behavior (always fail-closed), and residual risk. The infrastructure certifies nothing and publishes nothing; these
controls describe how a FUTURE, separately-authorized certification would remain trustworthy. Source of truth:
`buildThreatModel()` in `certification-infrastructure.ts` (19 threats).

## Trust assumptions
- The **test host is untrusted by design**: enforcement and observation live on separate planes outside it.
- **Host self-report is never independent evidence** (M9/M12/M13). Only an external, enforcer-distinct, bound, fresh,
  tamper-evident observer can contribute to L4.
- Trust planes (control plane / test environment / evidence store / registry-publication control) are never collapsed.

## Threats

| ID | Threat | Control | Evidence | Failure behavior | Residual risk |
|----|--------|---------|----------|------------------|---------------|
| TH-01 | host self-attestation treated as independent | independent observer required; self-report rejected | observer independence contract | BLOCKED (never L4) | observer collusion (mitigated by plane separation) |
| TH-02 | compromised test host | test host untrusted; external enforcement + observation | external enforcement/observation | compromised host cannot alone certify; fail closed | host+observer co-compromise |
| TH-03 | compromised observer | observer distinct from enforcer; tamper-evident, bound | tamper-evident provenance | integrity failure/contradiction → BLOCKED | observer+enforcer co-compromise |
| TH-04 | compromised enforcement point | enforcement distinct from observer; controlled denied-test observed | controlled-behavior evidence | denial not demonstrable → BLOCKED | enforcer+observer collusion |
| TH-05 | stale evidence | freshness required | freshness metadata | stale → cannot verify | bounded clock skew |
| TH-06 | replayed evidence | environment binding + freshness + hash chain | binding + audit chain | replay → BLOCKED | replay within freshness window |
| TH-07 | tampered evidence | sha256 + hash-chained audit | raw+normalized hashes | hash mismatch → BLOCKED | hash collision (negligible) |
| TH-08 | wrong Claude binary | exact SHA-256 (M8 EP-03) | binary identity | mismatch → HARD STOP | pinned-binary supply chain (out of scope) |
| TH-09 | wrong version | exact version (M8 EP-02) | version identity | mismatch → HARD STOP | none material |
| TH-10 | wrong platform | exact platform; no cross-platform inference | platform identity | mismatch → HARD STOP | none material |
| TH-11 | wrong architecture | exact architecture (M8 EP-05) | arch identity | mismatch → HARD STOP | none material |
| TH-12 | credential leakage | no secrets persisted; secret-free store | secret scan | secret → reject/redact, fail closed | out-of-band leakage (process hygiene) |
| TH-13 | cross-environment credential reuse | per-env isolated credentials; no copying | credential isolation record | reuse → BLOCKED | operator error (procedural) |
| TH-14 | registry tampering | signed, immutable, hash-chained registry (M6) | signature + hash chain | tamper → rejected | signing-key compromise |
| TH-15 | unauthorized publication | M5/M6 owner-authorized signed publication only | authorization + signature | unauthorized → rejected | authority-key compromise |
| TH-16 | environment substitution | environment binding + reproducible identity | environment-id binding | mismatch → BLOCKED | identity spoofing (mitigated) |
| TH-17 | synthetic evidence promoted | `synthetic_test_only`; M5 PG-13 / M6 GG-18 reject | synthetic flag propagation | synthetic → cannot publish | flag stripping (guarded by tests) |
| TH-18 | network isolation falsely inferred | only M9 L4 independent verification | independent verification | inference → UNVERIFIED | observer collusion |
| TH-19 | unknown capability treated as verified | M0/M3 states preserved; UNKNOWN never upgraded | capability state records | unknown → not verified | none material |

## Cross-cutting failure principle
Every unknown, contradictory, stale, tampered, or mismatched condition **fails closed** — it can only reduce trust,
never grant it. No control depends on host self-report, and no VERIFIED/CERTIFIED/EXECUTION_ALLOWED/PUBLISHED outcome
is producible from this infrastructure phase.
