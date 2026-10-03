// dcore-qa scenario generation — pure. Turns a REAL page inspection (dcore-browse `inspect`) into an executable test
// plan: page-load, field validation (positive / negative / boundary from the field's own constraints), keyboard,
// accessibility, mobile layout and performance cases. Validation cases use the browser's constraint-validation API
// (checkValidity / validity.*) and never submit forms, so generated cases have no side effects on the system under test.
// Anything that would need a submission or a destructive action is listed under `not_tested`, never guessed.

const RISKY = /\b(delete|remove|revoke|destroy|drop|logout|log out|sign out|signout|deactivate|disable|cancel subscription|pay|purchase|transfer|send|submit|create|save|confirm|approve|reject)\b/i;
const q = (s) => JSON.stringify(s);
const validity = (sel) => `(() => { const e = document.querySelector(${q(sel)}); return e ? e.checkValidity() : 'MISSING'; })()`;
const valueLen = (sel) => `(() => { const e = document.querySelector(${q(sel)}); return e ? e.value.length : -1; })()`;

function nonMatching(pattern) {
  for (const cand of ['~~', '!@#', 'zz zz', '0', '-', 'a']) {
    try { if (!new RegExp(`^(?:${pattern})$`, 'u').test(cand)) return cand; } catch { return null; }
  }
  return null;
}

// One field -> its validation cases. `f` = { selector, type, name, constraints }
export function fieldCases(f) {
  const c = f.constraints ?? {};
  const label = f.name || f.selector;
  const cases = [];
  const add = (type, title, value, expectValid, expected, extra = []) => cases.push({
    area: `Field: ${label}`, type, title: `${label}: ${title}`, expected,
    steps: [{ fill: { selector: f.selector, value } }, ...extra, { evaluate: { expression: validity(f.selector), expect: expectValid }, name: `checkValidity() === ${expectValid}` }],
  });
  const t = (f.type ?? '').toLowerCase();
  if (c.required) add('negative', 'empty value is rejected (required)', '', false, 'An empty value is invalid because the field is required.');
  if (t === 'email') {
    add('negative', 'malformed email is rejected', 'not-an-email', false, 'A value that is not an email address is invalid.');
    add('positive', 'well-formed email is accepted', 'qa.user@example.test', true, 'A well-formed email address is valid.');
  }
  if (t === 'url') add('negative', 'malformed URL is rejected', 'not a url', false, 'A value that is not a URL is invalid.');
  if (t === 'number' || t === 'range') {
    const step = Number(c.step) > 0 ? Number(c.step) : 1;
    if (c.min !== undefined && !Number.isNaN(Number(c.min))) {
      add('boundary', `below minimum (${Number(c.min) - step}) is rejected`, String(Number(c.min) - step), false, `Values below the minimum ${c.min} are invalid.`);
      add('boundary', `minimum (${c.min}) is accepted`, String(c.min), true, `The minimum ${c.min} itself is valid.`);
    }
    if (c.max !== undefined && !Number.isNaN(Number(c.max))) {
      add('boundary', `above maximum (${Number(c.max) + step}) is rejected`, String(Number(c.max) + step), false, `Values above the maximum ${c.max} are invalid.`);
      add('boundary', `maximum (${c.max}) is accepted`, String(c.max), true, `The maximum ${c.max} itself is valid.`);
    }
    add('negative', 'non-numeric input is not accepted as a number', 'abc', c.required ? false : true, c.required ? 'Non-numeric text leaves a required number field empty, so it is invalid.' : 'Non-numeric text is discarded by the browser (the field stays empty).');
  }
  if (c.maxlength !== undefined && Number(c.maxlength) > 0 && Number(c.maxlength) <= 5000) {
    const n = Number(c.maxlength);
    cases.push({ area: `Field: ${label}`, type: 'boundary', title: `${label}: input longer than maxlength (${n}) is truncated`, expected: `At most ${n} characters are kept.`, steps: [{ fill: { selector: f.selector, value: 'x'.repeat(n + 1) } }, { evaluate: { expression: `${valueLen(f.selector)} <= ${n}`, expect: true }, name: `value.length <= ${n}` }] });
  }
  if (c.minlength !== undefined && Number(c.minlength) > 1) {
    const n = Number(c.minlength);
    add('boundary', `shorter than minlength (${n - 1} chars) is rejected`, 'x'.repeat(n - 1), false, `Fewer than ${n} characters is invalid.`);
    add('boundary', `exactly minlength (${n} chars) is accepted`, 'x'.repeat(n), true, `${n} characters is valid.`);
  }
  if (c.pattern) {
    const bad = nonMatching(c.pattern);
    if (bad !== null) add('negative', `value not matching the required pattern is rejected (${q(bad)})`, bad, false, `A value that does not match /${c.pattern}/ is invalid.`);
  }
  return cases;
}

// inspection: output of the dcore-browse `inspect` step. opts: { url, name, setup, budgets: { load_ms } }
export function generatePlan(inspection, opts = {}) {
  const url = opts.url ?? inspection?.url;
  const plan = {
    schema: 'dcore.testplan/1', name: opts.name ?? `Functional test — ${inspection?.title || url}`, target: url,
    environment: opts.environment ?? 'UNSPECIFIED', generated_by: 'dcore-qa --discover (from a live page inspection)',
    scope: [], out_of_scope: [], setup: opts.setup ?? [], cases: [], not_tested: [],
  };
  if (!inspection || !url) { plan.not_tested.push({ area: 'whole page', status: 'BLOCKED', reason: 'no page inspection available: the page could not be discovered' }); return plan; }
  const path = (() => { try { return new URL(url).pathname; } catch { return url; } })();
  const h1 = (inspection.headings ?? []).filter((h) => h.startsWith('h1: ')).map((h) => h.slice(4)).slice(0, 2);
  plan.cases.push({ area: 'Page', type: 'positive', title: 'Page loads at the expected URL with its main heading', expected: `The page opens at ${path}${h1.length ? ` and shows "${h1.join('", "')}"` : ''}; no uncaught errors.`, steps: [{ goto: url }, { assertUrl: path }, ...h1.map((t) => ({ assertText: t })), { screenshot: { name: 'page-load', fullPage: true } }] });
  // field validation (deduplicated by selector; visible, enabled fields only)
  const seen = new Set();
  // interactive[] holds only visible elements; form fields carry `visible` (fields in hidden forms/modals are skipped)
  const fields = [...(inspection.interactive ?? []), ...(inspection.forms ?? []).flatMap((f) => f.fields ?? []).filter((f) => f.visible === true)]
    .filter((f) => f.selector && !seen.has(f.selector) && seen.add(f.selector))
    .filter((f) => ['input', 'textarea', 'select'].includes(f.tag ?? 'input') && !['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'password'].includes(String(f.type ?? '').toLowerCase()) && !f.disabled);
  for (const f of fields) for (const c of fieldCases({ selector: f.selector, type: f.type, name: f.name || f.label, constraints: f.constraints })) plan.cases.push(c);
  if (fields.some((f) => !f.constraints)) plan.not_tested.push({ area: 'Fields without declared constraints', status: 'NOT_TESTED', reason: `${fields.filter((f) => !f.constraints).length} field(s) declare no HTML constraints; server-side validation needs a submission, which is not generated automatically (side effects)` });
  // structure, keyboard, accessibility, responsive, performance
  if ((inspection.tables ?? []).length) plan.cases.push({ area: 'Data', type: 'positive', title: 'Data tables render with headers and rows', expected: 'Each data table shows column headers and at least one row.', steps: inspection.tables.slice(0, 3).map((t) => ({ assertCount: { selector: `${t.selector} th, ${t.selector} [role=columnheader]`, min: 1 } })) });
  plan.cases.push({ area: 'Keyboard', type: 'accessibility', title: 'Keyboard: Tab moves focus to an interactive element', expected: 'After pressing Tab, focus is on a link, button or form field.', steps: [{ goto: url }, { press: 'Tab' }, { evaluate: { expression: "(() => { const e = document.activeElement; return !!e && e !== document.body && /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(e.tagName) || (e && e.tabIndex >= 0 && e !== document.body); })()", expect: true }, name: 'focus left <body>' }] });
  plan.cases.push({ area: 'Accessibility', type: 'accessibility', title: 'Basic accessibility heuristics', expected: 'lang/title present; images have alt; fields and controls have accessible names; no duplicate ids; heading order; no positive tabindex; no focusable content inside aria-hidden.', steps: [{ a11y: true }] });
  plan.cases.push({ area: 'Responsive', type: 'ui', title: 'Mobile viewport (390x844) has no horizontal overflow', expected: 'At 390px wide the page does not scroll horizontally.', steps: [{ viewport: { width: 390, height: 844 } }, { evaluate: { expression: 'document.documentElement.scrollWidth <= window.innerWidth + 2', expect: true }, name: 'no horizontal overflow' }, { screenshot: 'mobile' }, { viewport: { width: 1366, height: 900, mobile: false } }] });
  const budget = opts.budgets?.load_ms ?? 5000;
  plan.cases.push({ area: 'Performance', type: 'performance', title: `Page load completes within ${budget} ms`, expected: `Navigation load event within ${budget} ms (measured from this machine).`, steps: [{ goto: url }, { perf: { maxLoadMs: budget } }] });
  // what discovery deliberately does not exercise
  const risky = (inspection.interactive ?? []).filter((e) => ['button', 'a', 'input'].includes(e.tag) && RISKY.test(e.name ?? '')).map((e) => e.name).slice(0, 15);
  if (risky.length) plan.not_tested.push({ area: 'State-changing actions', status: 'NOT_TESTED', reason: `not generated automatically because they may change data: ${risky.join(', ')} — add explicit cases with authorization` });
  if (inspection.iframes) plan.not_tested.push({ area: 'Embedded iframes', status: 'NOT_TESTED', reason: `${inspection.iframes} iframe(s) present; iframe content is not traversed by dcore-browse` });
  plan.scope = [...new Set(plan.cases.map((c) => c.area))];
  plan.cases.forEach((c, i) => { c.id = `TC-${String(i + 1).padStart(3, '0')}`; });
  return plan;
}
