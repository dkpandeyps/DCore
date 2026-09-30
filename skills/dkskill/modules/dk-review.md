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
Run  (or pipe via stdin) to seed the structure, then complete each section by following this reference and the surrounding context. Read-only: propose changes; never modify files without explicit user approval.

## Example


## Tests
See bench/test/dkskill-skill.test.ts for structural + behavioral coverage.
