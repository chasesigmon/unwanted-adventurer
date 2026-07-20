// Confirms the fix in full: registering a brand new account from the
// real login screen actually reaches the character-select screen.
import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TARGET = process.argv[2] ?? 'http://localhost:5175/';
const UNAME = 'BrowserTest' + Math.floor(Math.random() * 100000);

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage();
page.on('pageerror', (err) => console.error('PAGE ERROR:', err.message));

await page.goto(TARGET, { waitUntil: 'networkidle0', timeout: 15000 });
await page.click('#tab-register');
await page.type('#auth-email', UNAME.toLowerCase() + '@example.com');
await page.type('#auth-username', UNAME);
await page.type('#auth-password', 'testpass123');
await page.click('#auth-submit');
await new Promise((r) => setTimeout(r, 1500));

const charSelectVisible = await page.$eval('#character-select-screen', (el) => !el.hidden).catch(() => false);
const authVisible = await page.$eval('#auth-screen', (el) => !el.hidden).catch(() => true);
console.log('character-select-screen visible after register:', charSelectVisible, '(expected: true)');
console.log('auth-screen still visible:', authVisible, '(expected: false)');

await browser.close();
console.log(charSelectVisible && !authVisible ? 'PASS' : 'FAIL');
