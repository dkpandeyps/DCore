# dkskill Verified Claude Code Identity Probe (M17)

**STATUS: M17 COMPLETE / READ-ONLY IDENTITY OBSERVATION / NO CLAUDE EXECUTION / NO CREDENTIALS / NO NETWORK /
IDENTITY ≠ COMPATIBILITY ≠ CERTIFICATION / CURRENT HOST UNVERIFIED / M8 = EXECUTION_BLOCKED / CERTIFIED = 0**

M17 is a safe, read-only Claude Code identity-observation layer. It establishes exact identity facts **only when they
can be obtained safely** and feeds them to the frozen M13/M3 resolver. It never executes Claude, authenticates, reads
`~/.claude`/credentials/OAuth/cookies/tokens, contacts the network, spawns a subprocess, or mutates anything. **UNKNOWN
is a valid, safe result.** Identity observation is never compatibility and never certification.

## Identity schema
`dkskill.claude_identity_observation/1`: observation_id, observed_at, product, claude_version + `version_state`,
operating_system, os_version, architecture, channel + `channel_state`, binary_path + `binary_path_state`,
binary_sha256 + `binary_hash_state`, binary_size, runtime, provenance (per field), evidence_class, identity_status,
`execution_performed=false`, `credentials_accessed=false`, `network_contacted=false`, `config_accessed=false`, safe,
reasons, observation_hash. States: `OBSERVED | UNKNOWN | UNAVAILABLE | REJECTED | CONTRADICTED` (never collapsed).

## Safe observation sources (strict order)
- **A. EXPLICIT_INPUT** — a schema-valid, internally-consistent, secret-free identity record explicitly supplied to
  the probe (classified `EXPLICIT_INPUT`, never `INDEPENDENT_VERIFICATION`).
- **B. SAFE LOCAL BINARY INSPECTION** — for an explicitly-supplied, safety-checked binary path only: verify regular
  file, canonicalize, read **bytes only**, compute SHA-256 (raw hex, registry convention). The file is **never
  executed**. Yields `binary_path` + `binary_sha256`.
- **C. SAFE VERSION METADATA** — optional non-secret local metadata for version/channel; if none is safely available,
  `version = UNKNOWN`, `channel = UNKNOWN`. Never inferred from benchmark metadata, registry records, filenames,
  previous runs, timestamps, or directory names.
- **D. SAFE ENVIRONMENT FACTS** — OS/OS-version/architecture/runtime via the M16 read-only OS facts (`SAFE_OS_API`).
  These are environmental, not Claude identity.

## Provenance
Per-field source, never claiming stronger evidence than obtained: OS/architecture/runtime → `SAFE_OS_API`; version/
channel → `EXPLICIT_INPUT` | `LOCAL_METADATA` | `UNKNOWN`; binary hash → `LOCAL_BINARY_READ` | `EXPLICIT_INPUT` |
`UNAVAILABLE` | `REJECTED` | `CONTRADICTED`; product → `EXPLICIT_INPUT` | `PRODUCT_DEFAULT`.

## Contradiction handling
Disagreeing safe observations are never silently resolved: explicit version vs local metadata → version
`CONTRADICTED`; computed binary hash vs supplied hash → hash `CONTRADICTED`. Any contradiction sets
`identity_status = CONTRADICTED` and blocks compatibility (the contradicted field is nulled before resolution). No
fallback, no "closest match," no partial-identity registry lookup.

## Binary hashing
Read-only, deterministic, no execution/modification/network. Distinguishes `BINARY_HASH_OBSERVED` (`OBSERVED`) from
`BINARY_HASH_NOT_AVAILABLE` (`UNAVAILABLE`); a missing hash never becomes `UNKNOWN_VERSION` and vice versa — each field
has its own state/provenance. Canonical path and file size are recorded.

## ~/.claude & credential protection (explicit, testable)
`isSafeBinaryPath` rejects any path whose segments include `.claude`, `.credentials`, `.ssh`, `.aws`, `.config`,
`runtime`, or `keychain`, or whose name matches credentials/oauth/cookie/token/api-key/id_rsa/.pem/session. A rejected
path yields `REJECTED` (path and hash) with `safe=false`; **no bytes are read on rejection**. The safety boundary is a
positive check, not merely avoidance.

## No-execution guarantee
The implementation contains no `child_process`/`exec*`/`spawn`/shell/PowerShell/`claude --version` primitives and no
network primitives (asserted statically). If version/channel cannot be obtained without execution, the result is
`UNKNOWN` — an acceptable success.

## Identity completeness (M13 tuple, not weakened)
`COMPLETE` requires product + version (OBSERVED) + a platform-resolvable OS + architecture + channel (OBSERVED), with
no contradiction. Otherwise `INCOMPLETE`; all-unavailable → `UNKNOWN`; any contradiction → `CONTRADICTED`. Missing
channel/version/hash is never manufactured.

## M13/M3 integration (resolver authoritative)
`observationToHost` passes only `OBSERVED` fields (everything else → null), and `resolveWithIdentity` calls the frozen
`resolveUniversal`. M17 never transforms `UNKNOWN → COMPATIBLE`, `INCOMPLETE → COMPATIBLE`, `CONTRADICTED →
COMPATIBLE`, or `UNVERIFIED → CERTIFIED`. Exact identity against a certified profile can reach `COMPATIBLE`; against
the production registry (certified 0) the same identity resolves `UNVERIFIED` — the resolver decides, not the probe.

## Doctor / CLI integration
`dkskill identity` (and `--json`) prints the observation; `doctorWithIdentity` composes the M16 doctor with an
identity section (frozen doctor unmodified). No command executes Claude, authenticates, or inspects credentials. On
this machine, `dkskill identity` reports version/channel/binary **UNKNOWN**.

## Cross-platform
Universal and platform-neutral: identity schema and safety rules are the same on Windows/macOS/Linux/x64/arm64.
Platform-specific inspection lives behind adapters; a fact a platform cannot safely expose stays `UNKNOWN` (never
platform-specific guessing; ARM never mapped to x64; unknown OS never mapped to a known OS).

## Statement
No frozen artifact modified; production registry immutable (certified 0); no Claude execution/authentication; no
credential access; no network; no OS/network change; `/runtime/` absent; real `~/.claude` untouched. M17 may establish
identity but never manufactures it; may improve resolution but never manufactures compatibility; may observe a binary
but never executes Claude; may produce stronger evidence but never turns evidence into certification.
