# Reference Suite Capability Matrix

> **Naming:** this document analyses a third-party skill suite that served as the comparison baseline for DCore. It is called "the reference suite" here, and `<ref>` stands for its name in paths, commands and identifiers.
>
> **Subject:** the reference skill suite @ **v1.91.1.0**, commit `2a113ae` (2026-09-25), upstream repository identified in this file's Git history.
> **Method:** I read every `<skill>/SKILL.md.tmpl`, the `sections/`, `specialists/`, `references/` and `bin/` supporting files, and the generated `SKILL.md`. Everything here comes from the files, not from the README. Anything I could not confirm in code is marked **NOT VERIFIED**.
> **Companion docs:** [REFERENCE-ARCHITECTURE-ANALYSIS.md](REFERENCE-ARCHITECTURE-ANALYSIS.md), [IMPROVEMENT-OPPORTUNITIES.md](IMPROVEMENT-OPPORTUNITIES.md), [PROPOSED-SYSTEM-ARCHITECTURE.md](PROPOSED-SYSTEM-ARCHITECTURE.md).
>
> **Note on the local install:** the copy at `~/.claude/skills/<ref>` is **v1.67.1.0** (2026-08-17), 24 minor versions behind upstream. The machine also has `~/.claude/skills/paysec` (`github.com/dkpandeyps/paysec`, v1.68.0.0), which is a renamed fork of the reference suite. This matrix analyzes **upstream v1.91.1.0**.

---

## 0. How to read this document

- **§1** lists every skill with its size and the verdict for our system.
- **§2** gives a 17-field profile for each skill, grouped by lifecycle family.
- **§3** consolidates the verdicts into our proposed skill set.

**Terms used throughout:**

| Term | Meaning |
|---|---|
| **Preamble** | A shared block of about 400 lines that the generator (`scripts/gen-skill-docs.ts`) inlines into almost every generated `SKILL.md` through `{{PREAMBLE}}`. `preamble-tier` 1-4 controls how much of it is included. |
| **`$B`** | The reference suite's compiled headless-Chromium CLI (`browse/dist/browse`). |
| **`$D`** | The design binary (`design/dist/design`), which calls OpenAI gpt-4o image and vision APIs. |
| **`$P`** | The make-pdf binary. |
| **Aside** | A third-party AI browser (macOS 15+) that the reference suite now prefers as its primary browser driver, with `$B` as the fallback. |
| **AUQ** | AskUserQuestion. |
| **State root** | `$<REF>_STATE_ROOT`, resolved by `bin/<ref>-paths` in this order: `<REF>_HOME`, then `CLAUDE_PLUGIN_DATA`, then `~/.<ref>`, then `./.<ref>`. |
| **SLUG** | The owner-repo name from `bin/<ref>-slug`. |
| **Review log** | `~/.<ref>/projects/$SLUG/$BRANCH-reviews.jsonl`, written by `bin/<ref>-review-log`. |

**Verdict key (last field of each profile):**

| Verdict | Meaning |
|---|---|
| **KEEP** | A separate user-facing skill in our system. |
| **MERGE → X** | Becomes a mode or lens of capability X. |
| **SYSTEM** | Becomes an internal engine or policy, not a user-invoked skill. |
| **ADAPTER** | Becomes an integration adapter. |
| **DROP** | Not carried forward. |

---

## 1. Summary inventory

**Line counts.** `tmpl` is the source template. `gen` is the generated `SKILL.md`, which includes the preamble. Lazily-read `sections/` files are extra. Total generated SKILL.md volume is **≈2.43 MB across 62 files**, including host copies. The largest is `design-review/SKILL.md` at 130,923 bytes.

| # | Skill | Family | tmpl / gen lines | Proposed equivalent | Verdict |
|---|---|---|---|---|---|
| 1 | `<ref>` (root router) | Platform | 101 / 233 | Router engine (`core.router`) | SYSTEM |
| 2 | `office-hours` | Think | 342 / 1257 (+854 sections) | `/discover` | MERGE → discover |
| 3 | `spec` | Think | 497 / 908 (+424) | `/discover --to-issue` + tracker adapter | MERGE → discover |
| 4 | `plan-ceo-review` | Plan | 583 / 1283 (+1186) | `/plan` lens `product` | MERGE → plan |
| 5 | `plan-eng-review` | Plan | 192 / 725 (+1443) | `/plan` lens `engineering` (default gate) | MERGE → plan |
| 6 | `plan-design-review` | Plan | 325 / 1188 (+695) | `/plan` lens `design` | MERGE → plan |
| 7 | `plan-devex-review` | Plan | 454 / 1103 (+1022) | `/plan` lens `dx` | MERGE → plan |
| 8 | `autoplan` | Plan | 465 / 1032 (+762 + hook) | `/plan --auto` (orchestrated lens pipeline) | MERGE → plan |
| 9 | `plan-tune` | Meta | 658 / 1007 | Memory engine: preferences | SYSTEM |
| 10 | `design-consultation` | Design | 231 / 837 (+565) | `/design system` | MERGE → design |
| 11 | `design-shotgun` | Design | 372 / 899 (+86) | `/design explore` | MERGE → design |
| 12 | `design-html` | Design | 463 / 870 (+281) | `/design build` | MERGE → design |
| 13 | `design-review` | Design/Verify | 333 / 1930 | `/design audit` (lens on `/qa`) | MERGE → design |
| 14 | `devex-review` | Verify | 241 / 1078 | `/qa --lens dx` | MERGE → qa |
| 15 | `diagram` | Artifact | 175 / 305 | Artifact renderer `diagram` | SYSTEM (specialist) |
| 16 | `review` | Verify | 345 / 1084 (+≈1844) | `/review` | KEEP |
| 17 | `investigate` | Build | 268 / 704 | `/debug` | KEEP |
| 18 | `qa` | Verify | 376 / 935 (+sections) | `/qa` | KEEP |
| 19 | `qa-only` | Verify | 117 / 959 | `/qa --report-only` | MERGE → qa |
| 20 | `ship` | Release | 488 / 1002 (+≈2965) | `/ship` | KEEP |
| 21 | `land-and-deploy` | Release | 501 / 1030 (+≈1414) | `/deploy` | KEEP |
| 22 | `landing-report` | Release | 164 / 513 | `/deploy status` | MERGE → deploy |
| 23 | `setup-deploy` | Release | 236 / 612 | `/deploy setup` (writes structured config) | MERGE → deploy |
| 24 | `canary` | Operate | 253 / 717 | `/deploy monitor` | MERGE → deploy |
| 25 | `benchmark` | Operate | 240 / 448 | `/perf` | KEEP |
| 26 | `benchmark-models` | Eval | 151 / 281 | Evaluation engine `model-compare` | SYSTEM |
| 27 | `document-release` | Docs | 187 / 582 (+600) | `/docs sync` | MERGE → docs |
| 28 | `document-generate` | Docs | 460 / 846 | `/docs generate` | MERGE → docs |
| 29 | `health` | Operate | 380 / 730 | `/health` | KEEP |
| 30 | `cso` | Security | 162 / 170 (+audit-phases) | `/security` | KEEP |
| 31 | `codex` | Second opinion | 324 / 884 (+≈1116) | Specialist `second-opinion` (provider = codex) | SYSTEM (specialist) |
| 32 | `claude-code` | Second opinion | 304 / — (skipped for Claude host) | Specialist `second-opinion` (provider = claude) | SYSTEM (specialist) |
| 33 | `retro` | Operate | 760 / 1214 | `/retro` | KEEP |
| 34 | `careful` | Safety | 82 / 87 | Safety engine (always on, policy-driven) + `/guard` | SYSTEM |
| 35 | `guard` | Safety | 86 / 90 | `/guard` (single user control surface) | MERGE → guard |
| 36 | `freeze` | Safety | 96 / 101 | `/guard scope <dir>` | MERGE → guard |
| 37 | `unfreeze` | Safety | 44 / 48 | `/guard scope --clear` (user-only) | MERGE → guard |
| 38 | `context-save` | Memory | 273 / 622 | State engine: automatic checkpoints; `/resume save` | MERGE → resume |
| 39 | `context-restore` | Memory | 187 / 537 | `/resume` | KEEP (renamed) |
| 40 | `learn` | Memory | 197 / 547 | `/memory` | KEEP (renamed) |
| 41 | `setup-gbrain` | Memory | 697 / 1059 (+≈480) | Memory adapter `gbrain` + `/setup memory` | ADAPTER |
| 42 | `sync-gbrain` | Memory | 499 / 848 | Memory adapter background job | ADAPTER |
| 43 | `browse` | Browser | 129 / 451 | `/browser` + Browser tool layer | KEEP |
| 44 | `open-<ref>-browser` | Browser | 210 / 381 | `/browser open --headed` | MERGE → browser |
| 45 | `connect-chrome` | Browser | symlink → `open-<ref>-browser` | alias removed | DROP |
| 46 | `pair-agent` | Browser | 366 / 753 | `/browser share` | MERGE → browser |
| 47 | `setup-browser-cookies` | Browser | 64 / 235 | `/browser auth` | MERGE → browser |
| 48 | `scrape` | Browser | 180 / 418 | `/browser extract` | MERGE → browser |
| 49 | `skillify` | Browser | 441 / 820 | `/browser extract --save` (recipe codifier) | MERGE → browser |
| 50 | `make-pdf` | Artifact | 261 / 424 | Artifact renderer `pdf` | SYSTEM (specialist) |
| 51 | `ios-qa` | Mobile | 258 / 634 | `/qa --target ios` via device adapter | ADAPTER |
| 52 | `ios-fix` | Mobile | 101 / 449 | `/debug --target ios` | MERGE → debug |
| 53 | `ios-design-review` | Mobile | 105 / 453 | `/design audit --target ios` | MERGE → design |
| 54 | `ios-clean` | Mobile | 103 / 450 | iOS adapter `uninstall` | ADAPTER |
| 55 | `ios-sync` | Mobile | 100 / 447 | iOS adapter `sync` | ADAPTER |
| 56 | `deslop-shared-libs` | Code quality | 192 / 225 | `/health --lens reuse` | MERGE → health |
| 57 | `<ref>-upgrade` | Platform | 386 / 389 | Installation/update system | SYSTEM |
| 58 | `contrib/add-host` | Contributor | 67 / — | Adapter SDK scaffold (dev-only) | SYSTEM (dev tool) |
| — | `browser-skills/*` (e.g. `hackernews-frontpage`) | Browser recipes | n/a | Browser recipe registry | SYSTEM |

**Resulting user-facing surface: 19 commands** instead of about 57 skills: `/aeos` (help, doctor, config), `/discover`, `/plan`, `/design`, `/build`, `/debug`, `/review`, `/security`, `/qa`, `/perf`, `/ship`, `/deploy`, `/docs`, `/health`, `/retro`, `/browser`, `/guard`, `/resume`, `/memory`. `/build` is new; the reference suite has no dedicated implementation skill. See [PROPOSED-SYSTEM-ARCHITECTURE.md §3](PROPOSED-SYSTEM-ARCHITECTURE.md#3-skill-taxonomy).

---

## 2. Per-skill profiles

The profiles use a fixed field order:

1. Purpose
2. Triggers
3. Inputs
4. Outputs
5. Tools/deps
6. Workflow
7. Safety gates
8. State
9. Artifacts
10. External integrations
11. Strengths
12. Weaknesses
13. Missing
14. Improvements
15. Proposed equivalent
16. Separate or merge

### 2.1 Cross-cutting facts

These apply to every skill below and are not repeated in each profile.

- **Shared preamble.** Almost every skill carries the ~400-line preamble; in `review/SKILL.md` it is lines 26-406. It:
  - runs `bin/<ref>-skill-start`, which prints STATUS lines: SESSION_KIND, CONDUCTOR_SESSION, PROACTIVE, SKILL_PREFIX, EXPLAIN_LEVEL, QUESTION_TUNING
  - defines the AskUserQuestion "decision brief" format: D<N>, ELI10, Recommendation, Completeness score, and ✅/❌ bullets of at least 40 characters
  - covers plan-mode rules, the Model-Specific Behavioral Patch, voice rules (a banned-word list, no em dashes), Context Recovery, the "Boil the Ocean" completeness principle, the Confusion Protocol, "Claimed Limitations Need Evidence", Context Health, Question Tuning, Repo Ownership, Search Before Building, and Operational Self-Improvement
  - ends with the Completion Status Protocol (DONE, DONE_WITH_CONCERNS, BLOCKED), Telemetry (run last), and the Plan Status Footer
- **Frontmatter cut.** The generator cuts `description:` down to its first sentence plus "(reference suite)". The trigger prose moves to a `## When to invoke this skill` body section.
- **allowed-tools mismatch.** Several skills instruct Write or Edit that their `allowed-tools` does not grant:
  - plan-ceo-review: no Write or Edit
  - plan-eng-review: no Edit
  - plan-design-review, plan-devex-review, devex-review: no Write
  - spec: no Write
  - ios-design-review: no Write
  - ios-clean: no Write

  These skills fall back to Bash heredocs or rely on the host not enforcing the list.
- **Platform bias.** macOS and zsh assumptions recur: `setopt`, `open`, `lsof`, `date -jf`, `shasum`, `/tmp` paths, Cmd-key instructions, and Aside (macOS 15+ only).

### 2.2 Platform & routing

#### 1. `<ref>` (root router): `./SKILL.md.tmpl`, `./<ref>/llms.txt`
| Field | Detail |
|---|---|
| Purpose | Routes any the reference suite request to the right skill. `<ref>/llms.txt` (175 lines) is a capability index of every skill, browse command and design command. |
| Triggers | "the reference suite", "which the reference suite skill", "route this with the reference suite"; used when the reference suite is invoked without a specific skill. |
| Inputs | The user request; the `PROACTIVE` flag from `<ref>-config`. |
| Outputs | A Skill-tool invocation of the target skill, or a direct answer. Telemetry: `<ref>-telemetry-log --event-type route --outcome browse\|routed\|direct`. |
| Tools/deps | Bash, Read, AUQ; `<ref>-config`; `<ref>-telemetry-log`. |
| Workflow | 1. Browser, QA, screenshot and dogfood requests go to `/browse` (Aside first). 2. Otherwise match about 40 prose pattern→skill rules; `{{OUTSIDE_VOICE_ROUTING}}` is injected for codex and claude-code. 3. "When in doubt, invoke the skill." |
| Safety gates | None. With `PROACTIVE=false` it only runs explicitly named skills. |
| State | `proactive` in `~/.<ref>/config.yaml`. |
| Artifacts | Telemetry rows. |
| External | None. |
| Strengths | Explicit routes for safety and memory skills, each with a caveat for when it applies. The proactive toggle is a single, simple control. |
| Weaknesses | Routing is prose pattern-matching by the LLM, and nothing measures its accuracy at the router level (a routing E2E test exists in `test/skill-routing-e2e.test.ts`; its scope is NOT VERIFIED). No routes for setup-gbrain, sync-gbrain or the ios-* skills. `llms.txt` links to `<ref>/SKILL.md`, which does not exist in `<ref>/`. The routing table is hand-maintained, so it drifts from each skill's `triggers:`. |
| Missing | Confidence scoring, disambiguation (careful vs guard), multi-skill composition ("plan then review"), and a routing trace. |
| Improvements | Generate the routing table from skill manifests; add a scored router with a trace; add a regression corpus of utterances. |
| Proposed equivalent | `core.router` (deterministic manifest match, then LLM tie-break, then a recorded trace). |
| Separate / merge | **SYSTEM**: not a user skill. |

#### 57. `<ref>-upgrade`: `<ref>-upgrade/` + `migrations/` (14 scripts)
| Field | Detail |
|---|---|
| Purpose | Upgrades the install, runs version migrations, stops a stale browse daemon and summarizes what changed. Its Step 1 is also the inline flow a preamble runs when it sees `UPGRADE_AVAILABLE`. |
| Triggers | "upgrade the reference suite", "update the reference suite", voice "gee stack upgrade", and the preamble's `UPGRADE_AVAILABLE` signal. |
| Inputs | `<REF>_AUTO_UPGRADE` or `auto_upgrade` config; an AUQ answer (Yes / Always / Not now / Never); `bin/<ref>-update-check --force`. |
| Outputs | An upgraded install; `~/.<ref>/just-upgraded-from`; cleared snooze markers; a 5-7 bullet "What's new" from CHANGELOG.md. |
| Tools/deps | git, `./setup`, `sort -V`, curl (daemon health), `browse/dist/browse stop`. |
| Workflow | 1. Auto-upgrade or ask; snooze backoff 24h, then 48h, then 1 week. 2. Detect install type: global-git, local-git, vendored, or vendored-global. 3. Save the old version. 4. git installs: restore generated files, `git pull --ff-only --autostash`, `./setup`; fallback `reset --hard origin/main`, gated by an AUQ listing dirty files and unpushed commits. Vendored installs: temp clone and swap, with a `.bak` restore. 5. Step 4.5: team-mode vendored cleanup. 6. Step 4.75: run `migrations/v*.sh` newer than the old version. 7. Step 4.8: stop the daemon only if it is healthy and idle. |
| Safety gates | Destructive reset needs an explicit "A"; stale-`.bak` abort; never claim a restore that didn't happen; never kill a busy daemon. |
| State | `~/.<ref>/config.yaml`, `update-snoozed`, `just-upgraded-from`, `<repo>/.<ref>/browse.json`. |
| Artifacts | Markers; a `.gitignore` edit in team mode. |
| External | GitHub (the reference skill suite main). |
| Strengths | Careful gating of destructive steps; handles poisoned-stash and render-dirt cases; ordered migrations. |
| Weaknesses | It pulls `origin/main` HEAD and executes `./setup` and migrations from it, with no tag or signature pinning. Migration failures are swallowed as warnings, and no ledger records which migrations ran. `OLD_VERSION=unknown` skips every migration. It hardcodes `~/.<ref>` instead of the state root. It needs `sort -V`. |
| Missing | Rollback, dry-run, a migration ledger, release channels. |
| Improvements | Signed release tags, a channel (stable, beta), `migrations-applied.jsonl`, a fail-stop on migration error, and a `doctor` command. |
| Proposed equivalent | Installation/update system (`sys.install`), plus a `doctor` subcommand. |
| Separate / merge | **SYSTEM**. |

#### 58. `contrib/add-host` (`<ref>-contrib-add-host`)
| Field | Detail |
|---|---|
| Purpose | Contributor guide for adding a new agent-host config (`hosts/<name>.ts`). Existing hosts: claude, codex, cursor, factory, gbrain, hermes, kiro, openclaw, opencode, slate. |
| Triggers | "add new host", "create host config", "contribute new agent host". |
| Inputs | Host name, CLI binary, skill directories, supported frontmatter, tool-name rewrites. |
| Outputs | `hosts/<name>.ts` (modeled on `hosts/opencode.ts`), a registration in `hosts/index.ts`, a `.gitignore` entry, and generated `.<name>/skills/<ref>-*/SKILL.md`. |
| Tools/deps | `bun run gen:skill-docs --host <name>`, `bun test test/gen-skill-docs.test.ts`. |
| Workflow | Six manual steps. |
| Safety gates | None. The "no `.claude/skills` path leakage" check is manual. |
| State | Repo files. |
| Artifacts | Host config and generated skills. |
| External | None. |
| Strengths | Short; parameterized tests auto-include a new host. |
| Weaknesses | No allowed-tools, version or preamble. How it is excluded from end-user installs is NOT VERIFIED. It does not cover porting hooks (careful/freeze) to hosts without PreToolUse, so safety silently degrades to prose. |
| Missing | A host capability matrix (hooks, subagents, AUQ) with warnings when a capability is absent. |
| Improvements | Declare the capability in the adapter and degrade features explicitly. |
| Proposed equivalent | Adapter SDK scaffold (`sdk new-adapter host`). |
| Separate / merge | **SYSTEM (dev tool)**. |

### 2.3 Think / Discover

#### 2. `office-hours`: `office-hours/`
| Field | Detail |
|---|---|
| Purpose | YC-style ideation partner that produces a design doc, never code. Startup mode asks six forcing questions; Builder mode is a brainstorm. |
| Triggers | "brainstorm this", "I have an idea", "help me think through", "office hours", "is this worth building"; proactive when a new idea appears before any code exists. |
| Inputs | CLAUDE.md, TODOS.md, `git log -30`, diff stat; prior `~/.<ref>/projects/$SLUG/*-design-*.md`; brain-cache digests; gbrain `context_queries`; `<ref>-builder-profile` tier; DESIGN.md. |
| Outputs | Premises list; 2-3 approaches (minimal viable vs ideal architecture); an approved design doc; a tiered closing (YC pitch, then welcome_back, regular, inner_circle); founder resources from a hard-coded pool of 34 URLs; a next-skill handoff. |
| Tools/deps | Bash, Read, Grep, Glob, Write, Edit, AUQ, WebSearch; `<ref>-developer-profile`, `<ref>-builder-profile`, `<ref>-office-hours-review`, `<ref>-redact`; Aside; Codex; `$D`. |
| Workflow | 1. Phase 1: context and goal, mapped to a mode. 2. Phase 2A: stage-routed questions (Startup). Phase 2B: generative questions (Builder). 3. 2.5 related designs; 2.75 landscape search behind a privacy gate; 3 premise challenge; 3.5 cold read by Codex or a subagent. 4. Phase 4: alternatives, then STOP; mockup via `$D` or an HTML sketch. 5. 4.5 founder-signal count. 6. Phase 5: design doc plus a spec review loop (at most 3 adversarial rounds). 7. Phase 6: handoff. |
| Safety gates | HARD GATE: no implementation. One question at a time with a STOP. STOP before the doc until an approach is approved. Privacy gate on web search. `<ref>-redact` before the repo copy (exit 3 blocks). Persistent opt-out of founder resources. |
| State | `~/.<ref>/developer-profile.json`, `builder-journey.md`, `analytics/{skill-usage,spec-review,eureka}.jsonl`. |
| Artifacts | `~/.<ref>/projects/{slug}/{user}-{branch}-design-{datetime}.md` (with `Supersedes:` lineage); a repo copy at `docs/designs/{topic}.md`; review rounds; `designs/mockup-*/`. |
| External | OpenAI (Codex, `$D`), WebSearch/Aside, gbrain, `open` of the YC apply URL. |
| Strengths | Strong anti-sycophancy rules; stage-routed questioning; mandatory alternatives; redaction before the repo write; mechanical convergence rules for the review loop. |
| Weaknesses | 1257 lines plus a 654-line handoff section. Promotional YC/Garry content (personal plea, `open` of the apply URL) is off-mission for enterprise. `open` is macOS-only. Profile file names drift (`builder-profile.jsonl` vs `developer-profile.json`). Two redundant visual paths. |
| Missing | Enterprise or internal-product framing; export to an issue tracker (that is `/spec`). |
| Improvements | A neutral, configurable closing; one visual path; a cross-platform opener; one profile file. |
| Proposed equivalent | `/discover`: problem framing, premises, alternatives, then a Design Brief artifact. |
| Separate / merge | **MERGE → `/discover`** (together with `spec`). |

#### 3. `spec`: `spec/`
| Field | Detail |
|---|---|
| Purpose | Interrogates vague intent through five strict phases into a backlog-ready GitHub issue, archives it locally, and optionally spawns a `claude -p` agent in a new worktree. |
| Triggers | "spec this out", "file an issue", "write up a ticket", "make this a github issue". |
| Inputs | Flags `--dedupe`, `--no-gate`, `--audit`, `--execute`, `--file-only`, `--plan-file`, `--sync-archive`; codebase evidence (a Read is mandatory before Phase 3); `gh issue list` titles passed through `<ref>-issue-guard`; `<REF>_PLAN_MODE`. |
| Outputs | A draft issue built from 14 quality standards and three templates (Standard, Epic, Audit); an outside quality score (≥7 passes); a filed issue URL. |
| Tools/deps | Bash, Read, Grep, Glob, AUQ (**no Write**); `gh`, `jq`, Codex, `lib/redact-*.ts`, `<ref>-decision-log`, `git worktree`, `claude -p`. |
| Workflow | 1. Phase 1: why, plus dedupe. 2. Phase 2: scope. 3. Phase 3: code-grounded technical interrogation. 4. Phase 4: draft loop. 5. 4.5a semantic review (people, NDA, strategy); 4.5b fail-closed regex redaction; outside score (at most 3 dispatches). 6. Phase 5: plan-mode-aware dispatch, then file the issue, archive, and spawn (behind a dirty-tree gate, a TOCTOU re-check, a SHA pin and a final confirm). |
| Safety gates | Never produce an issue on the first message. Redaction cannot be disabled; a HIGH hit blocks every sink (tested in `spec-quality-gate-secret-sink.test.ts`). On public repos semantic flags cannot be acknowledged away. Dirty-tree AUQ. Stash is never auto-restored. |
| State | `$<REF>_STATE_ROOT/projects/$SLUG/specs/`. |
| Artifacts | `specs/{ts}-{pid}-{slug}.md` (frontmatter `spec_issue_number`, `ttfc_ms`, `tthw_ms`); a GitHub issue; worktree `../worktrees/{slug}-{pid}` on branch `spec/{slug}-{pid}`. |
| External | GitHub, Codex, Claude CLI. |
| Strengths | The best-defended output-sink pipeline in the reference suite (redaction re-run per sink, content-free audit log); concrete issue-quality standards; `/ship` auto-closes the linked issue only when the spec is fully delivered. |
| Weaknesses | In execution mode the default is to spawn a background `claude -p`, a surprising side effect. A failed worktree create falls back to spawning in the current directory. The spawn uses `&` with no lifecycle tracking. GitHub only. The TTHW surfacing in `/retro` is not implemented. |
| Missing | Jira or Linear adapters; child-issue filing for epics; editing a filed issue. |
| Improvements | Make the spawn opt-in and tracked; a tracker adapter; clean up worktree and stash. |
| Proposed equivalent | `/discover --to-issue` (Spec artifact, then tracker adapter), plus a hand-off to `/build` through the delegation engine (tracked, not `&`). |
| Separate / merge | **MERGE → `/discover`**. |

### 2.4 Plan

#### 4. `plan-ceo-review`: `plan-ceo-review/`
| Field | Detail |
|---|---|
| Purpose | Founder-mode plan review in four modes (EXPANSION, SELECTIVE, HOLD, REDUCTION), followed by 11 review sections. |
| Triggers | "think bigger", "expand scope", "strategy review", "rethink this", "is this ambitious enough"; proactive when a plan's ambition is questioned. |
| Inputs | git log, diff and stash; TODO/FIXME grep; 30-day churn; CLAUDE.md, TODOS.md; the office-hours design doc; CEO handoff notes; learnings; gbrain; web research. |
| Outputs | A six-column decision ledger; Error & Rescue and Failure Modes registries; six required diagram types; NOT-in-scope, What-exists and dream-state delta; Implementation Tasks; the MEGA PLAN REVIEW summary; `## <REF> REVIEW REPORT`. |
| Tools/deps | Read, Grep, Glob, Bash, AUQ, WebSearch (**no Write or Edit**, although the text requires them); Codex; `<ref>-review-log`, `<ref>-decision-log`. |
| Workflow | 1. Pre-review audit. 2. Step 0A-0I: premise, leverage, dream state, decision procedure (save, Read back, ask, amend), mode, 10x check, platonic ideal, delight scan, CEO plan plus spec loop, temporal interrogation. 3. Sections 1-11: architecture, errors, security, edges, quality, tests, performance, observability, deploy, trajectory, design. 4. Closing: outside voice, TODOs, approval readiness, outputs, log, dashboard. |
| Safety gates | "Review only; do not change code." Every scope change needs its own approval. STOP per question. A failed save blocks completion. Archiving needs approval. |
| State | `ceo-plans/`, `reviews.jsonl`, `decisions.active.json`. |
| Artifacts | `ceo-plans/{date}-{slug}.md` (ACTIVE, then PROMOTED); optional `docs/designs/`; `tasks-ceo-review-*.jsonl`; TODOS entries. |
| External | Codex, WebSearch/Aside, gbrain. |
| Strengths | Exhaustive, failure-oriented checklist (four-path data flow, async ordering, LLM failure classes); clear mode semantics; strict approval provenance. |
| Weaknesses | About 2.5k lines per run. Sections 1, 2, 5, 6 and 7 duplicate plan-eng-review. Section 11 duplicates plan-design-review. Heavy question volume. Tool list mismatch. Despite the "CEO" name there is almost no business, market or cost analysis. |
| Missing | Market sizing, pricing and cost; a strategy-only fast path. |
| Improvements | Keep only the product and strategy dimensions; delegate engineering checks to the eng lens; add business metrics. |
| Proposed equivalent | `/plan` lens **`product`** (scope mode, premise, leverage, success metrics, cost), sharing one Findings contract. |
| Separate / merge | **MERGE → `/plan`**. |

#### 5. `plan-eng-review`: `plan-eng-review/`
| Field | Detail |
|---|---|
| Purpose | Engineering-manager lock-in of architecture, quality, tests and performance. It is the **only review that gates `/ship`** (`skip_eng_review` config). |
| Triggers | "review the architecture", "engineering review", "lock in the plan"; voice "tech review"; proactive before coding starts. |
| Inputs | A target from the Scope gate (branch diff, plan doc or path); design doc; learnings; `git log --grep=revert`; TODOS.md; web research. |
| Outputs | Scope Challenge; Sections 1-4 (at most 8 issues each); test diagram; Test Plan artifact; failure modes; worktree parallelization lanes; P1/P2/P3 tasks with human and CC effort; the REVIEW REPORT. |
| Tools/deps | Read, Write, Grep, Glob, AUQ, Bash, WebSearch (**no Edit**); Codex (default on); `<ref>-review-log` (required); `jq`. |
| Workflow | 1. Scope gate runs **before** the preamble. 2. Preamble, design-doc check, prerequisite offer. 3. Report file selection. 4. Scope Challenge: STOP at 8+ files or 2+ new classes. 5. Architecture, code quality, tests (framework detection, E2E matrix, REGRESSION RULE), performance. 6. Outside voice, TODOs, finish. |
| Safety gates | Hard-STOP scope gate; a six-step decision procedure (save, Read back, ask, STOP, apply, Read back); "do not build features"; blocked if the report can't persist; the review log is mandatory. |
| State | `reviews.jsonl`, decisions, legacy test-plan paths consumed by `/qa`. |
| Artifacts | `$BRANCH-eng-review-{ts}.md`; `{user}-{branch}-eng-review-test-plan-{ts}.md`; `tasks-eng-review-*.jsonl`; TODOS. |
| External | Codex, WebSearch/Aside, gbrain. |
| Strengths | Tightest template (192 lines); explicit parallel-lane output; a test-plan hand-off to QA; independent-choice splitting. |
| Weaknesses | 725 lines plus a 1443-line section (the largest section in the reference suite). Read-back per question adds many tool calls. zsh `setopt` shim. Missing Edit. |
| Missing | Capacity and cost estimates, migration dry-run, deeper security (left to `/cso`). |
| Improvements | A lite mode for small diffs; structured findings. |
| Proposed equivalent | `/plan` lens **`engineering`**. It stays the default gate lens and emits a `TestPlan` artifact consumed by `/qa` and `/ship`. |
| Separate / merge | **MERGE → `/plan`**. |

#### 6. `plan-design-review`: `plan-design-review/`
| Field | Detail |
|---|---|
| Purpose | Designer's-eye review of a plan: seven dimensions rated 0-10, with missing design decisions added to the plan and AI mockups generated by default. |
| Triggers | "review the design plan", "design critique", "review ux plan"; proactive for plans with UI. |
| Inputs | Scope-gate target; plan; DESIGN.md (YAML tokens); TODOS; `reviews.jsonl`; brain digests. |
| Outputs | Initial rating; Passes 1-6 scored (IA, states, journey, AI slop, design system, responsive/a11y); Pass 7 decision register; overall score = the lowest pass score; approved mockups; REPORT. |
| Tools/deps | Read, Edit, Grep, Glob, Bash, AUQ (**no Write**); `$D` (OpenAI); Codex plus subagent outside voices; `open`/`xdg-open`. |
| Workflow | 1. Scope gate, preamble, audit. 2. UI-scope detection (exit early if no UI). 3. Design setup. 4. Step 0 focus question. 5. Step 0.5: `$D variants --count 3`, a comparison board served in the background, `feedback.json`. 6. Outside voices; seven passes; TODOs; log. |
| Safety gates | No code changes; one issue per AUQ; never edit first; a DESIGN.md token match isn't approval. |
| State | `designs/<screen>-YYYYMMDD/`. |
| Artifacts | variant PNGs, `design-board.html`, `feedback.json`, `approved.json`; plan edits; review log with `initial_score`, `overall_score`. |
| External | OpenAI (gpt-4o image and vision), Codex, gbrain. |
| Strengths | Mockups make gaps concrete; every rating must trace to a principle; carries decisions across passes. |
| Weaknesses | **Generates mockups without asking, spending OpenAI credits.** 1188 + 695 lines. Overlaps CEO Section 11 and design-review. UI-scope detection is duplicated in autoplan. |
| Missing | Cost cap or confirmation; Figma input. |
| Improvements | Budget gate before paid generation; one shared UI-scope detector. |
| Proposed equivalent | `/plan` lens **`design`** (calls the `/design explore` specialist only under a budget). |
| Separate / merge | **MERGE → `/plan`**. |

#### 7. `plan-devex-review`: `plan-devex-review/`
| Field | Detail |
|---|---|
| Purpose | DX review of plans for APIs, CLIs, SDKs, docs and Claude skills. It runs persona and benchmark investigation, then scores eight passes and sets a TTHW (time to hello world) target. |
| Triggers | "DX review", "developer experience review", "API design review"; six voice triggers; proactive for developer-facing plans. |
| Inputs | git vs `main` (hardcoded); plan; README; docs; package.json; CHANGELOG; DX artifact grep; prior DX reviews; `dx-hall-of-fame.md`. |
| Outputs | Persona card, empathy narrative, competitive benchmark, magical-moment spec, six-stage journey map, confusion report, DX scorecard (eight dimensions plus TTHW), checklist, tasks. |
| Tools/deps | Read, Edit, Grep, Glob, Bash, AUQ, WebSearch (**no Write**); Codex; Aside. |
| Workflow | 1. Audit and product-type auto-detect. 2. Step 0A-0G (persona, empathy, benchmark plus target gate, magical moment, mode EXPANSION/POLISH/TRIAGE, journey, roleplay). 3. Trend check. 4. Passes 1-8. 5. Skill checklist appendix; outside voice. |
| Safety gates | No code changes; a four-step decision gate; no plan edit until the TTHW target is answered; STOPs at 0A-0E. |
| State | Review log with `tthw_current`, `tthw_target`, `persona`, `competitive_tier` (the baseline for devex-review). |
| Artifacts | Plan edits, tasks JSONL, review log. |
| External | WebSearch/Aside, Codex, gbrain. |
| Strengths | Evidence discipline (observed vs predicted); a plan-to-live "boomerang" contract. |
| Weaknesses | 1103 + 1022 lines; at least five mandatory STOPs before any score; benchmarks are often "estimated"; hardcodes the `main` base. |
| Missing | Multi-persona support. |
| Improvements | Batch low-stakes confirmations; use the detected base branch. |
| Proposed equivalent | `/plan` lens **`dx`**. |
| Separate / merge | **MERGE → `/plan`**. |

#### 8. `autoplan`: `autoplan/`
| Field | Detail |
|---|---|
| Purpose | Runs the CEO, Design (if UI), DX (if developer-facing) and Eng reviews in sequence, reading them from disk, and auto-answers intermediate questions using six decision principles. Taste calls and "User Challenges" go to one final gate. |
| Triggers | "autoplan", "auto review", "run all reviews", "make the decisions for me". |
| Inputs | Source and active plan; design doc; UI scope (a grep that needs 2+ view terms); DX scope via `<ref>-autoplan-snapshot scope`; the four review skills and their sections, read with recorded ranges. |
| Outputs | An amended plan with `## Implementation plan` and `## Review record`; accepted-obligation blocks; Decision Audit Trail; per-phase consensus tables (native vs outside voice); a Final Approval Gate. |
| Tools/deps | Bash, Read, Write, Edit, Glob, Grep, WebSearch, AUQ; **`hooks.PreToolUse` on Read and Agent**, which runs `autoplan/bin/phase-publication-hook(.ts)` (487 lines, a "native Read barrier"); `<ref>-autoplan-snapshot.ts`; Codex; native subagents. |
| Workflow | 1. Phase 0: restore point. 2. Phase 0.5: outside preflight. 3. Phase 1: CEO (SELECTIVE forced). 4. Phase 2: Design. 5. Phase 2.5: DX (POLISH). 6. Phase 3: Eng. 7. After each phase, `phase-close` (packet, semantic verify). 8. Pre-gate repair (at most 2). 9. Phase 4 gate with options A/B/B2/C/D/E (rerun cap of 3). |
| Safety gates | Never auto-decides User Challenges; strict phase order enforced by the hook; restore point before changes; a missing outside voice is recorded as N/A, never CONFIRMED; reviewers are barred from reading SKILL.md. |
| State | `{BRANCH}-autoplan-restore-{ts}.md`; snapshot directories; `tasks-*.jsonl`. |
| Artifacts | Restore file, `snapshot.json`, close packets, test plan, review-log rows (`via:"autoplan"`). |
| External | Codex, WebSearch/Aside, OpenAI via `$D`. |
| Strengths | The most robust orchestration in the reference suite: hash-bound snapshots, compaction recovery, hook-enforced phase boundaries, and a clear Mechanical / Taste / User-Challenge taxonomy. Heavily tested (many `autoplan-*.test.ts` files). |
| Weaknesses | Loads about 8-9k instruction lines plus a native subagent and Codex per phase (720 s outside timeout). The hook couples to Claude Code transcript internals (`lib/claude-public-transcript`). Internal drift: the eng test-plan path differs from plan-eng-review's; its DX phase says 9 stages while plan-devex has 6; the audit-trail header has 7 columns but its separator has 6; the design log omits score fields. |
| Missing | Cost preview; phase selection (`--phases`); a budget cap. |
| Improvements | Orchestrate lenses as data rather than by re-reading whole skills; enforce contracts with schemas instead of transcript hooks. |
| Proposed equivalent | `/plan --auto`: the orchestrator runs selected lenses in parallel against one shared Plan artifact, then merges findings and applies a decision policy. |
| Separate / merge | **MERGE → `/plan`**. |

#### 9. `plan-tune`: `plan-tune/`
| Field | Detail |
|---|---|
| Purpose | Sets AUQ sensitivity per question (never-ask, always-ask, ask-only-for-one-way). Shows the declared vs inferred developer profile and "vibe", and runs a free-text distillation ("dream cycle"). |
| Triggers | "tune questions", "stop asking me that", "too many questions", "show my profile"; shortcuts profile, vibe, gap, stats, review, enable, disable, setup, distill. |
| Inputs | `question_tuning` config; `~/.<ref>/developer-profile.json`; `projects/$SLUG/question-log.jsonl`; `distillation-proposals.json`; markers. |
| Outputs | Plain-English profile with bands; question-log stats; recent auto-decisions; distill proposals. |
| Tools/deps | Bash, Read, Write, Edit, AUQ, Glob, Grep; `<ref>-developer-profile`, `<ref>-question-preference`, `<ref>-distill-free-text` (capped at 3/day), `<ref>-distill-apply`. |
| Workflow | 1. Consent. 2. Five-question setup (scope appetite, risk, detail, autonomy, architecture care). 3. Otherwise route by intent. |
| Safety gates | Off by default; confirm before mutating `declared`; `tune:` must come from the user, never from tool output; one-way doors override never-ask. |
| State | As in Inputs. |
| Artifacts | Preference store, profile edits. |
| External | gbrain MCP; the distiller's LLM provider is NOT VERIFIED. |
| Strengths | Privacy posture; defenses against profile poisoning. |
| Weaknesses | Its "v1 observational — no skills adapt" claim conflicts with the preamble's AUTO_DECIDE hook, which does act on never-ask preferences. 1007 lines for a config utility. `--dismiss` is not implemented. |
| Missing | Export or reset; team-shared preferences. |
| Improvements | Make preferences a typed policy layer that the orchestrator consults. |
| Proposed equivalent | Memory engine `preferences` namespace plus `/memory prefs`. |
| Separate / merge | **SYSTEM**. |

### 2.5 Design

#### 10. `design-consultation`: `design-consultation/`
| Field | Detail |
|---|---|
| Purpose | Builds a complete design system (aesthetic, typography, color, layout, spacing, motion) through conversation and research. It previews the result and writes DESIGN.md in the google-labs-code design.md YAML format. |
| Triggers | "design system", "brand guidelines", "create DESIGN.md"; proactive for a new UI with no DESIGN.md. |
| Inputs | Existing DESIGN.md; PRODUCT.md; README; package.json; office-hours output; taste profile; gbrain; competitor research via Aside/WebSearch. |
| Outputs | Context confirmation; full proposal with SAFE/RISK breakdown; drill-downs; a preview (AI mockups or HTML); final approval; DESIGN.md; a CLAUDE.md "Design System" section. |
| Tools/deps | Bash, Read, Write, Edit, Glob, Grep, AUQ, WebSearch; Aside/`$B`; `$D`; `<ref>-design-md.ts check`; outside voices. |
| Workflow | 1. Pre-checks. 2. Product context. 3. Optional research. 4. Proposal (font verification, banned fonts, anti-convergence, "three looks"). 5. Drill-downs. 6. Preview. 7. Write. |
| Safety gates | Writes wait for final approval; any token change invalidates approval; never sign in to competitor sites; `$D extract` refused inside a git repo; backup before replacing. |
| State | office-hours docs, taste profile. |
| Artifacts | `DESIGN.md`, a CLAUDE.md append, `designs/design-system-*/`, `/tmp/design-consultation-preview-*.html`. |
| External | OpenAI, Codex, Aside, Google Fonts/Fontshare, gbrain; derived from pbakaus/impeccable (Apache-2.0, see NOTICE.md). |
| Strengths | Real anti-slop discipline; SAFE vs RISK framing; a standard token format. |
| Weaknesses | Writes CLAUDE.md unconditionally after approval; `/tmp` path; one of **three** DESIGN.md writers (with design-html and design-review). |
| Missing | Import from Figma or CSS tokens; first-class light and dark token pairs. |
| Improvements | Make it the single owner of DESIGN.md. |
| Proposed equivalent | `/design system`: the sole writer of the `DesignSystem` artifact. |
| Separate / merge | **MERGE → `/design`**. |

#### 11. `design-shotgun`: `design-shotgun/`
| Field | Detail |
|---|---|
| Purpose | Generates N AI mockups in parallel (default 3, up to 8), shows a comparison board, collects structured feedback and iterates. |
| Triggers | "explore designs", "show me options", "design variants", "I don't like how this looks". |
| Inputs | Prior `approved.json`; DESIGN.md; PRODUCT.md; office-hours docs; a `localhost:3000` probe; `taste-profile.json`; `$_DESIGN_BRIEF` when another skill calls it. |
| Outputs | Concepts, variant PNGs, board, feedback summary, `approved.json`. |
| Tools/deps | Bash, Read, Glob, Grep, Agent, AUQ (no Write); `$D generate/check/evolve/compare`; parallel subagents; `<ref>-taste-update`. |
| Workflow | 1. Session detection. 2. Context (five dimensions). 3. Taste memory. 4. Concepts with anti-convergence. 5. **Confirm spend.** 6. Parallel generation (to /tmp, then cp, with 429 retries). 7. Board loop. 8. Save. |
| Safety gates | **The only design skill that confirms API spend.** Never guess which URL to evolve; confirm feedback before saving. |
| State | `designs/`, `taste-profile.json`. |
| Artifacts | `designs/<screen>-*/{variant-*.png, design-board.html, feedback.json, approved.json}`. |
| External | OpenAI gpt-4o image generation. |
| Strengths | Explicit spend gate; parallel generation pattern; persistent taste learning. |
| Weaknesses | The shared `/tmp/variant-{letter}.png` path collides across concurrent sessions. The board loop is duplicated in three other skills. Only probes port 3000. |
| Missing | Per-variant cost estimate; Figma export. |
| Improvements | Unique temp paths; show cost in the confirmation. |
| Proposed equivalent | `/design explore` (a specialist that plan, discover and design call through a contract). |
| Separate / merge | **MERGE → `/design`**. |

#### 12. `design-html`: `design-html/`
| Field | Detail |
|---|---|
| Purpose | Turns an approved mockup, CEO plan or description into production HTML, or a React, Svelte or Vue component, built on Pretext computed layout. |
| Triggers | "finalize this design", "turn this into HTML", "build me a page", "implement this design". |
| Inputs | CEO plans; `approved.json`, variants and `finalized.html`; DESIGN.md; framework detection; `vendor/pretext.js`. |
| Outputs | Implementation spec, tier choice, HTML, screenshots at three viewports, a refinement loop (at most 10 rounds), `finalized.json`. |
| Tools/deps | Bash, Read, Write, Edit, Glob, Grep, Agent, AUQ; `$D prompt`; `<ref>-render.ts`; `python3 -m http.server`; `lsof`; the impeccable detector (a checksum-pinned download); `esm.sh`. |
| Workflow | 1. Setup and detector. 2. Input routing. 3. Analysis. 4. Tier routing (five Pretext tiers). 5. Framework detection. 6. Generation with a slop blacklist. 7. Live server. 8. Detector gate and screenshots. 9. Refine. 10. Token extraction. |
| Safety gates | Surgical edits only in the loop; one-time detector install question; a single detector fix pass. |
| State | `designs/`. |
| Artifacts | `finalized.{html,tsx,svelte,vue}`, `finalized.json`, `/tmp/<ref>-verify-*.jpg`, `~/.<ref>/security/egress.jsonl`. |
| External | OpenAI, esm.sh, npm, GitHub releases. |
| Strengths | Clear input routing; real verification at 375, 768 and 1440 px; an id-tagged anti-slop blacklist. |
| Weaknesses | **Runs `npm/bun/pnpm add` without confirmation.** macOS-centric (`lsof`, `open`, Cmd+R). Output goes to `~/.<ref>`, not the repo. Locked into Pretext even when plain CSS would do. One page per run. |
| Missing | Multi-page runs; integration with existing components; automated a11y (axe). |
| Improvements | Confirm dependency installs; a CSS-only tier; write into the repo with a diff. |
| Proposed equivalent | `/design build` (emits a code change set that flows through `/build` verification). |
| Separate / merge | **MERGE → `/design`**. |

#### 13. `design-review`: `design-review/`
| Field | Detail |
|---|---|
| Purpose | Live-site visual QA: an audit followed by a source-code fix loop with atomic commits and before/after screenshots. |
| Triggers | "audit the design", "visual QA", "design polish", "fix design issues". Preamble tier 4, the heaviest. |
| Inputs | A URL (diff-aware mode when none is given on a feature branch); `--quick`, `--deep`, `--regression`, `--keep-dom`; DESIGN.md; `design-baseline.json`; the user's signed-in Aside session. |
| Outputs | A six-phase audit (80-item, 10-category checklist); Design Score and AI Slop Score (A-F); triage; fixes; re-audit; report; TODOS. |
| Tools/deps | Bash, Read, Write, Edit, Glob, Grep, AUQ, WebSearch; Aside `repl`; `$B`; `$D`; detector; test bootstrap; outside voices; git. |
| Workflow | 1. Setup (clean-tree gate). 2. Phases 1-6 audit. 3. Outside voices. 4. Triage. 5. Fix loop: locate, target mockup, minimal CSS-first fix, commit `style(design): FINDING-NNN`, re-test, classify. 6. Final audit. 7. Report. 8. TODOS. |
| Safety gates | Dirty tree → STOP; one commit per fix; revert on regression; risk heuristic above 20% → STOP; hard cap of 30 fixes; never touch CI or existing tests. |
| State | `designs/design-audit-*/`. |
| Artifacts | `design-audit-{domain}.md`, screenshots, `design-baseline.json`, `dom/$RUN_ID/`, commits. |
| External | Aside, OpenAI, Codex, GitHub releases. |
| Strengths | The most operationally safe fix loop in the reference suite; dual scoring with a regression baseline; diff-aware mode. |
| Weaknesses | **1930 generated lines, the largest SKILL.md.** Dirty-tree option A commits all current changes, bundling unrelated work. It writes no audit row to the review log, so the dashboard's Design row can't see it. Overlaps `/qa`. |
| Missing | Automated a11y engine; pixel-diff regression. |
| Improvements | Share the fix-loop engine with `/qa`; log scores; stash by default. |
| Proposed equivalent | `/design audit` (a `/qa` run with the `design` lens and the shared fix-loop engine). |
| Separate / merge | **MERGE → `/design`** (execution engine shared with `/qa`). |

### 2.6 Build / Debug

#### 17. `investigate`: `investigate/`
| Field | Detail |
|---|---|
| Purpose | Systematic debugging under an "Iron Law": no fix without a root-cause investigation. |
| Triggers | "debug this", "fix this bug", "why is this broken", "root cause"; proactive on errors, 500s, stack traces, "it was working yesterday". |
| Inputs | Symptoms; code; `git log -20 -- <files>`; TODOS; learnings search; gbrain (prior investigations). |
| Outputs | DEBUG REPORT (symptom, root cause, fix at file:line, evidence, regression test, status); the fix and a regression test (not committed). |
| Tools/deps | Bash, Read, Write, Edit, Grep, Glob, AUQ, WebSearch; **`hooks.PreToolUse` on Edit/Write runs `freeze/bin/check-freeze.sh`**; `<ref>-learnings-log`. |
| Workflow | 1. Phase 1: symptoms, code, recent changes, reproduction, hypothesis. 2. **Scope lock**: write `freeze-dir.txt`. 3. Phase 2: pattern table (race, nil, state, integration, config, cache) and a sanitized web search. 4. Phase 3: test hypotheses with temporary logs. 5. Phase 4: minimal fix, a regression test that fails before the fix and passes after, then the full suite. 6. Phase 5: verification, report, learning. |
| Safety gates | 3-strike rule (3 failed hypotheses → STOP and ask); a fix touching more than 5 files → blast-radius AUQ; "never say 'this should fix it'"; sanitize before search; freeze hook. |
| State | `freeze-dir.txt`, `learnings.jsonl`, gbrain. |
| Artifacts | Freeze file, a learning, a gbrain save. |
| External | Web search. |
| Strengths | Disciplined phases; the scope lock is enforced by a hook, not prose; the regression test is mandatory; uses memory of past fixes. |
| Weaknesses | The freeze is **never auto-removed** and persists across sessions. No time or budget limit beyond 3 strikes. The pattern table leans web/Rails. No commit step. |
| Missing | `git bisect` automation; production log and observability adapters; flaky-test handling. |
| Improvements | Scope the freeze to the session; a bisect mode; a hypothesis ledger artifact; commit the fix with its test. |
| Proposed equivalent | `/debug` (produces a Hypothesis Ledger plus a Fix change set; the verification engine gates completion). |
| Separate / merge | **KEEP** (as `/debug`; also absorbs `ios-fix`). |

### 2.7 Verify

#### 16. `review`: `review/` (+ `specialists/`, `sections/`, `checklist.md`, `greptile-triage.md`)
| Field | Detail |
|---|---|
| Purpose | Pre-landing diff review that fixes things first. It targets structural issues tests miss: SQL safety, races, LLM trust boundaries, shell injection, enum completeness. |
| Triggers | "review this PR", "code review", "check my diff"; proactive before merging; force flags `--security`, `--performance`, `--testing`, `--data-migration`, `--api-contract`, `--design`, `--all-specialists`. |
| Inputs | Diff against `git merge-base origin/<base> HEAD`, including untracked files; `review/checklist.md` (required); Greptile PR comments; TODOS; plan files (scope drift); learnings; specialist hit-rate stats (`<ref>-specialist-stats`). |
| Outputs | "Pre-Landing Review: N issues" with AUTO-FIXED and NEEDS INPUT lists; PR Quality Score = `max(0, 10 − (2·critical + 0.5·informational))`; Greptile replies; adversarial synthesis; working-tree edits (no commit). |
| Tools/deps | Bash, Read, Edit, Write, Grep, Glob, Agent, AUQ, WebSearch; `<ref>-review-log`, `<ref>-diff-scope`, `<ref>-codex-probe`; `slop:diff`; `gh`; Codex. |
| Workflow | 1. Branch check. 2. Scope drift. 3. Checklist. 4. Greptile triage. 5. Diff. 6. VERSION queue (advisory). 7. Slop scan. 8. Critical pass (CRITICAL, then INFORMATIONAL). 9. **Review Army**: specialists dispatched by diff size and signal. Testing and Maintainability run at 50+ lines. Security, Performance, Data Migration, API Contract, Design and Simplification are conditional. Red Team runs above 200 lines or on a security critical. Adaptive gating turns a specialist into a gate candidate after 0 findings in 10+ dispatches; Security and data-migration are never gated. 10. Confidence merge: 7+ shown, 5-6 with a caveat, 3-4 moved to an appendix, 1-2 suppressed. 11. Fix-First (AUTO-FIX or ASK). 12. TODOS and doc staleness. 13. **Always-on adversarial review** (a Claude subagent plus `codex exec`; `codex review` at 200+ lines). 14. Re-review, at most 3 cycles. 15. Persist. |
| Safety gates | Never commits or pushes; advisories are ASK-only; "no 'likely handled'"; nested-Codex guard (one run once burned 15M tokens); records `converged:false` after 3 cycles. |
| State | `$BRANCH-reviews.jsonl`, greptile-history, learnings. |
| Artifacts | Review-log rows only; **no report file**. |
| External | GitHub, Greptile, OpenAI Codex. |
| Strengths | Evidence rules ("cite the line"); specialist gating by hit rate; a structured JSON schema for specialists; convergence flags. |
| Weaknesses | About 4k instruction lines in total. Python-specific checklist items. The checklist still says `git diff origin/main` while the skill uses merge-base. The adversarial pass always runs, doubling cost. No report artifact. |
| Missing | Posting inline PR comments; GitLab MR triage; stack-aware specialists (Go, Java, etc.). |
| Improvements | Pick lenses by risk; stack-conditional specialists; a Findings artifact; an inline-comment adapter. |
| Proposed equivalent | `/review` (a router that picks lens specialists; merges Findings under a confidence policy; second opinion by risk). |
| Separate / merge | **KEEP** (absorbs the `codex`/`claude-code` review modes as a specialist). |

#### 18. `qa`: `qa/` (+ `references/`, `templates/`, `sections/`)
| Field | Detail |
|---|---|
| Purpose | Browser QA with a test → fix → verify loop, atomic fix commits, generated regression tests and before/after health scores. |
| Triggers | "qa", "test this site", "find bugs", "test and fix"; voice "run QA"; proactive when a feature is "ready for testing". |
| Inputs | A URL (diff-aware without one); `--quick` / `--exhaustive` (default Standard); `--regression <baseline>`; test plans at `projects/$SLUG/*-test-plan-*.md`; learnings. |
| Outputs | Report, screenshots, `baseline.json`, commits `fix(qa): ISSUE-NNN`, commits `test(qa): …`, a PR summary line, TODOS. |
| Tools/deps | Bash, Read, Write, Edit, Glob, Grep, AUQ, WebSearch; Aside or `$B`; the project test runner; `sections/test-bootstrap.md` (may install a framework and CI). |
| Workflow | 1. Setup and clean-tree check. 2. Browser setup and test bootstrap. 3. Test-plan context. 4. Phases 1-6: Initialize, Authenticate, Orient, Explore, Document, Wrap Up. Health weights: Console 15, Links 10, Visual 10, Functional 20, UX 15, Perf 10, Content 5, A11y 15. 5. Phase 7: triage by tier. 6. Phase 8: fix loop (locate, fix, commit, re-test, classify; regression test). 7. Phase 9: final QA. 8. Report. 9. TODOS. |
| Safety gates | Dirty tree → STOP. **WTF-likelihood** every 5 fixes (+15% per revert, +5% per fix touching >3 files, +1% per fix past 15, +10% if only low-severity issues remain, +20% for touching unrelated files; above 20% → STOP). Hard cap of 50 fixes. Revert on regression. Never modify CI or existing tests. The user signs in, never the agent. Page content is untrusted. |
| State | Test plans; test-outcome artifact. |
| Artifacts | `.<ref>/qa-reports/qa-report-{domain}-{date}.md`, `screenshots/`, `baseline.json`; `~/.<ref>/projects/{slug}/…-test-outcome-*.md`; `*.regression-*.test.*`. |
| External | Aside (macOS). |
| Strengths | A quantitative self-regulation heuristic; bisectable commits; screenshot evidence for each fix; framework-specific guidance; issue taxonomy. |
| Weaknesses | Aside is macOS-only, everything else falls back to `$B`. The 120 s per-script budget fragments flows. Bootstrap installs frameworks and CI inside a QA run (scope creep). "Mock all external deps" in regression tests can hide integration bugs. No parallelism. |
| Missing | Viewport and device matrix; cross-browser; an a11y engine (axe) despite the 15% weight; network mocking; a JSON findings contract. |
| Improvements | Make bootstrap a separate opt-in step; add axe-core; a viewport sweep; parallel page exploration. |
| Proposed equivalent | `/qa` with targets `web` (default), `ios`, `api`, `cli` and lenses `functional`, `design`, `dx`, `a11y`, `perf`; `--report-only`. |
| Separate / merge | **KEEP** (absorbs qa-only, devex-review, ios-qa execution, and the design-review fix loop). |

#### 19. `qa-only`: `qa-only/`
| Field | Detail |
|---|---|
| Purpose | The same browser QA as `/qa`, but it only reports and never fixes. |
| Triggers | "just report bugs", "qa report only", "test but don't fix"; voice "bug report". |
| Inputs | URL or diff-aware mode; `--quick`, `--regression`; test plans. |
| Outputs | Report with health score, screenshots and repro steps. |
| Tools/deps | Bash, Read, Write, AUQ, WebSearch. **No Edit, Grep or Glob**, which enforces the no-fix rule through the tool list. |
| Workflow | Setup; browser; the `{{QA_METHODOLOGY}}` macro (the same phases and rubric as qa); report. |
| Safety gates | Rule 11: never fix, never read source; tool restriction. |
| State | Same as qa. |
| Artifacts | Same report paths as qa. |
| External | Aside. |
| Strengths | Safe to run on production; the no-fix rule is enforced by capability, not prose; reused inline by `/ship` Step 8.1. |
| Weaknesses | **959 generated lines, more than qa's 935**, because the macro inlines everything that qa carves into sections. That means duplicated maintenance. Not reading source limits root-cause hints. |
| Missing | Tier flag; JSON findings. |
| Improvements | A mode flag, not a separate skill. |
| Proposed equivalent | `/qa --report-only` (capability-restricted tool profile `read-only`). |
| Separate / merge | **MERGE → `/qa`**. |

#### 14. `devex-review`: `devex-review/`
| Field | Detail |
|---|---|
| Purpose | Live DX audit: follows the docs, getting-started and CLI `--help`, times TTHW, screenshots errors and compares with the plan-devex-review scores (the "boomerang"). |
| Triggers | "test the DX", "DX audit", "try the onboarding", "measure onboarding time". |
| Inputs | CLAUDE.md, README and package.json for URLs and install commands; prior plan-devex rows; `dx-hall-of-fame.md`; CHANGELOG; CI config; `gh` issues. |
| Outputs | Step log; eight scores tagged TESTED, PARTIAL or INFERRED; scorecard; PLAN vs REALITY table (flags a live score more than 2 below plan); review log. |
| Tools/deps | Read, Edit, Grep, Glob, Bash, AUQ, WebSearch (**no Write**); Aside; `$B`; `gh`. |
| Workflow | 1. Step 0 target and baseline. 2. Steps 1-8 (getting started, API/CLI, errors, docs, upgrade, environment, community, measurement). 3. Scorecard. 4. Boomerang. 5. Log. |
| Safety gates | Explicit scope declaration (Aside can't test CLI install); "never guess"; AUQ before mutating form submits on non-local targets; the user signs in. |
| State | `reviews.jsonl`. |
| Artifacts | Review-log row. Screenshot location is NOT VERIFIED; no report directory is defined. |
| External | Aside, GitHub, WebSearch. |
| Strengths | Honest evidence labels; closes the plan-to-reality loop. |
| Weaknesses | **It never runs install or hello-world in a clean sandbox**, so "TTHW measured" is mostly an estimate and 4 of 8 dimensions are INFERRED. 1078 lines. No fix loop. |
| Missing | A clean-room container run; an artifact path. |
| Improvements | Run the getting-started path in an ephemeral container and time it for real. |
| Proposed equivalent | `/qa --lens dx --target cli\|api\|docs` with a sandbox adapter. |
| Separate / merge | **MERGE → `/qa`**. |

#### 30. `cso`: `cso/` (+ `sections/audit-phases.md`, `lib/cso/`)
| Field | Detail |
|---|---|
| Purpose | Chief Security Officer audit v3.0.0 built on "evidence before assurance". Default is a static daily investigation. `--comprehensive` adds isolated reproduction and up to 3 repair candidates. |
| Triggers | "security audit", "threat model", "OWASP", "CSO review"; voice "see-so". |
| Inputs | Flags `--comprehensive`, `--doctor`, `--resume`, `--replay`, `--recheck`; scope flags `--infra`, `--code`, `--skills`, `--supply-chain`, `--owasp`, `--scope`; `--diff`, `--base`, `--budget`, `--offline`. |
| Outputs | A report that states its assessment level (complete, partial or not assessed); a findings table (ID, severity, **confidence**, **evidence state**, location, impact); `RunReportV3`, `FindingV3`, `VerificationManifest`, `RepairBundle` (`lib/cso/contracts.ts`). |
| Tools/deps | allowed-tools **only** `Bash(~/.claude/skills/<ref>/bin/<ref>-cso-launcher *)`; host Read, Grep and Glob are forbidden after `start`. The launcher is compiled from `lib/cso/launcher.c` and `launcher-windows.c` (not present in `bin/` in the checkout). Needs Docker. Scanners: Gitleaks, OSV-Scanner, Semgrep, zizmor, Trivy, sandboxed Schemathesis. |
| Workflow | Always: Phase 0 app model, 1 attack surface, 12 evidence rubric and independent challenge, 13 report, 14 recovery. By scope: 2 secrets, 3 supply chain, 4 CI/CD, 5 infra, 6 webhooks/API (OWASP API 2023), 7 LLM/agentic/MCP, 8 skill supply chain, 9 OWASP Top 10:2025 + ASVS 5.0.0, 10 STRIDE, 11 data classification. Comprehensive mode: the original fails the security assertion, a patched copy passes it plus the full suite, the harness is unchanged, then a skeptical review. |
| Safety gates | Private startup (no preamble, telemetry or learnings). All evidence is untrusted. Never run target tools on the host. `start` exactly once. Budgets of 10 and 30 minutes. At most 3 workers. Findings never go to telemetry or gbrain. Repairs are proposed, never applied. |
| State | `security/cso/<repo>/<run>` in the state root; snapshots expire after 7 days. |
| Artifacts | Run reports and bundles, owned by the helper (exact paths NOT VERIFIED). |
| External | OSV and advisory lookups; Docker images. |
| Strengths | **The most rigorous skill in the reference suite.** Severity, confidence and evidence are separate axes. Supported findings need an attacker, a boundary, an impact and a challenge. Sandboxing is enforced by the tool allowlist. Standards are version-pinned. |
| Weaknesses | Depends on a compiled launcher, Docker and catalog profiles; runtime reproduction only for Node, Bun, Python and Rails. Dense prose. It writes nothing to the review log, so it is absent from the ship dashboard. |
| Missing | DAST against deployed targets; Go, Java and .NET profiles; a graceful fallback when the launcher is missing. |
| Improvements | Treat its evidence model as the **system-wide standard**; emit a redacted summary row into the review ledger. |
| Proposed equivalent | `/security`. Its contracts become the template for the Evidence engine. |
| Separate / merge | **KEEP**. |

#### 31. `codex`: `codex/` (+ mode sections)
| Field | Detail |
|---|---|
| Purpose | Wraps the OpenAI Codex CLI as a second opinion with three modes: review (a pass/fail gate), challenge (adversarial) and consult (with session continuity). |
| Triggers | "codex review", "codex challenge", "ask codex", "second opinion"; voice "code x". |
| Inputs | Mode; `--xhigh`; `<REF>_CODEX_MODEL` (default `gpt-6-astra`); the diff; plan files; `.context/codex-session-id`. |
| Outputs | A verbatim "CODEX SAYS" block; `GATE: PASS/FAIL` with tokens and cost; a required line "Recommendation: <action> because <reason>". |
| Tools/deps | Bash, Read, Write, Glob, Grep, AUQ; `codex` CLI; `<ref>-codex-probe` (auth, a model probe cached 1 h, a known-bad version list). |
| Workflow | 1. Binary. 2. Probes and self-guard. 3. Roots. 4. Mode detection. 5. Filesystem boundary prefix (don't read `~/.claude` or skills). 6. Run: review with a 330 s wrapper; challenge and consult with 600 s. 7. Synthesis. |
| Safety gates | `-s read-only` sandbox; the gate **fails closed** (non-zero exit, empty output, any P0/P1, or untagged output means FAIL); detects skill-file rabbit holes; warns about xhigh (about 23× tokens). |
| State | Session-id file, review log. |
| Artifacts | Review-log rows; temp captures. |
| External | OpenAI. |
| Strengths | Robust probing; fail-closed semantics; documented CLI gotchas; honest cost notes (a ~21K-token prelude on every call). |
| Weaknesses | Unprofessional persona text ("200 IQ autistic developer"). Hardcoded model default. The diff is tip-based rather than merge-base. It duplicates review's always-on adversarial pass. 884 lines. |
| Missing | JSON findings export. |
| Improvements | One provider-agnostic second-opinion specialist. |
| Proposed equivalent | Specialist `second-opinion` with provider adapters (`codex`, `claude`, `gemini`, …), invoked by `/review`, `/plan` and `/security` according to risk policy. |
| Separate / merge | **SYSTEM (specialist)**. |

#### 32. `claude-code`: `claude-code/`
| Field | Detail |
|---|---|
| Purpose | A Claude Code CLI second opinion for **non-Claude hosts** such as Codex, with the same three modes. |
| Triggers | "claude review", "claude challenge", "ask claude". |
| Inputs | Mode; the diff (from the `origin/<base>` tip); `<REF>_CLAUDE_MODEL`; `<REF>_CLAUDE_BIN`; session id. |
| Outputs | A "CLAUDE CODE SAYS" block; usage; the session id. |
| Tools/deps | Bash, Read, Write, AUQ; `bin/<ref>-claude-code` (`claude -p`, 10-minute timeout, 32 MiB output cap); `lib/outside-review-result.ts`. |
| Workflow | Self-contained shell per mode: private temp prompt, self-guard, diff, run (review and challenge `--tools ""`; consult read-only), validate JSON, save the session. |
| Safety gates | Never runs inside Claude Code (skipped via `hosts/claude.ts:24`); no slash commands, MCP or hooks in the nested agent; no user text interpolated into shell; any failure means "unavailable", never "clean". |
| State | `.context/claude-session-id`. |
| Artifacts | Session file. |
| External | Anthropic. |
| Strengths | Tight sandbox for the nested agent; honest failure semantics. |
| Weaknesses | The same ~40-line block is copy-pasted three times. Tip-based diff. It doesn't write to the review log (NOT VERIFIED beyond the template). |
| Missing | A PASS/FAIL gate; cost display. |
| Improvements | Unify with codex. |
| Proposed equivalent | Specialist `second-opinion` (provider = `claude`). |
| Separate / merge | **SYSTEM (specialist)**. |

### 2.8 Release / Deploy / Operate

#### 20. `ship`: `ship/` (+ `sections/`, ≈2965 lines)
| Field | Detail |
|---|---|
| Purpose | Fully automated path from a feature branch to a PR URL: merge the base, run tests, check coverage, audit the plan, review, bump VERSION, write the CHANGELOG and TODOS, make bisectable commits, pass a verification gate, push, sync docs and open the PR. |
| Triggers | "ship", "deploy", "push to main", "create a PR"; the rule is to **invoke `/ship` proactively instead of pushing**. `sensitive: true`. |
| Inputs | Base branch; diff; CLAUDE.md or AGENTS.md build commands; `## Test Coverage` minimum and target (60% / 80%); plans; review log; Greptile; TODOS; VERSION; package.json. |
| Outputs | Commits; push; a PR/MR titled `v<VER> <type>: <summary>` with 13 body sections; CHANGELOG entry; VERSION bump. |
| Tools/deps | Bash, Read, Write, Edit, Grep, Glob, Agent, AUQ, WebSearch; `<ref>-version-bump`, `<ref>-next-version`, **`<ref>-evidence`** (a test-run ledger), `<ref>-redact` (pre-push), `<ref>-pr-title-rewrite.sh`; `gh` or `glab`; Codex. |
| Workflow | 1. Step 0.9: Apple target → `apple-release.md`. 2. Step 1: preflight and dashboard. 3. Step 2: distribution check. 4. Step 3: merge base. 5. Steps 4-6: test bootstrap, tests with failure-ownership triage T1-T4, evals. 6. Step 7: coverage audit (a subagent, at most 2 generation passes). 7. Step 8: plan completion, 8.1 inline `/qa-only`, 8.2 scope drift. 8. Step 9: review and Review Army. 9. Greptile. 10. Adversarial review. 11. Step 12: version bump (FRESH, ALREADY_BUMPED, DRIFT_STALE_PKG, DRIFT_UNEXPECTED → STOP; MICRO <50 lines, PATCH ≥50, MINOR/MAJOR ask). 12. Step 13: CHANGELOG. 13. Step 14: TODOS. 14. Step 15: bisectable commits. 15. **Step 16: "IRON LAW: NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE"** (`<ref>-evidence check --max-age 24`). 16. Step 17: credential guard and push. 17. Step 18: `/document-release` as a foreground subagent. 18. Step 19: PR. 19. Step 20: metrics. 20. Step 21: plan-tune nudge. |
| Safety gates | Explicit STOP list (base branch, complex conflicts, in-branch test failures, ASK findings, MINOR/MAJOR bump, coverage below target, unfinished plan items); never force push; never push without fresh evidence; verification always re-runs; one-time pre-push hook offer; a "never stop for" list to avoid trivia. |
| State | Review log; markers; test plan; evidence ledger (path NOT VERIFIED). |
| Artifacts | VERSION, package.json, lockfiles, CHANGELOG.md, TODOS.md, generated tests, the PR, a `ship` review-log row. |
| External | GitHub/GitLab, Greptile, Codex, App Store/TestFlight, CI. |
| Strengths | Very thorough gates; an **evidence ledger** that ties test runs to content hashes; a workspace-aware VERSION queue that prevents collisions across parallel workspaces; a fresh-context subagent for doc sync; bisectable commits; a credential guard. |
| Weaknesses | Token cost of about 1,000 + 2,965 lines, plus the subagent's ~1,180 lines, plus the review specialists. Hard-wired to the reference suite conventions (4-digit VERSION, CHANGELOG voice, `agents-digest`). It bundles review, which makes `/review` partly redundant. The Step 20 metrics "for /retro" are never read by retro. |
| Missing | Semver tags and releases; monorepo multi-package versioning; pluggable versioning policy. |
| Improvements | A policy-driven versioning adapter; a lite tier; wire metrics into the Evidence ledger that retro reads. |
| Proposed equivalent | `/ship`: a composition of `verify` (tests + evidence), `/review`, `/qa --report-only`, a `version` adapter, a `changelog` adapter, `/docs sync` and a `vcs` adapter, each a contract-bound step. |
| Separate / merge | **KEEP**. |

#### 21. `land-and-deploy`: `land-and-deploy/` (+ sections)
| Field | Detail |
|---|---|
| Purpose | "Release Engineer": merges the `/ship` PR, waits for CI and the deploy, runs a canary check in production and offers a revert. |
| Triggers | "merge", "land", "deploy", "land it", "ship it to production". `sensitive: true`. |
| Inputs | `[#PR] [url]`; `gh` PR JSON; a clean checkout matching the PR head; CLAUDE.md `## Deploy Configuration`; deploy workflows; review log; `<ref>-diff-scope`. |
| Outputs | A merged PR; a LAND & DEPLOY REPORT with one of eight verdicts, from DEPLOYED AND VERIFIED to ROLLBACK PENDING. |
| Tools/deps | Bash, Read, Write, Glob, AUQ; **`gh` required**; `fly`, `heroku`; curl; Aside or `$B`. |
| Workflow | 1. Preflight: PR must be OPEN; local HEAD must match or it prints LOCAL_TARGET_MISMATCH and STOPs. 2. First-run dry run (config hash). 3. Checks and mergeability. 4. CI watch (15 minutes). 5. VERSION drift → STOP. 6. Readiness gate (review freshness, tests, PR-body accuracy, docs). 7. Merge with `--match-head-commit`. 8. Deploy strategy detection. 9. Deploy wait: GH Actions run matched by SHA, Fly, Render, Heroku, Vercel, Netlify, or a custom status command; 20-minute bounded waits. 10. Canary depth by scope. 11. Revert per merge shape. 12. Report. |
| Safety gates | First-run confirmation plus pre-merge approval; `--match-head-commit` pins the approved revision; never force-push or bypass CI; rollback only on explicit choice; **HTTP 200 alone is never proof of a deploy**; won't touch the user's work tree. |
| State | `projects/$SLUG/land-deploy-confirmed` (a hash of the deploy config), review log. |
| Artifacts | `.<ref>/deploy-reports/{date}-pr{N}-deploy.md`, post-deploy screenshots, a review-log row. |
| External | GitHub, Fly.io, Render, Heroku, Vercel, Netlify, GH Actions. |
| Strengths | Evidence-strict verdict table; SHA-matched deploy evidence; correct revert for each merge shape; merge-queue awareness. |
| Weaknesses | **Stops on GitLab** with "not yet implemented". No Kubernetes, ArgoCD or cloud-provider strategy. The canary is a single pass. `shasum` portability. |
| Missing | GitLab MR merge; progressive rollout or feature flags; incident and alerting hooks. |
| Improvements | Deploy-provider adapters; chain into `/deploy monitor`. |
| Proposed equivalent | `/deploy` (land, then wait, then verify, then monitor, then rollback), with `vcs` and `deploy-provider` adapters. |
| Separate / merge | **KEEP** (absorbs setup-deploy, canary, landing-report). |

#### 22. `landing-report`: `landing-report/`
| Field | Detail |
|---|---|
| Purpose | Read-only VERSION queue dashboard: which versions open PRs claim, active sibling Conductor worktrees, and the next free slot for each bump level. |
| Triggers | "landing report", "version queue", "what version comes next". |
| Inputs | Base branch; VERSION; `origin/<base>:VERSION`; `<ref>-next-version` JSON. |
| Outputs | A boxed ONLINE or OFFLINE report; claims with collision markers; a sibling table; the next slots; one suggested action. |
| Tools/deps | Bash, Read; `bun`, `jq`, `gh`. |
| Workflow | Detect the base, read versions, query four times (once per level), render, suggest. |
| Safety gates | Plan-mode exception: fully read-only. |
| State | None; depends on sibling worktrees on disk. |
| Artifacts | `/tmp/landing-*.json`, which contradicts its own "no file writes" claim. |
| External | GitHub or GitLab. |
| Strengths | Cheap; makes collisions between parallel workspaces visible. |
| Weaknesses | Only meaningful with the reference suite's 4-digit VERSION and Conductor. Hardcoded `/tmp`. Redundant per-level queries. |
| Missing | Staleness of claims. |
| Improvements | Fold into a deploy status view. |
| Proposed equivalent | `/deploy status`. |
| Separate / merge | **MERGE → `/deploy`**. |

#### 23. `setup-deploy`: `setup-deploy/`
| Field | Detail |
|---|---|
| Purpose | One-time detection of deploy platform, production URL, health check, status command and merge method, persisted to CLAUDE.md. |
| Triggers | "setup deploy", "configure deployment", "add deploy config". |
| Inputs | Existing CLAUDE.md section; `fly.toml`, `render.yaml`, `vercel.json`, `netlify.toml`, `Procfile`, `railway.*`, workflows, package.json `bin`, gemspec. |
| Outputs | A CLAUDE.md `## Deploy Configuration` block; a summary. |
| Tools/deps | Bash, Read, Write, Edit, Glob, Grep, AUQ; the `fly` and `vercel` CLIs; `$RENDER_API_KEY` (only the first 4 characters echoed); curl. |
| Workflow | Check existing config, detect, platform-specific setup, write, verify (non-blocking), summarize. |
| Safety gates | Never expose secrets; confirm before writing; if several platforms are detected, ask which is production. |
| State | CLAUDE.md as the source of truth, hashed by land-and-deploy. |
| Artifacts | A CLAUDE.md edit. |
| External | Fly, Render, Vercel, Netlify, Heroku, Railway, GH Actions. |
| Strengths | Simple and idempotent; detection is a hint, not a decision. |
| Weaknesses | **Stores machine config in CLAUDE.md**, which pollutes the agent instruction file and cannot be parsed reliably. No AWS, GCP, Azure, k8s or Cloudflare. A failed verify doesn't block. No staging or rollback fields. |
| Missing | Structured config; environment validation. |
| Improvements | Write `.<sys>/deploy.yaml` with a schema. |
| Proposed equivalent | `/deploy setup` → the `deploy.yaml` config artifact. |
| Separate / merge | **MERGE → `/deploy`**. |

#### 24. `canary`: `canary/`
| Field | Detail |
|---|---|
| Purpose | Post-deploy visual and console monitoring, compared against a pre-deploy baseline over a time window. |
| Triggers | "monitor deploy", "canary", "watch production", "verify deploy". |
| Inputs | `<url>`, `--duration` (1-30 min, default 10), `--baseline`, `--pages`, `--quick`; `.<ref>/canary-reports/baseline.json`. |
| Outputs | CANARY ALERT blocks; a CANARY REPORT with a HEALTHY, DEGRADED or BROKEN verdict. |
| Tools/deps | Bash, Read, Write, Glob, AUQ; Aside or `$B`. |
| Workflow | 1. Setup. 2. `--baseline` capture (screenshot, console, `loadEventEnd`, text, 404s). 3. Discover the top 5 same-origin links, filtering out logout/delete. 4. Pre-monitor snapshot. 5. Loop every 60 s. Alert levels: load failure CRITICAL, new console error HIGH, >2× load time MEDIUM, new 404 LOW. An alert needs 2 consecutive hits, then an AUQ. 6. Report. 7. Offer a baseline update. |
| Safety gates | Read-only; "don't cry wolf" (2+ consecutive hits); skips destructive links; never overwrites the baseline mid-run. |
| State | Baseline file; `canary-history.jsonl`. |
| Artifacts | `.<ref>/canary-reports/…`, `{date}-canary.{md,json}`. |
| External | Browser only. |
| Strengths | Alerts on change rather than absolute values; tolerates transients; every alert has a screenshot. |
| Weaknesses | **`--quick` is documented but not implemented.** The "Rollback" option has no procedure. It logs to `canary-history.jsonl`, not the review log, so the dashboard never sees it. Browser-only: no server logs, error rates or APM. |
| Missing | Pixel diffing; API checks; Sentry or Datadog adapters; auth-gated pages. |
| Improvements | Observability adapters; wire the rollback. |
| Proposed equivalent | `/deploy monitor` (browser probes plus observability adapters). |
| Separate / merge | **MERGE → `/deploy`**. |

#### 25. `benchmark`: `benchmark/`
| Field | Detail |
|---|---|
| Purpose | Web performance regression detection: TTFB, FCP, LCP, DOM timings, request count, transfer size and bundle sizes against a baseline, plus trends. |
| Triggers | "performance", "benchmark", "page speed", "lighthouse", "web vitals", "bundle size". |
| Inputs | `<url>`, `--baseline`, `--quick`, `--pages`, `--diff`, `--trend`. |
| Outputs | PERFORMANCE REPORT; top 10 slowest resources; budget check (A-F); trends. |
| Tools/deps | Bash, Read, Write, Glob, AUQ; Aside (`performance.getEntries`, PerformanceObserver) or `$B`. |
| Workflow | 1. Setup. 2. Page discovery ("same as /canary"). 3. Collect (median of 3 runs only if the user asks). 4. Baseline. 5. Compare: timing REGRESSION above +50% or +500 ms, WARNING above +20%; bundle REGRESSION above +25%. 6. Slowest resources. 7. Budget check (FCP <1.8 s, LCP <2.5 s, JS <500 KB). 8. Trend. 9. Save. |
| Safety gates | Read-only; never overwrites the baseline without `--baseline`; missing metrics are N/A, not 0. |
| State | `.<ref>/benchmark-reports/baselines/`. |
| Artifacts | `baseline.json`, timestamped baselines, `{date}-benchmark.{md,json}`. |
| External | None. |
| Strengths | Real browser numbers; deterministic bundle indicators; clear thresholds. |
| Weaknesses | **Promises Core Web Vitals and Lighthouse but measures no CLS or INP and runs no Lighthouse.** No CPU or network throttling. The median isn't the default. The `--diff` file-to-page mapping is unspecified. |
| Missing | CLS, INP, TBT; throttling profiles; CI mode; statistics across runs. |
| Improvements | Statistical runs with a confidence interval; a Lighthouse adapter; throttling. |
| Proposed equivalent | `/perf` (web, API and CLI targets; statistically sound comparisons). |
| Separate / merge | **KEEP**. |

#### 29. `health`: `health/`
| Field | Detail |
|---|---|
| Purpose | Code-quality dashboard: wraps typecheck, lint, tests, dead-code and shell-lint tools (plus gbrain) into a weighted 0-10 composite with trends. |
| Triggers | "health check", "code quality", "run all checks", "quality score". |
| Inputs | CLAUDE.md `## Health Stack`, or auto-detected tsc, biome, eslint, ruff, pytest, cargo, go test, knip, shellcheck; `gbrain doctor`. |
| Outputs | CODE HEALTH DASHBOARD; details for categories below 7; trend; regressions; recommendations. |
| Tools/deps | Bash, Read, Write, Edit, Glob, Grep, AUQ; the project's own tools. |
| Workflow | 1. Detect and confirm tools. 2. Run each with a private log and the real exit code. 3. Score (typecheck 22%, lint 18%, tests 28%, dead code 13%, shell 9%, gbrain 10%; skipped weights redistributed). 4. Dashboard. 5. History. 6. Like-for-like trend. |
| Safety gates | HARD GATE: no fixes. Capture failure = ERROR, never CLEAN. An empty run is never 10/10. Trends compare only identical coverage sets. |
| State | `projects/$SLUG/health-history.jsonl`; CLAUDE.md. |
| Artifacts | History row; CLAUDE.md section. |
| External | gbrain (optional). |
| Strengths | Honest scoring (partial coverage labeled; ERROR vs SKIPPED); comparable trends. |
| Weaknesses | The example weights (30/20/15%) contradict the rubric. The reference suite's own gbrain sync status counts toward a *project* quality score. Any non-zero exit scores 4. No coverage percentage. Nothing reads its results (ship, retro). |
| Missing | Coverage, dependency audit, complexity metrics. |
| Improvements | A pluggable check registry; feed the Evidence ledger. |
| Proposed equivalent | `/health` (also absorbs `deslop-shared-libs` as the `reuse` lens). |
| Separate / merge | **KEEP**. |

#### 33. `retro`: `retro/` (+ `sections/report-format.md`)
| Field | Detail |
|---|---|
| Purpose | Weekly engineering retrospective: commit and work-pattern metrics, per-person praise and growth, streaks, trends, and a cross-project "global" mode spanning AI coding tools. |
| Triggers | "weekly retro", "what did we ship", "engineering retrospective"; proactive at the end of a week. |
| Inputs | Windows 24h, 7d, 14d, 30d; `compare`; `global`; `origin/<default>`; `gh pr list --state merged`; CHANGELOG; `retro-context.md`; greptile-history; `skill-usage.jsonl`; `eureka.jsonl`; gbrain. |
| Outputs | A 3,000-4,500 word narrative: tweetable summary, metrics, time distribution, sessions, hotspots, PR sizes, focus score, ship of the week, team sections, trends, streaks, shortcut-debt ledger. |
| Tools/deps | Bash, Read, Write, Glob, AUQ; `<ref>-retro-metrics` (`METRIC:` lines, protocol 1), `<ref>-global-discover`, `gh`. |
| Workflow | 1. Midnight-aligned window. 2. Fetch. 3. Metrics in one command with a stale-base guard. 4. Analysis. 5. Compare with history. 6. Save. 7. Narrative. Global mode discovers sessions across Claude Code, Codex and Gemini. |
| Safety gates | Mostly read-only; "never compare teammates negatively"; timezone rules. |
| State | `.context/retros/*.json`; `~/.<ref>/retros/global-*.json`. |
| Artifacts | JSON snapshots. |
| External | GitHub; local session stores of Claude Code, Codex and Gemini. |
| Strengths | Deterministic metrics script; team-aware tone rules; excludes AI co-authors from credit; a shortcut-debt ledger. |
| Weaknesses | The largest template (760 lines, 1,214 generated). LOC/hour and "focus score" invite vanity metrics. It **ignores ship metrics, health-history, canary-history and the review log**. GitLab PR counting only via `!NNN` in commit messages. |
| Missing | DORA metrics from deploy logs; review-quality trends. |
| Improvements | Read the unified Evidence ledger; DORA. |
| Proposed equivalent | `/retro` (built on the Evidence and State ledgers; DORA plus quality trends). |
| Separate / merge | **KEEP**. |

### 2.9 Documentation

#### 27. `document-release`: `document-release/` (+ `sections/release-body.md`)
| Field | Detail |
|---|---|
| Purpose | Post-ship doc sync. It builds a Diataxis coverage map, audits README, ARCHITECTURE, CONTRIBUTING, CLAUDE.md and AGENTS.md against the diff, detects diagram drift, polishes the CHANGELOG voice ("sell test"), cleans TODOS, optionally bumps VERSION, and splices the PR `## Documentation` section. |
| Triggers | "update the docs", "sync documentation", "post-ship docs"; proactive after a merge or ship. |
| Inputs | Diff against the merge-base; `.md` files at depth 2 or less; CHANGELOG; TODOS; VERSION; PR body (through `<ref>-issue-guard`). |
| Outputs | Doc edits; a `docs: …` commit; **a push**; the PR body splice; a health summary. In spawned mode, last-line JSON. |
| Tools/deps | Bash, Read, Write, Edit, Grep, Glob, AUQ; `gh` or `glab`; python3; `<ref>-redact`; Codex (on by default). |
| Workflow | Preflight, coverage map and drift, per-file audit, auto-update, ask about risky changes, CHANGELOG polish, cross-doc consistency, TODOS, VERSION question, Codex doc review, commit and a race-safe PR-body update. |
| Safety gates | NEVER overwrite CHANGELOG entries (Edit only, never Write); never bump VERSION without asking; stage files by name; spawned-mode injection guard; redaction exit 3 means do not edit. |
| State | git and the PR. |
| Artifacts | Doc edits, commit, PR body, `/tmp/<ref>-doc-release-*`. |
| External | GitHub/GitLab, Codex. |
| Strengths | Strong CHANGELOG clobber protection; injection-aware PR-body handling; Diataxis lens; designed to run as a fresh-context subagent. |
| Weaknesses | **Pushes without confirmation.** Discovery stops at `maxdepth 2`, missing deeper `docs/**`. The voice rules are reference-suite-opinionated. Codex review is on by default. |
| Missing | Docs-site build; link checking. |
| Improvements | Respect the docs-framework config; add a link checker; gate the push. |
| Proposed equivalent | `/docs sync`. |
| Separate / merge | **MERGE → `/docs`**. |

#### 28. `document-generate`: `document-generate/`
| Field | Detail |
|---|---|
| Purpose | Generates missing documentation from scratch across the Diataxis quadrants (reference, explanation, how-to, tutorial). |
| Triggers | "write docs", "generate documentation", "create a tutorial", "explain this module". |
| Inputs | A target (feature, module, project, or the gaps document-release found); the codebase; tests; existing docs; the docs framework (Nextra, Docusaurus, MkDocs, VitePress). |
| Outputs | `docs/{reference,explanation,howto,tutorial}-*.md`; README and CLAUDE.md links; commit; push; a PR table. |
| Tools/deps | Bash, Read, Write, Edit, Grep, Glob, AUQ; `<ref>-redact`. |
| Workflow | Scope, codebase archaeology, partitioning (more than 5 docs → confirm), write reference first, then explanation, how-to and tutorial, cross-link, self-review, redact, commit, push. |
| Safety gates | Redaction HIGH blocks the commit; stage by name; confirm if more than 5 docs. |
| State | None. |
| Artifacts | Doc files, commit. |
| External | GitHub. |
| Strengths | Clear quadrant templates; writes reference first. |
| Weaknesses | **"Every code example compiles" is only a checklist item; no step actually runs the examples.** Pushes without a gate. "Boil the ocean" risks bloat. |
| Missing | Executing snippets; building the docs site; a size budget. |
| Improvements | Extract snippets and run them in a sandbox. |
| Proposed equivalent | `/docs generate`. |
| Separate / merge | **MERGE → `/docs`**. |

### 2.10 Safety

#### 34. `careful`: `careful/` (+ `bin/check-careful.sh`, `bin/hook-extract.sh`)
| Field | Detail |
|---|---|
| Purpose | Opt-in, session-scoped warnings before destructive shell commands. |
| Triggers | "be careful", "safety mode", "prod mode". |
| Inputs | The PreToolUse JSON on stdin; additive regex files. |
| Outputs | `hookSpecificOutput.permissionDecision` = `ask`, `deny`, or `{}`. |
| Tools/deps | Frontmatter `hooks.PreToolUse` with matcher **`Bash` only** → `check-careful.sh`; python3 or node for JSON parsing; git. |
| Workflow | 1. Parse (failure → ask). 2. Obfuscation tripwire (`$IFS`, base64 piped to sh → ask). 3. **HIGH (deny), simple commands only**: `rm -r` of `/`, `~` or `$HOME`; force-push to the default branch (`--force-with-lease` is never HIGH). 4. Safe exception for `rm` of build dirs (node_modules, dist, …). 5. **MEDIUM (ask)**: `rm -r`, `drop table/database`, `truncate`, `git push -f`, `git reset --hard`, `git checkout/restore .`, `kubectl delete`, `docker rm -f / system prune`. 6. Additive project patterns from `careful-patterns.txt`. |
| Safety gates | As above; config can only add rules; fails closed to "ask"; hook fires are logged without the command text. |
| State | Pattern files; analytics. |
| Artifacts | Analytics rows. |
| External | None. |
| Strengths | Real JSON parsing (fixed an escaped-quote bypass); an obfuscation tripwire; fail-closed; tested in `test/hook-scripts.test.ts`. |
| Weaknesses | **Bash only** (Write, Edit and MCP are not covered). Narrow list: `git clean -fdx`, `find -delete`, `git branch -D`, `DELETE FROM`, `terraform destroy`, `dd`, `mkfs`, `aws s3 rm --recursive`, `gh repo delete` and `DROP SCHEMA` are all missed. Interpreter deletes (`python -c shutil.rmtree`, `node -e fs.rmSync`) are missed. HIGH applies only to simple commands, so `cd / && rm -rf *` degrades to ask. Session-scoped and opt-in. The script itself says it is "advisory hard-stop, not a policy boundary." |
| Missing | Always-on policy; sensitive-path protection (.env, migrations); cloud CLIs; per-project allowlists. |
| Improvements | A policy engine with a parsed command AST, tool-agnostic matchers and always-on baselines. |
| Proposed equivalent | Safety engine: an always-on baseline policy plus `/guard` levels. |
| Separate / merge | **SYSTEM** (user control through `/guard`). |

#### 35. `guard`: `guard/`
| Field | Detail |
|---|---|
| Purpose | careful and freeze combined. |
| Triggers | "guard mode", "full safety", "lock it down". |
| Inputs | Freeze directory (AUQ free text). |
| Outputs | `freeze-dir.txt`; three hooks (Bash → careful; Edit and Write → freeze). |
| Tools/deps | Bash, Read, AUQ; sibling careful and freeze directories. |
| Workflow | Ask for the path, resolve it, write the state file, explain. |
| Safety gates | careful + freeze. |
| State | `freeze-dir.txt`. |
| Artifacts | State file. |
| External | None. |
| Strengths | One step for both protections; reuses the scripts. |
| Weaknesses | Inherits every weakness of careful and freeze. The freeze directory is mandatory. The setup snippet is duplicated from freeze. Hardcoded `$HOME/.claude/skills/<ref>/...` hook paths break repo-local installs (inferred). |
| Missing | Levels; a status view. |
| Improvements | One `/guard` with levels. |
| Proposed equivalent | `/guard [off\|standard\|strict\|lockdown] [--scope dir]`. |
| Separate / merge | **MERGE → `/guard`** (the one user-facing safety control). |

#### 36. `freeze`: `freeze/` (+ `bin/check-freeze.sh`)
| Field | Detail |
|---|---|
| Purpose | Blocks Edit and Write outside one directory. |
| Triggers | "freeze", "restrict edits", "only edit this folder". |
| Inputs | Directory (AUQ). |
| Outputs | `$<REF>_STATE_ROOT/freeze-dir.txt`; deny or `{}`. |
| Tools/deps | PreToolUse matchers **"Edit" and "Write"**; `hook-extract.sh`; python3 or node. |
| Workflow | Resolve the directory, then the hook runs a realpath prefix check with symlink resolution (up to 40 hops). |
| Safety gates | Fail-closed (EXIT-trap backstop; an unparseable payload denies). No state file → allow everything. A payload with no `file_path` → allow. |
| State | A single global `freeze-dir.txt`. |
| Artifacts | State file; analytics. |
| External | None. |
| Strengths | Fail-closed; resolves symlinks; handles paths with spaces. |
| Weaknesses | Bash writes (`sed -i`, `>`, `cp`) bypass it, as the template admits. NotebookEdit isn't matched. **Setup bug: if `cd` fails, `FREEZE_DIR` becomes `/`, which allows everything.** The state file is **global across sessions and worktrees** and persists after the session. Windows drive-letter paths are probably treated as relative and denied (inferred from code, NOT VERIFIED by running). |
| Missing | Multiple roots; session keying; Bash-write detection. |
| Improvements | A session-scoped policy object; command-AST write detection. |
| Proposed equivalent | `/guard scope <dir>` (a policy rule enforced across every write-capable tool). |
| Separate / merge | **MERGE → `/guard`**. |

#### 37. `unfreeze`: `unfreeze/`
| Field | Detail |
|---|---|
| Purpose | Clears the freeze boundary. |
| Triggers | "unfreeze", "unlock edits". |
| Inputs | None. |
| Outputs | Deletes `freeze-dir.txt`. |
| Tools/deps | Bash, Read, `<ref>-paths`. |
| Workflow | One bash block. |
| Safety gates | **None**: the model can call it itself (`sensitive:true` is stripped for Claude). |
| State | As freeze. |
| Artifacts | None. |
| External | None. |
| Strengths | Trivial. |
| Weaknesses | Unfreezes **every** session at once; no audit entry; the agent can self-unfreeze. |
| Missing | User-only invocation; logging. |
| Improvements | Relaxing a guard should be possible only for the user. (For AEOS, guaranteeing this is an unresolved boundary; see platform-validation/ARCHITECTURAL-DECISIONS.md AD-10.) |
| Proposed equivalent | `/guard scope --clear` (user-origin only). |
| Separate / merge | **MERGE → `/guard`**. |

### 2.11 Context, memory & state

#### 38. `context-save`: `context-save/`
| Field | Detail |
|---|---|
| Purpose | Saves working context (git state, decisions, remaining work) as a markdown checkpoint. Renamed from `/checkpoint`, which collided with Claude Code's native command. |
| Triggers | "save progress", "save state", "save my work". |
| Inputs | Optional title; `list [--all]`. |
| Outputs | `projects/$SLUG/checkpoints/YYYYMMDD-HHMMSS-<slug>[-rand4].md`. |
| Tools/deps | Bash, Read, Write, Glob, Grep, AUQ; git. |
| Workflow | git branch, status, diff stat, log; the LLM summarizes; duration; sanitized filename; write. File format: frontmatter (`status`, `branch`, `timestamp`, `session_duration_s`, `files_modified`) plus Summary, Decisions, Remaining Work and Notes sections. |
| Safety gates | No code changes; append-only; the filename is computed in bash, so a title can't inject shell. |
| State | Shared by all worktrees of a repo (the slug comes from origin). |
| Artifacts | Checkpoint files. |
| External | None directly. |
| Strengths | Injection-safe; stable ordering; records the branch. |
| Weaknesses | Duration uses `date -jf` (BSD-only). Nothing ever sets `status: completed`. No pruning. Quality depends on the LLM's memory of the conversation. No HEAD SHA or patch captured. |
| Missing | Automatic checkpoints; structured todo capture; plan links. |
| Improvements | The state engine writes structured checkpoints automatically at phase boundaries. |
| Proposed equivalent | State engine auto-checkpoint, plus `/resume save` for a manual one. |
| Separate / merge | **MERGE → `/resume`**. |

#### 39. `context-restore`: `context-restore/`
| Field | Detail |
|---|---|
| Purpose | Loads the most recent checkpoint. |
| Triggers | "resume", "restore context", "where was I". |
| Inputs | None, a fragment, or a number. |
| Outputs | A RESUMING CONTEXT block, then an AUQ (continue, show full, done). |
| Tools/deps | Bash, Read, Glob, Grep, AUQ. |
| Workflow | `find … | sort -r | head -200`; current branch first; warn on a different branch. |
| Safety gates | Read-only. |
| State | Checkpoint directory. |
| Artifacts | None. |
| External | None. |
| Strengths | Current-branch-first ordering; cross-branch fallback for handoffs. |
| Weaknesses | **Checkpoints are loaded as trusted text with no injection check** (learnings have one). The LLM does the fragment matching. No staleness check against HEAD. |
| Missing | A commits-since-save diff. |
| Improvements | A typed checkpoint with a HEAD SHA and trust labels. |
| Proposed equivalent | `/resume`. |
| Separate / merge | **KEEP** (renamed `/resume`). |

#### 40. `learn`: `learn/` (+ `<ref>-learnings-log`, `<ref>-learnings-search`, `lib/jsonl-store.ts`)
| Field | Detail |
|---|---|
| Purpose | Review, search, prune, export, stats and manual add for per-project learnings that other skills log. |
| Triggers | "show learnings", "what have we learned", "prune stale learnings", "didn't we fix this before?" |
| Inputs | `search`, `prune`, `export`, `stats`, `add`. |
| Outputs | Text; a markdown export (optionally appended to CLAUDE.md). |
| Tools/deps | bun; `<ref>-brain-enqueue`. |
| Workflow | Search: dedupe latest-wins; confidence decay of 1 point per 30 days for observed and inferred entries; token-OR match. Prune: the LLM checks that referenced files still exist, then asks per entry. |
| Safety gates | `hasInjection()` rejects instruction-like insights; cross-project rows are allowed only if `trusted===true` (only user-stated rows are trusted). |
| State | `projects/$SLUG/learnings.jsonl`, with schema `{skill,type,key,insight,confidence 1-10,source,files[],ts,trusted}`. |
| Artifacts | JSONL. |
| External | gbrain (optional). |
| Strengths | Strict validation; decay; a trust allowlist; provenance (`source`). |
| Weaknesses | Removal is done by the LLM rewriting the JSONL (corruption risk). Deleting the newest line **resurrects an older duplicate**. `log` uses `${<REF>_HOME:-~/.<ref>}` but `stats` uses `<REF>_STATE_ROOT`, so they diverge under plugin installs. Search is substring-only. |
| Missing | Tombstones; semantic search; a unified query over checkpoints and gbrain. |
| Improvements | An append-only store with tombstones, typed kinds and one query API. |
| Proposed equivalent | `/memory` (backed by the memory engine). |
| Separate / merge | **KEEP** (renamed `/memory`). |

#### 41. `setup-gbrain`: `setup-gbrain/` (+ sections, `memory.md`)
| Field | Detail |
|---|---|
| Purpose | Takes gbrain from nothing to working: install the CLI, initialize PGLite or Supabase (or attach a remote MCP), register the MCP with Claude Code, set per-repo trust policy, set up artifact sync, gate transcript ingest, and write CLAUDE.md config. |
| Triggers | "setup gbrain", "connect gbrain"; `--repo`, `--switch`, `--resume-provision`, `--cleanup-orphans` (parsed by the LLM). |
| Inputs | AUQ path: existing Supabase URL, auto-provision via PAT, manual, PGLite, remote MCP; secrets read through `read_secret_to_env`. |
| Outputs | `~/.gbrain/config.json`; `claude mcp add --scope user gbrain`; `~/.<ref>/gbrain-repo-policy.json` (0600; read-write, read-only or deny); a private `<ref>-artifacts-$USER` repo; config keys; a CLAUDE.md block; a GREEN, YELLOW or RED verdict. |
| Tools/deps | `<ref>-gbrain-detect`, `-install`, `-repo-policy`, `<ref>-artifacts-init`, `<ref>-gbrain-source-wireup`, `<ref>-code-intelligence`; jq, python3, curl, `claude`. |
| Workflow | Steps 1-10: detect, remediate, choose code-intel provider, install, init, MCP, per-remote policy, artifact sync, transcript gate, smoke test, trust policy. |
| Safety gates | Orphan deletion confirmed per project; the active brain needs a second confirmation; telemetry never carries secrets (tested); `deny` vetoes code-intel. |
| State | As outputs, plus `.gbrain-sync-state.json` and `~/.claude.json`. |
| Artifacts | Configs, repo. |
| External | gbrain, Supabase Management API, PGLite, Claude MCP, GitHub/GitLab, Voyage embeddings. |
| Strengths | Idempotent doctor re-runs; secret hygiene; separate consent for local compute and remote send. |
| Weaknesses | "Audience: local-Mac users." Claude-only MCP registration. **The `read-only` tier is not enforced** ("future auto-import hook"). The bearer token is briefly on argv. About 1,540 lines. |
| Missing | Host-agnostic registration; a routed uninstall. |
| Improvements | A memory-provider adapter interface. |
| Proposed equivalent | Memory adapter `gbrain`, plus `/setup memory`. |
| Separate / merge | **ADAPTER**. |

#### 42. `sync-gbrain`: `sync-gbrain/` (+ `bin/<ref>-gbrain-sync.ts`)
| Field | Detail |
|---|---|
| Purpose | Keeps the gbrain code index and memory current and refreshes CLAUDE.md search guidance. |
| Triggers | "sync gbrain", "reindex repo", "gbrain search isn't finding things". |
| Inputs | `--full` (~25-35 min), `--dream`, `--code-only`, `--dry-run`, `--no-memory`, `--audit`, … |
| Outputs | Updated sources; `.gbrain-sync-state.json` (atomic rename); CLAUDE.md block; a DONE, DONE_WITH_CONCERNS, BLOCKED or NEEDS_CONTEXT verdict. |
| Tools/deps | `<ref>-gbrain-sync.ts`; gbrain ≥0.20 (`sources add`, `sync`, `reindex-code`, `code-def`, `code-refs`, `code-callers`, `dream`). |
| Workflow | Probe, then engine pre-flight (engine-locked → stop), then code → memory → brain-sync (a stage failure doesn't stop later stages), then page and call-graph checks, then the CLAUDE.md refresh. |
| Safety gates | Deny policy; lock file (stale after 5 min); `--dry-run`; `--audit` salience leak check. |
| State | As above. |
| Artifacts | Index and CLAUDE.md edits. |
| External | gbrain, artifacts repo, Voyage. |
| Strengths | Fast incremental path (~50 ms); a clear remediation table; concurrency lock. |
| Weaknesses | Edits the committed CLAUDE.md (diff churn). PGLite's single-writer limit conflicts with a live `gbrain serve`. Only `deny` is enforced. Manual trigger only. |
| Missing | Scheduled or automatic sync. |
| Improvements | A background job owned by the memory adapter; no CLAUDE.md churn. |
| Proposed equivalent | Memory adapter job `index.sync`. |
| Separate / merge | **ADAPTER**. |

### 2.12 Browser

#### 43. `browse`: `browse/`
The detail for this entry is in [REFERENCE-ARCHITECTURE-ANALYSIS.md §5](REFERENCE-ARCHITECTURE-ANALYSIS.md#5-browser-architecture).

| Field | Detail |
|---|---|
| Purpose | Fast headless-browser CLI (`$B`) for QA, dogfooding and screenshots. A persistent Chromium daemon (`browse/src/server.ts`, 3,467 lines; Playwright via `browser-manager.ts`) is driven by short CLI calls. It has **81 canonical commands** (19 read / 30 write / 32 meta; `browse/src/commands.ts`) and uses `@eN` element refs from Playwright `ariaSnapshot()`. |
| Triggers | "browse", "open this page", "take a screenshot", "dogfood", "test the site"; the root router sends all browser, QA and screenshot requests here (Aside first). |
| Inputs | URLs; commands (goto, snapshot, click `@eN`, fill, screenshot, console, network, tabs, cookies, …); `<repo>/.<ref>/browse.json` state (pid, port, token). |
| Outputs | Text snapshots with refs; screenshots; console and network logs; command results on stdout. |
| Tools/deps | Bash, Read, AUQ; the compiled `browse/dist/browse` (Bun), Playwright Chromium; `./setup` builds it. |
| Workflow | 1. The CLI finds the daemon through `<git-root>/.<ref>/browse.json` or spawns it detached. 2. The CLI sends `POST /command` with a Bearer token to 127.0.0.1 on a random port in 10000-49151. 3. The daemon drives Playwright and returns text. 4. The daemon exits after 30 minutes idle (the idle timeout is suspended in headed and tunnel modes) or when the parent watchdog fires. |
| Safety gates | Loopback bind; a per-start UUID token; a 0600 state file (icacls on Windows); an untrusted-content envelope on page reads; URL validation (blocks cloud metadata IPs, **allows localhost and private IPv4**); path validation for outputs; a deny-default CDP allowlist of 26 methods. Hidden-element stripping and datamarking apply **only to scoped tokens**, not to the local agent. See the architecture analysis §5. |
| State | `<repo>/.<ref>/browse.json` (pid, port, token, binaryVersion, configHash), `browse-{console,network,dialog}.log`, `browse-audit.jsonl`, `~/.<ref>/chromium-profile/`. |
| Artifacts | Screenshots and logs in the working or temp directory. |
| External | Chromium; the optional Aside browser as the primary driver. |
| Strengths | Sub-second commands after a cold start; ref-based interaction instead of brittle CSS selectors; one persistent session keeps cookies and tabs; the same binary also backs make-pdf, diagram, canary and benchmark. |
| Weaknesses | **Chromium only** (no Firefox or WebKit). **No network interception or mocking** (no `route`, HAR or offline support). One shared browser context and cookie jar per daemon. On Windows it runs under Node with a Bun polyfill (a second runtime path) and **the Chromium sandbox is always disabled** (`browser-manager.ts:88-89`). The skill layer now prefers Aside (macOS 15+), so every browser skill has two code paths. |
| Missing | Cross-browser engines; network mocking; per-task isolated contexts; a device matrix. |
| Improvements | A Browser tool-abstraction layer with pluggable drivers (Playwright, CDP, Aside) behind one command contract. |
| Proposed equivalent | `/browser` + the Browser tool layer. |
| Separate / merge | **KEEP**. |

#### 44. `open-<ref>-browser`: `open-<ref>-browser/` (alias `connect-chrome`)
| Field | Detail |
|---|---|
| Purpose | Launches the headed Reference suite Browser (rebranded Playwright Chromium) with the sidebar extension, anti-bot stealth, an activity feed and a chat sidebar agent. |
| Triggers | "open the reference suite browser", "launch browser", "connect chrome", "side panel". |
| Inputs | None. |
| Outputs | A headed browser on port 34567; `browse.json`. |
| Tools/deps | `$B connect`; the extension at `~/.claude/skills/<ref>/extension/`; `launchPersistentContext`. |
| Workflow | 1. Pre-flight **kills the pid in browse.json (TERM, then `kill -9`)** and removes Chromium locks. 2. `$B connect`. 3. `status`. 4. AUQ guidance to pin the side panel. 5. Demo. 6. Explain the sidebar. |
| Safety gates | **None.** |
| State | `~/.<ref>/chromium-profile/`, `browse.json`. |
| Artifacts | None. |
| External | Chromium, the extension. |
| Strengths | Clear recovery steps; a visible activity feed. |
| Weaknesses | Unconditional `kill -9` of the recorded pid with no process-identity check (pid-reuse risk), while pair-agent and `<ref>-upgrade` treat killing a live daemon as a one-way door. macOS-centric instructions. Fixed port. The sidebar agent is a second Claude with browser control and no stated scope limits. |
| Missing | A consent gate; Windows and Linux walkthroughs. |
| Improvements | Reuse the lifecycle-consent pattern; verify process identity before killing. |
| Proposed equivalent | `/browser open --headed`. |
| Separate / merge | **MERGE → `/browser`**. |

#### 45. `connect-chrome`: repo-root symlink
| Field | Detail |
|---|---|
| Purpose | Trigger alias for `open-<ref>-browser`. |
| Details | A git symlink (mode 120000) to `open-<ref>-browser`. **On Windows checkouts without symlink support it becomes a 19-byte text file** (observed in this clone), which breaks the alias. |
| Proposed equivalent / verdict | Handled by router synonyms. **DROP**. |

#### 46. `pair-agent`: `pair-agent/`
| Field | Detail |
|---|---|
| Purpose | Shares the reference suite browser with another agent (OpenClaw, Hermes, Codex, Cursor, Claude) through a scoped token; the remote agent gets its own tab. |
| Triggers | "pair agent", "share browser", "remote browser". |
| Inputs | AUQ for host and local vs remote; `--restrict`, `--control`, `--domain`, `--force-restart`. |
| Outputs | Local: credentials written into `~/.{openclaw,codex,cursor}/skills/<ref>/browse-remote.json`. Remote: an ngrok URL plus a one-time setup key (5-minute TTL), exchanged for a 24-hour session token. |
| Tools/deps | `$B pair-agent`, `$B tunnel`; ngrok. |
| Workflow | Status, host, mode, live-daemon consent, remote consent (once per machine), ngrok checks, verify. |
| Safety gates | The tunnel allowlist has 26 commands (`js`, `cookies` and `storage` blocked); `--restrict` narrows scope; `--control` is needed for stop and restart; a narrowing re-pair revokes the old session; 10 requests per second; tokens live in daemon memory only. |
| State | `pair_agent` config key. |
| Artifacts | Credential files (local mode). |
| External | ngrok; other agents. |
| Strengths | Strong consent model; token hygiene; injection advice. |
| Weaknesses | **The default scope grants `eval` on the user's browser.** The token lasts 24 hours. Plaintext credentials go into other tools' config directories (file mode NOT VERIFIED). ngrok is the only tunnel. |
| Missing | Shorter TTLs; a Tailscale option; a remote-command audit log (NOT VERIFIED). |
| Improvements | Least-privilege default; a TTL flag; audit logging. |
| Proposed equivalent | `/browser share` (capability-scoped sessions on the Browser tool layer). |
| Separate / merge | **MERGE → `/browser`**. |

#### 47. `setup-browser-cookies`: `setup-browser-cookies/`
| Field | Detail |
|---|---|
| Purpose | Imports cookies from the user's real Chromium-family browser into the headless session. It stops early if Aside or CDP mode already has the user's sessions. v1.90.0.0 made imports "explicit and safe". |
| Triggers | "import cookies", "login to the site", "authenticate the browser". |
| Inputs | Browser, profile and domains (interactive picker or `--domain`/`--profile`/`--all`); `--verify-auth` (needs daemon environment variables); `--clear-storage`. |
| Outputs | Cookies in the browse context; a report (verified, not verified, not checked). |
| Tools/deps | `$B cookie-import-browser`; macOS Keychain; Windows DPAPI. |
| Workflow | Probe, status, confirm, import, report honestly. |
| Safety gates | Never guess accounts; `--all` needs consent; the picker link is single-use and expires in 5 minutes; never print cookie values; "zero imports, counts, or HTTP 200 never prove login." |
| State | Daemon context. |
| Artifacts | None. |
| External | Chrome, Comet, Dia and other Chromium browsers. |
| Strengths | Honest verification semantics. |
| Weaknesses | **Windows Chrome 136+ App-Bound Encryption is not supported.** A terse 64-line template that relies on BROWSER.md. |
| Missing | Firefox and Safari (NOT VERIFIED). |
| Improvements | A headed manual sign-in fallback as the portable default. |
| Proposed equivalent | `/browser auth`. |
| Separate / merge | **MERGE → `/browser`**. |

#### 48. `scrape`: `scrape/` (v2.0.0)
| Field | Detail |
|---|---|
| Purpose | Read-only data extraction from one page, returned as one JSON document. |
| Triggers | "scrape", "get data from", "extract from", "what's on". |
| Inputs | Intent and URL. |
| Outputs | JSON `{items, count}` between `JSON_START` and `JSON_END`; a learning. |
| Tools/deps | `aside repl` (primary); `$B skill list/show/run`, then prototyping with `goto`, `text`, `html` (fallback). |
| Workflow | Intent; refuse mutating verbs; look script, then extract script (up to 3-4 selector attempts); stop at a sign-in wall; honest failure report. |
| Safety gates | Read-only by **prose contract**; untrusted-content warning; no credentials; only tabs it opened. |
| State | `~/.<ref>/browser-skills`. |
| Artifacts | JSON on stdout. |
| External | Aside, the reference suite browser. |
| Strengths | Clean output discipline for piping; honest about failure. |
| Weaknesses | Mutation refusal is LLM keyword judgment; an evaluate script can still mutate the page. Single page only. Fragile single-quote escaping. |
| Missing | Pagination; a schema option; CSV. |
| Improvements | A read-only browser capability profile enforced by the tool layer. |
| Proposed equivalent | `/browser extract`. |
| Separate / merge | **MERGE → `/browser`**. |

#### 49. `skillify`: `skillify/`
| Field | Detail |
|---|---|
| Purpose | Codifies the last successful fallback-path `/scrape` into a permanent browser skill: `script.ts` (a pure `parseFromHtml`), a test, a fixture and a bundled SDK copy, runnable in about 200 ms. |
| Triggers | "skillify", "codify this scrape", "make this permanent". |
| Inputs | The last 10 conversation turns; AUQ for name and tier. |
| Outputs | `~/.<ref>/browser-skills/<name>/` or `<project>/.<ref>/browser-skills/<name>/` containing `SKILL.md` (`trusted: false`), `script.ts`, `script.test.ts`, `_lib/browse-client.ts`, `fixtures/`. |
| Tools/deps | `browse/src/browser-skill-write.ts` (stage, commit, discard); `$B skill test/run`. |
| Workflow | Provenance guard; name and tier; synthesize; capture the fixture; write the test; stage; run the tests (at most 2 retries); approval; commit; verify. |
| Safety gates | "Iron contract": nothing half-broken reaches disk; `trusted: false`; same-tier name collisions refused. |
| State | Browser-skill directories. |
| Artifacts | As outputs. |
| External | Browse daemon. |
| Strengths | Atomic staging; a pure parser that fixture tests can exercise; tiered shadowing (project > global > bundled). |
| Weaknesses | **Cannot codify Aside-path scrapes, which are scrape v2's default.** Fixtures go stale. The bundled SDK copy never receives security fixes. Provenance relies on conversation memory. |
| Missing | Aside path; a staleness doctor; re-skillify. |
| Improvements | Record extraction recipes as structured traces at run time, not reconstructed from chat. |
| Proposed equivalent | `/browser extract --save` → the recipe registry. |
| Separate / merge | **MERGE → `/browser`**. |

### 2.13 Artifacts

#### 15. `diagram`: `diagram/`
| Field | Detail |
|---|---|
| Purpose | Turns English or mermaid into a triplet (`.mmd`, an editable `.excalidraw`, and `.svg`/`.png`), rendered fully offline. |
| Triggers | "make a diagram", "draw the architecture", "create a flowchart". |
| Inputs | A description; the pre-built `lib/diagram-render/dist/diagram-render.html` bundle. |
| Outputs | The triplet, shown inline. |
| Tools/deps | Bash, Read, Write, AUQ; `<ref>-render.ts` (Aside or browse); `shasum`, `base64`. Preamble tier 1 (305 lines). |
| Workflow | Write the mermaid (5-15 nodes), stage the bundle (content-addressed, 0700, symlink and owner check), make one render call with three outputs, deliver. |
| Safety gates | Never ship unrendered; offline only; fix parse errors first. |
| State | None. |
| Artifacts | `./diagrams/<slug>.{mmd,excalidraw,svg,png}` in a git repo, else `/tmp/<ref>-diagrams/`. |
| External | None. |
| Strengths | Deterministic; secure staging; editable round-trip. |
| Weaknesses | `shasum` may be absent (Linux has `sha256sum`). Needs the pre-built bundle. Only flowcharts and sequence diagrams are editable. **Plan reviews produce ASCII diagrams and never call this skill** (a missed integration). |
| Missing | DESIGN.md theming; D2 and PlantUML. |
| Improvements | Make it a renderer that any skill can call through the artifact engine. |
| Proposed equivalent | Artifact renderer `diagram`. |
| Separate / merge | **SYSTEM (specialist)**, invocable directly as `/docs diagram`. |

#### 50. `make-pdf`: `make-pdf/` (13 TS source files)
| Field | Detail |
|---|---|
| Purpose | Markdown to a publication-quality PDF; also `--to html` and `--to docx`. |
| Triggers | "make pdf", "export pdf", "markdown to pdf". |
| Inputs | A `.md` file; flags `--cover`, `--toc`, `--watermark`, `--margins`, `--page-size`, header and footer templates, `--no-confidential`, `--strict`, `--allow-network`, `--tagged`, `--outline`, … |
| Outputs | The PDF path on stdout (default `/tmp/<name>.pdf`). Exit codes: 0 ok, 1 bad args, 2 render error, 3 Paged.js timeout, 4 no browser. |
| Tools/deps | `$P` binary; printing via Aside or the browse fallback; Paged.js; vendored mermaid and excalidraw; Linux fonts. |
| Workflow | One `$P generate` call; `$P preview`; `$P setup`. |
| Safety gates | Offline by default (remote images blocked); out-of-tree or symlinked images warn (fatal under `--strict`); 64 MB cap; broken diagrams render a visible diagnostic. |
| State | None. |
| Artifacts | PDF, HTML or DOCX. |
| External | Chromium or Aside. |
| Strengths | Deterministic CLI contract with exit codes; offline posture; a `pdftotext` copy-paste test. |
| Weaknesses | **A CONFIDENTIAL footer by default.** Default output in `/tmp`. The highlight.js fragmentation issue ("`--no-syntax` once that flag exists"). |
| Missing | Batch; themes. |
| Improvements | Output next to the input; the footer opt-in. |
| Proposed equivalent | Artifact renderer `pdf` (`/docs export --pdf`). |
| Separate / merge | **SYSTEM (specialist)**. |

### 2.14 Mobile (iOS)

#### 51. `ios-qa`: `ios-qa/` (daemon, templates, scripts)
| Field | Detail |
|---|---|
| Purpose | Live-device iOS QA for SwiftUI apps. A Mac daemon reaches an embedded `StateServer` over a USB CoreDevice IPv6 tunnel and runs a vision loop: screenshot → elements → state → act → verify. |
| Triggers | "ios qa", "test my iPhone app", "qa the ios app". |
| Inputs | `--source`, `--cold`, `--tailnet`, `--recording`, demo mode. |
| Outputs | A generated `DebugBridge/` SPM package plus `StateAccessor.swift`; app wiring edits (`#if DEBUG`); findings; audit log `~/.<ref>/security/ios-qa-audit.jsonl` (rotated at 10 MB). |
| Tools/deps | macOS, Xcode (`xcodebuild`, `devicectl`), Swift ≥5.9; `<ref>-ios-qa-daemon`, `-mint`, `-regen`; Tailscale for remote. |
| Workflow | 0. Warm start. 1. Compatibility gate (only file-scope `@Observable` and SwiftPM; otherwise stop). 2. Regen, build, install, launch, capture the boot token. 3. Loop with session acquire and release. |
| Safety gates | Loopback-only binding; Tailscale WhoIs identity check (fails closed); capability tiers observe < interact < mutate < restore; mint rate limit; 1 MB body limit; **Release builds refuse to link the bridge** (enforced by a CI check). |
| State | `ios-qa-session.json`, `ios-qa-daemon.pid`, audit log. |
| Artifacts | As outputs. |
| External | Xcode, Tailscale, remote agents. |
| Strengths | **A serious auth model**: boot-token rotation, short-lived session tokens, WhoIs identity, capability tiers and an audit log. Stricter than pair-agent. 10 daemon test files. |
| Weaknesses | macOS, a USB device and Xcode are required (no simulator). `@Observable` only; `.xcodeproj` apps unsupported. The warm-start cache has no writer in `daemon/src` (possibly dead, NOT VERIFIED). |
| Missing | Simulator; Android; `.xcodeproj`; a findings file. |
| Improvements | A device-target adapter behind `/qa`. |
| Proposed equivalent | Device adapter `ios`; `/qa --target ios`. |
| Separate / merge | **ADAPTER**. |

#### 52. `ios-fix`: `ios-fix/`
| Field | Detail |
|---|---|
| Purpose | Autonomous fix loop for an ios-qa finding: reproduce, root-cause, fix, rebuild, verify, regression fixture. |
| Triggers | "fix this ios bug", "auto-fix the ios issue". |
| Inputs | The ios-qa finding. |
| Outputs | Swift edits; fixtures `test/fixtures/ios-fix/<slug>-pre.json` and `-pre.png`/`-post.png`; a gated test. |
| Tools/deps | Daemon endpoints; xcodebuild. |
| Workflow | Reproduce and snapshot (Iron Law); root cause; minimal fix; rebuild; restore and compare; at most 3 iterations; regression test. |
| Safety gates | Iteration cap; revert on build failure. |
| State | Daemon session. |
| Artifacts | Fixtures, test. |
| External | Xcode, device. |
| Strengths | Evidence-first; regression fixtures. |
| Weaknesses | "Zero human intervention" with no freeze boundary. `restore` needs a tier the skill never obtains. The regen command is inconsistent with ios-qa's. Screenshot comparison is LLM judgment. |
| Missing | Pixel or state diff; freeze integration. |
| Improvements | Route through `/debug` with the safety engine. |
| Proposed equivalent | `/debug --target ios`. |
| Separate / merge | **MERGE → `/debug`**. |

#### 53. `ios-design-review`: `ios-design-review/`
| Field | Detail |
|---|---|
| Purpose | HIG and DESIGN.md visual audit on a real device, scoring 10 dimensions 0-10. |
| Triggers | "review the ios design", "audit the iphone app visuals". |
| Inputs | Screen list or auto-discovery. |
| Outputs | `~/.<ref>/projects/<slug>/ios-design-review-<date>.md`; an AUQ for each score below 7. |
| Tools/deps | Bash, Read, Glob, Grep, AUQ (**no Write**); daemon (`observe` tier). |
| Workflow | Acquire an observe session; per screen, screenshot, elements, rubric; report. |
| Safety gates | Read-only tier. |
| State | Report. |
| Artifacts | Report. |
| External | Device. |
| Strengths | Mirrors the plan-design rubric; read-only tier. |
| Weaknesses | Contrast and pt sizes are LLM estimates from screenshots, not measured, even though `/elements` returns frames. Tool list mismatch. |
| Missing | Measured touch targets and contrast. |
| Improvements | Compute them from element frames. |
| Proposed equivalent | `/design audit --target ios`. |
| Separate / merge | **MERGE → `/design`**. |

#### 54. `ios-clean`: `ios-clean/`
| Field | Detail |
|---|---|
| Purpose | Guided removal of DebugBridge and its wiring. |
| Triggers | "remove debugbridge", "strip the reference suite ios instrumentation". |
| Inputs | App source directory. |
| Outputs | Edits; deletions. |
| Tools/deps | Bash, Read, Edit, Glob, Grep, AUQ; xcodebuild, swift, `nm`. |
| Workflow | Inventory, then per-item removal, then a Release build, then verification by grep, `swift build -c release` and `nm`. |
| Safety gates | Per-item AUQ; git-reversible. |
| State | — |
| Artifacts | — |
| External | Xcode. |
| Strengths | A three-way verification. |
| Weaknesses | **Misses the local `DebugBridge/` package directory** and `.<ref>-version`. **Its Release "verification" installs onto the device, replacing the installed app.** |
| Missing | A `regen --remove` counterpart. |
| Improvements | Build-only verification. |
| Proposed equivalent | iOS adapter `uninstall`. |
| Separate / merge | **ADAPTER**. |

#### 55. `ios-sync`: `ios-sync/`
| Field | Detail |
|---|---|
| Purpose | Regenerates the bridge package and accessors against the current templates. |
| Triggers | "regenerate ios accessors", "resync the ios debug bridge". |
| Inputs | `APP_SOURCE_DIR`. |
| Outputs | An updated `DebugBridge/` and `StateAccessor.swift` plus `.<ref>-version`. |
| Tools/deps | `<ref>-ios-qa-regen`; swift. |
| Workflow | Version compare, then regen (hash-cached, ~50 ms no-op), then diff review, then build and relaunch. |
| Safety gates | Handwritten files untouched; `git restore` on compile failure. |
| State | `.<ref>-version`. |
| Artifacts | Regenerated files. |
| External | Xcode. |
| Strengths | Deterministic and cached. |
| Weaknesses | An LLM-judged early exit that duplicates the regen cache. Local patches are lost by design. |
| Missing | A template changelog. |
| Improvements | — |
| Proposed equivalent | iOS adapter `sync`. |
| Separate / merge | **ADAPTER**. |

### 2.15 Code quality & evaluation

#### 56. `deslop-shared-libs`: `deslop-shared-libs/`
| Field | Detail |
|---|---|
| Purpose | Read-only audit that finds up to 5 shared-code extraction opportunities from the last 14 days of work and recommends 3. |
| Triggers | "find code worth sharing", "shared-code extraction opportunities". |
| Inputs | Repo; optional scope or window. |
| Outputs | Chat only: provenance block, an idea table with immutable links, ranked recommendations. |
| Tools/deps | Bash, Read, Glob, Grep; `gh api --method GET`; a hardened git prefix (`GIT_OPTIONAL_LOCKS=0 … -c core.fsmonitor=false`); `python3 -I -S`. |
| Workflow | Source revisions, commits and PRs in the window, older PRs (bounded budget), rubric, recheck, report. |
| Safety gates | **The most rigorous hostile-repo read posture in the reference suite**: no temp files, no git transports, no `git status` (clean filters could execute), no running project code; content treated as evidence. **But every guard is prose, with no hook.** |
| State | None. |
| Artifacts | None. |
| External | GitHub API. |
| Strengths | Honest coverage disclosure; bounded API budgets. |
| Weaknesses | Guards are unenforced; dense; GitHub-centric. |
| Missing | Hook-based enforcement; saved report. |
| Improvements | Enforce through a `hostile-read` safety profile. |
| Proposed equivalent | `/health --lens reuse` running under the `hostile-read` tool profile. |
| Separate / merge | **MERGE → `/health`**. |

#### 26. `benchmark-models`: `benchmark-models/`
| Field | Detail |
|---|---|
| Purpose | Runs the same prompt or skill through Claude, GPT (Codex CLI) and Gemini and compares latency, tokens, cost and, optionally, quality via an LLM judge. |
| Triggers | "benchmark models", "compare models", "model shootout". |
| Inputs | Prompt (a skill, inline text or a file); providers; judge opt-in. |
| Outputs | Table (fastest, cheapest, best quality, best overall); JSON. |
| Tools/deps | Bash, Read, AUQ; `bin/<ref>-model-benchmark` (which imports `test/helpers/benchmark-runner`); the `claude`, `codex` and `gemini` CLIs. |
| Workflow | Binary, prompt, `--dry-run` auth check, judge opt-in (~$0.05), run, interpret, save. |
| Safety gates | Dry run first; the judge is never automatic; cost shown. |
| State | `~/.<ref>/benchmarks/`. |
| Artifacts | JSON. |
| External | Anthropic, OpenAI, Google. |
| Strengths | Auth preview; opt-in judge. |
| Weaknesses | Saving re-runs the benchmark (double cost, different numbers). The judge credential check can give a false positive. Skill listing only works when cwd is the reference suite repo. The production binary depends on `test/helpers`. One run per provider, so no variance. |
| Missing | Repeated trials and statistics; tool-use fidelity scoring. |
| Improvements | Part of the evaluation engine. |
| Proposed equivalent | Evaluation engine `model-compare`. |
| Separate / merge | **SYSTEM**. |

#### Browser recipes: `browser-skills/*` (e.g. `hackernews-frontpage`)
| Field | Detail |
|---|---|
| Purpose | Bundled, pre-codified browser skills in the same format skillify produces (`SKILL.md` + `script.ts` + test + fixture). |
| Tiering | Project > global > bundled (the shadowing rule in skillify). |
| Proposed equivalent | Browser recipe registry (versioned, signed, with a doctor for SDK drift). |
| Verdict | **SYSTEM**. |

---

## 3. Consolidated verdicts → our skill set

| Our capability | Absorbs the reference suite skills | Kind |
|---|---|---|
| `/discover` | office-hours, spec | User-facing |
| `/plan` (lenses: product, engineering, design, dx; `--auto`) | plan-ceo-review, plan-eng-review, plan-design-review, plan-devex-review, autoplan | User-facing |
| `/design` (system, explore, build, audit) | design-consultation, design-shotgun, design-html, design-review, ios-design-review | User-facing |
| `/build` | *new; the reference suite has no dedicated implementation skill* | User-facing |
| `/debug` | investigate, ios-fix | User-facing |
| `/review` | review (+ the review modes of codex and claude-code) | User-facing |
| `/security` | cso | User-facing |
| `/qa` (web, ios, api, cli; lenses; `--report-only`) | qa, qa-only, devex-review, ios-qa | User-facing |
| `/perf` | benchmark | User-facing |
| `/ship` | ship | User-facing |
| `/deploy` (setup, land, monitor, status, rollback) | land-and-deploy, setup-deploy, canary, landing-report | User-facing |
| `/docs` (sync, generate, diagram, export) | document-release, document-generate, diagram, make-pdf | User-facing |
| `/health` (+ reuse lens) | health, deslop-shared-libs | User-facing |
| `/retro` | retro | User-facing |
| `/browser` (open, extract, auth, share, recipes) | browse, `open-<ref>-browser`, connect-chrome, pair-agent, setup-browser-cookies, scrape, skillify | User-facing |
| `/guard` | careful, guard, freeze, unfreeze | User-facing control → Safety engine |
| `/resume`, `/memory` | context-save, context-restore, learn, plan-tune | User-facing → State and Memory engines |
| Specialist `second-opinion` | codex, claude-code | Specialist |
| Specialist renderers | diagram, make-pdf | Specialist |
| Adapters | setup-gbrain, sync-gbrain, ios-qa, ios-clean, ios-sync, deploy platforms, VCS, trackers | Adapter layer |
| System | The reference suite (router), `<ref>-upgrade`, benchmark-models, contrib/add-host, browser-skills | Internal |
