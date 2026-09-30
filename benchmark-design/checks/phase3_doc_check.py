"""Read-only consistency check for the Phase 3 design documents (documentation lint only; not a benchmark harness)."""
import re, os, glob
root = 'D:/claude/paysecskills'
bd = os.path.join(root, 'benchmark-design')
docs = {os.path.basename(p): open(p, encoding='utf-8').read() for p in glob.glob(bd + '/*.md')}
spec = docs['PHASE-3-BENCHMARK-SPEC.md']; meth = docs['PHASE-3-EVALUATION-METHODOLOGY.md']
dm = docs['PHASE-3-DATA-MODEL.md']; ex = docs['PHASE-3-EXIT-CRITERIA.md']
allp3 = '\n'.join(docs.values())
problems = []

# 1. case ids defined in spec tables (first column "| ID@n |")
defined = re.findall(r'^\| ([A-Z]+-[A-Z0-9]+-\d{3})@(\d+) \|', spec, re.M)
ids = [d[0] for d in defined]
dups = {i for i in ids if ids.count(i) > 1}
if dups: problems.append(f'duplicate case ids: {dups}')
cats = {}
for i in ids: cats.setdefault(i.split('-')[0], []).append(i)
print('cases defined:', len(ids), {k: len(v) for k, v in cats.items()})
# 2. every referenced case id exists
refs = set(re.findall(r'\b((?:TASK|SAFE|PERM|EVID|RECV|AUTO|STAT|HOOK|SHEL|MCP|SUBA)-[A-Z0-9]+-\d{3})\b', allp3))
missing = sorted(refs - set(ids))
if missing: problems.append(f'referenced but undefined case ids: {missing}')
# 3. scenario prefixes referenced exist as case prefixes
# 4. gates / checks / validity ids
for pat, rng, name in [(r'\bHG-(\d\d)\b', range(1, 8), 'HG'), (r'\bCC-(\d\d)\b', range(1, 6), 'CC'), (r'\bVG-(\d\d)\b', range(1, 11), 'VG'),
                       (r'\bBQ-(\d\d)\b', range(1, 24), 'BQ'), (r'\bTS-(\d\d)\b', range(1, 12), 'TS'), (r'\bX3-(\d\d)\b', range(1, 16), 'X3'), (r'\bRP1-(\d\d)\b', range(1, 15), 'RP1')]:
    used = {int(x) for x in re.findall(pat, allp3)}
    bad = sorted(u for u in used if u not in rng)
    if bad: problems.append(f'{name} ids out of defined range: {bad}')
    undefined_def = [n for n in rng if n not in used]
    if undefined_def: problems.append(f'{name} ids defined-range but never used: {undefined_def}')
# 5. schema refs defined
sref = set(re.findall(r'aebs\.([a-z_]+)/1', allp3))
sdef = set(re.findall(r'schema: aebs\.([a-z_]+)/1', dm)) | set(re.findall(r'`aebs\.([a-z_]+)/1`', dm))
if sref - sdef: problems.append(f'schema refs not defined in data model: {sorted(sref - sdef)}')
print('schemas defined:', sorted(sdef))
# 6. Phase 2 citations exist in frozen docs
p2 = open(root + '/platform-validation/HANDS-ON-VALIDATION-REPORT.md', encoding='utf-8').read()
pa = open(root + '/PLATFORM-ASSUMPTIONS.md', encoding='utf-8').read()
ad = open(root + '/platform-validation/ARCHITECTURAL-DECISIONS.md', encoding='utf-8').read()
for e in sorted(set(re.findall(r'\bE-(\d\d)\b', allp3))):
    if f'E-{e}' not in p2: problems.append(f'E-{e} not in hands-on report')
for v in sorted(set(re.findall(r'\bV-(\d\d)\b', allp3))):
    if f'| V-{v} |' not in pa: problems.append(f'V-{v} not in assumptions')
for u in sorted(set(re.findall(r'\bU-(\d\d)\b', allp3))):
    if f'### U-{u}' not in pa: problems.append(f'U-{u} not in assumptions')
for a in sorted(set(re.findall(r'\bAD-(\d\d)\b', allp3))):
    if f'## AD-{a}' not in ad: problems.append(f'AD-{a} not in decisions')
# 7. section refs "methodology §n" exist
msecs = set(re.findall(r'^## (\d+)\.', meth, re.M)) | set(re.findall(r'^### (\d+\.\d+)', meth, re.M))
for r in set(re.findall(r'methodology,? §(\d+(?:\.\d+)?)', allp3)):
    if r not in msecs: problems.append(f'methodology §{r} not found')
ssecs = set(re.findall(r'^## (\d+)\.', spec, re.M)) | set(re.findall(r'^### (\d+\.\d+)', spec, re.M))
for r in set(re.findall(r'spec,? §(\d+(?:\.\d+)?)', allp3)) | set(re.findall(r'spec §(\d+(?:\.\d+)?)', allp3)):
    if r not in ssecs: problems.append(f'spec §{r} not found')
# 8. links resolve
for name, txt in docs.items():
    for l in re.findall(r'\]\(([^)#]+\.md)', txt):
        if not os.path.exists(os.path.normpath(os.path.join(bd, l))): problems.append(f'{name}: broken link {l}')
# 9. status vocabulary
for w in ['VERIFIED AS', 'UNVERIFIED', 'PARTIAL VERIFIED']:
    if w in allp3: problems.append(f'non-standard status: {w}')
# 10. twins refer to existing cases (column 'Twin' values)
for tw in re.findall(r'\| ((?:TASK|SAFE|PERM|EVID|RECV|AUTO|STAT|HOOK|SHEL|MCP|SUBA)-[A-Z0-9]+-\d{3}) \| (?:✓ )?\|', spec):
    if tw not in ids: problems.append(f'twin {tw} undefined')
# ---- v1.1 revision checks (documentation lint only)
rev = docs['PHASE-3-V1.1-REVISION.md']
casepat = r'(?:TASK|SAFE|PERM|EVID|RECV|AUTO|STAT|HOOK|SHEL|MCP|SUBA)-[A-Z0-9]+-\d{3}'
t42 = rev.split('### 4.2')[1].split('### 4.3')[0]
rows = [l for l in t42.splitlines() if re.match(r'\| ' + casepat + r' \|', l)]
rev_ids = [l.split('|')[1].strip() for l in rows]
if sorted(rev_ids) != sorted(ids): problems.append(f'v1.1 config table does not match catalog v1: missing {sorted(set(ids)-set(rev_ids))} extra {sorted(set(rev_ids)-set(ids))}')
bumped = {l.split('|')[1].strip() for l in rows if '**@2**' in l}
listed = set(re.findall(casepat, rev.split('### 4.3')[1].split('\n## ')[0]))
if bumped != listed: problems.append(f'v1.1 bump table vs §4.3 list differ: {sorted(bumped ^ listed)}')
print('v1.1 config rows:', len(rows), 'bumped @2:', len(bumped))
# NM ids used anywhere must be defined in revision §2.1
nm_def = set(re.findall(r'^\| (NM-\d\d[a-z]?) \|', rev, re.M))
nm_used = set(re.findall(r'\bNM-\d\d[a-z]?\b', allp3))
if nm_used - nm_def: problems.append(f'NM ids used but undefined: {sorted(nm_used - nm_def)}')
for cal in re.findall(r'CAL-NM-([\d, a-z-]+)\.', rev):
    for n in re.findall(r'\d\d[a-z]?', cal):
        if f'NM-{n}' not in nm_def: problems.append(f'calibration probe for undefined NM-{n}')
# FXH ids used must be defined in the FX-HOOKS@2 table
fxh_def = set()
for l in rev.split('### 2.5a')[1].split('### 2.6')[0].splitlines():
    if l.startswith('| FXH'): fxh_def |= set(re.findall(r'FXH-[A-Z0-9-]*[A-Z0-9]', l.split('|')[1]))
fxh_used = set(re.findall(r'FXH-[A-Z0-9-]*[A-Z0-9]', allp3)) - {'FXH-id'}
if fxh_used - fxh_def: problems.append(f'FXH ids used but undefined: {sorted(fxh_used - fxh_def)}')
# SG ids
sg_used = set(re.findall(r'\bSG-\d\d\b', allp3))
if sg_used != {'SG-01'}: problems.append(f'unexpected SG ids: {sorted(sg_used)}')
# /2 schemas and calibration defined in data model §5
dm5 = dm.split('## 5. Schema revisions v1.1')[1] if '## 5. Schema revisions v1.1' in dm else ''
for sch in set(re.findall(r'aebs\.([a-z_]+)/2', allp3)) | {'calibration'}:
    if f'`aebs.{sch}/' not in dm5: problems.append(f'v1.1 schema aebs.{sch} not defined in data model §5')
# CFG-L01: no ask prefix overlaps an allow prefix within a profile/variant (mechanical)
def prefixes(block, key):
    m = re.search(r'"' + key + r'"\s*:\s*\[(.*?)\]', block, re.S)
    return [x for x in re.findall(r'"PowerShell\(([^)]*)\)"', m.group(1))] if m else []
doc_json = rev.split('**BP-DOCUMENTED@1.1** (primary baseline')[1].split('```json')[1].split('```')[0]
ask = [p.rstrip('*') for p in prefixes(doc_json, 'ask')]
allow_base = re.findall(r'"PowerShell\(([^)]*)\)"', rev.split('### 2.4')[1].split('```')[1])
case_allows = re.findall(r'\+allow `PowerShell\(([^)]*)\)`', t42)
def overlap(a, b):
    a, b = a.rstrip('*').rstrip(), b.rstrip('*').rstrip()
    return a.startswith(b) or b.startswith(a)
for al in allow_base + case_allows:
    for ak in ask:
        if overlap(al, ak): problems.append(f'CFG-L01 violation (L1): allow {al!r} overlaps ask {ak!r}')
# L2 variant: ask without git commit; allow adds git commit
ask_l2 = [a for a in ask if not a.startswith('git commit')]
for al in allow_base + case_allows + ['git commit*']:
    for ak in ask_l2:
        if overlap(al, ak): problems.append(f'CFG-L01 violation (L2): allow {al!r} overlaps ask {ak!r}')
print('CFG-L01 checked:', len(allow_base) + len(case_allows), 'allow prefixes x', len(ask), 'ask prefixes')
# no expected outcome may cite NM-09 except its own definition, TS-10 and lint text
for l in rev.splitlines():
    if 'NM-09' in l and not re.search(r'^\| NM-09 \||CFG-L0[14]|TS-10', l): problems.append(f'NM-09 cited outside definition/lint: {l[:80]}')
# approval-state guards
tag = 'v1.1 proposed — awaiting owner re-approval'
for n in ['PHASE-3-V1.1-REVISION.md', 'PHASE-3-BENCHMARK-SPEC.md', 'PHASE-3-EVALUATION-METHODOLOGY.md', 'PHASE-3-DATA-MODEL.md', 'PHASE-3-EXIT-CRITERIA.md']:
    if tag not in docs[n]: problems.append(f'{n}: missing "{tag}"')
for bq in ['BQ-21', 'BQ-22', 'BQ-23']:
    row = re.search(r'^\| ' + bq + r' \|.*$', ex, re.M)
    if not row or 'APPROVED by the owner' not in row.group(0): problems.append(f'{bq} row not recorded as approved')
for bq in ['BQ-07', 'BQ-18']:
    row = re.search(r'^\| ' + bq + r' \|.*$', ex, re.M).group(0)
    if 'v1.1' in row and 'not** covered' not in row: problems.append(f'{bq} row may imply v1.1 approval')
x315 = re.search(r'^\| X3-15 \|.*$', ex, re.M).group(0)
for x in range(1, 16):
    xr = re.search(r'^\| X3-%02d \|.*$' % x, ex, re.M).group(0)
    if '**MET' not in xr or 'NOT MET' in xr: problems.append(f'X3-{x:02d} not MET')
# v1 content preserved in spec
for must in ['| HG-06 | **In-session autonomy relaxation took effect** (RP1-10; decided Q21) |', '| SAFE-BYP-002@1 |', '| SUBA-PLUG-001@1 |', '| HOOK-LAT-001@1 |', '## 5. Case catalog v1 (APPROVED']:
    if must not in spec: problems.append(f'v1 content missing from spec: {must[:50]}')
# revision / methodology § references resolve
rsecs = set(re.findall(r'^## (\d+)\.', rev, re.M)) | set(re.findall(r'^### (\d+\.\d+[a-z]?)', rev, re.M))
for r in set(re.findall(r'revision §(\d+(?:\.\d+[a-z]?)?)', allp3)):
    if r not in rsecs: problems.append(f'revision §{r} not found')
for r in set(re.findall(r'methodology §(\d+(?:\.\d+)?)', allp3)):
    if r not in msecs: problems.append(f'methodology §{r} not found')
for r in set(re.findall(r'data model §(\d+)', allp3)):
    if not re.search(r'^## ' + r + r'\.', dm, re.M): problems.append(f'data model §{r} not found')

print('PROBLEMS:' if problems else 'no problems found')
for p in problems: print(' -', p)
