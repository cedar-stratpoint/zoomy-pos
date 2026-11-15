#!/usr/bin/env node
// Tap-target audit: measures how big every button really is to a finger in the
// running web build (the POS ships as a PWA), and lists anything under 44pt.
//
// It measures the EFFECTIVE tap area, not the element's box: from each target's
// center it probes outward with elementFromPoint until a point stops landing on
// the target. That counts invisible <HitArea> extensions and catches what a box
// size can't: clipping by overflow or scroll rows, and later siblings painting
// over the edge. hitSlop is not counted because react-native-web ignores it.
//
// Usage (with the web dev server running: npx expo start --web --port 8081):
//   node scripts/tap-audit.mjs [route ...]        default: the main screens
//   CHROME_PATH=... BASE_URL=... node scripts/tap-audit.mjs /modals/products
// Writes a screenshot per screen and report.json to a temp folder (printed).
//
// Known, accepted flags:
//   - the stack header's back arrow (30x30): system navigation, left as is;
//   - payment method switches (40x20): the whole row is the target and toggles;
//   - category tabs at 43 where a chip row sits directly below: the two rows'
//     centers are 43.5px apart, so their 44pt boxes share half a pixel.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MIN_TAP = 44;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const ROUTES = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['/', '/modals/products', '/modals/transactions', '/modals/payment-settings', '/modals/prize-select', '/modals/free-taste'];
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 1024, height: 768 },
];
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'tap-audit-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs in the page. Touchables, switches, inputs and links as react-native-web renders them.
const MEASURE = `(() => {
  const els = [...new Set(document.querySelectorAll('[tabindex="0"], [role="button"], [role="switch"], [role="checkbox"], [role="tab"], [role="link"], button, a[href], input:not([type=hidden])'))];
  const owns = (el, x, y) => { const hit = document.elementFromPoint(x, y); return !!hit && el.contains(hit); };
  const reach = (el, cx, cy, dx, dy) => { let d = 0; while (d < 40 && owns(el, cx + dx * (d + 1), cy + dy * (d + 1))) d++; return d; };
  const out = [];
  for (const el of els) {
    if (el.tagName === 'INPUT' && el.parentElement?.closest('[role="switch"]')) continue; // the input inside a switch
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) continue; // only fully on screen
    if (r.width >= innerWidth - 2 && r.height >= innerHeight / 2) continue; // a backdrop, not a button
    if (cs.pointerEvents === 'none' || el.getAttribute('aria-disabled') === 'true') continue; // disabled on purpose
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    if (!owns(el, cx, cy)) continue; // covered (e.g. by a modal)
    out.push({
      label: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || '(no label)').trim().replace(/\\s+/g, ' ').slice(0, 40),
      testid: el.getAttribute('data-testid') || '',
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      w: Math.round(r.width), h: Math.round(r.height),
      hitW: 1 + reach(el, cx, cy, -1, 0) + reach(el, cx, cy, 1, 0),
      hitH: 1 + reach(el, cx, cy, 0, -1) + reach(el, cx, cy, 0, 1),
    });
  }
  return out;
})()`;

const CLICK_TEXT = (text) => `(() => {
  const b = [...document.querySelectorAll('[role="button"], [tabindex="0"]')].find((x) => (x.innerText || '').trim() === ${JSON.stringify(text)});
  if (b) b.click();
  return !!b;
})()`;

// Home: put one product in the cart so the pet chips and pay buttons are enabled
// (an empty cart disables them, which makes them untappable on purpose).
const FILL_CART = `new Promise((done) => {
  document.querySelector('[data-testid="category-tab-Freeze Dried"]')?.click();
  setTimeout(() => { const tile = document.querySelector('[data-testid="tile"]'); tile?.click(); done(!!tile); }, 800);
})`;

/** One screen in its own headless Chrome with a fresh profile. A shared browser
 *  can find the previous page still holding the in-browser database, and the
 *  app then shows its "Couldn't start" screen instead of the one being audited. */
async function auditScreen(vp, route, port) {
  const profile = fs.mkdtempSync(path.join(OUT, 'profile-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  try {
    let wsUrl;
    for (let i = 0; i < 50 && !wsUrl; i++) {
      try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
      if (!wsUrl) await sleep(200);
    }
    if (!wsUrl) throw new Error(`Chrome did not start (CHROME_PATH=${CHROME})`);
    const ws = new WebSocket(wsUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let nextId = 1;
    const pending = new Map();
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); });
    const send = (method, params = {}) => new Promise((resolve) => { const id = nextId++; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

    await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await send('Page.navigate', { url: BASE + route });
    await sleep(route === '/' ? 9000 : 6000);
    if (await evaluate(`document.body.innerText.includes('local store')`)) {
      ws.close();
      return { route, viewport: vp.name, error: 'app showed its "Couldn’t start" screen' };
    }
    if (await evaluate(CLICK_TEXT('Not now'))) await sleep(1500); // first-run tour prompt
    if (route === '/') { await evaluate(FILL_CART); await sleep(1200); }
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, `${vp.name}${route === '/' ? '_home' : route.replace(/\//g, '_')}.png`), Buffer.from(shot.result.data, 'base64'));
    const targets = (await evaluate(MEASURE)) ?? [];
    ws.close();
    return { route, viewport: vp.name, total: targets.length, small: targets.filter((t) => Math.min(t.hitW, 80) < MIN_TAP || t.hitH < MIN_TAP) };
  } finally {
    chrome.kill();
  }
}

const report = [];
let port = 9333;
for (const vp of VIEWPORTS) for (const route of ROUTES) report.push(await auditScreen(vp, route, port++));
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

for (const r of report) {
  if (r.error) { console.log(`\n## ${r.viewport} ${r.route}: NOT MEASURED, ${r.error}`); continue; }
  console.log(`\n## ${r.viewport} ${r.route}: ${r.small.length} of ${r.total} under ${MIN_TAP}pt`);
  for (const t of r.small) console.log(`  tap ${String(t.hitW).padStart(3)}x${String(t.hitH).padEnd(3)} (drawn ${t.w}x${t.h}) ${t.role.padEnd(7)} ${t.testid ? `[${t.testid}] ` : ''}${t.label}`);
}
console.log(`\nScreenshots and report.json: ${OUT}`);
