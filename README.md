# LKS TV

Native **Android TV / Google TV** client for authorized IPTV sources (Xtream Codes / M3U). Kotlin, Jetpack Compose (TV), D-pad-first.

**Repository:** [github.com/snowsglither/LKS-TV](https://github.com/snowsglither/LKS-TV) (public). Updates via GitHub Releases + HTTPS manifest (no tokens in the APK).

## Current status

**TASK-015** — autonomous APK parity push, persistent profiles, demo mutual exclusion with real IPTV, GitHub Actions CI/release scaffolding, in-app HTTPS update check (manifest URL configurable).

Earlier: navigation shell, IPTV multi-source + Keystore, catalog merge, cinematic UI, search, Live TV, Media3 player, premium detail/player UX.

Still open: native XMLTV EPG on Android, hardware D-pad sign-off, WorkManager periodic sync, Room (JSON stores — ADR-007), explicit PC→TV migration.

## Docs

| Document | Purpose |
|---|---|
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | Product experience and rules |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module and layer plan |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture Decision Records |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Mission sequence |
| [docs/INSTALL.md](docs/INSTALL.md) | Install on Android TV |
| [docs/SIGNING.md](docs/SIGNING.md) | Release signing & key recovery |
| [docs/UPDATES.md](docs/UPDATES.md) | In-app update channel |
| [docs/PARITY_MATRIX_TASK015.md](docs/PARITY_MATRIX_TASK015.md) | Web ↔ Android parity |
| [docs/VERSIONS.md](docs/VERSIONS.md) | Version history |
| [agents/AGENTS.md](agents/AGENTS.md) | Agent coordination rules |
| [agents/HANDOFF.md](agents/HANDOFF.md) | Latest agent handoff |

## Build (Android TV — primary)

```powershell
.\gradlew.bat :app:assembleDebug
.\gradlew.bat :app:testDebugUnitTest
```

The APK does **not** depend on localhost or the web preview.

## Web preview (PC — localhost only)

Functional **localhost IPTV** environment (Xtream / M3U / prefs / limited browser playback), plus UI preview. Keyboard arrows + Enter + Escape simulate a remote; mouse works too.

```powershell
cd web-preview
npm install
npm run dev
```

Then open **http://127.0.0.1:3000**. Server binds **127.0.0.1** by default. Smoke: `npm test`.

Details, security notes, and Android vs preview differences: [web-preview/README.md](web-preview/README.md).

**Do not treat the preview as validation of native Compose / D-pad behaviour.**

## Safety

Do not commit IPTV credentials, playlists, signing keys, `.data/` vault files, or copyrighted media. Use the bundled `sample_playlist.m3u` for local sync tests only. Xtream passwords must never appear in client-side JavaScript; the preview stores them encrypted server-side only.
