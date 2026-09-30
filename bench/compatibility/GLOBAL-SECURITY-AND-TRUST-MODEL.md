# dkskill Global Security & Trust Model (M13-UNIVERSAL)

**STATUS: SECURITY/TRUST MODEL DOCUMENTED / FAIL-CLOSED / NO SECRETS IN PUBLIC REPO / PRODUCTION IMMUTABLE**

This model governs how the globally cloneable dkskill stays safe for arbitrary users while PTPL performs private
certification. It is fail-closed throughout: any unknown, mismatched, stale, revoked, tampered, or unverified
condition can only reduce trust, never grant it.

## Public vs private trust boundary
**PUBLIC** (may enter the Git repository): universal source code, capability catalogue, approved public compatibility
profiles, the signed public registry, installation/use documentation, supported-platform documentation.
**PRIVATE** (never in the public repository): certification credentials, infrastructure secrets, certification hosts,
observer infrastructure, private evidence payloads, private audit material, sensitive internal network details,
benchmark credentials. **No secret ever enters the public Git repository.**

## Threats and controls (fail closed)
| Threat | Control | Failure behavior |
|---|---|---|
| malicious repository modification | signed registry (H-Q6); immutable records; hash-chained audits | tampered content rejected |
| registry tampering | signed + immutable + hash-verified matrix/registry | mismatch → rejected |
| forged certification | evidence-based certification (M4) + owner-signed publication (M5/M6) | unsigned/unauthorized → rejected |
| wrong binary / version / platform / architecture / channel | exact identity resolution (M3); no inheritance | mismatch → UNVERIFIED / UNSUPPORTED / NO_MATCH |
| stale / replayed evidence | freshness + environment binding + hash chains (M7/M9) | stale/replay → not verified |
| revoked / superseded profile | explicit REVOKED/SUPERSEDED states | never COMPATIBLE |
| synthetic evidence promotion | `synthetic_test_only` propagation; M5 PG-13 / M6 GG-18 reject | synthetic → cannot publish/certify |
| capability spoofing | M0 states preserved; NOT_YET_VALIDATED never upgraded | unknown → not verified |
| attribution spoofing | `attribution@1` scope `["2.1.283"]`; unknown → UNKNOWN; no attr@2 | out of scope → UNKNOWN |
| credential leakage / cross-env reuse | per-environment isolated credentials; secret-free evidence; no `~/.claude` copy | secret → reject/redact |
| unsafe fallback | fail-closed default; UNVERIFIED ≠ UNSUPPORTED; refuse enforcement on unverified (H-Q1) | fall back → refuse |

## Credential architecture
Certification credentials are isolated per environment; `~/.claude`, OAuth state, tokens, cookies, and API keys are
never copied between environments. The current workstation's real `~/.claude` is never accessed. The public repository
contains no secrets.

## Network isolation
M9 is authoritative for L4 (genuine independent verification). Host firewall output, netstat, route table, DNS/proxy
configuration, host self-report, synthetic evidence, and inferred isolation are **not** sufficient by themselves. L4 is
never weakened to accommodate a single-host environment; the current host remains `NETWORK_ISOLATION = UNVERIFIED`,
`M8 = EXECUTION_BLOCKED`.

## User safety guarantees
The public skill never claims "works everywhere", never requires firewall weakening, credential exposure, OAuth
copying, disabling security controls, running arbitrary downloaded scripts, trusting an unknown Claude Code version or
platform, or bypassing Claude permissions. It resolves an exact compatibility profile and returns a deterministic,
fail-closed decision with an actionable explanation of what is known and what is not.

## Statements
Certification infrastructure is a PTPL-side engineering concern; the cloneable public dkskill consumes compatibility
information safely and fails closed when required information is unavailable. Production registry immutable; certified
count zero; no publication; no Claude execution; no network contact; no OS/network change.
