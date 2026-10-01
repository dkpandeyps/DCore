# DCore · dcore-doc — Documentation

- **module_id:** dcore-doc
- **status:** IMPLEMENTED
- **purpose:** turn a feature/spec/change into a deterministic documentation scaffold (known vs UNKNOWN, no invented APIs)
- **inputs:** a feature/spec/change description (positional, --input, stdin, or a dcore handoff — e.g. `dcore-spec … --json | dcore-doc`)
- **outputs:** title, summary, purpose, prerequisites, installation, usage, examples, configuration, api_interface, behavior, edge_cases, limitations, troubleshooting, testing, migration_notes, open_questions
- **permissions:** read-only
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any
- **dependencies:** none (consumes dcore-frame/spec/plan handoff generically)
- **failure_behavior:** fail-closed; unknown information is emitted literally as `UNKNOWN` — the module never invents APIs, commands, config keys, behavior, or examples
- **runnable:** true

## How Claude uses this module
Describe the feature/change (or pipe a prior module's `--json`). The module fills what is inferable from the input
(summary, purpose, behavior, limitations, migration notes) and marks everything that needs real, verified detail as
`UNKNOWN` so Claude fills it from the actual code — it will not fabricate commands, flags, endpoints, or output.
Writes nothing to disk; emits structured output for review or further composition.

## Example
```
node scripts/dcore.mjs dcore-doc "Add a rate limiter. It must not add network calls."
node scripts/dcore.mjs dcore-spec "Add rate limiting per API key." --json | node scripts/dcore.mjs dcore-doc
```

## Tests
See bench/test/dcore-skill.test.ts for structural + behavioral coverage.
