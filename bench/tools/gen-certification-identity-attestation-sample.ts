// M19 — DESIGN-ONLY synthetic identity-attestation fixtures. SYNTHETIC_TEST_ONLY. No certification, no signing, no
// Claude execution, no network, no registry mutation. All fixtures are non-production design artifacts.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalFile, sha256 } from '../src/canonical.ts';
import { buildAttestation, threatModel, integrationInterfaces } from '../compatibility/certification-identity-attestation.ts';
import type { ObservationSource, ObsField, ProvenanceStrength } from '../compatibility/certification-identity-attestation-types.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'compatibility');
export const FIXED = () => '2026-09-30T00:00:00Z';
export const SYN = 'SYNTHETIC_TEST_ONLY';
const HASH = (c: string) => c.repeat(64);

function src(field: ObsField, value: string, strength: ProvenanceStrength, source = 'INDEPENDENT_OBSERVER'): ObservationSource {
  return { field, value, source, observer: 'synthetic-observer', observation_time: FIXED(), environment: 'CERT-ENV-DEMO', evidence_hash: sha256(`${SYN}:${field}:${value}`), provenance_strength: strength };
}

// A complete, strongly-evidenced synthetic identity (windows/x64/native/2.1.283).
function completeSources(): ObservationSource[] {
  return [
    src('product', 'claude-code', 'CERTIFICATION_ATTESTATION'), src('version', '2.1.283', 'CONTROLLED_OBSERVATION'),
    src('operating_system', 'win32', 'CONTROLLED_OBSERVATION'), src('os_version', '10.0.26200', 'CONTROLLED_OBSERVATION'),
    src('architecture', 'x64', 'CONTROLLED_OBSERVATION'), src('channel', 'native', 'INDEPENDENT_OBSERVATION'),
    src('runtime_facet', 'native', 'CONTROLLED_OBSERVATION'), src('binary_sha256', HASH('A'), 'INDEPENDENT_OBSERVATION'),
  ];
}
const baseDeclared = { product: 'claude-code', version: '2.1.283', operating_system: 'win32', os_version: '10.0.26200', architecture: 'x64', channel: 'native', runtime_facet: 'native', binary_sha256: HASH('A') };
const mk = (id: string, over: Parameters<typeof buildAttestation>[0] extends infer T ? Partial<T> : never = {} as any) =>
  buildAttestation({ attestation_id: id, ...baseDeclared, observation_sources: completeSources(), environment_id: 'CERT-ENV-DEMO', profile_id: 'demo@1', installation_ref: 'install://cert-env-demo', created_at: FIXED(), now: FIXED(), synthetic_test_only: true, ...over } as any);

export const fixtures = {
  complete: () => mk('att-complete'),
  missingChannel: () => mk('att-no-channel', { channel: null, observation_sources: completeSources().filter((s) => s.field !== 'channel') } as any),
  missingVersion: () => mk('att-no-version', { version: null, observation_sources: completeSources().filter((s) => s.field !== 'version') } as any),
  missingHash: () => mk('att-no-hash', { binary_sha256: null, observation_sources: completeSources().filter((s) => s.field !== 'binary_sha256') } as any),
  weakChannel: () => mk('att-weak-channel', { observation_sources: [...completeSources().filter((s) => s.field !== 'channel'), src('channel', 'native', 'SELF_REPORTED')] } as any),
  contradictoryVersion: () => mk('att-contradict-ver', { observation_sources: [...completeSources(), src('version', '2.1.284', 'CONTROLLED_OBSERVATION', 'OTHER_OBSERVER')] } as any),
  contradictoryHash: () => mk('att-contradict-hash', { observation_sources: [...completeSources(), src('binary_sha256', HASH('9'), 'INDEPENDENT_OBSERVATION', 'OTHER_OBSERVER')] } as any),
  ambiguousInstall: () => mk('att-ambiguous', { ambiguous_installations: true } as any),
  stale: () => mk('att-stale', { expires_at: '2026-01-01T00:00:00Z' } as any),
  revoked: () => mk('att-revoked', { revocation_reference: 'rev://demo' } as any),
  superseded: () => mk('att-superseded', { supersession_reference: 'sup://demo@2' } as any),
  wrongArch: () => mk('att-wrong-arch', { architecture: 'ppc64', observation_sources: [...completeSources().filter((s) => s.field !== 'architecture'), src('architecture', 'ppc64', 'CONTROLLED_OBSERVATION')] } as any),
  tampered: () => mk('att-tampered', { tampered: true } as any),
};

function main(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'attestation-complete.json'), canonicalFile(fixtures.complete()));
  writeFileSync(join(OUT, 'attestation-missing-channel.json'), canonicalFile(fixtures.missingChannel()));
  writeFileSync(join(OUT, 'attestation-contradictory.json'), canonicalFile(fixtures.contradictoryVersion()));
  writeFileSync(join(OUT, 'attestation-revoked.json'), canonicalFile(fixtures.revoked()));
  writeFileSync(join(OUT, 'attestation-threat-model.json'), canonicalFile({ schema: 'dkskill.attestation_threat_model/1', threats: threatModel(), interfaces: integrationInterfaces() }));
  const f = fixtures;
  console.log(`M19: complete=${f.complete().attestation_status}; noChannel=${f.missingChannel().attestation_status}; weakChannel=${f.weakChannel().attestation_status}; contradictVer=${f.contradictoryVersion().attestation_status}; ambiguous=${f.ambiguousInstall().attestation_status}; stale=${f.stale().attestation_status}; revoked=${f.revoked().attestation_status}; tampered=${f.tampered().attestation_status}; combo=${JSON.stringify(f.complete().matrix_combo)}`);
}

if (process.argv[1]?.endsWith('gen-certification-identity-attestation-sample.ts')) main();
