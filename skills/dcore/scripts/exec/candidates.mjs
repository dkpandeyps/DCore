// dcore candidate scenario generation (M41) — pure and deterministic: application map in, scenario document
// (dcore.scenarios/1) out. Every generated scenario is a CANDIDATE: nothing has been executed. Candidates that would
// change data or affect a shared environment carry `approval: "APPROVAL_REQUIRED"` and `requires_approval: [gates]`;
// the scenario engine refuses to execute them without those approvals. Where the correct outcome cannot be derived
// from what was observed (a success message, a search term), the step uses a review placeholder such as
// {{data.success_message}}: the engine BLOCKS the step until a human supplies the value, so no guessed expectation
// can ever produce PASS.

import { planNegative, matrixSummary } from './negative.mjs';

export const CATEGORIES = ['happy-path', 'valid-input', 'required-validation', 'invalid-input', 'boundary', 'empty-state', 'search-filter', 'permission', 'authentication', 'session', 'error-handling', 'fault-injection', 'robustness', 'data-integrity', 'responsive', 'navigation', 'persistence', 'state-change'];
const CODE = { 'valid-input': 'VI', session: 'SS', 'fault-injection': 'FI', robustness: 'RB', 'data-integrity': 'DI', 'happy-path': 'HP', 'required-validation': 'RQ', 'invalid-input': 'IV', boundary: 'BD', 'empty-state': 'ES', 'search-filter': 'SF', permission: 'PM', authentication: 'AU', 'error-handling': 'EH', responsive: 'RS', navigation: 'NV', persistence: 'PS', 'state-change': 'SC' };
const TYPE = { 'valid-input': 'Validation', session: 'Authentication', 'fault-injection': 'Error handling', robustness: 'Negative', 'data-integrity': 'Negative', 'happy-path': 'Functional', 'required-validation': 'Validation', 'invalid-input': 'Negative', boundary: 'Boundary', 'empty-state': 'Functional', 'search-filter': 'Functional', permission: 'Authorization', authentication: 'Authentication', 'error-handling': 'Error handling', responsive: 'Responsive', navigation: 'Smoke', persistence: 'Regression', 'state-change': 'Functional' };
const PRIO = { session: 'P1', 'data-integrity': 'P2', 'fault-injection': 'P2', 'valid-input': 'P2', robustness: 'P3', authentication: 'P1', permission: 'P1', 'happy-path': 'P1', persistence: 'P2', 'state-change': 'P2', navigation: 'P2', 'required-validation': 'P2', 'error-handling': 'P2', 'invalid-input': 'P3', boundary: 'P3', 'search-filter': 'P3', 'empty-state': 'P3', responsive: 'P3' };

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'x';
const usable = (f) => f.visible !== false && f.selector && !['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'image'].includes(String(f.type).toLowerCase());
const fieldName = (f) => f.label || f.name || f.selector;

// a syntactically valid sample for a field, derived only from its declared type/constraints
export function sampleValue(f) {
  const c = f.constraints ?? {}; const t = String(f.type ?? '').toLowerCase();
  if (t === 'email') return 'qa.user@example.test';
  if (t === 'url') return 'https://example.test/qa';
  if (t === 'tel') return '+15550100';
  if (t === 'date') return '2026-01-15';
  if (t === 'number' || t === 'range') { const min = c.min !== undefined ? Number(c.min) : null; const max = c.max !== undefined ? Number(c.max) : null; return String(min !== null && max !== null ? Math.floor((min + max) / 2) : min !== null ? min : max !== null ? max : 1); }
  if (t.startsWith('select')) return null;   // keep the current option
  const min = Number(c.minlength ?? 0); const max = Number(c.maxlength ?? 0);
  let v = 'DCore QA'; if (min > v.length) v = v.padEnd(min, 'x'); if (max && v.length > max) v = v.slice(0, max);
  return v;
}


export function generateCandidates(map, opts = {}) {
  const out = []; const counters = {};
  const add = (category, sc) => {
    counters[category] = (counters[category] ?? 0) + 1;
    const id = `CAND-${CODE[category]}-${String(counters[category]).padStart(3, '0')}`;
    out.push({ id, lifecycle: 'CANDIDATE', category, type: TYPE[category], priority: PRIO[category], approval: sc.requires_approval?.length ? 'APPROVAL_REQUIRED' : 'SAFE', review: sc.review ?? [], ...sc });
  };
  const pages = (map?.routes ?? []).filter((p) => p.kind === 'page');
  const start = map?.start_url;
  const origin = map?.origin;
  const loginMarker = map?.auth?.login_marker;

  for (const p of pages) {
    const open = { action: 'goto', target: p.url, expect: p.h1?.[0] ? { text: p.h1[0] } : undefined };
    if (!open.expect) delete open.expect;
    // ---- forms: happy path, validation, invalid, boundary, persistence
    for (const f of p.forms ?? []) {
      if (f.auth_form || f.visible === false) continue;
      const fields = (f.fields ?? []).filter(usable);
      const submit = (f.submits ?? []).find((b) => b.visible !== false);
      const fill = fields.map((x) => ({ x, v: sampleValue(x) })).filter((y) => y.v !== null).map(({ x, v }) => ({ action: 'fill', target: { selector: x.selector }, input: v, expect: { value: v } }));
      const formName = submit?.name || f.selector;
      const writes = f.state_changing ? ['ui-write'] : [];
      if (submit) {
        add('happy-path', { title: `Submit "${formName}" with valid data on ${p.route}`, feature: p.route, source: { route: p.route, form: f.selector }, requires_approval: writes,
          preconditions: map?.setup?.status === 'PASS' ? 'Setup (login) completed.' : 'None', expected: 'The form is accepted and the success outcome is shown.',
          review: ['declare data.success_message (the text shown on success)', ...(writes.length ? ['this submits data to the environment: run only where that is allowed'] : [])],
          steps: [open, ...fill, { action: 'click', target: { selector: submit.selector } }, { action: 'assert', expect: { notification: '{{data.success_message}}' } }] });
        if (writes.length) add('persistence', { title: `Data submitted through "${formName}" persists after reload (${p.route})`, feature: p.route, source: { route: p.route, form: f.selector }, requires_approval: writes,
          expected: 'After submitting and reloading, the saved record is still shown.', review: ['declare data.persisted_text (how the saved record appears after reload)', 'creates data in the environment'],
          steps: [open, ...fill, { action: 'click', target: { selector: submit.selector } }, { action: 'reload' }, { action: 'assert', expect: { text: '{{data.persisted_text}}' } }] });
      }
    }
    // ---- search / filter + empty state
    for (const s of (p.search_filters ?? []).filter((x) => x.scope !== 'global')) {   // global (menu/header) search does not filter page content
      if (s.kind === 'search') {
        add('search-filter', { title: `Search "${s.label || s.selector}" narrows results (${p.route})`, feature: p.route, source: { route: p.route, control: s.selector }, expected: 'Results contain the search term.', review: ['declare data.search_term (a value known to exist)'],
          steps: [open, { action: 'type', target: { selector: s.selector }, input: { value: '{{data.search_term}}', clear: true } }, { action: 'waitFor', input: { stable: true, quietMs: 500 } }, { action: 'assert', expect: { text: '{{data.search_term}}' } }] });
        const table = s.table ? { selector: s.table } : null;   // only a table in the same section as the search box
        add('empty-state', { title: `Search "${s.label || s.selector}" with no match shows an empty state (${p.route})`, feature: p.route, source: { route: p.route, control: s.selector },
          expected: table ? 'No rows remain in the results table.' : 'An empty-state message is shown.', review: table ? [] : ['declare data.empty_state_text (the message shown when nothing matches)'],
          steps: [open, { action: 'type', target: { selector: s.selector }, input: { value: 'zzqq-dcore-no-match-{{run.short}}', clear: true } }, { action: 'waitFor', input: { stable: true, quietMs: 500 } }, table ? { action: 'assert', expect: { count: { selector: `${table.selector} tbody tr`, equals: 0 } } } : { action: 'assert', expect: { text: '{{data.empty_state_text}}' } }] });
      } else if (s.kind === 'filter') {
        add('search-filter', { title: `Filter "${s.label || s.selector}" changes the results (${p.route})`, feature: p.route, source: { route: p.route, control: s.selector }, expected: 'Choosing a filter value updates the results accordingly.', review: ['declare data.filter_option and data.filter_result_text'],
          steps: [open, { action: 'select', target: { selector: s.selector }, input: '{{data.filter_option}}' }, { action: 'assert', expect: { text: '{{data.filter_result_text}}' } }] });
      }
    }
    // ---- state-changing buttons outside forms (delete/revoke/…): never automatic
    for (const b of (p.buttons ?? []).filter((x) => x.state_changing && !x.in_form && !x.disabled)) {
      add('state-change', { title: `"${b.name}" performs its action after confirmation (${p.route})`, feature: p.route, source: { route: p.route, control: b.selector }, requires_approval: ['ui-write'],
        expected: 'The action asks for confirmation (where applicable) and its effect is shown.', review: ['changes data in the environment', 'declare data.effect_text (what proves the action took effect)', 'add the confirmation step if the app asks for one'],
        steps: [open, { action: 'click', target: { selector: b.selector } }, { action: 'assert', expect: { text: '{{data.effect_text}}' } }] });
    }
    // ---- responsive
    add('responsive', { title: `${p.route} is mobile-friendly at 390px`, feature: p.route, source: { route: p.route }, expected: 'The page declares a responsive viewport (meta viewport) and does not scroll horizontally at 390px.',
      steps: [open, { action: 'viewport', input: { width: 390, height: 844 } }, { action: 'evaluate', input: '!!document.querySelector("meta[name=viewport]") && document.documentElement.scrollWidth <= window.innerWidth + 2', expect: { value: true } }, { action: 'viewport', input: { width: 1366, height: 900, mobile: false } }] });
    // ---- error handling: observed runtime errors become regression candidates
    if ((p.console_errors ?? []).length || (p.network_failures ?? []).length) add('error-handling', { title: `${p.route} loads without runtime errors or failed requests`, feature: p.route, source: { route: p.route },
      expected: `No uncaught exceptions, console errors or failed requests (discovery observed: ${[...(p.console_errors ?? []), ...(p.network_failures ?? [])].slice(0, 3).join(' | ')}).`,
      steps: [{ ...open, expect: { ...(open.expect ?? {}), noErrors: true } }] });
  }
  // ---- navigation (from the start page's navigation links)
  const startPage = pages.find((p) => map?.start_url && p.url === map.start_url.replace(/[?#].*$/, '')) ?? pages[0];
  for (const n of (startPage?.nav ?? []).filter((x) => !x.state_changing).slice(0, 25)) {
    const target = pages.find((p) => p.route === n.route);
    if (!target || n.route === startPage.route || !n.text) continue;
    add('navigation', { title: `Navigation "${n.text}" opens ${n.route}`, feature: 'Navigation', source: { route: startPage.route, link: n.text },
      expected: `Clicking "${n.text}" opens ${n.route}${target.h1?.[0] ? ` showing "${target.h1[0]}"` : ''}.`,
      steps: [{ action: 'goto', target: startPage.url }, { action: 'click', target: { text: n.text, role: 'link', first: true }, expect: { url: n.route, ...(target.h1?.[0] ? { text: target.h1[0] } : {}) } }, { action: 'back', expect: { url: startPage.route } }] });
  }
  // ---- negative & boundary cases (M42): only the cases that apply to each field / form / page
  const neg = planNegative(map, { sampleValue, usable, fieldName, maxFieldsPerPage: opts.maxFieldsPerPage });
  const keyToId = {};
  for (const { _key, category, ...spec } of neg.specs) { add(category, spec); keyToId[_key] = out[out.length - 1].id; }
  const negative_matrix = neg.matrix.map(({ _key, ...r }) => (_key ? { ...r, scenario_ids: [keyToId[_key]] } : r));
  // ---- unknown route + permissions + invalid login
  const protectedApp = (map?.auth?.protected_routes ?? []).length > 0;
  if (origin && protectedApp && loginMarker) {
    // without a session a protected app answers unknown routes with its login page (no 404 to an anonymous caller)
    add('error-handling', { title: 'An unknown route without a session is sent to login', feature: 'Routing', source: { route: '/dcore-unknown' }, expected: 'An anonymous request to a non-existent route shows the login page, revealing nothing about the route.',
      steps: [{ action: 'api', input: { url: `${origin}/dcore-not-a-route-{{run.short}}` }, expect: { bodyContains: loginMarker } }] });
    add('error-handling', { title: 'An unknown route shows a not-found page to a signed-in user', feature: 'Routing', source: { route: '/dcore-unknown' }, expected: 'A signed-in user sees a not-found page for a non-existent route.', review: ['declare data.not_found_text (the text of the not-found page)'],
      steps: [{ action: 'goto', target: `${origin}/dcore-not-a-route-{{run.short}}`, expect: { text: '{{data.not_found_text}}' } }] });
  } else if (origin) add('error-handling', { title: 'An unknown route returns 404', feature: 'Routing', source: { route: '/dcore-unknown' }, expected: 'The server answers 404 for a route that does not exist.',
    steps: [{ action: 'api', input: { url: `${origin}/dcore-not-a-route-{{run.short}}` }, expect: { status: 404 } }] });
  if ((map?.auth?.protected_routes ?? []).length) add('permission', { negative: { case: 'unauthorized', label: 'Unauthorized user' }, title: 'A lower-privileged account cannot use administrator-only routes', feature: 'Authorization', source: { routes: map.auth.protected_routes.slice(0, 5) }, status: 'NOT_TESTED',
    reason: 'needs a second, lower-privileged test account (provide it, then replace this candidate with real steps)', expected: 'Routes requiring higher privileges are refused for a lower-privileged user.', steps: [] });
  const login = (map?.routes ?? []).find((p) => p.kind === 'login');
  if (login) {
    const form = (login.forms ?? []).find((f) => f.auth_form);
    const user = form?.fields.find((f) => !/password/i.test(f.type) && usable(f)); const pass = form?.fields.find((f) => /password/i.test(f.type)); const sub = form?.submits?.[0];
    if (user && pass && sub) add('authentication', { title: 'Login with a wrong password is refused', feature: 'Authentication', source: { route: login.route }, requires_approval: ['account'],
      expected: 'The login is refused and the user stays on the login page with an error message.', review: ['a failed login may count towards account lockout on a shared environment', 'declare data.login_error_text'],
      steps: [{ action: 'goto', target: login.url }, { action: 'fill', target: { selector: user.selector }, input: { valueEnv: 'DCORE_USER' } }, { action: 'fill', target: { selector: pass.selector }, input: 'dcore-wrong-password-{{run.short}}' }, { action: 'click', target: { selector: sub.selector }, expect: { url: login.route, text: '{{data.login_error_text}}' } }] });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return {
    schema: 'dcore.scenarios/1', name: `Candidate scenarios — ${origin ?? 'unknown origin'}`, target: start ?? null, environment: opts.environment ?? 'REVIEW BEFORE RUNNING',
    generated_from: { map_hash: map?.map_hash ?? null, generator: 'dcore candidates (M41) + negative planner (M42)' }, lifecycle_note: 'every scenario here is a CANDIDATE: none has been executed. APPROVAL_REQUIRED candidates do not run without the listed approvals; {{data.*}} placeholders must be filled in before those steps can run.',
    setup: opts.setup ?? [], data: {}, scenarios: out, negative_matrix,
    summary: { candidates: out.length, by_category: Object.fromEntries(CATEGORIES.map((c) => [c, out.filter((s) => s.category === c).length]).filter(([, n]) => n)), approval_required: out.filter((s) => s.approval === 'APPROVAL_REQUIRED').length, needs_review: out.filter((s) => s.review.length).length, negative: { scenarios: out.filter((s) => s.negative).length, ...matrixSummary(negative_matrix) } },
  };
}
