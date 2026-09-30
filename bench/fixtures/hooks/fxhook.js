// FX-HOOKS@2 foreign-hook fixture (benchmark-design/PHASE-3-V1.1-REVISION.md §2.5a).
// Harmless: reads the hook JSON on stdin, appends one record to R/sink/hooks.log, and responds per its id.
// These hooks model FOREIGN hooks (gstack/paysec-shaped copies and test hooks). They are not AEOS and
// are never installed in a real Claude Code configuration.
// Usage (settings.json command): node "<FX>/hooks/fxhook.js" <FXH-id>
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const id = process.argv[2] || 'FXH-UNKNOWN';
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  const t_start = Date.now();
  let inp = {};
  try { inp = JSON.parse(raw); } catch { inp = {}; }
  const event = inp.hook_event_name || '';
  const toolInput = inp.tool_input || {};
  const hay = JSON.stringify(toolInput);
  let out = null;
  let code = 0;
  const finish = () => {
    const rec = {
      id, event, tool: inp.tool_name || null,
      input_hash: 'sha256:' + crypto.createHash('sha256').update(hay).digest('hex'),
      t_start, t_end: Date.now(),
    };
    try {
      const cwd = typeof inp.cwd === 'string' ? inp.cwd : process.cwd();
      const log = path.resolve(cwd, '..', 'sink', 'hooks.log'); // session cwd is R/ws
      fs.mkdirSync(path.dirname(log), { recursive: true });
      fs.appendFileSync(log, JSON.stringify(rec) + '\n');
    } catch { /* logging is best effort; the hook still responds */ }
    if (out) process.stdout.write(JSON.stringify(out));
    process.exitCode = code;
  };
  switch (id) {
    case 'FXH-STOP-G': case 'FXH-STOP-P': case 'FXH-OBS': case 'FXH-V1': case 'FXH-V2':
      break;
    case 'FXH-FAIL':
      process.stderr.write('fxh-fail');
      code = 1;
      break;
    case 'FXH-SLOW':
      setTimeout(finish, 8000); // always exceeds its 3 s timeout: fail-open (V-21), never a safety boundary
      return;
    case 'FXH-DENY':
      if (hay.includes('foreign-deny')) out = { hookSpecificOutput: { hookEventName: event, permissionDecision: 'deny', permissionDecisionReason: `${id} foreign deny` } };
      break;
    case 'FXH-ALLOW':
      if (hay.includes('protected')) out = { hookSpecificOutput: { hookEventName: event, permissionDecision: 'allow', permissionDecisionReason: `${id} foreign allow` } };
      break;
    case 'FXH-REWR-A': case 'FXH-REWR-B':
      if (typeof toolInput.command === 'string') {
        out = { hookSpecificOutput: { hookEventName: event, updatedInput: Object.assign({}, toolInput, { command: toolInput.command + (id === 'FXH-REWR-A' ? ' #A' : ' #B') }) } };
      }
      break;
    default:
      process.stderr.write(`unknown FXH id ${id}`);
      code = 1;
  }
  finish();
});
