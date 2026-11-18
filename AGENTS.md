# Mandatory agent rules

1. Read `README.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `agents/HANDOFF.md` before editing.
2. One owner per task and file set. Do not change another agent's files without coordinating.
3. Keep scope small. No speculative full backend, no redesign against agreed UX, no unauthorized network/credentials.
4. Record work in `agents/HANDOFF.md`: files changed, commands run, results, unresolved issues, next steps.
5. Run focused tests and build where tooling exists; mark `NOT RUN` if SDK/Gradle unavailable.
6. Do not commit secrets, APK signing keys, IPTV credentials, real playlists or protected media.
7. Use D-pad-first controls and correct Back/focus restoration on every screen.
8. All user-specific preferences must be profile-scoped; source credentials device-scoped.
9. No destructive changes to existing work without explicit review.
10. Agent roles are assignments, not proof any external agent is connected or running.

## Ownership proposal
- Architecture agent: `docs/ARCHITECTURE.md`, future `core:*` interfaces.
- UI agent: `app` shell and future `feature:*` UI, assigned screen by screen.
- IPTV agent: future ingestion/catalog modules only.
- Player agent: future `feature:player` only.
- Integrator (Codex): Gradle, build fixes, integration and regression.
