// M13-UNIVERSAL — Universal Compatibility engine. Deterministic, FAIL-CLOSED. One pipeline for every supported
// platform, composing the frozen M3 HCL (which uses M0 catalogue, M1 registry, M2 attribution). It never modifies
// M0–M12, never certifies, never publishes, never mutates the production registry, and never upgrades UNKNOWN/
// NOT_YET_VALIDATED. UNVERIFIED != UNSUPPORTED. Platform behavior lives in the registry/adapters, never baked in.
import { sha256, canonicalJson } from '../src/canonical.ts';
import { evaluateHost, coreSafetyFeature, staticIdentityProbe, FACET_FAMILIES } from './hcl.ts';
import { buildRegistry, isSafetyCritical, type Registry } from '../tools/gen-compatibility-registry.ts';
import { buildCatalogue } from '../tools/gen-capability-catalogue.ts';
import { buildEquivalence } from '../tools/gen-attribution-equivalence.ts';
import { selectAdapter, platformToken, adapterSupportsArchitecture, adapterSupportsChannel } from './platform-adapter.ts';
import type { HostIdentity } from './hcl-types.ts';
import type {
  UniversalHost, UserCompatibilityResult, UserCompatibilityOutcome, UniversalCompatibility, HostFacet, Platform,
  EnforcementLevel, UniversalAudit, CapabilityRow, FacetRow,
} from './universal-compatibility-types.ts';

export const SUPPORTED_PLATFORMS: Platform[] = ['windows', 'macos', 'linux'];
export const DEFAULT_ENFORCEMENT_LEVEL: EnforcementLevel = 'L1';   // H-Q7

// ---- facet catalogue (explicit; future facets extend this without rewriting the core) ----------------------
export function buildFacetCatalogue(): HostFacet[] {
  return (FACET_FAMILIES as readonly string[]).map((family) => ({
    schema: 'dkskill.host_facet/1', facet_id: `${family}@1`, family, schema_version: '1', scope: 'per certified profile',
    evidence_requirements: ['facet resolved against a certified profile', 'evidence bound to the exact identity'],
    compatibility_relationship: 'facet must RESOLVE for the exact profile; UNKNOWN never means compatible',
    validation_status: 'per-profile', lifecycle: 'PROBED->VALIDATED->CERTIFIED (no auto-inheritance)',
    provenance: 'M1 registry facet_refs + M0/M2 evidence',
  }));
}

// ---- universal identity normalization (via platform adapter; version+platform+arch+channel+binary) ----------
export function normalizeHost(host: UniversalHost): { identity: HostIdentity; platform: Platform | null; supported: boolean; reasons: string[] } {
  const adapter = selectAdapter(host.os);
  const reasons: string[] = [];
  if (!adapter) { reasons.push(`unknown/unsupported OS: ${host.os ?? 'null'}`); }
  const platform = adapter?.platform ?? null;
  const archOk = adapter ? adapterSupportsArchitecture(adapter, host.architecture) : false;
  const chanOk = adapter ? adapterSupportsChannel(adapter, host.channel) : false;
  if (adapter && !archOk) reasons.push(`architecture ${host.architecture ?? 'null'} not in ${adapter.adapter_id} supported set`);
  if (adapter && !chanOk) reasons.push(`channel ${host.channel ?? 'null'} not in ${adapter.adapter_id} supported set`);
  const supported = !!adapter && archOk && chanOk;
  const identity: HostIdentity = {
    product: host.product, version: host.version, platform: adapter ? platformToken(adapter) : host.os,
    architecture: host.architecture, channel: host.channel, binary_sha256: host.binary_sha256, executable_source: host.runtime_facet,
  };
  return { identity, platform, supported, reasons };
}

// ---- universal resolution (fail-closed) -------------------------------------------------------------------
export function resolveUniversal(input: { host: UniversalHost; registry?: Registry; enforcement_level?: EnforcementLevel; synthetic_test_only?: boolean }): UserCompatibilityResult {
  const registry = input.registry ?? buildRegistry();
  const { identity, platform, supported, reasons } = normalizeHost(input.host);
  const feature = coreSafetyFeature();
  const probe = staticIdentityProbe(identity);
  const hcl = evaluateHost({ probe, registry, feature, equivalence: buildEquivalence() });

  const capabilities: CapabilityRow[] = hcl.capability_results.map((c) => ({ capability_id: c.capability_id, state: c.state, required: c.required, satisfied: c.satisfied, safety_critical: c.safety_critical }));
  const facets: FacetRow[] = hcl.facet_results.map((f) => ({ family: f.family, facet_id: f.facet_id, state: f.state, validation_status: f.validation_status }));
  const reason_codes = [...hcl.reason_codes];
  const known: string[] = [];
  const unknown: string[] = [];

  let outcome: UserCompatibilityOutcome;
  if (!supported) { outcome = 'UNSUPPORTED'; unknown.push(...reasons); reason_codes.push('PLATFORM_UNSUPPORTED'); }
  else if (hcl.identity_status !== 'IDENTIFIED') { outcome = hcl.identity_status === 'UNIDENTIFIED' ? 'PROFILE_NOT_FOUND' : 'UNVERIFIED'; unknown.push(`identity ${hcl.identity_status}; missing ${hcl.missing_fields.join(',') || 'none'}`); }
  else switch (hcl.profile_resolution) {
    case 'REVOKED_PROFILE': outcome = 'REVOKED'; reason_codes.push('PROFILE_REVOKED'); break;
    case 'AMBIGUOUS_MATCH': outcome = 'PROFILE_MISMATCH'; reason_codes.push('PROFILE_AMBIGUOUS'); break;
    case 'INVALID_PROFILE': outcome = 'PROFILE_MISMATCH'; reason_codes.push('PROFILE_INVALID'); break;
    case 'NO_MATCH': outcome = 'UNVERIFIED'; unknown.push('no exact certified profile for this identity (UNVERIFIED != UNSUPPORTED)'); break;
    case 'EXACT_MATCH': {
      const certified = hcl.certification_status === 'CERTIFIED';
      const requiredUnmet = capabilities.filter((c) => c.required && c.satisfied === false);
      const safetyUnverified = capabilities.some((c) => c.safety_critical && c.state !== 'VERIFIED');
      const facetsUnresolved = facets.some((f) => feature.required_facets.includes(f.family) && f.state !== 'RESOLVED');
      if (!certified) { outcome = 'UNVERIFIED'; unknown.push('exact profile found but not CERTIFIED'); reason_codes.push('PROFILE_NOT_CERTIFIED'); }
      else if (safetyUnverified) { outcome = 'BLOCKED'; unknown.push('safety-critical capability not VERIFIED — fail closed'); reason_codes.push('SAFETY_CRITICAL_UNVERIFIED'); }
      else if (requiredUnmet.length) { outcome = 'CAPABILITY_UNVERIFIED'; unknown.push(...requiredUnmet.map((c) => `capability unmet: ${c.capability_id} (${c.state})`)); }
      else if (facetsUnresolved) { outcome = 'PARTIALLY_COMPATIBLE'; unknown.push('one or more required facets unresolved'); }
      else { outcome = 'COMPATIBLE'; known.push('exact certified profile; required capabilities VERIFIED; required facets RESOLVED'); }
      break;
    }
    default: outcome = 'UNVERIFIED';
  }
  if (hcl.attribution.in_scope) known.push('attribution@1 in scope (evidence-level; real-host NOT_VALIDATED per M9/TS-07)');
  else unknown.push('attribution out of ATTR_VALID_FOR scope => A9/unknown');

  const explanation = buildExplanation(outcome, platform, hcl.profile_id, hcl.certification_status);
  return {
    schema: 'dkskill.user_compatibility_result/1', version: 1, synthetic_test_only: input.synthetic_test_only ?? false,
    observed_host: input.host, normalized_identity: identity, platform, supported_platform: supported,
    profile_id: hcl.profile_id, profile_resolution: hcl.profile_resolution, certification_status: hcl.certification_status,
    validation_status: hcl.validation_status, capabilities, facets,
    attribution: { facet: hcl.attribution.facet, in_scope: hcl.attribution.in_scope, table_valid_scope: hcl.attribution.table_valid_scope, real_host: hcl.attribution.real_host, note: hcl.attribution.note },
    enforcement_level: input.enforcement_level ?? DEFAULT_ENFORCEMENT_LEVEL, enforcement_decision: hcl.enforcement_decision,
    outcome, explanation, known, unknown, fail_closed: true, reason_codes,
  };
}
function buildExplanation(outcome: UserCompatibilityOutcome, platform: Platform | null, profile: string | null, cert: string | null): string {
  switch (outcome) {
    case 'COMPATIBLE': return `Compatible: exact certified profile ${profile} resolved for ${platform}. Enforcement may proceed at the configured level.`;
    case 'PARTIALLY_COMPATIBLE': return `Partially compatible: profile ${profile} certified but some required facets are unresolved. Degraded/limited operation only.`;
    case 'UNVERIFIED': return `Unverified: this exact environment has no certified evidence yet. UNVERIFIED is NOT unsupported — enforcement is refused (fail closed) until certified.`;
    case 'UNSUPPORTED': return `Unsupported: this platform/architecture/channel is outside the declared support scope. No compatibility claim is made.`;
    case 'BLOCKED': return `Blocked: a safety-critical capability is not verified for this environment. Fail closed.`;
    case 'REVOKED': return `Revoked: the matching profile ${profile} has been revoked. Do not enforce.`;
    case 'PROFILE_NOT_FOUND': return `Profile not found: host identity is incomplete/unidentified. Provide exact product/version/platform/arch/channel.`;
    case 'PROFILE_MISMATCH': return `Profile mismatch: the identity resolves ambiguously or to an invalid profile. Fail closed.`;
    case 'CAPABILITY_UNVERIFIED': return `Capability unverified: one or more required capabilities are not verified for ${profile}. Fail closed.`;
  }
}

// ---- universal descriptor ---------------------------------------------------------------------------------
export function buildUniversalCompatibility(): UniversalCompatibility {
  return {
    schema: 'dkskill.universal_compatibility/1', version: 1,
    pipeline: ['ENVIRONMENT', 'HOST_IDENTITY', 'EXACT_VERSION/PLATFORM/ARCH/CHANNEL', 'COMPATIBILITY_PROFILE', 'CAPABILITIES', 'FACETS', 'ATTRIBUTION', 'EVIDENCE', 'CERTIFICATION_STATE', 'FAIL_CLOSED_DECISION', 'USER_SAFE_EXECUTION'],
    supported_platforms: SUPPORTED_PLATFORMS, default_enforcement_level: DEFAULT_ENFORCEMENT_LEVEL, latest_certified_policy: 'latest-3',
    facet_catalogue: buildFacetCatalogue(), attribution_valid_for: [...buildEquivalence().attr_valid_for],
    no_inheritance: { version: true, platform: true, architecture: true, channel: true },
  };
}

// ---- M8/M9 fail-closed adapters (universal core never authorizes execution or claims isolation) -------------
export function universalToM8(): 'UNVERIFIED' { return 'UNVERIFIED'; }
export function universalToM9(): 'UNVERIFIED' { return 'UNVERIFIED'; }

// ---- audit chain ------------------------------------------------------------------------------------------
export function auditRecordHash(rec: Omit<UniversalAudit, 'record_hash'>): string { return sha256(canonicalJson(rec)); }
export function buildAuditRecord(r: UserCompatibilityResult, now: string, previous_record_hash: string | null = null): UniversalAudit {
  const base: Omit<UniversalAudit, 'record_hash'> = { schema: 'dkskill.universal_compatibility_audit/1', version: 1, audit_id: `audit-${r.profile_id ?? 'none'}-${r.outcome}`, outcome: r.outcome, profile_id: r.profile_id, platform: r.platform, synthetic_test_only: r.synthetic_test_only, timestamp: now, previous_record_hash };
  return { ...base, record_hash: auditRecordHash(base) };
}
export function verifyAuditChain(records: UniversalAudit[]): boolean {
  let prev: string | null = null;
  for (const r of records) { if (r.previous_record_hash !== prev) return false; const { record_hash, ...rest } = r; if (auditRecordHash(rest) !== record_hash) return false; prev = record_hash!; }
  return true;
}
