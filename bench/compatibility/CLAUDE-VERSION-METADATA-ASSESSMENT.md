# dkskill Safe Claude Code Version/Channel Metadata Source Assessment (M18)

**STATUS: M18 COMPLETE (ASSESSMENT ONLY) / DECISION = IMPLEMENTATION_NOT_JUSTIFIED / VERSION =
CONDITIONALLY_ACCEPTABLE (explicit path only) / CHANNEL = NO SAFE SOURCE → UNKNOWN / M17 UNCHANGED /
CURRENT HOST UNVERIFIED / M8 = EXECUTION_BLOCKED / CERTIFIED = 0**

M18 is a research/design assessment (not an implementation mandate) of whether dkskill can safely obtain Claude Code
version and/or channel from a **local, non-secret** installation metadata source. It is deterministic and repository-
local: it evaluates a fixed catalogue of candidate sources against explicit safety gates. It performs **no real
filesystem discovery**, executes **no Claude**, reads **no `~/.claude`/credentials**, and contacts **no network**.

## Research question
Can version and/or channel be obtained from a source that is local, non-secret, read-only, no-execution, no-network,
no-credential, no-`~/.claude`, deterministic, provenance-recordable, integrity-checkable, universally supportable, and
fails safely to UNKNOWN?

## Candidate sources investigated (11)
Installed package metadata (npm `package.json`, auto-discovered and explicit-path), application bundle metadata
(macOS `Info.plist`), static embedded binary version resource, package-manager query, npm dist-tag (channel),
filename/path inference, environment variable, benchmark/registry inference, recursive filesystem discovery, and
`~/.claude` config.

## Candidate source matrix (acceptance)
| source | version | channel | why |
|---|---|---|---|
| NPM_PACKAGE_JSON_AUTODISCOVER | REJECTED | REJECTED | requires broad discovery/PATH walking (forbidden) |
| NPM_PACKAGE_JSON_EXPLICIT | CONDITIONALLY_ACCEPTABLE | REJECTED | weak binary binding, multi-install ambiguous, staleness undetectable; channel absent |
| MACOS_INFO_PLIST_EXPLICIT | CONDITIONALLY_ACCEPTABLE | REJECTED | bundle version not bound to running binary; channel absent |
| EMBEDDED_BINARY_VERSION_RESOURCE | UNKNOWN | UNKNOWN | STRONG binding (same binary M17 hashes) but data unproven — Claude Code may not embed a parseable version resource |
| PACKAGE_MANAGER_QUERY | REJECTED | REJECTED | requires subprocess execution |
| NPM_DIST_TAG_CHANNEL | REJECTED | REJECTED | requires network |
| FILENAME_VERSION | REJECTED | REJECTED | inference |
| ENV_VAR_VERSION | REJECTED | REJECTED | inference / untrusted / unbound |
| BENCHMARK_OR_REGISTRY_METADATA | REJECTED | REJECTED | forbidden inference from benchmark/registry |
| RECURSIVE_FS_DISCOVERY | REJECTED | REJECTED | broad filesystem read (forbidden) |
| DOT_CLAUDE_CONFIG | REJECTED | REJECTED | reads `~/.claude` (credential-adjacent) |

## Windows findings
An embedded PE version resource (in the explicitly-supplied binary) would have STRONG binding, but its presence/format
in Claude Code is unproven → UNKNOWN. No safe channel source. Package-manager query rejected (execution).

## macOS findings
`Info.plist` `CFBundleShortVersionString` (explicit bundle path) yields a version with WEAK binding to the running
binary and no channel → CONDITIONALLY_ACCEPTABLE (version), no channel.

## Linux findings
No standard non-secret install manifest reliably carries version+channel; npm `package.json` (explicit path) gives
version only, WEAK binding. No safe channel source.

## Version findings
Best achievable: **CONDITIONALLY_ACCEPTABLE** and only via an **explicitly-supplied** metadata path (package.json /
Info.plist), with WEAK binary binding, multi-install ambiguity, and undetectable staleness. This overlaps the existing
M17 `EXPLICIT_INPUT` mechanism (a caller may already pass a version explicitly). No **autonomous** version source
passes every gate.

## Channel findings
**No safe local non-secret channel source exists.** The only direct channel signal (npm dist-tag) requires network;
`~/.claude` config is credential-adjacent; and deriving channel from version/filename/path/OS/architecture/install
date/benchmark pin/registry/history is forbidden inference. **Channel remains UNKNOWN.**

## Binary-binding findings
Package/bundle metadata is not cryptographically bound to the running binary; only an embedded version resource inside
the explicitly-supplied binary (which M17 already hashes) would bind strongly — but that data is unproven. Metadata is
never silently bound to an arbitrary executable.

## Integrity findings
Candidate metadata files can be hashed (`OBSERVED`/`INTEGRITY_VERIFIED` at most), but never `AUTHENTICATED` or
`CERTIFIED` — there is no signing authority and no cryptographic authenticity for these files.

## Multiple-installation findings
package/PATH-based sources are AMBIGUOUS across global/local/npx/standalone installs; dkskill cannot safely select
which installation the user intends without an explicit path. Ambiguity → identity blocked (never silently selected).

## Staleness findings
Auto-discovered metadata can become stale relative to the intended binary and staleness is not reliably detectable
without binding to the binary; such sources are unsafe for authoritative identity.

## Contradiction handling
Any disagreement (metadata vs explicit, metadata vs binary-associated, two metadata sources, missing/malformed/stale/
duplicated metadata) must remain `CONTRADICTED`/`AMBIGUOUS` and fail closed — the existing M17 contradiction handling
already enforces this; no best-guess/closest-match/fallback.

## Security evaluation
Each rejected mechanism was rejected precisely because it could become a Claude launcher (package-manager query,
embedded-resource parsing that executes), a credential/OAuth reader (`~/.claude` config), a network client (dist-tag),
an updater/installer, a telemetry mechanism, or a compatibility/certification bypass. Any mechanism that could
accidentally become one of these is rejected.

## Accepted source
**None** (`accepted_source_id = null`) for autonomous production use.

## Decision
**IMPLEMENTATION_NOT_JUSTIFIED.** No candidate passes all required safety gates for autonomous version detection, and
no safe channel source exists. Version could be CONDITIONALLY_ACCEPTABLE only via an explicitly-supplied path, which is
already approximable through M17 `EXPLICIT_INPUT`; a new autonomous production source is not justified. **Under the
current public-product safety model, version and channel remain UNKNOWN unless supplied through existing safe
mechanisms.** M17 is not modified.

## M17 integration (design, not implemented)
Had a source been accepted, a new provenance value `LOCAL_INSTALLATION_METADATA` would feed M17 →
`observationToHost` → M13 `resolveUniversal` (never duplicating M13/M3). Because the gate failed, no such value or code
is added; M17 remains byte-identical.

## Statement
No frozen artifact modified; no product code changed; production registry immutable (certified 0); no Claude
execution/authentication; no credential access; no network; no OS/network change; `/runtime/` absent; real `~/.claude`
untouched. If no safe metadata source exists, UNKNOWN is the correct result — the security boundary is not weakened to
make version detection look complete.
