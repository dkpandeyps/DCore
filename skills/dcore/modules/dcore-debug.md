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
with evidence before fixing; add a regression test via dcore-test. The module itself is read-only; the loop below executes through the execution modules.

## The investigation loop (executed, not just described)
1. **Reproduce** with an execution module: dcore-run (failing test/command), dcore-browse (web symptom), dcore-api (API).
2. **Collect evidence**: exact error + stack from the run evidence, dcore-git log --path of the area, logs.
3. **Inspect**: dcore-explore + dcore-impact on the suspected identifiers.
4. **Hypothesis -> experiment**: change one variable; rerun. A root cause is CONFIRMED only when an experiment flips the outcome.
5. **Fix** the confirmed cause narrowly (dcore-build), **regression test** that failed before the fix (dcore-test), **verify** (dcore-run).
The output's `evidence_status` keeps OBSERVED facts, UNCONFIRMED hypotheses, the CONFIRMED root cause (null until
proven) and unresolved uncertainty apart. Never present a hypothesis as the root cause.

## Example
```
node scripts/dcore.mjs dcore-debug "The checkout API intermittently times out after the latest deploy."
```

## Tests
See bench/test/dcore-skill.test.ts for structural + behavioral coverage.
