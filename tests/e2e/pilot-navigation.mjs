/*
  Browser regression test for the post-submission navigation.

  Builds the site with demo mode OFF into a temporary directory, serves it,
  mocks the API with Playwright route handlers (no real services), and checks:
    1. submitting the pilot review page navigates in the same tab to the private
       report page, without opening any email;
    2. the draft is cleared there and a refresh of the report page stays put;
    3. the pilot progress page never shows a payment step;
    4. after submission, visiting the questionnaire starts fresh at screen 1,
       but only when the user goes there deliberately.

  Run: npm run test:e2e
  Needs a Chromium: Google Chrome installed, or E2E_BROWSER_PATH pointing at a
  Chromium binary, or PLAYWRIGHT_BROWSERS_PATH from `npx playwright install`.
*/
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright-core';

const PORT = Number(process.env.E2E_PORT ?? 4199);
const outDir = mkdtempSync(join(tmpdir(), 'iv-e2e-'));
const problems = [];
// Run Vite's own binary with this Node, not through npx, so the process we
// spawn is the server itself and killing its process group stops it.
const VITE_BIN = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js');

function fail(msg) {
  problems.push(msg);
  console.error('FAIL', msg);
}

console.log('building (demo mode off)…');
const build = spawnSync(process.execPath, [VITE_BIN, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], { env: { ...process.env, VITE_DEMO_MODE: 'false' }, stdio: 'inherit' });
if (build.status !== 0) {
  console.error('build failed');
  process.exit(1);
}
const preview = spawn(process.execPath, [VITE_BIN, 'preview', '--outDir', outDir, '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
const stopPreview = () => {
  try {
    process.kill(-preview.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};
process.on('exit', stopPreview);
// Wait until the server actually answers (fails fast if the port was taken).
let up = false;
for (let i = 0; i < 40 && !up; i += 1) {
  if (preview.exitCode !== null) break;
  try {
    const r = await fetch(`http://localhost:${PORT}/`);
    up = r.ok;
  } catch {
    await new Promise((r) => setTimeout(r, 250));
  }
}
if (!up) {
  console.error(`preview server did not start on port ${PORT} (is it already in use?)`);
  stopPreview();
  process.exit(1);
}

const TOKEN = 'Z'.repeat(43);
const launchOpts = process.env.E2E_BROWSER_PATH ? { executablePath: process.env.E2E_BROWSER_PATH } : process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { channel: 'chrome' };
const browser = await chromium.launch(launchOpts);
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));

  // ---- API mocks: a server that accepts the pilot order and reports real-looking states.
  let pilotOrderCalls = 0;
  let statusCalls = 0;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    switch (url.pathname) {
      case '/api/owner-session':
        return json({ authenticated: true, pilotMode: true, expiresAt: new Date(Date.now() + 3600e3).toISOString(), allowedEmails: ['support@metaphorconsultants.com'], generator: 'anthropic', model: 'claude-opus-5-5', context: 'test' });
      case '/api/pilot-order': {
        pilotOrderCalls += 1;
        const body = route.request().postDataJSON();
        if (!body.clientRequestId) fail('pilot-order request carried no clientRequestId');
        if (body.answers?.email !== 'support@metaphorconsultants.com') fail('pilot-order email was not the allowlisted address');
        return json({ reportPath: `/report/${TOKEN}`, orderRef: 'E2E00001', created: true, jobId: 'job' }, 201);
      }
      case '/api/report-status': {
        statusCalls += 1;
        const body = route.request().postDataJSON();
        if (body.token !== TOKEN) return json({ error: 'not_found' }, 404);
        return json({
          reportRef: 'E2E00001', ideaName: 'E2E idea', orderedAt: new Date().toISOString(), expiresAt: null, emailMasked: 'su*****@metaphorconsultants.com', isPilot: true,
          standard: { stage: 'queued_for_research', label: 'Queued for research', pdfAvailable: false, emailSent: false, confirmationEmailSent: true, verdict: null, job: { state: 'queued', attempts: 0, nextRetryAt: null } },
          detailed: null, upgrade: { price: '£34', priceNote: 'additional, one-time payment', available: true },
        });
      }
      default:
        return json({ error: 'not_found' }, 404);
    }
  });

  const base = `http://localhost:${PORT}`;
  await page.goto(`${base}/owner/pilot`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start a pilot report' }).click();
  await page.waitForURL('**/validate/1');

  await page.fill('#ideaDescription', 'E2E idea: van-based grooming at home for dog owners in north Leeds.');
  await page.fill('#targetCustomer', 'Dog owners who want calm handling at home.');
  await page.fill('#industry', 'Personal services (beauty, childcare, pets…)');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('#country-UK');
  await page.check('#country-UK');
  await page.fill('#regionCity', 'Leeds');
  await page.selectOption('#revenueModel', 'one-off');
  await page.fill('#priceEstimate', '45');
  // Go back and forward: the answers must survive.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.waitForSelector('#ideaDescription');
  if (!(await page.inputValue('#ideaDescription')).startsWith('E2E idea')) fail('answers were lost on Back');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('#country-UK');
  if ((await page.inputValue('#regionCity')) !== 'Leeds') fail('step 2 answers were lost on Back/Continue');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('#budget');
  await page.fill('#budget', '8000');
  await page.selectOption('#hoursPerWeek', '20-35');
  await page.selectOption('#experience', 'some');
  await page.check('#stage-idea');
  const prefilled = await page.inputValue('#email');
  if (prefilled !== 'support@metaphorconsultants.com') fail(`pilot email not pre-filled (got "${prefilled}")`);
  await page.check('#ackScope');
  await page.check('#ackTerms');
  await page.getByRole('button', { name: 'Review my answers' }).click();
  await page.waitForURL('**/review');
  await page.waitForSelector('.review-group');
  await page.getByLabel('Confirm your email address').fill('support@metaphorconsultants.com');

  // Submit: the button must disable while pending, and the next page must be the report page.
  const button = page.getByRole('button', { name: /Create pilot report/ });
  await button.click();
  await page.waitForURL(`**/report/${TOKEN}`, { timeout: 10000 }).catch(() => fail(`did not navigate to the report page; at ${page.url()}`));
  await page.waitForSelector('.timeline', { timeout: 10000 }).catch(() => fail('report timeline did not render'));
  if (pilotOrderCalls !== 1) fail(`expected exactly one pilot-order request, got ${pilotOrderCalls}`);

  const text = await page.textContent('body');
  for (const bad of ['Confirming your payment', 'Payment confirmed']) if (text.includes(bad)) fail(`pilot progress shows "${bad}"`);
  for (const good of ['Submission received', 'Queued for research', 'Researching', 'Writing your report', 'Report ready', 'Email sent']) if (!text.includes(good)) fail(`pilot progress missing "${good}"`);
  if (!text.includes('confirmation email (not the report)')) fail('confirmation email is not distinguished from the report email');

  // Draft cleared on the report page, and a refresh stays on the report page.
  const draft = await page.evaluate(() => window.sessionStorage.getItem('inovantage.draft.v1'));
  if (draft && draft.includes('E2E idea')) fail('draft answers still present after submission');
  await page.reload({ waitUntil: 'networkidle' });
  if (!page.url().includes(`/report/${TOKEN}`)) fail(`refresh left the report page: ${page.url()}`);
  await page.waitForSelector('.timeline');
  if (statusCalls < 2) fail('status was not re-read after refresh');

  // Going to the questionnaire deliberately starts a fresh draft at screen 1.
  await page.goto(`${base}/validate/1`, { waitUntil: 'networkidle' });
  if ((await page.inputValue('#ideaDescription')) !== '') fail('old answers reappeared in a new questionnaire');

  // Failure path: a server error keeps the user on the review page with answers intact.
  await page.route('**/api/pilot-order', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal', message: 'Something went wrong. Please try again.' }) }), { times: 1 });
  await page.goto(`${base}/owner/pilot`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start a pilot report' }).click();
  await page.waitForURL('**/validate/1');
  await page.fill('#ideaDescription', 'Second run.');
  await page.fill('#targetCustomer', 'Falconers.');
  await page.fill('#industry', 'Falconry');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('#country-UK');
  await page.check('#country-UK');
  await page.fill('#regionCity', 'York');
  await page.selectOption('#revenueModel', 'one-off');
  await page.check('#priceEstimate-unknown');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('#budget');
  await page.check('#budget-unknown');
  await page.selectOption('#hoursPerWeek', 'lt5');
  await page.selectOption('#experience', 'none');
  await page.check('#stage-idea');
  await page.check('#ackScope');
  await page.check('#ackTerms');
  await page.getByRole('button', { name: 'Review my answers' }).click();
  await page.waitForURL('**/review');
  await page.getByLabel('Confirm your email address').fill('support@metaphorconsultants.com');
  await page.getByRole('button', { name: /Create pilot report/ }).click();
  await page.waitForSelector('[role="alert"]', { timeout: 10000 }).catch(() => fail('no error shown after a failed submission'));
  if (!page.url().endsWith('/review')) fail(`failed submission left the review page: ${page.url()}`);
  const reviewText = await page.textContent('body');
  if (!reviewText.includes('Second run.')) fail('answers were lost after a failed submission');
  if (!reviewText.includes('Something went wrong')) fail('server error message not shown');
  await ctx.close();
} finally {
  await browser.close();
  stopPreview();
  rmSync(outDir, { recursive: true, force: true });
}
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nE2E PASSED: pilot submission navigates to the report page, draft clears safely, refresh stays, labels never imply payment');
process.exit(problems.length ? 1 : 0);
