#!/usr/bin/env node
// dkskill CLI — portable, read-only, offline. Usage:
//   node dkskill.mjs list
//   node dkskill.mjs <module> --input "<text>" [--json]
//   node dkskill.mjs <module>            (reads text from stdin)
// No network, no credentials, no ~/.claude access, no subprocess, no destructive action.
import { readFileSync } from 'node:fs';
import { MODULES, runModule, renderMarkdown } from './modules.mjs';

function parseArgs(argv) {
  const args = { _: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--input') args.input = argv[++i] ?? '';
    else args._.push(a);
  }
  return args;
}

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!cmd || cmd === 'help' || cmd === '--help') {
    process.stdout.write(['dkskill — universal Claude Code skill', '', 'Usage:', '  node dkskill.mjs list', '  node dkskill.mjs <module> --input "<text>" [--json]', '', 'Modules:', ...MODULES.map((m) => `  ${m.module_id.padEnd(10)} ${m.status.padEnd(11)} ${m.module_name}`), ''].join('\n'));
    return;
  }
  if (cmd === 'list') {
    if (args.json) process.stdout.write(JSON.stringify(MODULES, null, 2) + '\n');
    else process.stdout.write(MODULES.map((m) => `${m.module_id.padEnd(10)} ${m.status.padEnd(11)} ${m.module_name} — ${m.purpose}`).join('\n') + '\n');
    return;
  }
  let input = args.input;
  if (input === undefined) input = readStdin();
  const result = runModule(cmd, input);
  if (result.error) { process.stderr.write(renderMarkdown(result) + '\n'); process.exitCode = 2; return; }
  process.stdout.write((args.json ? JSON.stringify(result, null, 2) : renderMarkdown(result)) + '\n');
}

main();
