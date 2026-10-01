# DCore · dcore-debug — Debug / Investigation

- **module_id:** dcore-debug
- **status:** IMPLEMENTED
- **purpose:** turn a defect report into hypotheses, evidence to collect, likely root causes and next steps
- **inputs:** a defect report / observed-vs-expected symptoms (positional, --input, stdin, or a dcore handoff)
- **outputs:** objective, symptoms, hypotheses, evidence_to_collect, likely_root_causes, next_steps
- **permissions:** read-only
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any
- **dependencies:** none (composes after dcore-review/dcore-qa; feeds a fix + dcore-qa regression test)
- **failure_behavior:** fail-closed; malformed/empty input yields a safe scaffold with a prompt to describe the defect
- **runnable:** true

## How Claude uses this module
Describe what was observed vs expected (and anything about timing/recent changes). The module seeds symptoms,
hypotheses, the evidence worth collecting, and deterministic likely-root-cause candidates from symptom keywords
(latency, null/empty, concurrency, authz, recent change, resource exhaustion, wrong target). Confirm one hypothesis
with evidence before fixing; add a regression test via dcore-qa. Read-only: never executes or modifies anything.

## Example
```
node scripts/dcore.mjs dcore-debug "The checkout API intermittently times out after the latest deploy."
```

## Tests
See bench/test/dcore-skill.test.ts for structural + behavioral coverage.
