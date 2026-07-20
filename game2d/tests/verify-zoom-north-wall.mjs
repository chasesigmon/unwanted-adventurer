// Visual verification for bug report 2: zoomed-in Entrance Hall used to
// cut off content near the north wall (classroom doors), and the player
// could render off-screen entirely. Root cause: the status bar/log panel
// are separate absolutely-positioned HTML overlays with no coordination
// with Phaser's camera at all — content near a map edge rendered directly
// BEHIND that chrome. Fixed by insetting #game-container itself (see
// style.css's --hud-top-margin/--hud-bottom-margin) so Phaser's own canvas
// never extends under the HUD in the first place — no camera/scroll
// tricks needed. Registers, walks from spawn through the castle door into
// the Entrance Hall, zooms in, then pushes north as far as possible
// (zigzagging around furniture) and screenshots along the way. Run with
// `node tests/verify-zoom-north-wall.mjs`.
import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5175/';
const UNAME = 'ZoomN' + Math.floor(Math.random() * 100000);
const randomLetters = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const CHAR = 'Zn' + randomLetters(8);

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

async function tap(key, times = 1, downMs = 70, upMs = 90) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.down(key);
    await new Promise((r) => setTimeout(r, downMs));
    await page.keyboard.up(key);
    await new Promise((r) => setTimeout(r, upMs));
  }
}

// Cross the bridge, through the castle door, into the Entrance Hall.
await tap('w', 12);
await page.keyboard.press('v'); // zoom in
await new Promise((r) => setTimeout(r, 300));

// Push north hard, zigzagging around any furniture, all the way to the
// north wall (and, if a door column is hit, straight through it).
for (let round = 0; round < 8; round++) {
  await tap('w', 8);
  await tap('a', 1);
  await tap('w', 8);
  await tap('d', 2);
  await page.screenshot({ path: `/tmp/zoom-north-round${round}.png` });
}
console.log('Saved /tmp/zoom-north-round0..7.png — confirm the player, doors, desks, and fireplace all stay fully visible with a clear margin below the status bar.');

await browser.close();
