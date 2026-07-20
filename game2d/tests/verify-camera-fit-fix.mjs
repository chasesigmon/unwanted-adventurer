// Visual verification for the classroom/common-room/dorm camera fit fix
// (bugs 1 & 3: teacher/content cut off, player able to walk off the
// visible frame). Registers, creates a character (auto-enters the game
// via "Create & play"), then walks organically from spawn into the
// Entrance Hall and into a classroom, screenshotting along the way at a
// viewport size (1512x900) smaller than CLASSROOM_ZOOM=3's ~1824x1248
// reference — the exact condition that used to trigger the bug. Run with
// `node tests/verify-camera-fit-fix.mjs`.
import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5175/';
const UNAME = 'FitZoom' + Math.floor(Math.random() * 100000);
const CHAR = 'Fztest' + ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];

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

// Walk north from the Grimoak Grounds spawn, through the castle door,
// into the Entrance Hall, zigzagging to route around any furniture.
async function tap(key, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.down(key);
    await new Promise((r) => setTimeout(r, 80));
    await page.keyboard.up(key);
    await new Promise((r) => setTimeout(r, 120));
  }
}

await tap('w', 10); // cross the bridge, through the castle door
await page.screenshot({ path: '/tmp/fit-fix-entrance-hall.png' });
console.log('Saved /tmp/fit-fix-entrance-hall.png');

// Zoom in (item 10's toggle) while still in the big open Entrance Hall.
await page.keyboard.press('v');
await new Promise((r) => setTimeout(r, 300));
await tap('w', 8);
await tap('d', 2);
await tap('w', 8);
await page.screenshot({ path: '/tmp/fit-fix-entrance-hall-zoomed-walking.png' });
console.log('Saved /tmp/fit-fix-entrance-hall-zoomed-walking.png');

// Keep pushing north/east to reach a classroom door and go inside.
for (let i = 0; i < 6; i++) {
  await tap('w', 6);
  await tap('d', 2);
}
await page.screenshot({ path: '/tmp/fit-fix-classroom-zoomed.png' });
console.log('Saved /tmp/fit-fix-classroom-zoomed.png');

// Toggle back to default zoom to check the classroom fits without the
// manual zoom-in too (bug 3's "even while zoomed out" case).
await page.keyboard.press('v');
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/fit-fix-classroom-default.png' });
console.log('Saved /tmp/fit-fix-classroom-default.png');

await browser.close();
