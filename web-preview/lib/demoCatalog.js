/**
 * UI showcase catalog for TASK-004 visual validation.
 * Explicitly labeled DEMO_SHOWCASE — never silent-merge into real IPTV sources.
 */

const FILMS = [
  { slug: 'obsidian-night', title: 'Obsidian Night', year: 2024, genres: ['Thriller', 'Action'], duration: 118, lang: ['VF', 'EN'], group: 'Films VF', hue: 350, progress: 0.42,
    synopsis: 'Dans une métropole plongée dans l’ombre, une agente infiltrée doit choisir entre sa mission et la seule personne qui connaît son vrai nom.' },
  { slug: 'harbor-lights', title: 'Harbor Lights', year: 2023, genres: ['Drame', 'Mystère'], duration: 104, lang: ['EN', 'VF'], group: 'Movies EN', hue: 205,
    synopsis: 'Un port oublié, des phares en morse, et un secret enfoui sous la marée.' },
  { slug: 'goldline-express', title: 'Goldline Express', year: 2022, genres: ['Action', 'Aventure'], duration: 112, lang: ['VF'], group: 'Films VF', hue: 42,
    synopsis: 'Un train blindé, une fortune volée, et six heures pour tout faire dérailler.' },
  { slug: 'crimson-orbit', title: 'Crimson Orbit', year: 2021, genres: ['Science-fiction'], duration: 126, lang: ['VF', 'VO'], group: 'Films VF', hue: 0,
    synopsis: 'Une station martienne coupe le contact. Ce qui revient n’est plus tout à fait humain.' },
  { slug: 'neon-harbor', title: 'Neon Harbor', year: 2024, genres: ['Crime', 'Néonoir'], duration: 109, lang: ['VF'], group: 'Films VF', hue: 190,
    synopsis: 'Sous les enseignes roses du quai, un flic sans badge traque un fantôme du net.' },
  { slug: 'velvet-mirage', title: 'Velvet Mirage', year: 2020, genres: ['Romance', 'Drame'], duration: 121, lang: ['VF', 'EN'], group: 'Films VF', hue: 320,
    synopsis: 'Deux chorégraphes rivaux partagent la même scène — et le même mensonge.' },
  { slug: 'glass-empire', title: 'Glass Empire', year: 2019, genres: ['Thriller'], duration: 130, lang: ['EN'], group: 'Movies EN', hue: 220,
    synopsis: 'Un architecte découvre que sa tour écoute tout le quartier.' },
  { slug: 'ashen-crown', title: 'Ashen Crown', year: 2018, genres: ['Fantasy'], duration: 134, lang: ['VF'], group: 'Films VF', hue: 25,
    synopsis: 'Le dernier héritier d’un royaume brûlé refuse le trône… jusqu’à la pluie de cendres.' },
  { slug: 'silent-ballroom', title: 'Silent Ballroom', year: 2023, genres: ['Horreur'], duration: 97, lang: ['VO', 'VF'], group: 'Films VF', hue: 280,
    synopsis: 'Dans un hôtel fermé depuis 40 ans, la musique reprend chaque minuit.' },
  { slug: 'pacific-drift', title: 'Pacific Drift', year: 2025, genres: ['Drame'], duration: 116, lang: ['EN'], group: 'Movies EN', hue: 175,
    synopsis: 'Une surfeuse et un océanographe croisent une mer qui n’obéit plus aux marées.' },
  { slug: 'midnight-protocol', title: 'Midnight Protocol', year: 2022, genres: ['Action', 'Techno'], duration: 108, lang: ['VF', 'EN'], group: 'Films VF', hue: 255,
    synopsis: 'Un code dormant s’éveille à minuit. Les villes suivent.' },
  { slug: 'sable-garden', title: 'Sable Garden', year: 2017, genres: ['Jeunesse', 'Aventure'], duration: 95, lang: ['VF'], group: 'Jeunesse', hue: 95,
    synopsis: 'Dans le jardin de sable, les enfants plantent des étoiles — et récoltent des orages.' },
  { slug: 'iron-waltz', title: 'Iron Waltz', year: 2016, genres: ['Action', 'Drame'], duration: 124, lang: ['VF', 'EN'], group: 'Films VF', hue: 12,
    synopsis: 'Un danseur de combat retrouve son frère dans une arène où chaque pas est une arme.' },
  { slug: 'lunar-archive', title: 'Lunar Archive', year: 2024, genres: ['Science-fiction', 'Mystère'], duration: 111, lang: ['VO', 'VF'], group: 'Movies EN', hue: 240,
    synopsis: 'Les archives de la Lune s’ouvrent. Les souvenirs qui en sortent n’appartiennent à personne.' }
];

const SERIES = [
  { slug: 'aurora-station', title: 'Aurora Station', year: 2022, genres: ['Science-fiction', 'Drame'], duration: 48, lang: ['VF', 'VO'], group: 'Séries', hue: 200, seasons: 2, episodesPerSeason: [4, 3], progress: 0.55,
    episodeTitles: [['Arrimage', 'Blackout', 'Dérive', 'Écho'], ['Rentrée', 'Miroir', 'Signal']],
    synopsis: 'À bord d’une station orbitale en déclin, l’équipage découvre qu’un signal répond avec leurs propres souvenirs.' },
  { slug: 'north-wire', title: 'North Wire', year: 2021, genres: ['Crime'], duration: 52, lang: ['VF'], group: 'Séries', hue: 210, seasons: 2, episodesPerSeason: [4, 3],
    episodeTitles: [['Gel', 'Câble', 'Source', 'Fuite'], ['Frontière', 'Silence', 'Preuve']],
    synopsis: 'Une journaliste d’investigation branche un réseau clandestin au-delà du cercle polaire.' },
  { slug: 'ember-court', title: 'Ember Court', year: 2023, genres: ['Fantasy', 'Politique'], duration: 55, lang: ['VF', 'EN'], group: 'Séries', hue: 15, seasons: 2, episodesPerSeason: [5, 4],
    episodeTitles: [['Braises', 'Serment', 'Couronne', 'Cendre', 'Trêve'], ['Alliance', 'Poison', 'Trône', 'Flammes']],
    synopsis: 'Dans la cour de braises, chaque alliance brûle plus vite que la précédente.' },
  { slug: 'blue-kilometer', title: 'Blue Kilometer', year: 2020, genres: ['Drame', 'Sport'], duration: 44, lang: ['VF'], group: 'Séries', hue: 195, seasons: 2, episodesPerSeason: [3, 3], progress: 0.2,
    episodeTitles: [['Départ', 'Virage', 'Chute'], ['Relais', 'Vent', 'Ligne']],
    synopsis: 'Cinq coureurs, un kilomètre impossible, et une ville qui parie sur leur chute.' },
  { slug: 'kite-syndicate', title: 'Kite Syndicate', year: 2024, genres: ['Action', 'Jeunesse'], duration: 40, lang: ['VF', 'EN'], group: 'Jeunesse', hue: 45, seasons: 1, episodesPerSeason: [5],
    episodeTitles: [['Décollage', 'Vent', 'Nœud', 'Tempête', 'Horizon']],
    synopsis: 'Des cerfs-volants deviennent des armes. Une bande de lycéens refuse de descendre.' },
  { slug: 'hollow-frequency', title: 'Hollow Frequency', year: 2019, genres: ['Mystère'], duration: 50, lang: ['VO', 'VF'], group: 'Séries', hue: 265, seasons: 2, episodesPerSeason: [4, 3],
    episodeTitles: [['Statique', 'Appel', 'Adresse', 'Vide'], ['Fréquence', 'Réponse', 'Coupure']],
    synopsis: 'Une radio nocturne diffuse des appels venus d’adresses qui n’existent plus.' },
  { slug: 'quartz-city', title: 'Quartz City', year: 2023, genres: ['Crime', 'Drame'], duration: 54, lang: ['VF', 'EN'], group: 'Séries', hue: 270, seasons: 1, episodesPerSeason: [4], progress: 0.3,
    episodeTitles: [['Verdict', 'Fissure', 'Réfraction', 'Verdict bis']],
    synopsis: 'Dans une métropole de verre, un juge doit choisir entre la loi et la loyauté.' }
];

function art(slug, kind) {
  return `/api/demo-art/${slug}-${kind}.svg`;
}

function stream(id, lang, groupId, sourceId) {
  return {
    id: `${sourceId}::stream::${id}::${lang}`,
    sourceId,
    providerStreamId: `${id}-${lang}`,
    playbackUrl: `https://example.invalid/demo/${id}_${lang}.m3u8`,
    groupId,
    language: lang,
    confidence: 'KNOWN',
    rawTitle: id
  };
}

export function buildDemoShowcaseCatalog(sourceId = 'demo_showcase_ui') {
  const groupsMap = new Map();
  const titles = [];

  function ensureGroup(name, kind) {
    const id = `${sourceId}::${name}`;
    if (!groupsMap.has(id)) {
      groupsMap.set(id, {
        id,
        sourceId,
        providerGroupId: name,
        name,
        kind
      });
    }
    return id;
  }

  for (const f of FILMS) {
    const groupId = ensureGroup(f.group, 'VOD');
    const variants = f.lang.map((l) => stream(f.slug, l, groupId, sourceId));
    titles.push({
      id: `logical:demo:${f.slug}`,
      type: 'FILM',
      canonicalTitle: f.title,
      year: f.year,
      synopsis: f.synopsis,
      genres: f.genres,
      durationMinutes: f.duration,
      posterPath: art(f.slug, 'poster'),
      backdropPath: art(f.slug, 'backdrop'),
      matchKey: { type: 'EXPLICIT', value: `demo:${f.slug}` },
      variants,
      episodes: [],
      singleSourceOnly: true,
      _demoHue: f.hue,
      _demoProgress: f.progress || 0
    });
  }

  for (const s of SERIES) {
    const groupId = ensureGroup(s.group, 'SERIES');
    const variants = s.lang.map((l) => stream(s.slug, l, groupId, sourceId));
    const episodes = [];
    for (let season = 1; season <= s.seasons; season++) {
      const count = s.episodesPerSeason[season - 1] || 3;
      const titlesForSeason = s.episodeTitles?.[season - 1] || [];
      for (let ep = 1; ep <= count; ep++) {
        const epTitle = titlesForSeason[ep - 1] || `Épisode ${ep}`;
        episodes.push({
          id: `demo:${s.slug}:s${season}e${ep}`,
          seasonNumber: season,
          episodeNumber: ep,
          title: epTitle,
          synopsis: `${s.title} — S${season}E${ep} « ${epTitle} ». Un chapitre qui avance l’enquête sans spoiler inutile.`,
          durationMinutes: s.duration,
          thumbPath: art(`${s.slug}-s${season}e${ep}`, 'episode'),
          versions: s.lang.map((l) => ({
            stream: stream(`${s.slug}-s${season}e${ep}`, l, groupId, sourceId)
          }))
        });
      }
    }
    titles.push({
      id: `logical:demo:${s.slug}`,
      type: 'SERIES',
      canonicalTitle: s.title,
      year: s.year,
      synopsis: s.synopsis,
      genres: s.genres,
      durationMinutes: s.duration,
      posterPath: art(s.slug, 'poster'),
      backdropPath: art(s.slug, 'backdrop'),
      matchKey: { type: 'EXPLICIT', value: `demo:${s.slug}` },
      variants,
      episodes,
      singleSourceOnly: true,
      _demoHue: s.hue,
      _demoProgress: s.progress || 0
    });
  }

  return {
    groups: [...groupsMap.values()],
    titles,
    generatedAtEpochMs: Date.now(),
    demoShowcase: true,
    filmCount: FILMS.length,
    seriesCount: SERIES.length
  };
}

export function demoProgressSeeds(catalog) {
  const out = {};
  for (const t of catalog.titles) {
    if (t._demoProgress > 0) out[t.id] = t._demoProgress;
  }
  return out;
}

/** Deterministic HSL palette from hue for SVG generation. */
export function demoPalette(hue = 0) {
  return {
    deep: `hsl(${hue} 55% 12%)`,
    mid: `hsl(${hue} 60% 28%)`,
    bright: `hsl(${hue} 75% 52%)`,
    soft: `hsl(${hue} 40% 70%)`
  };
}

export function findDemoHue(slug) {
  const base = String(slug || '').replace(/-s\d+e\d+$/i, '');
  const all = [...FILMS, ...SERIES];
  return all.find((x) => x.slug === base)?.hue ?? 0;
}

export function findDemoTitle(slug) {
  const base = String(slug || '').replace(/-s\d+e\d+$/i, '');
  const all = [...FILMS, ...SERIES];
  return all.find((x) => x.slug === base)?.title ?? slug;
}
