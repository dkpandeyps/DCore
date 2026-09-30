# dkskill Product Lifecycle (M14)

**STATUS: LIFECYCLE + UPDATE + RELEASE MODEL DEFINED / FAIL-CLOSED / NO AUTOMATIC INHERITANCE**

## Runtime lifecycle (13 stages)
`DISCOVER → LOAD → VALIDATE → DETECT_ENVIRONMENT → RESOLVE_COMPATIBILITY → RESOLVE_CAPABILITIES → RESOLVE_FACETS →
RESOLVE_PERMISSIONS → ENFORCE_SECURITY → INITIALIZE → EXECUTE → OBSERVE_RESULT → CLEAN_UP`. Every unsafe ambiguity
fails closed.

### Failure behavior (all FAIL_CLOSED)
partial compatibility → PARTIALLY_COMPATIBLE (degraded only); unverified → UNVERIFIED (refuse enforcement, H-Q1;
diagnostics only); unsupported host → UNSUPPORTED (safe no-op + explanation); profile mismatch → refuse; revoked →
refuse; stale registry → refuse + report; malformed manifest → reject load; tampered package → reject; unknown
capability → NOT_YET_VALIDATED (never VERIFIED); unknown permission → DENY; missing facet → PARTIALLY_COMPATIBLE /
refuse; adapter failure → UNSUPPORTED/UNVERIFIED; runtime failure → abort safely + clean up + report.

## Update model
dkskill release versions (semver); registry versions (versioned + signed); a new Claude Code version yields an
`UNVERIFIED` facet; per-adapter semver; capability changes additive (states preserved); skill changes keep immutable
identifiers; migrations explicit; rollback retains the previous signed registry. **New environments/releases start
`UNVERIFIED`; there is no automatic compatibility inheritance** across version/platform/architecture/channel.

## Latest-3 policy
The public compatibility policy is the latest 3 **actually-certified** versions (H-Q2). Fewer than three certified →
no filling with guesses; a released-but-uncertified version stays `UNVERIFIED`; a revoked certified version becomes
`REVOKED` and is never silently substituted.

## Offline model
Registry unreachable/no network → operate from the last signed local registry (diagnostics still work); stale →
refuse enforcement; evidence unrefreshable → no state upgrade; local package available → operate locally; incomplete
compatibility → UNVERIFIED. **Missing information is never treated as compatibility.**

## Release model
`development` (spec + unit tests green) → `alpha` (compatibility core validated) → `beta` (installation + failure
modes validated) → `release_candidate` (≥1 certified facet + security review) → `production` (owner-signed release;
per-facet states published). A release may be **public** while individual host facets remain `CERTIFIED`,
`UNVERIFIED`, `NOT_CERTIFIED`, or `UNSUPPORTED`. **The product is never called universally certified.**

## Test layers
product unit / integration / compatibility / adapter / security / installation / failure-mode / public smoke →
runnable on ordinary user machines. **certification** tests require controlled certification environments. Synthetic
certification remains `SYNTHETIC_TEST_ONLY`.

## Future runtime location (defined, not created)
Package: `<user Claude skills dir>/dkskill/`. Per-user state: `<user state dir>/dkskill/`. These are **defined only**;
this phase creates no directory, and the repository `/runtime/` remains absent.

## Statement
No certification, no publication, no Claude execution, no network/OS change; production registry immutable; current
host UNVERIFIED; M8 EXECUTION_BLOCKED.
