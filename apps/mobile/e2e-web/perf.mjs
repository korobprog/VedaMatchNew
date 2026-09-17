import { createRequire } from 'node:module';
const require = createRequire('/Users/mamu/Documents/VedaMatchNew-m6/apps/web/package.json');
const { chromium } = require('@playwright/test');
const [url, selectorText, runs = '3'] = process.argv.slice(2);
const browser = await chromium.launch();
const results = [];
for (let i = 0; i < Number(runs); i++) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let jsBytes = 0;
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r === 'Script') jsBytes += e.encodedDataLength; });
  const reqs = new Map();
  cdp.on('Network.responseReceived', (e) => reqs.set(e.requestId, e.type));
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByText(selectorText, { exact: false }).first().waitFor({ timeout: 60000 });
  const visible = Date.now() - t0;
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => new Promise((res) => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
    new PerformanceObserver((l) => { const e = l.getEntries(); res({ fcp, lcp: e[e.length - 1].startTime }); }).observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => res({ fcp, lcp: null }), 500);
  }));
  results.push({ visible, fcp: Math.round(m.fcp ?? -1), lcp: Math.round(m.lcp ?? -1), jsKB: Math.round(jsBytes / 1024) });
  await ctx.close();
}
await browser.close();
console.log(url, JSON.stringify(results));
