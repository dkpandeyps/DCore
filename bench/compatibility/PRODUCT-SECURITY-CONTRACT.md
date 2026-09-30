# dkskill Product Security Contract (M14)

**STATUS: SECURITY CONTRACT DEFINED / FAIL-CLOSED / NO SECRETS IN PUBLIC PRODUCT / PRODUCTION IMMUTABLE**

Product-level security requirements derived from the M13 security/trust model. Every requirement is fail-closed: any
unknown, mismatched, stale, revoked, tampered, or unverified condition can only reduce trust, never grant it.

## Threats → product controls (all FAIL_CLOSED)
| Threat | Product control |
|---|---|
| package tampering | sha256 integrity on package + manifest |
| manifest tampering | `manifest_hash` verification before load |
| registry tampering | signed + immutable registry (M6) |
| forged certification | evidence-based M4 + owner-signed M5/M6 |
| wrong host / version / architecture / channel | exact M3 identity resolution; no inheritance |
| stale evidence | freshness (M7/M9); refuse enforcement |
| revoked / superseded profile | explicit states; never COMPATIBLE |
| capability spoofing | M0 states preserved; never upgraded |
| attribution spoofing | `attribution@1` scope `["2.1.283"]`; UNKNOWN otherwise; no attr@2 |
| unsafe fallback | fail-closed default; `UNVERIFIED ≠ UNSUPPORTED` (H-Q1) |
| credential leakage | no credential access; no secrets in package |
| unauthorized network activity | offline-first; no external calls by default |
| privilege escalation | read-only core; explicit minimal permissions |
| unexpected filesystem mutation | writes only to an isolated per-user state directory |

## Permission model
Every operation declares its required permission and its effects (read-only vs mutating; filesystem/process/network/
credentials/external). `affects_credentials` is `false` for every product permission. **Unknown permission state
never becomes allowed** (`resolvePermission(UNKNOWN) → DENY`, `resolvePermission(DENIED) → DENY`). Real credentials
are never accessed.

## Trust boundary
**PUBLIC:** universal source, capability catalogue, public compatibility profiles, signed registry, installation and
supported-platform docs, public tests. **PRIVATE:** certification credentials, infrastructure secrets, certification
hosts, observer infrastructure, private evidence, private audit, benchmark credentials, signing authority material.
**The public product never requires** PTPL private infrastructure, private benchmark credentials, private OAuth
state, private observers, internal network access, or privileged certification infrastructure.

## Statement
No secret enters the public product/repository; the current host stays UNVERIFIED; M8 stays EXECUTION_BLOCKED; the
production registry is immutable with zero certified profiles.
