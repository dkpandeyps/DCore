import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildProductSpec, validateManifest, resolvePermission, taxonomyConsistent, decisionsByBoundary, verifySpec,
} from '../compatibility/product-core-spec.ts';
import * as G from '../tools/gen-product-core-sample.ts';
import { canonicalFile } from '../src/canonical.ts';
import { TEST_DIR } from './helpers.ts';

const DIR = join(TEST_DIR, '..', 'compatibility');
const spec = buildProductSpec();

test('1. product identity: universal, not platform/version specific', () => {
  assert.equal(spec.schema, 'dkskill.product_core_spec/1');
  assert.equal(spec.identity.product, 'dkskill');
  assert.equal(spec.identity.not_platform_specific, true);
  assert.equal(spec.identity.not_version_specific, true);
  assert.equal(spec.identity.license, 'Apache-2.0');
});

test('2. skill taxonomy: ONE_PRIMARY_WITH_MODULES, count frozen at 1, future NOT_YET_DECIDED', () => {
  assert.equal(spec.taxonomy.choice, 'ONE_PRIMARY_WITH_MODULES');
  assert.equal(spec.taxonomy.initial_release_skill_count, 1);
  assert.equal(spec.taxonomy.initial_release_skill_count_state, 'FROZEN');
  assert.equal(spec.taxonomy.skills.length, 1);
  assert.equal(spec.taxonomy.skills[0].skill_id, 'dkskill');
  assert.equal(spec.taxonomy.future_skills_state, 'NOT_YET_DECIDED');
  assert.ok(spec.taxonomy.future_skill_decision_inputs.length >= 3);
  assert.ok(Object.keys(spec.taxonomy.evaluation).length >= 10);   // all evaluation criteria present
});

test('3. hierarchy distinguishes PRODUCT/SKILL/CAPABILITY/OPERATION', () => {
  for (const h of ['PRODUCT', 'SKILL', 'CAPABILITY', 'OPERATION', 'PERMISSION', 'PLATFORM_ADAPTER', 'HOST_FACET', 'SECURITY_POLICY']) assert.ok(spec.hierarchy.includes(h), h);
});

test('4. manifest validity (valid/malformed/windows-assumption/single-version)', () => {
  assert.equal(validateManifest(G.validManifest()).ok, true);
  assert.equal(validateManifest(G.malformedManifest()).ok, false);
  assert.equal(validateManifest(G.windowsAssumptionManifest()).ok, false);
  assert.equal(validateManifest(G.singleVersionIdentityManifest()).ok, false);
  assert.equal(spec.manifest_template.no_windows_assumption, true);
  assert.equal(spec.manifest_template.no_single_version_identity, true);
});

test('5. runtime lifecycle: 13 stages, each fails closed on unsafe', () => {
  assert.equal(spec.runtime_lifecycle.length, 13);
  assert.ok(spec.runtime_lifecycle.every((s) => s.on_unsafe === 'FAIL_CLOSED'));
  assert.equal(spec.runtime_lifecycle[0].stage, 'DISCOVER');
  assert.equal(spec.runtime_lifecycle[spec.runtime_lifecycle.length - 1].stage, 'CLEAN_UP');
});

test('6. lifecycle failure cases all fail closed', () => {
  assert.ok(spec.lifecycle_failure_cases.length >= 13);
  assert.ok(spec.lifecycle_failure_cases.every((c) => c.behavior === 'FAIL_CLOSED'));
  assert.ok(spec.lifecycle_failure_cases.some((c) => /unknown permission/i.test(c.condition)));
  assert.ok(spec.lifecycle_failure_cases.some((c) => /tampered package/i.test(c.condition)));
});

test('7. compatibility API contracts: purity classified + fail-closed + mapped to M13/M3', () => {
  assert.equal(spec.compatibility_api.length, 8);
  for (const fn of ['detectEnvironment()', 'resolveHostIdentity()', 'resolveCompatibility()', 'resolveCapabilities()', 'resolveFacets()', 'resolvePermissions()', 'enforceCompatibility()', 'enforceSecurity()'])
    assert.ok(spec.compatibility_api.some((a) => a.fn === fn), fn);
  assert.ok(spec.compatibility_api.every((a) => a.fail_closed === true && a.purity.length > 0 && !!a.maps_to));
  assert.ok(spec.compatibility_api.find((a) => a.fn === 'resolveCompatibility()')!.purity.includes('REGISTRY_DEPENDENT'));
});

test('8. adapter contract: no platform behavior in core; must-not includes certification', () => {
  assert.equal(spec.adapter_contract.core_contains_platform_behavior, false);
  assert.ok(spec.adapter_contract.must_not.some((m) => /certification/i.test(m)));
  assert.ok(spec.adapter_contract.may_provide.includes('host identity'));
});

test('9. capability model preserves M0 semantics + safety-critical', () => {
  assert.ok(spec.capabilities.length >= 1);
  assert.ok(spec.capabilities.some((c) => c.safety_critical === true && c.min_state === 'VERIFIED'));
});

test('10. permission model: every permission + operation denies on unknown', () => {
  assert.ok(spec.permissions.every((p) => p.on_unknown === 'DENY' && p.affects_credentials === false));
  assert.ok(spec.operations.every((o) => o.on_unknown_permission === 'DENY'));
  assert.equal(resolvePermission('UNKNOWN'), 'DENY');
  assert.equal(resolvePermission('DENIED'), 'DENY');
  assert.equal(resolvePermission('GRANTED'), 'ALLOW');
});

test('11. security requirements all fail closed; cover key threats', () => {
  assert.ok(spec.security_requirements.length >= 14);
  assert.ok(spec.security_requirements.every((s) => s.failure_behavior === 'FAIL_CLOSED'));
  for (const t of ['package tampering', 'registry tampering', 'forged certification', 'credential leakage', 'attribution spoofing'])
    assert.ok(spec.security_requirements.some((s) => s.threat === t), t);
});

test('12. public/private trust boundary; public never requires private', () => {
  assert.equal(spec.trust_boundary.public_requires_private, false);
  assert.ok(spec.trust_boundary.private_items.includes('certification credentials'));
  assert.ok(!spec.trust_boundary.public_items.some((i) => /credential|secret|private/i.test(i)));
});

test('13. installation lifecycle platform-neutral + fail closed', () => {
  assert.ok(spec.installation_lifecycle.length >= 6);
  assert.equal(spec.installation_lifecycle[0].stage, 'CLONE');
  assert.ok(spec.installation_lifecycle.every((s) => s.on_failure === 'FAIL_CLOSED'));
});

test('14. update model: new environment UNVERIFIED, no automatic inheritance', () => {
  assert.equal(spec.update_model.new_environment_starts, 'UNVERIFIED');
  assert.equal(spec.update_model.automatic_inheritance, false);
});

test('15. offline model: missing info is never compatible', () => {
  assert.equal(spec.offline_model.missing_info_is_compatible, false);
  assert.ok(/refuse enforcement/i.test(spec.offline_model.registry_stale));
});

test('16. taxonomy consistency holds', () => {
  assert.equal(taxonomyConsistent(spec), true);
});

test('17. decision boundary: BUILD_NOW / REQUIRES_CERTIFICATION / REQUIRES_OWNER_DECISION / BUILD_LATER populated', () => {
  assert.ok(decisionsByBoundary(spec, 'BUILD_NOW').length >= 1);
  assert.ok(decisionsByBoundary(spec, 'REQUIRES_CERTIFICATION').length >= 1);
  assert.ok(decisionsByBoundary(spec, 'REQUIRES_OWNER_DECISION').length >= 1);
  assert.ok(decisionsByBoundary(spec, 'BUILD_LATER').length >= 1);
  // certification-gated items name a blocker
  assert.ok(decisionsByBoundary(spec, 'REQUIRES_CERTIFICATION').every((d) => !!d.blocker));
});

test('18. current state preserved: certified 0, host UNVERIFIED, M8 BLOCKED, ATTR scope', () => {
  assert.equal(spec.current_state.production_certified_count, '0');
  assert.equal(spec.current_state.current_real_host, 'UNVERIFIED');
  assert.equal(spec.current_state.m8, 'EXECUTION_BLOCKED');
  assert.equal(spec.current_state.attr_valid_for, '2.1.283');
  assert.equal(spec.current_state.default_enforcement, 'L1');
});

test('19. future runtime location DEFINED but /runtime/ NOT created', () => {
  assert.ok(/DEFINED ONLY|not created/i.test(spec.future_runtime_location));
  assert.equal(existsSync(join(TEST_DIR, '..', '..', 'runtime')), false);
});

test('20. deterministic; spec hash verifies; committed == fresh; no secrets', () => {
  assert.equal(verifySpec(spec), true);
  assert.equal(canonicalFile(buildProductSpec()), canonicalFile(buildProductSpec()));
  assert.equal(readFileSync(join(DIR, 'product-core-spec.json'), 'utf8'), canonicalFile(buildProductSpec()));
  assert.equal(readFileSync(join(DIR, 'product-manifest-template.json'), 'utf8'), canonicalFile(G.validManifest()));
  assert.ok(!/(access_token=|BEGIN [A-Z ]*PRIVATE KEY|bearer\s+[a-z0-9]{6}|sk-[a-z0-9]{6})/i.test(canonicalFile(spec)));
});

test('21. frozen foundation lists M0-M13 + owner decisions; spec is not synthetic', () => {
  for (const m of ['M0', 'M7', 'M13', 'H-Q1..H-Q7', 'ATTR_VALID_FOR']) assert.ok(spec.frozen_foundation.includes(m), m);
  assert.equal(spec.synthetic_test_only, false);
});
