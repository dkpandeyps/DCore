# DCore · dcore-chain — Composition Chain

- **module_id:** dcore-chain
- **status:** IMPLEMENTED
- **purpose:** run the common frame → spec → plan → qa path in one call, composing via deterministic handoff
- **inputs:** a feature/request description (positional, --input, stdin)
- **outputs:** objective, stages (ordered), stage_status, and the full `frame`, `spec`, `plan`, `qa` sub-results
- **permissions:** read-only
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any
- **dependencies:** reuses dcore-frame, dcore-spec, dcore-plan, dcore-qa and the JSON handoff — it adds no new logic
- **failure_behavior:** fail-closed; each stage is a total deterministic function (never throws); empty/malformed input yields safe scaffolds for every stage, and `stage_status` records any stage error
- **runnable:** true

## How Claude uses this module
A convenience for the most common composition. `frame` and `spec` read the original request; `plan` is handed the
spec's JSON and `qa` the plan's JSON (same handoff used on the CLI), so the back half composes without re-typing.
It is **not** an orchestration engine: no DSL, no background execution, no network, no Claude invocation — just the
four existing modules run in order with their boundaries preserved. Inspect any stage via its sub-result.

## Example
```
node scripts/dcore.mjs dcore-chain "Add per-key token-bucket rate limiting."
node scripts/dcore.mjs dcore-chain "Build feature X" --json   # inspect each stage
```

## Tests
See bench/test/dcore-skill.test.ts for structural + behavioral coverage.
