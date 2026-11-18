/**
 * HTTP regression for TASK-005.1 — hits the real server on 127.0.0.1:3000.
 * Reproduces the exact Not Found failure path (POST /api/groups/setup/open).
 * Does NOT wipe .data / profiles / sources.
 */
import assert from 'assert';

const BASE = process.env.LKS_PREVIEW_URL || 'http://127.0.0.1:3000';

async function req(path, body, method) {
  const m = method || (body === undefined ? 'GET' : 'POST');
  const res = await fetch(`${BASE}${path}`, {
    method: m,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-json */
  }
  return { status: res.status, statusText: res.statusText, json, text: text.slice(0, 300) };
}

function fail(msg, detail) {
  console.error('FAIL', msg, detail || '');
  process.exit(1);
}

const state0 = await req('/api/state');
if (state0.status !== 200) fail('GET /api/state', state0);
console.log('OK GET /api/state', state0.status, 'designSystem=', state0.json?.designSystem);

const profileId = state0.json?.activeProfileId || state0.json?.profiles?.[0]?.id;
if (!profileId) fail('no profile in state');

const sel = await req('/api/profile/select', { profileId });
if (sel.status !== 200) fail('POST /api/profile/select', sel);
console.log('OK POST /api/profile/select', sel.status, profileId);

const nav = await req('/api/navigate', { screen: 'series', customizeOpen: false });
if (nav.status !== 200) fail('POST /api/navigate series', nav);
console.log(
  'OK POST /api/navigate series',
  nav.status,
  'groupSetup.open=',
  nav.json?.groupSetup?.open,
  'configured=',
  nav.json?.sectionGroupPrefs?.series?.configured
);

const open = await req('/api/groups/setup/open', { section: 'series', mode: 'manage' });
if (open.status === 404) {
  fail(
    'POST /api/groups/setup/open returned 404 — stale server without TASK-005 routes',
    open.text
  );
}
if (open.status !== 200) fail('POST /api/groups/setup/open', { status: open.status, text: open.text });
const groups = open.json?.groupSetup?.groups || [];
if (!groups.length) {
  fail('groupSetup.groups empty after open — catalogue/groups missing?', {
    groupCount: open.json?.groups?.length,
    catalogTitleCount: open.json?.catalogTitleCount
  });
}
console.log(
  'OK POST /api/groups/setup/open',
  open.status,
  'groups=',
  groups.length,
  'sample=',
  groups[0]?.name
);

const pick = groups.slice(0, Math.min(3, groups.length)).map((g) => g.id);
const save = await req('/api/groups/setup/save', {
  section: 'series',
  selectedGroupIds: pick
});
if (save.status !== 200) fail('POST /api/groups/setup/save', save);
assert.equal(save.json?.groupSetup?.open, false);
assert.equal(save.json?.sectionGroupPrefs?.series?.configured, true);
assert.deepEqual(
  [...(save.json?.sectionGroupPrefs?.series?.selectedGroupIds || [])].sort(),
  [...pick].sort()
);
console.log('OK POST /api/groups/setup/save', save.status, 'selected=', pick.length);

const reopen = await req('/api/navigate', { screen: 'series' });
if (reopen.status !== 200) fail('re-navigate series', reopen);
assert.notEqual(reopen.json?.groupSetup?.open, true);
console.log('OK re-open series without first-visit modal');

const manage = await req('/api/groups/setup/open', { section: 'series', mode: 'manage' });
if (manage.status !== 200) fail('manage open', manage);
assert.equal(manage.json?.groupSetup?.mode, 'manage');
assert.ok((manage.json?.groupSetup?.groups || []).length > 0);
const close = await req('/api/groups/setup/close', {});
if (close.status !== 200) fail('close', close);
console.log('OK manage + close');

for (const section of ['films', 'tv']) {
  const o = await req('/api/groups/setup/open', { section, mode: 'manage' });
  if (o.status !== 200) fail(`open ${section}`, o);
  const ids = (o.json?.groupSetup?.groups || []).slice(0, 2).map((g) => g.id);
  const s = await req('/api/groups/setup/save', { section, selectedGroupIds: ids });
  if (s.status !== 200) fail(`save ${section}`, s);
  console.log(`OK ${section} setup`, 'groups listed=', (o.json?.groupSetup?.groups || []).length);
}

const search = await req('/api/search', { query: 'a', filter: 'series', offset: 0, limit: 12 });
if (search.status !== 200) fail('POST /api/search', search);
console.log('OK POST /api/search', search.status, 'total=', search.json?.search?.result?.total);

const live = await req('/api/live/channels', { groupId: '__all__', offset: 0, limit: 40 });
if (live.status !== 200) fail('POST /api/live/channels', live);
console.log(
  'OK POST /api/live/channels',
  live.status,
  'items=',
  live.json?.live?.channels?.items?.length ?? live.json?.live?.channels?.total
);

const unknown = await req('/api/groups/setup/does-not-exist', {});
if (unknown.status !== 404) fail('expected JSON 404 for unknown route', unknown);
if (!unknown.json?.error) fail('404 must return JSON error body', unknown.text);
console.log('OK unknown API returns JSON 404');

console.log('\nhttp-groups-setup: all passed against', BASE);
