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
      const want = { wide: 88 * rem, read: 64 * rem, form: (innerWidth >= 96 * rem ? 132 : 96) * rem };
      const cols = [...document.querySelectorAll('div')].filter((el) => {
        const mw = parseFloat(getComputedStyle(el).maxWidth);
        return (mw === want.wide || mw === want.read || (location.pathname === '/new' && mw === want.form)) && el.getBoundingClientRect().width > 0 && !el.closest('[role=dialog]');
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

await check('New trade is as wide over a page as on its own page (Start fresh loads /new)', async () => {
  const { page } = await open({ width: 1920, height: 1080 }, { nav: 'side' });
  const formW = () => page.evaluate(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const want = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-form')) * rem;
    const f = [...document.querySelectorAll('div')].find((x) => parseFloat(getComputedStyle(x).maxWidth) === want && x.getBoundingClientRect().width > 0);
    return f ? Math.round(f.getBoundingClientRect().width) : 0;
  });
  await page.goto(`${BASE}/dashboard`); await page.waitForTimeout(800);
  await page.locator('[data-new-trade]:visible').click(); await page.waitForURL(/\/new/); await page.waitForTimeout(1200);
  const sheet = await formW();
  await page.goto(`${BASE}/new`); await page.waitForTimeout(1200);
  const own = await formW();
  // The sheet covers the rail; the page sits beside it. Otherwise the same width.
  const rail = await page.evaluate(() => Math.round(document.querySelector('[data-side-rail]')?.getBoundingClientRect().width ?? 0));
  expect(sheet > 0 && own > 0 && Math.abs(sheet - own) <= rail + 2, `over a page ${sheet}px, on its own ${own}px (rail ${rail}px)`);
  await page.context().close();
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
  const next = async () => { await page.click('[data-prep-next]'); await page.waitForTimeout(350); };
  await page.waitForTimeout(800); await next();                                   // news
  // Taps only: nothing on the prep is written any more.
  expect(await page.locator('[data-chart-prep] textarea').count() === 0, 'no text boxes');
  await pill('bias', 'Bearish'); await pill('reasons', '4H displaced through a level'); await pill('reasons', 'Swept a HTF high or low'); await pill('invAt', 'The 1H iFVG'); await next();
  await pill('taken', 'Asia high'); await next();                                 // overnight
  await next(); await pill('zone', 'Premium'); await next();                      // map, location
  expect(await page.locator('[data-chart-prep] textarea').count() === 0, 'no text boxes on the plans');
  // The bearish bias already filled A short and B long; the Asia high, run overnight, is not offered.
  expect(await g('aDir').locator('[aria-pressed="true"]').innerText() === 'Short' && await g('bDir').locator('[aria-pressed="true"]').innerText() === 'Long', 'A with the bias, B against it');
  expect(await g('aZones').getByRole('button', { name: 'PDL', exact: true }).count() === 0, 'a short waits above: no lows offered');
  expect(await g('aZones').getByRole('button', { name: 'Asia high', exact: true }).count() === 0, 'run overnight: not offered');
  expect(/run overnight, so not offered: Asia high/.test(await page.locator('[data-plans-auto]').innerText()), 'and it says why');
  await pill('aZones', 'PDH'); await pill('aConfirms', 'CISD');
  await pill('bZones', 'London low'); await page.waitForTimeout(300);
  expect(await g('bZones').getByRole('button', { name: 'PDH', exact: true }).count() === 0, 'a long: no highs offered');
  const notes = await page.locator('[data-plan-checks]').innerText();
  expect(/no kill switch/.test(notes), `the rules were not checked: ${notes}`);
  await pill('aKills', '15m closes through the zone'); await pill('bKills', 'Never reaches the zone'); await pill('bKills', 'Bias invalidated');
  await pill('cutoffAt', '10:00'); await page.waitForTimeout(300);
  expect(await page.locator('[data-plan-checks]').count() === 0, 'the notes clear once the plans are sound');
  await page.click('[data-prep-next]'); await page.waitForSelector('[data-prep-plan]');
  const plan = await page.locator('[data-prep-plan]').innerText();
  expect(/Scenario A/.test(plan) && /Scenario C/.test(plan) && /bias is bearish because 4H displaced/.test(plan) && /from PDH/.test(plan) && /by 10:00/.test(plan), plan.slice(0, 300));
  const day = await page.evaluate(() => new Date().toLocaleDateString('en-CA'));
  const saved = await page.evaluate(async (day) => (await (await fetch(`/api/prep?day=${day}`)).json()).prep.data.answers, day);
  expect(saved['draw.side'] === 'Both ways' && JSON.stringify(saved['liquidity.wait']) === JSON.stringify(['PDH', 'London low']), JSON.stringify(saved).slice(0, 200));
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('Dashboard: the pointer resting on the daily curve while the data shrinks (a new day, a filter) does not break the screen', async () => {
  const { page, errors } = await open({ width: 1600, height: 1000 }, { nav: 'side', dashFilters: { period: 'all', sessions: [], dirs: [] } });
  await page.goto(`${BASE}/dashboard`);
  await page.locator('text=Skip today').click({ timeout: 3000 }).catch(() => {});
  // Open the filters first, then park the pointer on the curve's last point and switch the period from the
  // keyboard: the data reloads with fewer days while the pointer never moves (what a fresh morning does).
  await page.locator('[data-dash-accounts] button:has-text("Filters")').first().click();
  const curve = page.locator('[data-dash-curve] svg').first();
  await curve.waitFor();
  const box = await curve.boundingBox();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
  await page.locator('[data-dashboard] button', { hasText: /^London$/ }).first().evaluate((el) => el.focus());
  const before = await page.locator('[data-dash-curve] path').first().getAttribute('d');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  const after = await page.locator('[data-dash-curve] path').first().getAttribute('d').catch(() => '');
  expect(((after || '').match(/L/g) || []).length < (before.match(/L/g) || []).length, 'the curve has fewer days, still drawn');
  expect(await page.locator('text=This screen hit an error').count() === 0, 'no error screen');
  expect(!errors.length, errors.join(' | '));
  await page.context().close();
});

/* ───────────── Rubric v2: the two-step New trade ───────────── */

/** A locked replay day (a biased Long day), so backtests open straight on Step 1. */
const lockDay = () => fetch(`${BASE}/api/replay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
  action: 'lock', replay_date: '2026-03-03', instrument: 'NQ',
  context: { h4: 'Bull', h1Agrees: true, overnight: 'Lows run', news: 'Data at 8:30 ET', open: 'Discount' },
  scenarios: {
    a: { zones: ['PDL'], confirm: ['Sweep + iFVG close'], target: 'PDH/PDL', rr: '2+', kill: 'Not triggered by 10:30' },
    b: { zones: ['PDH'], confirm: ['CISD'], target: 'Session H/L', rr: '1.5–2', kill: '5m closes through the zone' },
  },
}) });
await lockDay();

async function openNewTrade(prefs = {}) {
  const { page, errors } = await open({ width: 1920, height: 1080 }, { nav: 'side', ...prefs });
  await page.evaluate(() => localStorage.setItem('signature.lastAccount', 'Backtest (FX Replay)'));
  await page.locator('[data-new-trade]:visible').click();
  await page.waitForSelector('[data-decide-step]');
  return { page, errors };
}
/** The answers no key covers by default: the gate (G), a planned R of 2R, and a target type. */
const pickTarget = async (page) => {
  await page.locator('[data-facts] [role="combobox"]').nth(3).click();
  await page.locator('[role="option"]:has-text("PDH/PDL")').click();
};
const gateAndR = async (page) => {
  await page.keyboard.press('g');
  await page.locator('[data-facts] button', { hasText: /^2R$/ }).click();
  await pickTarget(page);
};
const savedTrade = async (page) => page.evaluate(async () => {
  const list = await (await fetch('/api/trades?pending=1')).json();
  return list.filter((t) => t.rubric_version === 5).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
});

await check('Rubric v2: four rows, direction and scenario, and Take — keyboard only, inside 40 s', async () => {
  const { page, errors } = await openNewTrade();
  expect(await page.locator('[data-timer]').getAttribute('data-timer') === 'calm', 'the clock runs on a backtest');
  for (const k of ['2', '2', '1', '2', 'l', 'a']) await page.keyboard.press(k);
  await gateAndR(page);
  expect(await page.locator('[data-grade]').getAttribute('data-grade') === 'A', 'seven of eight with scenario A is an A');
  expect(await page.locator('[data-gate="one"]').count() === 1, 'G answers the gate');
  await page.keyboard.press('t');
  await page.waitForSelector('[data-outcome-step]');
  const t = await savedTrade(page);
  expect(t.decision === 'take' && t.decision_seconds < 40 && t.decision_limit === 40 && t.grade_letter === 'A' && t.outcome_at === null,
    `saved as decided: ${JSON.stringify({ d: t.decision, s: t.decision_seconds, g: t.grade_letter })}`);
  expect(await page.locator('[data-similar]').count() === 1, 'similar setups appear only now, in Step 2');
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('Rubric v2: G answers the gate; more than one gap is No trade; Take waits on the gate and the planned R', async () => {
  const { page, errors } = await openNewTrade({ decisionSeconds: 90 });
  for (const k of ['2', '2', '2', '2', 'l', 'a']) await page.keyboard.press(k);
  expect(await page.locator('[data-decide-button="take"]').isDisabled(), 'Take waits on the gate and the planned R');
  await page.keyboard.press('g'); await page.keyboard.press('g');
  expect(await page.locator('[data-gate="many"]').count() === 1, 'G again: more than one');
  expect(await page.locator('[data-grade]').getAttribute('data-grade') === 'No trade', 'more than one gap is No trade');
  expect(/more than one gap/.test(await page.locator('[data-grade-reason]').innerText()), 'named in the badge');
  await page.keyboard.press('g');
  expect(await page.locator('[data-decide-button="take"]').isDisabled(), 'still waiting on the planned R');
  await page.locator('[data-facts] button', { hasText: /^2R$/ }).click();
  expect(await page.locator('[data-decide-button="take"]').isDisabled(), 'still waiting on the target type');
  await pickTarget(page);
  expect(!(await page.locator('[data-decide-button="take"]').isDisabled()), 'Take open');
  await page.keyboard.press('h'); await page.keyboard.press('h');
  await page.keyboard.press('t');
  await page.waitForSelector('[data-outcome-step]');
  const t = await savedTrade(page);
  expect(t.singular_gap === true && t.htf_origin === '5m' && t.grade_letter === 'A+', JSON.stringify({ g: t.singular_gap, h: t.htf_origin, l: t.grade_letter }));
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('Rubric v2: the clock runs out → a chime, nothing decided; Missed is logged by hand, with a hypothetical outcome waiting', async () => {
  const { page, errors } = await openNewTrade({ decisionSeconds: 10 });
  for (const k of ['2', '2']) await page.keyboard.press(k);
  await page.waitForSelector('[data-missed]', { timeout: 15000 });
  await page.waitForTimeout(1500);
  expect(await page.locator('[data-decide-step]').count() === 1, 'still on Step 1 after the clock');
  expect(/^\+\d/.test(await page.locator('[data-seconds]').innerText()), 'the clock counts on past the limit');
  for (const k of ['1', '2']) await page.keyboard.press(k);
  await page.keyboard.press('m');
  await page.waitForSelector('[data-outcome-step][data-decision="missed"]');
  expect(await page.locator('[data-hypothetical]').count() === 1, 'the hypothetical outcome is asked');
  const t = await savedTrade(page);
  expect(t.decision === 'missed' && t.decision_seconds > 10 && JSON.stringify(t.late_rows) === JSON.stringify(['row_path', 'row_target']),
    JSON.stringify({ d: t.decision, s: t.decision_seconds, late: t.late_rows }));
  // Step 2 refuses to finish without what it would have done.
  await page.click('[data-save-outcome]');
  expect(/what it would have done/.test(await page.locator('[data-outcome-step] [role="alert"]').innerText()), 'the hypothetical R is required');
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('Rubric v2: a Take after the clock is still a take, stored over time', async () => {
  const { page, errors } = await openNewTrade({ decisionSeconds: 10 });
  for (const k of ['2', '2', '1', '2', 'l', 'a']) await page.keyboard.press(k);
  await gateAndR(page);
  await page.waitForSelector('[data-missed]', { timeout: 15000 });
  expect(!(await page.locator('[data-decide-button="take"]').isDisabled()), 'Take stays available');
  await page.keyboard.press('t');
  await page.waitForSelector('[data-outcome-step][data-decision="take"]');
  const t = await savedTrade(page);
  expect(t.decision === 'take' && t.decision_seconds >= 10 && t.decision_limit === 10, JSON.stringify({ d: t.decision, s: t.decision_seconds }));
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('Rubric v2: a dropdown keeps its highlight under the pointer while the clock runs, and a click picks', async () => {
  const { page, errors } = await openNewTrade({ decisionSeconds: 90 });
  const trig = page.locator('[data-facts] [role="combobox"]').nth(3);
  await trig.click();
  const opt = page.locator('[role="option"]:has-text("HTF FVG")');
  await opt.hover();
  await page.waitForTimeout(600);
  const bg = await opt.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg !== 'rgba(0, 0, 0, 0)', `the hovered option stays highlighted (${bg})`);
  await opt.click();
  expect((await trig.innerText()).includes('HTF FVG'), 'picked');
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('Rubric v2: Close shuts an untouched form, asks once something is entered; Step 1 locked after the decision', async () => {
  const { page } = await openNewTrade();
  await page.click('[data-close]');
  await page.waitForSelector('[data-decide-step]', { state: 'detached', timeout: 5000 });
  await page.locator('[data-new-trade]:visible').click();
  await page.waitForSelector('[data-decide-step]');
  expect((await page.locator('[data-facts] [role="combobox"]').nth(2).innerText()).includes('NY AM'), 'session defaults to NY AM');
  await page.keyboard.press('2');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-close-dialog]');
  expect(await page.locator('[data-close-action="pass"]').count() === 0, 'no "save as passed" before the answers are in');
  await page.click('[data-close-action="keep"]');
  await page.waitForSelector('[data-close-dialog]', { state: 'detached', timeout: 3000 });
  expect(await page.locator('[data-decide-step]').count() === 1, 'kept deciding');
  // Take with answers missing: the missing ones are marked required and blink.
  await page.click('[data-decide-button="take"]', { force: true }).catch(() => {});
  expect(await page.locator('[data-required="true"]').count() >= 2, 'direction and scenario marked required');
  for (const k of ['2', '2', '2', 's', 'b']) await page.keyboard.press(k);
  await gateAndR(page);
  await page.keyboard.press('p');
  await page.waitForSelector('[data-outcome-step][data-decision="pass"]');
  const t = await savedTrade(page);
  // An edit that tries to change the rows keeps the locked ones.
  const res = await page.evaluate(async (t) => {
    const f = new FormData(); f.append('trade', JSON.stringify({ ...t, row_sweep: 0, would_be_r: -1, pass_reasons: ['Rubric said no trade'], outcome_at: new Date().toISOString(), explanation: 'E'.repeat(170), lesson: 'L'.repeat(170) }));
    const r = await fetch(`/api/trades/${t.id}`, { method: 'PUT', body: f });
    return { ok: r.ok, t: await r.json() };
  }, t);
  expect(res.ok && res.t.row_sweep === 2 && res.t.grade_letter === 'B', `Step 1 stays as locked: ${JSON.stringify({ ok: res.ok, sweep: res.t.row_sweep, g: res.t.grade_letter })}`);
  await page.context().close();
});

await check('Rubric v2: Step 2 goes back to a read-only Step 1, and Close offers to save what is written as unfinished', async () => {
  const { page, errors } = await openNewTrade();
  for (const k of ['2', '2', '1', '2', 'l', 'a']) await page.keyboard.press(k);
  await gateAndR(page);
  await page.keyboard.press('p');
  await page.waitForSelector('[data-outcome-step]');
  await page.fill('[data-field="would-r"]', '1.5');
  await page.click('[data-back]');
  await page.waitForSelector('[data-locked-step1]');
  expect(await page.locator('[data-locked-step1] [data-row="row_path"][data-score="1"]').count() === 1, 'the locked rows are shown');
  await page.click('[data-forward]');
  expect(await page.inputValue('[data-field="would-r"]') === '1.5', 'what was typed in Step 2 is still there');
  await page.click('[data-close]');
  await page.waitForSelector('[data-close-dialog]');
  await page.click('[data-close-action="draft"]');
  await page.waitForSelector('[data-outcome-step]', { state: 'detached', timeout: 5000 });
  const t = await savedTrade(page);
  expect(t.would_be_r === 1.5 && !t.outcome_at, JSON.stringify({ w: t.would_be_r, at: t.outcome_at }));
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('Rubric v2: click outside asks; re-scoring a row keeps the focus sane; the locked Step 1 keeps its chart area', async () => {
  const { page, errors } = await openNewTrade({ decisionSeconds: 90 });
  // Untouched: a click on the tint closes.
  await page.mouse.click(5, 600);
  await page.waitForSelector('[data-decide-step]', { state: 'detached', timeout: 5000 });
  await page.locator('[data-new-trade]:visible').click();
  await page.waitForSelector('[data-decide-step]');
  await page.keyboard.press('2');
  await page.mouse.click(5, 600);
  await page.waitForSelector('[data-close-dialog]');
  await page.click('[data-close-action="keep"]');
  await page.waitForSelector('[data-close-dialog]', { state: 'detached', timeout: 3000 });
  // Sweep scored by key; change Sweep by mouse: the focus goes to the next unscored row (Inversion), not past it.
  await page.locator('[data-row="row_sweep"] [data-pick="1"]').click();
  expect(await page.locator('[data-row="row_inversion"][data-focused]').count() === 1, 'focus on the next unscored row');
  await page.locator('[data-row="row_target"] [data-pick="2"]').click();
  expect(await page.locator('[data-row="row_inversion"][data-focused]').count() === 1, 'scoring a later row sends the focus back to the open one');
  for (const k of ['2', '2', 'l', 'a']) await page.keyboard.press(k);
  await gateAndR(page);
  await page.keyboard.press('t');
  await page.waitForSelector('[data-outcome-step]');
  expect(await page.locator('[data-outcome-step] [data-shot-slots]').count() === 0, 'no charts on Step 2');
  await page.click('[data-back]');
  await page.waitForSelector('[data-locked-step1] [data-shot-slots]');
  const h = await page.locator('[data-locked-step1] [data-trade-charts]').evaluate((el) => el.getBoundingClientRect().height);
  expect(h > 200, `the chart area is there (${h}px)`);
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('Rubric v2: the tag row — a tag and its mirror never together, the auto market tags follow Max R', async () => {
  const { page, errors } = await openNewTrade({ decisionSeconds: 90 });
  for (const k of ['2', '2', '2', '2', 'l', 'a']) await page.keyboard.press(k);
  await gateAndR(page);
  await page.keyboard.press('t');
  await page.waitForSelector('[data-tags]');
  await page.click('[data-tag-grid="me"] [data-tag="Sized wrong"]');
  expect(await page.locator('[data-tag-grid="worked"] [data-tag="Sized correctly"][data-blocked]').count() === 1, 'the mirror is blocked');
  await page.click('[data-tag-grid="worked"] [data-tag="Sized correctly"]', { force: true });
  expect(await page.locator('[data-tag-note]').count() === 1, 'a short note says why');
  expect(await page.locator('[data-tag-grid="worked"] [data-tag="Sized correctly"][aria-pressed="true"]').count() === 0, 'not selected');
  // Max R 0.2 → "Failed immediately", lit and not tappable.
  await page.locator('[data-outcome-fields] button:has-text("Loss")').first().click();
  await page.fill('[data-field="mfe"]', '0.2');
  expect(await page.locator('[data-tag-grid="market"] [data-tag="Failed immediately"][aria-pressed="true"]').count() === 1, 'computed');
  expect(await page.locator('[data-tag-grid="market"] [data-tag="Failed immediately"]').isDisabled(), 'not tappable');
  // Three boxes, one height.
  const hs = await page.locator('[data-tag-grid]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(Math.max(...hs) - Math.min(...hs) <= 2, `same height: ${hs.join(', ')}`);
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('Rubric v2: a pass shows "Why I passed" instead of the tags; a reason is required; the second tap makes it main', async () => {
  const { page, errors } = await openNewTrade({ decisionSeconds: 90 });
  for (const k of ['2', '2', '2', '2', 'l', 'a']) await page.keyboard.press(k);
  await gateAndR(page);
  await page.keyboard.press('p');
  await page.waitForSelector('[data-outcome-step][data-decision="pass"]');
  expect(await page.locator('[data-tags]').count() === 0, 'no tag groups on a pass');
  expect(await page.locator('[data-reasons]').count() === 1, 'the reasons instead');
  await page.fill('[data-field="would-r"]', '2');
  await page.locator('[data-outcome-step] textarea').first().fill('Waited and it ran without me.');
  await page.click('[data-save-outcome]');
  expect(/passed/.test(await page.locator('[data-outcome-step] [role="alert"]').innerText()), 'a reason is required');
  await page.click('[data-reason="Rubric said no trade"]');
  await page.click('[data-reason="Doubt or fear"]');
  await page.click('[data-reason="Doubt or fear"]');
  expect(await page.locator('[data-reason="Doubt or fear"][data-main]').count() === 1, 'second tap: main');
  await page.click('[data-save-outcome]');
  await page.waitForSelector('[data-outcome-step]', { state: 'detached', timeout: 5000 });
  const t = await page.evaluate(async () => (await (await fetch('/api/trades')).json()).filter((x) => x.rubric_version === 5 && x.decision === 'pass').pop());
  expect(t && t.pass_main_reason === 'Doubt or fear' && t.pass_reasons.length === 2 && t.mistake_tags.length === 0, JSON.stringify(t && { m: t.pass_main_reason, r: t.pass_reasons }));
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('Replay plan: Step 1 shows the day\'s A and B above the chart; the matching card is outlined, never picked', async () => {
  const { page, errors } = await openNewTrade({ decisionSeconds: 90 });
  await page.waitForSelector('[data-plan-strip]');
  const h = await page.locator('[data-plan-strip]').evaluate((el) => el.getBoundingClientRect().height);
  expect(h <= 90, `the strip stays under 90 px (${h})`);
  await page.waitForSelector('[data-header-strip] [data-replay-control="active"]', { timeout: 5000 }).catch(() => {});
  expect(await page.locator('[data-header-strip] [data-replay-control="active"]').count() === 1, 'the day is shown in the header');
  await page.keyboard.press('s');
  expect(await page.locator('[data-plan-card="b"][data-match]').count() === 1, 'Short outlines B');
  expect(await page.locator('[data-facts] button[aria-pressed="true"][data-option="B"]').count() === 0, 'and does not pick it');
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('Replay plan: Next replay day closes the day with one question, and the builder locks the next one from taps', async () => {
  const { page, errors } = await openNewTrade({ decisionSeconds: 90 });
  await page.click('[data-next-replay-day]');
  await page.waitForSelector('[data-close-day]');
  await page.click('[data-day-outcomes] [data-option="A"]');
  await page.waitForSelector('[data-took-for="A"]');
  await page.click('[data-took-for="A"] [data-option="passed"]');
  await page.click('[data-next-day]');
  await page.waitForSelector('[data-replay-builder="plan"]');
  expect(await page.inputValue('[data-replay-date]') === '2026-03-04', 'the next weekday after the last replay date');
  await page.click('[data-copy-last]');
  await page.locator('[data-replay-scenario="a"] [data-replay-group="a-rr"] [data-option="<1.5"]').click();
  expect(await page.locator('[data-rr-warning]').count() === 1, 'the <1.5R warning');
  await page.locator('[data-replay-scenario="a"] [data-replay-group="a-rr"] [data-option="2+"]').click();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-replay-builder]', { state: 'detached' });
  await page.waitForSelector('[data-replay-day="2"]');
  const st = await page.evaluate(async () => (await fetch('/api/replay')).json());
  expect(st.active.sequence === 2 && st.active.replay_date === '2026-03-04' && st.active.locked_at, JSON.stringify({ s: st.active?.sequence, d: st.active?.replay_date }));
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('Step 1: the plan section and the chart box keep one size — a tall screenshot moves nothing; Start fresh clears and restarts', async () => {
  const { page, errors } = await openNewTrade({ decisionSeconds: 90 });
  await page.waitForSelector('[data-plan-strip="plan"]');
  const box = () => page.locator('[data-shot-slots] > div').first().evaluate((el) => `${el.offsetHeight} px (with the thumbnails ${el.parentElement.offsetHeight})`); // layout size: the paste flash scales, it never resizes
  const take = () => page.locator('[data-decide-button="take"]').evaluate((el) => Math.round(el.getBoundingClientRect().top));
  await page.waitForTimeout(1500); // the header and plan settle first
  const [h0, t0] = [await box(), await take()];
  // A very tall chart, pasted.
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 2400;
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'tall.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  });
  await page.waitForSelector('[data-shot-slots] img');
  await page.waitForTimeout(1500); // the paste flash settles
  expect(await box() === h0 && await take() === t0, `the box stays ${h0} and Take stays put (${await box()}, ${t0} → ${await take()})`);
  // Start fresh: answers gone, the clock from zero.
  for (const k of ['2', '2']) await page.keyboard.press(k);
  await page.waitForTimeout(1200);
  await page.click('[data-start-fresh]');
  await page.click('[data-close-action="fresh"]');
  await page.waitForTimeout(300);
  expect(await page.locator('[data-shot-slots] img').count() === 0, 'the chart is cleared');
  expect(await page.locator('[data-rubric] [aria-pressed="true"], [data-rubric] [aria-checked="true"]').count() === 0, 'the rows are cleared');
  const secs = Number((await page.locator('[data-seconds]').innerText()).replace(/\D/g, '')) || 0;
  expect(secs <= 1 || secs >= 89, `the clock restarted (${secs})`);
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('Step 1 can be edited once: Back, Edit Step 1 · once, change a row — the grade follows, the original is kept, no second edit', async () => {
  const { page, errors } = await openNewTrade({ decisionSeconds: 90 });
  for (const k of ['2', '2', '2', '2', 'l', 'a']) await page.keyboard.press(k);
  await gateAndR(page);
  await page.keyboard.press('t');
  await page.waitForSelector('[data-outcome-step]');
  await page.click('[data-back]');
  await page.waitForSelector('[data-locked-step1="locked"]');
  const before = await page.locator('[data-locked-grade]').getAttribute('data-locked-grade');
  await page.click('[data-edit-step1]');
  await page.click('[data-close-action="edit"]');
  await page.waitForSelector('[data-locked-step1="editing"]');
  await page.click('[data-locked-step1] [data-row="row_sweep"] [data-pick="0"]');
  const preview = await page.locator('[data-locked-grade]').getAttribute('data-locked-grade');
  expect(preview !== before, `the grade follows the edit (${before} → ${preview})`);
  await page.click('[data-save-step1]');
  await page.waitForSelector('[data-locked-step1="edited"]');
  expect((await page.locator('[data-step1-original]').innerText()).includes(`was ${before}`), 'the original grade is shown');
  expect(await page.locator('[data-edit-step1]').count() === 0, 'no second edit');
  const t = await savedTrade(page);
  expect(t.row_sweep === 0 && t.step1_edited_at && t.step1_original.letter === before && t.decision === 'take', JSON.stringify({ r: t.row_sweep, o: t.step1_original }));
  const again = await page.evaluate(async (id) => (await fetch(`/api/trades/${id}/step1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ row_sweep: 2 }) })).status, t.id);
  expect(again === 400, 'the API refuses a second edit');
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await check('Replay plan: with no day locked, New trade offers to plan it or trade without — unplanned, capped at B', async () => {
  const { page, errors } = await open({ width: 1920, height: 1080 }, { nav: 'side', decisionSeconds: 90 });
  const st = await page.evaluate(async () => (await fetch('/api/replay')).json());
  await page.evaluate(async (id) => fetch('/api/replay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'close', id, outcome: 'C', ends_sitting: true }) }), st.active.id);
  await page.evaluate(() => localStorage.setItem('signature.lastAccount', 'Backtest (FX Replay)'));
  await page.locator('[data-new-trade]:visible').click();
  await page.waitForSelector('[data-replay-gate]');
  const t0 = await page.locator('[data-seconds]').innerText();
  await page.waitForTimeout(1500);
  expect(await page.locator('[data-seconds]').innerText() === t0, 'the clock waits');
  await page.click('[data-gate-noplan]');
  await page.waitForSelector('[data-plan-strip="none"] [data-no-plan]');
  for (const k of ['2', '2', '2', '2', 'l', 'a']) await page.keyboard.press(k);
  await gateAndR(page);
  expect(await page.locator('[data-grade]').getAttribute('data-grade') === 'B', 'unplanned: max B');
  await page.keyboard.press('t');
  await page.waitForSelector('[data-outcome-step]');
  const t = await savedTrade(page);
  expect(t.plan_scenario === 'none' && t.grade_letter === 'B' && t.replay_day_id === null, JSON.stringify({ s: t.plan_scenario, g: t.grade_letter }));
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
  await lockDay();
});

await check('Trades: unfinished trades wait on their own shelf; deleting one asks only for DELETE', async () => {
  const { page, errors } = await openNewTrade();
  for (const k of ['2', '2', '2', '2', 'l', 'a']) await page.keyboard.press(k);
  await gateAndR(page);
  await page.keyboard.press('p');
  await page.waitForSelector('[data-outcome-step]');
  await page.click('[data-finish-later]');
  await page.goto(`${BASE}/`);
  await page.waitForSelector('[data-library-unfinished]');
  const t = await savedTrade(page);
  expect(await page.locator(`[data-unfinished-row="${t.id}"]`).count() === 1, 'on the shelf');
  expect(await page.locator(`[data-library-row="${t.id}"]`).count() === 0, 'not in the journal list');
  await page.locator(`[data-unfinished-row="${t.id}"] [data-unfinished-delete]`).click();
  await page.waitForSelector('[data-delete-dialog="type"]');
  await page.locator('[data-delete-dialog="type"] input').fill('DELETE');
  await page.locator('[data-delete-dialog="type"] input').press('Enter');
  await page.waitForFunction((id) => !document.querySelector(`[data-unfinished-row="${id}"]`), t.id, { timeout: 5000 });
  const gone = await page.evaluate(async (id) => (await fetch(`/api/trades/${id}`)).json().catch(() => null), t.id);
  expect(!gone || gone.deleted_at, 'in the Trash');
  await page.context().close();
  expect(!errors.length, errors.join(' | '));
});

await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
stop();
process.exit(failures.length ? 1 : 0);
