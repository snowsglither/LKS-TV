import { demoPalette, findDemoHue, findDemoTitle } from './demoCatalog.js';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export function renderPosterSvg(slug) {
  const hue = findDemoHue(slug);
  const title = findDemoTitle(slug);
  const p = demoPalette(hue);
  const short = title.length > 18 ? `${title.slice(0, 16)}…` : title;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="${p.mid}"/>
      <stop offset="50%" stop-color="${p.deep}"/>
      <stop offset="100%" stop-color="#050507"/>
    </linearGradient>
    <radialGradient id="g" cx="82%" cy="18%" r="55%">
      <stop offset="0%" stop-color="${p.bright}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${p.bright}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050507" stop-opacity="0"/>
      <stop offset="100%" stop-color="#050507" stop-opacity="0.95"/>
    </linearGradient>
  </defs>
  <rect width="400" height="600" fill="url(#bg)"/>
  <rect width="400" height="600" fill="url(#g)"/>
  <ellipse cx="290" cy="210" rx="120" ry="160" fill="${p.bright}" opacity="0.12"/>
  <rect x="48" y="90" width="168" height="248" rx="14" fill="${p.mid}" opacity="0.95"/>
  <rect x="66" y="116" width="132" height="88" rx="8" fill="${p.bright}" opacity="0.4"/>
  <rect x="66" y="220" width="100" height="12" rx="4" fill="${p.soft}" opacity="0.35"/>
  <rect x="66" y="242" width="72" height="10" rx="4" fill="${p.soft}" opacity="0.22"/>
  <path d="M0 360 Q200 300 400 380 L400 600 L0 600 Z" fill="#050507" opacity="0.55"/>
  <rect width="400" height="600" fill="url(#floor)"/>
  <text x="24" y="36" fill="#E50914" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="3">LKS TV</text>
  <text x="24" y="520" fill="#F5F5F7" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${esc(short)}</text>
  <text x="24" y="552" fill="#A1A1AA" font-family="Segoe UI, Arial, sans-serif" font-size="14">Affiche démo</text>
</svg>`;
}

export function renderBackdropSvg(slug) {
  const hue = findDemoHue(slug);
  const title = findDemoTitle(slug);
  const p = demoPalette(hue);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="sky" x1="0.05" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="${p.deep}"/>
      <stop offset="35%" stop-color="${p.mid}"/>
      <stop offset="100%" stop-color="#050507"/>
    </linearGradient>
    <radialGradient id="n" cx="78%" cy="32%" r="48%">
      <stop offset="0%" stop-color="${p.bright}" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="${p.bright}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050507" stop-opacity="0.35"/>
      <stop offset="45%" stop-color="#050507" stop-opacity="0"/>
      <stop offset="100%" stop-color="#050507" stop-opacity="0.88"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#sky)"/>
  <rect width="1920" height="1080" fill="url(#n)"/>
  <ellipse cx="1480" cy="420" rx="380" ry="460" fill="${p.bright}" opacity="0.08"/>
  <rect x="1180" y="140" width="520" height="720" rx="22" fill="${p.mid}" opacity="0.5"/>
  <rect x="1240" y="220" width="400" height="260" rx="14" fill="${p.bright}" opacity="0.28"/>
  <rect x="1240" y="520" width="260" height="18" rx="6" fill="${p.soft}" opacity="0.35"/>
  <rect x="1240" y="560" width="180" height="14" rx="6" fill="${p.soft}" opacity="0.22"/>
  <rect width="1920" height="1080" fill="url(#vignette)"/>
  <text x="72" y="88" fill="#E50914" font-family="Segoe UI, Arial, sans-serif" font-size="32" font-weight="700" letter-spacing="8">LKS TV</text>
  <text x="72" y="1000" fill="#A1A1AA" font-family="Segoe UI, Arial, sans-serif" font-size="24">${esc(title)} · backdrop démo</text>
</svg>`;
}

export function renderEpisodeSvg(slug) {
  const hue = findDemoHue(slug);
  const title = findDemoTitle(slug);
  const p = demoPalette(hue);
  const epMatch = String(slug).match(/s(\d+)e(\d+)/i);
  const label = epMatch ? `S${epMatch[1]}E${epMatch[2]}` : 'EP';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${p.mid}"/>
      <stop offset="100%" stop-color="${p.deep}"/>
    </linearGradient>
    <radialGradient id="g" cx="70%" cy="40%" r="50%">
      <stop offset="0%" stop-color="${p.bright}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${p.bright}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <rect width="640" height="360" fill="url(#g)"/>
  <rect x="40" y="48" width="220" height="140" rx="12" fill="${p.bright}" opacity="0.25"/>
  <polygon points="120,88 120,148 168,118" fill="#F5F5F7" opacity="0.85"/>
  <rect x="0" y="250" width="640" height="110" fill="#050507" opacity="0.65"/>
  <text x="28" y="300" fill="#F5F5F7" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${esc(label)}</text>
  <text x="28" y="334" fill="#A1A1AA" font-family="Segoe UI, Arial, sans-serif" font-size="16">${esc(title)}</text>
</svg>`;
}

export function renderHubCardSvg(kind) {
  const map = {
    live: {
      hue: 220,
      title: 'TV en direct',
      shapes: `
        <rect x="480" y="160" width="320" height="420" rx="22" fill="url(#panel)" stroke="${demoPalette(220).soft}" stroke-width="2" opacity="0.9"/>
        <circle cx="640" cy="340" r="48" fill="${demoPalette(220).bright}" opacity="0.85"/>
        <polygon points="628,312 628,368 672,340" fill="#050507" opacity="0.9"/>
        <rect x="520" y="520" width="240" height="14" rx="4" fill="${demoPalette(220).soft}" opacity="0.35"/>
        <rect x="560" y="548" width="160" height="10" rx="4" fill="${demoPalette(220).soft}" opacity="0.2"/>`
    },
    films: {
      hue: 350,
      title: 'Films',
      shapes: `
        <rect x="520" y="140" width="240" height="360" rx="16" fill="url(#panel)" transform="rotate(-6 640 320)"/>
        <rect x="560" y="180" width="240" height="360" rx="16" fill="${demoPalette(350).mid}" opacity="0.85" transform="rotate(4 680 360)"/>
        <rect x="590" y="220" width="180" height="110" rx="8" fill="${demoPalette(350).bright}" opacity="0.4"/>
        <rect x="590" y="360" width="140" height="12" rx="4" fill="${demoPalette(350).soft}" opacity="0.35"/>
        <rect x="590" y="386" width="100" height="10" rx="4" fill="${demoPalette(350).soft}" opacity="0.22"/>`
    },
    series: {
      hue: 195,
      title: 'Séries',
      shapes: `
        <rect x="460" y="180" width="340" height="72" rx="14" fill="url(#panel)"/>
        <rect x="500" y="120" width="260" height="64" rx="12" fill="${demoPalette(195).bright}" opacity="0.45"/>
        <rect x="460" y="280" width="340" height="72" rx="14" fill="${demoPalette(195).mid}" opacity="0.9"/>
        <rect x="460" y="380" width="340" height="72" rx="14" fill="${demoPalette(195).deep}" opacity="0.95"/>
        <rect x="500" y="300" width="180" height="12" rx="4" fill="${demoPalette(195).soft}" opacity="0.4"/>
        <rect x="500" y="400" width="140" height="12" rx="4" fill="${demoPalette(195).soft}" opacity="0.28"/>`
    }
  };
  const cfg = map[kind] || map.films;
  const p = demoPalette(cfg.hue);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.45" y2="1">
      <stop offset="0%" stop-color="${p.mid}"/>
      <stop offset="55%" stop-color="${p.deep}"/>
      <stop offset="100%" stop-color="#050507"/>
    </linearGradient>
    <radialGradient id="g" cx="72%" cy="28%" r="58%">
      <stop offset="0%" stop-color="${p.bright}" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="${p.bright}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.mid}"/>
      <stop offset="100%" stop-color="${p.deep}"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050507" stop-opacity="0"/>
      <stop offset="100%" stop-color="#050507" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect width="900" height="1200" fill="url(#bg)"/>
  <rect width="900" height="1200" fill="url(#g)"/>
  <ellipse cx="680" cy="360" rx="260" ry="320" fill="${p.bright}" opacity="0.1"/>
  ${cfg.shapes}
  <rect width="900" height="1200" fill="url(#floor)"/>
  <text x="48" y="56" fill="#E50914" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">LKS TV</text>
  <text x="48" y="1080" fill="#F5F5F7" font-family="Segoe UI, Arial, sans-serif" font-size="42" font-weight="700">${esc(cfg.title)}</text>
</svg>`;
}

export function renderAvatarSvg(name, color) {
  const safeInitial = (name || '?').slice(0, 1).toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color}"/>
      <stop offset="55%" stop-color="#2a0c12"/>
      <stop offset="100%" stop-color="#0a0507"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="30%" r="55%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="256" height="256" rx="28" fill="url(#bg)"/>
  <rect width="256" height="256" rx="28" fill="url(#glow)"/>
  <circle cx="128" cy="94" r="44" fill="#F5F5F7" opacity="0.95"/>
  <ellipse cx="128" cy="198" rx="74" ry="52" fill="#F5F5F7" opacity="0.95"/>
  <text x="128" y="110" text-anchor="middle" fill="${color}" font-family="Segoe UI, Arial, sans-serif" font-size="38" font-weight="700">${esc(safeInitial)}</text>
  <rect x="16" y="220" width="64" height="4" rx="2" fill="#E50914" opacity="0.85"/>
  <text x="16" y="244" fill="#fff" opacity="0.5" font-family="Segoe UI, Arial, sans-serif" font-size="11" letter-spacing="2">LKS TV</text>
</svg>`;
}
