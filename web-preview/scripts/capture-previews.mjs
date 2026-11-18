import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', '..', 'docs', 'previews');
fs.mkdirSync(outDir, { recursive: true });
const base = 'http://127.0.0.1:3000';

async function post(page, apiPath, body) {
  await page.evaluate(
    async ({ apiPath, body }) => {
      await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
    },
    { apiPath, body }
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(base, { waitUntil: 'networkidle' });

await post(page, '/api/navigate', { screen: 'profiles' });
await page.screenshot({ path: path.join(outDir, '01-profiles.png') });

await post(page, '/api/sources/load-demo-showcase', {});
await post(page, '/api/profile/select', { profileId: 'profile_alex' });
await page.screenshot({ path: path.join(outDir, '02-hub.png') });

await post(page, '/api/navigate', { screen: 'films' });
await page.screenshot({ path: path.join(outDir, '03-films.png') });

const metrics = await page.evaluate(() => {
  const screen = document.querySelector('.catalog-page');
  const hero = document.querySelector('.billboard');
  const poster = document.querySelector('.poster');
  const rails = document.querySelector('.rails');
  const body = getComputedStyle(document.body);
  const railsCs = rails ? getComputedStyle(rails) : null;
  return {
    viewportH: window.innerHeight,
    heroH: hero?.getBoundingClientRect().height || 0,
    heroPct: hero ? (hero.getBoundingClientRect().height / window.innerHeight) * 100 : 0,
    posterW: poster?.getBoundingClientRect().width || 0,
    posterH: poster?.getBoundingClientRect().height || 0,
    bodyOverflow: body.overflow,
    screenOverflowY: screen ? getComputedStyle(screen).overflowY : null,
    railsOverflow: railsCs?.overflow,
    railsOverflowY: railsCs?.overflowY,
    scrollHeight: screen?.scrollHeight || 0,
    clientHeight: screen?.clientHeight || 0,
    firstRailVisible: (() => {
      const t = document.querySelector('.rail-title');
      if (!t) return false;
      const r = t.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    })()
  };
});
console.log('METRICS', JSON.stringify(metrics, null, 2));

await page.evaluate(() => {
  const screen = document.querySelector('.catalog-page');
  if (screen) screen.scrollTop = screen.scrollHeight;
});
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(outDir, '03b-films-scrolled.png') });

await page.evaluate(() => {
  const screen = document.querySelector('.catalog-page');
  if (screen) screen.scrollTop = 0;
});
await page.waitForTimeout(200);

const detailId = await page.evaluate(async () => {
  const s = await (await fetch('/api/state')).json();
  return s.films.hero?.id || s.films.rows?.[0]?.items?.[0]?.id;
});
await post(page, '/api/navigate', { detailId });
await page.screenshot({ path: path.join(outDir, '04-film-detail.png') });

await post(page, '/api/navigate', { screen: 'series' });
await page.screenshot({ path: path.join(outDir, '05-series.png') });

const seriesId = await page.evaluate(async () => {
  const s = await (await fetch('/api/state')).json();
  return s.series.rows?.flatMap((r) => r.items)?.[0]?.id;
});
await post(page, '/api/navigate', { detailId: seriesId });
await page.screenshot({ path: path.join(outDir, '06-series-detail.png') });
await page.evaluate(() => {
  const screen = document.querySelector('.detail');
  const body = document.querySelector('.detail-body');
  if (screen && body) screen.scrollTop = Math.max(0, body.offsetTop - 40);
});
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(outDir, '06b-series-episodes.png') });

const ok =
  metrics.heroPct >= 30 &&
  metrics.heroPct <= 48 &&
  metrics.posterW >= 175 &&
  metrics.posterW <= 235 &&
  metrics.railsOverflowY === 'visible' &&
  metrics.screenOverflowY === 'auto' &&
  metrics.firstRailVisible &&
  metrics.scrollHeight > metrics.clientHeight;

console.log(ok ? 'VALIDATION_OK' : 'VALIDATION_WARN', { ok });
fs.writeFileSync(path.join(outDir, 'catalog-metrics.json'), JSON.stringify({ metrics, ok }, null, 2));

await browser.close();
