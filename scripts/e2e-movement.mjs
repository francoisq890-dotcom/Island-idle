/**
 * End-to-end movement test (Playwright + Chromium).
 *   npm run test:e2e
 * Starts a Vite server, opens the game and checks that every movement key moves
 * the player in the right direction relative to the camera, for QWERTY and
 * AZERTY layouts, layout-dependent codes, missing codes, arrows, diagonals,
 * a rotated camera and the touch joystick.
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failures = 0;
const results = [];

async function openGame(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 240 }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    failures++;
    console.log('PAGE ERROR', e.message);
  });
  await page.goto('http://localhost:5199/');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    localStorage.clear();
    window.game.start();
  });
  // Wait for the intro camera move to end (the game ignores input while it plays).
  await page.waitForFunction(() => window.game.world.rig.cinematic === null, null, { timeout: 60000 });
  return { ctx, page };
}

/** Put the player in the open, at a known spot, with a given camera yaw. */
async function reset(page, yaw) {
  await page.evaluate((yaw) => {
    const g = window.game;
    g.world.player.teleport(0, 9, 0, g.world.ground);
    g.world.player.velocity.set(0, 0, 0);
    g.world.rig.yaw = yaw;
    g.world.rig.snap();
  }, yaw);
  await page.waitForTimeout(150);
}

const pos = (page) => page.evaluate(() => [window.game.world.player.position.x, window.game.world.player.position.z]);

/** Send key events (synthetic, so we can emulate any layout) and hold them. */
async function hold(page, keys, ms) {
  await page.evaluate((keys) => keys.forEach((k) => window.dispatchEvent(new KeyboardEvent('keydown', { code: k.code, key: k.key }))), keys);
  await page.waitForTimeout(ms * 0.6);
  const move = await page.evaluate(() => ({ ...window.game.input.move }));
  await page.waitForTimeout(ms * 0.4);
  await page.evaluate((keys) => keys.forEach((k) => window.dispatchEvent(new KeyboardEvent('keyup', { code: k.code, key: k.key }))), keys);
  await page.waitForTimeout(250);
  return move;
}

/** Expected world direction for a camera-relative input (x = right, y = forward). */
function expected(yaw, x, y) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const dx = fx * y + rx * x, dz = fz * y + rz * x;
  const l = Math.hypot(dx, dz);
  return [dx / l, dz / l];
}

function check(name, a, b, exp, move) {
  const d = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(d[0], d[1]);
  const cos = len > 0 ? (d[0] * exp[0] + d[1] * exp[1]) / len : -1;
  const mag = Math.hypot(move.x, move.y);
  const ok = len > 0.4 && cos > 0.94 && mag <= 1.0001 && mag > 0.99;
  if (!ok) failures++;
  results.push(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(42)} moved ${len.toFixed(2)} m, angle error ${(Math.acos(Math.max(-1, Math.min(1, cos))) * 57.3).toFixed(1)}°, |input| ${mag.toFixed(3)}`);
}

const K = (code, key) => ({ code, key });
const layouts = {
  QWERTY: { up: K('KeyW', 'w'), down: K('KeyS', 's'), left: K('KeyA', 'a'), right: K('KeyD', 'd') },
  AZERTY: { up: K('KeyW', 'z'), down: K('KeyS', 's'), left: K('KeyA', 'q'), right: K('KeyD', 'd') },
  'AZERTY, layout-dependent codes': { up: K('KeyZ', 'z'), down: K('KeyS', 's'), left: K('KeyQ', 'q'), right: K('KeyD', 'd') },
  'AZERTY, empty codes': { up: K('', 'z'), down: K('', 's'), left: K('', 'q'), right: K('', 'd') },
  Arrows: { up: K('ArrowUp', 'ArrowUp'), down: K('ArrowDown', 'ArrowDown'), left: K('ArrowLeft', 'ArrowLeft'), right: K('ArrowRight', 'ArrowRight') },
};
const dirs = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };

try {
  const { ctx, page } = await openGame();
  for (const yaw of [0, 2.1]) {
    for (const [name, map] of Object.entries(layouts)) {
      if (yaw !== 0 && name !== 'AZERTY' && name !== 'QWERTY') continue;
      for (const [dir, [x, y]] of Object.entries(dirs)) {
        await reset(page, yaw);
        const a = await pos(page);
        const move = await hold(page, [map[dir]], 900);
        check(`${name} ${dir} (camera yaw ${yaw})`, a, await pos(page), expected(yaw, x, y), move);
      }
    }
    // Diagonals: direction at 45° and input vector normalized to length 1.
    for (const [n, keys, x, y] of [
      ['up+right', [layouts.AZERTY.up, layouts.AZERTY.right], 1, 1],
      ['up+left', [layouts.AZERTY.up, layouts.AZERTY.left], -1, 1],
      ['down+left', [layouts.QWERTY.down, layouts.QWERTY.left], -1, -1],
      ['down+right', [layouts.QWERTY.down, layouts.QWERTY.right], 1, -1],
    ]) {
      await reset(page, yaw);
      const a = await pos(page);
      const move = await hold(page, keys, 900);
      check(`diagonal ${n} (camera yaw ${yaw})`, a, await pos(page), expected(yaw, x, y), move);
    }
  }
  // Trap regression: a machine built on top of the player must not lock them.
  await page.evaluate(() => {
    const g = window.game;
    const s = g.world.sites.drill.slots[0];
    g.state.shards = 100;
    g.world.player.teleport(s.x + 0.2, s.z, 0, g.world.ground);
    g.buyMachine('drill', 1);
  });
  await page.waitForTimeout(300);
  const a = await pos(page);
  const yaw0 = await page.evaluate(() => window.game.world.rig.viewYaw);
  const move = await hold(page, [layouts.AZERTY.down], 900);
  check('escape a machine built on the player', a, await pos(page), expected(yaw0, 0, -1), move);
  await ctx.close();

  // Touch joystick (left half of the screen).
  const t = await openGame({ hasTouch: true, isMobile: true });
  for (const [dir, [x, y]] of Object.entries(dirs)) {
    await reset(t.page, 0);
    const a = await pos(t.page);
    const move = await t.page.evaluate(async ([x, y]) => {
      const c = document.getElementById('game');
      const sx = 60, sy = window.innerHeight - 60;
      const ev = (type, px, py) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: px, clientY: py, bubbles: true }));
      ev('pointerdown', sx, sy);
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientX: sx + x * 50, clientY: sy - y * 50 }));
      await new Promise((r) => setTimeout(r, 540));
      const m = { ...window.game.input.move };
      await new Promise((r) => setTimeout(r, 360));
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: sx + x * 50, clientY: sy - y * 50 }));
      await new Promise((r) => setTimeout(r, 250));
      return m;
    }, [x, y]);
    check(`touch joystick ${dir}`, a, await pos(t.page), expected(0, x, y), move);
  }
  await t.ctx.close();
} catch (e) {
  failures++;
  console.log('ERROR', e);
}

console.log(results.join('\n'));
console.log(failures ? `\n${failures} échec(s)` : `\nTous les tests de déplacement passent (${results.length}).`);
await browser.close();
await server.close();
process.exit(failures ? 1 : 0);
