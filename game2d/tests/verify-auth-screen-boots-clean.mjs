// Real-Chrome diagnostic for the reported login/register bug — uses the
// system Google Chrome install via puppeteer-core (no download needed)
// instead of jsdom, which turned out to silently not execute
// `<script type="module">` at all (a jsdom limitation, not a real bug).
import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TARGET = process.argv[2] ?? 'http://localhost:5175/';

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => {
  consoleErrors.push('PAGE ERROR: ' + err.message + '\n' + (err.stack ?? '(no stack)'));
});
page.on('requestfailed', (req) => {
  consoleErrors.push('REQUEST FAILED: ' + req.url() + ' — ' + (req.failure()?.errorText ?? 'unknown'));
});
page.on('response', (res) => {
  if (res.status() >= 400) consoleErrors.push('HTTP ' + res.status() + ': ' + res.url());
});

console.log('Navigating to', TARGET);
await page.goto(TARGET, { waitUntil: 'networkidle0', timeout: 15000 });
await new Promise((r) => setTimeout(r, 1000));

console.log('--- console errors / page errors / failed requests ---');
if (consoleErrors.length === 0) console.log('(none)');
else consoleErrors.forEach((e) => console.log(e));

console.log('--- clicking Register tab ---');
await page.click('#tab-register');
await new Promise((r) => setTimeout(r, 300));
const emailHidden = await page.$eval('#auth-email-label', (el) => el.hidden);
console.log('email label hidden after clicking Register tab:', emailHidden, '(expected: false)');
const tabRegisterClasses = await page.$eval('#tab-register', (el) => el.className);
console.log('tab-register classes:', tabRegisterClasses);

console.log('--- attempting a login submit (bogus creds, just checking the JS intercepts it) ---');
await page.click('#tab-login'); // switch back — the Register-tab click above left the required email field empty
await page.type('#auth-username', 'nonexistentuser123');
await page.type('#auth-password', 'wrongpassword123');
const before = page.url();
await page.click('#auth-submit');
await new Promise((r) => setTimeout(r, 2000));
const after = page.url();
const errorText = await page.$eval('#auth-error', (el) => el.textContent).catch(() => '(no #auth-error found)');
console.log('URL before submit:', before);
console.log('URL after submit:', after, '(if these differ or a real navigation/reload happened, that IS the bug)');
console.log('#auth-error text:', errorText);

console.log('--- final console errors after submit ---');
if (consoleErrors.length === 0) console.log('(none)');
else consoleErrors.forEach((e) => console.log(e));

await browser.close();
