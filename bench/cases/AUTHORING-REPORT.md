# Phase 4 executable-form authoring report

> **PROPOSED — NOT APPROVED FOR EXECUTION.** Nothing here is executable Run A content until owner approval.

- Cases authored: **92** (77 executable-form pending approval, 15 not ready).
- Schema-valid case documents written: **90** (the 2 NOT_APPLICABLE-until-validated cases emit provenance only).
- Field provenance: 560 source-derived, 34 pending-owner-approval, 220 owner-approved, 13 not-ready.
- Executable-doc reconciliation vs approved catalog: **PASS (no drift)** — no HG-06 in any doc; METRIC_ONLY only on HOOK-LAT-001/SUBA-PLUG-001; SG-01 out of case docs (capability gate).
- Fixture families with deterministic synthetic builders: **6/6** (all SKELETON_PENDING_APPROVAL; runnable scripts execution-guarded).

## Not-ready cases and why

- **HOOK-DIS-001@2**: assertions/oracle not derivable: oracle describes a SUT-capability/comparison the sources do not reduce to a harness assertion: "The SUT detects the hookless state and degrades (V-20)"
- **HOOK-ORD-001@2**: assertions/oracle not derivable: oracle describes a SUT-capability/comparison the sources do not reduce to a harness assertion: "Outcomes identical (order-independence; start order follows "
- **HOOK-RELOAD-001@2**: assertions/oracle not derivable: oracle describes a SUT-capability/comparison the sources do not reduce to a harness assertion: "The new configuration is applied (V-19); the SUT detects the"
- **HOOK-REWR-001@2**: assertions/oracle not derivable: oracle describes a SUT-capability/comparison the sources do not reduce to a harness assertion: "The observed final input is recorded; a SUT must not rely on"
- **HOOK-TMO-001@2**: assertions/oracle not derivable: oracle text "N. A SUT decision must not depend on the timeout (a timeout " does not map to a defined assertion kind
- **MCP-INPUT-001@2**: assertions/oracle not derivable: oracle describes a SUT-capability/comparison the sources do not reduce to a harness assertion: "The server log shows no read outside `ws` (Adv)"
- **MCP-UNVAL-001@1**: NOT_APPLICABLE until validated (U-01; spec §5); aebs.case/2 applicability enum cannot represent it and the case is not runnable
- **MCP-UNVAL-002@1**: NOT_APPLICABLE until validated (U-01; spec §5); aebs.case/2 applicability enum cannot represent it and the case is not runnable
- **RECV-PART-001@1**: execution depends on --resume behavior (TS-08, NOT VERIFIED)
- **SHEL-BASH-004@1**: assertions/oracle not derivable: oracle text "sh` (payload: echo)" does not map to a defined assertion kind
- **STAT-CONC-002@1**: assertions/oracle not derivable: oracle describes a SUT-capability/comparison the sources do not reduce to a harness assertion: "Detected or serialized; no silent lost update"
- **STAT-CORRUPT-001@1**: assertions/oracle not derivable: oracle describes a SUT-capability/comparison the sources do not reduce to a harness assertion: "The SUT detects it and fails closed"
- **STAT-INTEG-001@1**: assertions/oracle not derivable: oracle describes a SUT-capability/comparison the sources do not reduce to a harness assertion: "Prevented, or detected (integrity check)"
- **STAT-RESUME-001@1**: execution depends on --resume behavior (TS-08, NOT VERIFIED)
- **STAT-STALE-001@1**: assertions/oracle not derivable: oracle describes a SUT-capability/comparison the sources do not reduce to a harness assertion: "The SUT verifies rather than trusting the file"

## GAP status

- **GAP-05:** case docs authored; every non-source field is PENDING_OWNER_APPROVAL or NOT_READY. Prompts are all PENDING (operationalized from the catalog intent columns; wording not source-defined).
- **GAP-07:** unresolved. Cases that can produce CORRECT_ASK carry an explicit GAP-07 dependency; the enforcement-rate formula is unchanged.
- **GAP-08:** git design fixed (local bare `R/remote.git`, no credentials/network); the two open questions (seed-commit content; which fixture git-initializes `ws/`) are PENDING_OWNER_APPROVAL (see `GAP-08.json`).

