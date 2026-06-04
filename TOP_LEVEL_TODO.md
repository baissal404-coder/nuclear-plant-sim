# Top-Level TODO - Bug Hunt & Content Completion (Phase 5)

## Phase 5 — Bug Hunt & Content Completion ✅ **COMPLETED**

### Critical Bugs Fixed ✅
- BUG-001: Phaser 3.60 darken/brighten crash — replaced with custom darken/lighten functions
- BUG-002: Grace period blocked ALL physics (empty 30s) — removed early return from plantPhysics.js
- BUG-003: Two socket.io connections per client — removed second connection from index.html, wired reconnect overlay through network.js
- BUG-004: Crane scene drop key missing — added Space key to drop carried fuel rods

### Major Bugs Fixed ✅
- BUG-005: No DOM chat input — replaced Phaser keyboard chat with hidden DOM `<input>` element
- BUG-006: Room code regex mismatch — normalizeJoinData now fully filters room codes
- BUG-007: Delta compression fragile (array index comparison) — changed to ID-based comparison
- BUG-008: DOOR interaction gave no feedback to non-RO — added ACCESS DENIED notification
- BUG-009: STORAGE interaction gave no feedback to non-LO — added role-specific message
- BUG-010: Game over screen missing — added showGameOver with score summary
- BUG-011: Task board UI missing — added in-game task board with assigned + broken machines display
- BUG-012: Emergency exit not implemented — added EXIT machine type
- BUG-013: Chat commands incomplete — added /where, /radiation, /turbines
- BUG-014: Missing sound effects — added 'error' and 'footstep' sounds to audio.js

### Content Additions ✅
- Implemented all server/machines/ stubs (Reactor, Turbine, Pump, Generator, Pipe, ControlRods, Condenser)
- Added fuel rod count to HUD
- Added Break Room, Workshop, Emergency Exit room labels to tilemap
- Added Game Over screen with score stats
- Added Task Board interaction in spawn area
- Cleaned up dead code files (HUD.js, ChatUI.js, NotificationUI.js, ControlPanel.js, PlantStatusUI.js, Player.js, Machine.js, input.js)
- Cleaned up unused ONE/TWO/THREE key bindings

### Tests ✅
- All 6 server unit tests pass
- No regression on existing functionality

## Known Issues (post-audit)

1. CraneScene duplicates fuel delivery logic from server (minor)
2. No off-screen culling (all sprites rendered regardless of camera) (minor)
3. No AI bots for single-player mode (known limitation)
4. No collision on room walls (fuel storage, control room) (minor)
5. Mobile joystick not tested on real devices (untested)
6. No load testing with 32 concurrent players (untested)
7. Machine stubs in server/machines/ are implemented but not used by plantPhysics.js (the main physics runs inline)
