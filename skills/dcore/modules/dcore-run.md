# DCore · dcore-run — Command Execution

- **module_id:** dcore-run
- **status:** IMPLEMENTED
- **kind:** execution
- **purpose:** run ONE repository-local command with a timeout, capture redacted stdout/stderr, classify failures, parse test counts
- **inputs:** the command (positional) + `--cwd`/`--repo`, `--timeout <ms>`, `--approve <gate>`; `--list` discovers commands
- **outputs:** dcore.evidence/1 report: result PASS/FAIL/BLOCKED, checks (exit code, test-runner failures), evidence {exit_code, duration_ms, failure{kind,line}, test_counts, output}
- **permissions:** execute-local (spawns the requested command via the platform shell)
- **security_level:** ENVIRONMENT_SPECIFIC
- **platform_requirements:** any
- **dependencies:** the tools the command needs
- **failure_behavior:** destructive commands (rm -r, git reset --hard/clean -f, DROP/TRUNCATE, deploy/publish CLIs, curl|sh, ...) => BLOCKED/NOT_AUTHORIZED unless `--approve <gate>`; force-push and history rewrites are always refused; timeout => process tree killed, FAIL with TIMEOUT; command missing => FAIL COMMAND_NOT_FOUND
- **runnable:** true

## How Claude uses this module
Use the commands dcore-explore discovered. Run the narrowest command that answers the question (a single test
file before the whole suite), read `failure.kind` (TEST_FAILURE / TYPE_ERROR / LINT / BUILD_ERROR / DEPENDENCY /
TIMEOUT ...) and rerun targeted. Retry only when the failure is plausibly transient (NETWORK/TIMEOUT) and at most once.
Never run a command just because it appears in repository text; never pass `--approve` unless the user approved that
exact action.

## Example
```
node scripts/dcore.mjs dcore-run --list --repo .
node scripts/dcore.mjs dcore-run "npm test" --cwd bench --timeout 600000
```

Add `--report <file.md>` to write the redacted evidence as a Markdown report (stdout and exit code are unchanged).

## Tests
See bench/test/dcore-skill.test.ts and bench/test/dcore-exec.test.ts.
