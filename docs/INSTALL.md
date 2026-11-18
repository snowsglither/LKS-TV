# Installation — LKS TV (Android TV)

## Prérequis

- Android TV / Google TV API 24+
- Accès réseau aux sources IPTV autorisées
- APK signée LKS TV (debug pour développement, release pour distribution)

## Installer une APK

1. Copier l’APK sur la TV (clé USB, `adb install`, ou téléchargement in-app).
2. Autoriser l’installation depuis sources inconnues / l’app source si demandé.
3. Ouvrir LKS TV → écran profils → Paramètres → ajouter Xtream ou M3U.
4. Valider la source (auth Xtream réelle / playlist M3U exploitable) puis **Actualiser**.

L’APK est **autonome** : aucun PC, localhost, ni serveur `web-preview` n’est requis.

## Premier lancement

1. Splash → sélection / création de profil (persisté localement).
2. Sans source IPTV validée : catalogues vides côté Android (la démo dense `DEMO_SHOWCASE` est un outil web-preview).
3. Après source réelle validée : synchronisation du catalogue local, groupes Films/Séries/TV par profil.

## Données PC → TV

Les préférences `web-preview/.data` **ne sont pas** migrées automatiquement. Prévoir un export/import explicite futur ; pour l’instant reconfigurer sources + profils sur la TV.

## Mises à jour

Voir [UPDATES.md](UPDATES.md). Même `applicationId` + même clé de signature pour conserver profils, sources et progressions.
