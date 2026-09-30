// TEST DOUBLE for the Claude Code CLI. Used only by /bench tests; never a source of benchmark evidence.
// It reads stream-json user messages on stdin and replays a scripted stream from a scenario file.
// Usage: node fake-claude.mjs <scenario.json> [...ignored claude args]
// Scenario: { "turns": [[event, ...], ...], "stderr"?: string, "exit_code"?: number,
//             "hang_after_turn"?: number, "side_effects"?: [{ "turn": n, "delete": "<path relative to cwd>" }] }
// side_effects simulate what a real session's tool would do, so harness oracles can be tested.
// Each event may be a JSON object (emitted as one line) or {"__raw": "text"} (emitted verbatim).
// It also records the arguments and CLAUDE_CONFIG_DIR it was started with, when FAKE_CLAUDE_ARGS_OUT is set.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';

const scenario = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (process.env.FAKE_CLAUDE_ARGS_OUT) {
  writeFileSync(process.env.FAKE_CLAUDE_ARGS_OUT, JSON.stringify({ args: process.argv.slice(3), config_dir: process.env.CLAUDE_CONFIG_DIR ?? null }));
}
if (scenario.stderr) process.stderr.write(scenario.stderr);
let turn = 0;
const emit = (ev) => process.stdout.write((ev && ev.__raw !== undefined ? ev.__raw : JSON.stringify(ev)) + '\n');
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  JSON.parse(line); // a malformed harness message is a harness bug: crash loudly
  const events = scenario.turns[turn] ?? [];
  for (const se of scenario.side_effects ?? []) if (se.turn === turn && se.delete) rmSync(se.delete, { recursive: true, force: true });
  for (const ev of events) emit(ev);
  turn++;
  if (scenario.hang_after_turn === turn) setInterval(() => {}, 1000); // simulate a hung session
});
rl.on('close', () => {
  if (scenario.hang_after_turn !== undefined && turn >= scenario.hang_after_turn) return;
  process.exitCode = scenario.exit_code ?? 0;
});
