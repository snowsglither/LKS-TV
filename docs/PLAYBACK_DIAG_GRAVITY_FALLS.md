# Diagnostic lecture navigateur — Gravity Falls (durée 21:33, écran noir à 0:00)

**Date:** 2026-11-17  
**Surface:** web-preview localhost uniquement (≠ Media3 Android)

## Symptôme observé

- Le navigateur affiche une **durée ~21:33** (`loadedmetadata`).
- `currentTime` reste à **0:00**, image noire.
- Aucune confirmation visuelle de frames.

## Cause exacte (mesurée sur le catalogue réel)

Épisode Gravity Falls (`FR - Souvenirs de Gravity Falls`) :

| Champ | Valeur |
|---|---|
| Opaque | `lks-xtream://…/series/…?ext=mkv` |
| Upstream HTTP | **206** Partial Content |
| `Content-Type` | **`video/x-matroska`** |
| Taille | ~1,20 Go (`content-range` bytes 0-524287/1200434307) |
| Sniff | **container = mkv**, `browserLikely = no` |

**Conclusion :** Chrome peut parfois exposer une durée / métadonnées partielles, mais **ne lit pas le Matroska/MKV dans `<video>`** → écran noir à 0:00. Ce n’est **pas** une lecture réussie. La cible correcte est **Media3 / ExoPlayer** sur Android TV.

## Règle de succès (imposée)

| Événement | Signifie un succès ? |
|---|---|
| `loadedmetadata` / durée affichée | **Non** |
| `canplay` | **Non** |
| `playing` seul | **Insuffisant** |
| `playing` **et** `currentTime > 0` **et** `videoWidth > 0` | **Oui** (navigateur) |

## Causes probables (par ordre de fréquence IPTV)

1. **Codec vidéo HEVC/H.265 dans un MP4** — Chrome lit le `moov` (durée OK) mais ne décode pas la piste vidéo → écran noir. Audio parfois silencieuse aussi.
2. **Proxy sans HTTP Range / buffering intégral** — l’ancien handler faisait `arrayBuffer()` sur tout le fichier et n’forwardait pas `Range` → le lecteur peut rester bloqué après métadonnées.
3. **Conteneur MKV/TS** — métadonnées partielles ou échec DECODE.
4. **`video.play()` rejeté** (autoplay) — moins fréquent après geste utilisateur, mais journalisé.

## Correctifs livrés

| Composant | Changement |
|---|---|
| `lib/mediaProxy.js` | Sniff codecs (`hev1`/`hvc1`/`avc1`…), probe upstream Range, **stream + forward Range → 206** |
| `server.mjs` media routes | Plus de buffer mémoire du fichier entier ; proxy streamé |
| `POST /api/player/open` | Probe **upstream** (pas loopback) + `sniff` exposé au client |
| `public/app.js` `initPlayerVideo` | Instrumentation complète des événements ; succès seulement si progression réelle ; rapport `/api/player/client-diag` |

## Comment re-tester Gravity Falls

1. Redémarrer le preview : `cd web-preview && npm run dev`
2. Ouvrir la fiche série → épisode → Lire
3. Attendu immédiat : message d’**incompatibilité MKV / Matroska** (probe serveur)
4. Journal live : `loadedmetadata` possible, puis timeout sans `currentTime>0` / `videoWidth>0`
5. Succès navigateur **non déclaré** pour cet épisode — valider plutôt sur un VOD **MP4/H.264** si disponible, ou sur **Media3 Android**

## Media3 Android

Non modifié par ce diagnostic. HEVC/MKV restent la cible native ExoPlayer — le web doit **annoncer clairement** l’incompatibilité au lieu d’un écran noir silencieux.
