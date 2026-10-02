# DCore · dcore-git — Git Change Management

- **module_id:** dcore-git
- **status:** IMPLEMENTED
- **kind:** execution
- **purpose:** inspect and manage git state safely: status, diff (working/staged/range), log, branches, show, remote-head; commit and push only with explicit approval
- **inputs:** op (`status|diff|log|branches|show|commit|push|remote-head`) + `--repo`, `--range`, `--staged`, `--n`, `--path`, `--ref`, `--message`, `--files a,b`, `--remote`, `--branch`, `--approve git-commit|git-push`
- **outputs:** dcore.evidence/1 report (status: branch/upstream/ahead/behind/staged/unstaged/untracked; diff: stat + patch; push: local vs remote HEAD verification)
- **permissions:** read-only by default; git-write with approval
- **security_level:** ENVIRONMENT_SPECIFIC
- **platform_requirements:** any (git on PATH)
- **dependencies:** git
- **failure_behavior:** no git / not a repo => BLOCKED; commit without --files or --message => BLOCKED (never stages everything blindly); commit/push without approval => NOT_AUTHORIZED; force/mirror/delete push args => BLOCKED (forbidden); push is PASS only when the remote ref equals local HEAD afterwards
- **runnable:** true

## How Claude uses this module
Use `diff` to feed dcore-review (`dcore-git diff --json`, take evidence.patch, pipe it to `dcore-review`),
`log --path` for the history of a failing area, `status` before any release. This module has no reset / checkout /
clean / rebase / stash-drop operation at all: it cannot discard user work or rewrite history.

## Example
```
node scripts/dcore.mjs dcore-git status --repo .
node scripts/dcore.mjs dcore-git diff --range HEAD~1..HEAD
node scripts/dcore.mjs dcore-git push --approve git-push
```

## Tests
See bench/test/dcore-skill.test.ts and bench/test/dcore-exec.test.ts.
