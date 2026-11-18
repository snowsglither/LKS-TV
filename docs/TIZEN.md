# LKS TV — Samsung Tizen

## Architecture

| Plateforme | Implémentation |
|---|---|
| Android TV / Google TV | Application native Kotlin + Media3 (`app/`) — **pas** une WebView |
| Samsung Tizen | Application Web TV distincte (`tizen-tv/`) |
| Logique partagée | Modules JS portables dans `shared/js/` (langues, catalogue, recherche, démo…) vendored dans `tizen-tv/js/lib/` |

Le serveur `web-preview` reste un outil de développement PC. L’app Tizen est **autonome** (fetch Xtream/M3U depuis la TV, persistance `localStorage`).

## Compatibilité ciblée

| Cible | Détail |
|---|---|
| Tizen | **6.0+** (`required_version` dans `config.xml`), profil `tv-samsung` |
| Résolution | 1920×1080 landscape |
| Lecteur | **AVPlay** (`webapis.avplay`) sur TV ; repli HTML5 `<video>` en navigateur/CI |
| Codecs | H.264/AAC (MP4/TS/HLS) généralement OK. **HEVC / MKV / audio rares** souvent incompatibles — erreur explicite, pas de silence |
| Réseau | Privilèges `internet` + `network.public` ; CORS fournisseur peut bloquer certains panels |

**Non validé sur appareil Samsung réel dans TASK-016** (pas de TV/simulateur disponible ici).

## Fonctionnalités Tizen implémentées

- Navigation télécommande (flèches / OK / Retour) + focus
- Profils persistants (création, sélection)
- Sources Xtream + M3U URL avec **validation réelle** avant enregistrement
- Sync catalogue, films / séries / Live, recherche
- Favoris, continuer à regarder, progression épisode
- Lecteur AVPlay / HTML5, pistes audio/ST best-effort (AVPlay)
- Règles démo identiques (pas de mélange, pas de réactivation auto)

## Build `.wgt`

```powershell
cd tizen-tv
npm test
npm run build:wgt
```

Produit `tizen-tv/dist/LKS-TV.wgt` **non signé**.

### Signature (machine de développement)

1. Installer [Tizen Studio](https://developer.tizen.org/) + TV Extensions.
2. Certificate Manager → certificat **Samsung** (Distributor) + Author.
3. Ne jamais committer les `.p12` / mots de passe.
4. Emballer / signer :
   ```bash
   tizen package -t wgt -s <YourProfile> -- tizen-tv/dist/staging
   ```
   ou importer le projet dans Tizen Studio → Build Signed Package.

## Installation développement sur Samsung TV

1. TV : Paramètres → Divers (ou Device Manager) → activer **Mode développeur** (IP du PC).
2. Sur le PC : Device Manager (Tizen Studio) → connecter l’IP de la TV.
3. `tizen install -n LKS-TV.wgt -t <device>`
4. Ou : Smart Hub → Apps → télécharger via outil Dev.

Les stores Samsung (Seller Office / Smart Hub Preview) ont leur propre cycle de revue — **hors** GitHub Releases APK.

## Mises à jour Tizen

- **Ne pas** réutiliser le téléchargement/install APK Android.
- Canaux usuels : mise à jour via **Seller Office** / Smart Hub, ou réinstall `.wgt` en mode développeur.
- Un check GitHub Releases JSON est possible pour *notifier* une version, mais l’installation silencieuse / sideload auto n’est **pas** un équivalent fiable de l’installateur Android — ne pas le promettre sans API Samsung supportée pour votre modèle.

## Limitations restantes

- Pas de validation hardware Samsung dans cette tâche.
- Credentials Xtream en `localStorage` (moins fort qu’Android Keystore).
- EPG XMLTV non porté.
- Icone placeholder à remplacer pour le store.
- File picker M3U local limité (URL + texte playlist).
