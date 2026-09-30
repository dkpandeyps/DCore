# dkskill · dk-qa — QA / Test Plan

- **module_id:** dk-qa
- **status:** IMPLEMENTED
- **purpose:** produce a test plan from a feature/spec
- **inputs:** a feature/spec
- **outputs:** test plan: objective, test levels, scenarios, edge cases, data, exit criteria
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
