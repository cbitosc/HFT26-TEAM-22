#!/usr/bin/env node
// Captures README screenshots (light theme, 360x800, Demo mode) from a running preview/dev server.
// Usage: npm run build && npx vite preview --port 4173 & node scripts/capture-screenshots.mjs
// Needs Google Chrome. Drives a fresh profile through onboarding, then screenshots each screen.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const profile = join(tmpdir(), 'sanket-shots-profile');
rmSync(profile, { recursive: true, force: true });

const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9335', `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(200);
  try { wsUrl = (await (await fetch('http://127.0.0.1:9335/json/list')).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64')); console.log('saved', name); };
const clickText = (t, tag = 'button') => ev(`(()=>{const b=[...document.querySelectorAll('${tag}')].find(b=>b.textContent.trim().includes(${JSON.stringify(t)}));if(b){b.click();return true}return false})()`);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE });
await sleep(400); await shot('splash');
await sleep(3500);
await shot('onboarding-1');
await clickText('Next'); await sleep(250);
await clickText('Next'); await sleep(250);
await ev(`(()=>{const i=document.querySelector('input[maxlength="32"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'Asha');i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
await clickText('Skip PIN'); await sleep(250);
await clickText('Finish setup'); await sleep(2000);

const go = async (hash, name, after) => {
  await ev(`location.hash='#/${hash}'`); await sleep(900);
  if (after) await after();
  await shot(name);
};
// Browser captures have no radio, so they are taken in Demo mode (every screen carries the amber banner).
await ev(`location.hash='#/settings'`); await sleep(700); await clickText('Demo'); await sleep(2500);
await go('home', 'home');
await go('sos', 'sos');
await go('messages', 'chat');
await go('alerts', 'alerts');
await go('circles', 'circles');
await go('map', 'map');
await go('quality', 'mesh-quality');
await go('simulator', 'simulator-benchmark', async () => { await clickText('benchmark'); await sleep(6500); await ev(`document.querySelector('section[aria-label="Congestion benchmark"]')?.scrollIntoView()`); await sleep(300); });
await go('settings', 'settings');
chrome.kill();
