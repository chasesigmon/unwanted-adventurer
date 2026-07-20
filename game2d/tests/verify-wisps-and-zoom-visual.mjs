// Visual smoke test for item 9 (ambient wisps) and item 10 (zoom toggle)
// — logs a fresh character into Great Plains (a wisp-eligible outdoor
// map), screenshots it, then toggles zoom and screenshots again. Run
// with `node tests/verify-wisps-and-zoom-visual.mjs`.
import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5175/';
const UNAME = 'WispZoom' + Math.floor(Math.random() * 100000);
const CHAR = 'Wztest' + ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];

function psql(sql) {
  execSync(`docker exec game2d-postgres psql -U game2d -d game2d -c "${sql}"`, { stdio: 'pipe' });
}

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (err) => console.error('PAGE ERROR:', err.message));

await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 15000 });
await page.click('#tab-register');
await page.type('#auth-email', UNAME.toLowerCase() + '@example.com');
await page.type('#auth-username', UNAME);
await page.type('#auth-password', 'testpass123');
await page.click('#auth-submit');
await new Promise((r) => setTimeout(r, 1000));

await page.type('#new-character-name', CHAR);
await page.click('#create-character-form button[type="submit"]');
await new Promise((r) => setTimeout(r, 1200));

// Teleport to a wisp-eligible outdoor map before selecting the character.
psql(`UPDATE players SET map='Great Plains', "row"=20, col=20 WHERE username='${CHAR}';`);

const charButtons = await page.$$('#character-list button');
if (charButtons.length > 0) await charButtons[0].click();
await new Promise((r) => setTimeout(r, 2500));

await page.screenshot({ path: '/tmp/wisps-default-zoom.png' });
console.log('Saved /tmp/wisps-default-zoom.png');

await page.keyboard.press('v');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: '/tmp/wisps-zoomed-in.png' });
console.log('Saved /tmp/wisps-zoomed-in.png');

await browser.close();
