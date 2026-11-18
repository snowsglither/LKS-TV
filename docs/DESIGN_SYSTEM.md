# LKS TV — Design system (TASK-004)

**Status:** Accepted for TASK-004 visual direction  
**Identity:** Original LKS TV (deep black + cinematic red). Inspired by patterns, **not** a clone of IPTVX / Movix / Netflix / Disney+.

## Sources studied (Phase A + hub refinement)

| Source | Access | What was used |
|---|---|---|
| [IPTVX](https://iptvx.app/) + [features](https://iptvx.app/features/) + [IPTVX 25 Movie Page](https://iptvx.app/newsroom/iptvx-25-for-you-redesign/) | OK | IPTV as cinematic library: Live / Movies / Series / Guide; provider categories as rails; Movie Page = backdrop + title hierarchy + Play/Resume + secondary personal actions; seasons/episodes grouped; empty discovery rows omitted |
| [Movix.luxe](https://movix.luxe/) | Page fetch returned **empty** (no usable markup) | — |
| Movix Open Source on Desktop (`MovixOpenSource-main`) | OK (layout study only) | Detail pattern: full-bleed backdrop, vertical poster left, synopsis + meta, primary Play, secondary list actions, collection/similar carousels, season/episode panels |
| Movix screenshots in **LKS TV repo** | **None found** (0 image assets) | Not consulted — do not claim otherwise |
| [Netflix.com](https://www.netflix.com/) | Marketing site only (no logged-in catalog) | Profile gate, immersive home, hero banner + horizontal poster rails, Continue Watching — applied from established TV UX patterns + product spec |
| [Disney+](https://www.disneyplus.com/) | Marketing site only | Universe/collection tiles, franchise emphasis, large illustrated entries — applied as hub “destination tiles”, not brand assets |
| [Apple HIG — Focus & selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection) / [Designing for tvOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-tvos) | Partial (docs shells; principles from HIG) | Clear focus via elevation/scale (not permanent thick chrome); secondary actions quieter; 10-foot readability; short motion; depth without heavy glassmorphism |

## Principles

1. **Content is the UI** — posters, backdrops and titles dominate; chrome is minimal.
2. **No dashboard** — no permanent horizontal nav bar on catalog; no admin panels as primary UX.
3. **TV-first 16:9** — large focus targets, spatial D-pad, restore focus on Back.
4. **Cinematic depth** — deep black canvases, soft image gradients, almost no visible borders.
5. **Honest rows** — never invent Top / Recommendations / Monthly without real signals; omit or label as unavailable.
6. **IPTV honesty** — provider groups remain first-class rails; language versions are variants, not title merges.
7. **Profile world** — each profile is a visual world (avatar + prefs), not a corner label.

## Tokens

```
--lks-bg:           #050507
--lks-bg-elevated:  #0E1014
--lks-surface:      #14181F
--lks-red:          #E50914
--lks-red-soft:     #FF2A36
--lks-text:         #F5F5F7
--lks-text-muted:   #A1A1AA
--lks-focus:        #FFFFFF
--lks-gold:         #C9A227   /* secondary meta only */
--lks-radius-sm:    6px
--lks-radius-md:    12px
--lks-poster-w:     160px     /* TV scale; Compose: 140–180dp */
--lks-hero-h:       58vh
--lks-ease:         cubic-bezier(0.22, 1, 0.36, 1)
--lks-focus-scale:  1.08
--lks-motion-fast:  160ms
--lks-motion-med:   320ms
```

Typography (web): `"Segoe UI Variable", "Segoe UI", system-ui` with heavy display weights for titles.  
Typography (Android): Material TV defaults + bold display for heroes (no proprietary Netflix/Disney fonts).

## Components

| Component | Role |
|---|---|
| `SplashCinematic` | Black → logo pulse → zoom → profiles (skippable / reduceMotion) |
| `ProfileGate` | Large avatars, focus scale, add/edit affordances |
| `HubDestinations` | **Primary:** 3 large cinematic cards (Live, Films, Séries). **Secondary:** compact bar (EPG, Library, Settings). Logo + profile avatar top. Inspired by tvOS focus depth — not 6 equal dashboard tiles |
| `SectionChrome` | Back · Refresh · Customize · Profile avatar (catalog only) |
| `HeroBillboard` | Backdrop + gradient + title/meta + Lire / Détails / Ma liste |
| `PosterRail` | Horizontal D-pad row |
| `DetailCinema` | Backdrop + vertical poster + actions + versions + similar |
| `SeriesSeasonPanel` | Season pills (Select to commit) + episode list |
| `CustomizeSheet` | Groups / rows / hide / language — profile-scoped |

## Row policy (honest)

| Row | Show when |
|---|---|
| Continuer à regarder | `progressFraction > 0` and not dismissed |
| Nouveautés | items with known year, sorted |
| Catalogue synchronisé / groupes IPTV | always when content exists |
| Sélection / Top / Recommandations | **only** if future signals exist; otherwise omit (do not fake) |

## Motion

- Splash ≤ ~2.2s; respect `reduceMotion` / settings toggle.
- Focus: scale + soft white ring (Compose: `border` glow, avoid heavy blur on TV boxes).
- Screen transitions: short fade/slide, no long parallax.

## ADR link

See `docs/DECISIONS.md` ADR-009.
