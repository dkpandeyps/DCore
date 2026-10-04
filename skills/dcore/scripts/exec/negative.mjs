// dcore negative & boundary testing (M42) — decides, per target, which negative/boundary cases apply, generates the
// applicable ones as candidate scenarios, and turns a violated negative expectation into a defect candidate.
// Nothing here executes anything. Applicability is decided from what discovery observed (field type, declared
// constraints, form method, auth boundary, API calls); a case that cannot be derived from evidence is NOT_APPLICABLE
// (with the reason) or NOT_TESTED (it applies, but cannot be tested automatically). Cases that would write data are
// APPROVAL_REQUIRED. Fault cases (server error, network failure, timeout, empty / malformed response) are simulated
// inside the test browser only: the faulted request never reaches the server.

export const NEGATIVE_CASES = [
  { id: 'valid', label: 'Valid input', level: 'field', category: 'valid-input' },
  { id: 'invalid', label: 'Invalid input', level: 'field', category: 'invalid-input' },
  { id: 'empty', label: 'Empty input', level: 'field', category: 'required-validation' },
  { id: 'missing-required', label: 'Missing required fields', level: 'form', category: 'required-validation' },
  { id: 'min', label: 'Minimum value', level: 'field', category: 'boundary' },
  { id: 'max', label: 'Maximum value', level: 'field', category: 'boundary' },
  { id: 'below-min', label: 'Just below minimum', level: 'field', category: 'boundary' },
  { id: 'above-max', label: 'Just above maximum', level: 'field', category: 'boundary' },
  { id: 'duplicate', label: 'Duplicate input', level: 'form', category: 'data-integrity' },
  { id: 'malformed', label: 'Malformed input', level: 'field', category: 'invalid-input' },
  { id: 'unexpected-chars', label: 'Unexpected characters', level: 'field', category: 'robustness' },
  { id: 'long-input', label: 'Long input', level: 'field', category: 'robustness' },
  { id: 'unauthorized', label: 'Unauthorized user', level: 'app', category: 'permission' },
  { id: 'unauthenticated', label: 'Unauthenticated user', level: 'page', category: 'authentication' },
  { id: 'expired-session', label: 'Expired session', level: 'page', category: 'session' },
  { id: 'refresh', label: 'Refresh during workflow', level: 'form', category: 'robustness' },
  { id: 'back', label: 'Back navigation', level: 'page', category: 'navigation' },
  { id: 'double-submit', label: 'Double submission', level: 'form', category: 'data-integrity' },
  { id: 'server-error', label: 'Server error', level: 'page', category: 'fault-injection' },
  { id: 'network-failure', label: 'Network failure', level: 'page', category: 'fault-injection' },
  { id: 'timeout', label: 'Timeout', level: 'page', category: 'fault-injection' },
  { id: 'empty-response', label: 'Empty API response', level: 'page', category: 'fault-injection' },
  { id: 'malformed-response', label: 'Malformed API response', level: 'page', category: 'fault-injection' },
];
export const DECISIONS = ['APPLICABLE', 'APPROVAL_REQUIRED', 'NOT_APPLICABLE', 'NOT_TESTED'];

// Triage hints for a violated case. Severity / priority are only proposed where the evidence itself establishes the
// impact (an access-control failure); everywhere else they stay UNASSESSED for a person to decide.
const UNASSESSED = (why) => ({ value: 'UNASSESSED', basis: why });
const BUSINESS = 'the evidence shows the behaviour, not its business impact: assign after triage';
const SECURITY = { value: 'high', basis: 'protected content was served without a valid session: an access-control failure, whatever the page' };
const TRIAGE = {
  valid: { type: 'Functional — valid input refused' }, invalid: { type: 'Validation' }, empty: { type: 'Validation' }, 'missing-required': { type: 'Validation' },
  min: { type: 'Validation — boundary' }, max: { type: 'Validation — boundary' }, 'below-min': { type: 'Validation — boundary' }, 'above-max': { type: 'Validation — boundary' },
  duplicate: { type: 'Data integrity' }, malformed: { type: 'Validation' }, 'unexpected-chars': { type: 'Input handling' }, 'long-input': { type: 'Input handling' },
  unauthorized: { type: 'Security — authorization', severity: SECURITY, priority: { value: 'P1', basis: 'security rule: access-control failures are fixed first' } },
  unauthenticated: { type: 'Security — authentication', severity: SECURITY, priority: { value: 'P1', basis: 'security rule: access-control failures are fixed first' } },
  'expired-session': { type: 'Security — session management', severity: SECURITY, priority: { value: 'P1', basis: 'security rule: access-control failures are fixed first' } },
  refresh: { type: 'State handling' }, back: { type: 'Navigation / state handling' }, 'double-submit': { type: 'Data integrity' },
  'server-error': { type: 'Error handling' }, 'network-failure': { type: 'Error handling' }, timeout: { type: 'Error handling' }, 'empty-response': { type: 'Error handling' }, 'malformed-response': { type: 'Error handling' },
};

const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
// "rejected": the field reports itself invalid, or the browser refused to hold the value (sanitised / truncated / clamped)
const rejects = (sel, input) => `(() => { const e = ${q(sel)}; if (!e) return 'MISSING'; return !e.checkValidity() || e.value !== ${JSON.stringify(input)}; })()`;
const accepts = (sel, input) => `(() => { const e = ${q(sel)}; if (!e) return 'MISSING'; return e.checkValidity() && e.value === ${JSON.stringify(input)}; })()`;
const TEXTLIKE = new Set(['text', 'search', 'textarea', 'tel', '']);
const kindOf = (x) => { const t = String(x.type ?? '').toLowerCase(); return t === 'range' ? 'number' : ['date', 'datetime-local', 'month', 'week', 'time'].includes(t) ? (t === 'date' ? 'date' : 'datetime') : t.startsWith('select') ? 'select' : t; };
const day = (iso, d) => { const t = new Date(`${iso}T00:00:00Z`); if (Number.isNaN(t.getTime())) return null; t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
export const UNEXPECTED = '<b>DCore</b> \' " ; -- %00 ☃ é 𝟘 \\ /';
const LONG = 10_000;

function nonMatching(pattern) { for (const c of ['~~', '!@#', 'zz zz', '0', '-']) { try { if (!new RegExp(`^(?:${pattern})$`, 'u').test(c)) return c; } catch { return null; } } return null; }
const matches = (pattern, v) => { try { return new RegExp(`^(?:${pattern})$`, 'u').test(v); } catch { return false; } };

// Plan the negative cases for an application map. Returns { specs, matrix }: specs are scenario bodies (category,
// title, steps, negative{…}, requires_approval) for the candidate generator to number; matrix rows record the decision
// for every (target, case) pair, with `_key` linking APPLICABLE / APPROVAL_REQUIRED rows to their spec.
export function planNegative(map, { sampleValue, usable, fieldName, maxFieldsPerPage = 12 } = {}) {
  const specs = []; const matrix = []; let k = 0;
  const pages = (map?.routes ?? []).filter((p) => p.kind === 'page');
  const auth = map?.auth ?? {};
  const loggedIn = map?.setup?.status === 'PASS';
  const row = (target, id, decision, reason, spec) => {
    const c = NEGATIVE_CASES.find((x) => x.id === id);
    const r = { target, case: id, label: c.label, decision, reason };
    if (spec) { const key = `neg-${++k}`; r._key = key; specs.push({ ...spec, _key: key, category: spec.category ?? c.category, negative: { case: id, label: c.label, ...spec.negative }, requires_approval: spec.requires_approval ?? [] }); }
    matrix.push(r);
  };
  const oracle = (st) => ({ ...st, oracle: true });

  for (const p of pages) {
    const open = { action: 'goto', target: p.url, ...(p.h1?.[0] ? { expect: { text: p.h1[0] } } : {}) };
    const h1 = p.h1?.[0];
    // ---------- field level
    const formFields = (p.forms ?? []).filter((f) => !f.auth_form && f.visible !== false).flatMap((f) => (f.fields ?? []).filter(usable).map((x) => ({ x, form: f })));
    const standalone = (p.inputs ?? []).filter(usable).filter((x) => !formFields.some((y) => y.x.selector === x.selector)).map((x) => ({ x, form: null }));
    const fields = [...formFields, ...standalone];
    // read-only / disabled inputs are recorded, never typed into (staging: "Select month" date pickers are readonly)
    const locked = [...(p.forms ?? []).filter((f) => !f.auth_form && f.visible !== false).flatMap((f) => f.fields ?? []), ...(p.inputs ?? [])].filter((x, i, all) => x.visible !== false && x.selector && (x.readonly || x.disabled) && all.findIndex((y) => y.selector === x.selector) === i);
    for (const x of locked) for (const z of NEGATIVE_CASES.filter((c) => c.level === 'field')) row({ level: 'field', route: p.route, selector: x.selector, name: fieldName(x), type: kindOf(x) || 'text', form: null }, z.id, 'NOT_APPLICABLE', `${x.readonly ? 'read-only' : 'disabled'} field: its value is set by a picker or by the application, so typed input cannot be tested (test the widget that sets it)`);
    fields.forEach(({ x, form }, i) => {
      const name = fieldName(x); const c = x.constraints ?? {}; const kind = kindOf(x);
      const target = { level: 'field', route: p.route, selector: x.selector, name, type: kind || 'text', form: form?.selector ?? null };
      const fieldCases = NEGATIVE_CASES.filter((z) => z.level === 'field');
      if (i >= maxFieldsPerPage) { for (const z of fieldCases) row(target, z.id, 'NOT_TESTED', `field cap reached (${maxFieldsPerPage} fields per page): raise it to include this field`); return; }
      if (kind === 'select') { for (const z of fieldCases) row(target, z.id, 'NOT_APPLICABLE', 'a select offers only its listed options: free-form values cannot be entered'); return; }
      const where = `${name} (${p.route})`;
      const check = (id, input, accept, expectedT, violationT, extra = {}) => row(target, id, 'APPLICABLE', null, {
        title: `${name}: ${expectedT[0].toLowerCase()}${expectedT.slice(1)} (${p.route})`, feature: p.route, source: { route: p.route, field: x.selector }, expected: `${expectedT}.`,
        negative: { expected: `${name}: ${expectedT}.`, violation: `${name}: ${violationT}.`, input: input.length > 80 ? `${input.slice(0, 40)}… (${input.length} chars)` : input },
        review: extra.review ?? [],
        steps: [open, { action: 'fill', target: { selector: x.selector }, input }, oracle({ action: 'evaluate', input: accept ? accepts(x.selector, input) : rejects(x.selector, input), expect: { value: true, ...(extra.noNewErrors ? { noNewErrors: true } : {}) } })],
      });
      // valid
      const v = sampleValue(x);
      if (v === null || v === undefined) row(target, 'valid', 'NOT_APPLICABLE', 'no valid sample can be derived from the field type');
      else if (c.pattern && !matches(c.pattern, v)) row(target, 'valid', 'NOT_TESTED', `the declared pattern ${c.pattern} needs a domain-specific valid value (declare one in the scenario data)`);
      else check('valid', v, true, `a valid value ("${v}") is accepted`, `a valid value ("${v}") was rejected`);
      // invalid / malformed (by declared type or pattern)
      const bad = { number: 'abc', email: 'not-an-email', url: 'not a url', date: 'not-a-date' }[kind] ?? (c.pattern ? nonMatching(c.pattern) : null);
      if (bad !== null && bad !== undefined) check('invalid', bad, false, `an invalid value ("${bad}") is rejected`, `an invalid value ("${bad}") was accepted`);
      else row(target, 'invalid', 'NOT_APPLICABLE', `no declared type or pattern defines an invalid value for a ${kind || 'text'} field (server-side rules are unknown)`);
      const mal = { number: '1e', email: 'qa@@example..test', url: 'http//example.test', date: '2026-13-45' }[kind] ?? null;
      if (mal) check('malformed', mal, false, `a malformed value ("${mal}") is rejected`, `a malformed value ("${mal}") was accepted`);
      else row(target, 'malformed', 'NOT_APPLICABLE', `a ${kind || 'text'} field has no structural format to break${c.pattern ? ' (the pattern case is covered by invalid input)' : ''}`);
      // empty
      if (x.required) check('empty', '', false, 'an empty value is rejected (required)', 'an empty value was accepted although the field is required');
      else check('empty', '', true, 'an empty value is accepted (optional field)', 'an empty value was rejected although the field is optional');
      // boundaries
      if (kind === 'number') {
        const step = Number(c.step) > 0 ? Number(c.step) : 1;
        if (c.min !== undefined && c.min !== '') { check('min', String(c.min), true, `the minimum ${c.min} is accepted`, `the minimum ${c.min} was rejected`); check('below-min', String(Number(c.min) - step), false, `${Number(c.min) - step} (just below the minimum ${c.min}) is rejected`, `${Number(c.min) - step} (just below the minimum ${c.min}) was accepted`); }
        else { row(target, 'min', 'NOT_APPLICABLE', 'no minimum declared: the lower limit is a business rule DCore cannot derive'); row(target, 'below-min', 'NOT_APPLICABLE', 'no minimum declared'); }
        if (c.max !== undefined && c.max !== '') { check('max', String(c.max), true, `the maximum ${c.max} is accepted`, `the maximum ${c.max} was rejected`); check('above-max', String(Number(c.max) + step), false, `${Number(c.max) + step} (just above the maximum ${c.max}) is rejected`, `${Number(c.max) + step} (just above the maximum ${c.max}) was accepted`); }
        else { row(target, 'max', 'NOT_APPLICABLE', 'no maximum declared: the upper limit is a business rule DCore cannot derive'); row(target, 'above-max', 'NOT_APPLICABLE', 'no maximum declared'); }
      } else if (kind === 'date') {
        const lo = c.min ? day(c.min, -1) : null; const hi = c.max ? day(c.max, 1) : null;
        if (c.min) { check('min', c.min, true, `the earliest date ${c.min} is accepted`, `the earliest date ${c.min} was rejected`); if (lo) check('below-min', lo, false, `${lo} (the day before the earliest date) is rejected`, `${lo} (before the earliest date ${c.min}) was accepted`); else row(target, 'below-min', 'NOT_APPLICABLE', `min ${c.min} is not a calendar date`); }
        else { row(target, 'min', 'NOT_APPLICABLE', 'no earliest date declared'); row(target, 'below-min', 'NOT_APPLICABLE', 'no earliest date declared'); }
        if (c.max) { check('max', c.max, true, `the latest date ${c.max} is accepted`, `the latest date ${c.max} was rejected`); if (hi) check('above-max', hi, false, `${hi} (the day after the latest date) is rejected`, `${hi} (after the latest date ${c.max}) was accepted`); else row(target, 'above-max', 'NOT_APPLICABLE', `max ${c.max} is not a calendar date`); }
        else { row(target, 'max', 'NOT_APPLICABLE', 'no latest date declared'); row(target, 'above-max', 'NOT_APPLICABLE', 'no latest date declared'); }
      } else if (kind === 'datetime') {
        for (const id of ['min', 'max', 'below-min', 'above-max']) row(target, id, 'NOT_TESTED', `${x.type} boundaries are not generated (only date fields are)`);
      } else {
        const minL = Number(c.minlength ?? 0); const maxL = Number(c.maxlength ?? 0);
        // length boundaries must otherwise be VALID: use a character the declared pattern accepts (real case: demoqa's
        // 10-digit mobile number has pattern d* — ten 'x' were rejected by the pattern, not by the length rule)
        const ch = !c.pattern ? 'x' : ['x', '1', 'a', 'A', '0'].find((k) => [minL, maxL].filter((n) => n > 0).every((n) => matches(c.pattern, k.repeat(n)))) ?? null;
        if (ch === null && (minL > 0 || maxL > 0)) { for (const id of ['min', 'max', 'below-min', 'above-max']) row(target, id, 'NOT_TESTED', `the declared pattern ${c.pattern} needs a domain-specific value of the boundary length`); }
        else {
        if (minL > 0) { check('min', ch.repeat(minL), true, `${minL} characters (the minimum length) are accepted`, `${minL} characters (the minimum length) were rejected`); if (minL > 1) check('below-min', ch.repeat(minL - 1), false, `${minL - 1} characters (one below the minimum length) are rejected`, `${minL - 1} characters (below the minimum length ${minL}) were accepted`); else row(target, 'below-min', 'NOT_APPLICABLE', 'minimum length 1: one below is the empty value (covered by empty input)'); }
        else { row(target, 'min', 'NOT_APPLICABLE', 'no minimum length declared'); row(target, 'below-min', 'NOT_APPLICABLE', 'no minimum length declared'); }
        if (maxL > 0 && maxL <= 5000) { check('max', ch.repeat(maxL), true, `${maxL} characters (the maximum length) are accepted`, `${maxL} characters (the maximum length) were rejected`); check('above-max', ch.repeat(maxL + 1), false, `${maxL + 1} characters (one above the maximum length) are not kept`, `${maxL + 1} characters (above the maximum length ${maxL}) were kept`); }
        else if (maxL > 5000) { row(target, 'max', 'NOT_TESTED', `maximum length ${maxL} is too large to type in a scenario`); row(target, 'above-max', 'NOT_TESTED', `maximum length ${maxL} is too large to type in a scenario`); }
        else { row(target, 'max', 'NOT_APPLICABLE', 'no maximum length declared (see long input)'); row(target, 'above-max', 'NOT_APPLICABLE', 'no maximum length declared (see long input)'); }
        }
      }
      // robustness: unexpected characters and long input (text-like fields only)
      if (TEXTLIKE.has(kind)) {
        const maxL = Number(c.maxlength ?? 0);
        if (!maxL || maxL >= UNEXPECTED.length) row(target, 'unexpected-chars', 'APPLICABLE', null, {
          title: `${name}: unexpected characters are held literally or rejected (${p.route})`, feature: p.route, source: { route: p.route, field: x.selector },
          expected: 'Markup, quotes, SQL comment, percent-encoding and non-ASCII characters are kept as typed (or rejected) and cause no script error.',
          negative: { expected: `${name}: unexpected characters are held literally or rejected, without script errors.`, violation: `${name}: unexpected characters were altered or caused a script error.`, input: UNEXPECTED },
          review: ['client-side only: whether the server stores and re-displays the value safely needs a submission (approval)'],
          steps: [open, oracle({ action: 'fill', target: { selector: x.selector }, input: UNEXPECTED, expect: { noNewErrors: true } }), oracle({ action: 'evaluate', input: `(() => { const e = ${q(x.selector)}; if (!e) return 'MISSING'; return e.value === ${JSON.stringify(UNEXPECTED)} || !e.checkValidity(); })()`, expect: { value: true } })],
        });
        else row(target, 'unexpected-chars', 'NOT_APPLICABLE', `maximum length ${maxL} is shorter than the probe`);
        if (!maxL) row(target, 'long-input', 'APPLICABLE', null, {
          title: `${name}: a ${LONG}-character value does not break the page (${p.route})`, feature: p.route, source: { route: p.route, field: x.selector },
          expected: `A ${LONG}-character value is handled without script errors and the page stays responsive.`,
          negative: { expected: `${name}: a ${LONG}-character value is handled without script errors.`, violation: `${name}: a ${LONG}-character value caused a script error or the page stopped responding.`, input: `x × ${LONG}` },
          review: ['no maximum length is declared: confirm the intended limit and the server-side behaviour'],
          steps: [open, oracle({ action: 'fill', target: { selector: x.selector }, input: 'x'.repeat(LONG), expect: { noNewErrors: true } }), oracle({ action: 'evaluate', input: `(() => { const e = ${q(x.selector)}; return !!e && document.readyState === 'complete'; })()`, expect: { value: true } })],
        });
        else row(target, 'long-input', 'NOT_APPLICABLE', `maximum length ${maxL} declared: covered by just above maximum`);
      } else { const why = kind === 'password' ? 'password fields are not probed (their value is masked)' : `a ${kind} field is not free text: its format is covered by invalid / malformed input`; row(target, 'unexpected-chars', 'NOT_APPLICABLE', why); row(target, 'long-input', 'NOT_APPLICABLE', why); }
    });

    // ---------- form level
    for (const f of (p.forms ?? []).filter((x) => !x.auth_form && x.visible !== false)) {
      const fs = (f.fields ?? []).filter(usable).filter((x) => kindOf(x) !== 'select');
      const submit = (f.submits ?? []).find((b) => b.visible !== false && !b.disabled);   // never a submit that was disabled when discovered (real case: Next.js "Add to cart" until a variant is chosen)
      const target = { level: 'form', route: p.route, selector: f.selector, name: submit?.name || f.selector, method: f.method ?? 'get' };
      const fill = fs.map((x) => ({ x, v: sampleValue(x) })).filter((y) => y.v !== null && y.v !== undefined).map(({ x, v }) => ({ action: 'fill', target: { selector: x.selector }, input: v }));
      const req = fs.filter((x) => x.required);
      if (req.length) row(target, 'missing-required', 'APPLICABLE', null, {
        title: `"${target.name}" form with its required fields empty is not submittable (${p.route})`, feature: p.route, source: { route: p.route, form: f.selector }, expected: 'With required fields empty the form reports itself invalid.',
        negative: { expected: `The "${target.name}" form is not submittable while ${req.map(fieldName).join(', ')} ${req.length > 1 ? 'are' : 'is'} empty.`, violation: `The "${target.name}" form was submittable with required field(s) empty (${req.map(fieldName).join(', ')}).` },
        steps: [open, ...req.map((x) => ({ action: 'fill', target: { selector: x.selector }, input: '' })), oracle({ action: 'evaluate', input: `(() => { const f = ${q(f.selector)}; return f ? !f.checkValidity() : 'MISSING'; })()`, expect: { value: true } })],
      });
      else row(target, 'missing-required', 'NOT_APPLICABLE', 'no field in this form is declared required');
      if (fill.length) row(target, 'refresh', 'APPLICABLE', null, {
        title: `Refreshing "${target.name}" mid-entry submits nothing and reloads cleanly (${p.route})`, feature: p.route, source: { route: p.route, form: f.selector },
        expected: 'Reloading while data is half-entered sends no write request, raises no new script error and shows the page again.',
        negative: { expected: `Refreshing the "${target.name}" form mid-entry submits nothing and the page reloads without errors.`, violation: `Refreshing the "${target.name}" form mid-entry sent a write request, raised a script error or did not show the page again.` },
        review: ['whether entered values should survive the refresh is a product decision: add a value expectation if it should'],
        steps: [open, ...fill, oracle({ action: 'reload', expect: { ...(h1 ? { text: h1 } : {}), noWrites: fill.some((x) => String(x.input).length >= 3) ? { containing: fill.map((x) => x.input).filter((v) => String(v).length >= 3) } : true, noNewErrors: true } })],
      });
      else row(target, 'refresh', 'NOT_APPLICABLE', 'nothing can be typed into this form');
      const post = String(f.method ?? 'get').toLowerCase() === 'post' || f.state_changing;
      if (!submit) { row(target, 'duplicate', 'NOT_APPLICABLE', 'the form has no visible submit control'); row(target, 'double-submit', 'NOT_APPLICABLE', 'the form has no visible submit control'); continue; }
      if (!post) { row(target, 'duplicate', 'NOT_APPLICABLE', 'a GET form does not store data'); row(target, 'double-submit', 'NOT_APPLICABLE', 'a GET form does not store data'); continue; }
      row(target, 'duplicate', 'APPROVAL_REQUIRED', 'submits the same data twice: writes to the environment', {
        title: `Submitting "${target.name}" twice with the same data is refused the second time (${p.route})`, feature: p.route, source: { route: p.route, form: f.selector }, requires_approval: ['ui-write'],
        expected: 'The second, identical submission is refused with a duplicate message.',
        negative: { expected: `A duplicate "${target.name}" submission is refused.`, violation: `A duplicate "${target.name}" submission was accepted.` },
        review: ['creates data in the environment', 'declare data.duplicate_error_text (the message shown for a duplicate); only meaningful if the data must be unique'],
        steps: [open, ...fill, { action: 'click', target: { selector: submit.selector } }, open, ...fill, { action: 'click', target: { selector: submit.selector } }, oracle({ action: 'assert', expect: { text: '{{data.duplicate_error_text}}' } })],
      });
      row(target, 'double-submit', 'APPROVAL_REQUIRED', 'submits the form: writes to the environment', {
        title: `Double-clicking "${target.name}" submits once (${p.route})`, feature: p.route, source: { route: p.route, form: f.selector }, requires_approval: ['ui-write'],
        expected: 'Two quick clicks on the submit control send at most one write request.',
        negative: { expected: `Double-clicking "${target.name}" sends at most one write request.`, violation: `Double-clicking "${target.name}" sent more than one write request.` },
        review: ['creates data in the environment'],
        steps: [open, ...fill, oracle({ action: 'evaluate', input: `(() => { const b = ${q(submit.selector)}; if (!b) return 'MISSING'; b.click(); setTimeout(() => b.click(), 80); return true; })()`, expect: { value: true, writes: { max: 1 } } })],
      });
    }

    // ---------- page level
    const ptarget = { level: 'page', route: p.route, name: p.route };
    if (p.auth === 'protected' && auth.login_marker) row(ptarget, 'unauthenticated', 'APPLICABLE', null, {
      category: 'authentication', title: `Unauthenticated request to ${p.route} is sent to login`, feature: 'Authentication', source: { route: p.route },
      expected: 'Without a session the route does not render; the login page is shown instead.',
      negative: { expected: `${p.route} is not served to an anonymous user (the login page is shown).`, violation: `${p.route} was served to an anonymous user without the login page.` },
      steps: [oracle({ action: 'api', input: { url: p.url }, expect: { bodyContains: auth.login_marker } })],
    });
    else if (p.auth === 'public') row(ptarget, 'unauthenticated', 'NOT_APPLICABLE', 'the route is public (an anonymous request rendered it)');
    else row(ptarget, 'unauthenticated', 'NOT_TESTED', 'the auth boundary of this route is unknown (no login page was learned)');
    if (p.auth === 'protected' && loggedIn && auth.login_route) row(ptarget, 'expired-session', 'APPLICABLE', null, {
      title: `With an expired session, ${p.route} sends the user to login`, feature: 'Session', source: { route: p.route },
      expected: `After the session cookies are gone, reloading ${p.route} shows the login page (${auth.login_route}).`,
      negative: { expected: `With an expired session ${p.route} redirects to ${auth.login_route}.`, violation: `With an expired session ${p.route} was still shown instead of ${auth.login_route}.` },
      review: ['simulated in the test browser by removing its cookies; the session is restored afterwards and the server-side session is untouched'],
      steps: [open, { action: 'session', input: 'expire' }, oracle({ action: 'reload', expect: { url: auth.login_route } })],
    });
    else row(ptarget, 'expired-session', p.auth === 'public' ? 'NOT_APPLICABLE' : 'NOT_TESTED', p.auth === 'public' ? 'the route is public' : !loggedIn ? 'needs a signed-in session (setup/login)' : 'the login route is unknown');
    // the link must lead somewhere a URL check can tell apart: never "/" or a prefix of this route (every URL contains "/";
    // real case: a non-navigating "Demos" link passed the url check and Back then left the site)
    const link = (p.nav ?? []).find((n) => !n.state_changing && n.text && n.route !== p.route && n.route !== '/' && !p.route.startsWith(n.route) && !p.url.includes(n.route) && pages.some((x) => x.route === n.route));
    if (link) row(ptarget, 'back', 'APPLICABLE', null, {
      title: `Back from ${link.route} returns to ${p.route} intact`, feature: 'Navigation', source: { route: p.route, link: link.text },
      expected: `After following "${link.text}" and pressing Back, ${p.route} is shown again without new script errors.`,
      negative: { expected: `Back navigation from ${link.route} restores ${p.route}.`, violation: `Back navigation from ${link.route} did not restore ${p.route} cleanly.` },
      steps: [open, { action: 'click', target: { text: link.text, role: 'link', first: true }, expect: { url: link.route } }, oracle({ action: 'back', expect: { url: p.route, ...(h1 ? { text: h1 } : {}), noNewErrors: true } })],
    });
    else row(ptarget, 'back', 'NOT_APPLICABLE', 'no navigation link from this page to another discovered page');
    const api = (p.api ?? []).filter((a) => a.method === 'GET')[0];
    for (const mode of ['server-error', 'network-failure', 'timeout', 'empty-response', 'malformed-response']) {
      if (!api) { row(ptarget, mode, 'NOT_APPLICABLE', (p.api ?? []).length ? 'the page makes no GET API call on load (write calls are never faulted automatically)' : 'the page makes no XHR/fetch call on load: nothing to fault (server-rendered)'); continue; }
      const what = { 'server-error': 'a server error (HTTP 500)', 'network-failure': 'a network failure', timeout: 'a timeout', 'empty-response': 'an empty response body', 'malformed-response': 'a malformed JSON body' }[mode];
      row(ptarget, mode, 'APPLICABLE', null, {
        title: `${p.route} survives ${what} from ${api.path}`, feature: p.route, source: { route: p.route, api: `${api.method} ${api.path}` },
        expected: `When ${api.path} answers with ${what}, the page still renders and raises no new uncaught script error.`,
        negative: { expected: `${p.route} handles ${what} from ${api.path}.`, violation: `${what[0].toUpperCase()}${what.slice(1)} from ${api.path} broke ${p.route} (new uncaught error or the page did not render).` },
        review: ['simulated in the test browser only: the faulted request never reaches the server', 'declare data.api_error_text and add an assert step to also require a user-visible message'],
        steps: [open, { action: 'intercept', input: { mode, url: api.path, method: 'GET', ...(mode === 'timeout' ? { delayMs: 3000 } : {}) } }, oracle({ action: 'reload', expect: { ...(h1 ? { text: h1 } : {}), faulted: true, noNewErrors: true } }), { action: 'intercept', input: false }],
      });
    }
  }
  // ---------- app level
  const prot = auth.protected_routes ?? [];
  row({ level: 'app', name: map?.origin ?? 'app' }, 'unauthorized', prot.length ? 'NOT_TESTED' : 'NOT_APPLICABLE', prot.length ? 'needs a second, lower-privileged test account (see the permission candidate)' : 'no protected route was found');
  return { specs, matrix };
}

// A violated negative expectation -> a defect CANDIDATE (never a confirmed defect, never an invented severity).
export function defectCandidate(sc, step, scenario, seq) {
  const tri = TRIAGE[sc.negative?.case] ?? { type: 'Functional' };
  return {
    id: `DC-${String(seq).padStart(3, '0')}`, status: 'CANDIDATE — needs triage', scenario: { id: sc.id, title: sc.title, negative_case: sc.negative?.case, case_label: sc.negative?.label },
    step: { id: step.step_id, action: step.action, target: step.target, input: step.input ?? null },
    expected: sc.negative?.expected ?? sc.expected, actual: `${sc.negative?.violation ?? 'The expected negative behaviour did not occur.'} Observed: ${step.actual}`,
    evidence: { url: step.url ?? null, screenshots: [...new Set([step.screenshot, ...(scenario.evidence ?? [])].filter(Boolean))], checks: (step.checks ?? []).filter((c) => c.status !== 'PASS'), console_errors: step.console_errors ?? [], network_failures: step.network_failures ?? [], run_id: step.run_id, timestamp: step.timestamp },
    defect_type_candidate: { value: tri.type, basis: `negative case "${sc.negative?.label ?? sc.negative?.case}" was violated` },
    severity_candidate: tri.severity ?? UNASSESSED(BUSINESS),
    priority_candidate: tri.priority ?? UNASSESSED(BUSINESS),
  };
}

// Is this failed step a violation of the negative expectation (rather than a broken precondition)?
export function isViolation(step) {
  return !!step?.oracle && step.status === 'FAIL' && (step.checks ?? []).some((c) => c.kind === 'expectation' && c.status === 'FAIL');
}

export function matrixSummary(matrix) {
  const by = Object.fromEntries(NEGATIVE_CASES.map((c) => [c.id, Object.fromEntries(DECISIONS.map((d) => [d, 0]))]));
  for (const r of matrix) by[r.case][r.decision]++;
  return { rows: matrix.length, by_decision: Object.fromEntries(DECISIONS.map((d) => [d, matrix.filter((r) => r.decision === d).length])), by_case: by };
}

export function renderMatrix(doc) {
  const m = doc.negative_matrix ?? []; const s = matrixSummary(m);
  const L = ['# Negative & boundary applicability', '', `${s.rows} decisions: ${Object.entries(s.by_decision).map(([k, v]) => `${k} ${v}`).join(' · ')}`, '', '| Case | Applicable | Approval required | Not applicable | Not tested |', '|---|---|---|---|---|'];
  for (const c of NEGATIVE_CASES) { const b = s.by_case[c.id]; L.push(`| ${c.label} | ${b.APPLICABLE} | ${b.APPROVAL_REQUIRED} | ${b.NOT_APPLICABLE} | ${b.NOT_TESTED} |`); }
  L.push('', '## Decisions', '', '| Target | Case | Decision | Scenario | Reason |', '|---|---|---|---|---|');
  for (const r of m) L.push(`| ${r.target.level} ${r.target.route ?? ''} ${r.target.name ?? ''} | ${r.label} | ${r.decision} | ${(r.scenario_ids ?? []).join(', ') || '—'} | ${String(r.reason ?? '').replace(/\|/g, '/')} |`);
  return L.join('\n') + '\n';
}
