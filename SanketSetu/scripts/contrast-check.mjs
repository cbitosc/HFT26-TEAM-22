#!/usr/bin/env node
// WCAG 2.1 contrast check for every text/background token pair the UI uses, in both themes.
// Usage: node scripts/contrast-check.mjs   (exits non-zero if any AA requirement fails)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../src/ui/tokens.css'), 'utf8');

function parseBlock(selector) {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
  const vars = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) vars[m[1]] = m[2];
  return vars;
}

const light = parseBlock(':root');
const dark = { ...light, ...parseBlock("[data-theme='dark']") };

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// [text token, background token, minimum ratio]. 4.5 = AA body text, 3 = AA large/bold UI text.
const PAIRS = [
  ['fg', 'bg', 4.5], ['fg', 'surface', 4.5], ['fg', 'surface-2', 4.5],
  ['fg-secondary', 'bg', 4.5], ['fg-secondary', 'surface', 4.5], ['fg-secondary', 'surface-2', 4.5],
  ['on-sos', 'sos', 4.5], ['sos-ink', 'sos-tint', 4.5], ['sos-ink', 'surface', 4.5], ['sos-ink', 'bg', 4.5],
  ['on-verified', 'verified', 4.5], ['verified-ink', 'verified-tint', 4.5], ['verified-ink', 'surface', 4.5], ['verified-ink', 'bg', 4.5],
  ['on-fill', 'relay', 4.5], ['relay-ink', 'relay-tint', 4.5], ['relay-ink', 'surface', 4.5], ['relay-ink', 'bg', 4.5],
  ['on-safe', 'safe', 4.5], ['safe-ink', 'safe-tint', 4.5], ['safe-ink', 'surface', 4.5], ['safe-ink', 'bg', 4.5],
  ['warn-ink', 'warn-tint', 4.5], ['warn-ink', 'surface', 4.5],
  ['on-fill', 'lime', 4.5],
  ['focus', 'surface', 3], ['focus', 'bg', 3],
];

let failures = 0;
for (const [name, vars] of [['light', light], ['dark', dark]]) {
  console.log(`\n${name} theme`);
  for (const [fgTok, bgTok, min] of PAIRS) {
    const fg = vars[fgTok];
    const bg = vars[bgTok];
    if (!fg || !bg) {
      console.log(`  ??   ${fgTok} on ${bgTok}: token missing`);
      failures++;
      continue;
    }
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1 (need ${min})  ${fgTok} ${fg} on ${bgTok} ${bg}`);
  }
}
console.log(failures ? `\n${failures} failing pair(s)` : '\nAll pairs pass WCAG AA.');
process.exit(failures ? 1 : 0);
