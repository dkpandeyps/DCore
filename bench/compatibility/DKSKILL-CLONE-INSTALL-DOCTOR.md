# dkskill — Clone, Install & Doctor (M16)

**STATUS: M16 COMPLETE / PUBLIC PACKAGE WIRED / REAL READ-ONLY DOCTOR / UNCERTIFIED / OFFLINE-FIRST /
CURRENT HOST UNVERIFIED / M8 = EXECUTION_BLOCKED / CERTIFIED FACETS = 0 / /runtime/ ABSENT**

## What dkskill is
dkskill is a **universal, fail-closed Claude Code compatibility core**. It is architected to run the same way across
Windows, macOS, Linux, x64, arm64, and supported Claude Code channels/versions — but **compatibility is granted only
by explicit certification records**, per exact host facet. dkskill is *universal by architecture, explicit by
compatibility, fail-closed by default, safe when unverified, and honest about what has and has not been certified.*
It is **not** "universally compatible" and **not** "certified"; it does **not** claim to "work everywhere".

## First release contents
A single installable skill (`dkskill`, taxonomy `ONE_PRIMARY_WITH_MODULES`) providing: environment detection,
platform adapters (identity normalization only), public manifest + integrity verification, a platform-neutral
installer, and the read-only **`dkskill doctor`** diagnostic. No workflow modules yet.

## Clone
```
git clone <repo>
```
The public clone contains no credentials, no secrets, and no private certification infrastructure. It needs no
network access for local diagnosis or installation.

## Validate the package
Integrity is verified with SHA-256 over protected files (`dkskill.integrity_manifest/1`). The manifest carries a
`manifest_hash`. Verification fails closed on modified, missing, unexpected, or invalid-hash files, and on an
unsupported integrity scheme. **Integrity is not certification and not a signature** — there is no production signing
authority yet, so `signature_status = SIGNATURE_NOT_AVAILABLE` and `certified = false`. Distinguish:
`INTEGRITY_VERIFIED` (hashes match) vs `SIGNATURE_VERIFIED` (unavailable) vs `CERTIFIED` (false).

## Run `dkskill doctor`
```
dkskill doctor          # human-readable
dkskill doctor --json   # machine-readable (dkskill.public_doctor_report/1)
```
Doctor detects safe OS facts only (platform, architecture, OS version) and invokes the frozen universal resolver. It
reports the compatibility outcome, capability/facet states, attribution status, exact blocking/unknown reasons, and a
safe next action. It never reads `~/.claude`, credentials, OAuth tokens, or cookies; contacts no network; spawns no
subprocess; and the report explicitly carries `credentials_accessed=false`, `network_contacted=false`,
`subprocesses_spawned=false`.

**Claude Code version, channel, and binary hash are reported as `UNKNOWN`** unless a verified, explicitly safe probe
supplies them. They are never guessed from package versions, filenames, environment variables, memory, previous runs,
or benchmark metadata.

## What the states mean
- **UNKNOWN** — a fact could not be safely established; it is never guessed.
- **UNVERIFIED** — this exact host has no certification evidence yet. **UNVERIFIED is not unsupported.** Safety-critical
  operations remain blocked until the exact facet is certified.
- **UNSUPPORTED** — the platform/architecture/channel is outside the declared support scope; no compatibility claim.
- **BLOCKED** — a safety-critical capability is unverified; fail closed.
- **COMPATIBLE / PARTIALLY_COMPATIBLE** — an exact certified profile resolved (fully / with unresolved facets).
- **REVOKED / PROFILE_MISMATCH / PROFILE_NOT_FOUND / CAPABILITY_UNVERIFIED** — see the doctor's reasons.

## Why fail-closed
Any unknown, mismatched, stale, revoked, tampered, or unverified condition can only reduce trust, never grant it.
dkskill refuses to claim compatibility without exact certified evidence for the detected host.

## Why certification is separate
Certification requires independent evidence (M4), independent L4 network-isolation verification (M9), and owner-signed
publication (M5/M6) on dedicated infrastructure — none of which run on a user's machine. The public product consumes
published compatibility records; it never certifies itself.

## Why credentials are never collected & network is not required
Local diagnosis and installation read only safe OS facts and the local signed package/registry. dkskill never reads
`~/.claude`, tokens, cookies, or OAuth state, and never contacts remote services. Missing registry information stays
`UNVERIFIED`/`UNKNOWN` — never silently treated as compatible.

## Install
The installer runs `CLONE → DISCOVER → VALIDATE → INSTALL → INITIALIZE → COMPATIBILITY_CHECK → READY_OR_BLOCKED`
against the real filesystem, confined to the explicitly selected install directory. It refuses unsafe paths, any path
containing a `runtime` or `.claude` segment, and never touches `~/.claude`. Install state is minimal, non-secret, and
versioned; **no `/runtime/` and no credential/secret cache are created**. `READY` requires a `COMPATIBLE` result;
otherwise the install completes as `BLOCKED` and `UNVERIFIED` stays `UNVERIFIED`.

## When your host is not certified
`dkskill doctor` will report `UNVERIFIED` (or `UNSUPPORTED`) with the exact reasons and a safe next action.
Safety-critical operations remain blocked. Certification of a new host facet is a separate, owner-authorized process;
there is nothing unsafe for you to do to "force" it.
