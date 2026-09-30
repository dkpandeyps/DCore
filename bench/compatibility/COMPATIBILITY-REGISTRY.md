# dkskill Compatibility Registry (M1)

**STATUS: M1 DESIGN COMPLETE / NOT YET USED BY RUNTIME**

- M0 capability catalogue is complete (frozen source of capability IDs).
- M1 registry is **specification/data only**.
- M2 attribution equivalence — **not implemented**.
- M3 Host Compatibility Layer — **not implemented**.
- M4 certification harness — **not implemented**.
- M5 profile certification — **not implemented**.
- M6 benchmark/product separation — **not implemented**.
- **M1 certifies no current host/version/platform.**

## Pipeline

```
Capability Catalogue (M0)
        v
Compatibility Registry (M1)
        v
Host Compatibility Layer (M3, future)
        v
Runtime enforcement (future)
```

## Frozen Phase 4 state (unchanged by M1)

- Benchmark version **2.1.283**, pinned SHA-256 `9DBE16…DE3A`; `ATTR_VALID_FOR = ['2.1.283']`; TS-07/TS-11 **UNRESOLVED**; Run A **BLOCKED/UNAUTHORIZED**; `/runtime/` **absent**.

## Safety rule (H-Q1)

UNVERIFIED != UNSUPPORTED. BUT an UNVERIFIED safety-critical capability => dkskill MUST NOT claim certified enforcement (H-Q1). A CERTIFIED profile MUST NOT contain an unresolved safety-critical capability (safety-critical = CRITICAL criticality AND required_for core_safety_enforcement, per the M0 catalogue).

## Version resolution (no silent fallback)

host identity -> EXACT registry profile -> facets -> capability states -> validation/certification state. No nearest-version, no semver inheritance, no "latest", no silent fallback. No exact valid profile => UNVERIFIED (enforcement refused; diagnostics may still explain the detected host).

- **Unknown profile:** No exact profile => host is UNVERIFIED => enforcement refused; diagnostics may explain the detected host.
- **Unknown facet:** Unknown/unvalidated facet => dependent behavior cannot claim certification; no guessing, no silent fallback.
- **Unknown stream/attribution:** Unknown stream event/field/permission text => attribution must not guess => the dependent benchmark/certification result is invalid or unverified.
- **No silent compatibility:** A new Claude Code version does NOT inherit compatibility because it is believed to behave like an older version. Compatibility must be explicitly validated.
- **Revocation:** A revoked profile MUST NOT silently fall back to an older profile. Revocation => that host identity is UNVERIFIED => enforcement refused until a new profile is certified.

## Registry lifecycle (specification only; not executed in M1)

NEW_RELEASE_SEEN -> UNVERIFIED -> PROBING -> REGRESSION -> BEHAVIORAL_DIFF -> CERTIFICATION_REVIEW -> CERTIFIED -> PUBLISHED -> (terminal/intermediate) FAILED -> BLOCKED -> REVOKED

## Facets

| Facet | Family | Validation | Note |
|---|---|---|---|
| hook_protocol@1 | hook_protocol | PROBED | Hook wire protocol as observed for 2.1.283 (hands-on). Not certified. |
| stream_schema@1 | stream_schema | PROBED | stream-json schema parsed for the 2.1.283 corpus only. Unknown types/fields are anomalies, never guessed. |
| attribution@1 | attribution | PROBED | attr@1 valid ONLY for 2.1.283; TS-07 unresolved. No attr@2 is invented. |
| settings_layout@1 | settings_layout | PROBED | Settings allow/deny/ask layout and precedence as observed for 2.1.283. Not certified. |
| permission_modes@1 | permission_modes | PROBED | Permission-mode ceiling; default `auto` on 2.1.283. Not certified. |

A facet identity is immutable; a behavior change creates a NEW facet identity (never a silent mutation). No `attr@2` or other future facet is invented.

## Counts

- **Profiles:** 4
- **Facets:** 5
- **Capability references per concrete profile:** 25 (all resolve to M0)
- **By validation_status:** NOT_VALIDATED=3, PROBED=1
- **By certification_status:** NOT_CERTIFIED=4

## Profiles

| profile_id | product | version | platform | arch | channel | validation | certification | lifecycle |
|---|---|---|---|---|---|---|---|---|
| cc-2.1.283-win32-x64-native@1 | claude-code | 2.1.283 | win32 | x64 | native | PROBED | NOT_CERTIFIED | active |
| cc-2.1.284-win32-x64-native@1 | claude-code | 2.1.284 | win32 | x64 | native | NOT_VALIDATED | NOT_CERTIFIED | active |
| scope-darwin-unvalidated@0 | claude-code | (none) | darwin | UNSPECIFIED | UNSPECIFIED | NOT_VALIDATED | NOT_CERTIFIED | active |
| scope-linux-unvalidated@0 | claude-code | (none) | linux | UNSPECIFIED | UNSPECIFIED | NOT_VALIDATED | NOT_CERTIFIED | active |

- **2.1.283 / Windows:** historical Phase 2 evidence exists but TS-07 is UNRESOLVED and a safety-critical capability is not fully VERIFIED — therefore **NOT CERTIFIED**.
- **2.1.284 / Windows:** observed locally, not validated — **NOT CERTIFIED**; does not inherit 2.1.283 compatibility.
- **macOS / Linux:** in certification scope (H-Q3) but no repository evidence — **NOT_VALIDATED / NOT CERTIFIED** scope placeholders.

## Integrity / signing

- Signing authority: PTPL/dkskill owner authority (designated). Signature status: **UNSIGNED_DESIGN** (no signature fabricated).
- Records are canonicalizable and hashable (per-profile record_hash present). Cryptographic signing is NOT implemented in M1; no signature is fabricated.

