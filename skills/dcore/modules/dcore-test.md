# DCore · dcore-test — Test Generation

- **module_id:** dcore-test
- **status:** IMPLEMENTED
- **kind:** procedure (Claude writes tests; DCore grounds and runs them)
- **purpose:** add meaningful tests (regression tests for bugs, edge cases, error paths) that follow the existing test conventions, and run them
- **inputs:** what to test (positional/--input/handoff) + `--repo <path>`
- **outputs:** objective, conventions, procedure, test_command (discovered or UNKNOWN)
- **permissions:** writes test files only
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any
- **dependencies:** dcore-explore, dcore-run
- **failure_behavior:** no test command discovered => test_command UNKNOWN and results NOT_TESTED until one is found; a regression test must be shown to FAIL before the fix
- **runnable:** true

## How Claude uses this module
Copy the structure of the nearest existing test. For a bug, write the regression test first and run it to see it
fail. Use deterministic data and the repository's fakes; never real credentials or live services. Run the new tests
and the surrounding suite with dcore-run. Remove tests that only restate the implementation or can never fail.

## Example
```
node scripts/dcore.mjs dcore-test "regression: help output columns misalign for long module ids" --repo .
```

## Tests
See bench/test/dcore-skill.test.ts and bench/test/dcore-exec.test.ts.
