# Matrice de parité web-preview ↔ Android TV (TASK-015)

Légende : **OK** implémentée · **PART** partielle · **ABS** absente · **NV** non validée sur hardware TV

| Fonctionnalité | Web-preview | Android TV | Notes |
|---|---|---|---|
| Sélection profils au lancement | OK | OK | Splash → Profiles ; pas d’auto-sélection |
| Création / modif / suppression profils | OK | PART | Android : création + rename API + remove ; UI gestion limitée |
| Préférences indépendantes par profil | OK | OK | JSON local profilé |
| Import Xtream | OK | OK | Validation auth avant enregistrement |
| Import M3U URL / fichier | OK | PART | URL OK ; fichier = sample assets / path (pas file picker TV complet) |
| Plusieurs sources simultanées | OK | OK | |
| Sync + cache catalogues | OK | OK | JSON sous filesDir ; gros catalogues paging UI |
| Config groupes Films/Séries/TV | OK | OK | GroupSetup |
| Catalogue filtré par groupes | OK | OK | |
| Recherche multilingue + dédup | OK | OK | |
| Fusion œuvres / éditions | OK | OK | MatchKey trusted |
| Fiches films/séries premium | OK | OK | |
| Saisons / épisodes + miniatures | OK | OK | |
| Progression par épisode | OK | OK | Persistance prefs |
| Continuer à regarder | OK | OK | |
| Favoris / à regarder | OK | OK | |
| Lecture Media3 | ABS (browser) | OK | Web = HTML5 limité |
| Pistes audio / ST / éditions | PART | OK | |
| Changement épisode depuis lecteur | PART | OK | |
| TV live + zapping + preview | OK | OK | Preview NV hardware |
| Guide EPG XMLTV | OK | ABS | Android : écran diagnostic / stub — XMLTV natif manquant |
| D-pad / focus / Retour | PART (clavier) | PART | Code présent ; **NV** télécommande physique |
| Paramètres + langues | OK | OK | + À propos / update |
| Persistance après reboot / update APK | OK (PC .data) | OK | Même applicationId ; PC ≠ TV |
| Désactivation auto DEMO_SHOWCASE | OK | OK* | *Android n’embarque pas DEMO_SHOWCASE dense ; sample M3U = source réelle |
| Update check HTTPS | ABS | OK | Manifeste vide = désactivé jusqu’à config |
| Autonomie sans localhost | N/A | OK | |

## Écarts prioritaires restants

1. **EPG XMLTV natif Android** — absent.
2. **Validation D-pad hardware** — non réalisée.
3. **File picker M3U** sur TV — limité.
4. **Migration explicite PC → TV** — non livrée (volontaire).
5. **Canal update** — URL manifeste à fournir ; dépôt privé sans PAT dans l’APK.
