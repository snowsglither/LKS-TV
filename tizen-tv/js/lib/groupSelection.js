/**
 * Per-profile, per-section IPTV group allowlist (TASK-005).
 * Stable group ids only — never display provider credentials.
 */

export const GROUP_SECTIONS = ['tv', 'films', 'series'];

export function emptySectionConfig() {
  return { configured: false, selectedGroupIds: [] };
}

export function defaultSectionGroupPrefs() {
  return {
    tv: emptySectionConfig(),
    films: emptySectionConfig(),
    series: emptySectionConfig()
  };
}

/** Non-destructive merge into prefs. */
export function ensureSectionGroupPrefs(prefs) {
  const base = defaultSectionGroupPrefs();
  const incoming = prefs.sectionGroupPrefs || {};
  const out = { ...prefs, sectionGroupPrefs: { ...base } };
  for (const s of GROUP_SECTIONS) {
    const cur = incoming[s] || {};
    out.sectionGroupPrefs[s] = {
      configured: !!cur.configured,
      selectedGroupIds: Array.isArray(cur.selectedGroupIds)
        ? [...new Set(cur.selectedGroupIds.map(String))]
        : []
    };
  }
  return out;
}

export function sectionKindFilter(section) {
  if (section === 'tv') return (g) => g.kind === 'LIVE' || g.kind === 'UNKNOWN';
  if (section === 'films') return (g) => g.kind === 'VOD' || g.kind === 'UNKNOWN';
  if (section === 'series') return (g) => g.kind === 'SERIES' || g.kind === 'UNKNOWN';
  return () => false;
}

export function titleTypeForSection(section) {
  if (section === 'tv') return 'LIVE';
  if (section === 'films') return 'FILM';
  if (section === 'series') return 'SERIES';
  return null;
}

/**
 * Lightweight group list for picker UI (no stream payloads).
 */
export function listSelectableGroups(catalog, section, sources = []) {
  const kindOk = sectionKindFilter(section);
  const sourceLabel = new Map(
    (sources || []).map((s) => [s.id, s.displayName || s.id])
  );
  const counts = new Map();
  const wantType = titleTypeForSection(section);
  for (const t of catalog?.titles || []) {
    if (wantType && t.type !== wantType) continue;
    for (const v of t.variants || []) {
      if (!v.groupId) continue;
      counts.set(v.groupId, (counts.get(v.groupId) || 0) + 1);
    }
    for (const ep of t.episodes || []) {
      for (const ver of ep.versions || []) {
        const gid = ver.stream?.groupId;
        if (gid) counts.set(gid, (counts.get(gid) || 0) + 1);
      }
    }
  }
  const groups = [];
  for (const g of catalog?.groups || []) {
    if (!kindOk(g)) continue;
    const count = counts.get(g.id) || 0;
    if (!count && g.kind === 'UNKNOWN') continue;
    groups.push({
      id: g.id,
      name: g.name,
      kind: g.kind,
      sourceId: g.sourceId,
      sourceLabel: sourceLabel.get(g.sourceId) || g.sourceId || '',
      count
    });
  }
  groups.sort((a, b) => {
    const bySrc = String(a.sourceLabel).localeCompare(String(b.sourceLabel), 'fr');
    if (bySrc) return bySrc;
    return String(a.name).localeCompare(String(b.name), 'fr');
  });
  return groups;
}

export function getSectionConfig(prefs, section) {
  const p = ensureSectionGroupPrefs(prefs);
  return p.sectionGroupPrefs[section] || emptySectionConfig();
}

export function isSectionConfigured(prefs, section) {
  return !!getSectionConfig(prefs, section).configured;
}

/** Allowlist + legacy hiddenGroupIds. Unconfigured → nothing visible. */
export function isGroupAllowedForSection(groupId, section, prefs) {
  if (!groupId) return false;
  if ((prefs.hiddenGroupIds || []).includes(groupId)) return false;
  const cfg = getSectionConfig(prefs, section);
  if (!cfg.configured) return false;
  return cfg.selectedGroupIds.includes(groupId);
}

export function allowedGroupIdSet(prefs, section) {
  const cfg = getSectionConfig(prefs, section);
  if (!cfg.configured) return new Set();
  const hidden = new Set(prefs.hiddenGroupIds || []);
  const out = new Set();
  for (const id of cfg.selectedGroupIds) {
    if (!hidden.has(id)) out.add(id);
  }
  return out;
}

/**
 * Title visible in section if at least one non-hidden selected group matches.
 * Favorites bypass is handled by callers (lists), not here.
 */
export function titleAllowedInSection(title, section, prefs) {
  const allowed = allowedGroupIdSet(prefs, section);
  if (!allowed.size) return false;
  const gids = collectTitleGroupIds(title);
  if (!gids.length) return false;
  return gids.some((g) => allowed.has(g));
}

export function collectTitleGroupIds(title) {
  const ids = new Set();
  for (const v of title.variants || []) if (v.groupId) ids.add(v.groupId);
  for (const ep of title.episodes || []) {
    for (const ver of ep.versions || []) if (ver.stream?.groupId) ids.add(ver.stream.groupId);
  }
  return [...ids];
}

/**
 * After sync: drop selected ids that no longer exist; keep configured flag;
 * never auto-add new groups.
 */
export function pruneSelectedGroups(prefs, catalog) {
  const p = ensureSectionGroupPrefs(prefs);
  const existing = new Set((catalog?.groups || []).map((g) => g.id));
  for (const s of GROUP_SECTIONS) {
    const cfg = p.sectionGroupPrefs[s];
    cfg.selectedGroupIds = cfg.selectedGroupIds.filter((id) => existing.has(id));
  }
  return p;
}

export function sectionNeedsSetup(prefs, catalog, section, hasEnabledSources) {
  if (!hasEnabledSources) return false;
  if (!(catalog?.groups || []).length) return false;
  const selectable = listSelectableGroups(catalog, section);
  if (!selectable.length) return false;
  return !isSectionConfigured(prefs, section);
}

export function setupCopy(section) {
  if (section === 'tv') {
    return {
      title: 'Personnaliser mes chaînes',
      description: 'Choisissez les groupes TV à afficher pour ce profil. Tout est décoché par défaut.'
    };
  }
  if (section === 'films') {
    return {
      title: 'Personnaliser mes films',
      description: 'Choisissez les catégories de films visibles pour ce profil.'
    };
  }
  return {
    title: 'Personnaliser mes séries',
    description: 'Choisissez les catégories de séries visibles pour ce profil.'
  };
}
