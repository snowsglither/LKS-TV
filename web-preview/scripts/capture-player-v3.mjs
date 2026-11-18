/**
 * Visual compare: Ultra Premium V3 reference HTML vs live LKS TV player chrome.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, '..', 'docs', 'captures', 'player-v3');
const refPath = 'C:\\Users\\ruben\\Downloads\\LKS_TV_Player_Ultra_Premium_V3.html';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

// Reference HTML
await page.goto(pathToFileURL(refPath).href, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);
await page.screenshot({ path: join(out, '00-reference-film.png') });
await page.selectOption('#mode', 'series');
await page.waitForTimeout(200);
await page.screenshot({ path: join(out, '00-reference-series.png') });
await page.selectOption('#mode', 'live');
await page.waitForTimeout(200);
await page.screenshot({ path: join(out, '00-reference-live.png') });

// Live app
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const profile = page.locator('[data-action=select-profile]').first();
if (await profile.count()) {
  await profile.click();
  await page.waitForTimeout(900);
}

// Prefer Continuer / first playable card
const playBtn = page.locator('[data-action=play]').first();
if (await playBtn.count()) {
  await playBtn.click();
} else {
  // Open first detail then play
  const card = page.locator('[data-action=open-detail]').first();
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(700);
    const detailPlay = page.locator('[data-action=play]').first();
    if (await detailPlay.count()) await detailPlay.click();
  }
}
await page.waitForTimeout(2500);
await page.screenshot({ path: join(out, '01-app-player.png') });

const hasV3 = await page.locator('.player-v3').count();
const hasMovix = await page.locator('.player-screen--movix').count();
const structure = await page.evaluate(() => {
  const root = document.querySelector('.player-v3');
  if (!root) return { ok: false };
  return {
    ok: true,
    top: !!root.querySelector('.top'),
    center: !!root.querySelector('.center'),
    play: !!root.querySelector('.play'),
    bottom: !!root.querySelector('.bottom'),
    progress: !!root.querySelector('.progress'),
    drawer: root.querySelectorAll('.drawer').length,
    movixLeft: !!document.querySelector('.player-screen--movix')
  };
});
console.log(JSON.stringify({ hasV3, hasMovix, structure, out }, null, 2));

// Episodes drawer if series
const epToggle = page.locator('[data-action=player-episodes-toggle]').first();
if (await epToggle.count()) {
  await epToggle.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, '02-app-episodes-drawer.png') });
}

// Live path
await page.evaluate(async () => {
  await fetch('/api/navigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ screen: 'tv' })
  });
});
await page.waitForTimeout(600);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const livePlay = page.locator('[data-action=play][data-from-live="1"], [data-action=live-channel]').first();
if (await livePlay.count()) {
  await livePlay.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(out, '03-app-live-player.png') });
  const ch = page.locator('[data-action=player-channels-toggle]').first();
  if (await ch.count()) {
    await ch.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, '04-app-channels-drawer.png') });
  }
}

await browser.close();
console.log('captures written to', out);
