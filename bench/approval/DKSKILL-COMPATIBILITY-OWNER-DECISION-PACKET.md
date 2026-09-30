# Owner-decision packet — dkskill compatibility architecture, H-Q1 … H-Q7

> **Status: OWNER DECISIONS RECORDED for H-Q1 … H-Q7 (2026-09-28T18:56:53Z, DK Pandey). These are architecture/product-policy decisions only. Nothing is implemented, and no Claude Code version, platform, channel or compatibility profile is certified.** See [Owner approval metadata](#owner-approval-metadata).
> _(Historical: prepared 2026-09-29, local date, with all seven decisions PENDING. Sections 1–5 of each question are retained unchanged for traceability.)_
> **Source:** based strictly on `DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md` (repository root; SHA-256
> `a2591602dd4436ac3472152061f64ff54928405b7c0f3fb9edc825981b27a7ad` when this packet was prepared). Section references
> (§N) are to that document. Options and recommendations appear here only where that document states them. Where it
> states none, this packet says so.
> **Separation notice:** this packet is about the proposed dkskill **product** compatibility architecture. It is **not**
> a Phase 4 decision, it is not recorded in the Phase 4 decision register (`bench/PHASE-4-DECISION-REGISTER.*`,
> `bench/src/phase4-register.ts`), and it changes no Phase 4 approval or gate. Answering any question here does
> **not** change the Phase 4 benchmark state.
> **Phase 4 state (frozen, unchanged by this packet):**
> - Claude Code **2.1.283**, SHA-256 `9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A`
> - `ATTR_VALID_FOR = ['2.1.283']`
> - TS-07 **UNRESOLVED**
> - Run A **blocked and unauthorized**
> - 2.1.284 **unvalidated**
>
> **No recommendation in this packet is an approval.** A recommendation is recorded only because the owner-review
> document contains it.

---

## H-Q1 — Default behaviour on an UNVERIFIED runtime host

**1. Question**
What should dkskill do by default on an UNVERIFIED runtime host: refuse enforcement, or operate in degraded mode with a
loud "host not certified" status?

**2. Why the decision matters**
- A new Claude Code release enters the lifecycle as `UNVERIFIED` and stays there until it passes PROBING, REGRESSION,
  BEHAVIORAL_DIFF and CERTIFICATION_REVIEW (§7). The policy chosen here therefore governs every user on a
  not-yet-certified release.
- Releases arrive often: 2.1.282, 2.1.283 and 2.1.284 were installed on this machine on 2026-09-25, 2026-09-26 and
  2026-09-28 (§1).
- §8 leaves the `UNVERIFIED` row explicitly to this decision. The owner-review document calls it an "unresolved
  product/safety decision" (§8, §11).

**3. Options explicitly supported by the owner-review document** (§11)
- **A. Refuse.**
- **B. Run in degraded mode with T2 checks** (and a loud status).

**4. Consequences of each option**
- **A. Refuse:**
  - dkskill does not claim enforcement on an UNVERIFIED host. This is the same treatment §8 gives
    `BLOCKED` / `UNSUPPORTED` / `REVOKED` versions: an actionable message naming the version, the reason, the supported
    versions and `dkskill doctor`.
  - Users on a newly released version get no dkskill enforcement until that version completes the §7 lifecycle.
- **B. Degraded mode with T2 checks:**
  - Only capabilities whose live T2 self-checks pass are used (§5: the V-20 heartbeat, SessionStart context per V-18,
    hook config loaded, own hooks present per U-09).
  - A capability whose check fails becomes `DEGRADED_AT_RUNTIME`, and anything depending on it fails closed (§8).
  - A run on an uncertified host can never produce a result labelled certified, and enforcement is reported per layer
    as active, unavailable or not verified (§8, SP-8).
  - T2 checks are session self-checks, not certification. Only the §7 lifecycle establishes a profile's facets and
    capabilities (§5 T1, §7).
  - Host limitations such as V-21 (hook timeout fails open) are not removed by the design (§8).

**5. Current proposal/recommendation in the owner-review document**
§11 states: "The design recommends degraded mode with a loud status, but it is a product and safety decision." §11
also states that this recommendation "is the design's suggestion only; it is not adopted and not recorded as a
decision." **This packet does not choose A or B, and that recommendation is not an approval.**

**6. OWNER DECISION: APPROVED (2026-09-28T18:56:53Z, DK Pandey)**
REFUSE enforcement on UNVERIFIED hosts. An unverified host may be diagnosed and reported, but dkskill must not claim safety/enforcement compatibility until the required host capabilities have been verified.

**7. OWNER RATIONALE**
dkskill must not claim safety or enforcement on a host whose required capabilities are unverified. Diagnosis and reporting stay available, so the user is told why enforcement is refused rather than being given unverified protection.

---

## H-Q2 — Support window

**1. Question**
What support window should dkskill maintain: latest certified only, latest N certified versions, or another
owner-defined policy?

**2. Why the decision matters**
- The support window determines which rows of the version/capability matrix (§6) are maintained as supported, and how
  many versions must pass the §7 lifecycle.
- Every certification requires PROBING that "needs its own owner approval and budget" (§7 step 2) and an owner-signed
  certification record (§7 step 5).
- The owner-review question (§11) also asks **who owns certification**.

**3. Options explicitly supported by the owner-review document** (§11: "only the latest certified versions, or the latest N releases?")
- **A. Only the latest certified versions.**
- **B. The latest N releases.**

*Wording note:* the owner-review document says "latest N **releases**", while this packet's question says "latest N
**certified versions**". The owner may wish to settle which is meant. "Another owner-defined policy" appears in this
packet's question wording only. The owner-review document does not describe one, so none is set out here.

*Sub-question (also in §11):* who owns certification? The owner-review document states no options for it. It does
state that certification requires an "owner-signed record" (§7 step 5).

**4. Consequences of each option**
- **A. Latest certified only:**
  - Fewer versions to take through the §7 lifecycle, each needing its own probing approval and budget (§7).
  - Users on versions outside the window fall under the unsupported or unverified behaviour of §8 and H-Q1.
- **B. Latest N releases:**
  - More versions to take through the §7 lifecycle, each needing its own probing approval and budget (§7).
  - Given the release frequency in §1, that means more frequent certification work.
  - The owner-review document does not state a value for N.

**5. Current proposal/recommendation in the owner-review document**
None. The owner-review document contains no recommendation for H-Q2.

**6. OWNER DECISION: APPROVED (2026-09-28T18:56:53Z, DK Pandey)** *(including who owns certification)*
Support the latest 3 CERTIFIED versions initially. The support window may be expanded later by an explicit owner decision as certification capacity grows. The support window applies to certified compatibility, not merely installed or detected versions.
*Who owns certification:* recorded under H-Q6: "Certification and signing authority is the designated PTPL/dkskill owner authority."

**7. OWNER RATIONALE**
The initial window is sized to certification capacity. It counts certified compatibility only, not installed or detected versions, and it can be widened only by a later explicit owner decision.

---

## H-Q3 — Channels and platforms in scope

**1. Question**
Which Claude Code channels and platforms are in scope for certification?

**2. Why the decision matters**
- Host identity (T0) is version, platform **and channel** (§3, §5). The profile schema carries `platform` and `channel`
  lists (§4).
- Several channels exist on this machine: the native installer (2.1.282–2.1.284), the Desktop-bundled `claude-code`
  2.1.280 and 2.1.281, and the Agent SDK-bundled `claude.exe` 0.2.117. None of them matches the pin (§2).
- All existing evidence is Windows-only. Every other platform is currently unverified (§6).

**3. Options explicitly supported by the owner-review document** (§11; channel values from §4)
- **Channels** (any combination): native installer, npm, Desktop-bundled, SDK-bundled.
- **Platforms** (any combination): macOS, Linux, in addition to Windows 11 (the only platform with evidence, §6).

**4. Consequences of each option**
- **Each channel or platform included:**
  - It needs its own identity rows and certification through the §7 lifecycle, each with probing approval and budget.
  - Until certified, it stays `UNVERIFIED` / `NOT_VALIDATED` (§6).
- **Each channel or platform excluded:**
  - Its hosts are not certified.
  - Users on them receive the §8 behaviour for uncertified hosts, which depends on H-Q1.
- **macOS / Linux in scope:**
  - Certification would have to produce evidence that does not exist today (§6: evidence is Windows-only).

**5. Current proposal/recommendation in the owner-review document**
None. The owner-review document contains no recommendation for H-Q3.

**6. OWNER DECISION: APPROVED (2026-09-28T18:56:53Z, DK Pandey)**
Certification scope is Windows, macOS, and Linux, covering relevant Claude Code channels that dkskill explicitly certifies. No platform or channel is considered certified merely because it is listed in scope. Each platform/channel requires its own appropriate validation evidence.

**7. OWNER RATIONALE**
A universal dkskill targets all three major platforms. Being in scope is not certification: each platform and channel becomes certified only with its own validation evidence.

---

## H-Q4 — Extending attribution tables vs new immutable records

**1. Question**
Should attribution tables be extended through `valid_for`, or should every certified host version receive a new
immutable attribution/profile record?

**2. Why the decision matters**
- Attribution maps permission and denial texts to rules. Unknown formats must become anomalies (`A9/unknown`,
  `table_valid:false`) and must never be misattributed (§8).
- Phase 4 relies on attr@1 with `ATTR_VALID_FOR = ['2.1.283']`, which stays frozen whatever is decided here (§10,
  §12).
- The decision fixes how later versions obtain an attribution table without changing the meaning of existing
  artefacts (§10).

**3. Options explicitly supported by the owner-review document** (§11)
- **A. An attribution table may extend `valid_for`.**
- **B. Each certified version gets a new table or profile id.**

**4. Consequences of each option**
- **A. Extend `valid_for`:**
  - The set of versions a table covers changes after it was issued.
  - §10's reason for the alternative is that appending versions could change the meaning of Phase 4 artefacts after
    the fact.
  - Whatever is decided, Phase 4's own `ATTR_VALID_FOR` remains `['2.1.283']` and frozen (§12).
- **B. New table or profile id per certified version:**
  - Existing tables and profiles are never altered, consistent with the rule that facet versions are immutable and
    content-addressed (§4).
  - Under §7 BEHAVIORAL_DIFF, an identical facet can be reused by id and hash inside the new profile. A differing facet
    gets a new version, for example `attr@2` in its own file, and attr@1 is never edited (§7, §10 M5).

**5. Current proposal/recommendation in the owner-review document**
§10 states: "a certified version always gets a new profile and is never appended to `ATTR_VALID_FOR`, so Phase 4
artefacts never change meaning after the fact. Whether attr@1 may ever cover another version is owner question H-Q4,
and this document does not decide it." **That recommendation is not an approval.**

**6. OWNER DECISION: APPROVED (2026-09-28T18:56:53Z, DK Pandey)**
Every certified host version/facet receives an immutable compatibility profile and attribution record. Existing certified records must never be mutated to accommodate new behavior. If behavior changes, create a new facet/profile record with its own identity and evidence.

**7. OWNER RATIONALE**
Immutability keeps the meaning of every certified record fixed. Changed behaviour is captured as a new facet/profile record with its own identity and evidence, never by editing an existing record.

---

## H-Q5 — Preserving approved benchmark binaries

**1. Question**
How should approved benchmark binaries such as the exact 2.1.283 binary be preserved for reproducibility when Claude
Code auto-updates?

**2. Why the decision matters**
- Benchmark reproducibility requires an exact pinned CLI identity (§1), and benchmark profiles require the binary
  SHA-256 (§4).
- The approved 2.1.283 binary exists locally in only two places, both in the auto-updater's version store and
  backup-rename scheme, "so a future update or clean-up may remove them" (§2).
- The migration plan's first certification-harness use is TS-07 on 2.1.283 (§10 M4).

The two local copies (§2) were not copied, moved, executed or modified:
- `C:\Users\Dharmendra Pandey\.local\share\claude\versions\2.1.283`
- `C:\Users\Dharmendra Pandey\.local\bin\claude.exe.old.1790618725109.29904`

**3. Options explicitly supported by the owner-review document**
None enumerated. §11 asks "How are the approved 2.1.283 binary and future benchmark binaries preserved, given
licensing and storage?", and §2 states that whether to preserve the local copies is an owner decision. The document
names **licensing** and **storage** as the considerations but sets out no options.

**4. Consequences of each option**
No options are set out, so no per-option consequences are stated. The owner-review document does state the
consequence of taking no action: the only two local copies may be removed by a future update or clean-up (§2).

**5. Current proposal/recommendation in the owner-review document**
None. The owner-review document contains no recommendation for H-Q5.

**6. OWNER DECISION: APPROVED (2026-09-28T18:56:53Z, DK Pandey)**
Preserve every approved benchmark binary as an immutable artifact identified by product/version/platform/channel and SHA-256. Historical benchmark reproducibility must not depend on whatever binary happens to be installed on the current host.

**7. OWNER RATIONALE**
Benchmark results must stay reproducible whatever is installed on the current host, so each approved binary is kept as an immutable artifact identified by product, version, platform, channel and SHA-256.

---

## H-Q6 — Signed registry updates and signing authority

**1. Question**
Should the compatibility registry require signed updates, and who is authorized to sign/certify them?

**2. Why the decision matters**
- The Compatibility Registry holds the profiles, the matrix and the certification records that runtime relies on
  (§3).
- The proposed design already assumes signing:
  - the registry is drawn as "(data, versioned, signed)" (§3);
  - "Registry missing or signature invalid → treat every version as `UNVERIFIED`" (§8);
  - certification is recorded in an "owner-signed record" (§7 step 5).
- H-Q6 asks the owner whether signing is required, and who signs (§11).

**3. Options explicitly supported by the owner-review document** (§11: "Is registry signing required, and by whom?")
- **A. Registry signing required.**
- **B. Registry signing not required.**

*Signing authority:* the owner-review document states no options for who signs. It refers only to an "owner-signed
record" for certification (§7 step 5).

**4. Consequences of each option**
- **A. Required:** the §8 rule applies: a missing registry or an invalid signature makes every version `UNVERIFIED`,
  with no fallback to built-in guesses.
- **B. Not required:**
  - The §8 signature-invalid rule has nothing to check.
  - The proposed architecture, which assumes a signed registry (§3), would need to be revised to match.

**5. Current proposal/recommendation in the owner-review document**
No recommendation is stated for H-Q6. The proposed architecture **assumes** a signed registry (§3, §8) and
owner-signed certification records (§7), but leaves the requirement and the signer to the owner (§11).

**6. OWNER DECISION: APPROVED (2026-09-28T18:56:53Z, DK Pandey)** *(including who is authorized to sign/certify)*
The compatibility registry requires signed updates. Certification and signing authority is the designated PTPL/dkskill owner authority. The signing/certification mechanism must provide traceability and must not allow an uncertified compatibility claim to be silently introduced.

**7. OWNER RATIONALE**
Signed updates under a single designated owner authority make every registry change traceable, and prevent an uncertified compatibility claim from entering the registry silently.

---

## H-Q7 — Certification environment

**1. Question**
Should certification environments reuse the Phase 4 benchmark environment, or use separate certification environments?

**2. Why the decision matters**
- PROBING runs in an isolated `CLAUDE_CONFIG_DIR` on the certification plane and "needs its own owner approval and
  budget, separate from any benchmark" (§7 step 2).
- Benchmark profiles are immutable reproducibility anchors, compatibility profiles are product support records, and
  compatibility test runs are labelled `compat`, never `baseline` (§9).
- The migration plan's first harness use is TS-07 on 2.1.283 "under the existing TS-07 approval requirements"
  (§10 M4).

**3. Options explicitly supported by the owner-review document** (§11)
- **A. Share the Phase 4 isolated environment (PTPL-DK-BENCH-WIN-01).**
- **B. Use a separate environment.**

**4. Consequences of each option**
- **A. Share PTPL-DK-BENCH-WIN-01:**
  - Certification activity runs in the same environment as the Phase 4 benchmark anchor. §9's rules become the only
    separation: `compat` labelling, and no merging of results from different CLI identities.
  - Probing still needs its own approval and budget (§7).
- **B. Separate environment:**
  - Certification runs outside the Phase 4 benchmark environment, keeping the two planes apart (§3, §9).
  - The owner-review document does not describe or provision such an environment.
  - Probing still needs its own approval and budget (§7).

**5. Current proposal/recommendation in the owner-review document**
None. The owner-review document contains no recommendation for H-Q7.

**6. OWNER DECISION: APPROVED (2026-09-28T18:56:53Z, DK Pandey)**
Use separate certification environments from the Phase 4 benchmark environment. The Phase 4 benchmark environment remains dedicated to reproducible benchmark execution. Compatibility certification has its own environment lifecycle and must not contaminate benchmark state.

**7. OWNER RATIONALE**
Separation protects the reproducibility of the Phase 4 benchmark environment. Certification gets its own environment lifecycle and cannot contaminate benchmark state.

---

## OWNER APPROVAL METADATA

| Field | Value |
|---|---|
| Owner | DK Pandey |
| Role (as stated by the owner) | Project owner / spec owner and safety reviewer, PTPL/dkskill |
| Organization | PTPL |
| Purpose | Global/universal/version-adaptive dkskill compatibility architecture |
| Decision scope | H-Q1 through H-Q7 |
| Decision type | Architecture/product policy |
| Approval timestamp (UTC) | 2026-09-28T18:56:53Z (2026-09-29 00:26:53 IST) |
| How recorded | From the owner's explicit instruction in the working session. Decision texts are verbatim; rationales are derived from them. |
| Implementation authorization | **NOT GRANTED** |
| Certification authorization | **NOT GRANTED** |
| Run A authorization | **NOT GRANTED** |

**What these decisions establish.** The intended universal architecture: one dkskill core → multiple Claude Code
versions → multiple platforms/channels → host identity/capability detection → compatibility profiles/facet adapters →
certification evidence → immutable registry records.

**What these decisions do NOT establish.** They do not certify any Claude Code version, platform, channel or
compatibility profile. In particular:
- Claude Code **2.1.283** remains the Phase 4 benchmark pin (SHA-256
  `9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A`), and `ATTR_VALID_FOR` remains `['2.1.283']`.
- Its existing Phase 2 evidence remains historical/probed evidence.
- TS-07 remains **UNRESOLVED**, and Run A remains **blocked and unauthorized**.
- Claude Code **2.1.284** remains **UNVALIDATED**.
- Windows remains the only currently evidenced platform. macOS and Linux are now **architecturally in scope, not
  certified**.
- Future certification work must produce platform/version-specific evidence.
- The H-Q5 decision is a preservation **policy**. Recording it preserved, copied or moved no binary. The two local
  2.1.283 copies listed under H-Q5 are untouched.
- These decisions are not entered in the Phase 4 decision register and change no Phase 4 approval or gate.

## IMPLEMENTATION STATUS

- **The architecture remains proposal-only** (`DKSKILL-COMPATIBILITY-ARCHITECTURE-OWNER-REVIEW.md`).
- **M0–M6 are future work.** None has started, and each requires its own owner approval (§10).
- **No runtime compatibility layer exists.** There is no Host Compatibility Layer and no `/runtime/` directory.
- **No compatibility registry has been implemented.** There are no profile, matrix or certification-record files.
- **No certification automation has been implemented.** There is no probe harness, behavioural-diff tooling or
  certification workflow.
- **The Phase 4 benchmark state is unchanged:**
  - Claude Code 2.1.283, SHA-256 `9DBE16DAFED59DA5CDABBFE11AD0335738C753FAD794989B47F9446ACCD6DE3A`
  - `ATTR_VALID_FOR = ['2.1.283']`
  - TS-07 UNRESOLVED
  - Run A blocked and unauthorized
  - 2.1.284 unvalidated
  - The Phase 4 decision register, approvals and gates are unmodified.
