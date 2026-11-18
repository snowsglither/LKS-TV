/**
 * Live TV catalog accessors — backed by liveIndex (one build per catalog gen).
 */

import {
  getLiveIndex,
  listLiveGroupsFromIndex,
  listLiveChannelsFromIndex,
  invalidateLiveIndex
} from './liveIndex.js';

export { invalidateLiveIndex };

export function listLiveGroups(catalog, prefs = {}) {
  const index = getLiveIndex(catalog);
  return listLiveGroupsFromIndex(index, prefs);
}

export function listLiveChannels(catalog, prefs = {}, opts = {}) {
  const index = getLiveIndex(catalog);
  return listLiveChannelsFromIndex(index, prefs, opts);
}
