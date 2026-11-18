import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'captures', 'player-v3');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const p = page.locator('[data-action=select-profile]').first();
if (await p.count()) {
  await p.click();
  await page.waitForTimeout(800);
}

await page.evaluate(async () => {
  await fetch('/api/navigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ screen: 'tv' })
  });
});

const st = await page.evaluate(async () => {
  const s = await (await fetch('/api/state')).json();
  const ch = s.live?.channels?.items?.[0] || null;
  return { screen: s.screen, ch };
});
console.log('pre', { screen: st.screen, ch: st.ch?.title, streamId: st.ch?.streamId });

if (!st.ch?.streamId) {
  await page.evaluate(async () => {
    await fetch('/api/live/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: '__all__', offset: 0 })
    });
  });
}

const ch = await page.evaluate(async () => {
  const s = await (await fetch('/api/state')).json();
  return s.live?.channels?.items?.[0] || null;
});

if (ch?.streamId) {
  await page.evaluate(async (channel) => {
    await fetch('/api/player/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        streamId: channel.streamId,
        fromLive: 1,
        channelId: channel.id,
        returnScreen: 'tv'
      })
    });
  }, ch);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2800);
}

await page.screenshot({ path: join(out, '05-app-live-loading.png') });
const info = {
  hasV3: await page.locator('.player-v3').count(),
  mode: await page.locator('.player-v3').getAttribute('data-mode'),
  playClass: await page.locator('#playerPlayBtn').getAttribute('class'),
  screen: await page.evaluate(async () => (await (await fetch('/api/state')).json()).screen)
};
console.log(info);

if (info.hasV3) {
  const toggle = page.locator('[data-action=player-channels-toggle]').first();
  if (await toggle.count()) {
    await toggle.click();
    await page.waitForTimeout(450);
    await page.screenshot({ path: join(out, '06-app-channels-drawer.png') });
  }
}

await browser.close();
