import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 1200 } });

const res = await fetch('http://localhost:8000/api/auth/dev-login?name=Admin');
const { token } = await res.json();

await page.goto('http://localhost:5173/dashboard/sales/daily-report');
await page.evaluate((t) => localStorage.setItem('ht_token', t), token);
await page.goto('http://localhost:5173/dashboard/sales/daily-report');
await page.waitForSelector('text=Đang tải...', { state: 'detached', timeout: 120000 });
await page.waitForTimeout(300);

await page.click('button:has-text("Nhân viên")');
await page.waitForSelector('text=Đang tải...', { state: 'detached', timeout: 180000 });
await page.waitForTimeout(500);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-longlh123-Languages-GitHub-HUUTOAN-DASHBOARD/eb490cad-7d00-4bc8-b0fe-2a3528ac2108/scratchpad/rep_view.png', fullPage: true });

console.log('done');
await browser.close();
