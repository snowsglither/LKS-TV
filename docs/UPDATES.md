# Mises à jour automatiques

## Canal (dépôt public)

L’APK lit le manifeste HTTPS public publié avec chaque GitHub Release :

`https://github.com/snowsglither/LKS-TV/releases/latest/download/update-manifest.json`

Configuré dans `app/build.gradle.kts` via `BuildConfig.UPDATE_MANIFEST_URL`. **Aucun token GitHub** n’est embarqué.

Tant qu’aucune Release officielle n’existe, la vérification renvoie une erreur réseau/HTTP (non bloquante) — pas de fausse mise à jour.

## Format `update-manifest.json`

```json
{
  "versionCode": 3,
  "versionName": "0.4.0",
  "apkUrl": "https://github.com/snowsglither/LKS-TV/releases/latest/download/LKS-TV.apk",
  "sha256": "abcdef…",
  "changelog": "See GitHub Release notes for LKS TV 0.4.0.",
  "minSdk": 24
}
```

Comparaison côté app : **`versionCode` entier**, pas seulement `versionName`.

## Flux TV

1. Au démarrage (non bloquant) et via Paramètres → À propos → Rechercher une mise à jour.
2. Compare `versionCode` installé vs distant.
3. Dialogue : Mettre à jour / Plus tard / Nouveautés.
4. Téléchargement HTTPS → progression → SHA-256 → ouverture de l’installateur système.
5. Android demande confirmation ; pas d’installation silencieuse.

## Préservation des données

Même `applicationId` (`com.lkstv.app`) + **même signature de production** → profils, sources, secrets Keystore, progressions et préférences survivent.

Les builds **debug** (`com.lkstv.app.debug`) ne partagent pas les données avec la release.

## Développement vs officiel

- CI push/PR : tests + APK **debug** artefact.
- Release officielle : workflow `release.yml` (tag `v*` ou *workflow_dispatch*) → APK signée `LKS-TV.apk` + checksum + manifeste.
