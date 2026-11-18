/**
 * Samsung AVPlay wrapper with HTML5 <video> fallback (browser / emulator without webapis).
 *
 * Codec note: Tizen AVPlay supports a limited set (often H.264/AAC in MP4/TS/HLS).
 * HEVC / MKVs from IPTV may fail — surface an explicit error; never pretend silence.
 */

let mode = 'none'; // avplay | html5 | none
let htmlVideo = null;
let lastUrl = '';
let onErrorCb = null;
let onBufferCb = null;

function hasAvplay() {
  return typeof webapis !== 'undefined' && webapis?.avplay;
}

export function playerBackend() {
  return hasAvplay() ? 'avplay' : 'html5-fallback';
}

export function initPlayerSurface(containerEl) {
  containerEl.innerHTML = '';
  if (hasAvplay()) {
    const obj = document.createElement('object');
    obj.type = 'application/avplayer';
    obj.id = 'avplayer';
    obj.style.width = '100%';
    obj.style.height = '100%';
    containerEl.appendChild(obj);
    mode = 'avplay';
    return obj;
  }
  htmlVideo = document.createElement('video');
  htmlVideo.id = 'html5player';
  htmlVideo.setAttribute('playsinline', 'true');
  htmlVideo.style.width = '100%';
  htmlVideo.style.height = '100%';
  htmlVideo.controls = false;
  containerEl.appendChild(htmlVideo);
  mode = 'html5';
  htmlVideo.addEventListener('error', () => {
    onErrorCb?.(
      'Lecture HTML5 échouée — codec/conteneur peut être incompatible (ex. HEVC/MKV).'
    );
  });
  htmlVideo.addEventListener('waiting', () => onBufferCb?.(true));
  htmlVideo.addEventListener('playing', () => onBufferCb?.(false));
  return htmlVideo;
}

export function setPlayerCallbacks({ onError, onBuffering } = {}) {
  onErrorCb = onError || null;
  onBufferCb = onBuffering || null;
}

/**
 * @param {string} url
 * @param {{ seekSec?: number }} [opts]
 */
export async function playUrl(url, opts = {}) {
  lastUrl = url;
  if (!url) {
    onErrorCb?.('URL de lecture manquante');
    return;
  }
  if (mode === 'avplay') {
    try {
      const av = webapis.avplay;
      try {
        av.stop();
      } catch {
        /* idle */
      }
      av.open(url);
      av.setDisplayRect(0, 0, screen.width || 1920, screen.height || 1080);
      av.setListener({
        onbufferingstart: () => onBufferCb?.(true),
        onbufferingcomplete: () => onBufferCb?.(false),
        onstreamcompleted: () => {},
        onerror: (err) =>
          onErrorCb?.(
            `AVPlay: ${err || 'erreur'} — format peut être non supporté sur ce Tizen.`
          )
      });
      av.prepareAsync(
        () => {
          if (opts.seekSec > 0) {
            try {
              av.seekTo(Math.floor(opts.seekSec * 1000));
            } catch {
              /* ignore seek */
            }
          }
          av.play();
        },
        (err) => onErrorCb?.(`Préparation AVPlay impossible: ${err}`)
      );
    } catch (e) {
      onErrorCb?.(e?.message || 'AVPlay indisponible');
    }
    return;
  }
  if (mode === 'html5' && htmlVideo) {
    htmlVideo.src = url;
    if (opts.seekSec > 0) {
      htmlVideo.addEventListener(
        'loadedmetadata',
        () => {
          try {
            htmlVideo.currentTime = opts.seekSec;
          } catch {
            /* ignore */
          }
        },
        { once: true }
      );
    }
    try {
      await htmlVideo.play();
    } catch (e) {
      onErrorCb?.(e?.message || 'Lecture HTML5 refusée');
    }
  }
}

export function pause() {
  if (mode === 'avplay') {
    try {
      webapis.avplay.pause();
    } catch {
      /* ignore */
    }
  } else if (htmlVideo) htmlVideo.pause();
}

export function resume() {
  if (mode === 'avplay') {
    try {
      webapis.avplay.play();
    } catch {
      /* ignore */
    }
  } else if (htmlVideo) htmlVideo.play();
}

export function stop() {
  if (mode === 'avplay') {
    try {
      webapis.avplay.stop();
      webapis.avplay.close();
    } catch {
      /* ignore */
    }
  } else if (htmlVideo) {
    htmlVideo.pause();
    htmlVideo.removeAttribute('src');
    htmlVideo.load();
  }
}

export function currentTimeSec() {
  if (mode === 'avplay') {
    try {
      return (webapis.avplay.getCurrentTime() || 0) / 1000;
    } catch {
      return 0;
    }
  }
  return htmlVideo?.currentTime || 0;
}

export function durationSec() {
  if (mode === 'avplay') {
    try {
      const d = webapis.avplay.getDuration();
      return d > 0 ? d / 1000 : 0;
    } catch {
      return 0;
    }
  }
  return htmlVideo?.duration && Number.isFinite(htmlVideo.duration) ? htmlVideo.duration : 0;
}

/** Best-effort audio track listing (AVPlay only; HTML5 limited). */
export function listAudioTracks() {
  if (mode !== 'avplay') return [];
  try {
    const total = webapis.avplay.getTotalTrackInfo();
    return (total || [])
      .filter((t) => t.type === 'AUDIO')
      .map((t, i) => ({ index: i, language: t.extra_info || t.language || `Audio ${i + 1}` }));
  } catch {
    return [];
  }
}

export function listSubtitleTracks() {
  if (mode !== 'avplay') return [];
  try {
    const total = webapis.avplay.getTotalTrackInfo();
    return (total || [])
      .filter((t) => t.type === 'TEXT')
      .map((t, i) => ({ index: i, language: t.extra_info || t.language || `ST ${i + 1}` }));
  } catch {
    return [];
  }
}

export function selectTrack(type, index) {
  if (mode !== 'avplay') return false;
  try {
    webapis.avplay.setSelectTrack(type, index);
    return true;
  } catch {
    return false;
  }
}

export function getLastUrl() {
  return lastUrl;
}
