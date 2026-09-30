# DCore · dcore-spec — Specification

- **module_id:** dcore-spec
- **status:** IMPLEMENTED
- **purpose:** turn a problem into a structured specification
- **inputs:** a problem statement
- **outputs:** specification: objective, users, requirements, constraints, assumptions, acceptance criteria, open questions
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
See bench/test/dcore-skill.test.ts for structural + behavioral coverage.
