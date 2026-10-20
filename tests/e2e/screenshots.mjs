/*
  Visual check: builds the app (demo off), serves it, mocks the API with a
  ready report (stub-style content), and screenshots the key screens at
  mobile and desktop widths into the given directory.

  Usage: node tests/e2e/screenshots.mjs <outDir>
*/
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const VITE_BIN = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const out = process.argv[2] ?? 'screenshots-out';
mkdirSync(out, { recursive: true });
const PORT = 4198;
const outDir = 'dist-screens';

const build = spawnSync(process.execPath, [VITE_BIN, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], { env: { ...process.env, VITE_DEMO_MODE: 'false' }, stdio: 'inherit' });
if (build.status !== 0) process.exit(1);
const preview = spawn(process.execPath, [VITE_BIN, 'preview', '--outDir', outDir, '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-preview.pid, 'SIGTERM'); } catch { /* gone */ } };
process.on('exit', stop);
let up = false;
for (let i = 0; i < 50 && !up; i += 1) {
  try { up = (await fetch(`http://localhost:${PORT}/`)).ok; } catch { await new Promise((r) => setTimeout(r, 200)); }
}
if (!up) { stop(); process.exit(1); }

const TOKEN = 'Z'.repeat(43);
const { SAMPLE_REPORT, SAMPLE_FIN } = await import('./sample-data.mjs');

const launchOpts = process.env.E2E_BROWSER_PATH ? { executablePath: process.env.E2E_BROWSER_PATH } : process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { channel: 'chrome' };
const browser = await chromium.launch(launchOpts);
async function mockApi(page, { stage = 'email_sent', failed = false } = {}) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    switch (url.pathname) {
      case '/api/owner-session':
        return json({ authenticated: true, pilotMode: true, expiresAt: new Date(Date.now() + 3600e3).toISOString(), allowedEmails: ['support@metaphorconsultants.com'], generator: 'anthropic', model: 'claude-opus-5-5', context: 'test' });
      case '/api/report-status':
        return json({
          reportRef: 'SHOT0001', ideaName: 'Northside Mobile Dog Grooming', market: 'UK', orderedAt: new Date().toISOString(), expiresAt: null, emailMasked: 'fo*****@example.com', isPilot: false,
          standard: failed
            ? { stage: 'failed', label: 'Needs attention', pdfAvailable: false, emailSent: false, confirmationEmailSent: true, verdict: null, job: { state: 'failed', attempts: 1, nextRetryAt: null } }
            : { stage, label: 'Email sent', pdfAvailable: stage === 'email_sent' || stage === 'ready', emailSent: stage === 'email_sent', confirmationEmailSent: true, verdict: 'Refine before investing', job: { state: stage === 'email_sent' ? 'done' : 'running', attempts: 1, nextRetryAt: null } },
          detailed: null, upgrade: { price: '£34', priceNote: 'additional, one-time payment', available: true },
        });
      case '/api/report-content':
        return json({ tier: 'standard', reportRef: 'SHOT0001', generatedAt: new Date().toISOString(), content: SAMPLE_REPORT, financials: SAMPLE_FIN });
      case '/api/report-content-detailed':
        return json({ error: 'not_purchased' }, 402);
      default:
        return json({ error: 'not_found' }, 404);
    }
  });
}

const shots = [];
for (const [name, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1360, height: 900 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.error(`pageerror on ${page.url()}: ${e.message}`); process.exitCode = 1; });
  await mockApi(page);
  const base = `http://localhost:${PORT}`;
  const snap = async (file, opts = {}) => { const p = join(out, `${name}-${file}.png`); await page.screenshot({ path: p, fullPage: true, ...opts }); shots.push(p); };

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await snap('landing');
  await page.goto(`${base}/validate/1`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('.error-summary');
  await snap('form-step1-errors');
  await page.fill('#ideaDescription', 'A mobile dog-grooming van that visits owners at home in north Leeds.');
  await page.fill('#targetCustomer', 'Owners of anxious or large dogs who find salon visits stressful.');
  await page.fill('#industry', 'Personal services (beauty, childcare, pets…)');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('#country-UK');
  await snap('form-step2');
  await page.check('#country-UK');
  await page.fill('#regionCity', 'Leeds');
  await page.selectOption('#revenueModel', 'one-off');
  await page.fill('#priceEstimate', '45');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('#budget');
  await page.fill('#budget', '8000');
  await page.selectOption('#hoursPerWeek', '20-35');
  await page.selectOption('#experience', 'some');
  await page.check('#stage-idea');
  await page.fill('#email', 'founder@example.com');
  await page.check('#ackScope');
  await page.check('#ackTerms');
  await snap('form-step3');
  await page.getByRole('button', { name: 'Review my answers' }).click();
  await page.waitForURL('**/review');
  await page.waitForSelector('.review-group');
  await snap('review');

  await page.goto(`${base}/report/${TOKEN}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.score-header');
  await snap('report');
  // Open a factor row and the upgrade panel area.
  await page.getByRole('button', { name: /Target customer clarity/ }).first().click();
  await page.locator('#upgrade').scrollIntoViewIfNeeded();
  await snap('report-upgrade', { fullPage: false });

  const page2 = await ctx.newPage();
  await mockApi(page2, { stage: 'researching' });
  await page2.goto(`${base}/report/${TOKEN}`, { waitUntil: 'networkidle' });
  await page2.waitForSelector('.timeline');
  await page2.screenshot({ path: join(out, `${name}-progress.png`), fullPage: true });
  const page3 = await ctx.newPage();
  await mockApi(page3, { failed: true });
  await page3.goto(`${base}/report/${TOKEN}`, { waitUntil: 'networkidle' });
  await page3.waitForSelector('.notice--danger');
  await page3.screenshot({ path: join(out, `${name}-error-state.png`), fullPage: true });

  await page.goto(`${base}/sample-report`, { waitUntil: 'networkidle' });
  await snap('sample');
  // Keyboard: tab to the first factor row and open it.
  await page.goto(`${base}/report/${TOKEN}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.factor__head');
  await page.locator('.factor__head').first().focus();
  await page.keyboard.press('Enter');
  const expanded = await page.locator('.factor__head').first().getAttribute('aria-expanded');
  if (expanded !== 'true') { console.error('keyboard did not expand the factor row'); process.exitCode = 1; }
  // Four-week journey: real buttons, Enter and Space toggle, aria-controls points at the panel.
  const journey = page.locator('#plan');
  await journey.scrollIntoViewIfNeeded();
  const milestones = await page.locator('#plan .milestone').count();
  if (milestones !== 4) { console.error(`expected 4 milestones, found ${milestones}`); process.exitCode = 1; }
  const toggle = page.locator('.milestone__toggle').first();
  await toggle.focus();
  const panelId = await toggle.getAttribute('aria-controls');
  const settled = async (value) => {
    try { await page.waitForSelector(`#plan li.milestone:first-of-type .milestone__toggle[aria-expanded="${value}"]`, { timeout: 2000, state: 'attached' }); return true; } catch (e) { console.error(`milestone toggle did not reach aria-expanded=${value}: ${e.message.split('\n')[0]}`); return false; }
  };
  await page.keyboard.press('Enter');
  const openByEnter = (await settled('true')) && (await page.locator(`#${panelId}`).isVisible());
  await page.keyboard.press('Space');
  const closedBySpace = (await settled('false')) && !(await page.locator(`#${panelId}`).isVisible());
  if (!openByEnter || !closedBySpace) { console.error(`journey toggle keyboard: enter=${openByEnter} space=${closedBySpace}`); process.exitCode = 1; }
  await page.keyboard.press('Space');
  await page.locator('.milestone__toggle').nth(2).click();
  // The sticky site header would be stitched into a tall element capture; unstick it for the shot.
  await page.addStyleTag({ content: '.site-header { position: static !important; }' });
  await journey.screenshot({ path: join(out, `${name}-journey.png`) });
  shots.push(join(out, `${name}-journey.png`));
  const overflow = await page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= cw) return null;
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right > cw + 1 && !el.closest('.report-nav, .table-scroll')) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`);
    }
    // Ancestor chain of the first offender, for diagnosis.
    const first = [...document.querySelectorAll('body *')].find((el) => el.getBoundingClientRect().right > cw + 1 && !el.closest('.report-nav, .table-scroll'));
    const chain = [];
    for (let el = first; el && el !== document.body; el = el.parentElement) chain.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}=${Math.round(el.getBoundingClientRect().width)}`);
    return [...out.slice(0, 6), 'chain: ' + chain.join(' < ')];
  });
  if (overflow) { console.error(`horizontal overflow at ${name}: ${overflow.join(' | ')}`); process.exitCode = 1; }
  await ctx.close();
}
await browser.close();
stop();
console.log(shots.join('\n'));
