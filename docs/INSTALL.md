# Installing DCore

## 1. Clone
```
git clone <repository>
cd <repository>
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

The installer is deterministic, **idempotent** (safe to run repeatedly), **confined** to `<target>/dcore`,
**path-traversal protected**, **offline**, and accesses **no credentials**. It refuses `runtime` directories and any
credential-like file, and supports `--dry-run`.

## 3. Use
```
node skills/dcore/scripts/dcore.mjs list
node skills/dcore/scripts/dcore.mjs dcore-spec --input "<your problem>"
```
Only Node.js (>= 18) is required. No network access is needed.

## Supported platforms
Windows, macOS, and Linux. Paths are handled with `node:path`; there are no shell-specific assumptions.

## Uninstall / removal
The installer writes only under `<target>/dcore`. To remove the skill, delete that directory:
```
# project-local
rm -rf ./.claude/skills/dcore        # PowerShell: Remove-Item -Recurse -Force .\.claude\skills\dcore
# user-level
rm -rf ~/.claude/skills/dcore
```
No other files are created, so removal is complete once that directory is gone.

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
