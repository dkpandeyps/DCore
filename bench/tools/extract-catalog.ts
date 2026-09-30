// Regenerates bench/catalog/catalog-v1.1.index.json from the approved Phase 3 documents.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { extractCatalog, CATALOG_INDEX_PATH } from '../src/catalog.ts';
import { canonicalFile } from '../src/canonical.ts';

const idx = extractCatalog();
mkdirSync(dirname(CATALOG_INDEX_PATH), { recursive: true });
writeFileSync(CATALOG_INDEX_PATH, canonicalFile(idx));
const by = (k: string) => idx.entries.filter((e) => e.applicability === k).length;
console.log(`catalog v1.1 index: ${idx.entries.length} cases (CORE ${by('CORE')}, SUT_CAPABILITY ${by('SUT_CAPABILITY')}, NOT_APPLICABLE_UNTIL_VALIDATED ${by('NOT_APPLICABLE_UNTIL_VALIDATED')}); @2: ${idx.entries.filter((e) => !e.v11_ref.endsWith('@1')).length}`);
