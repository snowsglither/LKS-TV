/**
 * In-memory Live TV index — built once per catalog generation.
 * Avoids O(n) full scans + full sorts on every group change.
 */

import { cleanDisplayTitle } from './displayMeta.js';

let cache = { gen: -1, index: null };

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function invalidateLiveIndex() {
  cache = { gen: -1, index: null };
}

export function getLiveIndex(catalog) {
  const gen = catalog?.generatedAtEpochMs || 0;
  if (cache.index && cache.gen === gen) return cache.index;

  const titles = catalog?.titles || [];
  const groupsById = new Map((catalog?.groups || []).map((g) => [g.id, g]));
  const liveEntries = [];
  const byGroup = new Map();

  for (let i = 0; i < titles.length; i++) {
    const t = titles[i];
    if (t.type !== 'LIVE') continue;
    const groupIds = [
      ...new Set((t.variants || []).map((v) => v.groupId).filter(Boolean))
    ];
    const v = (t.variants || [])[0];
    const display = cleanDisplayTitle(t.canonicalTitle);
    const entry = {
      id: t.id,
      title: display,
      titleNorm: norm(display),
      rawTitle: t.canonicalTitle,
      logoUrl: t.posterPath || null,
      groupId: v?.groupId || groupIds[0] || null,
      groupIds,
      streamId: v?.id || null,
      sortKey: norm(display)
    };
    const idx = liveEntries.length;
    liveEntries.push(entry);
    for (const gid of groupIds) {
      let arr = byGroup.get(gid);
      if (!arr) {
        arr = [];
        byGroup.set(gid, arr);
      }
      arr.push(idx);
    }
  }

  // Sort global + per-group index lists once
  const order = liveEntries.map((_, i) => i).sort((a, b) =>
    liveEntries[a].sortKey.localeCompare(liveEntries[b].sortKey)
  );
  for (const [gid, arr] of byGroup) {
    arr.sort((a, b) => liveEntries[a].sortKey.localeCompare(liveEntries[b].sortKey));
    byGroup.set(gid, arr);
  }

  const groups = [];
  for (const g of catalog?.groups || []) {
    if (g.kind !== 'LIVE' && g.kind !== 'UNKNOWN') continue;
    const count = byGroup.get(g.id)?.length || 0;
    if (!count) continue;
    groups.push({
      id: g.id,
      name: g.name,
      kind: g.kind,
      sourceId: g.sourceId,
      count
    });
  }
  groups.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const index = {
    gen,
    liveEntries,
    order,
    byGroup,
    groups,
    groupsById,
    totalChannels: liveEntries.length
  };
  cache = { gen, index };
  return index;
}

function tvAllowSet(prefs) {
  const cfg = prefs.sectionGroupPrefs?.tv;
  if (!cfg?.configured) return { mode: 'unconfigured', set: new Set() };
  const hidden = new Set(prefs.hiddenGroupIds || []);
  const set = new Set();
  for (const id of cfg.selectedGroupIds || []) {
    if (!hidden.has(id)) set.add(id);
  }
  return { mode: 'allow', set };
}

function liveEntryAllowed(e, hiddenItems, hiddenGroups, allow) {
  if (hiddenItems.has(e.id)) return false;
  if (allow.mode === 'unconfigured') return false;
  if (!e.groupIds.length) return false;
  if (allow.mode === 'allow') {
    return e.groupIds.some((g) => allow.set.has(g));
  }
  return !e.groupIds.every((g) => hiddenGroups.has(g));
}

export function listLiveGroupsFromIndex(index, prefs = {}) {
  const hiddenItems = new Set(prefs.hiddenItemIds || []);
  const hiddenGroups = new Set(prefs.hiddenGroupIds || []);
  const favoriteIds = new Set(prefs.favoriteIds || []);
  const allow = tvAllowSet(prefs);

  let visibleTotal = 0;
  const counts = new Map();
  for (const e of index.liveEntries) {
    if (!liveEntryAllowed(e, hiddenItems, hiddenGroups, allow)) continue;
    visibleTotal += 1;
    for (const gid of e.groupIds) {
      if (hiddenGroups.has(gid)) continue;
      if (allow.mode === 'allow' && !allow.set.has(gid)) continue;
      counts.set(gid, (counts.get(gid) || 0) + 1);
    }
  }

  const groups = [];
  for (const g of index.groups) {
    if (hiddenGroups.has(g.id)) continue;
    if (allow.mode === 'allow' && !allow.set.has(g.id)) continue;
    if (allow.mode === 'unconfigured') continue;
    const count = counts.get(g.id) || 0;
    if (!count) continue;
    groups.push({ ...g, count });
  }

  let favCount = 0;
  for (const id of favoriteIds) {
    const e = index.liveEntries.find((x) => x.id === id);
    if (e && liveEntryAllowed(e, hiddenItems, hiddenGroups, allow)) favCount += 1;
  }

  return {
    totalChannels: visibleTotal,
    groups,
    favorites: { id: '__favorites__', name: 'Favoris', count: favCount },
    all: { id: '__all__', name: 'Toutes les chaînes', count: visibleTotal },
    sectionConfigured: allow.mode === 'allow',
    selectedGroupCount: allow.set.size
  };
}

export function listLiveChannelsFromIndex(index, prefs = {}, opts = {}) {
  const {
    groupId = '__all__',
    offset = 0,
    limit = 80,
    query = ''
  } = opts;
  const hiddenItems = new Set(prefs.hiddenItemIds || []);
  const hiddenGroups = new Set(prefs.hiddenGroupIds || []);
  const favoriteIds = new Set(prefs.favoriteIds || []);
  const allow = tvAllowSet(prefs);
  const q = norm(query);

  let candidateIdx;
  if (groupId === '__all__') candidateIdx = index.order;
  else if (groupId === '__favorites__') {
    candidateIdx = index.order.filter((i) => favoriteIds.has(index.liveEntries[i].id));
  } else {
    if (allow.mode === 'allow' && !allow.set.has(groupId) && groupId !== '__all__' && groupId !== '__favorites__') {
      candidateIdx = [];
    } else {
      candidateIdx = index.byGroup.get(groupId) || [];
    }
  }

  const matched = [];
  for (let n = 0; n < candidateIdx.length; n++) {
    const e = index.liveEntries[candidateIdx[n]];
    if (!liveEntryAllowed(e, hiddenItems, hiddenGroups, allow)) continue;
    if (q && !e.titleNorm.includes(q)) continue;
    matched.push({
      id: e.id,
      title: e.title,
      rawTitle: e.rawTitle,
      logoUrl: e.logoUrl,
      groupId: e.groupId,
      streamId: e.streamId,
      isFavorite: favoriteIds.has(e.id)
    });
  }

  const total = matched.length;
  const end = Math.min(offset + limit, total);
  return {
    groupId,
    query: q,
    total,
    offset,
    limit,
    items: matched.slice(offset, end),
    hasMore: end < total
  };
}
