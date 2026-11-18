/**
 * Xtream / XMLTV EPG — fetch, parse, cache. Never invents programmes.
 * Short EPG (`get_short_epg`) is often empty; xmltv.php is the reliable source.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertSafeHttpUrl } from './urlGuard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '.data');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const WINDOW_PAST_MS = 3 * 60 * 60 * 1000;
const WINDOW_FUTURE_MS = 9 * 60 * 60 * 1000;

/** @type {Map<string, { at: number, index: object, diagnosis: object }>} */
const memory = new Map();

function normName(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\|[^\|]*\|\s*/g, '')
    .replace(/^(fr|en|es|de|nl|it|pt|ar|be|cafr|us|uk)\s*[-:_.]\s*/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function decodeXmlEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** XMLTV time: 20241118120000 +0000 or 20241118120000 */
export function parseXmltvTime(raw) {
  const m = String(raw || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function cachePath(sourceId) {
  return path.join(dataDir, `epg-index-${sourceId}.json`);
}

function rawPath(sourceId) {
  return path.join(dataDir, `epg-raw-${sourceId}.xml`);
}

/**
 * Stream-parse XMLTV into a compact index for a time window around `now`.
 */
export function parseXmltvBuffer(buf, { now = Date.now() } = {}) {
  const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
  const from = now - WINDOW_PAST_MS;
  const to = now + WINDOW_FUTURE_MS;
  const channels = new Map(); // id -> { id, names: [] }
  const byChannel = new Map(); // id -> programmes[]
  const byName = new Map(); // normName -> channelId

  // Channels
  const chRe =
    /<channel\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/gi;
  let m;
  while ((m = chRe.exec(text))) {
    const id = m[1];
    const names = [...m[2].matchAll(/<display-name[^>]*>([^<]*)<\/display-name>/gi)].map((x) =>
      decodeXmlEntities(x[1]).trim()
    );
    channels.set(id, { id, names });
    for (const n of names) {
      const key = normName(n);
      if (key && !byName.has(key)) byName.set(key, id);
    }
  }

  // Programmes — only keep those overlapping window
  const progRe =
    /<programme\s+([^>]+)>([\s\S]*?)<\/programme>/gi;
  let kept = 0;
  let seen = 0;
  while ((m = progRe.exec(text))) {
    seen++;
    const attrs = m[1];
    const body = m[2];
    const startRaw = /start="([^"]+)"/.exec(attrs)?.[1];
    const stopRaw = /stop="([^"]+)"/.exec(attrs)?.[1];
    const channel = /channel="([^"]+)"/.exec(attrs)?.[1];
    if (!channel || !startRaw) continue;
    const startMs = parseXmltvTime(startRaw);
    const endMs = parseXmltvTime(stopRaw) || (startMs != null ? startMs + 30 * 60 * 1000 : null);
    if (startMs == null || endMs == null) continue;
    if (endMs < from || startMs > to) continue;
    const title =
      decodeXmlEntities(/<title[^>]*>([^<]*)<\/title>/i.exec(body)?.[1] || '').trim() ||
      'Programme';
    const description = decodeXmlEntities(
      /<desc[^>]*>([^<]*)<\/desc>/i.exec(body)?.[1] || ''
    ).trim();
    if (!byChannel.has(channel)) byChannel.set(channel, []);
    byChannel.get(channel).push({
      startMs,
      endMs,
      title,
      description: description.slice(0, 600)
    });
    kept++;
  }

  for (const list of byChannel.values()) {
    list.sort((a, b) => a.startMs - b.startMs);
  }

  return {
    generatedAt: now,
    channelCount: channels.size,
    programmeCount: kept,
    programmesScanned: seen,
    channels: Object.fromEntries(channels),
    programmes: Object.fromEntries(byChannel),
    nameIndex: Object.fromEntries(byName)
  };
}

export async function fetchXmltv(baseUrl, creds, allowPrivate = false) {
  const base = assertSafeHttpUrl(String(baseUrl).replace(/\/$/, ''), { allowPrivate });
  const url = new URL(`${base.origin}${base.pathname.replace(/\/$/, '')}/xmltv.php`);
  url.searchParams.set('username', creds.username);
  url.searchParams.set('password', creds.password);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/xml,text/xml,*/*' },
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`XMLTV HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) throw new Error('XMLTV vide ou trop court');
    const head = buf.toString('utf8', 0, Math.min(200, buf.length)).toLowerCase();
    if (!head.includes('<tv') && !head.includes('<?xml')) {
      throw new Error('Réponse XMLTV non XML');
    }
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureEpgIndex(source, creds, { force = false } = {}) {
  const sourceId = source.id;
  const mem = memory.get(sourceId);
  if (!force && mem && Date.now() - mem.at < CACHE_TTL_MS) {
    return mem;
  }

  const cPath = cachePath(sourceId);
  if (!force && fs.existsSync(cPath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cPath, 'utf8'));
      if (cached?.generatedAt && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
        const entry = {
          at: Date.now(),
          index: cached,
          diagnosis: {
            source: 'cache',
            channelCount: cached.channelCount,
            programmeCount: cached.programmeCount,
            ageMs: Date.now() - cached.generatedAt
          }
        };
        memory.set(sourceId, entry);
        return entry;
      }
    } catch {
      /* rebuild */
    }
  }

  if (!creds) {
    const entry = {
      at: Date.now(),
      index: null,
      diagnosis: {
        source: 'none',
        error: 'Secret Xtream indisponible pour XMLTV',
        channelCount: 0,
        programmeCount: 0
      }
    };
    memory.set(sourceId, entry);
    return entry;
  }

  try {
    const buf = await fetchXmltv(source.endpoint, creds, !!source.allowPrivateLan);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(rawPath(sourceId), buf);
    const index = parseXmltvBuffer(buf);
    fs.writeFileSync(cPath, JSON.stringify(index));
    const entry = {
      at: Date.now(),
      index,
      diagnosis: {
        source: 'xmltv.php',
        channelCount: index.channelCount,
        programmeCount: index.programmeCount,
        bytes: buf.length,
        ageMs: 0
      }
    };
    memory.set(sourceId, entry);
    return entry;
  } catch (e) {
    const entry = {
      at: Date.now(),
      index: null,
      diagnosis: {
        source: 'xmltv.php',
        error: e.message || 'Échec XMLTV',
        channelCount: 0,
        programmeCount: 0
      }
    };
    memory.set(sourceId, entry);
    return entry;
  }
}

export function matchChannelEpgId(index, liveTitle) {
  if (!index?.nameIndex) return null;
  const raw = liveTitle?.canonicalTitle || liveTitle?.title || liveTitle?.rawTitle || '';
  const key = normName(raw);
  if (!key) return null;
  if (index.nameIndex[key]) return index.nameIndex[key];
  // Prefix / containment (careful: require length ≥ 4)
  if (key.length >= 4) {
    for (const [n, id] of Object.entries(index.nameIndex)) {
      if (n.length < 4) continue;
      if (n === key || n.startsWith(key + ' ') || key.startsWith(n + ' ')) return id;
      if (n.includes(key) && key.length >= 6) return id;
      if (key.includes(n) && n.length >= 6) return id;
    }
  }
  return null;
}

export function programmesForChannel(index, epgChannelId, now = Date.now()) {
  const list = index?.programmes?.[epgChannelId] || [];
  return list.filter((p) => p.endMs >= now - 5 * 60 * 1000);
}

export function invalidateEpgMemory(sourceId = null) {
  if (sourceId) memory.delete(sourceId);
  else memory.clear();
}

export { normName };
