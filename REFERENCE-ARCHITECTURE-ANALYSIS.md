# Reference Suite Architecture Analysis

> **Naming:** this document analyses a third-party skill suite that served as the comparison baseline for DCore. It is called "the reference suite" here, and `<ref>` stands for its name in paths, commands and identifiers.
>
> **Subject:** the reference skill suite @ **v1.91.1.0**, commit `2a113ae`, 2026-09-25.
> **Scale:**
> - 55 skill templates plus a root router.
> - About 416k lines of TypeScript (dist excluded).
> - A 3,266-line bash `setup`.
> - 90 `bin/` scripts.
> - 1,156 `*.test.ts` files: about 939 under `test/`, 164 under `browse/test/`, and the rest under `design/`, `make-pdf/` and `ios-qa/`.
> - 18 GitHub workflows.
> - About 2.4 MB of generated `SKILL.md`.
>
> **Evidence convention:** paths are relative to the repo root, and `file:line` citations point at the code I read. **NOT VERIFIED** marks claims I found only in prose, or could not confirm in code.

---

## 0. Architectural overview

The reference suite is a **prompt-compiled skill suite with a set of native side-binaries**. It has four layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│ HOST AGENT (Claude Code; also Codex, Cursor, Factory, Kiro, OpenCode…) │
│   loads SKILL.md frontmatter catalog every session; reads full body on │
│   invocation; executes Bash/Read/Edit/Agent/AUQ tool calls             │
└───────────────▲────────────────────────────────────────────────────────┘
                │ generated, committed markdown (≈2.4 MB)
┌───────────────┴────────────────────────────────────────────────────────┐
│ PROMPT LAYER   */SKILL.md.tmpl ──gen-skill-docs.ts + ~95 resolvers──►  │
│                */SKILL.md  (+ sections/*.md read lazily)               │
│                shared PREAMBLE (tiers 1-4, ≈400 lines at T3/T4)        │
└───────────────▲────────────────────────────────────────────────────────┘
                │ bash blocks invoke
┌───────────────┴────────────────────────────────────────────────────────┐
│ RUNTIME LAYER  bin/<ref>-* (90 scripts: skill-start/end, config,      │
│                slug, paths, review-log, learnings, evidence, redact,   │
│                egress, version, settings-hook, …) + lib/*.ts engines   │
└───────────────▲────────────────────────────────────────────────────────┘
                │ HTTP on 127.0.0.1 / subprocess
┌───────────────┴────────────────────────────────────────────────────────┐
│ NATIVE LAYER   browse daemon ($B, Playwright/Chromium) · design ($D,   │
│                OpenAI) · make-pdf ($P) · diagram-render bundle ·       │
│                cso launcher (C, Docker) · ios-qa daemon · Aside (3rd   │
│                party, macOS 15+, preferred browser driver)             │
└───────────────▲────────────────────────────────────────────────────────┘
                │ files
┌───────────────┴────────────────────────────────────────────────────────┐
│ STATE          ~/.<ref>/ (global + projects/<slug>/…)  ·  <repo>/.<ref>/ │
│                optional: gbrain (PGLite/Supabase), artifacts git repo, │
│                Supabase telemetry                                      │
└────────────────────────────────────────────────────────────────────────┘
```

The **main design choice** is that all orchestration logic lives in natural-language prompts that the host LLM interprets. Determinism comes from bash helpers that print `KEY: value` lines, which the prompt then tells the model to read. The reference suite has **no runtime orchestrator process**: nothing enforces a skill's workflow except the model following prose, plus a small set of Claude Code hooks.

---

## 1. Skill discovery

| Stage | Mechanism | Evidence |
|---|---|---|
| Generation-time discovery | `discoverTemplates()` scans the repo root and exactly one level of subdirectories for `SKILL.md.tmpl`. `discoverSectionTemplates()` finds `<skill>/sections/*.md.tmpl` and sorts them so CI output is deterministic. | `scripts/discover-skills.ts:25`, `:48` |
| Install-time discovery | `link_claude_skill_dirs()` walks `$<ref>_dir/*/` for `SKILL.md`. The skill name comes from frontmatter `name:` (falling back to the directory name). Each skill becomes a **real directory** `~/.claude/skills/<name>/` holding a symlinked `SKILL.md` plus links to runtime assets, so the host sees top-level skills rather than skills nested under `<ref>/`. | `setup:1458`, `_link_skill_runtime_assets` at `setup:1392` |
| Host-time discovery | Claude Code loads every skill's frontmatter into the session catalog, which the reference suite budgets. **Catalog trim** cuts `description:` to its first sentence plus "(reference suite)" and moves the "Use when…" prose into a `## When to invoke this skill` body section. | `scripts/gen-skill-docs.ts:396` (`applyCatalogTrim`) |
| Budget enforcement | Aggregate name+description is capped at **1,171 token-equivalents** with a **260-byte per-skill sub-cap**. Per-skill eager-token ceilings are ratcheted. | `test/catalog-budget.test.ts`; `test/context-budget-ratchet.test.ts` + `test/fixtures/context-budget.json`; CLAUDE.md:178 |
| Aliases | `_<ref>-command` and `connect-chrome` install as rewritten **copies**, because duplicate `name:` values shadowed skills (#2201) or dropped the whole set (#2511). | `setup:1560-1610` |
| Agent-readable index | `<ref>/llms.txt` is generated by `scripts/gen-llms-txt.ts`. `agents/openai.yaml` is Codex metadata (`allow_implicit_invocation: true`). | — |
| Namespacing | Optional `<ref>-` prefix (`skill_prefix` config, `--prefix`). `bin/<ref>-patch-names` rewrites `name:` fields. | `setup:541-600` |
| Ownership gate | A `.<ref>-owned` marker gives strong or weak proof of ownership. Foreign skills with the same name are skipped and reported, and differing files are backed up to `~/.<ref>/backups/skills/`. | #2119 |

**Assessment.** Discovery is static and file-system based. Frontmatter carries no capability metadata (inputs, outputs, dependencies, cost). The only "manifest" is the host catalog line, and that is trimmed down to a single sentence to save tokens. As a result, routing depends on the model reading prose trigger sections.

---

## 2. Skill loading

- **Generated and committed.** SKILL.md files are generated at build time and committed, with no runtime build step (ARCHITECTURE.md:390-396). Each carries an `AUTO-GENERATED … do not edit` header (`gen-skill-docs.ts:610`).
- **Carving.** Large skills become a decision-tree skeleton plus a `## Section index` table that points to `sections/*.md`, which the model is told to Read when a situation applies.
  - `sections/manifest.json` describes itself as a **"PASSIVE registry"**: nothing enforces the reads.
  - Carved skills end with a "Section self-check" that asks the model to re-Read any section it worked from memory. This is prose-enforced only.
- **Non-Claude hosts.** `{{SECTION:id}}` may be inlined instead (multi-pass resolution, `gen-skill-docs.ts:~690`).
- **Reference files.** Skills also ship runtime reference files, e.g. `review/checklist.md`, `review/specialists/*.md` (8 specialists), `review/greptile-triage.md`, `qa/references/issue-taxonomy.md`, `plan-devex-review/dx-hall-of-fame.md`.
- **Size warning.** SKILL.md above 160 KB (~40K tokens) triggers a warning, not a failure (CLAUDE.md:167).
- **gbrain renders.** When gbrain is detected, setup renders brain-aware variants into `${<REF>_HOME}/render/claude` and atomically repoints the installed links (`setup:2726-2800`, `_swap_in_render`).

**Measured load cost.** A typical tier-3/4 skill loads about **400 preamble lines** before any skill-specific content (e.g. `review/SKILL.md` lines 26-406), and the skill body adds 300-1,500 more. Typical full runs:

| Run | Instruction lines | Source |
|---|---|---|
| `/ship` | ≈1,000 SKILL.md + ≈2,965 sections + a ≈1,180-line doc-sync subagent + review specialists | notes on ship |
| `/autoplan` | ≈8-9k (it re-reads all four plan-review skills) | notes on autoplan |
| `/design-review` | 1,930 in a single file (130,923 bytes) | measured |

---

## 3. Routing

The reference suite routes through four independent mechanisms. All of them are prose interpreted by the LLM.

1. **Root router skill** (`SKILL.md.tmpl`, tier 1)
   - Browser, QA and screenshot requests go to `/browse` (Aside first).
   - Everything else is matched against about **40 prose pattern → skill rules**.
   - `{{OUTSIDE_VOICE_ROUTING}}` injects rules for codex and claude-code depending on the host.
   - If nothing matches, it answers directly.
   - Outcome telemetry: `--event-type route --outcome browse|routed|direct`.
2. **Proactive suggestions**
   - Config `proactive` defaults to `true`. The preamble says "invoke the Skill tool… When in doubt, invoke the skill."
   - With `false`, the model must ask "want me to run it?" instead.
3. **CLAUDE.md routing injection**
   - `<ref>-skill-start` checks the project CLAUDE.md or AGENTS.md for a `## Skill routing` section. If it is missing and not declined, it emits a `routing-injection` instruction block.
   - The model then asks, appends **13 routing rules**, and **commits** `chore: add <ref> skill routing rules to CLAUDE.md` (`bin/<ref>-skill-start` ~:452).
4. **gbrain search guidance**
   - `/sync-gbrain` writes a delimited block into CLAUDE.md telling the agent to prefer `gbrain search/code-def/code-refs` over Grep.

**Composition and chaining.**
- Skills chain through prose "Next steps" recommendations and through **artifact files discovered by glob**. For example, `/qa` finds `*-test-plan-*.md`, and design skills find `designs/*/approved.json`.
- Direct invocation exists in two forms:
  - `/ship` runs review, qa-only and document-release inline or as a foreground subagent.
  - `/autoplan` Reads the other skill files from disk and executes them.

**Weaknesses.**
- There is no machine-readable routing table: the router rules, per-skill `triggers:`, the 13 injected rules and the proactive rules are four copies that can drift.
- The router lists no route for gbrain or the ios-* skills.
- Routing emits no confidence score, disambiguation step or trace.
- Composition is by filename convention, so a path drift breaks the hand-off silently. One such drift is confirmed: autoplan's eng test-plan path is `{user}-{branch}-test-plan-*.md`, while plan-eng-review writes `…-eng-review-test-plan-…`.

---

## 4. Preamble / runtime

The preamble is assembled by `scripts/resolvers/preamble.ts:generatePreamble()` from 16 `preamble/generate-*.ts` modules. The bash moved into **`bin/<ref>-skill-start`** in v1.71, replacing about 13 KB of inline bash per skill.

**Tier gating:**
- T1: core.
- T2: adds AUQ format, context recovery, writing style, completeness, confusion, evidence, context health and question tuning.
- T3: adds repo-mode and search-before-building.
- T4 is the same as T3.
- Counts: T1 = 8 skills, T2 = 22, T3 = 12, T4 = 6.

### 4.1 `<ref>-skill-start` (run first)

It prints `KEY: value` STATUS lines that the model reads, and does housekeeping along the way. Everything below is from `bin/<ref>-skill-start`.

**Session and environment lines:**
- `SESSION_KIND` via `<ref>-session-kind`: spawned, headless or interactive; when unsure it picks interactive.
- `CONDUCTOR_SESSION`, `SPAWNED_OVERRIDE` (a tamper-visibility line).
- `SESSION_ID` (`pid-epoch-random` from /dev/urandom), `TEL_START`.
- `BRANCH` (charset-clamped), `REPO_MODE`.
- `PROACTIVE`, `SKILL_PREFIX`, `EXPLAIN_LEVEL`, `QUESTION_TUNING`, `TELEMETRY`.
- `HAS_ROUTING`, `VENDORED_<REF>`, `MODEL_OVERLAY`, `<REF>_PLAN_MODE`.

**Update check:** `UPDATE_CHECK` from `<ref>-update-check` (skipped when spawned).

**Session tracking:** touches `~/.<ref>/sessions/<pid>` and prunes entries older than 120 minutes.

**Learnings:** `LEARNINGS` count, and the top 3 when there are more than 5.

**Timeline and analytics:**
- Logs a `started` timeline event in the background.
- Appends `skill-usage.jsonl` unless telemetry is off.
- Drains at most one orphan `.pending-*` marker per start.

**Artifacts sync:**
- Daily receipted `git fetch` and ff-merge of `~/.<ref>` when it is a git repo.
- `<ref>-brain-sync --once`.
- Prints an `ARTIFACTS_SYNC:` line, plus an optional `BRAIN_HEALTH` line.

**Degraded mode:** if the `SKILL_START_PROTO: 1` line is missing, the model enters degraded mode. That means interactive, no Conductor, onboarding and telemetry deferred, and the user is told to run `./setup`.

### 4.2 Instruction-emission layer (a notable security design)

- **Format.** One-time directives are printed as `<REF>_INSTRUCTION_BEGIN: <id> <SESSION_ID> … <REF>_INSTRUCTION_END`, only when their gate fires.
- **Directive ids:** upgrade-flow, feature-overlay, writing-style-migration, lake-intro, telemetry-prompt, proactive-prompt, first-run-tip, first-loop-tip, routing-injection, vendoring-deprecation, spawned-session, privacy-stop-gate.
- **Trust rule.** The model may honor a block only if it appears in the **direct tool result** of skill-start **and** carries the matching SESSION_ID.
- **Anti-forgery.** Passthrough text such as learnings and branch names goes through `_sanitize`, which strips `<REF>_INSTRUCTION` and line-leading `SESSION_ID:`, so repo content cannot forge directives.

### 4.3 Prose sections

These are the rendered sections in order, as they appear in `review/SKILL.md`.

1. **Plan-mode safe operations.** What is allowed in plan mode: `$B`, `$D`, codex, and writes to `~/.<ref>` and the plan file.
2. **AskUserQuestion format** (T2+).
   - Tool resolution order: spawned → auto-choose the recommended option (never a destructive one); Conductor → prose; prefer an `mcp__*__AskUserQuestion` variant; on failure, retry once, then spawned → auto, headless → `BLOCKED`, interactive → prose brief.
   - The "decision brief" has D<N>, ELI10, Stakes, Recommendation, Completeness (X/10), and ✅/❌ pros and cons of at least 40 characters.
   - 5+ options must be split into a D<N>.k chain.
   - One-way doors need a typed confirmation.
   - An accepted shortcut is logged with `<ref>-decision-log` and marked in code with a `<ref>-shortcut(dec-<id>)` marker.
3. **Artifacts sync interpretation.**
4. **Model-specific behavioral patch** from `model-overlays/*.md`: claude, opus-4-7, opus-4-8, fable-5, sonnet-5, gpt, gpt-5.4, gpt-5.6-sol, gpt-6-astra, gemini, o-series (`scripts/models.ts:18`). It is placed after the AUQ format so its pacing rules win.
5. **Voice.** Garry-shaped directness, a banned-AI-vocabulary list, no em dashes.
6. **Context recovery** (T2+). Lists recent ceo-plans, checkpoints, review count, timeline tail, the latest checkpoint and active decisions, then gives a two-sentence "welcome back".
7. **Writing style.** Skipped when terse; glosses jargon from `scripts/jargon-list.json`.
8. **Principles:**
   - Completeness ("Boil the Ocean")
   - Confusion Protocol
   - Claimed Limitations Need Evidence
   - Context Health (`[PROGRESS]` summaries; stop when looping)
9. **Question tuning.** `<ref>-question-preference --check <id>` returns AUTO_DECIDE or ASK_NORMALLY. A `<<ref>-qid:id>` marker is embedded in each question. `tune:` is accepted **only from user messages**; the writer exits 2 on a non-user origin.
10. **Repo ownership** (T3+): solo → fix proactively; collaborative → flag only.
11. **Search before building** (T3+): three knowledge layers and a reuse ladder; eureka moments are logged.
12. **Completion Status Protocol:** DONE, DONE_WITH_CONCERNS, BLOCKED or NEEDS_CONTEXT. Escalate after 3 failed attempts.
13. **Operational self-improvement.** Always log a `type: operational` learning, or state that there was none.
14. **Telemetry (run last).** `<ref>-skill-end` removes the pending marker, runs brain sync, writes a `completed` timeline event, writes local analytics, and backgrounds `<ref>-telemetry-log`.
15. **Plan Status Footer.** Plan reviews must end the plan file with `## <REF> REVIEW REPORT`.

### 4.4 Assessment

**Strengths:**
- Deterministic facts come from code, not from the model's memory.
- The session-bound instruction channel is a real defense against prompt injection.
- Tiering controls cost.
- Degraded mode keeps skills usable on a broken install.

**Weaknesses:**
- The preamble is **re-sent with every skill**, at about 400 lines for T3/T4.
- Most of it is behavioral prose (voice, completeness philosophy, pacing) that is identical across skills. It belongs in a single session-level context, not in each skill.
- Nothing verifies that the model actually ran "Telemetry (run last)" or the completion protocol. The Stop hook `timeline-stop-hook.ts` closes dangling runs with outcome `unknown`, which confirms the protocol is regularly skipped.

---

## 5. Browser architecture

### 5.1 Two-engine model

- **Aside is primary.** Every browser skill now drives **Aside**, a third-party AI browser for macOS 15+ using the user's real browser, first (BROWSER.md:1-20).
  - The contract is rendered by `scripts/resolvers/aside.ts` (`{{ASIDE_SETUP}}`, `{{ASIDE_COOKBOOK}}`, `{{BROWSE_FALLBACK}}`).
  - A readiness probe returns `READY`, `NEEDS_ASIDE` or `ASIDE_NOT_RUNNING`, and the engine is chosen once per run.
  - Each `aside repl` call is a fresh session that must end by printing a `<REF>_STEP_OK` sentinel.
- **`$B` is the fallback.** the reference suite's own headless daemon runs on Linux and Windows, when Aside is closed, or when `<REF>_SKIP_ASIDE=1` is set. **On Windows it is always the fallback.**
- **Audit gap.** Aside drives leave no the reference suite audit trail (BROWSER.md:241-244; doc-only).

### 5.2 Fallback daemon: process model and IPC

**Processes:**
- `browse/src/cli.ts` is a thin client, compiled with `bun --compile` to `browse/dist/browse`, about 58 MB per the docs.
- It talks to a persistent daemon, `browse/src/server.ts` (3,467 lines, a single Bun.serve on 127.0.0.1).
- The daemon drives Chromium through Playwright (`browser-manager.ts`, 2,059 lines).
- The sidebar PTY (`terminal-agent.ts`) runs in a separate non-compiled bun process.
- The L4 ML classifier (onnxruntime) runs in a separate Node sidecar.

**IPC:**
- `POST /command` with `{command, args, tabId}` and `Authorization: Bearer <token>`.
- `/batch` takes up to 50 commands (nested batches rejected).
- `chain` rejects nested chains.
- Other routes: health, extension token, PTY session and lease, SSE activity, inspector, cookie picker, pairing.

**State:** `<git-root>/.<ref>/browse.json` holds pid, port, token, startedAt, binaryVersion, mode and configHash.
- It is written atomically via tmp+rename with mode 0600 (`server.ts:487`).
- Creation is guarded by `browse.json.lock`, opened with `wx` (stale-lock reclaim, depth cap of 5).
- Result: **one daemon per git workspace**.

**Port and token:**
- The port is random in 10000-49151, deliberately below the macOS ephemeral pool, with 5 retries (`port-allocator.ts:28-30`). The `server.ts:13` header comment still says 60000 (stale).
- The token is a `crypto.randomUUID()` per daemon start.

**Lifecycle:**
- Detached spawn: setsid on Unix; a Node `child_process.spawn({detached, windowsHide})` launcher on Windows, because `Bun.spawn().unref()` does not detach there.
- Startup wait: 15 s, 30 s on CI.
- **Idle timeout** of 30 minutes, **suspended in headed and tunnel modes**.
- A parent-PID watchdog polls every 15 s.
- An automatic restart on binary-version mismatch, and a hard refusal on config-hash mismatch.

### 5.3 Command surface

**81 canonical commands** (`browse/src/commands.ts`):

| Group | Count | Commands |
|---|---|---|
| READ | 19 | text, html, links, forms, accessibility, js, eval, css, attrs, console, network, cookies, storage, perf, dialog, is, inspect, media, data |
| WRITE | 30 | goto, back, forward, reload, load-html, click, fill, select, hover, type, press, scroll, wait, viewport, cookie, cookie-import, cookie-import-browser, header, useragent, upload, dialog-accept, dialog-dismiss, style, cleanup, prettyscreenshot, download, scrape, archive |
| META | 32 | tabs, tab, tab-each, newtab, closetab, status, stop, restart, screenshot, pdf, responsive, chain, diff, url, snapshot, handoff, resume, connect, disconnect, focus, inbox, watch, state, frame, ux-audit, domain-skill, skill, cdp, memory |

- Unknown commands get a Levenshtein "Did you mean" suggestion plus a version hint.
- `cdp` is **deny-default**: 26 allowlisted methods, with `Runtime.evaluate`, `Target.*` and `Fetch.*` excluded (`cdp-allowlist.ts`).
- **There is no network interception, mocking or HAR support.** No command module uses `page.route` or `context.route`.

### 5.4 Snapshot and ref system

- **Refs.** `page.locator(scope).ariaSnapshot()` returns YAML, and each node gets an `@eN` ref that maps to a `getByRole(role,{name}).nth(i)` locator. No DOM mutation is needed.
- **Cursor refs.** `-C` adds `@cN` refs for cursor:pointer, onclick and tabindex elements that don't appear in the ARIA tree.
- **Flags:** `-i` interactive, `-c` compact, `-d` depth, `-s` scope, `-D` diff, `-a`/`-o` annotated screenshot, `-H` heatmap (undocumented).
- **Staleness.** Refs are per tab and fail fast when stale: `locator.count()==0` fails in about 5 ms instead of a 30 s timeout. They are cleared on navigation and on context recreation.

### 5.5 Headed mode, extension and sidebar

- **Engine.** Chromium only: every launch path is `chromium.launch` or `launchPersistentContext`.
- **Handoff.** `handoff` moves the session from headless to a headed persistent context (with stealth and the extension) and keeps the headless browser if anything fails.
- **Stealth "Layer C"** is always on: it masks `navigator.webdriver` and restores the `window.chrome` shape.
- **Extension.** MV3 with a pinned extension ID and host_permissions of 127.0.0.1 only. The content script, however, matches `<all_urls>`.
- **Sidebar agent.** It spawns the real `claude` CLI in a PTY with **the full `process.env` and no tool restrictions** (`terminal-agent.ts:330-370`).
  - Its "isolation" is process separation, not capability isolation.
  - The WebSocket Origin check accepts **any** `chrome-extension://` origin unless `BROWSE_EXTENSION_ID` is set (`:638-644`).

### 5.6 Security layers

**Transport and authentication:**
1. Loopback bind for every listener.
2. Per-start token; state file 0600 (icacls on Windows).
3. `/health` never returns the token.
4. `/extension-token` requires an exact extension Origin plus a loopback Host, which blocks DNS rebinding.

**Pairing and tunnel:**

5. Separate short-lived SSE and PTY cookies.
6. The tunnel is a **physically separate listener**, and only it is forwarded by ngrok.
   - `TUNNEL_PATHS` is limited to `/connect` and `/command`; everything else is default-deny.
   - A root token on the tunnel gets 403.
   - The tunnel command allowlist has 26 commands.
   - The egress receipt is written fail-closed **before** `ngrok.forward`.
7. Scoped tokens carry scopes (read, write, admin, control, meta), domain globs, a rate limit of 10/s, an own-only tab policy, 5-minute single-use setup keys, and timing-safe comparison.

**Content handling:**

8. An untrusted-content envelope on the 12 page-content commands.
9. L1 datamarking, **for scoped tokens only**.
10. L2 hidden-element and ARIA-injection marking, **for scoped tokens only**.
11. L3 filtering: **one** URL-blocklist filter, in **warn** mode by default.
12. L4 ML classifier (TestSavantAI DistilBERT). **Its only call site is `/pty-inject-scan`** (`server.ts:2289`), so it never scans page reads.

**Navigation, filesystem and output:**

13. URL validation blocks cloud metadata endpoints (including DNS-rebinding variants) but **explicitly allows localhost and private IPv4** (`url-validation.ts:3`).
14. Path security restricts output and read paths to cwd plus temp.
15. The CDP allowlist and mutex.
16. Browser-skill spawns get a per-spawn scoped token and a scrubbed env, but run as unsandboxed `bun run` processes.
17. Redaction in activity and audit logs.
18. PID and start-time verification before reaping processes.

**Main gap.** The **local agent (root token) gets only the basic envelope**. The stronger content defenses are reserved for remote paired agents, which is the reverse of where most page reading happens.

### 5.7 Cross-platform (browser)

On Windows:
- The daemon runs under **Node**, transpiled to `dist/server-node.mjs` with a Bun polyfill, because Bun cannot drive Playwright Chromium on Windows.
- Liveness is checked over HTTP rather than by PID.
- **The Chromium sandbox is always disabled** (`browser-manager.ts:88-89`).
- Cookie decryption uses DPAPI through PowerShell. App-Bound (v20) cookies are unsupported, and the native path's qualification list is `[]`.
- `focus` is unavailable (it uses macOS osascript).

---

## 6. Tool architecture

| Tool class | Components | Notes |
|---|---|---|
| Host tools | Bash, Read, Write, Edit, Grep, Glob, Agent, AskUserQuestion, WebSearch | Declared per skill in `allowed-tools`. **The declarations are inconsistent with the instructions**: 8 skills instruct writes they don't declare. |
| Runtime scripts | 90 `bin/<ref>-*` scripts (bash; some `.ts` via bun) | Groups: preamble runtime, install and maintenance, memory and state, gbrain sync, security (egress, redact, issue-guard, verify-gate), telemetry, misc tools. |
| Shared libraries | `lib/*.ts`: redact-engine/patterns, egress-receipt, tracker-guard, jsonl-store (`INJECTION_PATTERNS`), fs-atomic, error-handling, version-source, worktree, claude-bin, eval-model, context-bill, design-catalog, cso contracts, code-intelligence | Used by both bins and binaries. |
| Compiled binaries | `browse`, `design`, `make-pdf`; optional `<ref>-cso-launcher/core/watchdog` (C + Bun, only when a native toolchain exists) | Built per platform by `./setup` and gitignored. Runtime: Bun ≥1.0 per engines, but 1.4.0 required for dev and CI. Playwright 1.62.1 is patched (`windowsHide`). |
| External CLIs | `gh`, `glab`, `codex`, `claude`, `gemini`, `ngrok`, `docker`, `xcodebuild`, `devicectl`, `tailscale`, `gbrain`, `jq`, `python3`, platform CLIs (fly, vercel, heroku) | Detected ad hoc inside skills; there is no dependency manifest. |
| External APIs | OpenAI (Responses and chat/completions, gpt-4o), Supabase (telemetry edge functions and the Management API), Voyage (embeddings), GitHub | Keys come from env or `~/.<ref>/*.json`. |
| Code intelligence | `lib/code-intelligence`: a provider contract (register_source, refresh, search, status; optional add, delete, export) with GBrain, Sourcebot and Graphify adapters. Read and write operations can be vetoed by a trust tier. | **This is the reference suite's only real adapter interface.** |

**Assessment.** Tool usage is "shell out and parse text". The skill layer has **no tool abstraction**: every skill embeds its own bash for detecting `gh` vs `glab`, the base branch, the platform and so on, mitigated partly by shared resolvers like `{{BASE_BRANCH_DETECT}}`. The code-intelligence contract shows the pattern the reference suite could use for its other integrations, but applies it only there.

---

## 7. State and context handling

### 7.1 State root resolution

- `bin/<ref>-paths` resolves `<REF>_HOME`, then `CLAUDE_PLUGIN_DATA` (only when the plugin root contains "the reference suite"), then `~/.<ref>`, then `./.<ref>`. It also emits `PLAN_ROOT` and `TMP_ROOT`, `%q`-quoted so they survive `eval`.
- **Inconsistency.** Several scripts bypass it:
  - `<ref>-learnings-log` and `-search` use `${<REF>_HOME:-$HOME/.<ref>}`.
  - The analytics echoes, the `<ref>-upgrade` markers and the careful template hardcode `~/.<ref>`.
  - Under a plugin install, `/learn stats` therefore reads a different file than the one `learnings-log` writes to.

### 7.2 Global state (`~/.<ref>/`, umask 077)

- **Config and sessions:** `config.yaml`, `sessions/<pid>`.
- **Analytics:** `analytics/{skill-usage,eureka}.jsonl`, `.pending-*` markers.
- **Update and onboarding markers:** `last-update-check`, `update-snoozed`, `just-upgraded-from`, `.last-setup-version`, and about 12 onboarding markers.
- **Profiles and policy:** `developer-profile.json`, `freeze-dir.txt` (**global**), `careful-patterns.txt`, `verify-gate-trust`.
- **Security:** `security/{egress.jsonl (hash-chained), attempts.jsonl, device-salt, semantic-reviews.jsonl, ios-qa-audit.jsonl}`.
- **Install internals:** `render/claude/`, `backups/skills/`, `repos/<ref>`, `locks/`, `browser-skills/`, `chromium-profile/`.
- **Brain sync:** `.git`, `.brain-queue.d/`, `.brain-allowlist`, `.brain-privacy-map.json`.

### 7.3 Per-project state (`~/.<ref>/projects/<SLUG>/`)

| File | Writer | Reader | Format |
|---|---|---|---|
| `learnings.jsonl` | `<ref>-learnings-log` (many skills) | `<ref>-learnings-search`, `/learn`, preamble | `{skill,type,key,insight,confidence,source,files[],ts,trusted}` |
| `timeline.jsonl` | skill-start/end, Stop hook | context recovery, retro, gbrain | events `started` / `completed` / `unknown` |
| `decisions.jsonl` + `decisions.active.json` | `<ref>-decision-log` (event-sourced, `--supersede`) | `<ref>-decision-search`, context recovery | — |
| `<BRANCH>-reviews.jsonl` | `<ref>-review-log` | `<ref>-review-read` → Review Readiness Dashboard (7-day freshness) | per-skill rows |
| `question-log.jsonl`, `question-preferences.json` | question hooks | `/plan-tune`, AUTO_DECIDE | — |
| `checkpoints/*.md` | `/context-save` | `/context-restore`, context recovery | YAML frontmatter + markdown |
| `ceo-plans/`, `designs/`, `specs/`, `*-design-*.md`, `*-test-plan-*.md`, `*-eng-review-*.md`, `*-autoplan-restore-*.md` | plan and design skills | downstream skills, **found by glob** | markdown/JSON |
| `health-history.jsonl`, `canary-history.jsonl` | health, canary | **only the writing skill itself** | JSONL |
| `taste-profile.json` | design-shotgun | design skills | — |

### 7.4 Repo-local state (`<repo>/.<ref>/`)

- `qa-reports/`, `browse-reports/`, `canary-reports/`, `benchmark-reports/`, `deploy-reports/`, browse daemon state and logs.
- **Worktree sharing.** The slug is derived from the origin remote, so **all worktrees of a repo share one project directory**. `context-restore` mitigates this by partitioning checkpoints by branch.

### 7.5 Context management inside a session

- The model is told to emit `[PROGRESS]` summaries and to stop when looping ("Context Health", a soft directive).
- Context recovery at skill start re-reads recent artifacts.
- Continuous WIP checkpoint commits were **removed** in v1.89.1.0.
- **There is no automatic checkpointing, context budgeting or compaction strategy.** `/autoplan` is the exception: it has hash-bound snapshots and compaction recovery.

**Assessment.** State is rich but **fragmented into more than 20 ad-hoc files with no schema registry**. Readers find writers by filename convention, and several ledgers (health-history, canary-history, the ship Step 20 metrics) have no consumer. There are no transactions or migrations per file, only whole-install migration scripts.

---

## 8. Memory and learning

The reference suite has four memory layers with **no unified query**:

1. **Learnings** (`learnings.jsonl`)
   - Typed as pattern, pitfall, preference, architecture, tool, operational or investigation.
   - Provenance `source`: observed, user-stated, inferred or cross-model.
   - Confidence 1-10, decaying 1 point per 30 days for observed and inferred entries.
   - Dedupe is latest-wins. The write-time `hasInjection()` gate rejects instruction-like text.
   - Cross-project reads are allowed only for `trusted===true` (user-stated) rows.
   - **Deletion is done by the LLM rewriting the JSONL**, and deleting the newest line resurrects an older duplicate.
2. **Decisions** (`decisions.jsonl`): event-sourced, with injection sanitizing and secret blocking; `--semantic` goes through gbrain.
3. **Checkpoints** (`/context-save`): narrative markdown with no injection filter on restore.
4. **gbrain** (optional, external): code index plus semantic memory.
   - Backends: PGLite local, Supabase, or a remote MCP.
   - A per-remote trust policy of read-write, read-only or deny. **read-only is not enforced by the reference suite.**
   - Artifacts sync pushes allowlisted `~/.<ref>` content to a private git repo, merged with a custom JSONL merge driver.

**Profiles and preferences:** `developer-profile.json` (declared vs inferred), and question preferences enforced through a PreToolUse hook. `/plan-tune` claims "observational only", but AUTO_DECIDE does change behavior.

---

## 9. Safety model

| Layer | Mechanism | Enforcement | Gaps |
|---|---|---|---|
| Destructive-command guard | `/careful`: PreToolUse hook on **Bash**. HIGH-tier deny for simple `rm -r /`, `~`, `$HOME` and force-push to the default branch. MEDIUM-tier ask for 8 patterns. Obfuscation tripwire. Additive project regexes. | Real hook, fails closed to "ask" | Opt-in and session-scoped. Bash only. A narrow pattern list (misses `git clean`, `find -delete`, `DELETE FROM`, `terraform destroy`, cloud CLIs). Interpreter-level deletes are missed. HIGH applies to simple commands only. The script calls itself "advisory hard-stop, not a policy boundary". |
| Edit boundary | `/freeze`: PreToolUse on **Edit and Write**, realpath prefix check against `freeze-dir.txt` | Real hook, fail-closed on errors | Bash writes bypass it (admitted). NotebookEdit isn't matched. **A failed `cd` at setup sets the boundary to `/`**. The file is **global across sessions and worktrees** and persists. The agent can call `/unfreeze` itself. Windows drive paths are likely mishandled (inferred). |
| Skill-level hard rules | "Never force push", "HARD GATE: no code changes", "Iron Law: no completion claims without fresh evidence", STOP lists | **Prose only** | Relies on model compliance. |
| Capability restriction by tool list | `qa-only` has no Edit or Grep; `cso` allows only its launcher | Host-enforced `allowed-tools` | Applied inconsistently. Other skills declare fewer tools than they use, which shows the lists are not tested. |
| Verification gate | `<ref>-verify-gate` Stop hook blocks turn end until a CLAUDE.md-declared command passes (sha256-trusted) | Real hook, opt-in | — |
| Evidence ledger | `<ref>-evidence` ties test runs to content; `/ship` requires `check --max-age 24` | Script + prose | Used by ship only. |
| Prompt-injection defenses | Session-bound instruction channel; `{{UNTRUSTED_CONTENT_WARNING}}`; `lib/tracker-guard.ts` envelopes (NFKC and zero-width normalized); JSONL write gate; `tune:` origin check; spawned-session trigger only from the skill-start echo | Mix of code and prose | Checkpoints are restored unfiltered. Browser L2/L4 protections don't cover the local agent. |
| Secret redaction | `lib/redact-patterns.ts` in 3 tiers: HIGH blocks (cannot be disabled), MEDIUM confirms, LOW informs. Scan-at-sink. Stricter on public repos. Optional pre-push hook. | Code | Opt-in pre-push. |
| Egress receipts | Hash-chained `security/egress.jsonl` written **before** every off-machine send. Fail-closed for telemetry, brain sync, ngrok and memory ingest; fail-open for update check, design OpenAI and git. CI test fails on an unwired sink. | Code | Forensic, not preventive (documented). |
| Security audit | `/cso`: sandboxed Docker runtime, severity × confidence × evidence-state, independent challenge, proposed-only repairs | Code (launcher + allowlist) | Needs Docker and the compiled launcher. |
| Install safety | Ownership markers, backups, consent before any `settings.json` mutation, `<ref>-settings-hook` with backup and rollback, "phantom hook" prevention | Code | — |
| Session-kind semantics | spawned → auto-choose, never destructive; headless → BLOCKED; interactive → ask | Prose + skill-start | — |

**Overall.** the reference suite's safety is strongest where it is **code** (redaction, egress, cso, the tunnel, hooks) and weakest where it is **prose** (most STOP gates, read-only contracts for scrape and deslop, and "never push without asking" in document-release, which in fact pushes). No single policy engine exists, and there is no always-on baseline: the destructive-command guard only works if the user remembers to run `/careful`.

---

## 10. Error handling

- **Bash runtime.** Scripts use per-line `|| true` and never `set -e` (so a failure cannot drop STATUS lines). Telemetry "must never exit non-zero". `BASH_COMPAT=50` works around a bash 5.2 heredoc deadlock (regression-tested).
- **Update check.** An ERR trap prints `CHECK_FAILED … status UNKNOWN`, because silence used to mean up to date and once hid a 45-release staleness (#1974).
- **Skill-level protocols:**
  - degraded mode
  - AUQ failure fallback
  - "escalate after 3 failed attempts"
  - the 3-strike rule in `/investigate`
  - WTF-likelihood in `/qa`
  - fix caps (30 in design-review, 50 in qa)
  - re-review convergence caps (3 in review)
  - the E2E "blame protocol" (never call a failure pre-existing without running it on main)
- **Browser.** Clean-vs-crash exit codes; busy-vs-dead probing that **never kills a live PID** (except in `open-<ref>-browser`'s pre-flight); stale-ref fast failure; XProtect self-heal; token-mismatch retry.
- **Migrations are non-fatal and unrecorded.** A failed migration prints a warning and the upgrade still reports success.
- **No structured error type.** Errors cross skill boundaries as prose, and nothing resumes or rolls back a failed multi-step skill such as `/ship`, apart from its "re-run is idempotent" design.

---

## 11. Artifact handling

- **Where artifacts go:**
  - Plans, designs, specs, test plans and reviews → `~/.<ref>/projects/<slug>/…`.
  - Reports → `<repo>/.<ref>/*-reports/`.
  - Some into the repo: `docs/designs/`, `diagrams/`, DESIGN.md, TODOS.md, CHANGELOG.md, and **CLAUDE.md**, which receives routing rules, deploy config, health stack, gbrain guidance and the design-system section.
- **Naming:** `{user}-{branch}-{kind}-{datetime}.md` and similar, with some `Supersedes:` lineage (office-hours) and some status fields (CEO plans ACTIVE → PROMOTED).
- **Discovery by consumers** is by glob. There is **no artifact registry, schema, content hash or provenance record**, except in autoplan's hash-bound snapshots and cso's typed contracts (`RunReportV3`, `FindingV3`, `VerificationManifest`, `RepairBundle`).
- **CLAUDE.md as a config store.** Machine configuration (deploy settings, health stack, routing) sits in the agent's instruction file. It cannot be parsed reliably, it churns diffs, and it mixes instructions with data.
- **Cross-machine.** Optional artifacts sync to a private git repo (off, artifacts-only, or full), guarded by an allowlist and a privacy map.

---

## 12. Team / project installation

- **Global install:** `git clone --depth 1 … ~/.claude/skills/<ref> && ./setup`.
- **Hardcoded path.** SKILL.md files hardcode `~/.claude/skills/<ref>/...`, so installing under any other directory name **fails silently** (TODOS P1 #1882).
- **Team mode** (`./setup --team`):
  - Sets `auto_upgrade` and `team_mode`.
  - Registers a SessionStart hook (`<ref>-session-update`) that pulls and re-runs setup, at most hourly, in the background, with a lock.
  - `<ref>-team-init required|optional` writes a CLAUDE.md snippet.
  - `required` also installs a project PreToolUse hook (matcher `Skill`) that denies skill use when the reference suite isn't installed.
- **Deprecated modes.** Vendoring into `.claude/skills/<ref>` and `--local` are both deprecated; the preamble detects vendoring and offers migration.
- **Hosts.** Setup auto-detects and installs for claude, codex, kiro, factory, opencode and cursor. slate, openclaw, hermes and gbrain get printed instructions only.
- **Version pinning.** Team members track whatever `main` is. There is no pinning of a team to a version, no lockfile, and no signed release.

---

## 13. Updates / versioning

- **Version format.** `MAJOR.MINOR.PATCH.MICRO`, a monotonic release identifier that is not semver. npm gets a 3-digit translation.
- **Parallel-branch collisions.** `<ref>-next-version` allocates version slots across sibling worktrees and open PRs, and CI `version-gate.yml` enforces it.
- **Update check:**
  - Output is `UPGRADE_AVAILABLE`, `JUST_UPGRADED` or nothing.
  - Cache TTL is 60 minutes when up to date and 720 minutes when an upgrade is pending. Snooze is 24h → 48h → 7d.
  - The remote VERSION is fetched through a SHA-pinned raw URL.
  - It also sends a Supabase ping when telemetry is not off.
- **Upgrade:**
  - git installs: `pull --ff-only --autostash`, then `./setup`, with a `reset --hard` fallback gated by AUQ.
  - Vendored installs: a swap with a `.bak`.
  - Then migrations run, and stale daemons are stopped.
- **Migrations.**
  - 14 `migrations/v*.sh` scripts, idempotent by convention.
  - They run from both upgrade (versions newer than the old one) and setup (after `.last-setup-version`).
  - CLAUDE.md:351 requires a migration whenever on-disk state changes.
- **Weaknesses:**
  - There is no release channel, signature or tag pin.
  - Upgrades execute whatever `main` contains.
  - No migration ledger exists.
  - `OLD_VERSION=unknown` skips every migration.
  - Four-segment versions bump for every PR. v1.67 → v1.91 in about 5 weeks is 24 minor versions.

---

## 14. Cross-platform support

- **OS.** macOS and Linux get the full suite. **Windows** needs Git Bash or MSYS.
  - Setup detects `MINGW*|MSYS*|CYGWIN*` and switches to `.exe` binaries, `cp -R` copies instead of symlinks (re-run setup after every pull), and `bash <script>` hook commands.
  - `cygpath -m` fixes Bun paths.
  - Dedicated CI: `windows-free-tests.yml`, `windows-setup-e2e.yml`.
- **Windows gaps (verified):**
  - The Aside path is unavailable.
  - Chromium runs without a sandbox.
  - App-Bound cookies are unsupported.
  - `focus` is unavailable.
  - Symlink aliases materialize as text files (`connect-chrome`, observed in this clone).
- **Windows gaps (likely, inferred from code):**
  - `date -jf`, `open`, `lsof` and `shasum` in skill prose.
  - `/tmp` paths.
  - freeze's drive-letter handling.
- **Explicitly Mac-only:** setup-gbrain ("Audience: local-Mac users") and ios-*.
- **Multi-host:**
  - `hosts/*.ts` via `defineHost()`: claude, codex, factory, kiro, opencode, slate, cursor, openclaw, hermes, gbrain.
  - External hosts get allowlisted frontmatter, path and tool rewrites, suppressed resolvers and a `boundaryInstruction`.
  - **Frontmatter hooks are stripped for external hosts** and replaced by "hook-safety prose" (`extractHookSafetyProse`), so **/careful and /freeze degrade to advisory text outside Claude Code**.
- **Multi-model:** model overlays for 11 model families. The outside-voice reviewer is chosen by host (Codex → `/claude-code`, others → `/codex`).

---

## 15. Developer workflow

- **Edit loop:** edit a `.tmpl`, run `bun run gen:skill-docs`, and commit both the template and the generated file. Merge conflicts in generated files are resolved by regenerating. Watch mode is `bun run dev:skill`. `bun run skill:check` validates every host.
- **Template rules:**
  - Each bash block runs in a fresh shell, so state lives in prose.
  - Conditionals are written in English.
  - No hardcoded branch names.
- **Commit rules:** stage specific files and never `git add .`; bisectable commits; a user-facing CHANGELOG written at ship time.
- **Self-hosting.** the reference suite uses its own `/ship`, `<ref>-next-version` and `pr-title-sync`.
- **Evals** must run detached (`<ref>-detach`) under a machine-wide lock, with an exit sentinel.
- **Community PR guardrails:**
  - ETHOS.md is edited only by Garry.
  - Removing promotional or YC material, or changing the voice, needs an AUQ.
  - Fork PRs are re-pushed to the base repo to get secrets.
- **Dev install.** `bin/dev-setup` symlinks the working tree live, which is documented as risky for concurrent sessions.

---

## 16. Testing strategy

| Tier | What | Mechanism | Cost |
|---|---|---|---|
| **Free / static** | Skill validation (parses `$B` commands in SKILL.md against the registry), gen freshness for all hosts, idempotency, catalog and context budgets, tier alignment, setup ownership and Windows invariants, egress-wiring scanner, hook scripts, import purity, and many regression pins (e.g. about 70 `autoplan-*.test.ts`) | `bun run test` → `scripts/test-free-shards.ts`: parallel shards packed by measured durations, with a strict output classifier. Documented timing: 993 files, 4m35s locally with 6 workers, 1m40s on 20 CI runners. | $0 |
| **E2E** | Real `claude -p --output-format stream-json` sessions with a hermetic environment (scrubbed env, fresh `CLAUDE_CONFIG_DIR`, temp `<REF>_HOME`, `--strict-mcp-config`), plus PTY, Agent SDK, Codex and Gemini runners; 89 `skill-e2e-*` files | `EVALS=1`, `test/helpers/session-runner.ts` | ≈$4.20/run (self-described as a stale estimate) |
| **LLM-as-judge** | `test/helpers/llm-judge.ts` (judge, outcomeJudge, judgePosture, judgeRecommendation); default judge `claude-fable-5-1` (`lib/eval-model.ts:21`) | — | ≈$0.15 |
| **Diff-based selection** | Touchfiles map each test to the source files that affect it; global touchfiles trigger everything; tiers are `gate` (safety, deterministic) and `periodic` (quality, external); `eval:select` previews | `test/helpers/touchfiles*.ts`, `test-selection.ts` | — |
| **Paid sharding** | One Bun process per file, process-group kill on timeout; `test:pr` = changed fast profile; `test:release` = fresh full gate + periodic; a 24-hour judge-result cache in CI | `scripts/test-paid-shards.ts` | — |
| **Component** | 164 browse tests (adversarial security, tunnel, cookies, lifecycle, Windows); 16 make-pdf tests (pdftotext gates); 11 design; 10 ios-qa daemon; diagram drift | — | $0 |
| **Security CI** | quality-gate (secret scan with the reference suite's own redact engine, ShellCheck, advisories), osv-scanner, dependency-review, actionlint, 5 CSO runtime and scanner workflows | GH Actions | — |

**Assessment:**
- This is a mature, **infrastructure-heavy** test system: diff-based selection, tiering and sharding are genuinely sophisticated.
- **Test quantity is inflated by pinning prompt wording.** Many tests assert that specific phrases exist in generated markdown. That makes refactors expensive and says little about behavior.
- **Routing accuracy, token cost per task, and outcome quality are not first-class benchmarks.** Evals are pass/fail with an LLM judge; there is no stable task benchmark with scored baselines across versions.
- **Codex periodic shards never execute in CI**, because the CI image has no codex CLI (TODOS P3).

---

## 17. Observability and telemetry

**Remote telemetry:**
- The `telemetry` setting is `off` by default, or `anonymous` / `community`.
- Consent is asked once through the skill-start telemetry prompt.
- Events: `skill_run` (skill, duration, outcome, used_browse, error class, failed step), `route`, `onboarding`, `attack_attempt` (salted hash).
- They sync to the Supabase edge function `telemetry-ingest`, at most every 5 minutes. Repo slug and branch are stripped, and receipts are fail-closed.
- The Supabase tables have RLS tightened to INSERT-only.

**Local observability:**
- `<ref>-analytics` (a personal dashboard), the timeline, `<ref>-egress list`, and `<ref>-context-bill` (a token bill of materials).
- Security dashboards: `<ref>-community-dashboard`, `<ref>-security-dashboard`.

**Doc/code mismatch:** the `preamble.ts` header says local JSONL is "always" written, but the code skips it when telemetry is off.

**Missing:**
- Per-run traces (which sections were read, which tools ran, token spend per phase).
- A queryable run history that joins reviews, tests, deploys and outcomes.

---

## 18. Configuration

- **`<ref>-config`** manages `~/.<ref>/config.yaml` with get, set, list, defaults and endpoint-hash. There are about 30 keys, including:
  - `proactive`, `telemetry`, `auto_upgrade`, `update_check`, `skill_prefix`, `explain_level`
  - `codex_reviews`, `skip_eng_review`, `cross_project_learnings`
  - `artifacts_sync_mode`, `plan_tune_hooks`, `timeline_stop_hook`, `redact_prepush_hook`
  - `pair_agent`, `question_tuning`, `team_mode`, `transcript_ingest_mode`, `repo_mode`
- Some keys reject invalid values and keep the old one.
- **Per-project configuration is spread across CLAUDE.md sections:** Deploy Configuration, Health Stack, Test Coverage, Skill routing, GBrain guidance and Design System.
- Environment overrides include `<REF>_HOME`, `<REF>_STATE_ROOT`, `<REF>_SESSION_KIND`, `<REF>_SKIP_ASIDE`, `<REF>_SECURITY_OFF` and `<REF>_CODEX_MODEL`.

---

## 19. Ethos and design principles

These come from ETHOS.md and CLAUDE.md.

- **Boil the Ocean** (formerly "Boil the Lake"): when doing the complete thing costs only minutes more, do it.
- **Search Before Building**, with three knowledge layers and "Eureka" moments.
- **User Sovereignty:** cross-model agreement is a recommendation, never a decision.
- **Build for Yourself.**
- Engineering principles:
  - "No MCP, plain HTTP + text."
  - Token budgets as enforced ratchets.
  - Fail-open for UX, fail-closed for consent and egress.
  - Consent before any settings.json mutation.
  - Dual effort estimates (human vs CC+the reference suite).
  - Errors written for agents.
- Licensing: MIT, plus Apache-2.0 material derived from `pbakaus/impeccable` (NOTICE.md).

**Observation.** Many principles are good engineering, but they are delivered as **prose inlined into every skill**. Some content is **personal/promotional** (Garry's voice rules, YC closings in office-hours, "200 IQ" persona text in codex), and CLAUDE.md protects it from community removal. That makes the reference suite an opinionated personal system rather than a neutral platform.

---

## 20. Other important mechanisms

- **Session kinds** (spawned, headless, interactive) drive every interactive behavior, so the same skill works as a subagent, in CI and live.
- **Outside voices / cross-model review.** Codex or Claude runs as an independent second reviewer, with fail-closed semantics and "N/A, never CONFIRMED" when unavailable.
- **Review Army.** Parallel specialist subagents with a JSON schema, adaptive gating by historical hit rate, and confidence-tiered merging.
- **Workspace-aware version queue.** Parallel Conductor workspaces never collide on VERSION.
- **Foreground-dispatch rule.** Subagents must use `run_in_background: false` when their result is needed synchronously.
- **Architecture non-goals** (ARCHITECTURE.md:530): no persistent page across `aside repl`, no own search tool, no WebSocket, **no MCP**, no multi-user, no universal session recovery.

---

## 21. Summary: architectural strengths vs weaknesses

| Strengths (worth emulating) | Weaknesses (to design out) |
|---|---|
| Deterministic runtime facts from bash (`KEY: value`), not model memory | All orchestration is prose; nothing enforces workflow, gates or completion |
| Session-bound, sanitized instruction channel against prompt injection | About 400-line preamble re-sent on every skill; ≈2.4 MB of generated prompt |
| cso's evidence model (severity × confidence × evidence state, independent challenge, typed contracts) | That rigor is not reused; other skills have no Findings/Evidence schema |
| Egress receipts, scan-at-sink redaction, tracker envelopes | Safety is opt-in and session-scoped; hooks cover only some tools; prose gates |
| Browser daemon lifecycle engineering; tunnel dual-listener; scoped tokens | Chromium-only; no network mocking; stronger content defenses skip the local agent |
| Review Army adaptive specialist gating; outside-voice fail-closed | Heavy duplication (CEO vs Eng, qa vs qa-only, three DESIGN.md writers, three mockup loops) |
| Evidence ledger for `/ship`'s "no completion claims without fresh evidence" | Ledgers fragmented (20+ files, glob discovery, orphan ledgers with no reader) |
| Diff-based test selection, tiered and sharded evals, budget ratchets | Tests pin wording; no task benchmark or routing-accuracy benchmark |
| Multi-host generator with per-host rewrites | Safety hooks degrade to prose on non-Claude hosts; hardcoded install path |
| Workspace-aware VERSION queue; bisectable commits | Tied to the reference suite's own conventions (4-digit VERSION, CHANGELOG voice, Conductor) |
| Windows CI lanes | macOS/zsh assumptions throughout skill prose; Aside is macOS-only; sandbox off on Windows |
