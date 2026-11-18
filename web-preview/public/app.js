/**
 * LKS TV cinematic web preview (TASK-004).
 * Keyboard: arrows / Enter / Escape. Mouse supported.
 * Does NOT validate native Compose focus.
 */

let state = null;
let focusables = [];
let focusIndex = 0;
let splashTimer = null;
/** When true, search input owns arrows/typing; Escape exits typing without leaving page. */
let searchTyping = false;
/** Inline UI error (never alert for API failures). */
let uiError = null;
let uiErrorRetry = null;
/** Client draft for group setup (avoids re-shipping selection on every keystroke). */
let groupSetupUi = { search: '', selected: new Set(), syncedFor: null, windowStart: 0 };
const GROUP_SETUP_PAGE = 60;

const appEl = document.getElementById('app');
const bannerEl = document.getElementById('banner');

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail =
      err.error ||
      (res.status === 404
        ? `Route introuvable (${res.status} ${path}). Redémarrez le serveur web-preview.`
        : `Erreur HTTP ${res.status} sur ${path}`);
    const e = new Error(detail);
    e.status = res.status;
    e.path = path;
    e.payload = err;
    throw e;
  }
  return res.json();
}

function showUiError(message, retryFn = null) {
  uiError = String(message || 'Erreur');
  uiErrorRetry = typeof retryFn === 'function' ? retryFn : null;
  render();
}

function clearUiError() {
  uiError = null;
  uiErrorRetry = null;
}

function setState(next) {
  state = next;
  clearUiError();
  document.body.classList.toggle('reduce-motion', !!state?.preferences?.reduceMotion);
  render();
}

function renderUiErrorBanner() {
  if (!uiError) return '';
  return `
    <div class="ui-error-banner" role="alert">
      <div class="ui-error-text">${escapeHtml(uiError)}</div>
      <div class="ui-error-actions">
        ${uiErrorRetry
          ? `<button class="btn primary" data-focus data-action="ui-error-retry">Réessayer</button>`
          : ''}
        <button class="btn ghost" data-focus data-action="ui-error-dismiss">Fermer</button>
      </div>
    </div>`;
}

function navMeta() {
  const focused = focusables[focusIndex];
  return {
    scrollY: window.scrollY || 0,
    focusKey: focused?.dataset?.focusKey || focused?.id || null
  };
}

async function navigate(payload) {
  setState(await api('/api/navigate', { ...navMeta(), ...payload }));
  if (payload?.screen === 'tv' && !state.live?.channels?.items?.length) {
    const gid = state.live?.selectedGroupId || state.live?.groups?.[0]?.id || '__all__';
    setState(await api('/api/live/channels', { groupId: gid, offset: 0 }));
  }
  if (payload?.screen === 'epg' || payload?.action === 'epg') {
    /* loaded via dedicated endpoint */
  }
  restoreUiPosition();
}

async function navigateBack() {
  setState(await api('/api/navigate/back', navMeta()));
  restoreUiPosition();
}

function restoreUiPosition() {
  const restore = state?.uiRestore;
  if (!restore) return;
  requestAnimationFrame(() => {
    if (restore.scrollY > 0) window.scrollTo(0, restore.scrollY);
    registerFocusables();
    if (restore.focusKey) {
      const idx = focusables.findIndex(
        (el) => el.dataset.focusKey === restore.focusKey || el.id === restore.focusKey
      );
      if (idx >= 0) {
        focusIndex = idx;
        applyFocus();
      }
    }
  });
}

function registerFocusables() {
  focusables = [...appEl.querySelectorAll('[data-focus]:not([disabled])')];
  if (!focusables.length) return;
  let restoreEl = null;
  const rk = state?.uiRestore?.focusKey;
  if (rk) {
    try {
      restoreEl =
        appEl.querySelector(`[data-focus-key="${rk.replace(/"/g, '')}"]`) ||
        (rk.match(/^[A-Za-z][\w:-]*$/) ? appEl.querySelector(`#${rk}`) : null);
    } catch {
      restoreEl = null;
    }
  }
  const preferred =
    appEl.querySelector('[data-focus].is-focused') || restoreEl || focusables[0];
  focusIndex = Math.max(0, focusables.indexOf(preferred));
  if (focusIndex < 0) focusIndex = 0;
  applyFocus();
}

function applyFocus() {
  focusables.forEach((el, i) => {
    el.classList.toggle('is-focused', i === focusIndex);
    if (i === focusIndex) {
      el.focus({ preventScroll: false });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  });
}

function moveFocus(dx, dy) {
  if (!focusables.length) return;
  const cur = focusables[focusIndex];
  const cr = cur.getBoundingClientRect();
  const cx = cr.left + cr.width / 2;
  const cy = cr.top + cr.height / 2;
  let best = null;
  let bestScore = Infinity;
  focusables.forEach((el, i) => {
    if (i === focusIndex) return;
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    const ddx = ex - cx;
    const ddy = ey - cy;
    if (dx !== 0 && Math.sign(ddx) !== dx) return;
    if (dy !== 0 && Math.sign(ddy) !== dy) return;
    if (dx !== 0 && Math.abs(ddy) > Math.abs(ddx) * 2.4) return;
    if (dy !== 0 && Math.abs(ddx) > Math.abs(ddy) * 2.4) return;
    const score = Math.hypot(ddx, ddy) + (dx ? Math.abs(ddy) * 0.4 : Math.abs(ddx) * 0.4);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  if (best == null) {
    focusIndex = (focusIndex + (dx + dy > 0 ? 1 : -1) + focusables.length) % focusables.length;
  } else focusIndex = best;
  applyFocus();
}

function activateFocused() {
  const el = focusables[focusIndex];
  if (!el) return;
  if (el.id === 'searchInput' || el.classList?.contains('search-input')) {
    searchTyping = true;
    el.focus();
    if (typeof el.select === 'function') el.select();
    return;
  }
  el.click();
}

function playerOpenBody(extra = {}) {
  const fromLive = extra.fromLive === 1 || extra.fromLive === true || extra.fromLive === '1';
  let returnScreen = extra.returnScreen;
  if (!returnScreen) {
    if (fromLive) returnScreen = 'tv';
    else if (state.screen === 'player') {
      returnScreen = state.player?.returnTo?.screen || (state.detail ? 'detail' : 'hub');
    } else if (state.screen === 'detail' || state.detail) returnScreen = 'detail';
    else returnScreen = state.screen || 'hub';
  }
  return {
    ...extra,
    fromLive: fromLive ? 1 : 0,
    returnScreen
  };
}

function closePlayerPanelsFirst() {
  const eps = document.getElementById('playerEpisodes');
  const ch = document.getElementById('playerChannels');
  const settings = document.getElementById('playerSettings');
  let closed = false;
  for (const el of [eps, ch, settings]) {
    if (el?.classList.contains('open')) {
      el.classList.remove('open');
      closed = true;
    }
  }
  if (closed) {
    playerRuntime?.showControls?.(true);
    return true;
  }
  return false;
}

function setPlayerSettingsTab(tabId) {
  const body = document.querySelector('#playerSettings .drawerbody');
  if (!body) return;
  body.querySelectorAll('.settings-tabs .chip').forEach((c) => {
    c.classList.toggle('selected', c.dataset.id === tabId);
  });
  body.querySelectorAll('.settings-pane').forEach((pane) => {
    pane.hidden = pane.dataset.pane !== tabId;
  });
}

const PV3_SVG = {
  back: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6M9 12h11"/></svg>',
  play: '<path d="m8 5 12 7-12 7z"/>',
  pause: '<path d="M7 5v14M17 5v14"/>',
  skipBack: '<svg viewBox="0 0 24 24"><path d="M4 10V4m0 6h6M4 10a8 8 0 1 1-1 6"/></svg>',
  skipFwd: '<svg viewBox="0 0 24 24"><path d="M20 10V4m0 6h-6m6 0a8 8 0 1 0 1 6"/></svg>',
  volume: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4zM15 9a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12"/></svg>',
  captions: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 12h4m-4 3h5m2-3h5m-5 3h5"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 17h16M9 4v6m6 4v6"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 24"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19"/></svg>',
  episodes: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  channels: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 22h8"/></svg>'
};

function escapeNav() {
  if (!state) return;
  if (searchTyping) {
    searchTyping = false;
    const input = document.getElementById('searchInput');
    input?.blur();
    registerFocusables();
    applyFocus();
    return;
  }
  if (state.screen === 'player') {
    if (closePlayerPanelsFirst()) return;
    closePlayerAndRefresh().then((next) => {
      setState(next);
      restoreUiPosition();
    });
    return;
  }
  navigateBack().catch((err) => showUiError(err.message));
}

function syncGroupSetupDraft() {
  const gs = state?.groupSetup;
  if (!gs?.open) {
    groupSetupUi = { search: '', selected: new Set(), syncedFor: null, windowStart: 0 };
    return;
  }
  const key = `${state.activeProfileId}:${gs.section}:${gs.mode}:${gs.configured ? 1 : 0}`;
  if (groupSetupUi.syncedFor !== key) {
    groupSetupUi = {
      search: '',
      selected: new Set(gs.mode === 'manage' ? gs.selectedGroupIds || [] : []),
      syncedFor: key,
      windowStart: 0
    };
  }
}

function filteredSetupGroups() {
  const groups = state?.groupSetup?.groups || [];
  const q = groupSetupUi.search.trim().toLowerCase();
  if (!q) return groups;
  return groups.filter(
    (g) =>
      String(g.name).toLowerCase().includes(q) ||
      String(g.sourceLabel || '').toLowerCase().includes(q)
  );
}

function renderGroupSetup() {
  const gs = state.groupSetup;
  if (!gs?.open) return '';
  syncGroupSetupDraft();
  const filtered = filteredSetupGroups();
  const total = filtered.length;
  const start = Math.min(groupSetupUi.windowStart, Math.max(0, total - 1));
  const page = filtered.slice(start, start + GROUP_SETUP_PAGE);
  const selectedCount = groupSetupUi.selected.size;
  const filterActive = !!groupSetupUi.search.trim();
  const selectLabel = filterActive ? 'Tout sélectionner (filtrés)' : 'Tout sélectionner';
  const deselectLabel = filterActive ? 'Tout désélectionner (filtrés)' : 'Tout désélectionner';
  const copy = gs.copy || { title: 'Personnaliser', description: '' };

  return `
    <div class="group-setup-root" role="dialog" aria-modal="true">
      <div class="group-setup-backdrop" data-action="group-setup-back"></div>
      <div class="group-setup-panel">
        <header class="group-setup-head">
          <div>
            <p class="group-setup-kicker">${escapeHtml(state.activeProfile?.name || 'Profil')}</p>
            <h2>${escapeHtml(copy.title)}</h2>
            <p class="muted">${escapeHtml(copy.description)}</p>
          </div>
          <div class="group-setup-count" aria-live="polite">${selectedCount} sélectionné${selectedCount === 1 ? '' : 's'}</div>
        </header>
        <div class="group-setup-toolbar">
          <input id="groupSetupSearch" class="group-setup-search" type="search" data-focus
            placeholder="Rechercher un groupe…" value="${escapeAttr(groupSetupUi.search)}"
            autocomplete="off" spellcheck="false" />
          <button class="btn ghost" data-focus data-action="group-select-page">${selectLabel}</button>
          <button class="btn ghost" data-focus data-action="group-deselect-page">${deselectLabel}</button>
        </div>
        <div class="group-setup-list" id="groupSetupList">
          ${start > 0 ? `<button class="btn ghost group-setup-page" data-focus data-action="group-page-up">↑ Précédents (${start})</button>` : ''}
          ${page.map((g) => {
            const on = groupSetupUi.selected.has(g.id);
            return `
              <button class="group-setup-row ${on ? 'is-on' : ''}" data-focus
                data-action="group-toggle" data-id="${escapeAttr(g.id)}"
                aria-pressed="${on ? 'true' : 'false'}">
                <span class="group-setup-check" aria-hidden="true">${on ? '✓' : ''}</span>
                <span class="group-setup-meta">
                  <strong>${escapeHtml(g.name)}</strong>
                  <span class="muted">${escapeHtml(g.sourceLabel || '')}${g.count ? ` · ${g.count}` : ''}</span>
                </span>
              </button>`;
          }).join('') || '<p class="muted" style="padding:16px">Aucun groupe pour ce filtre.</p>'}
          ${start + GROUP_SETUP_PAGE < total
            ? `<button class="btn ghost group-setup-page" data-focus data-action="group-page-down">↓ Suivants (${total - start - page.length})</button>`
            : ''}
        </div>
        <footer class="group-setup-foot">
          <p class="muted group-setup-hint">${total} groupe${total === 1 ? '' : 's'}${filterActive ? ' filtrés' : ''} · page ${Math.floor(start / GROUP_SETUP_PAGE) + 1}</p>
          <div class="actions">
            ${gs.mode === 'manage'
              ? `<button class="btn ghost" data-focus data-action="group-setup-close">Annuler</button>`
              : `<button class="btn ghost" data-focus data-action="nav" data-screen="hub">Plus tard</button>`}
            <button class="btn primary" data-focus data-action="group-setup-save">Enregistrer et continuer</button>
          </div>
        </footer>
      </div>
    </div>`;
}

function sectionEmptyGroups(kind) {
  const pack = kind === 'tv' ? state.live : kind === 'films' ? state.films : state.series;
  const configured = !!pack?.sectionConfigured;
  if (!configured) {
    return `
      <div class="status-box">
        <h2>Choisissez vos groupes</h2>
        <p>Personnalisez les catégories visibles pour ce profil avant d’afficher le catalogue.</p>
        <div class="actions">
          <button class="btn primary" data-focus data-action="group-manage" data-section="${kind}">Choisir mes groupes</button>
        </div>
      </div>`;
  }
  if ((pack.selectedGroupCount || 0) === 0) {
    return `
      <div class="status-box">
        <h2>Aucun groupe sélectionné</h2>
        <p>Le catalogue reste disponible dans « Gérer mes groupes ». Rien n’est affiché tant qu’aucun groupe n’est coché.</p>
        <div class="actions">
          <button class="btn primary" data-focus data-action="group-manage" data-section="${kind}">Choisir mes groupes</button>
        </div>
      </div>`;
  }
  return null;
}

document.addEventListener('keydown', (e) => {
  const tag = e.target?.tagName;
  const isField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  if (isField) {
    if (e.key === 'Escape') {
      e.preventDefault();
      searchTyping = false;
      e.target.blur();
      registerFocusables();
      // Stay on page — do not pop navigation
      return;
    }
    // While typing in search, arrows move caret; Down leaves field toward results
    if (e.target.id === 'searchInput' && e.key === 'ArrowDown') {
      e.preventDefault();
      searchTyping = false;
      e.target.blur();
      registerFocusables();
      const firstResult = focusables.findIndex(
        (el) => el.dataset.action === 'open-detail' || el.dataset.action === 'play' || el.dataset.action === 'search-filter'
      );
      focusIndex = firstResult >= 0 ? firstResult : Math.min(1, focusables.length - 1);
      applyFocus();
      return;
    }
    if (e.key === 'Enter' && e.target.id === 'searchInput') {
      e.preventDefault();
      searchTyping = false;
      e.target.blur();
      api('/api/search', { query: e.target.value, filter: state.search?.filter || 'all', ...navMeta() })
        .then(setState)
        .catch((err) => showUiError(err.message));
      return;
    }
    return;
  }
  if (state?.screen === 'player' && playerRuntime?.video) {
    const v = playerRuntime.video;
    const live = !!state.player?.isLive;
    if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      if (v.paused) v.play().catch(() => {});
      else v.pause();
      playerRuntime.showControls?.();
      return;
    }
    if (!live && (e.key === 'j' || e.key === 'J' || e.key === 'ArrowLeft') && e.shiftKey === false && document.activeElement === appEl) {
      e.preventDefault();
      v.currentTime = Math.max(0, v.currentTime - 10);
      playerRuntime.showControls?.();
      return;
    }
    if (!live && (e.key === 'l' || e.key === 'L') ) {
      e.preventDefault();
      v.currentTime = v.currentTime + 10;
      playerRuntime.showControls?.();
      return;
    }
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      const stage = document.querySelector('.player-stage');
      if (!document.fullscreenElement) stage?.requestFullscreen?.();
      else document.exitFullscreen?.();
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      v.muted = !v.muted;
      const btn = document.getElementById('playerMuteBtn');
      if (btn) btn.textContent = v.muted ? 'Muet' : 'Son';
      return;
    }
  }
  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); moveFocus(-1, 0); break;
    case 'ArrowRight': e.preventDefault(); moveFocus(1, 0); break;
    case 'ArrowUp': e.preventDefault(); moveFocus(0, -1); break;
    case 'ArrowDown': e.preventDefault(); moveFocus(0, 1); break;
    case 'Enter': e.preventDefault(); activateFocused(); break;
    case 'Escape': e.preventDefault(); escapeNav(); break;
    default: break;
  }
});

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

function posterBg(item) {
  if (item.posterUrl) return `url('${escapeAttr(item.posterUrl)}')`;
  return `linear-gradient(160deg, ${item.posterColor || '#1b2430'}, ${item.backdropColor || '#0a0c10'} 70%)`;
}

function billboardBg(item) {
  if (item.backdropUrl) return `url('${escapeAttr(item.backdropUrl)}')`;
  return `radial-gradient(circle at 70% 30%, ${item.backdropColor || '#302028'} 0%, ${item.posterColor || '#12161c'} 45%, #050507 100%)`;
}

function artFallbackClass(item) {
  return item.posterUrl || item.backdropUrl ? '' : 'art-fallback';
}

function statusMessage(status) {
  switch (status) {
    case 'LOADING': return { title: 'Synchronisation…', body: state.syncProgress || 'Chargement du catalogue IPTV.' };
    case 'EMPTY_NO_SOURCES':
      return { title: 'Aucune source', body: 'Paramètres → ajoutez Xtream / M3U, ou « Démo UI » pour le design, puis Actualiser.' };
    case 'EMPTY_NO_CONTENT':
      return { title: 'Catalogue vide', body: 'Sources actives sans titres — vérifiez les groupes masqués par profil.' };
    case 'ERROR':
      return { title: 'Erreur de synchronisation', body: state.lastSyncError || 'Erreur' };
    default: return null;
  }
}

function renderSplash() {
  clearTimeout(splashTimer);
  const reduce = state.preferences?.reduceMotion;
  splashTimer = setTimeout(() => navigate({ screen: 'profiles' }), reduce ? 500 : 2300);
  return `
    <section class="screen splash">
      <div class="splash-logo">LKS <span>TV</span></div>
      <div class="splash-actions">
        <button class="btn ghost" data-focus data-action="skip-splash">Passer</button>
      </div>
    </section>`;
}

function renderProfiles() {
  return `
    <section class="screen profiles">
      <div class="profiles-brand" aria-hidden="true">LKS <span>TV</span></div>
      <h1>Qui regarde ?</h1>
      <p class="sub">Favoris, groupes, historique et progression restent liés à chaque profil.</p>
      <div class="profiles-grid">
        ${(state.profiles || []).map((p, i) => `
          <button class="profile-card ${i === 0 ? 'is-focused' : ''}" data-focus
            data-action="select-profile" data-id="${p.id}">
            <div class="avatar" style="background-color:${p.avatarColor};background-image:url('${p.avatarUrl || ''}')"></div>
            <div class="name">${escapeHtml(p.name)}</div>
          </button>`).join('')}
        <button class="profile-card profile-add" data-focus data-action="add-profile" title="Ajouter un profil">
          <div class="avatar">+</div>
          <div class="name">Ajouter un profil</div>
        </button>
      </div>
      <div class="profiles-manage">
        <button class="btn ghost" data-focus data-action="add-profile">Gérer les profils</button>
      </div>
    </section>`;
}

const SIDE_NAV = [
  { id: 'hub', label: 'Accueil', blurb: 'Votre espace', icon: 'home' },
  { id: 'films', label: 'Films', blurb: 'Cinéma', icon: 'films' },
  { id: 'series', label: 'Séries', blurb: 'Épisodes', icon: 'series' },
  { id: 'tv', label: 'TV', blurb: 'En direct', icon: 'tv' },
  { id: 'search', label: 'Recherche', blurb: 'Explorer', icon: 'search' }
];

const SIDE_NAV_ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/></svg>',
  films: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 3v18M16 3v18M3 8h5m8 0h5M3 16h5m8 0h5"/></svg>',
  series: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M8 4v5M16 4v5M8 13h8M8 16h5"/></svg>',
  tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 2 4 4 4-4M8 11v5m4-7v7m4-4v4"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="5"/></svg>'
};

function navIcon(name) {
  return SIDE_NAV_ICONS[name] || SIDE_NAV_ICONS.home;
}

function renderSideNav(active) {
  const p = state.activeProfile;
  const compact = !!state.sidebarCompact;
  return `
    <aside class="side-nav ${compact ? 'side-nav--compact' : ''}" aria-label="Navigation principale">
      <div class="side-brand">
        <div class="side-logo">L<span>KS</span></div>
        <div class="side-brand-copy">
          <strong>LKS <em>TV</em></strong>
          <small>ENTERTAINMENT</small>
        </div>
      </div>
      <div class="side-divider"></div>
      <div class="side-caption">DÉCOUVRIR</div>
      <nav class="side-nav-list">
        ${SIDE_NAV.map((item) => `
          <button class="side-link ${active === item.id ? 'is-active' : ''}" data-focus
            data-action="${item.id === 'search' ? 'open-search' : 'nav'}" data-screen="${item.id}"
            title="${escapeAttr(item.label)}">
            <span class="side-link-icon" aria-hidden="true">${navIcon(item.icon)}</span>
            <span class="side-link-copy">
              <strong>${escapeHtml(item.label)}</strong>
              <small>${escapeHtml(item.blurb)}</small>
            </span>
            <span class="side-link-arrow">›</span>
          </button>`).join('')}
      </nav>
      <div class="side-bottom">
        <div class="side-divider"></div>
        <div class="side-caption">PERSONNALISER</div>
        <button class="side-link ${active === 'settings' ? 'is-active' : ''}" data-focus
          data-action="nav" data-screen="settings" title="Réglages">
          <span class="side-link-icon" aria-hidden="true">${navIcon('settings')}</span>
          <span class="side-link-copy">
            <strong>Réglages</strong>
            <small>Votre expérience</small>
          </span>
          <span class="side-link-arrow">›</span>
        </button>
        ${p ? `
          <button class="side-account" data-focus data-action="nav" data-screen="profiles">
            <span class="side-account-avatar" style="background-color:${p.avatarColor};background-image:url('${p.avatarUrl || ''}');background-size:cover"></span>
            <span class="side-account-copy">
              <strong>${escapeHtml(p.name)}</strong>
              <small>Profil actif</small>
            </span>
            <span class="side-account-dot"></span>
          </button>` : ''}
      </div>
      <button class="side-collapse" data-focus data-action="toggle-sidebar" title="Réduire le menu">‹</button>
    </aside>`;
}

function renderAppShell(active, trail, bodyHtml, topActions = '') {
  return `
    <div class="app-shell">
      ${renderSideNav(active)}
      <div class="app-main">
        <header class="app-top">
          <div class="app-trail">${trail}</div>
          <div class="app-top-actions">
            ${topActions}
            ${searchBtn()}
            <button class="pill" data-focus data-action="group-manage" data-section="${active === 'tv' ? 'tv' : active === 'series' ? 'series' : 'films'}">Mes groupes</button>
            ${profileChip(true)}
          </div>
        </header>
        <div class="app-scroll">
          ${bodyHtml}
        </div>
      </div>
    </div>`;
}

function hubRailCard(item, wide = false) {
  return `
    <button class="v2-tile ${wide ? 'v2-tile--wide' : ''} ${artFallbackClass(item)}" data-focus
      data-focus-key="hub:${escapeAttr(item.id)}"
      data-action="open-detail" data-id="${escapeAttr(item.id)}"
      style="--art:${posterBg(item)}">
      <span class="v2-tile-poster" style="background-image:${posterBg(item)}"></span>
      ${wide && item.progressFraction > 0 ? `<span class="v2-prog"><i style="width:${Math.round(item.progressFraction * 100)}%"></i></span>` : ''}
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.resumeLabel || item.year || '')}${item.remainingMinutes ? ` · ${item.remainingMinutes} min` : ''}${wide ? ' · Fiche' : ''}</span>
    </button>`;
}

function profileChip(compact = false) {
  const p = state.activeProfile;
  if (!p) return '';
  return `
    <button class="mini-avatar-btn" data-focus data-action="nav" data-screen="profiles" title="Changer de profil">
      <div class="mini-avatar" style="background-color:${p.avatarColor};background-image:url('${p.avatarUrl || ''}');background-size:cover"></div>
      ${compact ? '' : `<span class="muted">${escapeHtml(p.name)}</span>`}
    </button>`;
}

function searchBtn() {
  return `<button class="icon-btn search-trigger" data-focus data-action="open-search" title="Rechercher">⌕</button>`;
}

function continueCardHtml(item, wide = true) {
  return `
    <div class="poster-wrap poster-wrap--continue ${wide ? 'poster-wrap--wide' : ''}">
      <button class="poster ${artFallbackClass(item)}" data-focus data-focus-key="continue:${escapeAttr(item.id)}"
        data-action="open-detail" data-id="${escapeAttr(item.id)}"
        style="background-image:${posterBg(item)}">
        ${item.progressFraction > 0 ? `<span class="prog"><i style="width:${Math.round(item.progressFraction * 100)}%"></i></span>` : ''}
        <span class="t">${escapeHtml(item.title)}</span>
        <span class="y">${item.resumeLabel || item.year || ''}${item.remainingMinutes ? ` · ${item.remainingMinutes} min` : ''}</span>
        <span class="continue-resume">Fiche · Reprendre</span>
      </button>
      <button class="continue-dismiss" data-focus data-action="list" data-list="dismissContinue" data-id="${escapeAttr(item.id)}" title="Retirer">×</button>
    </div>`;
}

function renderHub() {
  const contItems = state.continueWatching?.length
    ? state.continueWatching
    : [
        ...((state.films?.rows || []).find((r) => r.continueRow)?.items || []),
        ...((state.series?.rows || []).find((r) => r.continueRow)?.items || [])
      ].slice(0, 16);
  const hero =
    contItems[0] ||
    state.films?.hero ||
    state.series?.hero ||
    (state.films?.rows || []).flatMap((r) => r.items || []).find((i) => !i.continueRow) ||
    null;
  const discover = [
    ...((state.films?.rows || []).find((r) => r.key === 'row_new' || r.label?.includes('Nouveaut'))?.items || []),
    ...((state.series?.rows || []).find((r) => r.key === 'row_new' || r.label?.includes('Nouveaut'))?.items || []),
    ...((state.films?.rows || []).find((r) => r.key === 'row_all')?.items || []),
    ...((state.series?.rows || []).find((r) => r.key === 'row_all')?.items || [])
  ]
    .filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx)
    .filter((item) => !contItems.some((c) => c.id === item.id))
    .slice(0, 16);
  const catalog = [
    ...((state.films?.rows || []).find((r) => r.key === 'row_all')?.items || []),
    ...((state.series?.rows || []).find((r) => r.key === 'row_all')?.items || [])
  ]
    .filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx)
    .slice(0, 18);
  const body = `
    <section class="screen hub hub--v2">
      <div class="v2-hero" style="${hero ? `--hero-art:${billboardBg(hero)}` : ''}">
        <div class="v2-hero-shade"></div>
        <div class="v2-hero-copy">
          <div class="v2-eyebrow">À la une · LKS TV</div>
          <h1>${hero ? escapeHtml(hero.title) : 'Des histoires qui<br>vous captivent.'}</h1>
          <div class="v2-meta">
            <b>● ${contItems.length ? 'Reprendre' : 'À découvrir'}</b>
            <span>Films · Séries · TV en direct</span>
            ${hero?.year ? `<span>${escapeHtml(String(hero.year))}</span>` : ''}
          </div>
          <p>${hero?.synopsis
            ? escapeHtml(String(hero.synopsis).slice(0, 180))
            : 'Votre univers de divertissement, pensé pour vous. Reprenez là où vous vous êtes arrêté.'}</p>
          <div class="v2-hero-actions">
            ${hero ? `
              <button class="pill primary" data-focus
                data-action="open-detail"
                data-id="${escapeAttr(hero.id)}">▶ ${contItems[0]?.id === hero.id ? 'Ouvrir la fiche' : 'Détails'}</button>
              <button class="pill" data-focus data-action="open-detail" data-id="${escapeAttr(hero.id)}">Fiche</button>` : `
              <button class="pill primary" data-focus data-action="nav" data-screen="series">Explorer les séries</button>
              <button class="pill" data-focus data-action="nav" data-screen="films">Explorer les films</button>`}
          </div>
        </div>
      </div>
      <div class="v2-section">
        <div class="section-head">
          <h2>Continuer à regarder</h2>
          <span class="subtle">${contItems.length ? `Votre progression · Profil ${escapeHtml(state.activeProfile?.name || '')}` : 'Aucun titre commencé'}</span>
        </div>
        <div class="v2-rail">
          ${contItems.length
            ? contItems.map((item) => `
              <div class="v2-continue-wrap">
                ${hubRailCard(item, true)}
                <button class="continue-dismiss" data-focus data-action="list" data-list="dismissContinue" data-id="${escapeAttr(item.id)}" title="Retirer">×</button>
              </div>`).join('')
            : '<p class="muted continue-empty">Regardez un film ou un épisode pour le retrouver ici.</p>'}
        </div>
      </div>
      <div class="v2-section">
        <h2>À découvrir pour vous</h2>
        <div class="v2-rail">
          ${discover.length
            ? discover.map((item) => hubRailCard(item)).join('')
            : '<p class="muted">Synchronisez votre catalogue pour des suggestions.</p>'}
        </div>
      </div>
      <div class="v2-section">
        <h2>Catalogue synchronisé</h2>
        <div class="v2-rail">
          ${catalog.length
            ? catalog.map((item) => hubRailCard(item)).join('')
            : '<p class="muted">Aucun titre visible pour ce profil.</p>'}
        </div>
      </div>
      <div class="v2-feature">
        <div>
          <div class="v2-eyebrow">Personnalisation</div>
          <h3>Votre catalogue, vos choix.</h3>
          <p>Sélectionnez uniquement les groupes IPTV que vous souhaitez voir. Chaque profil possède ses propres préférences.</p>
          <button class="pill" data-focus data-action="group-manage" data-section="films">Gérer les groupes →</button>
        </div>
        <div>
          <div class="v2-eyebrow">Expérience TV</div>
          <h3>Un lecteur. Trois expériences.</h3>
          <p>Films avec reprise, séries avec épisodes, TV en direct avec zapping et liste des chaînes intégrée.</p>
          <button class="pill" data-focus data-action="nav" data-screen="tv">Voir le direct →</button>
        </div>
      </div>
    </section>`;
  return renderAppShell(
    'hub',
    `LKS <span class="brand-em">TV</span>`,
    body,
    `<button class="pill" data-focus data-action="sync">${state.syncing ? 'Sync…' : 'Actualiser'}</button>`
  );
}

function sectionChrome(kind) {
  return `
    <div class="chrome chrome--inline">
      <div class="page-heading page-heading--inline">
        <div class="v2-eyebrow">Bibliothèque</div>
        <h1>${kind === 'films' ? 'Films' : kind === 'series' ? 'Séries' : 'TV'}</h1>
      </div>
      <div class="spacer"></div>
      <button class="pill" data-focus data-action="group-manage" data-section="${kind}">Gérer mes groupes</button>
      <button class="pill" data-focus data-action="customize">Personnaliser</button>
    </div>`;
}

let searchDebounceTimer = null;
let searchRequestId = 0;

function renderSearch() {
  const s = state.search || {};
  const result = s.result;
  const filter = s.filter || 'all';
  const filters = [
    ['all', 'Tout'],
    ['films', 'Films'],
    ['series', 'Séries'],
    ['tv', 'Chaînes TV']
  ];
  const suggestions = s.suggestions || [];
  const items = result?.items || [];
  const total = result?.total || 0;
  const offset = result?.offset || 0;
  const q = s.query || '';

  return renderAppShell('search', 'Recherche', `
    <section class="screen search-screen">
      <div class="chrome chrome--sticky search-chrome">
        <div class="search-field-wrap">
          <span class="search-ico" aria-hidden="true">⌕</span>
          <input id="searchInput" class="search-input" type="search" data-focus data-focus-key="search:input"
            placeholder="Titre, acteur, chaîne… (Entrée pour saisir)"
            value="${escapeAttr(q)}"
            autocomplete="off" spellcheck="false" />
        </div>
      </div>
      <div class="search-filters">
        ${filters.map(([id, lab]) => `
          <button class="chip ${filter === id ? 'selected' : ''}" data-focus data-focus-key="search:filter:${id}"
            data-action="search-filter" data-id="${id}">${lab}</button>`).join('')}
      </div>
      <div class="search-body">
        ${!q.trim() ? `
          <div class="search-idle">
            <p class="muted">Saisissez un titre — catalogue indexé (${state.catalogTitleCount || 0} entrées). Flèches pour atteindre le champ, Entrée pour taper, Échap pour quitter la saisie.</p>
            ${suggestions.length ? `
              <h2>Suggestions</h2>
              <div class="search-grid">
                ${suggestions.map((item) => renderSearchCard(item)).join('')}
              </div>` : ''}
          </div>` : `
          <div class="search-meta muted">
            ${total} résultat${total === 1 ? '' : 's'} pertinent${total === 1 ? '' : 's'}${result?.tookMs != null ? ` · ${result.tookMs} ms` : ''}
            ${state.demoShowcaseActive ? ' · démo UI' : state.realCatalogActive ? ' · IPTV réel' : ''}
          </div>
          ${filter === 'all' && result?.sections && total > 0 ? renderSearchSections(result.sections, items) : `
          <div class="search-grid">
            ${items.map((item) => renderSearchCard(item)).join('') || '<p class="muted">Aucun résultat pour cette recherche.</p>'}
          </div>`}
          ${offset + items.length < total ? `
            <div class="search-more">
              <button class="btn" data-focus data-action="search-more">Charger plus (${offset + items.length}/${total})</button>
            </div>` : ''}
        `}
      </div>
    </section>`);
}

function renderSearchSections(sections, fallbackItems) {
  const blocks = [];
  const push = (title, list) => {
    if (!list?.length) return;
    blocks.push(`
      <div class="search-section">
        <h2>${escapeHtml(title)}</h2>
        <div class="search-grid">
          ${list.map((item) => renderSearchCard(item)).join('')}
        </div>
      </div>`);
  };
  push('Meilleure correspondance', sections.best);
  push('Films', sections.films);
  push('Séries', sections.series);
  push('Chaînes TV', sections.tv);
  if (!blocks.length) {
    return `<div class="search-grid">${fallbackItems.map((item) => renderSearchCard(item)).join('') || '<p class="muted">Aucun résultat pour cette recherche.</p>'}</div>`;
  }
  return blocks.join('');
}

function formatEpgClock(ms) {
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function renderEpg() {
  const epg = state.epg || {};
  const rows = epg.rows || [];
  const hours = epg.hours || [];
  const winStart = epg.windowStartMs || Date.now();
  const winEnd = epg.windowEndMs || winStart + 6 * 3600000;
  const span = Math.max(1, winEnd - winStart);

  return renderAppShell('epg', 'Guide TV', `
    <section class="screen epg-screen">
      <div class="epg-toolbar">
        <button class="pill" data-focus data-action="nav" data-screen="tv">← Chaînes</button>
        <button class="pill" data-focus data-action="epg-refresh">Actualiser EPG</button>
        <span class="muted">${epg.sourceLabel ? escapeHtml(epg.sourceLabel) : 'XMLTV'}
          · ${epg.matchedRows || 0}/${rows.length} chaînes avec programmes
        </span>
      </div>
      ${!epg.hasEpgData ? `
        <div class="epg-empty">
          <h2>Aucun programme EPG disponible</h2>
          <p class="muted">${escapeHtml(epg.emptyReason || 'Le fournisseur n’a fourni aucun guide exploitable.')}</p>
          <p class="muted epg-diag">${escapeHtml(epg.diagnosis || '')}</p>
        </div>` : `
        <div class="epg-grid" role="grid">
          <div class="epg-hours">
            <div class="epg-corner">Chaîne</div>
            ${hours.map((h) => `<div class="epg-hour">${escapeHtml(h.label)}</div>`).join('')}
          </div>
          <div class="epg-rows">
            ${rows.map((row) => {
              const cells = (row.programmes || []).map((p) => {
                const left = Math.max(0, ((p.startMs - winStart) / span) * 100);
                const width = Math.max(2, ((p.endMs - p.startMs) / span) * 100);
                return `
                  <button class="epg-cell ${p.isCurrent ? 'is-current' : ''}" data-focus
                    data-action="play" data-stream="${escapeAttr(row.streamId || '')}"
                    data-from-live="1" data-channel="${escapeAttr(row.channelId)}"
                    data-return-screen="epg"
                    style="left:${left}%;width:${width}%"
                    title="${escapeAttr(p.title)}">
                    <b>${escapeHtml(p.title)}</b>
                    <span>${formatEpgClock(p.startMs)} – ${formatEpgClock(p.endMs)}</span>
                    ${p.isCurrent && row.current?.progress != null
                      ? `<i class="epg-prog" style="width:${Math.round(row.current.progress * 100)}%"></i>`
                      : ''}
                  </button>`;
              }).join('');
              return `
                <div class="epg-row">
                  <button class="epg-ch" data-focus data-action="play"
                    data-stream="${escapeAttr(row.streamId || '')}" data-from-live="1"
                    data-channel="${escapeAttr(row.channelId)}" data-return-screen="epg">
                    <span class="live-logo" style="${row.logoUrl ? `background-image:url('${escapeAttr(row.logoUrl)}')` : ''}"></span>
                    <span>${escapeHtml(row.title)}</span>
                    ${!row.hasEpg ? '<small class="muted">Pas d’EPG</small>' : ''}
                  </button>
                  <div class="epg-timeline">${cells || '<span class="muted epg-none">—</span>'}</div>
                </div>`;
            }).join('')}
          </div>
        </div>
        ${epg.hasMore ? `<button class="btn" data-focus data-action="epg-more">Charger plus de chaînes</button>` : ''}
      `}
    </section>`);
}

function renderSearchCard(item) {
  const openAction = item.type === 'LIVE' ? 'play' : 'open-detail';
  return `
    <button class="poster search-card ${artFallbackClass(item)}" data-focus
      data-action="${openAction}"
      data-id="${escapeAttr(item.id)}"
      data-stream="${escapeAttr(item.selectedVersionId || '')}"
      style="background-image:${posterBg(item)}">
      <span class="badge">${escapeHtml(item.type === 'LIVE' ? 'TV' : item.type === 'SERIES' ? 'Série' : 'Film')}</span>
      <span class="t">${escapeHtml(item.title)}</span>
      <span class="y">${item.year || ''}</span>
    </button>`;
}

function renderCustomize() {
  if (!state.customizeOpen) return '';
  const p = state.preferences;
  const section =
    state.screen === 'tv' || state.screen === 'films' || state.screen === 'series'
      ? state.screen
      : 'films';
  return `
    <div class="sheet-backdrop" data-action="close-customize"></div>
    <aside class="sheet">
      <h3>Personnaliser · ${escapeHtml(state.activeProfile?.name || '')}</h3>
      <p class="muted">Préférences du profil actif. Les groupes visibles se gèrent via l’allowlist.</p>
      <div class="actions" style="margin-bottom:16px">
        <button class="btn primary" data-focus data-action="group-manage" data-section="${section}">Gérer mes groupes</button>
      </div>
      <h4>Masquage ponctuel (legacy)</h4>
      <p class="muted">Conserve les exclusions individuelles en plus de la sélection de groupes.</p>
      ${(state.groups || []).slice(0, 40).map((g) => `
        <div class="list-row">
          <div><strong>${escapeHtml(g.name)}</strong><div class="muted">${escapeHtml(g.sourceLabel || '')}</div></div>
          <button class="btn ghost" data-focus data-action="toggle-group" data-id="${escapeAttr(g.id)}">
            ${p.hiddenGroupIds.includes(g.id) ? 'Afficher' : 'Masquer'}
          </button>
        </div>`).join('') || '<p class="muted">Synchronisez pour lister les groupes.</p>'}
      ${(state.groups || []).length > 40 ? '<p class="muted">… liste tronquée — utilisez Gérer mes groupes.</p>' : ''}
      <h4>Rangées</h4>
      ${['CONTINUE_WATCHING', 'NEW_RELEASES', 'LIBRARY_SYNCED'].map((id) => `
        <div class="list-row">
          <span>${id}</span>
          <button class="btn ghost" data-focus data-action="toggle-row" data-id="${id}">
            ${p.visibleRowIds.includes(id) ? 'Visible' : 'Masquée'}
          </button>
        </div>`).join('')}
      <p class="muted">Sélection / Top / Recommandations : omises sans signaux réels.</p>
      <h4>Langue audio préférée</h4>
      <select data-focus id="langSelect">
        ${(state.languageChoices?.audio || [
          { value: 'edition:vf', label: 'VF (français)' },
          { value: 'en', label: 'Anglais' },
          { value: 'nl', label: 'Néerlandais' }
        ]).map((l) =>
          `<option value="${escapeAttr(l.value)}" ${(p.preferredAudioLanguage || p.preferredLanguage) === l.value ? 'selected' : ''}>${escapeHtml(l.label)}</option>`).join('')}
      </select>
      <div class="actions" style="margin-top:16px">
        <button class="btn" data-focus data-action="close-customize">Fermer</button>
      </div>
    </aside>`;
}

function renderCatalog(kind) {
  const pack = kind === 'films' ? state.films : state.series;
  const msg = statusMessage(pack.status);
  const emptyGroups = !msg ? sectionEmptyGroups(kind) : null;
  const hero = pack.hero;
  let body;
  if (msg) {
    body = `
      <div class="status-box">
        <h2>${escapeHtml(msg.title)}</h2>
        <p>${escapeHtml(msg.body)}</p>
        <div class="actions">
          <button class="btn primary" data-focus data-action="load-demo">Charger démo UI</button>
          <button class="btn ghost" data-focus data-action="nav" data-screen="settings">Paramètres</button>
        </div>
      </div>`;
  } else if (emptyGroups) {
    body = emptyGroups;
  } else {
    body = `
      ${hero ? `
        <div class="billboard">
          <div class="billboard-bg" style="background-image:${billboardBg(hero)}"></div>
          <div class="billboard-shade"></div>
          <div class="billboard-body">
            <h1>${escapeHtml(hero.title)}</h1>
            <div class="meta">${[hero.year || null, hero.durationMinutes ? `${hero.durationMinutes} min` : null, ...(hero.genres || [])].filter(Boolean).map(escapeHtml).join(' · ')}</div>
            <p class="syn">${escapeHtml(hero.synopsis)}</p>
            <div class="actions">
              <button class="btn primary" data-focus data-action="open-detail" data-id="${escapeAttr(hero.id)}">Lire</button>
              <button class="btn ghost" data-focus data-action="open-detail" data-id="${escapeAttr(hero.id)}">Détails</button>
              <button class="btn ghost" data-focus data-action="list" data-list="watchLater" data-id="${escapeAttr(hero.id)}">Ma liste</button>
            </div>
          </div>
        </div>` : ''}
      <div class="rails">
        ${pack.rows.map((row) => `
          <div class="rail">
            <h3 class="rail-title">${escapeHtml(row.label)}</h3>
            <div class="rail-track">
              ${row.items.map((item) => `
                <div class="poster-wrap ${row.continueRow ? 'poster-wrap--continue' : ''}">
                <button class="poster ${artFallbackClass(item)}" data-focus data-focus-key="rail:${escapeAttr(item.id)}"
                  data-action="open-detail" data-id="${escapeAttr(item.id)}"
                  style="background-image:${posterBg(item)}">
                  <span class="badge">${escapeHtml(item.versions?.find((v) => v.id === item.selectedVersionId)?.language || '?')}</span>
                  ${row.showsProgress && item.progressFraction > 0 ? `<span class="prog"><i style="width:${Math.round(item.progressFraction * 100)}%"></i></span>` : ''}
                  <span class="t">${escapeHtml(item.title)}</span>
                  <span class="y">${item.resumeLabel || item.year || ''}${item.remainingMinutes ? ` · ${item.remainingMinutes} min` : ''}</span>
                  ${row.continueRow ? `<span class="continue-resume">Fiche · Reprendre</span>` : ''}
                </button>
                ${row.continueRow ? `
                  <button class="continue-dismiss" data-focus data-action="list" data-list="dismissContinue" data-id="${escapeAttr(item.id)}" title="Retirer de Continuer">×</button>` : ''}
                </div>`).join('')}
            </div>
          </div>`).join('') || '<p class="muted" style="padding:0 48px">Aucune rangée visible pour ce profil.</p>'}
      </div>`;
  }
  const page = `
    <section class="screen catalog-page catalog-page--v2">
      ${sectionChrome(kind)}
      ${body}
      ${renderCustomize()}
      ${renderGroupSetup()}
    </section>`;
  return renderAppShell(
    kind,
    kind === 'films' ? 'Films' : 'Séries',
    page,
    `<button class="pill" data-focus data-action="sync">${state.syncing ? 'Sync…' : 'Actualiser'}</button>`
  );
}

function episodeSpecificSynopsis(epSynopsis, seriesSynopsis) {
  const ep = String(epSynopsis || '').trim();
  if (!ep) return '';
  const series = String(seriesSynopsis || '').trim();
  if (series && ep.toLowerCase() === series.toLowerCase()) return '';
  return ep;
}

function userFacingRatingLabel(label) {
  const t = String(label || '').trim();
  if (!t) return null;
  if (/source|version|fusion/i.test(t)) return null;
  return t;
}

function renderDetail() {
  const d = state.detail;
  if (!d) return renderHub();
  const season = d.seasons?.find((s) => s.number === d.selectedSeason) || d.seasons?.[0];
  const moreOpen = !!d.moreOpen;
  const playLabel = d.type === 'SERIES' ? 'Reprendre' : 'Lecture';
  const rating = userFacingRatingLabel(d.ratingLabel);
  const metaBits = [
    d.year || null,
    d.durationMinutes ? `${d.durationMinutes} min` : null,
    d.type === 'SERIES' ? `${d.seasons?.length || 0} saison(s)` : 'Film',
    rating,
    ...(d.genres || []).slice(0, 4)
  ].filter(Boolean);
  const isSeries = d.type === 'SERIES' && d.seasons?.length;
  const tab = d.detailTab || (isSeries ? 'episodes' : 'overview');
  const tabs = isSeries
    ? [['overview', 'Aperçu'], ['episodes', 'Épisodes'], ['details', 'Détails']]
    : [['overview', 'Aperçu'], ['details', 'Détails']];
  const editions = (d.editions || []).length > 1 ? d.editions : null;
  const versions = !editions && d.versions?.length ? d.versions : null;
  const overviewBody = `
    <div class="detail-section">
      <h2>Synopsis</h2>
      <p class="syn-block">${escapeHtml(d.synopsis)}</p>
      ${(editions || versions || []).length ? `
        <h3 class="detail-subh">Langues disponibles</h3>
        <p>${escapeHtml((editions || versions).map((x) => x.label).join(' · '))}</p>` : ''}
      ${!isSeries ? renderRecoRails(d) : ''}
    </div>`;
  const detailsBody = `
    <div class="detail-section detail-meta-grid">
      ${[
        d.year ? ['Année', d.year] : null,
        d.durationMinutes ? ['Durée', `${d.durationMinutes} min`] : null,
        isSeries ? ['Saisons', d.seasons.length] : null,
        isSeries ? ['Épisodes', d.seasons.reduce((n, s) => n + (s.episodes || []).length, 0)] : null,
        rating ? ['Classification', rating] : null,
        (d.genres || []).length ? ['Genres', (d.genres || []).join(', ')] : null,
        (editions || versions || []).length
          ? ['Éditions', (editions || versions).map((x) => x.label).join(', ')]
          : null,
        d.directors?.length ? ['Réalisation', d.directors.join(', ')] : null,
        d.cast?.length || d.actors?.length
          ? ['Distribution', (d.cast || d.actors || []).slice(0, 8).join(', ')]
          : null
      ].filter(Boolean).map(([k, v]) => `
        <div class="detail-meta-row"><span>${escapeHtml(String(k))}</span><strong>${escapeHtml(String(v))}</strong></div>`).join('')
        || '<p class="muted">Aucune métadonnée supplémentaire fournie par la source.</p>'}
      ${state.preferences?.developerMode && d.trustedMerge
        ? '<p class="muted detail-dev">Dev · fusion multi-éditions fiable</p>' : ''}
    </div>`;
  const episodesBody = isSeries ? `
    <div class="detail-section">
      <div class="season-block">
        <h2>Saisons</h2>
        <div class="season-cards">
          ${d.seasons.map((s) => `
            <button class="season-card ${(d.selectedSeason || season?.number) === s.number ? 'selected' : ''}" data-focus
              data-action="pick-season" data-id="${s.number}">
              <strong>${escapeHtml(s.title)}</strong>
              <span>${(s.episodes || []).length} épisodes</span>
            </button>`).join('')}
        </div>
      </div>
      <h2>Épisodes · ${escapeHtml(season?.title || '')}</h2>
      <div class="episodes">
        ${(season?.episodes || []).map((ep) => {
          const ws = ep.watchState || (
            ep.progressFraction >= 0.92 ? 'completed'
              : ep.progressFraction > 0.02 ? 'in_progress' : 'none'
          );
          const preferredVer =
            (ep.versions || []).find((v) => v.streamId === ep.selectedStreamId) ||
            (ep.versions || [])[0];
          const stream = preferredVer?.streamId || preferredVer?.id || ep.selectedStreamId || d.selectedVersionId || '';
          const epId = preferredVer?.physicalEpisodeId || ep.id || '';
          const listLabel = ep.listLabel || `${ep.number}. ${ep.title || `Épisode ${ep.number}`}`;
          return `
          <div class="ep ep--compact ${ws !== 'none' ? `is-${ws}` : ''}">
            <button class="ep-main" data-focus data-action="play"
              data-stream="${escapeAttr(stream)}"
              data-episode-id="${escapeAttr(epId)}">
              <div class="thumb ${ep.thumbUrl || d.backdropUrl || d.posterUrl ? '' : 'art-fallback'}" style="background-image:${ep.thumbUrl || d.backdropUrl || d.posterUrl ? `url('${escapeAttr(ep.thumbUrl || d.backdropUrl || d.posterUrl)}')` : billboardBg(d)}">
                ${ws === 'in_progress' ? `<span class="prog"><i style="width:${Math.round(ep.progressFraction * 100)}%"></i></span>` : ''}
                ${ws === 'completed' ? '<span class="ep-done" title="Vu">Vu</span>' : ''}
              </div>
              <div class="ep-copy">
                <strong>${escapeHtml(listLabel)}</strong>
                ${ws === 'in_progress' ? '<div class="ep-resume">Reprendre</div>' : ''}
              </div>
              <div class="ep-side muted">${ep.durationMinutes ? `${ep.durationMinutes} min` : ''}</div>
            </button>
          </div>`;
        }).join('')}
      </div>
      ${(editions || []).length > 1 ? `
        <p class="muted ep-lang-hint">Langue de la série : changez via les éditions ci-dessus — appliquée aux épisodes suivants lorsqu’elle existe.</p>` : ''}
      ${renderRecoRails(d)}
    </div>` : '';
  return `
    <section class="screen detail">
      <div class="detail-stage ${isSeries ? 'detail-stage--series' : 'detail-stage--film'}">
        <div class="detail-bg" style="background-image:${billboardBg(d)}"></div>
        <div class="detail-shade"></div>
        <div class="chrome chrome--overlay">
          <button class="icon-btn rect-btn" data-focus data-action="back-detail">← Retour</button>
          <div class="spacer"></div>
          ${profileChip(true)}
        </div>
        <div class="detail-hero">
          <div class="detail-poster" style="background-image:${posterBg(d)}"></div>
          <div class="detail-copy">
            ${d.isDemoShowcase ? '<div class="demo-banner">Démo UI · hors IPTV réel</div>' : ''}
            <h1>${escapeHtml(d.title)}</h1>
            <div class="detail-meta">
              ${metaBits.map((m) => `<span class="meta-chip">${escapeHtml(String(m))}</span>`).join('')}
            </div>
            <p class="syn">${escapeHtml(d.synopsis)}</p>
            <div class="detail-primary">
              <button class="btn primary btn-lg rect-btn" data-focus data-action="play">${playLabel}</button>
              <button class="btn ghost rect-btn" data-focus data-action="list" data-list="favorite" data-id="${escapeAttr(d.id)}">${d.isFavorite ? '★ Favori' : '☆ Favoris'}</button>
              <button class="btn ghost rect-btn" data-focus data-action="list" data-list="watchLater" data-id="${escapeAttr(d.id)}">${d.isWatchLater ? 'Dans ma liste' : '+ Ma liste'}</button>
              <button class="btn ghost rect-btn" data-focus data-action="toggle-more">${moreOpen ? 'Moins' : 'Plus…'}</button>
            </div>
            <div class="detail-secondary" ${moreOpen ? '' : 'hidden'}>
              <button class="btn ghost rect-btn" data-focus data-action="list" data-list="watched" data-id="${escapeAttr(d.id)}">${d.isWatched ? 'Vu ✓' : 'Marquer vu'}</button>
              <button class="btn ghost rect-btn" data-focus data-action="list" data-list="dismissContinue" data-id="${escapeAttr(d.id)}">Retirer de Continuer</button>
              <button class="btn ghost rect-btn" data-focus data-action="list" data-list="hide" data-id="${escapeAttr(d.id)}">Masquer</button>
            </div>
            ${editions ? `
              <div class="detail-badge">Éditions / langues</div>
              <div class="chips">
                ${editions.map((ed) => `
                  <button class="chip ${ed.selected ? 'selected' : ''}" data-focus
                    data-action="pick-edition" data-id="${escapeAttr(ed.id)}"
                    data-lang="${escapeAttr(ed.languageTag || '')}">${escapeHtml(ed.label)}</button>`).join('')}
              </div>` : ''}
            ${versions ? `
              <div class="detail-badge">Versions / langues</div>
              <div class="chips">
                ${versions.map((v) => `
                  <button class="chip ${d.selectedVersionId === v.id ? 'selected' : ''}" data-focus
                    data-action="pick-version" data-id="${escapeAttr(v.id)}">${escapeHtml(v.label)}</button>`).join('')}
              </div>` : ''}
          </div>
        </div>
      </div>
      <div class="detail-body">
        <div class="detail-tabs">
          ${tabs.map(([id, label]) => `
            <button class="detail-tab rect-btn ${tab === id ? 'selected' : ''}" data-focus
              data-action="detail-tab" data-id="${id}">${label}</button>`).join('')}
        </div>
        ${tab === 'overview' ? overviewBody : ''}
        ${tab === 'episodes' ? episodesBody : ''}
        ${tab === 'details' ? detailsBody : ''}
      </div>
    </section>`;
}

function renderRecoRails(d) {
  const r = d.recommendations || {};
  const sections = [
    ['saga', 'Même saga / franchise', r.saga],
    ['similar', 'Similaires', r.similar],
    ['sameGenre', 'Même genre', r.sameGenre],
    ['sameCast', 'Même casting', r.sameCast]
  ].filter(([, , items]) => items?.length);
  if (!sections.length) {
    return `<p class="muted detail-related-note">Recommandations masquées — métadonnées insuffisantes (aucun titre inventé).</p>`;
  }
  return `
    <div class="detail-reco">
      ${sections.map(([key, label, items]) => `
        <div class="rail" data-reco="${key}">
          <h3 class="rail-title">${escapeHtml(label)}</h3>
          <div class="rail-track">
            ${items.map((item) => `
              <button class="poster ${item.posterUrl ? '' : 'art-fallback'}" data-focus data-action="open-detail" data-id="${escapeAttr(item.id)}"
                style="background-image:${item.posterUrl ? `url('${escapeAttr(item.posterUrl)}')` : 'none'}">
                <span class="t">${escapeHtml(item.title)}</span>
                <span class="y">${item.year || ''}</span>
              </button>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

function renderPlaceholder(screen, title, note) {
  return renderAppShell(screen === 'epg' || screen === 'library' ? 'hub' : screen, escapeHtml(title), `
    <section class="screen">
      <div class="page-heading">
        <div class="v2-eyebrow">Bientôt</div>
        <h1>${escapeHtml(title)}</h1>
        <p class="muted">${escapeHtml(note)}</p>
      </div>
    </section>`);
}

function renderLiveTv() {
  const pack = state.live || {};
  const msg = statusMessage(pack.status);
  const emptyGroups = !msg ? sectionEmptyGroups('tv') : null;
  if (msg && !(pack.totalChannels > 0) && !(pack.groups || []).length) {
    return renderAppShell('tv', 'TV en direct', `<section class="screen catalog-page">${sectionChrome('tv')}
      <div class="status-box">
        <h2>${escapeHtml(msg.title)}</h2>
        <p>${escapeHtml(msg.body)}</p>
        <div class="actions">
          <button class="btn primary" data-focus data-action="nav" data-screen="settings">Paramètres</button>
        </div>
      </div>${renderCustomize()}${renderGroupSetup()}</section>`);
  }
  if (emptyGroups) {
    return renderAppShell('tv', 'TV en direct', `<section class="screen catalog-page">${sectionChrome('tv')}${emptyGroups}${renderCustomize()}${renderGroupSetup()}</section>`);
  }

  const groups = [
    pack.favorites,
    pack.all,
    ...(pack.groups || [])
  ].filter(Boolean);
  const selectedGroup = pack.selectedGroupId || groups[0]?.id;
  const channels = pack.channels?.items || [];
  const selectedId = pack.selectedChannelId || channels[0]?.id;
  const selected = channels.find((c) => c.id === selectedId) || channels[0];
  const favIds = new Set(state.preferences?.favoriteIds || []);
  const selectedIsFav = selected?.id ? favIds.has(selected.id) : false;
  const previewOn = state.preferences?.livePreviewEnabled !== false;

  return renderAppShell('tv', 'TV en direct <span class="live-pill">LIVE</span>', `
    <section class="screen live-tv-screen">
      <div class="live-toolbar">
        <button class="pill primary" data-focus data-action="open-epg" data-focus-key="tv:epg">Guide TV</button>
        <span class="muted">XMLTV réel · jamais inventé</span>
      </div>
      <div class="live-layout">
        <aside class="live-groups" aria-label="Catégories">
          <div class="live-col-title">Groupes</div>
          <div class="live-groups-scroll">
            ${groups.map((g) => `
              <button class="live-group ${g.id === selectedGroup ? 'selected' : ''}" data-focus
                data-action="live-group" data-id="${escapeAttr(g.id)}">
                <span class="live-group-name">${escapeHtml(g.name)}</span>
                <span class="live-group-count">${g.count ?? ''}</span>
              </button>`).join('')}
          </div>
        </aside>
        <section class="live-channels" aria-label="Chaînes">
          <div class="live-col-title">Chaînes
            <span class="muted">${pack.channels?.total ?? 0}${pack.channels?.hasMore ? '+' : ''}</span>
          </div>
          <div class="live-channels-scroll" id="liveChannelList">
            ${channels.map((ch) => `
              <button class="live-channel ${ch.id === selectedId ? 'selected' : ''}" data-focus
                data-action="live-channel" data-id="${escapeAttr(ch.id)}"
                data-stream="${escapeAttr(ch.streamId || '')}">
                <span class="live-logo" style="${ch.logoUrl ? `background-image:url('${escapeAttr(ch.logoUrl)}')` : ''}"></span>
                <span class="live-channel-meta">
                  <span class="live-channel-name">${escapeHtml(ch.title)}</span>
                  <span class="live-channel-epg muted">Voir Guide TV</span>
                </span>
                ${favIds.has(ch.id) ? '<span class="live-channel-fav" title="Favori">★</span>' : ''}
              </button>`).join('') || '<p class="muted" style="padding:12px">Aucune chaîne dans ce groupe.</p>'}
            ${pack.channels?.hasMore ? `
              <button class="btn ghost" data-focus data-action="live-more">Charger plus</button>` : ''}
          </div>
        </section>
        <aside class="live-preview" aria-label="Aperçu">
          <div class="live-preview-frame" data-channel-id="${escapeAttr(selected?.id || '')}" data-stream="${escapeAttr(selected?.streamId || '')}">
            <div class="live-preview-stage">
              <video id="livePreviewVideo" class="live-preview-video" muted playsinline></video>
              <div class="live-preview-status" id="livePreviewStatus">${previewOn ? 'Aperçu…' : 'Aperçu désactivé'}</div>
            </div>
            <div class="live-preview-meta">
              <div class="live-preview-identity">
                <div class="live-preview-logo ${selected?.logoUrl ? '' : 'live-preview-logo--empty'}" id="livePreviewLogo"
                  style="${selected?.logoUrl ? `background-image:url('${escapeAttr(selected.logoUrl)}')` : ''}"></div>
                <div class="live-preview-text">
                  <h2>${escapeHtml(selected?.title || 'Sélectionnez une chaîne')}</h2>
                  <div class="live-preview-tags">
                    <span class="live-badge">LIVE</span>
                    <span class="muted" id="livePreviewHint">Aperçu · sélection = preview</span>
                  </div>
                </div>
              </div>
              <div class="live-preview-actions">
                ${selected?.id ? `
                  <button class="btn ghost" data-focus data-action="list" data-list="favorite" data-id="${escapeAttr(selected.id)}"
                    title="Favori">${selectedIsFav ? '★' : '☆'}</button>` : ''}
                <button class="btn ghost" data-focus data-action="live-preview-mute" id="livePreviewMuteBtn" title="Son">🔇</button>
                ${selected?.streamId ? `
                  <button class="btn primary" data-focus data-action="live-preview-fullscreen"
                    data-stream="${escapeAttr(selected.streamId)}"
                    data-channel="${escapeAttr(selected.id)}">Plein écran</button>` : ''}
                <button class="btn ghost" data-focus data-action="toggle-live-preview">${previewOn ? 'Aperçu ON' : 'Aperçu OFF'}</button>
              </div>
            </div>
          </div>
        </aside>
      </div>
      ${renderCustomize()}
      ${renderGroupSetup()}
    </section>`);
}

function formatPlayerTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '—:—';
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderPlayer() {
  const pl = state.player || {};
  const diag = pl.diagnostic || {};
  const sniff = diag.sniff || {};
  const isLive = !!pl.isLive;
  const mode = pl.uiMode || (isLive ? 'live' : pl.episodeNav ? 'series' : 'film');
  const isSeries = !isLive && mode === 'series';
  const isFilm = !isLive && mode === 'film';
  const ep = isSeries ? pl.episodeNav?.current : null;
  const subtitle = pl.subtitle
    || (ep && ep.title && !/^épisode\s*\d+$/i.test(ep.title) ? ep.title : '')
    || (isLive ? 'Télévision en direct' : isFilm ? 'Film' : '');
  const nowLabel = isLive
    ? `${escapeHtml(pl.title || 'Chaîne')} <span class="muted">· LIVE</span>`
    : escapeHtml(pl.title || 'Lecture');
  const seasonBlocks = isSeries
    ? (pl.episodeNav?.seasons?.length
      ? pl.episodeNav.seasons
      : pl.episodeNav?.episodes?.length
        ? [{ number: null, episodes: pl.episodeNav.episodes }]
        : [])
    : [];
  const sniffCodec = sniff.videoCodec || '';
  const sniffContainer = sniff.container || '';
  const incompatibleBrowser =
    !isLive &&
    (pl.mode === 'incompatible' ||
      pl.ext === 'mkv' ||
      sniffContainer === 'mkv' ||
      sniffCodec === 'hevc' ||
      sniffCodec === 'mpeg2');
  const probeFailed = !isLive && diag.ok === false && !incompatibleBrowser;
  const errorTitle = 'Lecture interrompue';
  const errorBody = pl.error || '';
  const prevBtn = isLive && pl.liveNav?.previous?.streamId
    ? `<button class="skip" data-focus data-action="player-live-channel" data-stream="${escapeAttr(pl.liveNav.previous.streamId)}" data-channel="${escapeAttr(pl.liveNav.previous.id)}" title="Chaîne précédente">${PV3_SVG.skipBack}<span>CHAÎNE −</span></button>`
    : (!isLive
      ? `<button class="skip" data-focus data-action="player-seek" data-delta="-10" title="Reculer de 10 secondes">${PV3_SVG.skipBack}<span>−10 SEC</span></button>`
      : '<span class="skip" aria-hidden="true" style="visibility:hidden"></span>');
  const nextBtn = isLive && pl.liveNav?.next?.streamId
    ? `<button class="skip" data-focus data-action="player-live-channel" data-stream="${escapeAttr(pl.liveNav.next.streamId)}" data-channel="${escapeAttr(pl.liveNav.next.id)}" title="Chaîne suivante">${PV3_SVG.skipFwd}<span>CHAÎNE +</span></button>`
    : (!isLive
      ? `<button class="skip" data-focus data-action="player-seek" data-delta="10" title="Avancer de 10 secondes">${PV3_SVG.skipFwd}<span>+10 SEC</span></button>`
      : '<span class="skip" aria-hidden="true" style="visibility:hidden"></span>');
  const selectedPlayerSeason =
    Number(pl.playerSeasonFilter) ||
    Number(pl.seasonNumber) ||
    Number(pl.episodeNav?.current?.season) ||
    seasonBlocks[0]?.number;
  const visibleSeasonBlocks = seasonBlocks.filter(
    (s) => s.number == null || s.number === selectedPlayerSeason
  );
  const episodesDrawer = isSeries ? `
    <aside class="drawer" id="playerEpisodes">
      <div class="drawerhead">
        <strong>Épisodes</strong>
        <button class="ic" data-focus data-action="player-episodes-toggle" aria-label="Fermer">${PV3_SVG.close}</button>
      </div>
      <div class="drawer-groups" id="playerSeasonChips">
        ${seasonBlocks.map((s) => `
          <button class="group-chip ${s.number === selectedPlayerSeason ? 'active' : ''}" data-focus
            data-action="player-season-filter" data-season="${s.number}">
            Saison ${s.number}
          </button>`).join('')}
      </div>
      <div class="drawerbody">
        ${visibleSeasonBlocks.map((s) => `
          ${(s.episodes || []).map((e) => {
            const active =
              (e.season === pl.seasonNumber && e.episode === pl.episodeNumber) ||
              e.id === pl.episodeId ||
              e.streamId === pl.streamId;
            const ws = e.watchState || (
              e.progressFraction >= 0.92 ? 'completed'
                : e.progressFraction > 0.02 ? 'in_progress' : 'none'
            );
            const badge = active
              ? 'Épisode en cours'
              : ws === 'in_progress'
                ? 'Reprendre'
                : ws === 'completed'
                  ? 'Vu'
                  : 'Lire';
            const thumbStyle = e.thumbUrl
              ? `background-image:url('${escapeAttr(e.thumbUrl)}')`
              : '';
            const listLabel = e.listLabel || `${e.episode}. ${e.title || `Épisode ${e.episode}`}`;
            return `
            <div class="ep-block">
            <button class="item ${active ? 'active' : ''} ${ws !== 'none' ? `is-${ws}` : ''}" data-focus
              data-action="player-episode"
              data-stream="${escapeAttr(e.streamId)}"
              data-episode-id="${escapeAttr(e.id || '')}">
              <div class="thumb ep-thumb ${e.thumbUrl ? 'has-art' : 'art-fallback'}" style="${thumbStyle}">
                ${ws === 'in_progress' ? `<span class="prog"><i style="width:${Math.round((e.progressFraction || 0) * 100)}%"></i></span>` : ''}
                ${ws === 'completed' && !active ? '<span class="ep-done">Vu</span>' : ''}
              </div>
              <div class="itemtext">
                <b>${escapeHtml(listLabel)}</b>
                <span>${escapeHtml(badge === 'Reprendre' || active ? badge : (ws === 'completed' ? 'Vu' : ''))}${e.durationMinutes ? ` · ${e.durationMinutes} min` : ''}</span>
              </div>
            </button>
            </div>`;
          }).join('')}
        `).join('') || '<p class="muted" style="padding:12px">Aucun épisode chargé.</p>'}
      </div>
      <div class="drawerfooter">LKS TV · Épisodes</div>
    </aside>` : '';
  const channelsDrawer = isLive ? `
    <aside class="drawer" id="playerChannels">
      <div class="drawerhead">
        <strong>Chaînes</strong>
        <button class="ic" data-focus data-action="player-channels-toggle" aria-label="Fermer">${PV3_SVG.close}</button>
      </div>
      ${(pl.liveNav?.groups || []).length ? `
        <div class="drawer-groups" id="playerChannelGroups">
          ${(pl.liveNav.groups || []).map((g) => `
            <button class="group-chip ${g.id === pl.liveNav.selectedGroupId ? 'active' : ''}" data-focus
              data-action="player-live-group" data-id="${escapeAttr(g.id)}">
              ${escapeHtml(g.name)}
            </button>`).join('')}
        </div>` : ''}
      <div class="drawerbody" id="playerChannelList">
        ${(pl.liveNav?.channels || []).map((c) => `
          <button class="item ${c.id === pl.liveNav?.channelId ? 'active' : ''}" data-focus
            data-action="player-live-channel" data-stream="${escapeAttr(c.streamId)}" data-channel="${escapeAttr(c.id)}">
            ${c.logoUrl
              ? `<img src="${escapeAttr(c.logoUrl)}" alt="" class="thumb" />`
              : '<div class="thumb">TV</div>'}
            <div class="itemtext">
              <b>${escapeHtml(c.title)}</b>
              <span>${c.id === pl.liveNav?.channelId ? 'En direct · Chaîne actuelle' : 'Changer de chaîne'}</span>
            </div>
          </button>`).join('') || '<p class="muted" style="padding:12px">Aucune chaîne dans ce groupe.</p>'}
      </div>
      <div class="drawerfooter">LKS TV · Chaînes</div>
    </aside>` : '';
  return `
    <section class="screen player-v3" id="playerApp" data-mode="${mode}" data-live="${isLive ? '1' : '0'}" data-series="${isSeries ? '1' : '0'}" data-incompatible="${incompatibleBrowser ? '1' : '0'}">
      <div class="art">
        <video id="lksVideo" playsinline preload="auto"></video>
      </div>
      <div class="ambient"></div>
      <div class="grain"></div>
      <header class="top">
        <div class="brandrow">
          <button class="back" data-focus data-action="close-player" title="Retour">${PV3_SVG.back}</button>
          <div>
            <div class="brand">LKS TV <span>/ PLAYER</span></div>
            <div class="title" id="playerTitle">${escapeHtml(pl.title || 'Lecture')}</div>
            <div class="subtitle" id="playerSubtitle">${escapeHtml(subtitle)}</div>
          </div>
        </div>
        <div class="topright">
          ${isLive ? '<span class="pill" id="playerLiveBadge">EN DIRECT</span>' : ''}
        </div>
      </header>
      <div class="center" id="playerCenter">
        ${prevBtn}
        <button class="play is-loading" data-focus data-action="player-toggle" id="playerPlayBtn" aria-label="Lecture" title="Lecture/Pause">
          <svg id="playerPlayIcon" viewBox="0 0 24 24">${PV3_SVG.play}</svg>
        </button>
        ${nextBtn}
      </div>
      <div class="livebar${isLive ? ' show' : ''}" id="playerLivebar">
        <i></i> EN DIRECT
        <span class="muted" id="playerBufferState">${escapeHtml(pl.title || '')}</span>
      </div>
      <footer class="bottom">
        ${!isLive ? `
          <div class="progress" id="playerProgress" role="slider" tabindex="0" data-focus aria-label="Progression de lecture" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div class="rail">
              <div class="loaded" id="playerLoaded"></div>
              <div class="filled" id="playerFilled"></div>
            </div>
          </div>
          <div class="time" id="playerTimes">
            <span id="playerTimeCur">0:00</span>
            <span id="playerTimeDur">0:00</span>
          </div>` : ''}
        <div class="toolbar">
          <div class="cluster">
            <button class="ic" data-focus data-action="player-toggle" id="playerBottomPlay" title="Lecture/Pause">
              <svg viewBox="0 0 24 24">${PV3_SVG.play}</svg>
            </button>
            <button class="ic" data-focus data-action="player-mute" id="playerMuteBtn" title="Son">${PV3_SVG.volume}</button>
            <span class="now" id="playerNowTitle">${nowLabel}</span>
            ${!isLive && pl.introMarkers ? `
              <button class="small accent" data-focus data-action="player-skip-intro" id="playerSkipIntroBtn" hidden>Passer l'intro</button>` : ''}
            ${isSeries && pl.episodeNav?.next ? `
              <button class="small accent" data-focus data-action="player-episode" data-stream="${escapeAttr(pl.episodeNav.next.streamId)}" data-episode-id="${escapeAttr(pl.episodeNav.next.id || '')}" id="playerNextEpBtn" hidden>Épisode suivant</button>` : ''}
          </div>
          <div class="cluster">
            ${isSeries && seasonBlocks.length ? `
              <button class="small" data-focus data-action="player-episodes-toggle">${PV3_SVG.episodes}<span>Épisodes</span></button>` : ''}
            ${isLive ? `
              <button class="small" data-focus data-action="player-channels-toggle">${PV3_SVG.channels}<span>Chaînes</span></button>
              <button class="small" data-focus data-action="open-epg"><span>Guide TV</span></button>` : ''}
            ${!isLive ? `
              <button class="ic" data-focus data-action="player-subs" id="playerSubsBtn" title="Sous-titres" hidden>${PV3_SVG.captions}</button>
              <button class="ic" data-focus data-action="player-audio" id="playerAudioBtn" title="Audio" hidden>
                <svg viewBox="0 0 24 24"><path d="M12 3v18M8 8v8m8-8v8"/></svg>
              </button>
              <button class="ic" data-focus data-action="player-quality" id="playerQualityBtn" title="Qualité" hidden>
                <svg viewBox="0 0 24 24"><path d="M4 15h4v5H4zm6-6h4v11h-4zm6-5h4v16h-4z"/></svg>
              </button>` : ''}
            <button class="ic" data-focus data-action="player-settings-toggle" title="Réglages">${PV3_SVG.settings}</button>
            <button class="ic" data-focus data-action="player-fullscreen" title="Plein écran">${PV3_SVG.fullscreen}</button>
            <button class="small accent" data-focus data-action="player-retry" id="playerRetryBtn" hidden>Réessayer</button>
          </div>
        </div>
      </footer>
      ${episodesDrawer}
      ${channelsDrawer}
      <aside class="drawer" id="playerSettings">
        <div class="drawerhead">
          <strong>Paramètres</strong>
          <button class="ic" data-focus data-action="player-settings-toggle" aria-label="Fermer">${PV3_SVG.close}</button>
        </div>
        <div class="drawerbody">
          <div class="settings-tabs" id="playerSettingsTabs">
            <button class="chip selected" data-focus data-action="player-settings-tab" data-id="audio">Audio</button>
            <button class="chip" data-focus data-action="player-settings-tab" data-id="subs">Sous-titres</button>
            ${!isLive ? '<button class="chip" data-focus data-action="player-settings-tab" data-id="quality">Qualité</button>' : ''}
            ${!isLive ? '<button class="chip" data-focus data-action="player-settings-tab" data-id="speed">Vitesse</button>' : ''}
            <button class="chip" data-focus data-action="player-settings-tab" data-id="info" id="playerSettingsInfoTab" hidden>Info</button>
          </div>
          <div class="settings-pane" data-pane="audio">
            <div class="pane-label">Éditions IPTV</div>
            ${(pl.availableEpisodeLanguages || []).length ? `
              ${(pl.availableEpisodeLanguages || []).map((lang) => {
                const active = lang.streamId === pl.streamId;
                const hint = active
                  ? 'Édition actuelle'
                  : (lang.requiresNewStream ? 'Autre flux · position conservée' : 'Changer');
                return `
                <button class="item ${active ? 'active' : ''}" data-focus
                  data-action="player-switch-edition"
                  data-lang="${escapeAttr(lang.tag || '')}"
                  data-edition="${escapeAttr(lang.editionId || '')}"
                  data-stream="${escapeAttr(lang.streamId || '')}"
                  data-episode-id="${escapeAttr(lang.physicalEpisodeId || '')}"
                  ${active ? 'disabled' : ''}>
                  <div class="itemtext">
                    <b>${escapeHtml(lang.label || lang.tag || 'Langue')}</b>
                    <span>${escapeHtml(hint)}</span>
                  </div>
                </button>`;
              }).join('')}` : `
              <p class="muted" style="padding:8px 12px">${isFilm
                ? 'Aucune édition linguistique séparée pour ce film.'
                : 'Aucune édition listée. Les pistes du média restent sous Audio / ST si présentes.'}</p>`}
            <div class="pane-label">Pistes audio du média</div>
            <div id="playerAudioTracksList"><p class="muted" style="padding:8px 12px">Détection à la lecture…</p></div>
          </div>
          <div class="settings-pane" data-pane="subs" hidden>
            <div class="pane-label">Sous-titres</div>
            <div id="playerTextTracksList"><p class="muted" style="padding:8px 12px">Aucun sous-titre détecté tant que le flux n’est pas prêt.</p></div>
          </div>
          ${!isLive ? `
          <div class="settings-pane" data-pane="quality" hidden>
            <div class="pane-label">Qualité</div>
            <p class="muted" style="padding:8px 12px">Uniquement les variantes réellement exposées par le flux (HLS). Pas de qualité inventée.</p>
            <div id="playerQualityList"><p class="muted" style="padding:8px 12px">Aucune variante listée.</p></div>
          </div>
          <div class="settings-pane" data-pane="speed" hidden>
            <div class="pane-label">Vitesse</div>
            ${[0.75, 1, 1.25, 1.5, 2].map((s) => `
              <button class="item" data-focus data-action="player-speed" data-id="${s}">
                <div class="itemtext"><b>${s}×</b><span>Vitesse de lecture</span></div>
              </button>`).join('')}
          </div>` : ''}
          <div class="settings-pane" data-pane="info" hidden>
            <div class="pane-label">Informations techniques</div>
            <div class="muted" id="playerDiag" style="padding:12px;font-size:11px;line-height:1.5">
              Probe HTTP ${diag.httpStatus ?? '—'}
              · ${escapeHtml(diag.contentType || 'type ?')}
              · host ${escapeHtml(diag.finalHost || '—')}
              · codec ${escapeHtml(sniff.videoCodec || '?')} / ${escapeHtml(sniff.container || '?')}
              · ${escapeHtml(diag.hint || '')}
              <br/><span id="playerLiveDiag">readyState=— networkState=— t=—</span>
              <br/>${escapeHtml(pl.browserLimitation || '')}
              ${probeFailed || !incompatibleBrowser ? `
              <br/><button class="small" data-focus data-action="player-retry">Réessayer (dev)</button>` : ''}
            </div>
          </div>
          <div style="font-size:12px;color:#aeb0ba;margin:18px 10px 8px">PRÉFÉRENCES</div>
          ${isSeries ? `
            <button class="item" data-focus data-action="toggle-autoplay-next">
              <div class="itemtext">
                <b>Épisode suivant automatique · ${pl.autoplayNextEpisode !== false ? 'Oui' : 'Non'}</b>
                <span>Basculer</span>
              </div>
            </button>` : ''}
          <button class="item" data-focus data-action="player-dev-toggle">
            <div class="itemtext"><b>Mode développeur</b><span>Infos techniques</span></div>
          </button>
        </div>
        <div class="drawerfooter">LKS TV · Paramètres</div>
      </aside>
      <div class="error" id="playerError">
        <b id="playerErrorTitle">${escapeHtml(errorTitle)}</b>
        <span id="playerErrorBody">${escapeHtml(errorBody)}</span>
      </div>
      <p id="playerNote" hidden></p>
    </section>`;
}

function renderSettings() {
  const p = state.preferences;
  const lastSync = state.lastSyncAt
    ? new Date(state.lastSyncAt).toLocaleString()
    : 'jamais';
  const settingsBody = `
    <section class="screen">
      <div class="settings-wrap">
        <header class="settings-hero">
          <div class="v2-eyebrow">Préférences</div>
          <h1>Personnalisation</h1>
          <p class="muted">Sources IPTV réelles · secrets chiffrés serveur · préférences par profil</p>
        </header>
        <div class="settings-grid">
          <div class="panel">
            <h3>Sources</h3>
            <p class="muted settings-lead">Xtream / M3U. Mot de passe jamais renvoyé au navigateur.</p>
            ${state.sources.map((s) => `
              <div class="list-row source-row">
                <div>
                  <strong>${escapeHtml(s.displayName)}</strong>
                  <div class="muted">${s.kind}${s.enabled ? ' · actif' : ' · off'}${s.hasSecret ? ' · secret OK' : ''}${s.usernameHint ? ` · ${escapeHtml(s.usernameHint)}` : ''}</div>
                  ${s.lastError ? `<div class="warn">${escapeHtml(s.lastError)}</div>` : ''}
                </div>
                <div class="actions">
                  <button class="btn ghost" data-focus data-action="toggle-source" data-id="${escapeAttr(s.id)}">${s.enabled ? 'Désactiver' : 'Activer'}</button>
                  <button class="btn ghost" data-focus data-action="remove-source" data-id="${escapeAttr(s.id)}">Supprimer</button>
                </div>
              </div>`).join('') || '<p class="muted">Aucune source.</p>'}
            <div class="actions settings-actions">
              <button class="btn primary" data-focus data-action="sync">${state.syncing ? 'Synchronisation…' : 'Synchroniser'}</button>
              <button class="btn ghost" data-focus data-action="import-sample">Sample M3U</button>
              <button class="btn ghost" data-focus data-action="load-demo">Démo UI seule</button>
            </div>
            ${state.demoShowcaseActive ? '<p class="demo-banner">Mode DEMO_SHOWCASE — IPTV réel désactivé</p>' : ''}
            ${state.realCatalogActive ? '<p class="ok-banner">Catalogue IPTV réel actif</p>' : ''}
            <p class="muted">Dernière sync : ${escapeHtml(lastSync)}</p>
            <p class="muted">${escapeHtml(state.lastSyncMessage || '')}</p>
            ${state.lastSyncError ? `<p class="warn">${escapeHtml(state.lastSyncError)}</p>` : ''}
            ${state.syncProgress ? `<p class="muted">${escapeHtml(state.syncProgress)}</p>` : ''}
          </div>
          <div class="panel">
            <h3>Ajouter Xtream</h3>
            <form id="xtreamForm" onsubmit="return false;">
              <div class="form-row"><label>Nom</label><input name="displayName" value="Mon Xtream" /></div>
              <div class="form-row"><label>URL serveur</label><input name="serverUrl" placeholder="https://panel.example.com:8080" /></div>
              <div class="form-row"><label>Identifiant</label><input name="username" autocomplete="off" /></div>
              <div class="form-row"><label>Mot de passe</label><input name="password" type="password" autocomplete="off" /></div>
              <label class="check-row"><input type="checkbox" name="allowPrivateLan" /> Autoriser IP privée / LAN</label>
              <button class="btn primary" data-focus data-action="add-xtream">Vérifier & enregistrer</button>
            </form>
            <h3 class="settings-sub">M3U par URL</h3>
            <form id="m3uUrlForm" onsubmit="return false;">
              <div class="form-row"><label>Nom</label><input name="displayName" value="Ma playlist" /></div>
              <div class="form-row"><label>URL .m3u</label><input name="playlistUrl" placeholder="https://…" /></div>
              <label class="check-row"><input type="checkbox" name="allowPrivateLan" /> Autoriser IP privée / LAN</label>
              <button class="btn" data-focus data-action="add-m3u-url">Ajouter URL</button>
            </form>
            <h3 class="settings-sub">M3U fichier local</h3>
            <form id="m3uFileForm" onsubmit="return false;">
              <div class="form-row"><label>Nom</label><input name="displayName" value="Playlist fichier" /></div>
              <div class="form-row"><label>Fichier</label><input name="file" type="file" accept=".m3u,.m3u8,audio/x-mpegurl,text/plain" /></div>
              <button class="btn" data-focus data-action="add-m3u-file">Importer fichier</button>
            </form>
          </div>
          <div class="panel">
            <h3>Profil · ${escapeHtml(state.activeProfile?.name || '—')}</h3>
            <p class="muted settings-lead">Favoris et groupes visibles sont séparés par profil.</p>
            <div class="actions settings-actions">
              <button class="btn" data-focus data-action="group-manage" data-section="tv">Groupes TV</button>
              <button class="btn" data-focus data-action="group-manage" data-section="films">Groupes films</button>
              <button class="btn" data-focus data-action="group-manage" data-section="series">Groupes séries</button>
            </div>
            <div class="list-row">
              <span>Audio préféré</span>
              <select data-focus id="langSelectSettings" data-lang-field="audio">
                ${(state.languageChoices?.audio || []).map((l) =>
                  `<option value="${escapeAttr(l.value)}" ${(p.preferredAudioLanguage || p.preferredLanguage) === l.value ? 'selected' : ''}>${escapeHtml(l.label)}</option>`).join('')}
              </select>
            </div>
            <div class="list-row">
              <span>Sous-titres préférés</span>
              <select data-focus id="subsLangSelectSettings" data-lang-field="subtitle">
                ${(state.languageChoices?.subtitles || []).map((l) =>
                  `<option value="${escapeAttr(l.value)}" ${(p.preferredSubtitleLanguage || 'fr') === l.value ? 'selected' : ''}>${escapeHtml(l.label)}</option>`).join('')}
              </select>
            </div>
            <div class="list-row">
              <span>Langue de l'interface</span>
              <select data-focus id="uiLangSelectSettings" data-lang-field="interface">
                ${(state.languageChoices?.interface || []).map((l) =>
                  `<option value="${escapeAttr(l.value)}" ${(p.interfaceLanguage || 'fr') === l.value ? 'selected' : ''}>${escapeHtml(l.label)}</option>`).join('')}
              </select>
            </div>
            <div class="list-row">
              <span>Réduire les animations</span>
              <button class="btn ghost" data-focus data-action="toggle-motion">${p.reduceMotion ? 'Oui' : 'Non'}</button>
            </div>
            <div class="list-row">
              <span>Épisode suivant auto</span>
              <button class="btn ghost" data-focus data-action="toggle-autoplay-next">${p.autoplayNextEpisode !== false ? 'Oui' : 'Non'}</button>
            </div>
            <div class="list-row">
              <span>Aperçu Live TV automatique</span>
              <button class="btn ghost" data-focus data-action="toggle-live-preview">${p.livePreviewEnabled !== false ? 'Oui' : 'Non'}</button>
            </div>
            <div class="list-row">
              <span>Sync auto (processus vivant)</span>
              <select data-focus id="autoSyncSelect">
                ${[[0, 'Off'], [30, '30 min'], [60, '1 h'], [180, '3 h'], [360, '6 h']].map(([v, lab]) =>
                  `<option value="${v}" ${(state.settings?.autoSyncMinutes || 0) === v ? 'selected' : ''}>${lab}</option>`).join('')}
              </select>
            </div>
            <p class="muted">Catalogue : ${state.catalogTitleCount} · Films ${state.filmCount || 0} · Séries ${state.seriesCount || 0} · TV ${state.liveCount || 0}</p>
            <p class="muted">Favoris ${(p.favoriteIds || []).length} · Liste ${(p.watchLaterIds || []).length} · Masqués ${(p.hiddenItemIds || []).length}</p>
            <p class="muted">Si le serveur Node est arrêté, la sync auto s’arrête ; les prefs restent dans <code>web-preview/.data/</code>.</p>
          </div>
        </div>
      </div>
      ${renderGroupSetup()}
    </section>`;
  return renderAppShell(
    'settings',
    'Réglages',
    settingsBody,
    `<button class="pill" data-focus data-action="sync">${state.syncing ? 'Sync…' : 'Actualiser'}</button>`
  );
}

function render() {
  const onPlayer = state?.screen === 'player';
  bannerEl.hidden = onPlayer;
  bannerEl.textContent = state?.previewDisclaimer || '';
  const hintBar = document.getElementById('hintBar');
  if (hintBar) hintBar.hidden = onPlayer;
  appEl.classList.add('has-banner');

  let html;
  switch (state.screen) {
    case 'splash': html = renderSplash(); break;
    case 'profiles': html = renderProfiles(); break;
    case 'hub': html = renderHub(); break;
    case 'films': html = renderCatalog('films'); break;
    case 'series': html = renderCatalog('series'); break;
    case 'detail': html = renderDetail(); break;
    case 'settings': html = renderSettings(); break;
    case 'tv': html = renderLiveTv(); break;
    case 'search': html = renderSearch(); break;
    case 'player': html = renderPlayer(); break;
    case 'epg':
      html = renderEpg();
      break;
    case 'library':
      html = renderPlaceholder('library', 'Bibliothèque', 'Favoris / à regarder — listes actives via fiches et préférences profil.');
      break;
    default: html = renderSplash();
  }
  const prevStream = playerRuntime?.streamId || null;
  const nextStream = state.screen === 'player' ? state.player?.streamId : null;
  if (state.screen !== 'player') destroyPlayerRuntime();
  if (state.screen !== 'tv') destroyLivePreview();
  appEl.innerHTML = renderUiErrorBanner() + html;
  wireActions();
  registerFocusables();
  appEl.focus({ preventScroll: true });
  if (state.screen === 'player' && nextStream && nextStream !== prevStream) {
    initPlayerVideo();
  } else if (state.screen === 'player' && nextStream && prevStream === nextStream && !document.getElementById('lksVideo')?.src && !playerRuntime) {
    initPlayerVideo();
  } else if (state.screen === 'player' && playerRuntime) {
    // Re-bind video element after DOM replace if same stream — force re-init safely
    initPlayerVideo();
  }
  if (state.screen === 'tv') scheduleLivePreview();
  if (state.screen === 'search') wireSearchInput();
  if (state.groupSetup?.open) wireGroupSetupSearch();
}

function wireGroupSetupSearch() {
  const input = document.getElementById('groupSetupSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    groupSetupUi.search = input.value;
    groupSetupUi.windowStart = 0;
    const pos = input.selectionStart;
    render();
    const again = document.getElementById('groupSetupSearch');
    if (again) {
      again.focus();
      try {
        again.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    }
  });
}

function wireSearchInput() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    const q = input.value;
    const req = ++searchRequestId;
    searchDebounceTimer = setTimeout(async () => {
      if (req !== searchRequestId) return;
      try {
        const next = await api('/api/search', {
          query: q,
          filter: state.search?.filter || 'all',
          offset: 0,
          remember: false
        });
        if (req !== searchRequestId) return;
        setState(next);
        const again = document.getElementById('searchInput');
        if (again) {
          again.focus();
          const len = again.value.length;
          again.setSelectionRange(len, len);
        }
      } catch (e) {
        console.warn(e);
      }
    }, 220);
  });
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchDebounceTimer);
      setState(await api('/api/search', {
        query: input.value,
        filter: state.search?.filter || 'all',
        offset: 0,
        remember: true
      }));
    }
  });
}

let playerRuntime = null;
let livePreviewRuntime = null;
let livePreviewTimer = null;
let livePreviewToken = 0;

function destroyPlayerRuntime(opts = {}) {
  if (!playerRuntime) return;
  try {
    playerRuntime.cleanup(opts);
  } catch {
    /* ignore */
  }
  playerRuntime = null;
}

function destroyLivePreview() {
  clearTimeout(livePreviewTimer);
  livePreviewTimer = null;
  livePreviewToken += 1;
  if (!livePreviewRuntime) return;
  try {
    livePreviewRuntime.cleanup();
  } catch {
    /* ignore */
  }
  livePreviewRuntime = null;
}

function scheduleLivePreview() {
  clearTimeout(livePreviewTimer);
  const frame = document.querySelector('.live-preview-frame');
  const statusEl = document.getElementById('livePreviewStatus');
  const video = document.getElementById('livePreviewVideo');
  const muteBtn = document.getElementById('livePreviewMuteBtn');
  if (!frame || !video) return;

  if (state.preferences?.livePreviewEnabled === false) {
    destroyLivePreview();
    if (statusEl) statusEl.textContent = 'Aperçu désactivé';
    return;
  }

  const streamId = frame.dataset.stream;
  const channelId = frame.dataset.channelId;
  if (!streamId) {
    destroyLivePreview();
    if (statusEl) statusEl.textContent = 'Sélectionnez une chaîne';
    return;
  }

  // Same channel: if DOM was replaced, restart; otherwise keep single instance.
  if (livePreviewRuntime?.channelId === channelId && livePreviewRuntime?.alive) {
    if (livePreviewRuntime.videoEl === video && (video.src || video.querySelector?.('source') || video.readyState > 0)) {
      if (statusEl) statusEl.textContent = livePreviewRuntime.confirmed ? 'En direct' : 'Chargement…';
      if (muteBtn) muteBtn.textContent = video.muted ? '🔇' : '🔊';
      return;
    }
    // Video node was recreated by render() — cancel old load and restart.
  }

  destroyLivePreview();
  if (statusEl) statusEl.textContent = 'Aperçu…';
  const token = ++livePreviewToken;
  livePreviewTimer = setTimeout(() => {
    if (token !== livePreviewToken) return;
    startLivePreview(streamId, channelId, token);
  }, 500);
}

async function startLivePreview(streamId, channelId, token) {
  const video = document.getElementById('livePreviewVideo');
  const statusEl = document.getElementById('livePreviewStatus');
  const logoEl = document.getElementById('livePreviewLogo');
  if (!video || token !== livePreviewToken) return;
  if (statusEl) statusEl.textContent = 'Connexion…';

  let playUrl = null;
  let mode = 'progressive';
  try {
    const prev = await api('/api/live/preview', { streamId, channelId });
    if (!prev.enabled) {
      if (statusEl) statusEl.textContent = 'Aperçu désactivé';
      return;
    }
    playUrl = prev.playUrl;
    mode = prev.mode || 'progressive';
  } catch (e) {
    if (statusEl) statusEl.textContent = e.message || 'Aperçu indisponible';
    return;
  }

  if (token !== livePreviewToken || !playUrl) {
    if (statusEl) statusEl.textContent = 'Flux indisponible';
    return;
  }

  video.muted = true;
  let hlsRef = null;
  let confirmed = false;
  const muteBtn = document.getElementById('livePreviewMuteBtn');
  if (muteBtn) muteBtn.textContent = '🔇';
  const confirm = () => {
    if (confirmed || video.videoWidth <= 0) return;
    confirmed = true;
    if (statusEl) statusEl.textContent = 'En direct';
    if (livePreviewRuntime) livePreviewRuntime.confirmed = true;
  };

  try {
    if (mode === 'hls' && window.Hls && window.Hls.isSupported()) {
      hlsRef = new window.Hls({
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 12,
        liveSyncDurationCount: 3
      });
      hlsRef.loadSource(playUrl);
      hlsRef.attachMedia(video);
      hlsRef.on(window.Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hlsRef.on(window.Hls.Events.ERROR, (_, data) => {
        if (data?.fatal && statusEl) {
          statusEl.textContent = 'Flux incompatible ou indisponible';
          if (logoEl) logoEl.hidden = false;
        }
      });
    } else {
      video.src = playUrl;
      video.play().catch(() => {});
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Aperçu impossible';
    if (logoEl) logoEl.hidden = false;
    return;
  }

  const onTime = () => confirm();
  video.addEventListener('playing', onTime);
  video.addEventListener('timeupdate', onTime);

  livePreviewRuntime = {
    channelId,
    alive: true,
    confirmed: false,
    playUrl,
    streamId,
    videoEl: video,
    cleanup() {
      this.alive = false;
      video.removeEventListener('playing', onTime);
      video.removeEventListener('timeupdate', onTime);
      if (hlsRef) {
        try {
          hlsRef.destroy();
        } catch {
          /* ignore */
        }
        hlsRef = null;
      }
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        /* ignore */
      }
    }
  };
  setTimeout(() => {
    if (token === livePreviewToken && !confirmed && statusEl) {
      statusEl.textContent = 'Pas d’image — flux incompatible ou lent';
      if (logoEl) logoEl.hidden = false;
    }
  }, 12000);
}

function initPlayerVideo() {
  destroyPlayerRuntime();
  const video = document.getElementById('lksVideo');
  const note = document.getElementById('playerNote');
  const liveDiag = document.getElementById('playerLiveDiag');
  const playerApp = document.getElementById('playerApp');
  const playBtn = document.getElementById('playerPlayBtn');
  const playIcon = document.getElementById('playerPlayIcon');
  const bottomPlay = document.getElementById('playerBottomPlay');
  const filledEl = document.getElementById('playerFilled');
  const loadedEl = document.getElementById('playerLoaded');
  const progressEl = document.getElementById('playerProgress');
  const timeCur = document.getElementById('playerTimeCur');
  const timeDur = document.getElementById('playerTimeDur');
  const bufferState = document.getElementById('playerBufferState');
  const nextEpBtn = document.getElementById('playerNextEpBtn');
  const skipIntroBtn = document.getElementById('playerSkipIntroBtn');
  const audioBtn = document.getElementById('playerAudioBtn');
  const subsBtn = document.getElementById('playerSubsBtn');
  const qualityBtn = document.getElementById('playerQualityBtn');
  const retryBtn = document.getElementById('playerRetryBtn');
  const errorEl = document.getElementById('playerError');
  const errorTitle = document.getElementById('playerErrorTitle');
  const errorBody = document.getElementById('playerErrorBody');
  const muteBtn = document.getElementById('playerMuteBtn');
  const pl = state.player;
  if (!video || !pl?.playUrl) return;

  const src = pl.playUrl;
  const sniff = pl.diagnostic?.sniff || {};
  const isLive = !!pl.isLive;
  const incompatible =
    !isLive &&
    (pl.mode === 'incompatible' ||
      pl.ext === 'mkv' ||
      sniff.container === 'mkv' ||
      sniff.videoCodec === 'hevc' ||
      sniff.videoCodec === 'mpeg2');
  let confirmed = false;
  let metaSeen = false;
  // Heuristic "maybe incompatible" is a warning only — never pre-fatal.
  let fatalKind = null; // null | incompatible | network | decode
  let loading = true;
  let lastReport = 0;
  let lastProgressSave = 0;
  let hlsRef = null;
  let hideTimer = null;
  let controlsVisible = true;

  const setPlayPaths = (paused) => {
    const path = paused ? PV3_SVG.play : PV3_SVG.pause;
    if (playIcon) playIcon.innerHTML = path;
    if (bottomPlay) {
      const svg = bottomPlay.querySelector('svg');
      if (svg) svg.innerHTML = path;
    }
  };

  const setErrorBanner = (show, title, body) => {
    if (!errorEl) return;
    errorEl.classList.toggle('show', !!show);
    if (title && errorTitle) errorTitle.textContent = title;
    if (body && errorBody) errorBody.textContent = body;
  };

  const setNote = (msg) => {
    if (note) note.textContent = msg || '';
    if (!msg) {
      if (!fatalKind) setErrorBanner(false);
      return;
    }
    if (fatalKind) {
      setErrorBanner(
        true,
        fatalKind === 'incompatible' ? 'Format non compatible avec ce navigateur' : 'Lecture interrompue',
        msg
      );
    }
  };

  const setRetryVisible = (show) => {
    if (retryBtn) retryBtn.hidden = !show;
  };

  const drawerOpen = () =>
    !!(document.getElementById('playerEpisodes')?.classList.contains('open')
      || document.getElementById('playerChannels')?.classList.contains('open')
      || document.getElementById('playerSettings')?.classList.contains('open'));

  const syncPlayBtn = () => {
    if (!playBtn) return;
    playBtn.classList.remove('is-play', 'is-pause', 'is-loading', 'is-error');
    if (fatalKind === 'incompatible') {
      playBtn.classList.add('is-error');
      setPlayPaths(true);
      playBtn.setAttribute('aria-label', 'Format incompatible');
      playBtn.disabled = true;
      setRetryVisible(false);
      return;
    }
    playBtn.disabled = false;
    if (fatalKind === 'network' || fatalKind === 'decode') {
      playBtn.classList.add('is-error');
      setPlayPaths(true);
      playBtn.setAttribute('aria-label', 'Réessayer');
      setRetryVisible(true);
      return;
    }
    if (loading && !confirmed) {
      playBtn.classList.add('is-loading');
      setPlayPaths(true);
      playBtn.setAttribute('aria-label', 'Chargement');
      setRetryVisible(false);
      return;
    }
    const reallyPlaying = !video.paused && (confirmed || (isLive && video.videoWidth > 0));
    if (reallyPlaying) {
      playBtn.classList.add('is-pause');
      setPlayPaths(false);
      playBtn.setAttribute('aria-label', 'Pause');
    } else {
      playBtn.classList.add('is-play');
      setPlayPaths(true);
      playBtn.setAttribute('aria-label', 'Lecture');
    }
    setRetryVisible(false);
  };

  const showControls = (sticky = false) => {
    controlsVisible = true;
    playerApp?.classList.remove('idle');
    clearTimeout(hideTimer);
    const canHide = !sticky && !fatalKind && confirmed && !video.paused && !drawerOpen();
    if (canHide) {
      hideTimer = setTimeout(() => {
        if (!video.paused && confirmed && !fatalKind && !drawerOpen()) {
          controlsVisible = false;
          playerApp?.classList.add('idle');
        }
      }, 3500);
    }
  };

  const report = (event, extra = {}) => {
    const payload = {
      event,
      readyState: video.readyState,
      networkState: video.networkState,
      currentTime: video.currentTime,
      duration: video.duration,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      paused: video.paused,
      errorCode: video.error ? video.error.code : null,
      ...extra
    };
    if (liveDiag) {
      liveDiag.textContent =
        `evt=${event} readyState=${video.readyState} networkState=${video.networkState} ` +
        `t=${video.currentTime.toFixed(2)}/${Number.isFinite(video.duration) ? video.duration.toFixed(1) : '—'} ` +
        `size=${video.videoWidth}x${video.videoHeight}` +
        (video.error ? ` mediaError=${video.error.code}` : '');
    }
    const now = Date.now();
    if (event === 'timeupdate' && now - lastReport < 900) return;
    lastReport = now;
    fetch('/api/player/client-diag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  };

  const progressPayload = () => {
    if (isLive || !pl.contentId || !confirmed || fatalKind) return null;
    const dur = video.duration;
    if (!Number.isFinite(dur) || dur < 5) return null;
    const fraction = Math.min(0.995, Math.max(0, video.currentTime / dur));
    return {
      contentId: pl.contentId,
      episodeId: pl.episodeId || null,
      streamId: pl.streamId || null,
      sourceId: pl.diagnostic?.sourceId || null,
      season: pl.episodeNav?.current?.season ?? null,
      episode: pl.episodeNav?.current?.episode ?? null,
      episodeTitle: pl.episodeNav?.current?.title || '',
      fraction,
      positionMs: Math.round(Math.max(0, video.currentTime) * 1000),
      durationMs: Math.round(dur * 1000),
      confirmed: true
    };
  };

  const saveProgress = (force = false) => {
    const payload = progressPayload();
    if (!payload) return Promise.resolve(null);
    // Only persist meaningful progress (or forced close/pause flush of current position).
    if (!force && !(payload.fraction > 0.02)) return Promise.resolve(null);
    const now = Date.now();
    if (!force && now - lastProgressSave < 5000) return Promise.resolve(null);
    lastProgressSave = now;
    return fetch('/api/player/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => null);
  };

  const updateChrome = () => {
    if (!isLive && Number.isFinite(video.duration) && video.duration > 0) {
      const pct = Math.max(0, Math.min(100, (100 * video.currentTime) / video.duration));
      if (filledEl) filledEl.style.width = `${pct}%`;
      if (progressEl) progressEl.setAttribute('aria-valuenow', String(Math.round(pct)));
      if (loadedEl && video.buffered?.length) {
        try {
          const end = video.buffered.end(video.buffered.length - 1);
          loadedEl.style.width = `${Math.max(0, Math.min(100, (100 * end) / video.duration))}%`;
        } catch {
          /* ignore */
        }
      }
    }
    if (timeCur) timeCur.textContent = formatPlayerTime(video.currentTime || 0);
    if (timeDur) {
      timeDur.textContent = Number.isFinite(video.duration)
        ? formatPlayerTime(video.duration)
        : '0:00';
    }
    if (nextEpBtn && Number.isFinite(video.duration) && video.duration > 0) {
      const remain = video.duration - video.currentTime;
      nextEpBtn.hidden = !(remain < 45 && remain > 0.5);
    }
    if (skipIntroBtn && pl.introMarkers) {
      const start = Number(pl.introMarkers.introStartSec || 0);
      const end = Number(pl.introMarkers.introEndSec);
      const t = video.currentTime;
      skipIntroBtn.hidden = !(
        Number.isFinite(end) &&
        t >= start &&
        t < end - 0.25
      );
    }
    if (bufferState && isLive) {
      bufferState.textContent =
        video.readyState < 2 ? 'buffering…' : confirmed ? (pl.title || 'live') : 'démarrage…';
    }
    if (muteBtn) muteBtn.style.opacity = video.muted ? '.4' : '1';
    syncPlayBtn();
  };

  const refreshTrackChips = () => {
    const editionLangs = pl.availableEpisodeLanguages || [];
    const audioTracks = hlsRef?.audioTracks || [];
    const textTracks = hlsRef?.subtitleTracks || [];
    const levels = hlsRef?.levels || [];
    const trackLabel = (t, fallback) => {
      const code = t?.lang || t?.language || '';
      if (code) {
        try {
          const name = new Intl.DisplayNames(['fr'], { type: 'language' }).of(String(code).replace(/_/g, '-'));
          if (name) return name.charAt(0).toUpperCase() + name.slice(1);
        } catch { /* ignore */ }
        return String(code).toUpperCase();
      }
      return t?.name || fallback;
    };
    if (audioBtn) {
      const hasHlsAudio = audioTracks.length >= 2;
      const hasEditions = editionLangs.length >= 2;
      audioBtn.hidden = !hasHlsAudio && !hasEditions;
      if (!audioBtn.hidden) {
        if (hasHlsAudio) {
          const cur = audioTracks[hlsRef.audioTrack];
          audioBtn.textContent = trackLabel(cur, `Audio ${hlsRef.audioTrack + 1}`);
          audioBtn.title = audioTracks
            .map((t, i) => `${i === hlsRef.audioTrack ? '● ' : ''}${trackLabel(t, `Audio ${i + 1}`)}`)
            .join(' · ');
        } else {
          const cur = editionLangs.find((l) => l.streamId === pl.streamId) || editionLangs[0];
          audioBtn.textContent = cur?.label || 'Audio';
          audioBtn.title = editionLangs
            .map((l) => `${l.streamId === pl.streamId ? '● ' : ''}${l.label}${l.requiresNewStream ? ' (autre flux)' : ''}`)
            .join(' · ');
        }
      }
    }
    if (!hlsRef) {
      if (subsBtn) subsBtn.hidden = true;
      if (qualityBtn) qualityBtn.hidden = true;
      return;
    }
    if (subsBtn) {
      subsBtn.hidden = textTracks.length < 1;
      if (!subsBtn.hidden) {
        const idx = hlsRef.subtitleTrack;
        subsBtn.textContent =
          idx < 0 ? 'ST off' : trackLabel(textTracks[idx], 'ST');
        subsBtn.title = ['Off', ...textTracks.map((t, i) => trackLabel(t, `ST ${i + 1}`))].join(' · ');
      }
    }
    if (qualityBtn) {
      qualityBtn.hidden = levels.length < 2;
      if (!qualityBtn.hidden) {
        const auto = hlsRef.currentLevel < 0;
        const lvl = levels[hlsRef.currentLevel] || levels[hlsRef.loadLevel];
        qualityBtn.textContent = auto
          ? 'Auto'
          : lvl?.height
            ? `${lvl.height}p`
            : `Q${hlsRef.currentLevel + 1}`;
      }
    }
    const audioList = document.getElementById('playerAudioTracksList');
    if (audioList) {
      if (audioTracks.length) {
        audioList.innerHTML = audioTracks.map((t, i) => `
          <button class="item ${i === hlsRef.audioTrack ? 'active' : ''}" data-focus data-action="player-audio-pick" data-id="${i}">
            <div class="itemtext"><b>${escapeHtml(trackLabel(t, `Audio ${i + 1}`))}</b><span>Piste média</span></div>
          </button>`).join('');
      } else {
        audioList.innerHTML = '<p class="muted" style="padding:8px 12px">Aucune piste audio multi-track détectée dans ce flux.</p>';
      }
    }
    const textList = document.getElementById('playerTextTracksList');
    if (textList) {
      if (textTracks.length) {
        textList.innerHTML = [
          `<button class="item ${hlsRef.subtitleTrack < 0 ? 'active' : ''}" data-focus data-action="player-subs-pick" data-id="-1">
            <div class="itemtext"><b>Désactivés</b><span>Sous-titres</span></div></button>`,
          ...textTracks.map((t, i) => `
            <button class="item ${i === hlsRef.subtitleTrack ? 'active' : ''}" data-focus data-action="player-subs-pick" data-id="${i}">
              <div class="itemtext"><b>${escapeHtml(trackLabel(t, `ST ${i + 1}`))}</b><span>Sous-titres</span></div>
            </button>`)
        ].join('');
      } else {
        textList.innerHTML = '<p class="muted" style="padding:8px 12px">Aucun sous-titre détecté dans ce flux.</p>';
      }
    }
    const qualityList = document.getElementById('playerQualityList');
    if (qualityList) {
      if (levels.length >= 2) {
        qualityList.innerHTML = [
          `<button class="item ${hlsRef.currentLevel < 0 ? 'active' : ''}" data-focus data-action="player-quality-pick" data-id="-1">
            <div class="itemtext"><b>Auto</b><span>Selon le réseau</span></div></button>`,
          ...levels.map((lvl, i) => {
            const label = lvl.height ? `${lvl.height}p` : `Niveau ${i + 1}`;
            const bit = lvl.bitrate ? ` · ${Math.round(lvl.bitrate / 1000)} kb/s` : '';
            return `<button class="item ${i === hlsRef.currentLevel ? 'active' : ''}" data-focus data-action="player-quality-pick" data-id="${i}">
              <div class="itemtext"><b>${escapeHtml(label)}</b><span>Variante HLS${bit}</span></div></button>`;
          })
        ].join('');
      } else {
        qualityList.innerHTML = '<p class="muted" style="padding:8px 12px">Aucune variante de qualité exposée par le flux.</p>';
      }
    }
  };

  const confirmPlayback = (why) => {
    if (confirmed || fatalKind) return;
    // Live: currentTime can stay near 0 on some HLS sliding windows — require frames
    const timeOk = isLive ? video.currentTime >= 0 : video.currentTime > 0.05;
    if (timeOk && video.videoWidth > 0 && !video.paused) {
      confirmed = true;
      loading = false;
      fatalKind = null;
      clearTimeout(watchdog);
      clearInterval(progressWatch);
      setErrorBanner(false);
      setNote('');
      report('confirmed', { note: why });
      syncPlayBtn();
      showControls();
    }
  };

  const fail = (msg, kind = 'network', hard = true) => {
    loading = false;
    fatalKind = kind;
    setNote(msg);
    report('fail', { note: msg, kind });
    syncPlayBtn();
    showControls(true);
    if (hard) {
      clearTimeout(watchdog);
      clearInterval(progressWatch);
      try {
        video.pause();
      } catch {
        /* ignore */
      }
      if (hlsRef) {
        try {
          hlsRef.destroy();
        } catch {
          /* ignore */
        }
        hlsRef = null;
      }
    }
  };

  const onVideoEvent = (evt) => {
    if (evt === 'loadstart' || evt === 'waiting') loading = !confirmed;
    if (evt === 'loadedmetadata') {
      metaSeen = true;
      if (!isLive && Number.isFinite(video.duration) && video.duration > 5) {
        let seekSec = null;
        if (Number.isFinite(pl.resumePositionSec) && pl.resumePositionSec > 0) {
          seekSec = pl.resumePositionSec;
        } else if (pl.progressFraction > 0.02 && pl.progressFraction < 0.95) {
          seekSec = Math.max(0, pl.progressFraction * video.duration - 4);
        }
        if (seekSec != null && seekSec > 1 && seekSec < video.duration - 1) {
          video.currentTime = seekSec;
        }
      }
      if (!confirmed && !fatalKind) {
        setNote(isLive ? 'Playlist reçue…' : 'Chargement…');
      }
    }
    if (evt === 'playing') {
      if (!fatalKind) loading = false;
      setTimeout(() => confirmPlayback('playing+tick'), 400);
      showControls();
    }
    if (evt === 'pause') {
      syncPlayBtn();
      showControls(true);
      saveProgress(true);
    }
    if (evt === 'waiting' || evt === 'stalled') {
      if (bufferState) bufferState.textContent = 'buffering…';
      if (!confirmed && !fatalKind) {
        loading = true;
        setNote('Buffer…');
      }
    }
    if (evt === 'error') {
      const code = video.error?.code;
      const likelyContainerFail =
        incompatible ||
        sniff.container === 'mkv' ||
        sniff.videoCodec === 'hevc' ||
        sniff.videoCodec === 'mpeg2' ||
        pl.ext === 'mkv';
      // MEDIA_ERR_SRC_NOT_SUPPORTED (4): real demux/decode failure after attempt.
      // Heuristic alone must never skip play(); only this path marks incompatible.
      if (code === 4 && likelyContainerFail) {
        fail(
          `Ce format n’est pas lisible dans Chrome (${sniff.videoCodec || sniff.container || pl.ext || 'codec'}). Utilisez Media3 sur Android TV.`,
          'incompatible'
        );
      } else if (code === 4) {
        fail(
          `Source non lisible dans ce navigateur (${sniff.videoCodec || sniff.container || pl.ext || 'média'}). Réessayez ou utilisez Media3 Android.`,
          'decode'
        );
      } else if (code === 3 && likelyContainerFail) {
        fail(
          `Décodage impossible (${sniff.videoCodec || sniff.container || pl.ext || 'codec'}). Media3 Android recommandé.`,
          'incompatible'
        );
      } else if (code === 2) {
        fail('Erreur réseau temporaire. Vous pouvez réessayer.', 'network');
      } else if (code === 3) {
        fail('Décodage impossible dans ce navigateur. Media3 Android recommandé.', 'decode');
      } else {
        fail(`Lecture interrompue (${code || '?'}).`, 'network');
      }
    }
    if (evt === 'ended' && pl.autoplayNextEpisode && pl.episodeNav?.next?.streamId) {
      const done = progressPayload();
      if (done) {
        // Mark near-complete before switching episode
        done.fraction = Math.max(done.fraction, 0.99);
        fetch('/api/player/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(done)
        }).catch(() => {});
      }
      api('/api/player/open', playerOpenBody({
        streamId: pl.episodeNav.next.streamId,
        episodeId: pl.episodeNav.next.id || null,
        returnScreen: pl.returnTo?.screen || 'detail'
      })).then(setState);
      return;
    }
    report(evt);
    updateChrome();
    if (evt === 'timeupdate') {
      confirmPlayback('timeupdate');
      saveProgress();
    }
  };

  const events = [
    'loadstart',
    'loadedmetadata',
    'loadeddata',
    'canplay',
    'playing',
    'pause',
    'waiting',
    'stalled',
    'progress',
    'timeupdate',
    'error',
    'ended'
  ];
  events.forEach((evt) => video.addEventListener(evt, () => onVideoEvent(evt)));

  const onMove = () => showControls();
  playerApp?.addEventListener('mousemove', onMove);
  playerApp?.addEventListener('click', (e) => {
    if (e.target === video || e.target?.classList?.contains('art') || e.target?.classList?.contains('ambient')) {
      if (controlsVisible && !drawerOpen()) {
        controlsVisible = false;
        playerApp.classList.add('idle');
      } else showControls();
    } else {
      showControls();
    }
  });

  if (progressEl && !isLive) {
    progressEl.addEventListener('click', (e) => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const r = progressEl.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      video.currentTime = ratio * video.duration;
      updateChrome();
      showControls();
      saveProgress(true);
    });
    progressEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        video.currentTime = Math.max(
          0,
          Math.min(
            video.duration || 0,
            video.currentTime + (e.key === 'ArrowRight' ? 10 : -10)
          )
        );
        updateChrome();
        showControls();
        saveProgress(true);
      }
    });
  }

  const watchdog = setTimeout(() => {
    if (confirmed || fatalKind) return;
    if (metaSeen && video.videoWidth === 0) {
      fail(
        incompatible
          ? `Format incompatible avec Chrome (${sniff.videoCodec || sniff.container || pl.ext || '?'}). Media3 Android recommandé.`
          : 'Aucune image après 18 s. Vérifiez le réseau ou réessayez.',
        incompatible ? 'incompatible' : 'network'
      );
    } else if (!metaSeen) {
      fail(
        incompatible
          ? `Aucune métadonnée — format probablement incompatible (${sniff.videoCodec || sniff.container || pl.ext || '?'}).`
          : 'Délai réseau — aucune métadonnée reçue. Vous pouvez réessayer.',
        incompatible ? 'incompatible' : 'network'
      );
    }
  }, 18000);

  const progressWatch = setInterval(() => {
    updateChrome();
    confirmPlayback('poll');
  }, 500);

  const tryPlay = () => {
    const p = video.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        report('playPromise', { playPromise: 'resolved' });
        setTimeout(() => confirmPlayback('playPromise'), 500);
      }).catch((err) => {
        report('playPromise', { playPromise: 'rejected', note: String(err?.message || err) });
        // Autoplay policy / transient — keep trying via user Play, do not mark incompatible.
        loading = false;
        setNote(`Lecture en attente : ${err?.message || err}. Appuyez sur Lecture.`);
        syncPlayBtn();
        showControls(true);
      });
    }
  };

  // Soft warning only — still attach src / hls and attempt real playback.
  if (incompatible) {
    setNote(
      `Format potentiellement peu compatible (${sniff.videoCodec || sniff.container || pl.ext || 'inconnu'}) — tentative de lecture…`
    );
    report('compat_warn', {
      note: `heuristic incompatible; attempting play anyway (${sniff.videoCodec}/${sniff.container}/${pl.ext})`
    });
  }

  syncPlayBtn();
  showControls(true);

  try {
    if (pl.mode === 'hls' && window.Hls && window.Hls.isSupported()) {
      hlsRef = new window.Hls({
        enableWorker: true,
        lowLatencyMode: isLive,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 8,
        maxBufferLength: isLive ? 20 : 40,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        }
      });
      hlsRef.loadSource(src);
      hlsRef.attachMedia(video);
      hlsRef.on(window.Hls.Events.MANIFEST_PARSED, () => {
        refreshTrackChips();
        tryPlay();
      });
      hlsRef.on(window.Hls.Events.LEVEL_SWITCHED, () => refreshTrackChips());
      hlsRef.on(window.Hls.Events.ERROR, (_, data) => {
        report('hlsError', { note: `${data?.type}/${data?.details}` });
        if (data?.fatal) {
          if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
            setNote(`HLS réseau (${data.details}) — tentative de récupération…`);
            try {
              hlsRef.startLoad();
            } catch {
              fail(`HLS fatal réseau: ${data.details}`);
            }
          } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              hlsRef.recoverMediaError();
            } catch {
              fail(`HLS fatal média: ${data.details}`);
            }
          } else {
            fail(`HLS fatal: ${data.type}/${data.details}`);
          }
        }
      });
    } else if (pl.mode === 'hls' && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      tryPlay();
    } else {
      video.src = src;
      tryPlay();
    }
  } catch (e) {
    fail(e.message || 'Échec init lecteur');
  }

  showControls(true);
  playerRuntime = {
    video,
    streamId: pl.streamId || null,
    get hls() {
      return hlsRef;
    },
    showControls,
    refreshTrackChips,
    /** Snapshot for atomic close — only when playback was confirmed. */
    getProgressPayload() {
      return progressPayload();
    },
    cleanup({ skipSave = false } = {}) {
      if (!skipSave) saveProgress(true);
      clearTimeout(watchdog);
      clearInterval(progressWatch);
      clearTimeout(hideTimer);
      if (hlsRef) {
        try {
          hlsRef.destroy();
        } catch {
          /* ignore */
        }
        hlsRef = null;
      }
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        /* ignore */
      }
    }
  };
}

/** Close player: flush confirmed progress in the same request as close, then refresh hub. */
async function closePlayerAndRefresh() {
  const progress = playerRuntime?.getProgressPayload?.() || null;
  destroyPlayerRuntime({ skipSave: true });
  return api('/api/player/close', { progress });
}

function wireActions() {
  appEl.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', async (ev) => {
      const action = el.dataset.action;
      try {
        if (action === 'skip-splash') {
          clearTimeout(splashTimer);
          await navigate({ screen: 'profiles' });
        } else if (action === 'select-profile') {
          setState(await api('/api/profile/select', { profileId: el.dataset.id }));
        } else if (action === 'add-profile') {
          alert('Ajout de profil : prévu sur Android ; démo web limitée à Alex / Sam.');
        } else if (action === 'nav') {
          await navigate({ screen: el.dataset.screen, customizeOpen: false });
        } else if (action === 'toggle-sidebar') {
          state.sidebarCompact = !state.sidebarCompact;
          render();
        } else if (action === 'open-search') {
          setState(await api('/api/search', { query: '', filter: 'all', offset: 0, ...navMeta() }));
          searchTyping = false;
          requestAnimationFrame(() => {
            registerFocusables();
            const idx = focusables.findIndex((el) => el.id === 'searchInput');
            if (idx >= 0) {
              focusIndex = idx;
              applyFocus();
            }
          });
        } else if (action === 'live-group') {
          setState(await api('/api/live/channels', { groupId: el.dataset.id, offset: 0 }));
        } else if (action === 'live-channel') {
          // Preview only — never auto-open fullscreen player.
          setState(await api('/api/live/select', { channelId: el.dataset.id }));
        } else if (action === 'live-preview-mute') {
          const video = document.getElementById('livePreviewVideo');
          const muteBtn = document.getElementById('livePreviewMuteBtn');
          if (video) {
            video.muted = !video.muted;
            if (muteBtn) muteBtn.textContent = video.muted ? '🔇' : '🔊';
          }
        } else if (action === 'live-more') {
          const cur = state.live?.channels;
          setState(await api('/api/live/channels', {
            groupId: state.live?.selectedGroupId,
            offset: cur?.items?.length || 0
          }));
        } else if (action === 'search-filter') {
          setState(await api('/api/search', {
            query: state.search?.query || document.getElementById('searchInput')?.value || '',
            filter: el.dataset.id,
            offset: 0,
            remember: false
          }));
        } else if (action === 'search-more') {
          const cur = state.search?.result;
          const next = await api('/api/search', {
            query: state.search?.query || '',
            filter: state.search?.filter || 'all',
            offset: (cur?.offset || 0) + (cur?.items?.length || 0),
            limit: 48,
            ...navMeta()
          });
          if (next.search?.result && cur?.items?.length) {
            next.search.result.items = [...cur.items, ...(next.search.result.items || [])];
            next.search.result.offset = 0;
          }
          setState(next);
        } else if (action === 'open-epg') {
          if (state.screen === 'player') {
            await closePlayerAndRefresh().then(setState);
          }
          setState(await api('/api/epg/guide', {
            groupId: state.live?.selectedGroupId || state.liveUi?.groupId || null,
            ...navMeta()
          }));
          restoreUiPosition();
        } else if (action === 'epg-refresh') {
          setState(await api('/api/epg/refresh', {
            groupId: state.epg?.groupId || state.live?.selectedGroupId || null
          }));
        } else if (action === 'epg-more') {
          setState(await api('/api/epg/guide', {
            groupId: state.epg?.groupId || null,
            offset: (state.epg?.offset || 0) + (state.epg?.rows?.length || 0),
            limit: state.epg?.limit || 40
          }));
        } else if (action === 'player-season-filter') {
          if (!state.player) return;
          state.player = { ...state.player, playerSeasonFilter: Number(el.dataset.season) };
          render();
          const panel = document.getElementById('playerEpisodes');
          panel?.classList.add('open');
          playerRuntime?.showControls?.(true);
        } else if (action === 'open-detail') {
          await navigate({ detailId: el.dataset.id });
        } else if (action === 'back-detail') escapeNav();
        else if (action === 'customize') await navigate({ screen: state.screen, customizeOpen: true });
        else if (action === 'close-customize') await navigate({ screen: state.screen, customizeOpen: false });
        else if (action === 'ui-error-dismiss') {
          clearUiError();
          render();
        } else if (action === 'ui-error-retry') {
          const fn = uiErrorRetry;
          clearUiError();
          if (fn) await fn();
        } else if (action === 'group-manage') {
          const section = el.dataset.section || state.screen;
          try {
            setState(await api('/api/groups/setup/open', {
              section,
              mode: 'manage'
            }));
          } catch (err) {
            showUiError(err.message || String(err), async () => {
              setState(await api('/api/groups/setup/open', { section, mode: 'manage' }));
            });
            return;
          }
        } else if (action === 'group-setup-close') {
          setState(await api('/api/groups/setup/close', {}));
        } else if (action === 'group-setup-back') {
          escapeNav();
        } else if (action === 'group-toggle') {
          syncGroupSetupDraft();
          if (groupSetupUi.selected.has(el.dataset.id)) groupSetupUi.selected.delete(el.dataset.id);
          else groupSetupUi.selected.add(el.dataset.id);
          render();
        } else if (action === 'group-select-page') {
          syncGroupSetupDraft();
          for (const g of filteredSetupGroups()) groupSetupUi.selected.add(g.id);
          render();
        } else if (action === 'group-deselect-page') {
          syncGroupSetupDraft();
          for (const g of filteredSetupGroups()) groupSetupUi.selected.delete(g.id);
          render();
        } else if (action === 'group-page-down') {
          groupSetupUi.windowStart += GROUP_SETUP_PAGE;
          render();
        } else if (action === 'group-page-up') {
          groupSetupUi.windowStart = Math.max(0, groupSetupUi.windowStart - GROUP_SETUP_PAGE);
          render();
        } else if (action === 'group-setup-save') {
          syncGroupSetupDraft();
          setState(await api('/api/groups/setup/save', {
            section: state.groupSetup?.section,
            selectedGroupIds: [...groupSetupUi.selected]
          }));
          if (state.screen === 'tv' && state.live?.sectionConfigured) {
            const gid = state.live?.groups?.[0]?.id || '__all__';
            setState(await api('/api/live/channels', { groupId: gid, offset: 0 }));
          }
        }
        else if (action === 'pick-version') setState(await api('/api/detail/version', { versionId: el.dataset.id }));
        else if (action === 'pick-edition') {
          const editionId = el.dataset.id;
          const lang = el.dataset.lang || '';
          if (lang) {
            setState(await api('/api/prefs/episode-language', { language: lang }));
          }
          if (editionId && editionId !== state.detail?.id) {
            setState(await api('/api/navigate', { detailId: editionId }));
          }
        }
        else if (action === 'pick-season') setState(await api('/api/detail/season', { season: Number(el.dataset.id) }));
        else if (action === 'detail-tab') {
          if (!state.detail) return;
          setState({
            ...state,
            detail: { ...state.detail, detailTab: el.dataset.id || 'overview' }
          });
        }
        else if (action === 'toggle-more') {
          if (!state.detail) return;
          setState({
            ...state,
            detail: { ...state.detail, moreOpen: !state.detail.moreOpen }
          });
        }
        else if (action === 'list') setState(await api('/api/lists/toggle', { list: el.dataset.list, itemId: el.dataset.id }));
        else if (action === 'import-sample') setState(await api('/api/sources/import-sample', {}));
        else if (action === 'load-demo') setState(await api('/api/sources/load-demo-showcase', {}));
        else if (action === 'sync') setState(await api('/api/sync', {}));
        else if (action === 'toggle-source') setState(await api('/api/sources/toggle', { sourceId: el.dataset.id }));
        else if (action === 'remove-source') {
          if (!confirm('Supprimer définitivement cette source ?')) return;
          setState(await api('/api/sources/remove', { sourceId: el.dataset.id, confirm: true }));
        }
        else if (action === 'toggle-group') setState(await api('/api/prefs/toggle-group', { groupId: el.dataset.id }));
        else if (action === 'toggle-row') setState(await api('/api/prefs/toggle-row', { rowId: el.dataset.id }));
        else if (action === 'toggle-motion') {
          setState(await api('/api/prefs/reduce-motion', { reduceMotion: !state.preferences.reduceMotion }));
        } else if (action === 'toggle-autoplay-next') {
          setState(await api('/api/prefs/autoplay-next', {
            autoplayNextEpisode: state.preferences.autoplayNextEpisode === false
          }));
        } else if (action === 'toggle-live-preview') {
          setState(await api('/api/prefs/live-preview', {
            livePreviewEnabled: state.preferences.livePreviewEnabled === false
          }));
        } else if (action === 'live-preview-fullscreen') {
          destroyLivePreview();
          setState(await api('/api/player/open', playerOpenBody({
            streamId: el.dataset.stream,
            fromLive: 1,
            channelId: el.dataset.channel || null,
            returnScreen: 'tv'
          })));
        } else if (action === 'play') {
          let streamId = el.dataset.stream || state.detail?.selectedVersionId;
          let episodeId = el.dataset.episodeId || null;
          // Series hero "Lire/Reprendre" without data-stream: resolve a real episode stream
          if (
            !el.dataset.stream &&
            state.detail?.type === 'SERIES' &&
            (state.detail.seasons || []).length
          ) {
            const eps = (state.detail.seasons || []).flatMap((s) =>
              (s.episodes || []).map((ep) => ({ ...ep, seasonNumber: s.number }))
            );
            const resume =
              eps.find((ep) => ep.watchState === 'in_progress') ||
              eps.find((ep) => ep.watchState !== 'completed') ||
              eps[0];
            if (resume) {
              streamId = resume.versions?.[0]?.id || streamId;
              episodeId = resume.id || episodeId;
            }
          }
          setState(await api('/api/player/open', playerOpenBody({
            streamId,
            episodeId,
            fromLive: el.dataset.fromLive === '1',
            channelId: el.dataset.channel || null,
            returnScreen: el.dataset.returnScreen
              || (el.dataset.fromLive === '1'
                ? 'tv'
                : state.detail
                  ? 'detail'
                  : state.screen)
          })));
        } else if (action === 'close-player') {
          if (closePlayerPanelsFirst()) return;
          setState(await closePlayerAndRefresh());
        } else if (action === 'player-toggle') {
          const btn = document.getElementById('playerPlayBtn');
          if (btn?.classList.contains('is-error') && !btn.disabled) {
            destroyPlayerRuntime();
            setState(await api('/api/player/open', playerOpenBody({
              streamId: state.player?.streamId,
              fromLive: state.player?.isLive ? 1 : 0,
              channelId: state.player?.liveNav?.channelId || null,
              returnScreen: state.player?.returnTo?.screen || 'hub'
            })));
            return;
          }
          const v = playerRuntime?.video || document.getElementById('lksVideo');
          if (!v || btn?.disabled) return;
          if (v.paused) await v.play().catch(() => {});
          else v.pause();
          playerRuntime?.showControls?.();
          playerRuntime?.refreshTrackChips?.();
        } else if (action === 'player-seek') {
          const v = playerRuntime?.video || document.getElementById('lksVideo');
          if (!v || state.player?.isLive) return;
          v.currentTime = Math.max(0, v.currentTime + Number(el.dataset.delta || 0));
          playerRuntime?.showControls?.();
        } else if (action === 'player-mute') {
          const v = playerRuntime?.video || document.getElementById('lksVideo');
          if (!v) return;
          v.muted = !v.muted;
          const btn = document.getElementById('playerMuteBtn');
          if (btn) btn.style.opacity = v.muted ? '.4' : '1';
          playerRuntime?.showControls?.();
        } else if (action === 'player-skip-intro') {
          const v = playerRuntime?.video || document.getElementById('lksVideo');
          const end = Number(state.player?.introMarkers?.introEndSec);
          if (!v || !Number.isFinite(end)) return;
          v.currentTime = end;
          playerRuntime?.showControls?.();
        } else if (action === 'player-switch-edition') {
          const lang = el.dataset.lang || '';
          const editionId = el.dataset.edition || '';
          const targetStream = el.dataset.stream || '';
          if (targetStream && targetStream === state.player?.streamId) return;
          const progress = playerRuntime?.getProgressPayload?.() || null;
          const v = playerRuntime?.video || document.getElementById('lksVideo');
          const positionSec = Number.isFinite(v?.currentTime) ? v.currentTime : null;
          try {
            const resolved = await api('/api/player/switch-edition', {
              languageTag: lang || undefined,
              editionId: editionId || undefined,
              positionSec,
              progress
            });
            if (resolved.sameStream) {
              playerRuntime?.showControls?.(true);
              return;
            }
            destroyPlayerRuntime({ skipSave: true });
            setState(await api('/api/player/open', playerOpenBody({
              streamId: resolved.streamId,
              episodeId: resolved.episodeId || null,
              resumePositionSec: resolved.resumePositionSec,
              returnScreen: resolved.returnScreen || state.player?.returnTo?.screen || 'detail'
            })));
          } catch (err) {
            const alts = (err.payload?.available || [])
              .map((a) => a.label || a.tag)
              .filter(Boolean)
              .slice(0, 6);
            const hint = alts.length
              ? ` Alternatives : ${alts.join(', ')}.`
              : '';
            showUiError(
              (err.message || 'Cette langue n’est pas disponible pour cet épisode.') + hint
            );
          }
        } else if (action === 'player-audio') {
          const hls = playerRuntime?.hls;
          const editionLangs = state.player?.availableEpisodeLanguages || [];
          // Prefer cycling in-stream HLS tracks when available; otherwise open settings for IPTV editions
          if (hls?.audioTracks?.length > 1) {
            hls.audioTrack = (hls.audioTrack + 1) % hls.audioTracks.length;
            playerRuntime?.refreshTrackChips?.();
            playerRuntime?.showControls?.();
            return;
          }
          if (editionLangs.length > 1) {
            const panel = document.getElementById('playerSettings');
            const eps = document.getElementById('playerEpisodes');
            const ch = document.getElementById('playerChannels');
            eps?.classList.remove('open');
            ch?.classList.remove('open');
            panel?.classList.add('open');
            playerRuntime?.showControls?.(true);
            return;
          }
        } else if (action === 'player-subs') {
          const hls = playerRuntime?.hls;
          if (!hls) return;
          const n = hls.subtitleTracks?.length || 0;
          if (!n) return;
          // cycle: off (-1) → 0 → … → n-1 → off
          const next = hls.subtitleTrack + 1;
          hls.subtitleTrack = next >= n ? -1 : next;
          playerRuntime?.refreshTrackChips?.();
          playerRuntime?.showControls?.();
        } else if (action === 'player-quality') {
          const hls = playerRuntime?.hls;
          const levels = hls?.levels || [];
          if (!hls || levels.length < 2) return;
          // cycle auto (-1) then each level
          const cur = hls.currentLevel;
          hls.currentLevel = cur < 0 ? 0 : cur + 1 >= levels.length ? -1 : cur + 1;
          playerRuntime?.refreshTrackChips?.();
          playerRuntime?.showControls?.();
        } else if (action === 'player-fullscreen') {
          const stage = document.getElementById('playerApp');
          if (!document.fullscreenElement) stage?.requestFullscreen?.();
          else document.exitFullscreen?.();
        } else if (action === 'player-diag-toggle') {
          const d = document.getElementById('playerDiag');
          if (d) d.hidden = !d.hidden;
        } else if (action === 'player-episodes-toggle') {
          if (state.player?.isLive || !state.player?.episodeNav) return;
          const panel = document.getElementById('playerEpisodes');
          const settings = document.getElementById('playerSettings');
          const ch = document.getElementById('playerChannels');
          settings?.classList.remove('open');
          ch?.classList.remove('open');
          panel?.classList.toggle('open');
          playerRuntime?.showControls?.(true);
        } else if (action === 'player-channels-toggle') {
          if (!state.player?.isLive) return;
          const panel = document.getElementById('playerChannels');
          const settings = document.getElementById('playerSettings');
          const eps = document.getElementById('playerEpisodes');
          settings?.classList.remove('open');
          eps?.classList.remove('open');
          panel?.classList.toggle('open');
          playerRuntime?.showControls?.(true);
        } else if (action === 'player-guide-toggle') {
          playerRuntime?.showControls?.(true);
        } else if (action === 'player-settings-toggle') {
          const panel = document.getElementById('playerSettings');
          const eps = document.getElementById('playerEpisodes');
          const ch = document.getElementById('playerChannels');
          eps?.classList.remove('open');
          ch?.classList.remove('open');
          panel?.classList.toggle('open');
          playerRuntime?.showControls?.(true);
        } else if (action === 'player-settings-tab') {
          setPlayerSettingsTab(el.dataset.id || 'audio');
        } else if (action === 'player-speed') {
          const video = document.getElementById('lksVideo');
          const rate = Number(el.dataset.id) || 1;
          if (video) video.playbackRate = rate;
          playerRuntime?.showControls?.(true);
        } else if (action === 'player-audio-pick') {
          const idx = Number(el.dataset.id);
          if (playerRuntime?.hls && Number.isFinite(idx)) playerRuntime.hls.audioTrack = idx;
          playerRuntime?.refreshTrackChips?.();
        } else if (action === 'player-subs-pick') {
          const idx = Number(el.dataset.id);
          if (playerRuntime?.hls && Number.isFinite(idx)) playerRuntime.hls.subtitleTrack = idx;
          playerRuntime?.refreshTrackChips?.();
        } else if (action === 'player-quality-pick') {
          const idx = Number(el.dataset.id);
          if (playerRuntime?.hls && Number.isFinite(idx)) playerRuntime.hls.currentLevel = idx;
          playerRuntime?.refreshTrackChips?.();
        } else if (action === 'player-dev-toggle') {
          const infoTab = document.getElementById('playerSettingsInfoTab');
          if (infoTab) {
            infoTab.hidden = !infoTab.hidden;
            if (!infoTab.hidden) setPlayerSettingsTab('info');
            else setPlayerSettingsTab('audio');
          }
        } else if (action === 'player-episode') {
          const progress = playerRuntime?.getProgressPayload?.() || null;
          if (progress) {
            await api('/api/player/progress', progress).catch(() => null);
          }
          destroyPlayerRuntime({ skipSave: true });
          setState(await api('/api/player/open', playerOpenBody({
            streamId: el.dataset.stream,
            episodeId: el.dataset.episodeId || null,
            returnScreen: state.player?.returnTo?.screen || 'detail'
          })));
        } else if (action === 'player-live-group') {
          const groupId = el.dataset.id;
          const next = await api('/api/live/channels', { groupId, offset: 0 });
          const items = next.live?.channels?.items || [];
          if (!state.player?.liveNav) return;
          state.player.liveNav = {
            ...state.player.liveNav,
            selectedGroupId: groupId,
            channels: items.slice(0, 80).map((c) => ({
              id: c.id,
              title: c.title,
              streamId: c.streamId,
              logoUrl: c.logoUrl || null,
              isFavorite: (state.preferences?.favoriteIds || []).includes(c.id)
            })),
            previous: null,
            next: items[1] || null
          };
          state.live = next.live;
          // Soft-refresh panel DOM only — keep video playing
          const list = document.getElementById('playerChannelList');
          const groupsEl = document.getElementById('playerChannelGroups');
          if (groupsEl) {
            groupsEl.querySelectorAll('.group-chip').forEach((b) => {
              b.classList.toggle('active', b.dataset.id === groupId);
            });
          }
          if (list) {
            list.innerHTML = (state.player.liveNav.channels || []).map((c) => `
              <button class="item ${c.id === state.player.liveNav.channelId ? 'active' : ''}" data-focus
                data-action="player-live-channel" data-stream="${escapeAttr(c.streamId)}" data-channel="${escapeAttr(c.id)}">
                ${c.logoUrl
                  ? `<img src="${escapeAttr(c.logoUrl)}" alt="" class="thumb" />`
                  : '<div class="thumb">TV</div>'}
                <div class="itemtext">
                  <b>${escapeHtml(c.title)}</b>
                  <span>${c.id === state.player.liveNav.channelId ? 'En direct · Chaîne actuelle' : 'Changer de chaîne'}</span>
                </div>
              </button>`).join('') || '<p class="muted" style="padding:12px">Aucune chaîne.</p>';
            list.querySelectorAll('[data-action="player-live-channel"]').forEach((btn) => {
              btn.addEventListener('click', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                destroyPlayerRuntime();
                setState(await api('/api/player/open', playerOpenBody({
                  streamId: btn.dataset.stream,
                  fromLive: 1,
                  channelId: btn.dataset.channel,
                  returnScreen: 'tv'
                })));
              });
            });
            registerFocusables();
          }
          playerRuntime?.showControls?.(true);
        } else if (action === 'player-live-channel') {
          destroyPlayerRuntime();
          setState(await api('/api/player/open', playerOpenBody({
            streamId: el.dataset.stream,
            fromLive: 1,
            channelId: el.dataset.channel,
            returnScreen: 'tv'
          })));
        } else if (action === 'player-retry') {
          const streamId = state.player?.streamId;
          if (!streamId) return;
          const ret = state.player?.returnTo;
          destroyPlayerRuntime();
          setState(await api('/api/player/open', playerOpenBody({
            streamId,
            fromLive: state.player?.isLive ? 1 : 0,
            channelId: state.player?.liveNav?.channelId || null,
            returnScreen: ret?.screen || (state.player?.isLive ? 'tv' : 'detail')
          })));
        } else if (action === 'add-xtream') {
          const form = document.getElementById('xtreamForm');
          const fd = new FormData(form);
          setState(await api('/api/sources/xtream', {
            displayName: fd.get('displayName'),
            serverUrl: fd.get('serverUrl'),
            username: fd.get('username'),
            password: fd.get('password'),
            allowPrivateLan: !!form.querySelector('[name=allowPrivateLan]')?.checked
          }));
          form.reset();
        } else if (action === 'add-m3u-url') {
          const form = document.getElementById('m3uUrlForm');
          const fd = new FormData(form);
          setState(await api('/api/sources/m3u-url', {
            displayName: fd.get('displayName'),
            playlistUrl: fd.get('playlistUrl'),
            allowPrivateLan: !!form.querySelector('[name=allowPrivateLan]')?.checked
          }));
          form.reset();
        } else if (action === 'add-m3u-file') {
          const form = document.getElementById('m3uFileForm');
          const file = form.querySelector('[name=file]')?.files?.[0];
          if (!file) throw new Error('Choisissez un fichier M3U');
          const buf = new Uint8Array(await file.arrayBuffer());
          let binary = '';
          const chunk = 0x8000;
          for (let i = 0; i < buf.length; i += chunk) {
            binary += String.fromCharCode(...buf.subarray(i, i + chunk));
          }
          const b64 = btoa(binary);
          const fd = new FormData(form);
          setState(await api('/api/sources/m3u-file', {
            displayName: fd.get('displayName') || file.name,
            filename: file.name,
            contentBase64: b64
          }));
          form.reset();
        }
      } catch (err) {
        const retryAction = action;
        const retryEl = {
          section: el.dataset.section,
          id: el.dataset.id,
          screen: el.dataset.screen,
          stream: el.dataset.stream,
          list: el.dataset.list,
          q: el.dataset.q
        };
        showUiError(err.message || String(err), async () => {
          // Re-dispatch by simulating the same primary API when possible
          if (retryAction === 'group-manage') {
            setState(await api('/api/groups/setup/open', {
              section: retryEl.section || state.screen,
              mode: 'manage'
            }));
          } else if (retryAction === 'open-search') {
            setState(await api('/api/search', { query: '', filter: 'all', offset: 0 }));
          } else if (retryAction === 'live-group' || retryAction === 'live-more') {
            setState(await api('/api/live/channels', {
              groupId: retryEl.id || state.live?.selectedGroupId || '__all__',
              offset: 0
            }));
          } else if (retryAction === 'nav') {
            await navigate({ screen: retryEl.screen, customizeOpen: false });
          } else if (retryAction === 'sync') {
            setState(await api('/api/sync', {}));
          } else {
            throw new Error(err.message || String(err));
          }
        });
      }
      ev.stopPropagation();
    });
  });
  const bindLang = (el, field) => {
    if (!el) return;
    el.addEventListener('change', async () => {
      const body = {};
      if (field === 'audio') body.audioLanguage = el.value;
      else if (field === 'subtitle') body.subtitleLanguage = el.value;
      else if (field === 'interface') body.interfaceLanguage = el.value;
      else body.language = el.value;
      setState(await api('/api/prefs/language', body));
    });
  };
  bindLang(document.getElementById('langSelect'), 'audio');
  bindLang(document.getElementById('langSelectSettings'), 'audio');
  bindLang(document.getElementById('subsLangSelectSettings'), 'subtitle');
  bindLang(document.getElementById('uiLangSelectSettings'), 'interface');
  const autoSync = document.getElementById('autoSyncSelect');
  if (autoSync) {
    autoSync.addEventListener('change', async () => {
      setState(await api('/api/settings/auto-sync', { autoSyncMinutes: Number(autoSync.value) }));
    });
  }
}

// Real app start → splash → Qui regarde ? (never auto-select last profile)
api('/api/session/boot', {})
  .then(setState)
  .catch((e) => {
    appEl.innerHTML = `<section class="screen"><div class="status-box"><h2>Serveur indisponible</h2><p>${escapeHtml(e.message)}</p></div></section>`;
  });
