import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required']
});
const page = await browser.newPage();
const media = [];
page.on('response', (r) => {
  if (r.url().includes('/api/media/')) {
    media.push({
      status: r.status(),
      ct: r.headers()['content-type'],
      range: r.request().headers().range || null,
      url: r.url().slice(0, 140)
    });
  }
});

await page.goto(BASE, { waitUntil: 'networkidle' });
const p = page.locator('[data-action=select-profile]').first();
if (await p.count()) {
  await p.click();
  await page.waitForTimeout(500);
}
const s = await (await fetch(`${BASE}/api/state`)).json();
await fetch(`${BASE}/api/player/open`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    streamId: s.continueWatching[0].resumeStreamId,
    returnScreen: 'hub'
  })
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(12000);

const info = await page.evaluate(() => {
  const v = document.getElementById('lksVideo');
  return {
    errCode: v.error && v.error.code,
    errMsg: v.error && v.error.message,
    canMp4: v.canPlayType('video/mp4; codecs="avc1.42E01E"'),
    canMp4basic: v.canPlayType('video/mp4'),
    rs: v.readyState,
    ns: v.networkState,
    w: v.videoWidth,
    t: v.currentTime,
    paused: v.paused,
    src: (v.currentSrc || '').slice(0, 120),
    playClass: document.getElementById('playerPlayBtn')?.className,
    disabled: document.getElementById('playerPlayBtn')?.disabled,
    errorShown: document.getElementById('playerError')?.classList.contains('show')
  };
});

console.log(JSON.stringify({ info, media }, null, 2));
await browser.close();
