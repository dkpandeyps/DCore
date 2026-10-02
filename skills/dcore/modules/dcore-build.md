# DCore · dcore-build — Implementation

- **module_id:** dcore-build
- **status:** IMPLEMENTED
- **kind:** procedure (Claude edits with its own tools; DCore grounds and verifies)
- **purpose:** implement the smallest coherent change that meets the acceptance criteria, following repository conventions, then verify by executing the repository commands
- **inputs:** the change request (positional/--input/handoff) + `--repo <path>`
- **outputs:** objective, conventions (languages, frameworks, test frameworks, test dirs, verification commands from dcore-explore), procedure, done_when, never
- **permissions:** writes repository files for the user-requested change only
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any
- **dependencies:** dcore-explore, dcore-impact, dcore-test, dcore-run, dcore-git
- **failure_behavior:** no --repo => conventions UNKNOWN (stated); the change is not done until verification commands executed and passed; unexecuted verification is NOT_TESTED
- **runnable:** true

## How Claude uses this module
Read before editing (the target code, its callers via dcore-impact, the nearest tests). Make the smallest change;
no unrelated refactors; keep public APIs unless the requirement changes them; match local style. Then dcore-test for
the new behavior and dcore-run for tests/lint/typecheck/build. Report the actual diff (dcore-git diff) and the
evidence. Commit/push only through dcore-git with the user's explicit approval.

## Example
```
node scripts/dcore.mjs dcore-build "Add a --version flag to the CLI" --repo .
```

## Tests
See bench/test/dcore-skill.test.ts and bench/test/dcore-exec.test.ts.
