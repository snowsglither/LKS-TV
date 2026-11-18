# Shared JS (web / Tizen)

Portable ES modules for catalog, languages, search, demo showcase, and related domain rules.

- **Source of truth for Tizen:** files here are synced into `tizen-tv/js/lib/` via `tizen-tv/scripts/sync-shared.mjs`.
- **web-preview** may still keep copies under `web-preview/lib/` (Node-specific modules like `session.js` / `secrets.js` stay there).
- **Android** remains Kotlin — these modules are not the APK runtime.

Do not add `fs`, Express, or Node-only APIs to this package.
