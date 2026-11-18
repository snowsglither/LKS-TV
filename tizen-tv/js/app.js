/**
 * LKS TV — Samsung Tizen Web TV application shell.
 * Native Android APK is separate; this app does not use WebView wrapping.
 */
import {
  loadState,
  saveState,
  addProfile,
  putXtreamSecret,
  getXtreamSecret,
  deleteXtreamSecret,
  defaultPrefs
} from './storage.js';
import { installRemoteHandlers, setBackHandler, focusFirst } from './remote.js';
import {
  runSync,
  validateM3uUrl,
  validateXtream,
  disableDemoSources,
  disableRealSources,
  clearDemoCatalog,
  hasEnabledRealSource
} from './iptv/sync.js';
import { buildDemoShowcaseCatalog, demoProgressSeeds } from './lib/demoCatalog.js';
import { presentRows, toItem, catalogStatus } from './lib/catalog.js';
import { buildSearchIndex, searchCatalog } from './lib/searchEngine.js';
import { buildContinueWatching } from './lib/continueWatching.js';
import { listLiveGroups, listLiveChannels } from './lib/liveCatalog.js';
import { normalizeBaseUrl } from './lib/urlGuard.js';
import { languageDisplayName, preferredLanguageChoices } from './lib/languages.js';
import {
  initPlayerSurface,
  playUrl,
  stop as stopPlayer,
  pause as pausePlayer,
  resume as resumePlayer,
  currentTimeSec,
  durationSec,
  setPlayerCallbacks,
  playerBackend,
  listAudioTracks,
  listSubtitleTracks,
  selectTrack
} from './player/avplay.js';

const root = document.getElementById('app');
let state = loadState();
let ui = {
  screen: state.activeProfileId ? 'hub' : 'splash',
  section: 'films',
  detailId: null,
  seasonIndex: 0,
  searchQuery: '',
  searchHits: [],
  liveGroupId: '__all__',
  message: state.lastSyncMessage || '',
  syncing: false,
  player: null
};
let searchIndex = null;

function prefs() {
  const id = state.activeProfileId;
  if (!id) return defaultPrefs();
  state.prefsByProfile[id] = state.prefsByProfile[id] || defaultPrefs();
  return state.prefsByProfile[id];
}

function toast(msg) {
  ui.message = msg;
  state.lastSyncMessage = msg;
  saveState(state);
  render();
}

function rebuildSearchIndex() {
  searchIndex = buildSearchIndex(state.catalog || { titles: [] });
}

function go(screen, extra = {}) {
  Object.assign(ui, extra, { screen });
  if (screen !== 'player') stopPlayer();
  render();
}

function navigateBack() {
  if (ui.screen === 'player') {
    const ret = ui.player?.returnScreen || 'detail';
    go(ret, { player: null });
    return;
  }
  if (ui.screen === 'detail' || ui.screen === 'search' || ui.screen === 'settings' || ui.screen === 'live') {
    go('hub');
    return;
  }
  if (ui.screen === 'hub' || ui.screen === 'section') {
    state.activeProfileId = null;
    saveState(state);
    go('profiles');
    return;
  }
  if (ui.screen === 'profiles') {
    /* stay */
    return;
  }
  go('profiles');
}

async function ensureDemoOrEmpty() {
  if (hasEnabledRealSource(state.sources)) return;
  const demo = state.sources.find((s) => s.kind === 'DEMO_SHOWCASE');
  if (!demo) {
    /* first launch: no auto demo — user opts in from settings */
    return;
  }
}

function loadDemoShowcase() {
  disableRealSources(state.sources);
  let demo = state.sources.find((s) => s.kind === 'DEMO_SHOWCASE');
  if (!demo) {
    demo = {
      id: 'demo_showcase_ui',
      displayName: 'Démo UI LKS TV',
      kind: 'DEMO_SHOWCASE',
      enabled: true,
      endpoint: ''
    };
    state.sources.push(demo);
  } else demo.enabled = true;
  const cat = buildDemoShowcaseCatalog(demo.id);
  state.catalog = { groups: cat.groups, titles: cat.titles, generatedAtEpochMs: cat.generatedAtEpochMs };
  const seeds = demoProgressSeeds(cat);
  for (const pid of Object.keys(state.prefsByProfile)) {
    const pr = state.prefsByProfile[pid];
    pr.progressByItemId = { ...(pr.progressByItemId || {}), ...seeds };
  }
  rebuildSearchIndex();
  saveState(state);
  toast(`Démo chargée — ${cat.filmCount || 0} films / ${cat.seriesCount || 0} séries (hors IPTV réel)`);
}

async function addXtream({ displayName, serverUrl, username, password }) {
  const endpoint = normalizeBaseUrl(serverUrl, { allowPrivate: true });
  await validateXtream(endpoint, { username, password }, true);
  disableDemoSources(state.sources);
  clearDemoCatalog(state);
  const id = `xtream_${Date.now().toString(36)}`;
  putXtreamSecret(id, username, password);
  state.sources.push({
    id,
    displayName: displayName || 'Xtream',
    kind: 'XTREAM',
    enabled: true,
    endpoint,
    allowPrivateLan: true,
    usernameHint: `${String(username).slice(0, 2)}•••`
  });
  saveState(state);
  toast('Source Xtream validée — DEMO désactivée. Lancez Actualiser.');
}

async function addM3uUrl({ displayName, playlistUrl }) {
  if (/localhost|127\.0\.0\.1/i.test(playlistUrl)) {
    throw new Error('URL localhost refusée sur Tizen (app autonome)');
  }
  const { titleCount } = await validateM3uUrl(playlistUrl, true);
  disableDemoSources(state.sources);
  clearDemoCatalog(state);
  const id = `m3u_url_${Date.now().toString(36)}`;
  state.sources.push({
    id,
    displayName: displayName || 'M3U URL',
    kind: 'M3U_URL',
    enabled: true,
    endpoint: playlistUrl.trim(),
    allowPrivateLan: true
  });
  saveState(state);
  toast(`M3U validée (${titleCount} titres) — DEMO désactivée. Lancez Actualiser.`);
}

async function syncNow() {
  if (ui.syncing) return;
  ui.syncing = true;
  render();
  try {
    const result = await runSync(state, getXtreamSecret, (msg) => {
      ui.message = msg;
      render();
    });
    state.lastSyncError = result.errors?.length ? result.errors.join(' · ') : null;
    rebuildSearchIndex();
    saveState(state);
    toast(result.message);
  } catch (e) {
    state.lastSyncError = e.message || String(e);
    toast(`Échec sync: ${state.lastSyncError}`);
    saveState(state);
  } finally {
    ui.syncing = false;
    render();
  }
}

function openDetail(id) {
  go('detail', { detailId: id, seasonIndex: 0 });
}

function openPlayer(title, opts = {}) {
  const variants = title.variants || [];
  const episode = opts.episode || null;
  let url = opts.url;
  if (!url && episode) {
    url = episode.versions?.[0]?.stream?.playbackUrl;
  }
  if (!url) url = variants[0]?.playbackUrl;
  const p = prefs();
  const resume =
    opts.seekSec ??
    (episode
      ? p.episodePlaybackById?.[episode.id]?.positionMs / 1000
      : p.continueResumeByTitleId?.[title.id]?.positionMs / 1000) ||
    0;
  ui.player = {
    titleId: title.id,
    episodeId: episode?.id || null,
    label: episode
      ? `${title.canonicalTitle} — S${episode.seasonNumber}:E${episode.episodeNumber}`
      : title.canonicalTitle,
    url,
    returnScreen: opts.returnScreen || 'detail',
    seekSec: resume > 5 ? resume : 0
  };
  go('player');
}

function savePlaybackProgress() {
  if (!ui.player || !state.activeProfileId) return;
  const pos = currentTimeSec();
  const dur = durationSec();
  if (dur <= 0 && pos <= 0) return;
  const fraction = dur > 0 ? Math.min(0.999, pos / dur) : 0;
  const p = prefs();
  const titleId = ui.player.titleId;
  const episodeId = ui.player.episodeId;
  if (episodeId) {
    p.progressByEpisodeId[episodeId] = fraction;
    p.episodePlaybackById[episodeId] = {
      key: episodeId,
      episodeId,
      seriesId: titleId,
      fraction,
      positionMs: Math.floor(pos * 1000),
      durationMs: Math.floor(dur * 1000),
      updatedAt: Date.now()
    };
    p.continueActivityById[`ep:${episodeId}`] = Date.now();
  }
  if (titleId) {
    p.progressByItemId[titleId] = fraction;
    p.continueActivityById[titleId] = Date.now();
    if (fraction > 0.02 && fraction < (p.continueCompletedThreshold || 0.95)) {
      p.continueResumeByTitleId[titleId] = {
        episodeId,
        fraction,
        positionMs: Math.floor(pos * 1000),
        durationMs: Math.floor(dur * 1000)
      };
    }
  }
  saveState(state);
}

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}

function renderSplash() {
  root.innerHTML = '';
  root.appendChild(
    el(`<div class="screen splash">
      <div class="brand">LKS TV</div>
      <p class="muted">Samsung Tizen · Android TV séparé</p>
      <button class="chip accent" data-focus data-action="enter">Entrer</button>
    </div>`)
  );
  root.querySelector('[data-action="enter"]').onclick = () => go('profiles');
}

function renderProfiles() {
  const cards = state.profiles
    .map(
      (p, i) =>
        `<button class="profile-card" data-focus data-focus-col="${i}" data-focus-row="0" data-select="${p.id}">
          <span class="avatar" style="background:${cssColor(p.avatarColor)}"></span>
          <span>${escapeHtml(p.name)}</span>
        </button>`
    )
    .join('');
  root.innerHTML = '';
  root.appendChild(
    el(`<div class="screen profiles">
      <div class="brand">LKS TV</div>
      <h1>Qui regarde ?</h1>
      <p class="muted">Profils, favoris et progressions restent sur cet appareil.</p>
      <div class="row">${cards}
        <button class="profile-card add" data-focus data-action="add-profile">+</button>
      </div>
    </div>`)
  );
  root.querySelectorAll('[data-select]').forEach((btn) => {
    btn.onclick = () => {
      state.activeProfileId = btn.getAttribute('data-select');
      saveState(state);
      go('hub');
    };
  });
  root.querySelector('[data-action="add-profile"]').onclick = () => {
    addProfile(state, 'Nouveau');
    render();
  };
}

function renderHub() {
  const p = prefs();
  const preferred = p.preferredLanguage || 'edition:vf';
  const continueItems = buildContinueWatching(
    state.catalog.titles || [],
    p,
    (t, frac) => toItem(t, preferred, frac || 0),
    12
  );
  const status = catalogStatus(
    state.sources?.some((s) => s.enabled),
    state.catalog,
    ui.syncing,
    state.lastSyncError
  );
  root.innerHTML = '';
  root.appendChild(
    el(`<div class="screen hub">
      <header class="top">
        <div class="brand">LKS TV</div>
        <div class="actions">
          <button class="chip" data-focus data-nav="search">Recherche</button>
          <button class="chip" data-focus data-nav="live">Live TV</button>
          <button class="chip" data-focus data-nav="settings">Paramètres</button>
          <button class="chip" data-focus data-action="sync">${ui.syncing ? 'Sync…' : 'Actualiser'}</button>
          <button class="chip" data-focus data-action="profiles">Profils</button>
        </div>
      </header>
      <p class="muted">${escapeHtml(ui.message || status || '')}</p>
      <div class="dest-grid">
        <button class="dest" data-focus data-nav="films">Films</button>
        <button class="dest" data-focus data-nav="series">Séries</button>
        <button class="dest" data-focus data-nav="live">TV en direct</button>
        <button class="dest" data-focus data-nav="library">Ma liste</button>
      </div>
      <h2>Continuer à regarder</h2>
      <div class="rail" id="continue-rail"></div>
    </div>`)
  );
  const rail = root.querySelector('#continue-rail');
  continueItems.forEach((item, i) => {
    const b = el(
      `<button class="poster" data-focus data-focus-row="1" data-focus-col="${i}">
        <span class="title">${escapeHtml(item.title || item.canonicalTitle || item.id)}</span>
        <span class="bar"><i style="width:${Math.round((item.progressFraction || 0) * 100)}%"></i></span>
      </button>`
    );
    b.onclick = () => openDetail(item.id);
    rail.appendChild(b);
  });
  wireNav();
}

function renderSection(kind) {
  const p = prefs();
  const type = kind === 'series' ? 'SERIES' : 'FILM';
  const presented = presentRows(state.catalog, type, p) || { rows: [] };
  const rows = presented.rows || [];
  root.innerHTML = '';
  const body = el(`<div class="screen section">
    <header class="top">
      <button class="chip" data-focus data-action="back">Retour</button>
      <h1>${kind === 'series' ? 'Séries' : 'Films'}</h1>
    </header>
    <p class="muted">${presented.sectionConfigured ? '' : 'Configurez les groupes après sync si le catalogue est vide.'}</p>
    <div id="rows"></div>
  </div>`);
  root.appendChild(body);
  const host = body.querySelector('#rows');
  rows.forEach((row, ri) => {
    const block = el(`<section><h2>${escapeHtml(row.label || row.title || row.key)}</h2><div class="rail"></div></section>`);
    const rail = block.querySelector('.rail');
    (row.items || []).slice(0, 40).forEach((item, ci) => {
      const b = el(
        `<button class="poster" data-focus data-focus-row="${ri}" data-focus-col="${ci}">
          <span class="title">${escapeHtml(item.title || item.canonicalTitle)}</span>
        </button>`
      );
      b.onclick = () => openDetail(item.id);
      rail.appendChild(b);
    });
    host.appendChild(block);
  });
  body.querySelector('[data-action="back"]').onclick = () => go('hub');
}

function renderDetail() {
  const title = (state.catalog.titles || []).find((t) => t.id === ui.detailId);
  if (!title) {
    go('hub');
    return;
  }
  const p = prefs();
  const item = toItem(title, p.preferredLanguage || 'edition:vf', p.progressByItemId?.[title.id] || 0);
  const isSeries = title.type === 'SERIES';
  const seasons = groupSeasons(title);
  const season = seasons[ui.seasonIndex] || seasons[0] || [];
  root.innerHTML = '';
  const screen = el(`<div class="screen detail">
    <header class="top">
      <button class="chip" data-focus data-action="back">Retour</button>
      <button class="chip accent" data-focus data-action="play">Lecture</button>
      <button class="chip" data-focus data-action="fav">${(p.favoriteIds || []).includes(title.id) ? '★ Favori' : '☆ Favori'}</button>
    </header>
    <h1>${escapeHtml(title.canonicalTitle)}</h1>
    <p class="muted">${escapeHtml(title.synopsis || '')}</p>
    <div class="editions" id="editions"></div>
    ${isSeries ? `<div class="season-tabs" id="seasons"></div><div class="episodes" id="episodes"></div>` : ''}
  </div>`);
  root.appendChild(screen);
  screen.querySelector('[data-action="back"]').onclick = () => go('hub');
  screen.querySelector('[data-action="play"]').onclick = () => openPlayer(title);
  screen.querySelector('[data-action="fav"]').onclick = () => {
    const set = new Set(p.favoriteIds || []);
    if (set.has(title.id)) set.delete(title.id);
    else set.add(title.id);
    p.favoriteIds = [...set];
    saveState(state);
    render();
  };
  const ed = screen.querySelector('#editions');
  (title.variants || []).slice(0, 8).forEach((v, i) => {
      const label =
        languageDisplayName(v.languageTag || v.language, { useful: true }) ||
        v.rawTitle ||
        `Édition ${i + 1}`;
    const b = el(`<button class="chip" data-focus>${escapeHtml(label)}</button>`);
    b.onclick = () => openPlayer(title, { url: v.playbackUrl });
    ed.appendChild(b);
  });
  if (isSeries) {
    const tabs = screen.querySelector('#seasons');
    seasons.forEach((_, i) => {
      const b = el(
        `<button class="chip ${i === ui.seasonIndex ? 'accent' : ''}" data-focus>S${i + 1}</button>`
      );
      b.onclick = () => {
        ui.seasonIndex = i;
        render();
      };
      tabs.appendChild(b);
    });
    const epHost = screen.querySelector('#episodes');
    season.forEach((ep, i) => {
      const b = el(
        `<button class="ep" data-focus data-focus-row="${i}" data-focus-col="0">
          <span>${ep.episodeNumber}. ${escapeHtml(ep.title || 'Épisode')}</span>
        </button>`
      );
      b.onclick = () => openPlayer(title, { episode: ep });
      epHost.appendChild(b);
    });
  }
}

function groupSeasons(title) {
  const map = new Map();
  for (const ep of title.episodes || []) {
    const s = ep.seasonNumber || 1;
    if (!map.has(s)) map.set(s, []);
    map.get(s).push(ep);
  }
  return [...map.keys()]
    .sort((a, b) => a - b)
    .map((k) => map.get(k).sort((a, b) => a.episodeNumber - b.episodeNumber));
}

function renderSearch() {
  root.innerHTML = '';
  root.appendChild(
    el(`<div class="screen search">
      <header class="top">
        <button class="chip" data-focus data-action="back">Retour</button>
        <input class="search-input" data-focus id="q" placeholder="Titre, genre…" value="${escapeAttr(ui.searchQuery)}" />
        <button class="chip accent" data-focus data-action="go">Chercher</button>
      </header>
      <div class="rail" id="hits"></div>
    </div>`)
  );
  const run = () => {
    ui.searchQuery = root.querySelector('#q').value || '';
    if (!searchIndex) rebuildSearchIndex();
    const page = searchCatalog({
      index: searchIndex,
      query: ui.searchQuery,
      filter: 'all',
      prefs: prefs(),
      offset: 0,
      limit: 48
    });
    ui.searchHits = page?.items || page?.hits || [];
    const host = root.querySelector('#hits');
    host.innerHTML = '';
    ui.searchHits.forEach((hit, i) => {
      const item = hit.item || hit;
      const b = el(
        `<button class="poster" data-focus data-focus-col="${i}"><span class="title">${escapeHtml(item.title || item.canonicalTitle)}</span></button>`
      );
      b.onclick = () => openDetail(item.id);
      host.appendChild(b);
    });
    focusFirst(root);
  };
  root.querySelector('[data-action="back"]').onclick = () => go('hub');
  root.querySelector('[data-action="go"]').onclick = run;
  root.querySelector('#q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') run();
  });
}

function renderLive() {
  const p = prefs();
  const liveMeta = listLiveGroups(state.catalog, p) || { groups: [], all: { id: '__all__', name: 'Toutes' } };
  const groups = liveMeta.groups || [];
  const channelPage =
    listLiveChannels(state.catalog, p, {
      groupId: ui.liveGroupId || '__all__',
      offset: 0,
      limit: 80
    }) || { items: [] };
  root.innerHTML = '';
  const screen = el(`<div class="screen live">
    <header class="top">
      <button class="chip" data-focus data-action="back">Retour</button>
      <h1>TV en direct</h1>
    </header>
    <div class="live-cols">
      <div class="groups" id="groups"></div>
      <div class="channels" id="channels"></div>
    </div>
  </div>`);
  root.appendChild(screen);
  screen.querySelector('[data-action="back"]').onclick = () => go('hub');
  const gHost = screen.querySelector('#groups');
  const groupButtons = [liveMeta.all || { id: '__all__', name: 'Toutes' }, ...groups];
  groupButtons.forEach((g, i) => {
    const b = el(
      `<button class="chip ${ui.liveGroupId === g.id ? 'accent' : ''}" data-focus data-focus-row="${i}">${escapeHtml(g.name)}</button>`
    );
    b.onclick = () => {
      ui.liveGroupId = g.id;
      render();
    };
    gHost.appendChild(b);
  });
  const cHost = screen.querySelector('#channels');
  (channelPage.items || []).forEach((ch, i) => {
    const b = el(
      `<button class="ep" data-focus data-focus-row="${i}"><span>${escapeHtml(ch.name || ch.title)}</span></button>`
    );
    b.onclick = () => {
      const title = (state.catalog.titles || []).find((t) => t.id === ch.id || t.id === ch.titleId);
      if (title) {
        openPlayer(title, {
          returnScreen: 'live',
          url: title.variants?.[0]?.playbackUrl
        });
      }
    };
    cHost.appendChild(b);
  });
}

function renderLibrary() {
  const p = prefs();
  const ids = [...new Set([...(p.favoriteIds || []), ...(p.watchLaterIds || [])])];
  const items = ids
    .map((id) => (state.catalog.titles || []).find((t) => t.id === id))
    .filter(Boolean);
  root.innerHTML = '';
  const screen = el(`<div class="screen">
    <header class="top">
      <button class="chip" data-focus data-action="back">Retour</button>
      <h1>Ma liste</h1>
    </header>
    <div class="rail" id="rail"></div>
  </div>`);
  root.appendChild(screen);
  screen.querySelector('[data-action="back"]').onclick = () => go('hub');
  const rail = screen.querySelector('#rail');
  items.forEach((t, i) => {
    const b = el(
      `<button class="poster" data-focus data-focus-col="${i}"><span class="title">${escapeHtml(t.canonicalTitle)}</span></button>`
    );
    b.onclick = () => openDetail(t.id);
    rail.appendChild(b);
  });
}

function renderSettings() {
  const p = prefs();
  const sources = state.sources || [];
  const real = hasEnabledRealSource(sources);
  root.innerHTML = '';
  const screen = el(`<div class="screen settings">
    <header class="top">
      <button class="chip" data-focus data-action="back">Retour</button>
      <h1>Paramètres</h1>
    </header>
    <p class="muted">Lecteur: ${playerBackend()} · Titres: ${(state.catalog.titles || []).length}</p>
    <p class="msg">${escapeHtml(ui.message || '')}</p>
    <h2>Sources IPTV</h2>
    <div class="form">
      <input data-focus id="x-name" placeholder="Nom Xtream" />
      <input data-focus id="x-url" placeholder="URL serveur Xtream" />
      <input data-focus id="x-user" placeholder="Identifiant" />
      <input data-focus id="x-pass" type="password" placeholder="Mot de passe" />
      <button class="chip accent" data-focus data-action="add-xtream">Valider Xtream</button>
    </div>
    <div class="form">
      <input data-focus id="m-name" placeholder="Nom M3U" />
      <input data-focus id="m-url" placeholder="URL playlist M3U" />
      <button class="chip accent" data-focus data-action="add-m3u">Valider M3U</button>
    </div>
    <div class="row">
      <button class="chip" data-focus data-action="sync">Actualiser catalogue</button>
      ${
        real
          ? ''
          : '<button class="chip" data-focus data-action="demo">Charger DEMO_SHOWCASE</button>'
      }
    </div>
    <div id="sources"></div>
    <h2>Langues</h2>
    <div class="row" id="langs"></div>
    <h2>À propos</h2>
    <p class="muted">LKS TV Tizen 0.3.0 — mises à jour via Samsung Seller / Smart Hub, pas via APK GitHub.</p>
  </div>`);
  root.appendChild(screen);
  screen.querySelector('[data-action="back"]').onclick = () => go('hub');
  screen.querySelector('[data-action="add-xtream"]').onclick = async () => {
    try {
      await addXtream({
        displayName: screen.querySelector('#x-name').value,
        serverUrl: screen.querySelector('#x-url').value,
        username: screen.querySelector('#x-user').value,
        password: screen.querySelector('#x-pass').value
      });
      screen.querySelector('#x-pass').value = '';
      render();
    } catch (e) {
      toast(e.message || 'Xtream refusé');
    }
  };
  screen.querySelector('[data-action="add-m3u"]').onclick = async () => {
    try {
      await addM3uUrl({
        displayName: screen.querySelector('#m-name').value,
        playlistUrl: screen.querySelector('#m-url').value
      });
      render();
    } catch (e) {
      toast(e.message || 'M3U refusé');
    }
  };
  screen.querySelector('[data-action="sync"]').onclick = () => syncNow();
  const demoBtn = screen.querySelector('[data-action="demo"]');
  if (demoBtn) demoBtn.onclick = () => loadDemoShowcase();
  const sHost = screen.querySelector('#sources');
  sources.forEach((s) => {
    const row = el(
      `<div class="source-row">
        <div><strong>${escapeHtml(s.displayName)}</strong> · ${s.kind} · ${s.enabled ? 'ON' : 'OFF'}
        ${s.lastError ? `<div class="err">${escapeHtml(s.lastError)}</div>` : ''}</div>
        <button class="chip" data-focus data-rm="${s.id}">Supprimer</button>
      </div>`
    );
    row.querySelector('[data-rm]').onclick = () => {
      deleteXtreamSecret(s.id);
      state.sources = state.sources.filter((x) => x.id !== s.id);
      if (!hasEnabledRealSource(state.sources)) {
        toast(
          'Aucune source réelle — la démo ne se réactive pas automatiquement. Utilisez « Charger DEMO_SHOWCASE » si besoin.'
        );
      }
      saveState(state);
      render();
    };
    sHost.appendChild(row);
  });
  const langHost = screen.querySelector('#langs');
  preferredLanguageChoices()
    .slice(0, 8)
    .forEach((choice) => {
      const tag = choice.value;
      const label = choice.label;
      const b = el(
        `<button class="chip ${p.preferredLanguage === tag ? 'accent' : ''}" data-focus>${escapeHtml(label)}</button>`
      );
      b.onclick = () => {
        p.preferredLanguage = tag;
        p.preferredAudioLanguage = tag;
        saveState(state);
        render();
      };
      langHost.appendChild(b);
    });
}

function renderPlayer() {
  const pl = ui.player;
  root.innerHTML = '';
  const screen = el(`<div class="screen player">
    <div id="player-surface" class="player-surface"></div>
    <div class="player-ui">
      <h1>${escapeHtml(pl.label)}</h1>
      <p class="muted" id="player-status">Préparation…</p>
      <div class="row">
        <button class="chip accent" data-focus data-action="pause">Pause</button>
        <button class="chip" data-focus data-action="resume">Lecture</button>
        <button class="chip" data-focus data-action="audio">Audio</button>
        <button class="chip" data-focus data-action="subs">Sous-titres</button>
        <button class="chip" data-focus data-action="back">Retour</button>
      </div>
    </div>
  </div>`);
  root.appendChild(screen);
  const surface = screen.querySelector('#player-surface');
  initPlayerSurface(surface);
  setPlayerCallbacks({
    onError: (msg) => {
      const st = screen.querySelector('#player-status');
      if (st) st.textContent = msg;
    },
    onBuffering: (b) => {
      const st = screen.querySelector('#player-status');
      if (st) st.textContent = b ? 'Buffering…' : 'Lecture';
    }
  });
  playUrl(pl.url, { seekSec: pl.seekSec || 0 });
  screen.querySelector('[data-action="pause"]').onclick = () => pausePlayer();
  screen.querySelector('[data-action="resume"]').onclick = () => resumePlayer();
  screen.querySelector('[data-action="back"]').onclick = () => {
    savePlaybackProgress();
    navigateBack();
  };
  screen.querySelector('[data-action="audio"]').onclick = () => {
    const tracks = listAudioTracks();
    toast(tracks.length ? `Pistes audio: ${tracks.map((t) => t.language).join(', ')}` : 'Pistes audio non exposées');
    if (tracks[0]) selectTrack('AUDIO', tracks[0].index);
  };
  screen.querySelector('[data-action="subs"]').onclick = () => {
    const tracks = listSubtitleTracks();
    toast(tracks.length ? `Sous-titres: ${tracks.map((t) => t.language).join(', ')}` : 'Sous-titres non exposés');
    if (tracks[0]) selectTrack('TEXT', tracks[0].index);
  };
  // periodic progress
  window.clearInterval(window.__lksProgress);
  window.__lksProgress = window.setInterval(() => savePlaybackProgress(), 8000);
}

function wireNav() {
  root.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.onclick = () => {
      const n = btn.getAttribute('data-nav');
      if (n === 'films' || n === 'series') go('section', { section: n });
      else if (n === 'live') go('live');
      else if (n === 'search') go('search');
      else if (n === 'settings') go('settings');
      else if (n === 'library') go('library');
    };
  });
  const sync = root.querySelector('[data-action="sync"]');
  if (sync) sync.onclick = () => syncNow();
  const profiles = root.querySelector('[data-action="profiles"]');
  if (profiles)
    profiles.onclick = () => {
      state.activeProfileId = null;
      saveState(state);
      go('profiles');
    };
}

function render() {
  switch (ui.screen) {
    case 'splash':
      renderSplash();
      break;
    case 'profiles':
      renderProfiles();
      break;
    case 'hub':
      renderHub();
      break;
    case 'section':
      renderSection(ui.section);
      break;
    case 'detail':
      renderDetail();
      break;
    case 'search':
      renderSearch();
      break;
    case 'live':
      renderLive();
      break;
    case 'library':
      renderLibrary();
      break;
    case 'settings':
      renderSettings();
      break;
    case 'player':
      renderPlayer();
      break;
    default:
      renderProfiles();
  }
  focusFirst(root);
}

function cssColor(n) {
  const x = Number(n) >>> 0;
  const r = (x >> 16) & 255;
  const g = (x >> 8) & 255;
  const b = x & 255;
  return `rgb(${r},${g},${b})`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

// Boot
installRemoteHandlers();
setBackHandler(navigateBack);
rebuildSearchIndex();
ensureDemoOrEmpty();
if (!state.activeProfileId) ui.screen = 'splash';
render();

// Export for tests
export const __test = {
  state,
  ui,
  addXtream,
  addM3uUrl,
  loadDemoShowcase,
  hasEnabledRealSource,
  disableDemoSources,
  clearDemoCatalog
};
