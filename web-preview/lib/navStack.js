/**
 * Centralized navigation stack — opening context for Back / Escape.
 * Never invent return targets from stale liveUi.groupId alone.
 */

const MAX_DEPTH = 32;

export function ensureNavStack(state) {
  if (!Array.isArray(state.navStack) || !state.navStack.length) {
    const screen = state.screen && state.screen !== 'player' ? state.screen : 'hub';
    state.navStack = [
      {
        screen: screen === 'detail' && state.detail?.id ? 'detail' : screen || 'hub',
        detailId: state.detail?.id || null,
        selectedSeason: state.detail?.selectedSeason ?? null,
        searchQuery: state.search?.query || '',
        searchFilter: state.search?.filter || 'all',
        searchOffset: state.search?.offset || 0,
        liveGroupId: state.liveUi?.groupId || null,
        liveChannelId: state.liveUi?.channelId || null,
        scrollY: 0,
        focusKey: null
      }
    ];
  }
  return state.navStack;
}

function framesEqual(a, b) {
  if (!a || !b || a.screen !== b.screen) return false;
  if (a.screen === 'detail') return a.detailId === b.detailId;
  if (a.screen === 'search') {
    return (
      a.searchQuery === b.searchQuery &&
      a.searchFilter === b.searchFilter &&
      a.searchOffset === b.searchOffset
    );
  }
  if (a.screen === 'tv' || a.screen === 'epg') {
    return a.liveGroupId === b.liveGroupId;
  }
  return true;
}

export function snapshotFrame(state, overrides = {}) {
  return {
    screen: state.screen || 'hub',
    detailId: state.detail?.id || null,
    selectedSeason: state.detail?.selectedSeason ?? null,
    searchQuery: state.search?.query || '',
    searchFilter: state.search?.filter || 'all',
    searchOffset: state.search?.offset || 0,
    liveGroupId: state.liveUi?.groupId || null,
    liveChannelId: state.liveUi?.channelId || null,
    scrollY: Number(overrides.scrollY) || 0,
    focusKey: overrides.focusKey || null,
    ...overrides
  };
}

/** Update top frame restore metadata without pushing. */
export function patchTopFrame(state, patch = {}) {
  const stack = ensureNavStack(state);
  const top = stack[stack.length - 1];
  if (!top) return;
  Object.assign(top, patch);
}

export function pushFrame(state, frame) {
  const stack = ensureNavStack(state);
  const top = stack[stack.length - 1];
  if (framesEqual(top, frame)) {
    Object.assign(top, frame);
    return top;
  }
  // Leaving current screen: keep restore fields already on top
  stack.push({ ...frame });
  while (stack.length > MAX_DEPTH) stack.shift();
  return frame;
}

export function replaceStack(state, frame) {
  state.navStack = [{ ...frame }];
  return state.navStack[0];
}

export function resetStack(state, frame = { screen: 'hub' }) {
  return replaceStack(state, frame);
}

/**
 * Pop current frame and return the previous one (or hub).
 * Does not apply screen changes — caller applies.
 */
export function popFrame(state) {
  const stack = ensureNavStack(state);
  if (stack.length > 1) stack.pop();
  return stack[stack.length - 1] || { screen: 'hub' };
}

export function peekFrame(state) {
  const stack = ensureNavStack(state);
  return stack[stack.length - 1] || null;
}

/** Apply a restored frame onto state.screen / detail / search / liveUi. */
export function applyFrame(state, frame) {
  if (!frame) {
    state.screen = 'hub';
    return;
  }
  state.screen = frame.screen || 'hub';
  if (frame.screen === 'detail' && frame.detailId && state.detail?.id === frame.detailId) {
    if (frame.selectedSeason != null) state.detail.selectedSeason = frame.selectedSeason;
  }
  if (frame.screen === 'search' && state.search) {
    state.search.query = frame.searchQuery ?? state.search.query;
    state.search.filter = frame.searchFilter ?? state.search.filter;
    state.search.offset = frame.searchOffset ?? state.search.offset;
  }
  if ((frame.screen === 'tv' || frame.screen === 'epg') && state.liveUi) {
    if (frame.liveGroupId) state.liveUi.groupId = frame.liveGroupId;
    if (frame.liveChannelId) state.liveUi.channelId = frame.liveChannelId;
  }
  state.uiRestore = {
    scrollY: frame.scrollY || 0,
    focusKey: frame.focusKey || null,
    screen: frame.screen
  };
}
