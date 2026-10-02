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

## Executable readiness gates (`--repo`)
With `--repo` the module **runs** the gates instead of reading them from text and returns one verdict:
**READY · BLOCKED · NOT_AUTHORIZED · FAILED · VERIFIED**.
Gates: clean working tree, not behind upstream, tests (discovered command or `--test-cmd`, executed), repository secret
scan (no CONFIRMED credentials), version consistency (package.json vs CHANGELOG, else NOT_APPLICABLE), README present.
Publishing happens only when asked **and** READY **and** approved: `--push --approve git-push` pushes (never force) and is
VERIFIED only when the remote HEAD equals the local HEAD; `--deploy-cmd "<cmd>" --approve deploy` runs the deploy and
`--verify-url <url>` verifies it with dcore-verify. Without the approval the verdict is NOT_AUTHORIZED and nothing is
published. Never claims a deployment succeeded without that evidence.
```
node scripts/dcore.mjs dcore-release --repo . --test-cmd "npm test"
node scripts/dcore.mjs dcore-release --repo . --push --approve git-push
```

## Example
```
node scripts/dcore.mjs dcore-release "Release v2: schema migration. Tests pass, code review approved, rollback via feature flag."
```

## Tests
See bench/test/dcore-skill.test.ts for structural + behavioral coverage.
