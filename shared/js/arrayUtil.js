/**
 * Stack-safe array helpers for large IPTV catalogs.
 * Never use `target.push(...hugeArray)` — argument lists blow the call stack.
 */

const CHUNK = 8192;

/** Append all items from `source` onto `target` without spreading. */
export function appendAll(target, source) {
  if (!source?.length) return target;
  for (let i = 0; i < source.length; i++) {
    target.push(source[i]);
  }
  return target;
}

/** Concatenate many arrays into one without deep spreads. */
export function concatAll(...parts) {
  const out = [];
  for (const part of parts) {
    if (!part?.length) continue;
    appendAll(out, part);
  }
  return out;
}

/** Shallow-clone a title node (variants/episodes arrays copied, no structuredClone). */
export function cloneTitleShallow(t) {
  return {
    ...t,
    genres: t.genres ? t.genres.slice() : [],
    variants: t.variants ? t.variants.slice() : [],
    episodes: t.episodes
      ? t.episodes.map((ep) => ({
          ...ep,
          versions: ep.versions ? ep.versions.slice() : []
        }))
      : [],
    matchKey: t.matchKey ? { ...t.matchKey } : t.matchKey
  };
}

/** Yield to event loop every `every` iterations (keeps sync responsive). */
export async function maybeYield(i, every = 5000) {
  if (i > 0 && i % every === 0) {
    const schedule =
      typeof setImmediate === 'function'
        ? setImmediate
        : (fn) => setTimeout(fn, 0);
    await new Promise((r) => schedule(r));
  }
}

export function chunkedForEach(arr, fn, chunkSize = CHUNK) {
  for (let i = 0; i < arr.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, arr.length);
    for (let j = i; j < end; j++) fn(arr[j], j);
  }
}
