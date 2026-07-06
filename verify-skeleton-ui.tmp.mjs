import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const username = `skui${Date.now() % 100000}`;
const password = 'testpass123';

async function getHealth() {
  const res = await fetch(`${BASE}/health`);
  return res.json();
}

(async () => {
  try {
    console.log('launching browser...');
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
    console.log('navigating...');
    await page.goto('http://localhost:5173', { timeout: 15000 });
    console.log('filling form, username =', username);
    await page.fill('#username-input', username, { timeout: 5000 });
    await page.fill('#password-input', password, { timeout: 5000 });
    console.log('clicking register...');
    await page.click('#register-button', { timeout: 5000 });

    console.log('waiting for #hud...');
    await page.waitForSelector('#hud', { timeout: 10000 });
    console.log('hud appeared');
    await page.waitForTimeout(500);

    async function readPos() {
      const text = await page.textContent('#position-readout');
      const m = text.match(/\((\d+), (\d+)\)/);
      return { row: Number(m[1]), col: Number(m[2]) };
    }

    let { row, col } = await readPos();
    console.log('starting pos:', row, col);
    let arrived = false;

    for (let step = 0; step < 40 && !arrived; step++) {
      const health = await getHealth();
      const live = health.monsters;
      live.sort((a, b) => Math.abs(a.row - row) + Math.abs(a.col - col) - (Math.abs(b.row - row) + Math.abs(b.col - col)));
      const target = live[0];

      let key;
      if (row !== target.row) {
        key = target.row < row ? 'w' : 's';
      } else if (col !== target.col) {
        key = target.col < col ? 'a' : 'd';
      } else {
        arrived = true;
        break;
      }

      await page.keyboard.press(key);
      await page.waitForTimeout(120);
      ({ row, col } = await readPos());

      const msg = await page.textContent('#monster-message').catch(() => null);
      if (msg) {
        arrived = true;
      }
      if (step % 10 === 0) console.log('step', step, 'pos', row, col);
    }

    await page.waitForTimeout(200);
    const finalMsg = await page.textContent('#monster-message').catch(() => null);
    console.log('final position:', row, col);
    console.log('monster-message text:', finalMsg);

    await page.screenshot({ path: '/tmp/skeleton-sighting.png' });
    console.log('screenshot saved');

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.log('SCRIPT ERROR:', err.message);
    process.exit(1);
  }
})();
