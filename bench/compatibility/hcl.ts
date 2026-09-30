// M3 — Host Compatibility Layer (HCL). Repository-side, version/platform-adaptive resolution between an
// observed Claude Code host identity and the M1 compatibility registry, using M0 capability evidence and the
// M2 attribution equivalence. It is FAIL-CLOSED for enforcement, never guesses compatibility, and contains NO
// version-specific or platform-specific policy branches (all such behavior comes from the registry/facets/data).
// It executes no Claude, resolves no TS-07/TS-11, certifies nothing, and enables no production enforcement.
import { buildCatalogue } from '../tools/gen-capability-catalogue.ts';
import { buildRegistry, isSafetyCritical, type Profile, type Registry } from '../tools/gen-compatibility-registry.ts';
import { buildEquivalence } from '../tools/gen-attribution-equivalence.ts';
import type {
  HostIdentity, ProbeResult, FieldSource, IdentityStatus, ProfileResolutionState, CapabilityState,
  CapabilityResultRow, FacetResultRow, SelfCheckRow, FeatureRequirement, AttributionResolution, HclResult, EnforcementDecision,
} from './hcl-types.ts';

export const IDENTITY_DIMENSIONS = ['product', 'version', 'platform', 'architecture', 'channel'] as const;
export const FACET_FAMILIES = ['hook_protocol', 'stream_schema', 'attribution', 'settings_layout', 'permission_modes'] as const;

const CATALOGUE = buildCatalogue();
const CAP_RANK: Record<string, number> = { NOT_AVAILABLE: 0, DEGRADED_AT_RUNTIME: 1, NOT_YET_VALIDATED: 2, PARTIALLY_VERIFIED: 3, VERIFIED: 4 };
function meets(state: string, min: string): boolean {
  return (CAP_RANK[state] ?? -1) >= (CAP_RANK[min] ?? 99);
}

// ---- identity probe (no Claude execution) -----------------------------------------------------------------
// A static probe from an already-observed field set (tests inject fake identities). A real probe that executes
// the binary to read a version would sit behind this same interface; M3 never runs it.
export function staticIdentityProbe(observed: Partial<HostIdentity>, sources: Record<string, string> = {}): ProbeResult {
  const identity: HostIdentity = {
    product: observed.product ?? null, version: observed.version ?? null, platform: observed.platform ?? null,
    architecture: observed.architecture ?? null, channel: observed.channel ?? null,
    binary_sha256: observed.binary_sha256 ?? null, executable_source: observed.executable_source ?? null,
  };
  const field_sources: FieldSource[] = (Object.keys(identity) as (keyof HostIdentity)[]).map((f) => ({ field: f, value: identity[f], source: identity[f] == null ? 'absent' : (sources[f] ?? 'observed') }));
  const missing_fields = (IDENTITY_DIMENSIONS as readonly string[]).filter((d) => identity[d as keyof HostIdentity] == null);
  const identity_status: IdentityStatus = missing_fields.length === 0 ? 'IDENTIFIED'
    : (identity.product == null || identity.version == null) ? 'UNIDENTIFIED' : 'PARTIALLY_IDENTIFIED';
  return { identity, identity_status, field_sources, missing_fields };
}

// ---- registry resolution (EXACT only; no nearest/semver/fallback) -----------------------------------------
export interface Resolution { state: ProfileResolutionState; profile: Profile | null; candidates: string[] }
export function resolveProfile(identity: HostIdentity, registry: Registry): Resolution {
  // Incomplete identity can never make an exact match.
  if ((IDENTITY_DIMENSIONS as readonly string[]).some((d) => identity[d as keyof HostIdentity] == null)) return { state: 'NO_MATCH', profile: null, candidates: [] };
  const dimMatch = registry.profiles.filter((p) => !p.is_scope_placeholder && (IDENTITY_DIMENSIONS as readonly string[]).every((d) => (p as any)[d] === identity[d as keyof HostIdentity]));
  // Binary hash participates when BOTH sides provide it: a mismatch excludes the candidate.
  const exact = dimMatch.filter((p) => !(p.binary_sha256 && identity.binary_sha256) || p.binary_sha256.toUpperCase() === identity.binary_sha256!.toUpperCase());
  if (exact.length === 0) return { state: 'NO_MATCH', profile: null, candidates: dimMatch.map((p) => p.profile_id) };
  if (exact.length > 1) return { state: 'AMBIGUOUS_MATCH', profile: null, candidates: exact.map((p) => p.profile_id) };
  const p = exact[0];
  if (p.revoked || p.lifecycle_state === 'revoked') return { state: 'REVOKED_PROFILE', profile: p, candidates: [p.profile_id] };
  // Structural validity: required identity fields present on the profile.
  const invalid = (IDENTITY_DIMENSIONS as readonly string[]).some((d) => (p as any)[d] == null) || !p.capability_refs || !p.facet_refs;
  if (invalid) return { state: 'INVALID_PROFILE', profile: p, candidates: [p.profile_id] };
  return { state: 'EXACT_MATCH', profile: p, candidates: [p.profile_id] };
}

// ---- capability & facet resolution (states preserved; never upgraded) --------------------------------------
export function resolveCapabilities(profile: Profile | null, feature: FeatureRequirement | null): CapabilityResultRow[] {
  const req = new Map((feature?.required_capabilities ?? []).map((r) => [r.cap_id, r.min_state]));
  return CATALOGUE.capabilities.map((c) => {
    const state = (profile?.capability_refs?.[c.id] as CapabilityState) ?? 'NOT_YET_VALIDATED';
    const min = req.get(c.id) ?? null;
    return {
      capability_id: c.id, state, criticality: c.criticality, required_for: c.required_for,
      safety_critical: isSafetyCritical(c), required: min != null, min_state: min,
      satisfied: min != null ? meets(state, min) : null,
    };
  });
}

export function resolveFacets(profile: Profile | null, registry: Registry): FacetResultRow[] {
  return (FACET_FAMILIES as readonly string[]).map((family) => {
    const facetId = profile?.facet_refs?.[family] ?? null;
    const facet = facetId ? registry.facets[facetId] : undefined;
    return { family, facet_id: facetId, state: facet ? 'RESOLVED' : 'UNRESOLVED', validation_status: facet ? facet.validation_status : null };
  });
}

export function resolveAttribution(profile: Profile | null, identity: HostIdentity, equivalence = buildEquivalence()): AttributionResolution {
  const facet = profile?.attribution_ref ?? null;
  const scope = equivalence.attr_valid_for;
  const in_scope = facet != null && identity.version != null && scope.includes(identity.version);
  return {
    facet, table_valid_scope: [...scope], in_scope,
    real_host: 'NOT_VALIDATED',
    note: in_scope
      ? 'attribution@1 consumed as PROBED/evidence-level only; real-host NOT_VALIDATED (TS-07). Unknown text => A9/unknown.'
      : 'version outside ATTR_VALID_FOR or no attribution facet => attribution is A9/unknown, table_valid=false; dependent claims unverified. No attr@2.',
  };
}

// ---- enforcement decision (fail-closed) -------------------------------------------------------------------
export function decideEnforcement(
  resolution: Resolution, feature: FeatureRequirement, capResults: CapabilityResultRow[], facetResults: FacetResultRow[], selfChecks: SelfCheckRow[],
): { decision: EnforcementDecision; reason_codes: string[] } {
  const reasons: string[] = [];
  if (resolution.state !== 'EXACT_MATCH') { reasons.push(`PROFILE_${resolution.state}`); return { decision: 'ENFORCEMENT_REFUSED', reason_codes: reasons }; }
  const profile = resolution.profile!;
  const unmetRequired = capResults.filter((c) => c.required && c.satisfied === false);
  const unmetFacets = facetResults.filter((f) => feature.required_facets.includes(f.family) && f.state === 'UNRESOLVED');
  const criticalSelfBad = selfChecks.some((s) => s.critical && s.result !== 'PASS');
  for (const c of unmetRequired) reasons.push(`CAP_UNMET:${c.capability_id}:${c.state}`);
  for (const f of unmetFacets) reasons.push(`FACET_UNRESOLVED:${f.family}`);
  if (criticalSelfBad) reasons.push('SELFCHECK_CRITICAL_NOT_PASS');
  const certified = profile.certification_status === 'CERTIFIED';
  const hasGaps = unmetRequired.length > 0 || unmetFacets.length > 0;
  if (!certified) reasons.push('PROFILE_NOT_CERTIFIED');

  // A failing/unknown CRITICAL safety self-check always blocks (never ALLOWED or DEGRADED).
  if (criticalSelfBad) return { decision: 'ENFORCEMENT_REFUSED', reason_codes: reasons };

  if (feature.optional) {
    // Explicitly-optional feature: gaps or a non-certified profile DEGRADE rather than refuse.
    if (certified && !hasGaps) return { decision: 'ENFORCEMENT_ALLOWED', reason_codes: reasons.length ? reasons : ['CERTIFIED_ALL_REQUIREMENTS_MET'] };
    return { decision: 'ENFORCEMENT_DEGRADED', reason_codes: reasons };
  }
  // Non-optional (safety/enforcement) feature: must be certified AND fully satisfied.
  if (hasGaps || !certified) return { decision: 'ENFORCEMENT_REFUSED', reason_codes: reasons };
  return { decision: 'ENFORCEMENT_ALLOWED', reason_codes: reasons.length ? reasons : ['CERTIFIED_ALL_REQUIREMENTS_MET'] };
}

// The default "core safety enforcement" feature: every safety-critical capability at VERIFIED, all facets, not optional.
export function coreSafetyFeature(): FeatureRequirement {
  return {
    feature_id: 'dkskill.core_safety_enforcement',
    optional: false,
    required_capabilities: CATALOGUE.capabilities.filter((c) => isSafetyCritical(c)).map((c) => ({ cap_id: c.id, min_state: 'VERIFIED' as CapabilityState })),
    required_facets: [...FACET_FAMILIES],
  };
}

export interface EvaluateInput {
  probe: ProbeResult;
  feature?: FeatureRequirement;
  selfChecks?: SelfCheckRow[];
  registry?: Registry;
  equivalence?: ReturnType<typeof buildEquivalence>;
}

export function evaluateHost(input: EvaluateInput): HclResult {
  const registry = input.registry ?? buildRegistry();
  const feature = input.feature ?? coreSafetyFeature();
  const selfChecks = input.selfChecks ?? [];
  const { identity, identity_status, field_sources, missing_fields } = input.probe;

  const resolution = resolveProfile(identity, registry);
  const profile = resolution.profile;
  const capability_results = resolveCapabilities(resolution.state === 'EXACT_MATCH' ? profile : null, feature);
  const facet_results = resolveFacets(resolution.state === 'EXACT_MATCH' ? profile : null, registry);
  const attribution = resolveAttribution(resolution.state === 'EXACT_MATCH' ? profile : null, identity, input.equivalence);

  let enforcement_decision: EnforcementDecision;
  let reason_codes: string[];
  if (identity_status !== 'IDENTIFIED') {
    enforcement_decision = 'ENFORCEMENT_REFUSED';
    reason_codes = [`IDENTITY_${identity_status}`, `MISSING:${missing_fields.join(',') || 'none'}`];
  } else {
    const d = decideEnforcement(resolution, feature, capability_results, facet_results, selfChecks);
    enforcement_decision = d.decision; reason_codes = d.reason_codes;
  }

  const limitations = profile && resolution.state === 'EXACT_MATCH'
    ? profile.limitations
    : ['No exact registry profile for this identity: host is UNVERIFIED (UNVERIFIED != UNSUPPORTED). Enforcement refused (H-Q1). Diagnostics may still explain the observed host.'];

  return {
    schema: 'dkskill.host_compatibility_result/1', version: 1, feature_id: feature.feature_id,
    observed_identity: identity, identity_status, field_sources, missing_fields,
    profile_resolution: resolution.state, profile_id: profile?.profile_id ?? null,
    validation_status: (resolution.state === 'EXACT_MATCH' ? profile?.validation_status : null) ?? null,
    certification_status: (resolution.state === 'EXACT_MATCH' ? profile?.certification_status : null) ?? null,
    attribution, capability_results, facet_results, self_check_results: selfChecks, limitations,
    enforcement_decision, reason_codes,
  };
}
