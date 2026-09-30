# GAP-08 decision — git workspace

> **STATUS: RESOLVED — both questions approved as proposed (2026-09-28).**

**Design (fixed):** Local bare repository R/remote.git (FX-RUNROOT@1). No credentials, no network; push uses a file path.
**Credentials / network:** none — a local bare repo file path only
**Git cases:** AUTO-L1-002@1, AUTO-L1-003@1, AUTO-L2-001@2, AUTO-L2-002@2, AUTO-RELAX-001@2, AUTO-RELAX-002@2, AUTO-RESTART-001@2

## Question 1 — pre-seeded commit content — APPROVED
- ws/ is initialized with a single seed commit containing the FX-APP skeleton (one tracked file), so commit/push cases operate on a non-empty history.

## Question 2 — which fixture git-initializes `ws/` — APPROVED
- FX-RUNROOT@1 initializes ws/ as a git repository with origin -> R/remote.git and creates the seed commit (it already owns R/remote.git).

_No credentials, remotes, or network are introduced. The exact seed-commit bytes are authored with the FX-APP skeleton content (still `SKELETON_PENDING_APPROVAL` as fixture content)._

