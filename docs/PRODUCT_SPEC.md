# LKS TV — Product specification v0.1

## Experience
- Android TV / Google TV, D-pad-first, immersive premium design; no persistent sidebar.
- Brand animation `LKS TV` then profile selector **on each launch**, then hub: TV, Films, Séries, EPG, Bibliothèque, Paramètres.
- In sections: minimal Back on upper left; refresh, active profile and section menu on upper right. Profile switch accessible throughout primary screens.
- Back button returns from section root to hub, while within a detail page it returns to the preceding screen and restores focus/scroll.
- Films/series catalog has configurable Netflix-style rows: Continue watching, monthly selection, top, new, genres, custom lists; reorder/hide per profile.
- Clicking a poster opens cinematic details before playback. Films show synopsis, poster/backdrop, metadata, variants, related sequels/sagas. Series show seasons, episodes and progress.

## Sources
- User-authorized Xtream Codes and M3U sources; multiple sources combined into one catalog. EPG XMLTV/Xtream.
- Preserve provider folders/groups and allow **per-profile per-source group visibility**. Hiding a group does not delete media.
- Deduplicate identical titles into one logical item **only when sufficiently verified**, retaining all stream variants. Language preference defaults VF; alternate EN/NL and other languages configurable per profile. Prompt if no preferred language available. Episode availability is per episode.
- Distinguish multi-audio single stream from separate provider URLs. Group visibility and version availability are separate decisions: optional hidden group as alternate language source for an otherwise visible title.
- Preserve manual overrides after sync. Manual refresh and scheduled refresh; WorkManager is best effort, not exact scheduling.

## Playback & TV
- Media3 ExoPlayer; playback position and watch status per profile and per episode. If stream variant changes, restore compatible position where possible.
- Live TV: focused channel preview after ~500ms debounce; OK fullscreen; Up/Down zapping; EPG grid and program detail; channel group hierarchy and custom sorting.

## Library & visibility
- Favorites, watch later, collections, smart collections, history, continue watching, continue saga, next episode, recommendations.
- Distinct actions: remove from Continue Watching (keep catalog/progress), move to Watch Later, mark watched, exclude from recommendations, hide individual item, hide entire provider group.
- Removing from Continue Watching must not immediately reappear after sync; preserve profile-specific dismissal state. Provide a way to undo or restore.
- Per-profile separation of theme, lists, progress, preferences, hidden content and visible groups.

## Settings
- Global: IPTV providers, refresh interval, backups, profiles, player, themes.
- Per section: group visibility, row visibility/order, content hide, sorting and layout.
- Theme options: Obsidian Gold, Midnight Sapphire, Platinum, Royal Burgundy; logo red vs theme accent remains undecided.

## Safety and legal
- Do not bundle playlists, copyrighted media, provider credentials or unlicensed content.
- Secure source secrets via Android Keystore-backed solution; never log secrets.
- Metadata API usage must comply with provider terms and attribution requirements.

## Out of scope for first mission
- Live provider connection, streaming, EPG parsing, real profile persistence, sync, TMDB, release signing.
