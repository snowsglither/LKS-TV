# LKS TV — web-preview (localhost IPTV)

Environnement **fonctionnel** sur PC pour tester les sources IPTV réelles (Xtream / M3U), les préférences par profil, et une lecture navigateur limitée.

**Ce n’est pas une validation du focus Compose / D-pad Android TV.** L’APK ne dépend pas de ce serveur.

## Démarrage

```powershell
cd web-preview
npm install
npm run dev
```

Ouvrir [http://127.0.0.1:3000](http://127.0.0.1:3000).

Bind par défaut : `127.0.0.1:3000` (`LKS_PREVIEW_HOST` / `LKS_PREVIEW_PORT` pour override).

Tests locaux sans fournisseur :

```powershell
npm test
```

## Fonctionnel (TASK-004.5)

- Ajout Xtream (auth réelle) — secret chiffré sous `.data/xtream-vault.enc.json`
- M3U URL + fichier local (upload serveur)
- Sample M3U + **Démo UI** (`DEMO_SHOWCASE`) — **jamais mélangés** au catalogue IPTV réel
- Sync manuelle (bouton Actualiser / Synchroniser) + sync auto optionnelle tant que Node tourne
- Catalogues Films / Séries / TV avec posters/backdrops fournisseur + fallback dégradé
- Prefs profil persistantes (groupes, langue VF, favoris, listes, masquage)
- Lecteur web (HLS via hls.js / progressive) — codecs IPTV souvent incomplets dans Chrome

## Sécurité

- Écoute loopback uniquement
- Mots de passe Xtream : coffre AES-GCM local, jamais dans `preview-state.json` ni JSON API
- Pas de proxy ouvert : destinations limitées aux sources enregistrées / hôtes Xtream connus
- SSRF : IP privées bloquées sauf case « Autoriser IP privée / LAN »
- TLS : pas de désactivation globale

## Différences vs Android

| Sujet | Android TV APK | web-preview |
|---|---|---|
| UI | Jetpack Compose TV | HTML/CSS/JS |
| Secrets | Android Keystore | AES-GCM + clé locale `.data/preview.key` |
| Sync Xtream | OkHttp | `lib/xtreamClient.js` (mêmes actions player_api) |
| Playback | Media3 (TASK-005) | hls.js / `<video>` (limité) |
| Focus | Compose D-pad | Clavier spatial approximatif |
| Persistance | filesDir + EncryptedSharedPreferences | `.data/preview-state.json` (+ vault) |

## Parcours suggéré

1. Profil Alex → Paramètres  
2. Ajouter Xtream **ou** M3U URL/fichier **ou** Sample M3U  
3. Synchroniser / Actualiser  
4. Films / Séries / TV → fiche → Lire (navigateur)  
5. Personnaliser → masquer un groupe → basculer Sam (prefs séparées)  
6. Démo UI seule uniquement pour juger le design (désactive l’IPTV réel)

Ne committez jamais `.data/`, credentials, ni playlists personnelles.
