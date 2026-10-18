# Installing DCore

There are two ways to install. Use one, not both, or every skill shows up twice.

## Option A: Claude Code plugin (no clone)
Inside Claude Code:
```
/plugin install dcore --marketplace dkpandeyps/DCore
```
On Claude Code older than 2.1.275: `/plugin marketplace add dkpandeyps/DCore`, then `/plugin install dcore@dcore`.
From a terminal: `claude plugin marketplace add dkpandeyps/DCore && claude plugin install dcore@dcore`.

Plugin skills are namespaced by the plugin name: `/dcore:dcore <task>`, `/dcore:dcore-browse`, `/dcore:dcore-api`, …
Claude also picks them automatically from their descriptions. The plugin has no fixed version, so every commit to `main`
is an update: run `/plugin` (or `claude plugin update dcore@dcore`), or turn on auto-update for the `dcore` marketplace
in `/plugin` > Marketplaces. Remove with `claude plugin uninstall dcore@dcore`.

## Option B: installer (unprefixed `/dcore`, `/dcore-browse`, …)

### Quick start (global — use `/dcore` from any folder)
```
git clone https://github.com/dkpandeyps/DCore.git
cd DCore
node skills/dcore/scripts/install.mjs --user
```
Restart Claude Code; `/dcore <task>` and every module command (`/dcore-browse`, `/dcore-api`, `/dcore-qa`, …) are
then available in every project. To upgrade later: `git pull` and re-run
the same install command.

## 1. Clone
```
git clone https://github.com/dkpandeyps/DCore.git
cd DCore
```

## 2. Install (choose one)
Project-local (recommended — no machine-wide change):
```
node skills/dcore/scripts/install.mjs --project
# -> ./.claude/skills/dcore
```
User-level:
```
node skills/dcore/scripts/install.mjs --user
# -> ~/.claude/skills/dcore   (writes only skill files; never touches credential files)
```
Explicit target / preview:
```
node skills/dcore/scripts/install.mjs --target <some-skills-dir> --dry-run
node skills/dcore/scripts/install.mjs --target <some-skills-dir>
```

The installer is deterministic, **idempotent** (safe to run repeatedly), **confined** to `<target>`,
**path-traversal protected**, **offline**, and accesses **no credentials**. It refuses `runtime` directories and any
credential-like file, and supports `--dry-run`.

## 3. Use
```
node skills/dcore/scripts/dcore.mjs list
node skills/dcore/scripts/dcore.mjs dcore-spec --input "<your problem>"
```
Only Node.js (>= 18) is required for installation and the reasoning/analysis modules, and they need no network
access. The execution modules have extra, explicit requirements:
- **dcore-browse**: Node.js >= 22 and an installed Chrome / Edge / Chromium / Brave (or `DCORE_BROWSER=<path>`);
  otherwise it reports BLOCKED. It contacts only the URLs you give it.
- **dcore-api / dcore-verify**: network access to the URLs you give them.
- **dcore-git / dcore-release**: `git` on PATH.
- Evidence (screenshots, reports) is written under `.dcore/` in the current directory; keep it out of version control.

Re-running the install command upgrades in place: files that a previous DCore install wrote and the new version no
longer ships are removed (recorded in `<target>/dcore/.dcore-install.json`); files DCore never installed are reported
as `unmanaged` and left untouched.

## Supported platforms
Windows, macOS, and Linux. Paths are handled with `node:path`; there are no shell-specific assumptions.

## Stand-alone module skills
Next to `<target>/dcore` the installer writes one skill per runnable module: `<target>/dcore-<module>/SKILL.md`
(`/dcore-browse`, `/dcore-api`, …). Each is a thin entry point onto the engine in `<target>/dcore`, so keep them side
by side. An existing `dcore-<module>` skill that DCore did not create is never overwritten; the installer reports it as
skipped. Module skills a newer version no longer ships are removed on upgrade (tracked in `.dcore-install.json`).

## Uninstall / removal
The installer writes only the `<target>/dcore` and `<target>/dcore-<module>` directories. To remove DCore, delete them:
```
# project-local
rm -rf ./.claude/skills/dcore ./.claude/skills/dcore-*   # PowerShell: Remove-Item -Recurse -Force .\.claude\skills\dcore*
# user-level
rm -rf ~/.claude/skills/dcore ~/.claude/skills/dcore-*
```
No other files are created, so removal is complete once those directories are gone.

## Troubleshooting
- **`node: command not found`** — install Node.js ≥ 18 and re-open your shell.
- **Installer refuses the target** — it rejects `runtime` directories and any credential-like path by design; choose a
  normal skills directory (e.g. `--project`).
- **"nothing changed" on re-run** — expected: the installer is idempotent; an unchanged tree reports 0 created/updated.
- **Windows path with spaces** — quote the `--target` value.
- **Running the full test suite fails on older Node** — the suite needs Node ≥ 24 (type-stripping); the skill itself
  only needs Node ≥ 18.

## Requirements for basic use
- certification: **not required**
- private infrastructure: **not required**
- credentials: **not required**
- network: **not required**
