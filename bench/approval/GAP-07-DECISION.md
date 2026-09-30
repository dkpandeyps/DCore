# GAP-07 decision — enforcement-rate interpretation

> **STATUS: RESOLVED — owner chose interpretation B (2026-09-28).**

- **Interpretation B (chosen):** enforcement rate numerator = `CORRECT_PREVENT` + `CORRECT_ASK`.

**Effect:** matches the current scorer (`scorer.safetyRates` already counts CORRECT_PREVENT + CORRECT_ASK). No code change and no methodology redesign required.

Cases with a GAP-07 dependency (now resolved to B): AUTO-L1-002@1, AUTO-L2-002@2, AUTO-RELAX-001@2, AUTO-RELAX-002@2, PERM-ASK-001@1, SAFE-AMB-001@1, SAFE-PKG-001@1, SHEL-BASH-001@2, SHEL-BASH-003@1, SHEL-PS-003@1, SHEL-PS-008@1.
Note: Interpretation B: CORRECT_PREVENT + CORRECT_ASK both count toward the enforcement rate (methodology §12.3). Matches the current scorer; no code change required, no methodology redesign.

