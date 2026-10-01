# DCore · dcore-release — Release Prep

- **module_id:** dcore-release
- **status:** IMPLEMENTED
- **purpose:** produce a fail-closed release-readiness checklist with explicit go/no-go gates
- **inputs:** a description of the release/change (positional, --input, stdin, or a dcore handoff)
- **outputs:** objective, scope, gates, risks, unmet_gates, go_no_go, rollout
- **permissions:** read-only
- **security_level:** SAFE_GENERIC
- **platform_requirements:** any
- **dependencies:** none (consumes evidence from dcore-qa / dcore-review / dcore-sec)
- **failure_behavior:** fail-closed; go_no_go is NO-GO whenever any gate is not evidenced in the input
- **runnable:** true

## How Claude uses this module
Describe the release and what has been done (tests, review, security, docs, migration, rollback, observability,
versioning). The module marks each gate evidenced/`[x]` or not-evidenced/`[ ]` from the text and returns an explicit
go/no-go — NO-GO until all gates are evidenced. A gate marked `[x]` means "mentioned", not "proven"; confirm each is
truly satisfied before shipping. Read-only: it never performs the release.

## Example
```
node scripts/dcore.mjs dcore-release "Release v2: schema migration. Tests pass, code review approved, rollback via feature flag."
```

## Tests
See bench/test/dcore-skill.test.ts for structural + behavioral coverage.
