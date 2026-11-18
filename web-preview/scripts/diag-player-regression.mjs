/**
 * Real playback checks: live HLS, series episode, film VOD, and report engine facts.
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';

async function api(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
  return r.json();
}

async function sample(page, waitMs) {
  await page.waitForTimeout(waitMs);
  return page.evaluate(() => {
    const v = document.getElementById('lksVideo');
    const play = document.getElementById('playerPlayBtn');
    const err = document.getElementById('playerError');
    return {
      hasVideo: !!v,
      srcKind: v?.src?.startsWith('blob:') ? 'blob/hls' : v?.src ? 'url' : 'empty',
      srcLen: (v?.currentSrc || v?.src || '').length,
      readyState: v?.readyState ?? null,
      networkState: v?.networkState ?? null,
      paused: v?.paused ?? null,
      currentTime: Number((v?.currentTime || 0).toFixed(3)),
      duration: Number.isFinite(v?.duration) ? Number(v.duration.toFixed(2)) : null,
      videoWidth: v?.videoWidth ?? 0,
      videoHeight: v?.videoHeight ?? 0,
      mediaError: v?.error?.code ?? null,
      playClass: play?.className || '',
      playDisabled: !!play?.disabled,
      errorShown: !!err?.classList.contains('show'),
      errorText: (err?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160)
    };
  });
}

async function openAndMeasure(page, openBody, label, waitMs = 12000) {
  const opened = await api('/api/player/open', openBody);
  const pl = opened.player || {};
  await page.reload({ waitUntil: 'networkidle' });
  const snap = await sample(page, waitMs);
  const confirmed =
    snap.videoWidth > 0 &&
    !snap.paused &&
    (pl.isLive ? snap.readyState >= 2 : snap.currentTime > 0.05);
  return {
    label,
    title: pl.title,
    uiMode: pl.uiMode,
    mode: pl.mode,
    ext: pl.ext,
    browserLikely: pl.diagnostic?.browserLikely,
    sniff: pl.diagnostic?.sniff,
    playUrlPresent: !!pl.playUrl,
    ...snap,
    engineConfirmed: confirmed
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const profile = page.locator('[data-action=select-profile]').first();
if (await profile.count()) {
  await profile.click();
  await page.waitForTimeout(800);
}

let state = await (await fetch(`${BASE}/api/state`)).json();
const results = [];

// 1) LIVE
await api('/api/navigate', { screen: 'tv' });
await api('/api/live/channels', { groupId: '__all__', offset: 0 });
state = await (await fetch(`${BASE}/api/state`)).json();
const liveCh = state.live?.channels?.items?.find((c) => c.streamId) || state.live?.channels?.items?.[0];
if (liveCh?.streamId) {
  results.push(
    await openAndMeasure(
      page,
      { streamId: liveCh.streamId, fromLive: 1, channelId: liveCh.id, returnScreen: 'tv' },
      'LIVE_HLS',
      12000
    )
  );
}

// 2) SERIES episode from Continuer
state = await (await fetch(`${BASE}/api/state`)).json();
const cont = (state.continueWatching || []).find((c) => c.resumeStreamId);
if (cont?.resumeStreamId) {
  results.push(
    await openAndMeasure(
      page,
      { streamId: cont.resumeStreamId, returnScreen: 'hub' },
      'SERIES_EPISODE',
      14000
    )
  );
}

// 3) FILM — open detail then preferred stream
const film = state.films?.rows?.[0]?.items?.[0];
if (film?.id) {
  const detail = await api('/api/detail', { id: film.id });
  const streamId =
    detail.detail?.selectedVersionId ||
    detail.detail?.versions?.[0]?.streamId ||
    detail.detail?.versions?.[0]?.id;
  if (streamId) {
    results.push(
      await openAndMeasure(page, { streamId, returnScreen: 'detail' }, 'FILM_VOD', 14000)
    );
  } else {
    results.push({ label: 'FILM_VOD', error: 'no streamId on detail', film: film.title });
  }
}

// 4) Explicit MKV if we can find one among a few film opens
let mkvResult = null;
for (const row of (state.films?.rows || []).slice(0, 4)) {
  for (const item of (row.items || []).slice(0, 3)) {
    const detail = await api('/api/detail', { id: item.id });
    const streamId =
      detail.detail?.selectedVersionId ||
      detail.detail?.versions?.[0]?.streamId ||
      detail.detail?.versions?.[0]?.id;
    if (!streamId) continue;
    const opened = await api('/api/player/open', { streamId, returnScreen: 'detail' });
    const pl = opened.player || {};
    if (pl.ext === 'mkv' || pl.mode === 'incompatible' || pl.diagnostic?.sniff?.container === 'mkv') {
      await page.reload({ waitUntil: 'networkidle' });
      const snap = await sample(page, 10000);
      mkvResult = {
        label: 'MKV_INCOMPAT_CANDIDATE',
        title: pl.title,
        mode: pl.mode,
        ext: pl.ext,
        browserLikely: pl.diagnostic?.browserLikely,
        sniff: pl.diagnostic?.sniff,
        playUrlPresent: !!pl.playUrl,
        ...snap,
        // For true MKV we expect attempt then likely error — NOT pre-disabled without try
        attempted: snap.srcKind !== 'empty' || snap.readyState > 0 || snap.networkState > 0 || snap.mediaError != null || snap.errorShown
      };
      break;
    }
  }
  if (mkvResult) break;
}
if (mkvResult) results.push(mkvResult);

console.log(JSON.stringify(results, null, 2));
await browser.close();
