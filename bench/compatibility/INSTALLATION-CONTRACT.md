# dkskill Installation Contract (M14)

**STATUS: INSTALLATION CONTRACT DEFINED / PLATFORM-NEUTRAL / OFFLINE-CAPABLE / FAIL-CLOSED**

Platform-neutral installation lifecycle. No PTPL/benchmark credentials, private OAuth, internal network, private
infrastructure, firewall weakening, or privileged commands are required.

## Lifecycle
`CLONE → DISCOVER → VALIDATE → INSTALL → INITIALIZE → COMPATIBILITY_CHECK → READY_OR_BLOCKED`. Each stage fails closed
on error.

- **CLONE** — user clones the public repository (no secrets present).
- **DISCOVER** — Claude Code discovers the `dkskill` skill by its manifest.
- **VALIDATE** — verify manifest schema + package integrity (sha256); malformed/tampered → reject.
- **INSTALL** — place the package under the user's Claude skills directory (platform-neutral path).
- **INITIALIZE** — create the isolated per-user state directory (this is where the future runtime state lives; it is
  **not** the repository `/runtime/`, which remains absent).
- **COMPATIBILITY_CHECK** — run `dkskill doctor`: detect environment, resolve exact profile via M3/M13, resolve
  capabilities/facets/permissions.
- **READY_OR_BLOCKED** — `READY` only for a certified, exactly-matching host; otherwise `BLOCKED`/`UNVERIFIED`/
  `UNSUPPORTED` with an actionable explanation (never a silent "works everywhere").

## Files & locations
Required: the public package (source, manifest, capability catalogue, signed public registry, docs). Installation
location: the user's Claude Code skills directory (platform-neutral). Configuration discovery: user config read
read-only with safe defaults. Registry discovery: the signed public registry shipped with the package (offline-first).

## Offline / corruption / upgrade / rollback
- **Registry unreachable / no network** — operate from the last signed local registry; diagnostics still work.
- **Registry stale** — refuse enforcement; report staleness. Missing information is **never** treated as compatible.
- **Corruption** — integrity failure → reject; do not operate on a corrupt package.
- **Upgrade** — new dkskill release; new environments/releases start `UNVERIFIED`; no automatic compatibility
  inheritance; migrations are explicit.
- **Rollback** — the previous signed registry/package is retained for safe rollback.

## Statement
Installation is platform-neutral and offline-capable; it accesses no credentials, contacts no network by default,
creates no `/runtime/`, and never claims compatibility for an unverified environment.
