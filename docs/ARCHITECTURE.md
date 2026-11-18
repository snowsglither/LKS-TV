# LKS TV — Architecture

## Goals

- Android TV / Google TV only for v1 UI (phone/tablet later if ever).
- Clear UI / state / domain separation so IPTV ingestion and player can plug in without rewriting navigation.
- Profile-scoped user preferences; device-scoped source credentials.

## Current shape (TASK-001 + TASK-002)

Single Gradle module `:app` with internal packages:

```
app/
  domain/          # UI catalog models + FakeCatalog
  domain/iptv/     # IPTV models, repository contracts, merge policy
  data/            # SessionRepository (profile prefs)
  data/iptv/       # parsers, repos, Keystore secrets, sync
  ui/              # Compose TV shell (TASK-001) + Settings sources
```

### Layers

| Layer | Responsibility |
|---|---|
| `domain` / `domain.iptv` | Models + interfaces; no Android framework types in IPTV contracts |
| `data.iptv` | M3U/Xtream ingest, JSON stores, EncryptedSharedPreferences, sync engine |
| `data` | Profile session preferences (in-memory); refresh delegates to sync when sources exist |
| `ui.state` | `AppViewModel` |
| `ui` | Compose TV screens |

### IPTV flow

1. User adds Xtream/M3U source (device-scoped). Passwords → `SecretStore` only.
2. Manual sync (`CatalogSyncCoordinator`) fetches enabled sources, normalizes groups, merges with trusted keys only.
3. Unified catalog persisted to `catalog.json`. Profile `hiddenGroupIds` are never cleared by sync.
4. UI Films/Séries still render `FakeCatalog` until a later UI mapping task; Settings + Menu groups already surface IPTV groups when present.

### Navigation (logical)

`Splash → Profiles → Hub → Section → Detail`

### Planned modules (later)

| Module | Owner | Role |
|---|---|---|
| `core:model` | Architecture | Extract shared types |
| `feature:player` | Player agent | Media3 + resolve `lks-xtream://` |
| WorkManager worker | IPTV/Integrator | Call `PeriodicSyncScheduler` for real |

### Focus & input

- Compose for TV (`androidx.tv.material3`), D-pad-first, system Back via `BackHandler`.
