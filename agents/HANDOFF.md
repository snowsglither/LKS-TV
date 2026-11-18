# Handoff — LKS TV

## Latest update

**Agent:** Coding agent (Cursor)  
**Task:** TASK-016 — Android TV + Samsung Tizen  
**Date:** 2026-11-18  
**Status:** App Tizen Web TV créée (`tizen-tv/`), modules `shared/js/`, CI Tizen, docs. Android inchangé fonctionnellement. **Pas de release officielle.** **Non validé sur TV Samsung réelle.**

## Architecture

| Client | Chemin |
|---|---|
| Android native Kotlin/Media3 | `app/` (pas WebView) |
| Tizen Web TV | `tizen-tv/` → `.wgt` |
| Domaine JS portable | `shared/js/` → vendored `tizen-tv/js/lib/` |
| Preview PC | `web-preview/` (dev only) |

## Tizen implémenté

- `config.xml` (Tizen 6.0+, tv-samsung)
- Focus / Retour télécommande
- Profils + prefs `localStorage`
- Xtream / M3U validés, sync, démo mutual exclusion
- Films / Séries / Live / Recherche / Favoris / progression
- Lecteur AVPlay + fallback HTML5
- `npm test` + `npm run build:wgt` (unsigned)

## Tests exécutés

```text
cd tizen-tv && npm test          OK
cd tizen-tv && npm run build:wgt OK → dist/LKS-TV.wgt (unsigned, gitignored)
.\gradlew.bat :app:testDebugUnitTest  (régression Android)
cd web-preview && npm test       OK
```

## Non validé

- Samsung TV / Emulator Tizen hardware
- Codecs IPTV réels sur AVPlay
- Signature `.wgt` Distributor Samsung
- Mises à jour store Smart Hub

## Docs

- `docs/TIZEN.md` — install, codecs, updates
- ADR-012 dans `docs/DECISIONS.md`
