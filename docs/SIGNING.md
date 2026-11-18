# Signature APK et récupération des clés

## Règles

- Ne jamais committer `*.jks`, `*.keystore`, `keystore.properties`, mots de passe.
- Garder **la même clé de production** entre versions (sinon mise à jour impossible sans désinstaller → perte de données).
- `applicationId` fixe : `com.lkstv.app` (debug utilise le suffixe `.debug`).
- **Ne pas publier de Release officielle** tant que les secrets Actions ne sont pas configurés.

## Créer une clé (une fois, hors dépôt)

```bash
keytool -genkeypair -v -keystore lks-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias lks
```

Créer `keystore.properties` à la racine du projet (déjà gitignoré) :

```properties
storeFile=lks-release.jks
storePassword=***
keyAlias=lks
keyPassword=***
```

## Sauvegarde obligatoire

1. Copie chiffrée de `lks-release.jks` dans un gestionnaire de secrets / coffre hors-ligne.
2. Noter alias, date de création, et empreinte du certificat :
   ```bash
   keytool -list -v -keystore lks-release.jks
   ```
3. Deuxième copie hors site (USB chiffrée / cloud privé chiffré).
4. Si la clé est **perdue** : impossible de mettre à jour les installs existantes avec `com.lkstv.app`.
5. Si la clé **fuit** : considérer compromise ; nouvelles installs seulement avec une nouvelle identité de package.

## Secrets GitHub Actions (à configurer manuellement)

Repo → **Settings → Secrets and variables → Actions → New repository secret** :

| Secret | Contenu |
|---|---|
| `LKSTV_KEYSTORE_BASE64` | Contenu du `.jks` encodé en base64 |
| `LKSTV_KEYSTORE_PASSWORD` | Mot de passe du keystore |
| `LKSTV_KEY_ALIAS` | Alias (ex. `lks`) |
| `LKSTV_KEY_PASSWORD` | Mot de passe de la clé |

### Encoder le keystore (Windows PowerShell)

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\lks-release.jks")) | Set-Clipboard
```

### Encoder le keystore (macOS / Linux)

```bash
base64 -i lks-release.jks | pbcopy   # macOS
base64 -w0 lks-release.jks           # Linux
```

Le workflow `release.yml` échoue volontairement si ces secrets manquent — pas de release non signée « officielle ».

## Vérification

```bash
apksigner verify --print-certs LKS-TV.apk
sha256sum LKS-TV.apk
```

Optionnel : renseigner `UPDATE_EXPECTED_CERT_SHA256` (hex sans `:`) dans `app/build.gradle.kts` après la première signature stable.
