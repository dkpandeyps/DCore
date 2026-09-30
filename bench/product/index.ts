// M16 — public dkskill package API barrel. Re-exports the existing (frozen M15) implementation through a single
// canonical entrypoint so a clean clone can discover the product without duplicating or forking compatibility logic.
export { buildProductManifest, validateProductManifest, buildIntegrityManifest, verifyIntegrity, hashContent } from './integrity-and-manifest.ts';
export { detectEnvironment, productAdapters, nodeEnvironmentFacts, selectAdapter } from './environment-and-adapters.ts';
export { runDoctor, renderDoctor, DKSKILL_VERSION } from './doctor.ts';
export { runInstall, memFs, isSafeInstallDir, planInstallStages } from './install.ts';
export { nodeFs, runInstallReal, confinePath } from './fs-node.ts';
export { buildPublicDoctorReport, safeRealFacts, factsToHost } from './public-doctor.ts';
export type { PublicDoctorReport } from './public-doctor.ts';
export { doctorMain, realHost } from './dkskill-doctor.ts';
export type * from './product-foundation-types.ts';
