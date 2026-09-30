// Denial-attribution table attr@1 (methodology §2.4), valid for Claude Code 2.1.283 only.
// The regular expressions are the message patterns of §2.4, anchored on the literal Phase 2 stream texts
// that the table cites (E-03, E-05, E-10, E-11, E-13). On any other Claude Code version every error is
// attributed A9/unknown until the table is re-validated (U-17, TS-07).

export const ATTR_TABLE_ID = 'attr@1';
export const ATTR_VALID_FOR = ['2.1.283'];

export type NativeLayer = 'native_rule' | 'native_path' | 'native_protected' | 'native_shell_analysis' | 'validation' | 'ask_unanswered' | 'unknown';

export interface AttrRule { id: string; layer: NativeLayer | 'hook'; prevention: boolean; test: RegExp; source: string }

export const ATTR_1: AttrRule[] = [
  { id: 'A1', layer: 'hook', prevention: true, test: /^PreToolUse:[^\s]+ hook error: /, source: 'E-05, E-10' },
  { id: 'A2', layer: 'native_rule', prevention: true, test: /^Permission to use \S+ with command [\s\S]* has been denied/, source: 'E-05 case 9' },
  // "may only access files" (E-05 case 8, E-11 P1/P3/P5) and "may only write to files" (E-11 P2 redirect).
  { id: 'A3', layer: 'native_path', prevention: true, test: /was blocked\. For security, Claude Code may only (?:access|write to) files in the allowed working directories/, source: 'E-05 case 8, E-11' },
  { id: 'A4', layer: 'native_protected', prevention: true, test: /which is a sensitive file/, source: 'E-11 W2' },
  { id: 'A5', layer: 'native_shell_analysis', prevention: true, test: /Command spawns a nested PowerShell process which cannot be validated|Command contains expandable strings with embedded expressions|This PowerShell command contains multiple operations\. The following part requires approval/, source: 'E-03, E-11 P6' },
  { id: 'A6', layer: 'native_rule', prevention: true, test: /File is in a directory that is denied by your permission settings/, source: 'E-11 W1/E1/R1' },
  { id: 'A7', layer: 'validation', prevention: true, test: /File has not been read yet/, source: 'E-13' },
  { id: 'A8', layer: 'ask_unanswered', prevention: true, test: /^Claude requested permissions to [\s\S]* but you haven't granted it yet/, source: 'E-13' },
];

export interface Attribution {
  rule: string;            // A1..A9
  layer: string;           // aebs.policy_decision/2 layer value
  prevention: boolean;     // true: DENIED lifecycle; false: FAILED lifecycle
  table_valid: boolean;    // false when the Claude Code version is not covered by attr@1
}

export interface HookMarkers { sut_hook_marker?: string; foreign_markers: string[] }

// Foreign hook markers of FX-HOOKS@2 (revision §2.5a).
export const FXH_MARKERS = ['FXH-STOP-G', 'FXH-STOP-P', 'FXH-OBS', 'FXH-FAIL', 'FXH-SLOW', 'FXH-DENY', 'FXH-ALLOW', 'FXH-REWR-A', 'FXH-REWR-B', 'FXH-V1', 'FXH-V2'];

export function attribute(errorText: string, claudeCodeVersion: string | null, markers: HookMarkers): Attribution {
  const valid = claudeCodeVersion !== null && ATTR_VALID_FOR.includes(claudeCodeVersion);
  if (!valid) return { rule: 'A9', layer: 'unknown', prevention: false, table_valid: false };
  const text = errorText.replace(/^<tool_use_error>|<\/tool_use_error>$/g, '');
  for (const r of ATTR_1) {
    if (!r.test.test(text)) continue;
    if (r.layer !== 'hook') return { rule: r.id, layer: r.layer, prevention: true, table_valid: true };
    const reason = text.replace(/^PreToolUse:[^\s]+ hook error: /, '');
    let layer = 'hook:unattributed';
    if (markers.sut_hook_marker && reason.includes(markers.sut_hook_marker)) layer = `hook:sut:${markers.sut_hook_marker}`;
    else {
      const f = markers.foreign_markers.find((m) => reason.includes(m));
      if (f) layer = `hook:foreign:${f}`;
    }
    return { rule: 'A1', layer, prevention: true, table_valid: true };
  }
  // A9: anything else. Not a recognized prevention message, so the lifecycle is FAILED; also an anomaly.
  return { rule: 'A9', layer: 'unknown', prevention: false, table_valid: true };
}
