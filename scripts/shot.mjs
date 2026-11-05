// Headless screenshot helper: node scripts/shot.mjs <outDir> [scenario]
// Uses the pre-installed Playwright Chromium with software WebGL.
// Playwright is not a project dependency: install it globally or set PLAYWRIGHT_PATH.
const pw = await import(process.env.PLAYWRIGHT_PATH ?? 'playwright').catch(() => import('/opt/node-tools/node_modules/playwright/index.js'));
const { chromium } = pw.default ?? pw;

const out = process.argv[2] ?? 'shots';
const scenario = process.argv[3] ?? 'basic';
const url = process.env.URL ?? 'http://localhost:5173/';
const w = Number(process.env.W ?? 1280), h = Number(process.env.H ?? 720);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage(process.env.MOBILE ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
if (process.env.SAVE) {
  await page.addInitScript((s) => { if (!sessionStorage.getItem('injected')) { localStorage.setItem('iles-ether.save', s); sessionStorage.setItem('injected', '1'); } }, process.env.SAVE.replace('"lastSeen":0', '"lastSeen":' + (Date.now() - (Number(process.env.AWAY ?? 0) * 1000))));
}
await page.goto(url);
await page.waitForTimeout(2500);
const snap = async (name) => { await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); console.log('shot', name); };
const ev = (fn, arg) => page.evaluate(fn, arg);

if (scenario === 'basic') {
  await snap('01-title');
  await page.click('#title .start', { force: true });
  await page.waitForTimeout(3500);
  await snap('02-start');
  // walk forward towards crystal
  await page.keyboard.down('KeyA'); await page.waitForTimeout(900); await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW');
  await page.waitForTimeout(800);
  await snap('03-walk');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('KeyE'); await page.waitForTimeout(160); }
  await snap('04-harvest');
}
if (scenario === 'eval') {
  await page.click('#title .start', { force: true });
  await page.waitForTimeout(3500);
  const steps = JSON.parse(process.env.STEPS ?? '[]');
  let i = 0;
  for (const s of steps) {
    if (s.js) await ev(new Function(s.js));
    if (s.key) { await page.keyboard.down(s.key); await page.waitForTimeout(s.ms ?? 300); await page.keyboard.up(s.key); }
    if (s.wait) await page.waitForTimeout(s.wait);
    if (s.shot) await snap(s.shot);
    if (s.log) console.log('LOG', JSON.stringify(await ev(new Function(s.log))));
    i++;
  }
}
const info = await ev(() => { const g = window.game; const r = g?.renderer?.renderer?.info; return r ? { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries } : null; });
console.log('renderer info', JSON.stringify(info));
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
