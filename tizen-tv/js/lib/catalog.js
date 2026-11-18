/**
 * Thin JS port of IPTV catalog rules for web preview only.
 * Not shared bytecode with Android — see README differences.
 */

import {
  detectLangFromText,
  versionLabel,
  cleanDisplayTitle,
  cleanEpisodeTitle
} from './displayMeta.js';
import { buildContinueWatching } from './continueWatching.js';
import {
  matchesPreferredLanguage,
  normalizeLanguageTag,
  migratePreferredLanguage,
  languageDisplayName
} from './languages.js';

/** Local bundled SVG demo art (see public/demo-art/). Not remote scrapes. */
const DEMO_META = {
  '9001': {
    title: 'Obsidian Night',
    year: 2024,
    synopsis:
      'Dans une métropole plongée dans l’ombre, une agente infiltrée doit choisir entre sa mission et la seule personne qui connaît son vrai nom.',
    genres: ['Thriller', 'Action'],
    durationMinutes: 118,
    posterPath: '/demo-art/obsidian-poster.svg',
    backdropPath: '/demo-art/obsidian-backdrop.svg'
  },
  '9003': {
    title: 'Harbor Lights',
    year: 2023,
    synopsis:
      'Un port oublié, des phares qui clignotent en morse, et un secret enfoui sous la marée — un film noir contemporain.',
    genres: ['Drame', 'Mystère'],
    durationMinutes: 104,
    posterPath: '/demo-art/harbor-poster.svg',
    backdropPath: '/demo-art/harbor-backdrop.svg'
  },
  '9100': {
    title: 'Aurora Station',
    year: 2022,
    synopsis:
      'À bord d’une station orbitale en déclin, l’équipage découvre qu’un signal extraterrestre répond… avec leurs propres souvenirs.',
    genres: ['Science-fiction', 'Drame'],
    durationMinutes: 48,
    posterPath: '/demo-art/aurora-poster.svg',
    backdropPath: '/demo-art/aurora-backdrop.svg'
  }
};

const TITLE_ART = {
  'Goldline Express': { posterPath: '/demo-art/goldline-poster.svg', backdropPath: '/demo-art/generic-backdrop.svg' },
  'Crimson Orbit': { posterPath: '/demo-art/crimson-poster.svg', backdropPath: '/demo-art/generic-backdrop.svg' },
  'Neon Harbor': { posterPath: '/demo-art/neon-poster.svg', backdropPath: '/demo-art/generic-backdrop.svg' },
  'Orbit Kids': { posterPath: '/demo-art/orbit-poster.svg', backdropPath: '/demo-art/generic-backdrop.svg' }
};

export function parseM3u(text, sourceId = 'm3u_sample') {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error('Playlist vide');
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXTINF')) continue;
    const line = lines[i];
    const comma = line.indexOf(',');
    const meta = comma >= 0 ? line.slice(0, comma) : line;
    const title = comma >= 0 ? line.slice(comma + 1).trim() : 'Sans titre';
    const attrs = Object.fromEntries(
      [...meta.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1].toLowerCase(), m[2]])
    );
    const url = lines[i + 1];
    if (!url || url.startsWith('#')) throw new Error(`EXTINF sans URL: ${title}`);
    entries.push({
      title,
      url,
      groupTitle: attrs['group-title'] || 'Sans catégorie',
      tvgId: attrs['tvg-id'] || null,
      tmdbId: attrs['tmdb-id'] || null,
      logo: attrs['tvg-logo'] || attrs['logo'] || null
    });
    i += 1;
  }
  const allowSampleArt = /sample/i.test(sourceId);
  return buildCatalog(entries, sourceId, { allowSampleArt });
}

function detectLang(title, group) {
  const d = detectLangFromText(title, group);
  const tag = normalizeLanguageTag(d.languageTag || d.language || '');
  return {
    language: tag || 'UNKNOWN',
    languageTag: tag,
    confidence: d.confidence || 'UNKNOWN'
  };
}

function parseEpisode(title) {
  const m = title.match(/^(.*?)[\s._-]*S(\d{1,2})E(\d{1,3})\b/i);
  if (!m) return null;
  return {
    seriesTitle: m[1].replace(/\[[^\]]*\]/g, '').trim() || title,
    seasonNumber: Number(m[2]),
    episodeNumber: Number(m[3])
  };
}

function matchKey(entry, sourceId, index, episode) {
  if (entry.tmdbId) return { type: 'PROVIDER_EXTERNAL', value: `tmdb:${entry.tmdbId}` };
  if (episode) {
    return {
      type: 'SOURCE_LOCAL',
      value: `${sourceId}::series::${episode.seriesTitle.toLowerCase()}`
    };
  }
  if (entry.tvgId && /^(tt\d+|\d{3,})$/i.test(entry.tvgId)) {
    return { type: 'PROVIDER_EXTERNAL', value: entry.tvgId };
  }
  return { type: 'SOURCE_LOCAL', value: `${sourceId}::${entry.tvgId || `m3u-${index}`}` };
}

function bucketKey(key) {
  if (key.type === 'SOURCE_LOCAL') return `local:${key.value}`;
  if (key.type === 'TITLE_YEAR') return `title_year:${String(key.value).toLowerCase()}`;
  return `${key.type}:${String(key.value).toLowerCase()}`;
}

function detectGroupKind(groupTitle, episode) {
  if (/serie/i.test(groupTitle) || episode) return 'SERIES';
  if (/\b(live|tv|chaîne|chaine|sport|news|iptv)\b/i.test(groupTitle)) return 'LIVE';
  return 'VOD';
}

/**
 * @param {boolean} allowSampleArt — only for bundled sample playlist (not DEMO_SHOWCASE / not real IPTV)
 */
export function buildCatalog(entries, sourceId, { allowSampleArt = false } = {}) {
  const groupsMap = new Map();
  const incoming = [];
  entries.forEach((entry, index) => {
    const providerGroupId = entry.groupTitle;
    const groupId = `${sourceId}::${providerGroupId}`;
    const episode = parseEpisode(entry.title);
    if (!groupsMap.has(groupId)) {
      const kind = detectGroupKind(entry.groupTitle, episode);
      groupsMap.set(groupId, {
        id: groupId,
        sourceId,
        providerGroupId,
        name: entry.groupTitle.trim() || 'Sans catégorie',
        kind
      });
    }
    const lang = detectLang(entry.title, entry.groupTitle);
    const providerStreamId = entry.tvgId || `m3u-${index}`;
    const stream = {
      id: `${sourceId}::stream::${providerStreamId}`,
      sourceId,
      providerStreamId,
      playbackUrl: entry.url,
      groupId,
      ...lang,
      rawTitle: entry.title
    };
    const key = matchKey(entry, sourceId, index, episode);
    const kind = groupsMap.get(groupId).kind;
    const type = kind === 'SERIES' || episode ? 'SERIES' : kind === 'LIVE' ? 'LIVE' : 'FILM';
    const sampleMeta = allowSampleArt && entry.tmdbId ? DEMO_META[entry.tmdbId] : null;
    const displayTitle =
      sampleMeta?.title ||
      (episode ? episode.seriesTitle : entry.title.replace(/\[[^\]]*\]/g, '').trim());
    const sampleArt = allowSampleArt ? TITLE_ART[displayTitle] || {} : {};
    const realLogo = entry.logo && /^https?:\/\//i.test(entry.logo) ? entry.logo : null;
    incoming.push({
      type,
      title: displayTitle,
      year: sampleMeta?.year || null,
      synopsis: sampleMeta?.synopsis || '',
      genres: sampleMeta?.genres || [],
      durationMinutes: sampleMeta?.durationMinutes || null,
      posterPath: realLogo || sampleMeta?.posterPath || sampleArt.posterPath || null,
      backdropPath: realLogo || sampleMeta?.backdropPath || sampleArt.backdropPath || null,
      matchKey: key,
      variants: episode ? [] : [stream],
      episodes: episode
        ? [
            {
              id: `${key.value}::s${episode.seasonNumber}e${episode.episodeNumber}`,
              seasonNumber: episode.seasonNumber,
              episodeNumber: episode.episodeNumber,
              title: `Épisode ${episode.episodeNumber}`,
              synopsis: `Chapitre ${episode.episodeNumber} de la saison ${episode.seasonNumber}.`,
              durationMinutes: sampleMeta?.durationMinutes || 45,
              versions: [{ stream }],
              thumbPath: realLogo || null
            }
          ]
        : []
    });
  });

  const buckets = new Map();
  for (const item of incoming) {
    const k = bucketKey(item.matchKey);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(item);
  }

  const titles = [...buckets.values()].map((group) => {
    const primary = group[0];
    const cross = group.length > 1 && primary.matchKey.type !== 'SOURCE_LOCAL';
    const id = cross
      ? `logical:${primary.matchKey.type.toLowerCase()}:${primary.matchKey.value.toLowerCase()}`
      : `logical:${primary.matchKey.value}`;
    const episodesMap = new Map();
    for (const g of group) {
      for (const ep of g.episodes || []) {
        const ek = `${ep.seasonNumber}:${ep.episodeNumber}`;
        if (!episodesMap.has(ek)) {
          episodesMap.set(ek, { ...ep, versions: ep.versions ? ep.versions.slice() : [] });
        } else {
          const cur = episodesMap.get(ek);
          const incoming = ep.versions || [];
          for (let vi = 0; vi < incoming.length; vi++) cur.versions.push(incoming[vi]);
        }
      }
    }
    return {
      id,
      type: primary.type,
      canonicalTitle: primary.title,
      year: group.map((g) => g.year).find(Boolean) || null,
      synopsis: group.map((g) => g.synopsis).find((s) => s) || '',
      genres: [...new Set(group.flatMap((g) => g.genres))],
      durationMinutes: group.map((g) => g.durationMinutes).find(Boolean) || null,
      posterPath: group.map((g) => g.posterPath).find(Boolean) || null,
      backdropPath: group.map((g) => g.backdropPath).find(Boolean) || null,
      matchKey: primary.matchKey,
      variants: group.flatMap((g) => g.variants),
      episodes: [...episodesMap.values()].sort(
        (a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber
      ),
      singleSourceOnly: !cross
    };
  });

  return {
    groups: [...groupsMap.values()],
    titles,
    generatedAtEpochMs: Date.now()
  };
}

export function selectPreferred(variants, preferred = 'edition:vf') {
  if (!variants?.length) return null;
  const pref = migratePreferredLanguage(preferred);
  const tagOf = (v) => normalizeLanguageTag(v.languageTag || v.language || '');
  return (
    variants.find((v) => matchesPreferredLanguage(tagOf(v), pref) && v.confidence !== 'UNKNOWN') ||
    variants.find((v) => matchesPreferredLanguage(tagOf(v), pref)) ||
    variants.find((v) => v.confidence === 'KNOWN') ||
    variants[0]
  );
}

/**
 * Present catalog rows for Films/Séries.
 * LIVE is deferred — use liveCatalog.listLiveGroups / listLiveChannels (never ship 20k posters).
 * Does not include a full `items` dump in the payload (rows only + hero).
 */
export function presentRows(catalog, type, prefs, groupNamesById = null) {
  const isLive = type === 'tv' || type === 'LIVE';
  if (isLive) {
    return {
      items: [],
      rows: [],
      hero: null,
      deferred: true,
      note: 'Live TV paginé via /api/live/*'
    };
  }

  const section =
    type === 'films' || type === 'FILM'
      ? 'films'
      : type === 'series' || type === 'SERIES'
        ? 'series'
        : null;
  const sectionCfg = prefs.sectionGroupPrefs?.[section];
  const allowlistMode = !!(sectionCfg && sectionCfg.configured);
  const allowed = allowlistMode
    ? new Set(sectionCfg.selectedGroupIds || [])
    : null;
  const hidden = new Set(prefs.hiddenGroupIds || []);
  const preferred = prefs.preferredLanguage || 'VF';
  const progress = prefs.progressByItemId || {};
  const dismissed = new Set(prefs.dismissedContinueIds || []);
  const typeFilter =
    type === 'films' || type === 'FILM'
      ? (t) => t.type === 'FILM'
      : type === 'series' || type === 'SERIES'
        ? (t) => t.type === 'SERIES'
        : (t) => t.type === type;

  // Index titles by group without mapping every title to a full UI item first.
  // Allowlist (TASK-005): when section is configured, only selected groups pass.
  // Unconfigured → empty catalogue (setup UI owns first visit).
  const titles = catalog.titles || [];
  const filteredTitles = [];
  if (!allowlistMode && section) {
    // nothing until first-visit setup is saved
  } else {
    for (let i = 0; i < titles.length; i++) {
      const t = titles[i];
      if (!typeFilter(t)) continue;
      if ((prefs.hiddenItemIds || []).includes(t.id)) continue;
      const gids = collectGroupIds(t);
      if (allowlistMode) {
        if (!gids.length || !gids.some((g) => allowed.has(g) && !hidden.has(g))) continue;
      } else if (gids.length && gids.every((g) => hidden.has(g))) {
        continue;
      }
      filteredTitles.push(t);
    }
  }

  const nameMap =
    groupNamesById ||
    new Map((catalog.groups || []).map((g) => [g.id, g.name]));

  const toUi = (t) => toItem(t, preferred, progress[t.id] || 0, nameMap);

  const rows = [];
  const visible = prefs.visibleRowIds || ['CONTINUE_WATCHING', 'NEW_RELEASES', 'LIBRARY_SYNCED'];
  // Force Continuer à regarder as the first content rail (Netflix-style), above Catalogue.
  const orderedVisible = [
    'CONTINUE_WATCHING',
    ...visible.filter((id) => id !== 'CONTINUE_WATCHING')
  ];
  for (const rowId of orderedVisible) {
    if (rowId === 'CONTINUE_WATCHING') {
      // Continuer ignores section allowlist so films/series with real progress
      // still appear on the hub even if the section catalogue is empty/unconfigured.
      const continuePool = [];
      for (let i = 0; i < titles.length; i++) {
        const t = titles[i];
        if (!typeFilter(t)) continue;
        if ((prefs.hiddenItemIds || []).includes(t.id)) continue;
        continuePool.push(t);
      }
      const cont = buildContinueWatching(
        continuePool,
        prefs,
        (t, frac) => toItem(t, preferred, frac, nameMap),
        24
      );
      if (cont.length) {
        rows.unshift({
          key: 'row_continue',
          label: 'Continuer à regarder',
          items: cont,
          showsProgress: true,
          continueRow: true
        });
      }
    } else if (rowId === 'NEW_RELEASES') {
      const withYear = filteredTitles.filter((t) => t.year > 0).sort((a, b) => b.year - a.year).slice(0, 24);
      if (withYear.length) {
        rows.push({ key: 'row_new', label: 'Nouveautés', items: withYear.map(toUi) });
      }
    } else if (rowId === 'LIBRARY_SYNCED') {
      rows.push({
        key: 'row_all',
        label: 'Catalogue synchronisé',
        items: filteredTitles.slice(0, 48).map(toUi)
      });
    }
  }

  const PER_GROUP_CAP = 48;
  const MAX_GROUP_ROWS = 60;
  let groupRows = 0;
  const byGroup = new Map();
  for (let i = 0; i < filteredTitles.length; i++) {
    const t = filteredTitles[i];
    for (const gid of collectGroupIds(t)) {
      if (hidden.has(gid)) continue;
      if (allowed && !allowed.has(gid)) continue;
      let arr = byGroup.get(gid);
      if (!arr) {
        arr = [];
        byGroup.set(gid, arr);
      }
      if (arr.length < PER_GROUP_CAP) arr.push(t);
    }
  }
  for (const group of catalog.groups || []) {
    if (hidden.has(group.id)) continue;
    if (allowed && !allowed.has(group.id)) continue;
    if ((type === 'series' || type === 'SERIES') && group.kind !== 'SERIES' && group.kind !== 'UNKNOWN') continue;
    if ((type === 'films' || type === 'FILM') && (group.kind === 'SERIES' || group.kind === 'LIVE')) continue;
    const inGroup = byGroup.get(group.id);
    if (!inGroup?.length) continue;
    rows.push({
      key: `group:${group.id}`,
      label: group.name,
      items: inGroup.map(toUi)
    });
    groupRows += 1;
    if (groupRows >= MAX_GROUP_ROWS) break;
  }

  let heroTitle =
    filteredTitles.find((t) => (progress[t.id] || 0) > 0 && !dismissed.has(t.id)) || null;
  if (!heroTitle) {
    let best = null;
    for (let i = 0; i < filteredTitles.length; i++) {
      const t = filteredTitles[i];
      if (!best || (t.year || 0) > (best.year || 0)) best = t;
    }
    heroTitle = best;
  }
  return {
    items: [],
    rows,
    hero: heroTitle ? toUi(heroTitle) : null,
    titleCount: filteredTitles.length,
    sectionConfigured: allowlistMode,
    selectedGroupCount: allowlistMode ? allowed.size : 0
  };
}

function collectGroupIds(title) {
  const ids = new Set();
  for (const v of title.variants || []) if (v.groupId) ids.add(v.groupId);
  for (const ep of title.episodes || []) {
    for (const ver of ep.versions || []) if (ver.stream?.groupId) ids.add(ver.stream.groupId);
  }
  return [...ids];
}

export function toItem(title, preferred, progressFraction = 0, groupNamesById = null) {
  const variantPool =
    title.variants.length > 0
      ? title.variants
      : title.episodes.flatMap((ep) => ep.versions.map((v) => v.stream));
  const unique = [...new Map(variantPool.map((v) => [v.id, v])).values()];
  const versions = unique.map((v, index) => {
    const tag = normalizeLanguageTag(v.languageTag || v.language || '');
    const detected =
      tag ||
      (() => {
        const d = detectLangFromText(v.rawTitle || '', groupNamesById?.get?.(v.groupId) || '');
        return normalizeLanguageTag(d.languageTag || d.language || '');
      })();
    return {
      id: v.id,
      label: versionLabel(
        { ...v, language: detected || v.language, languageTag: detected },
        {
          index,
          total: unique.length,
          groupNamesById
        }
      ),
      language: detected || v.language || 'UNKNOWN',
      languageTag: detected || '',
      languageLabel: detected
        ? languageDisplayName(detected, { useful: false })
        : '',
      confidence: v.confidence,
      groupId: v.groupId
    };
  });
  const selected = selectPreferred(variantPool, preferred);
  const groupIds = [...new Set(variantPool.map((v) => v.groupId))];
  const hash = Math.abs(hashCode(title.id));
  const seasonsMap = {};
  for (const ep of title.episodes || []) {
    if (!seasonsMap[ep.seasonNumber]) {
      seasonsMap[ep.seasonNumber] = {
        number: ep.seasonNumber,
        title: `Saison ${ep.seasonNumber}`,
        episodes: []
      };
    }
    const epVersions = ep.versions || [];
    seasonsMap[ep.seasonNumber].episodes.push({
      id: ep.id,
      number: ep.episodeNumber,
      title: cleanEpisodeTitle(ep.title, ep.seasonNumber, ep.episodeNumber),
      rawTitle: ep.title,
      synopsis: ep.synopsis || '',
      durationMinutes: ep.durationMinutes || null,
      progressFraction: 0,
      versions: epVersions.map((ver, index) => ({
        id: ver.stream.id,
        label: versionLabel(ver.stream, {
          index,
          total: epVersions.length,
          groupNamesById
        })
      }))
    });
  }
  return {
    id: title.id,
    title: cleanDisplayTitle(title.canonicalTitle),
    rawTitle: title.canonicalTitle,
    synopsis: title.synopsis || 'Aucune synopsis fournie par la source.',
    genres: title.genres,
    year: title.year || 0,
    durationMinutes: title.durationMinutes || null,
    type: title.type,
    posterColor: `#${((0x1b2430 + (hash % 0x404040)) >>> 0).toString(16).padStart(6, '0').slice(-6)}`,
    backdropColor: `#${((0x080c12 + (hash % 0x303030)) >>> 0).toString(16).padStart(6, '0').slice(-6)}`,
    posterUrl: title.posterPath || null,
    backdropUrl: title.backdropPath || null,
    hasArtwork: !!(title.posterPath || title.backdropPath),
    progressFraction,
    groupIds,
    versions,
    selectedVersionId: selected?.id || versions[0]?.id || null,
    hasUnknownLanguageVersion: versions.some(
      (v) => !v.languageTag && (v.language === 'UNKNOWN' || v.confidence === 'UNKNOWN')
    ),
    trustedMerge: title.matchKey.type !== 'SOURCE_LOCAL' && !title.singleSourceOnly,
    seasons: Object.values(seasonsMap).sort((a, b) => a.number - b.number)
  };
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export function catalogStatus(hasEnabledSources, catalog, syncing, syncError) {
  if (syncing) return 'LOADING';
  if (syncError && !catalog.titles.length) return 'ERROR';
  if (!hasEnabledSources && !catalog.titles.length) return 'EMPTY_NO_SOURCES';
  if (!catalog.titles.length) return 'EMPTY_NO_CONTENT';
  return 'READY';
}
