# Handoff — LKS TV

## Latest update

**Agent:** Coding agent (Cursor)  
**Task:** TASK-015.1 — Connecter GitHub public + activer releases  
**Date:** 2026-11-18  
**Status:** origin → `https://github.com/snowsglither/LKS-TV.git`. Push initial + CI. **Pas de release officielle** tant que les secrets de signature ne sont pas configurés. D-pad / update sur TV physique **non validés**.

---

## 1. Matrice de parité

Voir `docs/PARITY_MATRIX_TASK015.md`.

Résumé : la plupart des fonctions catalogue / profils / lecteur / live / recherche sont présentes des deux côtés. Écarts restants majeurs : **EPG XMLTV natif Android (ABS)**, **file picker M3U TV (PART)**, **validation télécommande (NV)**, **migration PC→TV (ABS volontaire)**.

## 2. Fonctionnalités Android corrigées / ajoutées

- `ProfileStore` + CRUD SessionRepository (add / rename / remove) ; UI création profil branchée.
- Formulaires Paramètres : Xtream + M3U URL avec **validation réelle** avant persist (rollback secrets si auth échoue).
- Refus explicite des URL `localhost` / `127.0.0.1` pour M3U.
- `AppUpdateChecker` + `AppUpdateInstaller` (HTTPS, SHA-256, FileProvider, `REQUEST_INSTALL_PACKAGES`).
- Dialogue mise à jour + Paramètres → À propos → Rechercher une mise à jour.
- `versionCode=2` / `versionName=0.3.0` ; `UPDATE_MANIFEST_URL` vide jusqu’à config.
- Manifest FileProvider + permissions install.

## 3. Désactivation démo

**Web :** `disableDemoSources` + `clearDemoCatalogIfPresent` à l’ajout Xtream/M3U (validé) / sample ; progressions `demo_*` purgées ; suppression de toutes les sources réelles → message explicite (pas de réactivation auto).  
**Android :** pas de source `DEMO_SHOWCASE` embarquée ; catalogue IPTV uniquement après sync ; validation M3U exige des entrées exploitables ; prune orphelins après sync.

Indisponibilité temporaire d’une source : source conservée, erreur affichée, **pas** de retour démo.

## 4. État dépôt GitHub

- `git init` local effectué ; **aucun remote, aucun commit, aucun push**.
- `.gitignore` élargi (secrets, `.data`, keystores, APK, `node_modules`).
- Scan : pas de `.jks` / PAT / `.data` trackés détectés.
- Docs : `INSTALL`, `SIGNING`, `UPDATES`, `VERSIONS`, `PARITY_MATRIX_TASK015`.
- Nom cible privé : `LKS-TV` — **à créer / pousser uniquement avec ton accord**.

## 5. CI/CD

- `.github/workflows/ci.yml` — tests Kotlin, assemble debug, secrets hygiene, smoke web-preview.
- `.github/workflows/release.yml` — dispatch/tag `v*` ; signature via secrets `LKSTV_*` ; checksum + `update-manifest.json` ; attach Release sur tags.

## 6. Système de mise à jour

Démarrage non bloquant + manuel. Manifeste HTTPS JSON. Téléchargement → SHA-256 → installateur système. Pas de PAT GitHub dans l’APK. Canal public d’artefacts requis si le dépôt reste privé.

## 7. Tests exécutés

```text
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug   BUILD SUCCESSFUL
cd web-preview ; npm test                                 OK (smoke-iptv)
```

Nouveaux tests unitaires : `AppUpdateCheckerTest`, `ProfileStoreTest`, `DemoMutualExclusionTest`.

**NON RUN / NV :** install update v1→v2 sur TV physique, D-pad, EPG XMLTV Android, Xtream live réel.

## 8. Étapes manuelles restantes

1. Autoriser création repo privé `LKS-TV` + premier push.
2. Générer keystore prod + secrets Actions (`docs/SIGNING.md`).
3. Publier un canal HTTPS pour `update-manifest.json` + renseigner `UPDATE_MANIFEST_URL`.
4. Tester sur Android TV : onboarding, source réelle, update, persistance après upgrade.
5. Décider canal update si repo privé (Release asset public vs CDN).

## 9. Limitations / risques

- EPG XMLTV Android toujours absent.
- Gestion profils UI (rename/delete) encore minimale.
- M3U fichier hors sample limité sans file picker.
- `UPDATE_MANIFEST_URL` vide → updates désactivées jusqu’à config.
- Debug `applicationIdSuffix=.debug` ≠ release : ne pas mélanger installs pour tester upgrades.
- Données web-preview PC ≠ données TV.

## Fichiers clés

- `app/.../ProfileStore.kt`, `SessionRepository.kt`, `AppViewModel.kt`, `SettingsSourcesScreen.kt`, `UpdateDialog.kt`
- `app/.../update/AppUpdateChecker.kt`, `AppUpdateInstaller.kt`
- `app/build.gradle.kts`, `AndroidManifest.xml`
- `web-preview/server.mjs`, `web-preview/lib/syncEngine.js`
- `.github/workflows/ci.yml`, `release.yml`
- `docs/PARITY_MATRIX_TASK015.md`, `INSTALL.md`, `SIGNING.md`, `UPDATES.md`
