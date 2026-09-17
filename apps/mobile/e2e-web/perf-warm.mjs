import { createRequire } from 'node:module';
const require = createRequire('/Users/mamu/Documents/VedaMatchNew-m10/apps/web/package.json');
const { chromium } = require('@playwright/test');
const [url, text] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.goto(url); await page.getByText(text).first().waitFor({ timeout: 60000 }); await page.waitForTimeout(3000);
const out = [];
for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText(text).first().waitFor({ timeout: 60000 });
  out.push(Date.now() - t0);
}
console.log(url, 'warm', JSON.stringify(out));
await browser.close();
