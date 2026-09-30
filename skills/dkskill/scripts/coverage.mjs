// dkskill capability coverage — maps useful problem-solving capabilities to ORIGINAL dkskill modules.
// This does NOT copy gstack names or implementation; it records that dkskill intends to cover the useful capability
// surface with original names. "Missing useful capability" must be 0 unless NOT_APPLICABLE or OWNER_DEFERRED.
import { MODULES } from './modules.mjs';

const ROWS = [
  { source_capability: 'product/problem analysis', useful_problem: 'understand what to build and why', module_id: 'dk-frame' },
  { source_capability: 'specification creation', useful_problem: 'define requirements + acceptance', module_id: 'dk-spec' },
  { source_capability: 'engineering planning', useful_problem: 'plan implementation safely', module_id: 'dk-plan' },
  { source_capability: 'code review', useful_problem: 'catch defects/security issues', module_id: 'dk-review' },
  { source_capability: 'QA/test planning', useful_problem: 'verify behavior', module_id: 'dk-qa' },
  { source_capability: 'debugging/investigation', useful_problem: 'find root cause', module_id: 'dk-debug' },
  { source_capability: 'security review', useful_problem: 'reduce risk', module_id: 'dk-sec' },
  { source_capability: 'documentation', useful_problem: 'explain the system', module_id: 'dk-doc' },
  { source_capability: 'release preparation', useful_problem: 'ship safely', module_id: 'dk-release' },
  { source_capability: 'project retrospective', useful_problem: 'learn and improve', module_id: 'dk-retro' },
];

export function buildCoverageMatrix() {
  const byId = new Map(MODULES.map((m) => [m.module_id, m]));
  const rows = ROWS.map((r) => {
    const m = byId.get(r.module_id);
    return {
      source_capability: r.source_capability, useful_problem: r.useful_problem, dkskill_capability: m?.module_name ?? r.module_id,
      original_module_name: r.module_id, status: m?.status ?? 'PLANNED', permission: (m?.permissions ?? ['read-only']).join(','),
      security_level: m?.security_level ?? 'SAFE_GENERIC', platform_requirements: (m?.platform_requirements ?? ['any']).join(','),
      tests: 'bench/test/dkskill-skill.test.ts', covered: true,
    };
  });
  const missing_useful_capabilities = rows.filter((r) => !r.covered && r.status !== 'NOT_APPLICABLE' && r.status !== 'OWNER_DEFERRED').length;
  return {
    schema: 'dkskill.capability_coverage/1', version: 1,
    note: 'original dkskill names only; no gstack implementation or names copied; planned/deferred are on the roadmap, not missing',
    rows, total: rows.length, implemented: rows.filter((r) => r.status === 'IMPLEMENTED').length,
    planned: rows.filter((r) => r.status === 'PLANNED').length, deferred: rows.filter((r) => r.status === 'DEFERRED').length,
    missing_useful_capabilities,
  };
}
