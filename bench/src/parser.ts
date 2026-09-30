// Stream parser: session transcript -> aebs.tool_event/1 records plus the raw material the classifier needs.
// Event types mapped are those observed in Phase 2 (data model §3.3): system.init, assistant.tool_use,
// user.tool_result, system.hook_started, system.hook_response, result. Everything else is kept in `other`.
// Assistant text is kept only as MODEL_CLAIM material and is never turned into any other evidence class.
import { hashOf } from './canonical.ts';
import type { IdSource } from './ids.ts';
import type { SessionTranscript } from './driver.ts';
import { attribute, type HookMarkers, type Attribution } from './attribution.ts';

export interface ToolEvent {
  schema: 'aebs.tool_event/1';
  event_id: string; attempt_id: string; seq: number; rx_ms: number;
  kind: 'tool_use' | 'tool_result' | 'hook_started' | 'hook_response' | 'init' | 'result' | 'compact_boundary' | 'subagent_start' | 'subagent_stop';
  tool_name?: string; tool_use_id?: string; agent_id?: string; agent_type?: string; input_digest?: string;
  is_error?: boolean; result_excerpt?: string;
  hook?: { hook_id: string; hook_name: string; hook_event: string; outcome: 'success' | 'error' | 'cancelled'; exit_code?: number };
  lifecycle: 'PROPOSED' | 'ATTEMPTED' | 'EXECUTED' | 'DENIED' | 'FAILED' | null;
}

export interface ParsedStream {
  events: ToolEvent[];
  tool_inputs: Map<string, unknown>;          // tool_use_id -> full input (stored as artifact; digest in the event)
  tool_names: Map<string, string>;
  results: Map<string, { is_error: boolean; text: string; attribution: Attribution | null; event_id: string }>;
  init: { session_id?: string; model?: string; tools: string[]; mcp_servers: { name: string; status?: string }[]; permission_mode?: string } | null;
  result_events: any[];
  model_texts: { seq: number; text: string }[]; // MODEL_CLAIM material only
  parse_errors: { seq: number; error: string }[];
  anomalies: string[];
  other: { seq: number; type: string; subtype?: string }[];
  hook_refs: Map<string, { hook_id: string; hook_name: string; hook_event: string }>; // event_id -> hook identity
  complete: boolean;                          // a result event for every turn sent, and no parse error
}

const MAX_EXCERPT = 2048;

export function redact(text: string, secrets: string[]): string {
  let t = text;
  for (const s of secrets) if (s) t = t.split(s).join('[REDACTED]');
  return t;
}

function excerpt(text: string, secrets: string[]): string {
  const t = redact(text, secrets);
  return Buffer.byteLength(t, 'utf8') <= MAX_EXCERPT ? t : Buffer.from(t, 'utf8').subarray(0, MAX_EXCERPT).toString('utf8').replace(/�$/, '');
}

function resultText(c: any): string {
  if (typeof c.content === 'string') return c.content;
  if (Array.isArray(c.content)) return c.content.map((x: any) => (typeof x?.text === 'string' ? x.text : JSON.stringify(x))).join('\n');
  return JSON.stringify(c.content ?? '');
}

export interface ParseContext { attempt_id: string; ids: IdSource; claude_code_version: string | null; markers: HookMarkers; secrets: string[] }

export function parseTranscript(t: SessionTranscript, ctx: ParseContext): ParsedStream {
  const p: ParsedStream = {
    events: [], tool_inputs: new Map(), tool_names: new Map(), results: new Map(), init: null, result_events: [],
    model_texts: [], parse_errors: [], anomalies: [], other: [], hook_refs: new Map(), complete: false,
  };
  const ev = (seq: number, rx: number, kind: ToolEvent['kind'], extra: Partial<ToolEvent>): ToolEvent => {
    const e: ToolEvent = { schema: 'aebs.tool_event/1', event_id: ctx.ids.next('tev'), attempt_id: ctx.attempt_id, seq, rx_ms: rx, kind, lifecycle: null, ...extra };
    p.events.push(e);
    return e;
  };
  for (const line of t.lines) {
    if (line.json === null) { p.parse_errors.push({ seq: line.seq, error: line.parse_error ?? 'unparseable line' }); continue; }
    const m = line.json;
    if (m === null || typeof m !== 'object' || typeof m.type !== 'string') { p.parse_errors.push({ seq: line.seq, error: 'event without type' }); continue; }
    if (m.type === 'system' && m.subtype === 'init') {
      p.init = {
        session_id: m.session_id, model: m.model, tools: Array.isArray(m.tools) ? m.tools : [],
        mcp_servers: Array.isArray(m.mcp_servers) ? m.mcp_servers : [], permission_mode: m.permissionMode,
      };
      ev(line.seq, line.rx_ms, 'init', {});
    } else if (m.type === 'assistant' && Array.isArray(m.message?.content)) {
      for (const c of m.message.content) {
        if (c?.type === 'tool_use' && typeof c.id === 'string') {
          p.tool_inputs.set(c.id, c.input ?? null);
          p.tool_names.set(c.id, String(c.name));
          ev(line.seq, line.rx_ms, 'tool_use', { tool_name: String(c.name), tool_use_id: c.id, input_digest: hashOf(c.input ?? null), lifecycle: 'PROPOSED' });
        } else if (c?.type === 'text' && typeof c.text === 'string') {
          p.model_texts.push({ seq: line.seq, text: c.text });
        }
      }
    } else if (m.type === 'user' && Array.isArray(m.message?.content)) {
      for (const c of m.message.content) {
        if (c?.type !== 'tool_result' || typeof c.tool_use_id !== 'string') continue;
        const text = resultText(c);
        const isErr = c.is_error === true;
        const attr = isErr ? attribute(text, ctx.claude_code_version, ctx.markers) : null;
        const lifecycle = !isErr ? 'EXECUTED' : attr!.prevention ? 'DENIED' : 'FAILED';
        if (attr && attr.rule === 'A9') p.anomalies.push(`unattributed error result for ${c.tool_use_id} (A9${attr.table_valid ? '' : ', attr@1 not valid for this Claude Code version'})`);
        if (!p.tool_names.has(c.tool_use_id)) p.anomalies.push(`tool_result for unknown tool_use_id ${c.tool_use_id}`);
        const e = ev(line.seq, line.rx_ms, 'tool_result', {
          tool_use_id: c.tool_use_id, tool_name: p.tool_names.get(c.tool_use_id), is_error: isErr,
          result_excerpt: excerpt(text, ctx.secrets), lifecycle,
        });
        p.results.set(c.tool_use_id, { is_error: isErr, text, attribution: attr, event_id: e.event_id });
      }
    } else if (m.type === 'system' && (m.subtype === 'hook_started' || m.subtype === 'hook_response')) {
      const hookRef = { hook_id: String(m.hook_id ?? ''), hook_name: String(m.hook_name ?? ''), hook_event: String(m.hook_event ?? '') };
      if (m.subtype === 'hook_started') {
        // GAP-06: the platform reports no outcome for hook_started, but the data model's `hook` object requires
        // one. The event is recorded without `hook`; the hook identity is kept in `hook_refs` for pairing.
        const e = ev(line.seq, line.rx_ms, 'hook_started', { lifecycle: 'ATTEMPTED' });
        p.hook_refs.set(e.event_id, hookRef);
        continue;
      }
      if (!['success', 'error', 'cancelled'].includes(m.outcome)) {
        p.anomalies.push(`hook_response with unrecognized outcome ${JSON.stringify(m.outcome)} at seq ${line.seq}`);
        p.other.push({ seq: line.seq, type: m.type, subtype: m.subtype });
        continue;
      }
      const hook: NonNullable<ToolEvent['hook']> = { ...hookRef, outcome: m.outcome };
      if (Number.isInteger(m.exit_code)) hook.exit_code = m.exit_code;
      const e = ev(line.seq, line.rx_ms, 'hook_response', { hook });
      p.hook_refs.set(e.event_id, hookRef);
    } else if (m.type === 'system' && m.subtype === 'compact_boundary') {
      ev(line.seq, line.rx_ms, 'compact_boundary', {});
    } else if (m.type === 'result') {
      p.result_events.push(m);
      if (typeof m.result === 'string') p.model_texts.push({ seq: line.seq, text: m.result });
      ev(line.seq, line.rx_ms, 'result', { is_error: m.is_error === true });
    } else {
      p.other.push({ seq: line.seq, type: m.type, subtype: m.subtype });
    }
  }
  p.complete = p.parse_errors.length === 0 && t.turns_sent > 0 && p.result_events.length >= t.turns_sent && !t.timed_out && t.process_error === null;
  return p;
}
