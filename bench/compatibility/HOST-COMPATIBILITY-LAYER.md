# dkskill Host Compatibility Layer (M3)

**STATUS: M3 IMPLEMENTED AS REPOSITORY-SIDE COMPATIBILITY LAYER / RUNTIME ENFORCEMENT NOT ENABLED**

The HCL (`bench/compatibility/hcl.ts`, `hcl-types.ts`) is the version/platform/channel-adaptive boundary between
dkskill and Claude Code. It consumes the M0 catalogue, M1 registry, and M2 attribution equivalence and answers,
by **exact data resolution only**, whether enforcement is permitted for an observed host. It runs no Claude,
certifies nothing, and enables no production enforcement.

## Architecture
```
Claude Code host -> Identity Probe -> exact Host Identity -> Compatibility Registry -> Compatibility Profile
   -> (Capabilities | Facets | Limitations) -> dkskill core (version-independent)
```

## Identity tuple
`{ product, version, platform, architecture, channel, binary_sha256?, executable_source? }`. Identity is a tuple,
never a version string. A match requires **all** of product/version/platform/architecture/channel to match; the
binary hash participates when both sides provide it (a mismatch excludes the candidate). Probe statuses:
`IDENTIFIED | PARTIALLY_IDENTIFIED | UNIDENTIFIED`. The probe never fabricates a version or hash; a real probe
that executes the binary would sit behind the same interface and is **not run** in M3 (tests use fake identities).

## Registry resolution (exact only)
`EXACT_MATCH | NO_MATCH | AMBIGUOUS_MATCH | INVALID_PROFILE | REVOKED_PROFILE`. No nearest-version, no semver
inheritance, no "latest", no platform/channel substitution, no silent fallback. Multiple candidates → AMBIGUOUS
(never a silent pick). No exact profile → host **UNVERIFIED** → enforcement **REFUSED** (UNVERIFIED != UNSUPPORTED).

## Capability resolution
Each capability resolves to its profile state (`VERIFIED | PARTIALLY_VERIFIED | NOT_YET_VALIDATED | NOT_AVAILABLE
| DEGRADED_AT_RUNTIME`). States are **preserved, never upgraded**; VERIFIED is never inferred from product/version.
Safety-critical = CRITICAL criticality ∧ `core_safety_enforcement` (from M0).

## Facet resolution
Families: `hook_protocol, stream_schema, attribution, settings_layout, permission_modes`. A facet resolves to its
registry facet id + validation status, or `UNRESOLVED` (null ref / unknown id). Unknown/unvalidated facet →
never guessed, never borrowed from another version → dependent enforcement refused (or DEGRADED only for an
explicitly-optional feature).

## Attribution limitations
attribution@1 is consumed only through the registered M1 profile, as **PROBED/evidence-level**. `ATTR_VALID_FOR`
= `['2.1.283']`; a version outside that scope → A9/unknown, `table_valid=false` → dependent claims unverified.
Real-host attribution is **NOT_VALIDATED** (TS-07). No attr@2.

## Self-check contract (T2; not executed)
Future live checks (PreToolUse nonce heartbeat, SessionStart context, hook/config presence) are represented as
`NOT_RUN | PASS | FAIL | UNKNOWN`. M3 executes none. A CRITICAL safety self-check that is not PASS blocks certified
enforcement; `NOT_RUN` is never treated as PASS.

## Enforcement decision (fail-closed)
`ENFORCEMENT_ALLOWED | ENFORCEMENT_REFUSED | ENFORCEMENT_DEGRADED`, returned as explicit state (never via
exceptions). ALLOWED requires: EXACT_MATCH, `certification_status === CERTIFIED`, all required capabilities meet
their min state, all required facets RESOLVED, and no CRITICAL self-check failing. Otherwise REFUSED; DEGRADED is
reserved for an explicitly-optional feature with only optional gaps and no critical self-check failure.
`PARTIALLY_VERIFIED` is never promoted; `DEGRADED_AT_RUNTIME` stays visible.

## Fail-closed rules
unknown host / unknown profile / invalid registry / revoked profile → refuse; unknown facet → refuse dependent
enforcement; unknown stream/permission text → attribution unverified; unresolved critical capability → refuse
certified enforcement.

## Diagnostics
The `dkskill.host_compatibility_result/1` result reports observed identity, identity status + field sources,
profile resolution + id, validation/certification status, capability results, facet results, self-check results,
limitations, enforcement decision, and reason codes. It contains **no credentials, tokens, or secret env values**.

## Version / platform independence
The HCL contains **no** `if version === …` / `if version >= …` / platform policy branches. All version/platform
behavior lives in the registry + facets + capability evidence. If a version-specific branch ever seemed necessary,
the correct action is to extend the registry/facet data, not the HCL code.

## Current known profile status
- `cc-2.1.283-win32-x64-native@1`: EXACT_MATCH, `PROBED` / `NOT_CERTIFIED` → **ENFORCEMENT_REFUSED** (a safety-critical
  capability is PARTIALLY_VERIFIED and TS-07 is unresolved). See `hcl-sample-result.json`.
- `2.1.284`, macOS, Linux: NOT_VALIDATED / not certified.

## Boundary with future production runtime
M3 is repository-side resolution only. It is isolated from the Phase 4 benchmark runner and from any production
dkskill enforcement. **M3 does not certify a Claude Code host; does not resolve TS-07; does not resolve TS-11;
does not authorize Run A; does not enable production dkskill enforcement.** M4 (certification harness), M5 (profile
certification), and M6 (benchmark/product separation) are not implemented.
