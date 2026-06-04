# Nuclear Plant Simulator

A 2D multiplayer web game where 2-8 players cooperate to run a nuclear power plant. Inspired by Roblox games like Naramo Nuclear Plant.

**Bug Hunt & Content Completion — v1.1.0**

---

## Features

- **3 Player Roles:** Plant Maintenance (repair), Logistics Operator (fuel delivery), Reactor Operator (control room)
- **Full Physics Simulation:** Heat → steam pressure → turbine RPM → generator MW output chain with failure cascades
- **Multiplayer:** Server-authoritative, up to 8 players per room, delta-compressed state broadcasts at 20Hz
- **Procedural Audio:** Ambient hum, alarms, SFX, and chat pings — all generated via Web Audio API (no asset files)
- **Visual Polish:** Gradient textures, particle effects (steam, sparks, fire, smoke, radiation glow), turbine rotation, pump pulse, damage state color shifts, camera shake
- **Control Room UI:** Analog gauge needles, LED indicators, SCRAM button with glow effect, emergency lights
- **Tutorial System:** First-launch 3-slide tutorial with role descriptions and keybinds
- **Tooltips:** Hover any machine for 1s to see name, status, and controls
- **Notifications:** Center-screen fade-in/out alerts for events, warnings, and achievements
- **Task Board:** View assigned tasks and broken machines from in-game terminal
- **Game Over Screen:** Detailed score summary (uptime, MW generated, tasks completed)
- **Pause Menu:** Resume, volume control, color-blind mode toggle, controls reference, leave
- **Mobile Support:** Virtual joystick (left), action buttons (right), responsive layout, DOM chat input
- **Difficulty:** Easy (slower decay), Normal, Hard (faster decay + more failures)
- **Random Events:** Pipe leaks, sensor failures, power surges, fuel rod defects (every 60-120s)
- **Achievements:** 4 unlockable achievements tracked in localStorage
- **Persistent Stats:** Total play time, meltdowns survived, MW generated (localStorage)
- **Color-Blind Mode:** Alternate palette option in settings
- **New Player Grace:** First 30s in-game with no machine failures (no longer blocks physics)
- **Loading Screen:** Tips displayed while assets load
- **Global Error Boundary:** User-friendly error overlay with Reload button
- **Reconnection Handling:** Auto-reconnect with visual overlay (single socket connection)

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrows | Move |
| E | Interact / Repair / Deliver fuel |
| T | Open chat |
| Tab | Toggle plant status screen |
| ESC | Pause / Close menu |
| V | Vent steam (RO) |
| R | Manual SCRAM (RO) |
| F | Evacuate radiation zone |
| Shift | Sprint |

### Role-Specific

| Role | Spawn | Abilities |
|------|-------|-----------|
| **Plant Maintenance (PM)** | Workshop | Repair machines with [E], keep plant running |
| **Logistics Operator (LO)** | Garage | Deliver fuel rods from storage to reactor using crane |
| **Reactor Operator (RO)** | Control Room | Adjust control rods + pump speeds, SCRAM, vent steam |

## How to Play

1. Open http://localhost:3000 in your browser
2. Enter a name, select a role, and choose difficulty
3. Create or join a room
4. Cooperate with your team to keep the plant online for 15 minutes
5. **Win:** Plant produces power for 15 full minutes
6. **Lose:** Reactor meltdown (heat > 900°C) or total blackout (0 MW for 30s)

## System Requirements

- **Browser:** Chrome, Firefox, Edge, Safari (latest 2 versions)
- **Mobile:** iOS Safari 15+, Android Chrome 100+
- **Network:** Broadband internet (10 Mbps+), <150ms latency
- **Server:** Node.js 18+, 2-core VPS, 2GB RAM (supports 4 rooms / 32 players)

## Quick Start

```bash
cd nuclear-plant-sim
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Production server on port 3000 |
| `npm run dev` | Development server with auto-reload |
| `npm test` | Run server unit tests |
| `npm run serve` | Serve static files for testing |

## Project Structure

```
nuclear-plant-sim/
├── server/           # Authoritative game logic
│   ├── machines/     # Machine classes (unused stubs)
│   ├── index.js      # Express + Socket.io bootstrap
│   ├── gameState.js  # Room management, tick loop, delta compression
│   ├── plantPhysics.js # Heat/steam/electricity simulation
│   ├── player.js     # Player class with role logic
│   ├── networking.js # Socket.io event handlers + validation
│   ├── chat.js       # Chat system with spam protection
│   ├── admin.js      # Console commands
│   ├── events.js     # Random event system
│   └── gameState.test.js # Unit tests
├── client/           # Rendering and input
│   ├── scenes/       # Phaser scenes (Boot, Menu, Game, ControlRoom, Crane)
│   ├── ui/           # UI components (Tutorial, Tooltip, PauseMenu, MobileInput)
│   ├── main.js       # Phaser config + global error boundary
│   ├── network.js    # Socket.io client with delta merge
│   ├── audio.js      # Procedural Web Audio API manager
│   ├── input.js      # Keyboard/mouse handling
│   ├── particles.js  # Object-pooled particle system
│   ├── stats.js      # localStorage achievements + stats
│   └── index.html    # Entry point with reconnect overlay
└── shared/           # Constants and i18n strings
```

## Screenshots

*Screenshots and GIFs to be added.*

![Menu](screenshots/menu.png)
![Gameplay](screenshots/gameplay.png)
![Control Room](screenshots/control-room.png)

## Tech Stack

- **Client:** Phaser 3.60, Web Audio API, Socket.io client
- **Server:** Node.js, Express, Socket.io
- **Protocol:** WebSocket (Socket.io) with delta compression

## Credits

- Built with Claude Code (Anthropic) across 4 phases
- Inspired by Naramo Nuclear Plant (Roblox) and other reactor management games

## License

MIT
