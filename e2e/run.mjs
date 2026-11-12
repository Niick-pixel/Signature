/*
  The browser checks, run on every push (npm run e2e, after npm run build).

  Seeds a synthetic journal into a temp folder, starts the built app on it and
  drives a real Chromium through what a person does: every screen opens with
  no error, in both navigation layouts; Stats fits the window with nothing
  spilling out of a tile; a stack flips one widget per flick; edit mode
  stacks and undoes; the deep dives open; the morning prep ends in a plan.

  PW_CHROMIUM: a Chromium to use instead of Playwright's own download.
*/
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = Number(process.env.E2E_PORT ?? 3399);
const BASE = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-e2e-'));
const env = { ...process.env, SIGNATURE_DATA_DIR: dir, SIGNATURE_MIGRATIONS_DIR: path.resolve('db/migrations') };

execFileSync(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'e2e/seed.mts'], { env, stdio: 'inherit' });
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], { env, stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch { /* gone */ } fs.rmSync(dir, { recursive: true, force: true }); };
process.on('exit', stop);

for (let i = 0; ; i++) {
  try { if ((await fetch(`${BASE}/api/today?today=2026-01-01`)).status < 500) break; } catch { /* not up yet */ }
  if (i > 120) throw new Error('The app did not start.');
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const failures = [];
let passed = 0;
const only = process.env.E2E_ONLY;
async function check(name, fn) {
  if (only && !name.includes(only)) return;
  try { await fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (e) { failures.push(name); console.log(`FAIL ${name}\n     ${String(e.message ?? e).split('\n')[0]}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

async function open(viewport = { width: 1440, height: 900 }, prefs = {}) {
  const page = await (await browser.newContext({ viewport })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.goto(`${BASE}/dashboard`);
  // The morning check-in opens on a new day; it is not what is being tested.
  await page.evaluate((prefs) => {
    const k = 'signature:preferences';
    localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), ...prefs }));
  }, prefs);
  await page.locator('text=Skip today').click({ timeout: 3000 }).catch(() => {});
  return { page, errors };
}
const spills = (page) => page.evaluate(() => [...document.querySelectorAll('[data-tile]')].flatMap((t) => {
  const r = t.getBoundingClientRect(); const out = [];
  for (const el of t.querySelectorAll('*')) {
    if (el.closest('[data-scrollbox]') && el !== el.closest('[data-scrollbox]')) continue;
    const q = el.getBoundingClientRect();
    if (q.height && q.width && getComputedStyle(el).visibility !== 'hidden' && (q.bottom > r.bottom + 1 || q.right > r.right + 1 || q.top < r.top - 1 || q.left < r.left - 1)) out.push(t.dataset.tile);
  }
  return [...new Set(out)];
}));

const SCREENS = ['/dashboard', '/', '/stats', '/calendar', '/journal', '/path', '/study', '/prop', '/goals', '/consistency', '/playbook', '/trash', '/blind', '/day', '/review', '/executions', '/new'];

for (const nav of ['side', 'top']) {
  await check(`every screen opens without an error (${nav === 'side' ? 'side rail' : 'top tabs'})`, async () => {
    const { page, errors } = await open(undefined, { nav });
    for (const u of SCREENS) { await page.goto(`${BASE}${u}`); await page.waitForTimeout(700); }
    await page.context().close();
    expect(!errors.length, errors.join(' | '));
  });
}

/*
  The desktop app's window moves by its drag regions, and Electron gives a
  click inside one to the window even when a button is drawn over it. A
  browser ignores them, so this is the only place that would notice.
*/
const undraggable = () => {
  const drag = []; const free = [];
  for (const el of document.querySelectorAll('*')) {
    const v = getComputedStyle(el).getPropertyValue('app-region');
    if (v === 'drag') drag.push(el.getBoundingClientRect()); else if (v === 'no-drag') free.push(el.getBoundingClientRect());
  }
  const inside = (r, x, y) => r.width && r.height && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  const out = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"], input, select, textarea')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
    const x = r.left + r.width / 2; const y = r.top + r.height / 2;
    if (document.elementFromPoint(x, y) !== el && !el.contains(document.elementFromPoint(x, y))) continue;
    if (drag.some((d) => inside(d, x, y)) && !free.some((f) => inside(f, x, y))) out.push(el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30) || el.tagName);
  }
  return out;
};
for (const nav of ['side', 'top']) {
  await check(`${nav === 'side' ? 'side rail' : 'top tabs'}: no button sits in a window-drag region (the desktop app would swallow its clicks)`, async () => {
    const { page } = await open({ width: 1280, height: 720 }, { nav });
    const bad = [];
    for (const u of ['/dashboard', '/stats', '/calendar', '/journal', '/study']) {
      await page.goto(`${BASE}${u}`); await page.waitForTimeout(600);
      bad.push(...(await page.evaluate(undraggable)).map((b) => `${u}: ${b}`));
    }
    await page.click('[aria-label="Settings"]'); await page.waitForTimeout(500);
    bad.push(...(await page.evaluate(undraggable)).map((b) => `settings open: ${b}`));
    await page.context().close();
    expect(!bad.length, bad.slice(0, 8).join(' | '));
  });
}

await check('side rail: the edge handle and Ctrl+B open and close it, the page following its width', async () => {
  const { page } = await open({ width: 1280, height: 720 }, { nav: 'side', railLabels: false });
  await page.goto(`${BASE}/stats`); await page.waitForTimeout(600);
  const w = () => page.evaluate(() => ({ rail: Math.round(document.querySelector('[data-side-rail]').getBoundingClientRect().width), pad: parseFloat(getComputedStyle(document.body).paddingLeft) }));
  expect((await w()).rail === 64, 'starts as icons');
  await page.hover('[data-side-rail]'); await page.click('[data-rail-toggle]');
  await page.waitForTimeout(90); const mid = await w();
  expect(mid.rail > 64 && mid.rail < 184, `it glides, not jumps (mid-way ${mid.rail}px)`);
  await page.waitForTimeout(600); const wide = await w();
  expect(wide.rail === 184 && Math.round(wide.pad) === 184, `opens to 184px and the page follows: ${JSON.stringify(wide)}`);
  await page.mouse.move(900, 400); await page.keyboard.press('Control+b'); await page.waitForTimeout(600);
  expect((await w()).rail === 64, 'Ctrl+B closes it');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('signature:preferences')).railLabels);
  expect(saved === false, 'the choice is saved');
  await page.context().close();
});

for (const nav of ['side', 'top']) {
  await check(`${nav === 'side' ? 'side rail' : 'top tabs'}: New trade is in one place, the same on every screen`, async () => {
    const { page } = await open({ width: 1280, height: 720 }, { nav });
    const spots = new Set();
    for (const u of SCREENS.filter((u) => u !== '/new')) {
      await page.goto(`${BASE}${u}`); await page.waitForTimeout(500);
      const shown = await page.evaluate(() => [...document.querySelectorAll('a[href="/new"]')].filter((a) => a.getBoundingClientRect().width && a.textContent.includes('New trade') || a.matches('[data-new-trade]') && a.getBoundingClientRect().width)
        .map((a) => { const r = a.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)}`; }));
      expect(shown.length === 1, `${u}: ${shown.length} New trade buttons`);
      spots.add(shown[0]);
    }
    expect(spots.size === 1, `New trade moves between screens: ${[...spots].join(' ')}`);
    await page.locator('[data-new-trade]:visible').click(); await page.waitForURL(/\/new/, { timeout: 5000 });
    await page.context().close();
  });
}

await check('every screen sits in one of the two page widths, centred in the space beside the rail', async () => {
  const { page } = await open({ width: 1920, height: 1000 }, { nav: 'side', railLabels: false });
  const bad = [];
  for (const u of SCREENS) {
    await page.goto(`${BASE}${u}`); await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const want = { wide: 88 * rem, read: 64 * rem };
      const cols = [...document.querySelectorAll('div')].filter((el) => {
        const mw = parseFloat(getComputedStyle(el).maxWidth);
        return (mw === want.wide || mw === want.read) && el.getBoundingClientRect().width > 0 && !el.closest('[role=dialog]');
      });
      if (!cols.length) return { none: true };
      const el = cols[0]; const c = el.getBoundingClientRect(); const box = el.parentElement.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(el.parentElement).paddingLeft) - parseFloat(getComputedStyle(el.parentElement).paddingRight);
      return { off: Math.round((c.left + c.right) / 2 - ((box.left + box.right) / 2 + pad / 2)), w: Math.round(c.width) };
    });
    if (r.none) bad.push(`${u}: no page column`); else if (Math.abs(r.off) > 2) bad.push(`${u}: ${r.off}px off centre`);
  }
  await page.context().close();
  expect(!bad.length, bad.join(' | '));
});

await check('Trades: "Discuss these trades with Claude" downloads exactly the trades on screen', async () => {
  const { page } = await open({ width: 1440, height: 900 }, { nav: 'side' });
  await page.goto(`${BASE}/`); await page.waitForTimeout(900);
  const shown = Number((await page.locator('[data-library-count]').innerText()).match(/^(\d+)/)[1]);
  await page.locator('[data-review-export]:visible').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByText('Document only').click()]);
  const md = fs.readFileSync(await dl.path(), 'utf8');
  expect(/\.md$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const sections = (md.match(/^### \d{4}-\d{2}-\d{2} /gm) ?? []).length;
  expect(/^# Trades/.test(md) && sections === shown, `${sections} trades written, ${shown} on screen`);
  await page.context().close();
});

await check('Dashboard: the four figures, the daily curve, the score with its scale, the process heatmap', async () => {
  const { page, errors } = await open({ width: 1440, height: 900 }, { nav: 'side' });
  await page.goto(`${BASE}/dashboard`); await page.waitForTimeout(1500);
  for (const sel of ['[data-dash-hero] [data-dash-spark]', '[data-dash-tile="winrate"] [data-dash-gauge]', '[data-dash-tile="pf"] [data-dash-pf-ring]',
    '[data-dash-tile="ratio"] [data-dash-ratio]', '[data-dash-curve] svg', '[data-dash-radar]', '[data-dash-scale]', '[data-dash-raise]', '[data-dash-heatmap]', '[data-dash-today-rings]']) {
    expect(await page.locator(sel).count() > 0, `missing ${sel}`);
  }
  const cells = await page.locator('[data-heat-day]').count();
  expect(cells === 60, `12 weeks × 5 days, got ${cells}`);
  const scroll = await page.evaluate(() => { const s = document.querySelector('.signature-enter'); return s ? s.scrollHeight - s.clientHeight : 0; });
  expect(scroll <= 1, `the Dashboard still fits the window (${scroll}px over)`);
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('side rail: every screen has one 44px title bar, its header inside it, nothing spilling out', async () => {
  const { page } = await open({ width: 1280, height: 720 }, { nav: 'side' });
  for (const u of ['/dashboard', '/stats', '/calendar', '/journal', '/path', '/study', '/goals', '/trash']) {
    await page.goto(`${BASE}${u}`); await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const slot = document.querySelector('[data-title-slot]'); const s = slot.getBoundingClientRect();
      return { h: Math.round(document.querySelector('header.titlebar-drag').getBoundingClientRect().height), kids: slot.children.length,
        over: [...slot.querySelectorAll('*')].filter((e) => { const q = e.getBoundingClientRect(); return q.width && (q.right > s.right + 1 || q.left < s.left - 1); }).length,
        h1: [...document.querySelectorAll('h1')].filter((e) => e.getBoundingClientRect().height > 0).length };
    });
    expect(r.h === 44 && r.kids === 1 && r.over === 0 && r.h1 === 0, `${u}: ${JSON.stringify(r)}`);
  }
  await page.context().close();
});

await check('top tabs: each screen keeps its own title, the title bar holds none', async () => {
  const { page } = await open(undefined, { nav: 'top' });
  for (const u of ['/dashboard', '/stats', '/calendar', '/journal']) {
    await page.goto(`${BASE}${u}`); await page.waitForTimeout(900);
    const r = await page.evaluate(() => ({ kids: document.querySelector('[data-title-slot]').children.length, rail: !!document.querySelector('[data-side-rail]')?.getBoundingClientRect().width,
      h1: [...document.querySelectorAll('h1')].filter((e) => e.getBoundingClientRect().height > 0).length }));
    expect(r.kids === 0 && !r.rail && r.h1 === 1, `${u}: ${JSON.stringify(r)}`);
  }
  await page.context().close();
});

for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080]]) {
  await check(`Stats fits ${w}×${h}: no page scroll, no tile below the fold, nothing spilling`, async () => {
    const { page } = await open({ width: w, height: h });
    for (const src of ['real', 'backtest', 'all']) {
      await page.goto(`${BASE}/stats?src=${src}`); await page.waitForSelector('[data-tile]'); await page.waitForTimeout(900);
      const r = await page.evaluate(() => ({ scroll: document.scrollingElement.scrollHeight - innerHeight,
        below: [...document.querySelectorAll('[data-tile]')].filter((t) => t.getBoundingClientRect().bottom > innerHeight + 1).length }));
      const sp = await spills(page);
      expect(r.scroll <= 0 && r.below === 0 && sp.length === 0, `${src}: ${JSON.stringify({ ...r, spills: sp })}`);
    }
    await page.context().close();
  });
}

await check('a stack flips exactly one widget per flick, and stops at its end', async () => {
  const { page } = await open();
  await page.goto(`${BASE}/stats`); await page.waitForSelector('[data-tile="st-edge"]'); await page.waitForTimeout(600);
  const at = () => page.locator('[data-tile="st-edge"]').getAttribute('data-stack-index');
  const flick = (d) => page.evaluate((d) => { for (let i = 0; i < 6; i++) document.querySelector('[data-tile="st-edge"]').dispatchEvent(new WheelEvent('wheel', { deltaY: d, bubbles: true, cancelable: true })); }, d);
  expect(await at() === '0', 'starts on the first');
  await flick(40); await page.waitForTimeout(700);
  expect(await at() === '1', `one spin of the wheel moved to ${await at()}, not 1`);
  await flick(-40); await page.waitForTimeout(700);
  expect(await at() === '0', 'back to the first');
  await page.context().close();
});

await check('edit mode: stacking past five is refused, a delete is undone, and it is saved', async () => {
  const { page, errors } = await open();
  await page.goto(`${BASE}/stats`); await page.waitForSelector('[data-tile]'); await page.waitForTimeout(600);
  await page.click('[data-edit]');
  const tiles = () => page.locator('[data-tile]').count();
  const n = await tiles();
  await page.click('[data-tile="st-trend"] [data-tile-remove]'); await page.waitForTimeout(400);
  expect(await tiles() === n - 1, 'the tile was removed');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(600);
  expect(await tiles() === n, 'undo brought it back');
  await page.click('[data-done]'); await page.waitForTimeout(900);
  await page.reload(); await page.waitForSelector('[data-tile]');
  expect(await tiles() === n, 'the same board after a reload');
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('deep dives: the old Reports and Analytics links open in Stats', async () => {
  const { page, errors } = await open();
  for (const [u, id] of [['/reports?tab=fees', 'report-fees'], ['/analytics', 'analytics-time'], ['/analytics?tab=tilt', 'tilt']]) {
    await page.goto(`${BASE}${u}`); await page.waitForSelector('[data-open-widget]');
    expect(await page.locator('[data-open-widget]').getAttribute('data-open-widget') === id, `${u} opened ${id}`);
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(900);
  expect(await page.locator('[data-open-widget]').count() === 0, 'Escape closes it');
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('the morning prep ends in a plan, checks the three rules, and the trade form asks which plan', async () => {
  const { page, errors } = await open();
  await page.click('text=Morning check-in'); await page.click('[data-checkin-tab="chart"]'); await page.waitForSelector('[data-chart-prep]');
  const g = (f) => page.locator(`[data-prep-field="${f}"]`);
  const pill = (f, o) => g(f).getByRole('button', { name: o, exact: true }).first().click();
  const type = (f, t) => g(f).locator('textarea').fill(t);
  const pick = async (f, o) => { await g(f).getByRole('combobox').click(); await page.getByRole('listbox').last().getByRole('option', { name: o, exact: true }).click(); await page.waitForTimeout(250); };
  const next = async () => { await page.click('[data-prep-next]'); await page.waitForTimeout(350); };
  await page.waitForTimeout(800); await next();                                   // news
  await pill('bias', 'Bearish'); await type('because', 'the 4H displaced down'); await type('inv', '21,310'); await next();
  await pill('taken', 'Asia high'); await next();                                 // overnight
  await next(); await pill('zone', 'Premium'); await next();                      // map, location
  await pill('aDir', 'Short'); await type('aStory', 'Judas up into the PDH, then short'); await pick('aTrigger', 'PDH');
  await pill('bDir', 'Long'); await pick('bTrigger', 'PDH'); await page.waitForTimeout(300);
  const notes = await page.locator('[data-plan-checks]').innerText();
  expect(/differ in which liquidity/.test(notes) && /no kill switch/.test(notes), `the rules were not checked: ${notes}`);
  await pick('bTrigger', 'London low'); await type('aKill', 'a 15m close above 21,420'); await type('bKill', 'a 15m close below 21,170'); await page.waitForTimeout(300);
  expect(await page.locator('[data-plan-checks]').count() === 0, 'the notes clear once the plans are sound');
  await page.click('[data-prep-next]'); await page.waitForSelector('[data-prep-plan]');
  const plan = await page.locator('[data-prep-plan]').innerText();
  expect(/Scenario A/.test(plan) && /Scenario C/.test(plan) && /bias is bearish/.test(plan), plan.slice(0, 200));
  const day = await page.evaluate(() => new Date().toLocaleDateString('en-CA'));
  const saved = await page.evaluate(async (day) => (await (await fetch(`/api/prep?day=${day}`)).json()).prep.data.answers, day);
  expect(saved['draw.side'] === 'Both ways' && JSON.stringify(saved['liquidity.wait']) === JSON.stringify(['PDH', 'London low']), JSON.stringify(saved).slice(0, 200));
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
stop();
process.exit(failures.length ? 1 : 0);
