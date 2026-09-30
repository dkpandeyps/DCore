# dkskill Universal Compatibility Architecture (M13-UNIVERSAL)

**STATUS: UNIVERSAL ARCHITECTURE IMPLEMENTED / ONE CORE + MANY CERTIFIED FACETS / CURRENT REAL HOST = UNVERIFIED /
M8 = EXECUTION_BLOCKED / PRODUCTION CERTIFIED COUNT = 0 / PUBLICATION = NONE**

dkskill is a globally cloneable skill set. This layer provides **one universal compatibility core** that serves every
user through **explicitly certified platform/version/architecture/channel facets**, with no unsafe assumptions. It is
deterministic, repository-local, and fail-closed. It composes the frozen M0–M9 logic (M0 catalogue, M1 registry, M2
attribution, M3 HCL) behind one pipeline and **never modifies them**, never certifies, never publishes, never mutates
the production registry, and never executes Claude. **This is not a Windows-only project**; the Phase-4 Windows host
is only one development/evidence environment and never the implicit definition of dkskill.

## Pipeline (one path for every supported platform)
```
ENVIRONMENT → HOST IDENTITY → EXACT VERSION/PLATFORM/ARCH/CHANNEL → COMPATIBILITY PROFILE → CAPABILITIES → FACETS
  → ATTRIBUTION → EVIDENCE → CERTIFICATION STATE → FAIL-CLOSED DECISION → USER-SAFE EXECUTION
```

## Host identity model
A host is a tuple: product, exact version, OS, OS version, architecture, channel, binary SHA-256, runtime facet —
never identified by version alone or platform alone. No inference `Windows→macOS`, `macOS→Linux`, `x64→arm64`,
`2.1.283→2.1.284`, or `stable→another channel` without explicit certified evidence.

## Platform adapters
`WindowsAdapter`, `MacOSAdapter`, `LinuxAdapter` isolate identity normalization (raw OS → registry platform token)
and declare explicitly-supported architectures/channels. They contain **no baked behavioral assumptions**
(`assumes_behavior: false`) and never set a capability state; compatibility always comes from the registry + evidence.
An unknown OS or unsupported architecture/channel → `UNSUPPORTED`.

## Capability model
Version-independent stable capability IDs (M0). States preserved: `VERIFIED, PARTIALLY_VERIFIED, NOT_YET_VALIDATED,
NOT_AVAILABLE, DEGRADED_AT_RUNTIME`. `UNVERIFIED ≠ UNSUPPORTED`; `NOT_YET_VALIDATED` never becomes `VERIFIED` by
inference; safety-critical uncertainty fails closed (`BLOCKED`).

## Facet model
Explicit facets (`hook_protocol@1, stream_schema@1, attribution@1, settings_layout@1, permission_modes@1`), each with
identity, schema version, scope, evidence requirements, compatibility relationship, validation status, lifecycle, and
provenance. New facets extend the catalogue without rewriting the core. An unknown/unresolved required facet →
`PARTIALLY_COMPATIBLE`, never silently compatible.

## Attribution
`attribution@1` is the validated contract; `ATTR_VALID_FOR = ["2.1.283"]` (unchanged). Unknown event / wrong version
/ malformed event / unknown permission → `UNKNOWN`. No guessing, no "probably equivalent", no `attr@2`.

## User-side outcomes
`COMPATIBLE, PARTIALLY_COMPATIBLE, UNVERIFIED, UNSUPPORTED, BLOCKED, REVOKED, PROFILE_NOT_FOUND, PROFILE_MISMATCH,
CAPABILITY_UNVERIFIED`. Each result carries an actionable explanation plus `known[]` / `unknown[]` lists. The skill
never claims "works everywhere"; every platform requires its own evidence. Default enforcement level **L1** (H-Q7).

## Installation / use flow
`git clone → skill discovery → local environment detection → exact compatibility resolution → capability resolution
→ fail-closed enforcement → safe skill operation`. No PTPL/benchmark credentials, private OAuth, internal network,
private infrastructure, manual firewall weakening, or privileged commands are required.

## Fail-closed behavior
Unknown, unsupported, unverified, mismatched, ambiguous, revoked, superseded, or safety-critical-uncertain
environments never become trusted. The universal core exposes `universalToM8`/`universalToM9` that always return
`UNVERIFIED`; the M8 execution gate stays `EXECUTION_BLOCKED`. The current real host (`PTPL-DK-BENCH-WIN-01`) resolves
`EXACT_MATCH` but `NOT_CERTIFIED` → **UNVERIFIED** (unchanged).

## Owner-approved decisions preserved
H-Q1 (refuse enforcement on unverified hosts), H-Q2 (latest-3 certified), H-Q3 (Windows/macOS/Linux + certified
channels), H-Q4 (immutable per-facet profile + attribution), H-Q5 (immutable binary identity by product/version/
platform/arch/channel/SHA-256), H-Q6 (signed registry updates), H-Q7 (default L1). License Apache-2.0; clean-room
coexistence preserved; Claude-Code-only until R8.

## Schemas
`dkskill.universal_compatibility/1`, `dkskill.host_facet/1`, `dkskill.platform_adapter/1`,
`dkskill.user_compatibility_result/1`, `dkskill.universal_compatibility_audit/1`.

## Statements
Synthetic multi-platform profiles are `SYNTHETIC_TEST_ONLY`; they never certify a real host, mutate the production
registry, authorize M8/Run A/TS-07/TS-11, or publish. The production registry stays byte-identical with **zero**
certified profiles. No Claude execution, no network contact, no OS/network change.
