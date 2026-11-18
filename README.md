# LKS TV

Native **Android TV / Google TV** client for authorized IPTV sources (Xtream Codes / M3U). Kotlin, Jetpack Compose (TV), D-pad-first.

**Repository:** [github.com/snowsglither/LKS-TV](https://github.com/snowsglither/LKS-TV) (public). Android updates via GitHub Releases + HTTPS manifest (no tokens in the APK). Tizen uses a separate `.wgt` package (see [docs/TIZEN.md](docs/TIZEN.md)).

## Current status

**TASK-016** — Samsung Tizen Web TV app (`tizen-tv/`) alongside native Android; shared JS domain modules; CI builds unsigned `.wgt`.

**TASK-015.x** — autonomous APK, GitHub Actions, in-app HTTPS update check.

Still open: Samsung hardware validation, native XMLTV EPG on Android, WorkManager periodic sync, Room, official signed store releases.

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
| [docs/TIZEN.md](docs/TIZEN.md) | Samsung Tizen app, `.wgt`, install |
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

## Samsung Tizen

```powershell
cd tizen-tv
npm test
npm run build:wgt
```

Details: [docs/TIZEN.md](docs/TIZEN.md). Unsigned `.wgt` only in CI — sign with Tizen Certificate Manager locally. Do not commit `.p12` certificates.

## Safety

Do not commit IPTV credentials, playlists, signing keys, `.data/` vault files, or copyrighted media. Use the bundled `sample_playlist.m3u` for local sync tests only. Xtream passwords must never appear in client-side JavaScript; the preview stores them encrypted server-side only.
