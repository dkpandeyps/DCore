# DCore · dcore-frame — Problem Framing

- **module_id:** dcore-frame
- **status:** IMPLEMENTED
- **purpose:** turn a raw request into a framed problem (objective, stakeholders, risks, open questions)
- **inputs:** a raw request/problem statement
- **outputs:** framed problem: objective, stakeholders, problem, context, success signals, risks, open questions
- **permissions:** read-only
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any
- **dependencies:** none
- **failure_behavior:** fail-closed; malformed/empty input yields a safe scaffold with (none); unknown module -> diagnostic
- **runnable:** true

## How Claude uses this module
Run `node scripts/dcore.mjs dcore-frame "<text>"` (or pipe via stdin) to seed the structure, then complete each section by following this reference and the surrounding context. Read-only: propose changes; never modify files without explicit user approval.

## Example
```
node scripts/dcore.mjs dcore-frame "Merchants say settlement reports are confusing; we may need a new export. Unclear who owns it?"
```

## Tests
See bench/test/dcore-skill.test.ts for structural + behavioral coverage.
