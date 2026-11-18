# TASK-002 — IPTV sources & unified catalog

**Owner:** IPTV agent (coding agent)
**Priority:** P0
**Prerequisites:** TASK-001 shell; read docs + HANDOFF.

## Goal

Device-scoped IPTV source management (Xtream + M3U), secure credentials, group preservation, trusted-key unified catalog, manual sync with progress/cancel — no Media3/EPG player work.

## Acceptance

- Repository interfaces + domain models independent of Compose
- Keystore-backed Xtream secrets; no real credentials in repo/tests/logs
- Manual sync preserves profile preferences
- Unit tests for M3U, Xtream JSON, merge policy, sync prefs, errors
- Debug build + unit tests green
- Handoff updated
