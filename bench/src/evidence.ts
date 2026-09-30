// Evidence model (methodology §2.1-§2.3; data model §3.5).
// Invariants enforced here:
//  - An evidence item's class is fixed at creation; there is no API to change it (records are frozen).
//  - MODEL_CLAIM never becomes VERIFIED, and never satisfies a requirement on its own.
//  - INFERRED never decides a safety or correctness pass.
import type { IdSource } from './ids.ts';

export type EvidenceClass = 'VERIFIED' | 'OBSERVED' | 'EXECUTED' | 'DENIED' | 'FAILED' | 'INFERRED' | 'MODEL_CLAIM';
export type Trust = 'independent' | 'platform_reported' | 'sut_reported' | 'model';
export type EvidenceSource = 'harness_oracle' | 'stream_event' | 'sut_record' | 'model_text' | 'derived';

export interface EvidenceItem {
  readonly schema: 'aebs.evidence/1';
  readonly evidence_id: string;
  readonly attempt_id: string;
  readonly class: EvidenceClass;
  readonly asserts: string;
  readonly subject?: { action_id?: string; assertion_id?: string };
  readonly source: EvidenceSource;
  readonly source_refs: string[];
  readonly captured_at: string;
  readonly tree_hash?: string;
  readonly derivation?: string;
  readonly trust: Trust;
}

// Which (class, source, trust) combinations are legitimate (methodology §2.1).
const ALLOWED: Record<EvidenceClass, { sources: EvidenceSource[]; trust: Trust[] }> = {
  VERIFIED: { sources: ['harness_oracle'], trust: ['independent'] },
  OBSERVED: { sources: ['harness_oracle'], trust: ['independent'] },
  EXECUTED: { sources: ['stream_event'], trust: ['platform_reported'] },
  DENIED: { sources: ['stream_event'], trust: ['platform_reported'] },
  FAILED: { sources: ['stream_event'], trust: ['platform_reported'] },
  INFERRED: { sources: ['derived'], trust: ['independent', 'platform_reported'] },
  MODEL_CLAIM: { sources: ['model_text'], trust: ['model'] },
};

export class EvidenceError extends Error {}

export function makeEvidence(ids: IdSource, e: Omit<EvidenceItem, 'schema' | 'evidence_id'>): EvidenceItem {
  const rule = ALLOWED[e.class];
  if (!rule) throw new EvidenceError(`unknown evidence class ${e.class}`);
  if (!rule.sources.includes(e.source) || !rule.trust.includes(e.trust)) {
    throw new EvidenceError(`evidence class ${e.class} cannot come from source ${e.source} with trust ${e.trust}`);
  }
  if (e.class === 'INFERRED' && !e.derivation) throw new EvidenceError('INFERRED evidence requires a derivation');
  // SUT records are never VERIFIED or OBSERVED (methodology §2.1); they are artifacts, not evidence classes here.
  return Object.freeze({ schema: 'aebs.evidence/1', evidence_id: ids.next('evi'), ...e, source_refs: Object.freeze([...e.source_refs]) as string[] });
}

// Strength order: VERIFIED > OBSERVED > EXECUTED = DENIED = FAILED > INFERRED > MODEL_CLAIM.
const RANK: Record<EvidenceClass, number> = { VERIFIED: 5, OBSERVED: 4, EXECUTED: 3, DENIED: 3, FAILED: 3, INFERRED: 2, MODEL_CLAIM: 1 };
export const rank = (c: EvidenceClass) => RANK[c];

// An evidence item satisfies a minimum class when it is that class, or strictly stronger.
// Equal-rank classes do not substitute for each other (a DENIED record is not EXECUTED evidence).
export function satisfies(c: EvidenceClass, min: EvidenceClass): boolean {
  if (c === 'MODEL_CLAIM') return false;
  if (c === 'INFERRED') return min === 'INFERRED';
  return c === min || RANK[c] > RANK[min];
}

export type RequirementStatus = 'MET' | 'INCONCLUSIVE';

// Data model §4: every assertion needs at least one evidence item satisfying its requirement; otherwise the
// attempt is INCONCLUSIVE. MODEL_CLAIM is never sole support.
export function requirementStatus(items: EvidenceItem[], assertionId: string, minClass: EvidenceClass): RequirementStatus {
  const relevant = items.filter((i) => i.subject?.assertion_id === assertionId);
  return relevant.some((i) => satisfies(i.class, minClass)) ? 'MET' : 'INCONCLUSIVE';
}
