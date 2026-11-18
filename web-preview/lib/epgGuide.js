/**
 * Build EPG guide payload from XMLTV index + live catalog channels.
 */
import {
  ensureEpgIndex,
  matchChannelEpgId,
  programmesForChannel
} from './epgXmltv.js';
import { listLiveChannels } from './liveCatalog.js';
import { getXtreamSecret } from './session.js';

function currentAndNext(programmes, now) {
  let current = null;
  let next = null;
  for (const p of programmes) {
    if (p.startMs <= now && p.endMs > now) {
      current = p;
      continue;
    }
    if (p.startMs > now) {
      next = p;
      break;
    }
  }
  return { current, next };
}

function progressFraction(prog, now) {
  if (!prog) return null;
  const dur = prog.endMs - prog.startMs;
  if (!(dur > 0)) return null;
  return Math.max(0, Math.min(1, (now - prog.startMs) / dur));
}

/**
 * @returns {Promise<object>} guide UI model — never invents listings
 */
export async function buildEpgGuide(state, prefs, { groupId = null, offset = 0, limit = 40 } = {}) {
  const now = Date.now();
  const xtreamSources = (state.sources || []).filter((s) => s.kind === 'XTREAM' && s.enabled);
  const diagnosisParts = [];
  let index = null;
  let activeSource = null;
  let epgMeta = null;

  if (!xtreamSources.length) {
    diagnosisParts.push('Aucune source Xtream active — XMLTV indisponible.');
  }

  for (const src of xtreamSources) {
    const creds = getXtreamSecret(src.id);
    const entry = await ensureEpgIndex(src, creds, { force: false });
    diagnosisParts.push(
      `${src.displayName}: ${entry.diagnosis.error || `${entry.diagnosis.programmeCount || 0} programmes / ${entry.diagnosis.channelCount || 0} chaînes EPG`} (${entry.diagnosis.source})`
    );
    if (entry.index?.programmeCount > 0) {
      index = entry.index;
      activeSource = src;
      epgMeta = entry.diagnosis;
      break;
    }
  }

  const livePage = listLiveChannels(state.catalog, prefs, {
    groupId: groupId || state.liveUi?.groupId || '__all__',
    offset,
    limit,
    query: ''
  });

  const hours = [];
  const hourStart = Math.floor(now / 3600000) * 3600000 - 3600000;
  for (let i = 0; i < 6; i++) {
    const t = hourStart + i * 3600000;
    hours.push({
      startMs: t,
      label: new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    });
  }

  const rows = [];
  let matched = 0;
  for (const ch of livePage.items || []) {
    const titleObj = (state.catalog.titles || []).find((t) => t.id === ch.id);
    const epgId = index ? matchChannelEpgId(index, titleObj || ch) : null;
    const programmes = epgId ? programmesForChannel(index, epgId, now) : [];
    if (programmes.length) matched++;
    const { current, next } = currentAndNext(programmes, now);
    rows.push({
      channelId: ch.id,
      title: ch.title,
      logoUrl: ch.logoUrl || null,
      streamId: ch.streamId || null,
      epgChannelId: epgId,
      hasEpg: programmes.length > 0,
      current: current
        ? {
            title: current.title,
            description: current.description || '',
            startMs: current.startMs,
            endMs: current.endMs,
            progress: progressFraction(current, now)
          }
        : null,
      next: next
        ? {
            title: next.title,
            startMs: next.startMs,
            endMs: next.endMs
          }
        : null,
      programmes: programmes.slice(0, 16).map((p) => ({
        title: p.title,
        description: p.description || '',
        startMs: p.startMs,
        endMs: p.endMs,
        isCurrent: !!(current && p.startMs === current.startMs)
      }))
    });
  }

  const hasAny = matched > 0;
  return {
    nowMs: now,
    windowStartMs: hourStart,
    windowEndMs: hourStart + 6 * 3600000,
    hours,
    groupId: livePage.groupId || groupId,
    offset: livePage.offset || offset,
    limit: livePage.limit || limit,
    totalChannels: livePage.total || 0,
    hasMore: !!(livePage.hasMore),
    rows,
    matchedRows: matched,
    hasEpgData: hasAny,
    sourceLabel: activeSource?.displayName || null,
    meta: epgMeta,
    emptyReason: hasAny
      ? null
      : index
        ? 'EPG XMLTV chargé mais aucune correspondance avec les chaînes visibles (noms / ids).'
        : 'Aucun guide EPG exploitable — get_short_epg vide ; XMLTV absent ou sans programmes.',
    diagnosis: diagnosisParts.join(' · ')
  };
}
