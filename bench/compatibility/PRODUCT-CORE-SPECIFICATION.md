# dkskill Product Core Specification (M14)

**STATUS: M14 SPECIFICATION COMPLETE / NO RUNTIME IMPLEMENTED / NO CERTIFICATION / CURRENT HOST UNVERIFIED /
M8 = EXECUTION_BLOCKED / PRODUCTION CERTIFIED COUNT = 0**

M14 freezes **what dkskill is** before any runtime or user-facing skill is built. It is specification only:
deterministic, repository-local, fail-closed. It builds on frozen M0–M13, certifies nothing, executes no Claude,
accesses no credentials, changes no OS/network, and creates no `/runtime/` directory. Canonical spec object:
`buildProductSpec()` → `dkskill.product_core_spec/1` (see `product-core-spec.json`).

## What dkskill is
A **universal, fail-closed compatibility core** that lets a cloneable Claude Code skill set operate safely **only
where the exact host is explicitly certified**, and give honest, actionable diagnostics everywhere else. It is not a
Windows/macOS/Linux/version-specific project — one universal core, many explicitly certified host facets. License
Apache-2.0; Claude-Code-only until R8.

## Responsibilities
Core runtime (discover/load/validate/lifecycle/fail-closed); capabilities (stable M0 IDs, never upgrade unknown);
adapters (identity normalization only, never certify); compatibility (exact M3 resolution, refuse enforcement on
UNVERIFIED — H-Q1); security (integrity/signature, no secrets, fail closed); installation (platform-neutral);
configuration (safe defaults); update (no inheritance); failure (every unsafe ambiguity fails closed with an
actionable explanation).

## Hierarchy (unambiguous terminology)
`PRODUCT` (dkskill) → `SKILL` (installable unit) → `CAPABILITY` (a coherent ability, references M0) → `OPERATION`
(a single action requiring a permission), plus `PERMISSION`, `COMPATIBILITY_REQUIREMENT`, `PLATFORM_ADAPTER`,
`HOST_FACET`, `SECURITY_POLICY`.

## Runtime lifecycle (13 stages, each fails closed)
`DISCOVER → LOAD → VALIDATE → DETECT_ENVIRONMENT → RESOLVE_COMPATIBILITY → RESOLVE_CAPABILITIES → RESOLVE_FACETS →
RESOLVE_PERMISSIONS → ENFORCE_SECURITY → INITIALIZE → EXECUTE → OBSERVE_RESULT → CLEAN_UP`. Failure cases
(partial/unverified/unsupported/mismatch/revoked/stale/malformed/tampered/unknown-capability/unknown-permission/
missing-facet/adapter-failure/runtime-failure) all resolve `FAIL_CLOSED`.

## Compatibility API contracts
`detectEnvironment` (environment+adapter dependent), `resolveHostIdentity` (adapter, deterministic-over-inputs),
`resolveCompatibility`/`resolveCapabilities`/`resolveFacets` (registry, deterministic-over-inputs),
`resolvePermissions` (deterministic; unknown→DENY), `enforceCompatibility` (deterministic; M3 decideEnforcement),
`enforceSecurity` (deterministic; M6 signed registry + M13 model). All fail-closed; each maps to a frozen M13/M3
function; none reimplemented here.

## Capability & operation model
Capabilities reference frozen M0 states (`VERIFIED/PARTIALLY_VERIFIED/NOT_YET_VALIDATED/NOT_AVAILABLE/
DEGRADED_AT_RUNTIME`); `NOT_YET_VALIDATED` never becomes `VERIFIED`; safety-critical uncertainty fails closed;
`UNVERIFIED ≠ UNSUPPORTED`. Every operation declares read-only/mutating + filesystem/process/network/credential/
external effects, its required permission, and `on_unknown_permission: DENY`.

## Public user experience
`dkskill doctor` (read-only) reports detected environment, exact version/architecture/channel, compatibility state,
missing requirements, blocked operations, and the safe next action — without exposing M0–M13, PTPL, certification
infrastructure, M8/M9, or any secret.

## Decision boundary
- **BUILD NOW:** product core spec/types; `dkskill doctor` diagnostic over the M13 universal resolver; platform
  adapters (identity only); public manifest + integrity + installation contract.
- **BUILD LATER:** runtime state directory + on-disk format (defined here, created at install time); update/migration
  executor.
- **REQUIRES CERTIFICATION:** enforcement beyond L1 diagnostics on a real host; any real certified facet.
- **REQUIRES OWNER DECISION:** additional user-facing skills beyond the core (taxonomy count NOT_YET_DECIDED);
  network-dependent registry refresh policy.

## Statements
No frozen artifact modified; production registry immutable (certified count 0); no Claude execution; no credential
access; no `/runtime/` created; current host UNVERIFIED; M8 EXECUTION_BLOCKED.
