// Minimal JSON Schema validator for the subset used by /bench/schemas (draft 2020-12 keywords):
// type, enum, const, pattern, minimum, minLength, required, properties, additionalProperties,
// items, minItems, uniqueItems, oneOf, anyOf, $ref (local "#/$defs/..." and cross-file "<id>#/$defs/...").
// No dependency is installed (MASTER-SPEC AP-2; no package installs for this slice).

export interface SchemaError { path: string; message: string }
type Schema = Record<string, any> | boolean;

export class SchemaRegistry {
  private byId = new Map<string, Record<string, any>>();

  add(schema: Record<string, any>): void {
    if (typeof schema.$id !== 'string') throw new Error('schema without $id');
    if (this.byId.has(schema.$id)) throw new Error(`duplicate schema $id ${schema.$id}`);
    this.byId.set(schema.$id, schema);
  }

  has(id: string): boolean { return this.byId.has(id); }
  ids(): string[] { return [...this.byId.keys()].sort(); }

  validate(id: string, value: unknown): SchemaError[] {
    const root = this.byId.get(id);
    if (!root) throw new Error(`unknown schema ${id}`);
    const errors: SchemaError[] = [];
    this.check(root, root, value, '$', errors);
    return errors;
  }

  private resolve(ref: string, root: Record<string, any>): { schema: Schema; root: Record<string, any> } {
    const [file, frag] = ref.split('#');
    const base = file ? this.byId.get(file) : root;
    if (!base) throw new Error(`unresolvable $ref ${ref}`);
    let node: any = base;
    for (const part of (frag || '').split('/').filter(Boolean)) {
      node = node?.[part];
      if (node === undefined) throw new Error(`unresolvable $ref ${ref}`);
    }
    return { schema: node, root: base };
  }

  private check(schema: Schema, root: Record<string, any>, v: unknown, path: string, errors: SchemaError[]): void {
    if (schema === true) return;
    if (schema === false) { errors.push({ path, message: 'not allowed' }); return; }
    const s = schema;
    if (s.$ref) {
      const r = this.resolve(s.$ref, root);
      this.check(r.schema, r.root, v, path, errors);
    }
    if (s.type !== undefined) {
      const types: string[] = Array.isArray(s.type) ? s.type : [s.type];
      if (!types.some((t) => typeMatches(t, v))) {
        errors.push({ path, message: `expected ${types.join('|')}` });
        return;
      }
    }
    if (s.const !== undefined && JSON.stringify(v) !== JSON.stringify(s.const)) errors.push({ path, message: `must equal ${JSON.stringify(s.const)}` });
    if (s.enum && !s.enum.some((e: unknown) => JSON.stringify(e) === JSON.stringify(v))) errors.push({ path, message: `not in enum` });
    if (typeof v === 'string') {
      if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) errors.push({ path, message: `does not match ${s.pattern}` });
      if (s.minLength !== undefined && v.length < s.minLength) errors.push({ path, message: `shorter than ${s.minLength}` });
    }
    if (typeof v === 'number' && s.minimum !== undefined && v < s.minimum) errors.push({ path, message: `below minimum ${s.minimum}` });
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) errors.push({ path, message: `fewer than ${s.minItems} items` });
      if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) errors.push({ path, message: 'items not unique' });
      if (s.items !== undefined) v.forEach((x, i) => this.check(s.items, root, x, `${path}[${i}]`, errors));
    }
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      for (const r of s.required || []) if (!(r in o)) errors.push({ path, message: `missing required ${r}` });
      const props = s.properties || {};
      for (const [k, x] of Object.entries(o)) {
        if (k in props) this.check(props[k], root, x, `${path}.${k}`, errors);
        else if (s.additionalProperties === false) errors.push({ path, message: `unknown property ${k}` });
        else if (typeof s.additionalProperties === 'object') this.check(s.additionalProperties, root, x, `${path}.${k}`, errors);
      }
    }
    if (s.oneOf) {
      const ok = s.oneOf.filter((alt: Schema) => { const e: SchemaError[] = []; this.check(alt, root, v, path, e); return e.length === 0; }).length;
      if (ok !== 1) errors.push({ path, message: `must match exactly one alternative (matched ${ok})` });
    }
    if (s.anyOf) {
      const ok = s.anyOf.some((alt: Schema) => { const e: SchemaError[] = []; this.check(alt, root, v, path, e); return e.length === 0; });
      if (!ok) errors.push({ path, message: 'must match at least one alternative' });
    }
  }
}

function typeMatches(t: string, v: unknown): boolean {
  switch (t) {
    case 'null': return v === null;
    case 'boolean': return typeof v === 'boolean';
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'integer': return typeof v === 'number' && Number.isInteger(v);
    case 'array': return Array.isArray(v);
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
    default: throw new Error(`unsupported type ${t}`);
  }
}
