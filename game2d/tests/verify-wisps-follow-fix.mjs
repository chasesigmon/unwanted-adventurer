// Visual verification for the wisp catch-up fix — registers, spawns on
// Grimoak Grounds (wisp-eligible), walks a long distance away from the
// entry door, and confirms wisps are still visible nearby rather than
// stuck back at the door. Run with `node tests/verify-wisps-follow-fix.mjs`.
import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5175/';
const UNAME = 'WispFix' + Math.floor(Math.random() * 100000);
const CHAR = 'Wftest' + ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true, defaultViewport: { width: 1512, height: 900 } });
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
await new Promise((r) => setTimeout(r, 2000));

await page.click('#game-container canvas');
await page.screenshot({ path: '/tmp/wisps-at-spawn.png' });
console.log('Saved /tmp/wisps-at-spawn.png');

// Walk a long way east/north across Grimoak Grounds, away from the door.
for (let i = 0; i < 40; i++) {
  const key = i % 2 === 0 ? 'd' : 'w';
  await page.keyboard.down(key);
  await new Promise((r) => setTimeout(r, 60));
  await page.keyboard.up(key);
  await new Promise((r) => setTimeout(r, 40));
}
await new Promise((r) => setTimeout(r, 1500)); // let wisps catch up
await page.screenshot({ path: '/tmp/wisps-after-long-walk.png' });
console.log('Saved /tmp/wisps-after-long-walk.png');

await browser.close();
