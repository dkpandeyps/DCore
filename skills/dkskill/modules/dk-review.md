# dkskill · dk-review — Code Review

- **module_id:** dk-review
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

## Example
```
printf 'const p = eval(x)\nif (a == b) {}\n' | node scripts/dkskill.mjs dk-review
```


## Tests
See bench/test/dkskill-skill.test.ts for structural + behavioral coverage.
