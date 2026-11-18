# TASK-001 — Android TV navigation shell

**Owner:** UI agent (or first available coding agent)
**Priority:** P0 / first implementation
**Prerequisites:** read all project docs and `AGENTS.md`.

## Goal
Turn scaffold into a coherent Android TV remote-first navigation prototype with local fake data; do not connect real IPTV.

## Required behavior
1. Launch to branded intro (short, reduced-motion option placeholder), then a demo profile chooser, then six-tile hub: TV, Films, Séries, EPG, Bibliothèque, Paramètres.
2. Section screens have Back upper left, and refresh/profile/section-menu upper right.
3. Film/series screens show fake cinematic hero, horizontal poster rows and a film/series detail screen; series detail shows season cards and episode list.
4. Remote D-pad navigates predictably. OK selects, Back restores previous focus and scroll, no focus trap.
5. Section menu is a functional overlay (demo controls for show/hide provider groups and rows), not a dead icon.
6. Refresh is clearly labeled DEMO (no fake claim of provider sync). Profile switch changes active demo profile and its in-memory selections.
7. Use TV-friendly typography, focus indication, margins and accessibility labels.
8. Add focused unit/UI tests where feasible, plus manual emulator/box test checklist.

## Acceptance
- Gradle sync and debug APK build succeed in an Android SDK environment.
- Emulator/TV box tested with remote: hub → Films → detail → Back → hub; same for Séries, settings and profile.
- Menu and profile controls usable without mouse.
- No real provider network requests or secrets.
- Record exact commands/results and limitations in `agents/HANDOFF.md`.

## Do not do
- No Xtream/M3U, Media3 playback, Room schema, WorkManager, signing or releases in this task.
- Do not create visually impressive but unfocusable touch-only UI.
