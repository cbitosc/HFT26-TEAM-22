import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Enforces the CLAUDE.md layering rule: src/mesh, src/crypto, src/transport, and src/db
 * ("core") must never import from screens, components, app, or store ("UI"). This is a plain
 * grep over import specifiers, not a type-level check, but it's enough to catch an accidental
 * UI import creeping into core logic.
 */

const CORE_DIRS = ['src/mesh', 'src/crypto', 'src/transport', 'src/db'];
const FORBIDDEN_PREFIXES = ['../screens', '../components', '../app', '../store', '../../screens', '../../components', '../../app', '../../store'];
const IMPORT_RE = /from\s+['"]([^'"]+)['"]/g;

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

test('18. Architecture: core/ (mesh, crypto, transport, db) never imports from UI layers', () => {
  const violations: string[] = [];

  for (const dir of CORE_DIRS) {
    for (const file of listFilesRecursive(dir)) {
      const content = readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      IMPORT_RE.lastIndex = 0;
      while ((match = IMPORT_RE.exec(content))) {
        const specifier = match[1];
        if (FORBIDDEN_PREFIXES.some((p) => specifier.startsWith(p))) {
          violations.push(`${relative('.', file)} imports "${specifier}"`);
        }
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `core/ must never import from screens/components/app/store:\n${violations.join('\n')}`
  );
});
