# dkskill Public Product Foundation (M15)

**STATUS: M15 COMPLETE / PUBLIC FOUNDATION IMPLEMENTED / NO CERTIFICATION / CURRENT HOST UNVERIFIED /
M8 = EXECUTION_BLOCKED / PRODUCTION CERTIFIED COUNT = 0 / /runtime/ ABSENT**

M15 implements the M14 BUILD_NOW scope: the first real public dkskill product foundation. It is deterministic, typed,
platform-neutral, fail-closed, and secret-free. It **consumes** the frozen M13/M3 compatibility resolver through
stable interfaces and never reimplements it, certifies anything, executes Claude, authenticates, accesses credentials
or real `~/.claude`, contacts the network, changes the OS/network, or creates `/runtime/`. Source lives under
`bench/product/` (the M14 canonical layout maps this to `src/product|adapters|security|skills`).

## Package structure (M15)
- `bench/product/product-foundation-types.ts` — public types (integrity, environment, doctor, install, VirtualFs).
- `bench/product/integrity-and-manifest.ts` — sha256 integrity + public manifest validation.
- `bench/product/environment-and-adapters.ts` — environment detection + platform adapters (identity only).
- `bench/product/doctor.ts` — `dkskill doctor` read-only diagnostic + renderer.
- `bench/product/install.ts` — platform-neutral install/discovery over an injected VirtualFs.
- Data artifacts (under `bench/compatibility/`): `product-package-manifest.json`, `product-package-integrity.json`,
  `product-adapters.json`, `product-doctor-compatible.json`, `product-doctor-unverified.json`,
  `product-install-compatible.json`.

## Public manifest
`dkskill.product_manifest/1` (from M14): product_id/skill_id/schema_version/product_version/capabilities/required
facets/permissions/dependencies/integrity/compatibility+security requirements/update metadata, `no_windows_assumption`
and `no_single_version_identity` true, `manifest_hash` (sha256 over the canonical manifest sans hash).
`validateProductManifest` fails closed on schema, identifier/version format, missing/invalid references, a manifest-
hash mismatch (tamper), and **unknown critical security requirements** (never implicitly accepted).

## Integrity mechanism
`dkskill.integrity_manifest/1`: sha256 per protected file; `verifyIntegrity` detects modified/missing/unexpected/
invalid-hash and unsupported schemes, fail-closed. **Hash verification is never certification** (`is_certification:
false`) and never a signature — M15 has no signing authority (`signature_status: SIGNATURE_NOT_AVAILABLE`); the report
distinguishes `INTEGRITY_VERIFIED` from `SIGNATURE_VERIFIED`. No network needed for local verification.

## Environment detection
`detectEnvironment(facts)` is pure over supplied facts; missing facts return `UNKNOWN` (null) — never guessed.
`nodeEnvironmentFacts(os)` performs the only real-machine read (os platform/arch/release, read-only) and leaves
Claude Code version/channel/binary `UNKNOWN` unless a caller supplies verified facts. It never reads `~/.claude`,
credentials, OAuth, or cookies, and never modifies the OS/network.

## Platform adapters
Windows/macOS/Linux adapters (reused from frozen M13) do identity normalization only (raw OS → registry token) and
declare supported architectures/channels. They never declare certification/compatibility, bypass M3/M8/M9, infer
behavior from another platform, access credentials, or perform privileged operations. Unknown OS → `UNSUPPORTED`;
unknown architecture is preserved (never silently mapped to x64; ARM never mapped to x64) and resolves per frozen M13
semantics.

## dkskill doctor
Read-only. Reports dkskill version, product, platform/OS version/architecture/Claude version/channel, binary-identity
status, compatibility profile + outcome (`COMPATIBLE/PARTIALLY_COMPATIBLE/UNVERIFIED/UNSUPPORTED/BLOCKED/REVOKED/
PROFILE_NOT_FOUND/PROFILE_MISMATCH/CAPABILITY_UNVERIFIED`), capability + facet states, attribution status, blocked/
unknown reasons, and a safe next action. Secrets are redacted; no OAuth/keys/cookies/credentials/private evidence are
exposed. The real production host reports **UNVERIFIED** with actionable guidance.

## Installation flow
`CLONE → DISCOVER → VALIDATE → INSTALL → INITIALIZE → COMPATIBILITY_CHECK → READY_OR_BLOCKED`, over an injected
VirtualFs (tests use an in-memory FS; the real machine is untouched). Fail-closed: malformed manifest or integrity
failure → `FAILED`; a target/state dir inside `~/.claude` or named `runtime` is **blocked**; `READY` only for a
`COMPATIBLE` host, otherwise `BLOCKED`. Install state (`dkskill.install_state/1`) is minimal, non-secret, versioned,
`contains_credentials: false`, `runtime_dir_created: false`. Offline-first: no network required; missing registry
info stays `UNVERIFIED`/`NOT_CHECKED`, never guessed.

## Security
Read-only core; explicit minimal permissions; unknown permission → DENY (M14). No arbitrary command execution, no
privileged operations, no hidden network calls, no telemetry, no credential collection/persistence, no automatic
remote execution. Public product never requires private certification infrastructure.

## gstack direction
No gstack-derived workflow modules are implemented; no gstack names/implementation copied; no one-skill-per-command.
The architecture hosts future original dkskill workflow modules cleanly (single skill + internal capability modules).

## Statement
No frozen artifact modified; production registry immutable (certified 0); no Claude execution; no authentication; no
credential access; no external network contact; no OS/network change; `/runtime/` absent; real `~/.claude` untouched;
current host UNVERIFIED; M8 EXECUTION_BLOCKED. **dkskill is not certified and does not claim to work everywhere.**
