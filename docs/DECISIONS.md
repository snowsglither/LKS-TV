# Architecture decisions

## ADR-001 — Single `:app` module for TASK-001

**Status:** Accepted  
**Context:** No Kotlin scaffold existed; only product/agent markdown. Splitting feature modules early would slow the navigation prototype.  
**Decision:** Ship TASK-001 as one Android application module with internal `domain` / `data` / `ui` packages.  
**Consequences:** Faster iteration; Integrator may extract `core:*` / `feature:*` when IPTV or player work starts.

## ADR-002 — Compose for TV (tv-material3)

**Status:** Accepted  
**Context:** Product requires D-pad-first premium UI.  
**Decision:** Use Jetpack Compose with `androidx.tv.material3` and TV-friendly focus borders.  
**Consequences:** Lean stack; avoid Leanback XML fragments for new screens.

## ADR-003 — Profile-scoped in-memory preferences

**Status:** Accepted  
**Context:** Spec requires per-profile lists/visibility; persistence is out of scope for TASK-001.  
**Decision:** `SessionRepository` holds two demo profiles and separate preference maps in memory.  
**Consequences:** Switching profile changes visible rows/groups immediately; state resets on process death.

## ADR-004 — No IPTV / Media3 / Room / WorkManager in TASK-001

**Status:** Accepted  
**Context:** Explicit task constraints.  
**Decision:** Fake catalog only; refresh is a labeled demo simulation.  
**Consequences:** Next missions own real ingestion and playback.

## ADR-005 — Documentation layout

**Status:** Accepted  
**Context:** AGENTS.md referenced `docs/` and `agents/` paths that were missing.  
**Decision:** Canonical docs live under `docs/` and `agents/`; root copies of key briefs remain for discovery.  
**Consequences:** Agents must update `agents/HANDOFF.md` after work.

## ADR-006 — Theme: dark immersive shell (Obsidian base)

**Status:** Accepted for prototype  
**Context:** Spec lists theme options later undecided for logo vs accent.  
**Decision:** TASK-001 uses a dark Obsidian-style shell with brand red for the LKS TV wordmark and focus accents.  
**Consequences:** Theme switcher can be added in Paramètres without blocking navigation work.

## ADR-007 — IPTV persistence without Room (TASK-002)

**Status:** Accepted  
**Context:** TASK-002 requires durable sources/catalog and Keystore-backed secrets; Room was deferred in ADR-004 for TASK-001.  
**Decision:** Persist non-secret source metadata and unified catalog as JSON under `filesDir/iptv/`. Store Xtream credentials in `EncryptedSharedPreferences` (Android Keystore master key). Keep repository interfaces so Room can replace JSON later.  
**Consequences:** Simple migrations; JVM-testable parsers/merge/sync; catalog playback refs for Xtream are opaque (`lks-xtream://…`) and must be resolved via SecretStore at player time.

## ADR-008 — No title-only catalog merge

**Status:** Accepted  
**Context:** Product forbids merging on title resemblance alone.  
**Decision:** `CatalogMergePolicy` merges only on trusted `MatchKey` (`EXPLICIT` or `PROVIDER_EXTERNAL`). `SOURCE_LOCAL` keys never cross-merge.  
**Consequences:** Duplicate titles may coexist until a verified key exists; episode versions merge per season/episode number under a trusted series key.

## ADR-009 — Cinematic UI direction (TASK-004)

**Status:** Accepted  
**Context:** Dashboard-like shell rejected; product requires premium streaming immersion on Android TV + localhost preview parity.  
**Decision:** Adopt the tokens/components in `docs/DESIGN_SYSTEM.md` (deep black + LKS red, hub destination tiles, billboard catalogs, Movix-inspired detail layout, IPTVX-style provider group rails). Web preview mirrors visuals; Compose remains the production UI. No cloning of third-party logos/assets.  
**Consequences:** Permanent catalog top-nav removed; honest row policy (no fake rankings); splash is skippable; profile gate is first-class.

## ADR-010 — HTTPS update manifest without GitHub PAT (TASK-015)

**Status:** Accepted  
**Context:** In-app updates must work if the GitHub repo stays private; embedding a PAT in the APK is unacceptable.  
**Decision:** Check a public HTTPS JSON manifest (`UPDATE_MANIFEST_URL`). Download APK over HTTPS, verify SHA-256, hand off to the system package installer. Empty manifest URL disables checks.  
**Consequences:** Official releases must publish a public (or separately authenticated) artifact channel; CI release workflow prepares the manifest but does not auto-release on every commit.

## ADR-011 — Profile + prefs survive APK updates (TASK-015)

**Status:** Accepted  
**Context:** Users must not lose profiles/sources/progress after upgrades.  
**Decision:** Keep stable `applicationId` `com.lkstv.app` and a single production signing key; persist profiles (`ProfileStore`) and prefs JSON under app files; Keystore for Xtream secrets. Schema version fields allow forward migrations.  
**Consequences:** Losing the release keystore forces a new package identity; debug builds use `.debug` suffix and do not share data with release.

## ADR-012 — Dual clients: Android native + Tizen Web (TASK-016)

**Status:** Accepted  
**Context:** Samsung TVs require Tizen packaging; wrapping the Android app or shipping only a PC web-preview is insufficient.  
**Decision:** Keep Android as Kotlin/Media3. Ship a distinct Tizen Web TV app that vendors portable JS modules from `shared/js` (mirroring web-preview domain logic). Do not convert the APK into a WebView of the website.  
**Consequences:** Two UI codepaths; shared rules for demo exclusion, languages, search, and catalog parsing; Tizen signing/update differs from GitHub APK updates.
