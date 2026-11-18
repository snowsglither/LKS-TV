# Handoff — LKS TV

## Latest update

**Agent:** Coding agent (Cursor)  
**Task:** TASK-015.1 — Connecter GitHub public + activer releases  
**Date:** 2026-11-18  
**Status:** Push `main` OK. CI **success** (android + secrets-scan + web-preview). Artefact `lks-tv-debug` publié. **Pas de release officielle** tant que les secrets de signature ne sont pas configurés. Update TV physique **non testée**.

## GitHub

- Repo : https://github.com/snowsglither/LKS-TV (public)
- `origin` → `https://github.com/snowsglither/LKS-TV.git`
- Premier commit : `b982496` — 223 fichiers, audit secrets OK
- CI run : https://github.com/snowsglither/LKS-TV/actions/runs/44288338519 → **success**
- Artefact CI : `lks-tv-debug` (~22 Mo)

## Update channel

`UPDATE_MANIFEST_URL` =
`https://github.com/snowsglither/LKS-TV/releases/latest/download/update-manifest.json`

404 attendu jusqu’à la première Release signée.

## Secrets Actions à configurer (manuel)

| Secret | Usage |
|---|---|
| `LKSTV_KEYSTORE_BASE64` | Keystore release encodé base64 |
| `LKSTV_KEYSTORE_PASSWORD` | Mot de passe store |
| `LKSTV_KEY_ALIAS` | Alias |
| `LKSTV_KEY_PASSWORD` | Mot de passe clé |

Procédure : `docs/SIGNING.md`. Ne pas lancer `release.yml` avant.

## Étapes restantes avant release officielle

1. Générer + sauvegarder `lks-release.jks` hors dépôt.
2. Ajouter les 4 secrets Actions.
3. Aligner `versionCode` / `versionName` si besoin.
4. Lancer **Actions → Release → Run workflow** (ou tag `v0.3.0`).
5. Vérifier assets `LKS-TV.apk`, `.sha256`, `update-manifest.json`.
6. Installer release sur TV, puis tester update (non fait ici).

## Non validé

- Mise à jour in-app sur Android TV réelle.
- Signature de production (secrets absents).
- D-pad hardware / EPG XMLTV Android.
