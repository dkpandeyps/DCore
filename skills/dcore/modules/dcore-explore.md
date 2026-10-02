# DCore · dcore-explore — Repository Exploration

- **module_id:** dcore-explore
- **status:** IMPLEMENTED
- **kind:** analysis (read-only)
- **purpose:** map a repository from the files actually present: project type, languages, frameworks, test frameworks, build/test/lint/typecheck commands, entry points, test dirs, CI, integrations, config files
- **inputs:** `--repo <path>`
- **outputs:** project_types, languages, manifests, lockfiles, frameworks, test_frameworks, integrations, commands[{kind,command,source,cwd}], entry_points, test_dirs, ci, config_files, sensitive_files_present (names only), files_scanned, notes
- **permissions:** read-only (node:fs reads inside --repo only)
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any
- **dependencies:** none
- **failure_behavior:** missing/invalid --repo => error, nothing scanned; secret files (.env, keys, credential stores) are listed by name and never read; dependency/VCS/agent dirs skipped
- **runnable:** true

## How Claude uses this module
Run it first on any repository task. Use `commands` to pick what to execute with dcore-run (prefer the
repository's own scripts over guessed commands), `test_frameworks`/`test_dirs` to follow test conventions
(dcore-test), and `integrations`/`config_files` to understand runtime boundaries. Everything reported is a literal
observation from files; nothing is inferred from language semantics.

## Example
```
node scripts/dcore.mjs dcore-explore --repo . --json
```

## Tests
See bench/test/dcore-skill.test.ts and bench/test/dcore-exec.test.ts.
