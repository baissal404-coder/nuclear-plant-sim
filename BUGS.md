# Bug Report — Nuclear Plant Simulator v1.1.0

## CRITICAL

- **BUG-001 ✓ FIXED: Phaser 3.60 darken/brighten crash**
  Location: `client/scenes/GameScene.js:336-338`
  Fix: Replaced `Phaser.Display.Color.IntegerToColor(c).darken(60)` with custom `darken()`/`lighten()` functions

- **BUG-002 ✓ FIXED: Grace period blocks all physics**
  Location: `server/plantPhysics.js:23-25`
  Fix: Removed early return `if (room.graceActive) return;` — grace period now only affects failure rate, not all physics

- **BUG-003 ✓ FIXED: Two socket.io connections per client**
  Location: `client/index.html:52-61`
  Fix: Removed standalone `<script>` that created a second socket.io connection. Wiring reconnect overlay through `client/network.js` instead

- **BUG-004 ✓ FIXED: Crane scene has no drop key for fuel rods**
  Location: `client/scenes/CraneScene.js:217-228`
  Fix: Added Space key binding to call `dropRod()`. Updated instructions text

## MAJOR

- **BUG-005 ✓ FIXED: No DOM-based chat input (mobile/IME broken)**
  Location: `client/scenes/GameScene.js:134-152`
  Fix: Replaced Phaser keyboard event-based chat input with hidden DOM `<input>` element. T now focuses the input, Enter sends, Escape dismisses

- **BUG-006 ✓ FIXED: Room code regex mismatch prevents valid codes**
  Location: `server/networking.js:85-92`
  Fix: `normalizeJoinData` now fully filters room codes (strip non-alphanumeric, uppercase, truncate) matching `normalizeRoomCode` behavior

- **BUG-007 ✓ FIXED: Delta compression compares arrays by index**
  Location: `server/gameState.js:487-491`
  Fix: Changed `filter((p, i) => ... prev[i])` to `filter(p => { const prev = prev.find(x => x.id === p.id); ... })` — ID-based comparison

- **BUG-008 ✓ FIXED: DOOR interaction gives no feedback to non-RO**
  Location: `client/scenes/GameScene.js:490-493`
  Fix: Added "ACCESS DENIED — RO only" notification + error sound for non-RO players

- **BUG-009 ✓ FIXED: STORAGE interaction gives no feedback to non-LO**
  Location: `client/scenes/GameScene.js:502-506`
  Fix: Added "Fuel Storage — LO only" notification for non-LO players

- **BUG-010 ✓ FIXED: No game over screen with score summary**
  Location: `client/scenes/GameScene.js` (new method `showGameOver`)
  Fix: Added full-screen game over screen showing win/lose status, uptime, MW generated, tasks completed, with "Return to Menu" button

- **BUG-011 ✓ FIXED: Task board UI missing**
  Location: `client/scenes/GameScene.js` (new method `showTaskBoard`)
  Fix: Added Task Board machine in spawn area showing assigned tasks and broken machines list

- **BUG-012 ✓ FIXED: Emergency exit not implemented**
  Location: `client/scenes/GameScene.js` (new 'EXIT' machine type)
  Fix: Added Emergency Exit machine in top-right corner — interact to evac and respawn

- **BUG-013 ✓ FIXED: Chat commands incomplete**
  Location: `server/chat.js:84-107`
  Fix: Added `/where <name>`, `/radiation`, `/turbines` chat commands. Updated `/help` to list them

- **BUG-014 ✓ FIXED: Missing 'error' and 'footstep' sound effects**
  Location: `client/audio.js:64-65`
  Fix: Added 'error' (low blip) and 'footstep' (noise burst) sound definitions

## MINOR

- **BUG-015 ✓ FIXED: Unused ONE/TWO/THREE key bindings**
  Location: `client/scenes/GameScene.js:129`
  Fix: Removed from key binding registration

- **BUG-016 ✓ FIXED: Dead code files left in repository**
  Location: `client/ui/HUD.js`, `client/ui/ChatUI.js`, `client/ui/NotificationUI.js`, `client/ui/ControlPanel.js`, `client/ui/PlantStatusUI.js`, `client/entities/Player.js`, `client/entities/Machine.js`, `client/input.js`
  Fix: All deleted — GameScene renders everything inline

- **BUG-017 ✓ FIXED: Machine stubs completely empty (server/machines/)**
  Location: `server/machines/*.js`
  Fix: Implemented all TODO methods with working physics (Reactor, Turbine, Pump, Generator, Pipe, ControlRods, Condenser)
