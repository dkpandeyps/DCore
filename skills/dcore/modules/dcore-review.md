# DCore · dcore-review — Code Review

- **module_id:** dcore-review
- **status:** IMPLEMENTED
- **purpose:** produce a structured review of code/diff text
- **inputs:** code or a diff (via stdin or --input)
- **outputs:** review: correctness, security, maintainability, findings (with severity), recommendations
- **permissions:** read-only
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any
- **dependencies:** none
- **failure_behavior:** fail-closed; malformed/empty input yields a safe scaffold with (none); unknown module -> diagnostic
- **runnable:** true

## How Claude uses this module
Pipe code/diff via stdin, or pass it positionally / with `--input`, to seed the structure, then complete each
section by following this reference and the surrounding context. Read-only: propose changes; never modify files
without explicit user approval.

## Automated detections (deterministic, high-signal)
- **high:** dynamic code execution (`eval`/`new Function`), subprocess execution, hardcoded secrets
  (`password=`/`api_key=`/…), private key material (`-----BEGIN … PRIVATE KEY-----`), cloud access key ids (`AKIA…`)
- **medium:** network endpoint references (`http(s)://…`)
- **low:** loose equality (`==`/`!=`), unresolved markers (`TODO`/`FIXME`/`XXX`)
- **info:** debug output (`console.log`/`print(`)

Findings carry `line`, `severity`, `category`, `message`, `excerpt`; a `severity_summary` and de-duplicated
`recommendations` are produced. Treat these as a first pass — always add manual correctness and test-coverage review.

## Reviewing real changes (diff mode)
Feed it a real unified diff and it reviews **only the added lines**, reporting `file` and the new-file `line` for every
finding (plus `mode`, `files_changed`, `added_lines`):
```
git diff | node scripts/dcore.mjs dcore-review
node scripts/dcore.mjs dcore-git diff --range main...HEAD --json   # evidence.patch -> dcore-review
```
Then do the human part of the review against the actual code: correctness and regressions, edge cases, error handling,
API compatibility, data integrity, concurrency, test quality (do the tests fail without the change?), unnecessary
complexity, performance where material, and documentation impact. Pair with dcore-impact for callers/tests/docs of the
changed identifiers and dcore-sec --repo for introduced secrets. Report actionable findings only, each with file:line.

## Example
```
printf 'const p = eval(x)\nif (a == b) {}\n' | node scripts/dcore.mjs dcore-review
```


## Tests
See bench/test/dcore-skill.test.ts for structural + behavioral coverage.
