// UI tests for the admin dashboard — drives the real admin.html in Chromium
// against scripts/dev-stub-server.js (no Supabase/network needed).
//
//   node scripts/dev-stub-server.js 4173 &   (the test starts its own by default)
//   node scripts/ui-test.mjs
//
// CDN scripts are served from local node_modules so the suite runs offline.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.join(__dirname, '..');
const PORT   = 4173;
const BASE   = `http://localhost:${PORT}`;
const SHOTS  = process.env.SHOT_DIR || path.join(ROOT, '.ui-shots');
mkdirSync(SHOTS, { recursive: true });

// ── Local stand-ins for CDN scripts ─────────────────────────────────
const LOCAL_SCRIPTS = [
  [/unpkg\.com\/react@[^/]+\/umd\/react\.(production\.min|development)\.js/,        'node_modules/react-local/react.production.min.js'],
  [/unpkg\.com\/react-dom@[^/]+\/umd\/react-dom\.(production\.min|development)\.js/,'node_modules/react-local/react-dom.production.min.js'],
  [/unpkg\.com\/@babel\/standalone[^ ]*babel\.min\.js/,                             'node_modules/@babel/standalone/babel.min.js'],
  [/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2[^ ]*supabase\.js/,            'node_modules/@supabase/supabase-js/dist/umd/supabase.js'],
  [/cdn\.jsdelivr\.net\/npm\/chart\.js@4[^ ]*/,                                     'node_modules/chart.js/dist/chart.umd.js'],
];
const STUB_JS_RE = /jspdf/i;   // pdf libs only used on button click — stub them

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`); }
}

async function main() {
  // Start stub server
  // NB: don't inherit stderr — an orphaned child holding our stdio pipe keeps
  // `node ui-test.mjs | tail` alive forever after a crash.
  const server = spawn(process.execPath, [path.join(__dirname, 'dev-stub-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'ignore'] });
  process.on('exit', () => { try { server.kill(); } catch {} });
  await new Promise(res => server.stdout.on('data', d => { if (String(d).includes('stub server on')) res(); }));

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });

  // Route CDN → local files; block everything else that leaves localhost
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    for (const [re, local] of LOCAL_SCRIPTS) {
      if (re.test(url)) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(path.join(ROOT, local)) });
    }
    if (STUB_JS_RE.test(url)) return route.fulfill({ contentType: 'text/javascript', body: 'window.jspdf = window.jspdf || {};' });
    if (url.includes('fonts.googleapis') || url.includes('fonts.gstatic')) return route.fulfill({ contentType: 'text/css', body: '' });
    return route.abort();
  });

  // Seed a long-lived Supabase session so the app boots straight to the Shell
  const session = {
    access_token: 'stub-token', token_type: 'bearer',
    expires_in: 315360000, expires_at: Math.floor(Date.now() / 1000) + 315360000,
    refresh_token: 'stub-refresh',
    user: { id: 'user-1', aud: 'authenticated', role: 'authenticated', email: 'doc@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
  await context.addInitScript(sess => {
    window.localStorage.setItem('sb-localhost-auth-token', JSON.stringify(sess));
  }, session);

  const page = await context.newPage();
  page.on('pageerror', e => console.log('  [pageerror]', e.message.split('\n')[0]));

  // ── Boot ──
  console.log('\nBoot');
  await page.goto(`${BASE}/admin.html`, { waitUntil: 'domcontentloaded' });
  const nav = page.locator('nav, aside').getByText('Patients', { exact: true }).first();
  await page.getByText('Patients', { exact: true }).first().waitFor({ timeout: 60000 });
  check('dashboard shell boots with seeded session', true);

  // ── Patients tab ──
  console.log('\nPatients tab');
  await page.getByText('Patients', { exact: true }).first().click();
  await page.getByText('Jane Smith').first().waitFor({ timeout: 15000 });
  check('patient list renders', await page.getByText('Jane Smith').first().isVisible());
  check('record count shown', await page.getByText('2 records').isVisible());

  // Search
  await page.getByPlaceholder('Search by name, email or phone…').fill('bob');
  await page.waitForTimeout(700); // 400ms debounce + fetch
  check('search filters to Bob', await page.getByText('Bob Jones').isVisible() && !(await page.getByText('Jane Smith').first().isVisible().catch(() => false)));
  await page.getByPlaceholder('Search by name, email or phone…').fill('');
  await page.waitForTimeout(700);

  // Open drawer
  await page.getByText('Jane Smith').first().click();
  await page.getByText('Personal information').waitFor({ timeout: 10000 });
  check('patient drawer opens on Profile tab', true);
  await page.screenshot({ path: path.join(SHOTS, '1-patient-profile.png') });

  // ── Health tab / dental chart ──
  console.log('\nDental chart');
  await page.getByRole('tab', { name: 'Health' }).click();
  await page.getByText('Dental Chart').first().waitFor({ timeout: 10000 });
  const summary = page.locator('[data-testid="chart-summary"]');
  await summary.waitFor({ timeout: 10000 });
  check('summary chip: 1 filled', /1 filled/.test(await summary.innerText()));
  check('summary chip: 1 note',  /1 note/.test(await summary.innerText()));

  // Tooth 26 (quadrant 2) — mesial must be on the LEFT
  await page.locator('[title^="Tooth 26"]').click();
  await page.getByText('SURFACE CONDITIONS').waitFor({ timeout: 5000 });
  let mBox = await page.locator('[title="Mesial"]').boundingBox();
  let dBox = await page.locator('[title="Distal"]').boundingBox();
  check('tooth 26 (Q2): mesial left of distal', mBox && dBox && mBox.x < dBox.x, { m: mBox?.x, d: dBox?.x });
  check('buccal surface present',  await page.locator('[title="Buccal"]').isVisible());
  check('occlusal is centre segment', await page.locator('[title="Occlusal"]').isVisible());

  // Tooth 16 (quadrant 1) — mesial must be on the RIGHT
  await page.locator('[title^="Tooth 16"]').click();
  await page.getByText('SURFACE CONDITIONS').waitFor({ timeout: 5000 });
  mBox = await page.locator('[title="Mesial"]').boundingBox();
  dBox = await page.locator('[title="Distal"]').boundingBox();
  check('tooth 16 (Q1): mesial right of distal', mBox && dBox && mBox.x > dBox.x, { m: mBox?.x, d: dBox?.x });

  // Set tooth 16 status → Cavity; summary + cell update
  await page.getByRole('button', { name: 'Cavity', exact: true }).click();
  await page.waitForTimeout(400);
  check('tooth cell shows CAV', await page.locator('[title^="Tooth 16"]').innerText().then(t => t.includes('CAV')));
  check('summary chip: 1 cavity', /1 cavity/.test(await summary.innerText()));

  // Add a note on tooth 16 via Enter key
  await page.getByPlaceholder('Add a note for this tooth...').fill('Watch distal margin');
  await page.getByPlaceholder('Add a note for this tooth...').press('Enter');
  await page.getByText('Watch distal margin').waitFor({ timeout: 5000 });
  check('tooth note added via Enter', true);
  check('summary notes chip incremented', /2 notes/.test(await summary.innerText()));

  // Surface condition: mark tooth 16 occlusal as filled via the quadrant diagram
  await page.locator('[title="Occlusal"]').click();
  await page.getByText('OCCLUSAL — SELECT STATUS').waitFor({ timeout: 5000 });
  await page.getByText('OCCLUSAL — SELECT STATUS').locator('..').getByRole('button', { name: 'Filled', exact: true }).click();
  await page.waitForTimeout(600); // save + surfaces refetch
  const occBg = await page.locator('[title="Occlusal"]').evaluate(el => getComputedStyle(el).backgroundColor);
  check('occlusal surface saved as filled (colour)', occBg === 'rgb(219, 234, 254)', { occBg });
  await page.screenshot({ path: path.join(SHOTS, '2-dental-chart.png') });

  // Close the drawer
  await page.getByRole('button', { name: 'Close patient record' }).click();

  // ── Add patient wizard — reactive validation ──
  console.log('\nRegistration wizard');
  await page.getByRole('button', { name: '+ Add patient' }).click();
  await page.getByText('New patient').first().waitFor({ timeout: 5000 });

  const phone = page.getByPlaceholder('0710000000');
  await phone.fill('08212345678999');
  check('phone input capped at 10 digits', (await phone.inputValue()) === '0821234567', { got: await phone.inputValue() });
  await phone.fill('12345');
  check('phone error shows instantly', await page.getByText('Phone number must start with 0 or +27.').isVisible());
  await phone.fill('+27821234567');
  check('+27 format accepted', !(await page.getByText('Phone number must start with 0 or +27.').isVisible().catch(() => false)));
  await phone.fill('0821234567');

  const email = page.getByPlaceholder('jane@example.com');
  await email.fill('not-an-email');
  check('email error shows instantly', await page.getByText('Please enter a valid email address.').isVisible());
  await email.fill('test.user@example.com');
  check('email error clears', !(await page.getByText('Please enter a valid email address.').isVisible().catch(() => false)));

  const idInput = page.getByPlaceholder('13-digit SA ID number');
  await idInput.fill('8099015009087');   // month 99 — impossible
  check('impossible birth month flagged', await page.getByText(/invalid birth month/).isVisible());
  await idInput.fill('8001015009088');   // valid date, wrong check digit
  check('bad checksum flagged', await page.getByText(/checksum/).isVisible());
  await idInput.fill('8001015009087');   // genuinely valid SA ID
  check('valid SA ID shows green tick', await page.getByText('✓ Valid SA ID').isVisible());

  await page.getByPlaceholder('Jane', { exact: true }).fill('Test');
  await page.getByPlaceholder('Smith').fill('User');
  await page.locator('select').first().selectOption('male');

  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.getByText('Medical aid details — skip this section if the patient pays themselves.').waitFor({ timeout: 5000 });
  check('advances to Medical aid step', true);

  // "Other…" scheme — the fixed bug: free-text input must appear
  await page.getByRole('button', { name: 'Has medical aid' }).click();
  await page.locator('select').first().selectOption('__other__');
  const otherInput = page.getByPlaceholder('Enter medical aid name');
  await otherInput.waitFor({ timeout: 3000 });
  check('"Other…" reveals free-text scheme field', await otherInput.isVisible());
  await otherInput.fill('Sizwe Hosmed');
  check('custom scheme text persists', (await otherInput.inputValue()) === 'Sizwe Hosmed');
  await page.screenshot({ path: path.join(SHOTS, '3-wizard-other-scheme.png') });

  await page.getByPlaceholder('e.g. 12345678').fill('SZ-998877');
  await page.getByPlaceholder('e.g. Classic Comprehensive').fill('Core');
  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.getByText('Optional — helps with practice reporting.').waitFor({ timeout: 5000 });

  const postal = page.getByPlaceholder('e.g. 1739');
  await postal.fill('17ab39999');
  check('postal code digits-only, capped at 4', (await postal.inputValue()) === '1739', { got: await postal.inputValue() });

  await page.getByRole('button', { name: 'Add patient', exact: true }).click();
  await page.getByText('Test User added').waitFor({ timeout: 8000 });
  check('patient saved (toast)', true);
  await page.getByText('Test User').first().waitFor({ timeout: 8000 });
  check('new patient appears in list', true);

  // ── Treatment plans ──
  console.log('\nTreatment plans');
  await page.getByText('Treatment Plans', { exact: true }).first().click();
  await page.getByText('Root Canal Treatment — Tooth 16').first().waitFor({ timeout: 10000 });
  await page.getByText('Root Canal Treatment — Tooth 16').first().click();
  await page.getByText(/1 \/ 3 sessions/).waitFor({ timeout: 8000 });
  check('plan modal shows 1 / 3 progress', true);
  check('payment summary visible', await page.getByText('Outstanding').first().isVisible());
  check('session paid-in-full flag', await page.getByText('Paid in full').isVisible());

  // Reopen a completed session
  await page.getByRole('button', { name: '↺ Reopen' }).first().click();
  await page.getByText(/0 \/ 3 sessions/).waitFor({ timeout: 8000 });
  check('reopen sets progress back to 0 / 3', true);
  // …and complete it again
  await page.getByRole('button', { name: '✓ Done' }).first().click();
  await page.getByText(/1 \/ 3 sessions/).waitFor({ timeout: 8000 });
  check('re-complete restores 1 / 3', true);

  // Add session — numbering must skip the gap (sessions 1 & 3 exist → next is 4)
  await page.getByRole('button', { name: 'Add session' }).click();
  await page.getByText('Add session 4').waitFor({ timeout: 5000 });
  check('next session number is max+1 (4), not count+1 (3)', true);
  check('extend-plan warning shown', await page.getByText(/the plan will be extended to 4/).isVisible());
  await page.getByRole('button', { name: 'Add session', exact: true }).last().click();
  await page.getByText(/1 \/ 4 sessions/).waitFor({ timeout: 8000 });
  check('plan auto-extended to 4 sessions', true);

  // Edit plan inline
  await page.getByRole('button', { name: 'Edit plan' }).click();
  const totalInput = page.locator('input[type="number"]');
  await totalInput.fill('2');
  await page.getByRole('button', { name: 'Save changes' }).click();
  check('total below existing sessions rejected', await page.getByText(/Total sessions must be at least 4/).isVisible());
  await totalInput.fill('6');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText(/1 \/ 6 sessions/).waitFor({ timeout: 8000 });
  check('plan edit saves (1 / 6)', true);
  await page.screenshot({ path: path.join(SHOTS, '4-treatment-plan.png') });

  // ── Summary ──
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  server.kill();
  if (failed) { console.log('Failures:', failures); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
