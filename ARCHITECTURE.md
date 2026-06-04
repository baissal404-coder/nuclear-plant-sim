# Architecture

## Overview

Nuclear Plant Simulator is a 2D multiplayer web game where 2-8 players cooperate to run a nuclear power plant. The server is fully authoritative — clients render state but never simulate physics.

## Tech Stack

- **Client:** Phaser 3 (2D game engine), Socket.io client
- **Server:** Node.js, Express, Socket.io
- **Shared:** ES6 modules with common constants and strings

## Data Flow

```
Client Input → Socket.io Event → Server Validation → Physics Update → State Broadcast → Client Render
```

1. Player presses key → client sends `PLAYER_MOVE` or `PLAYER_ACTION`
2. Server validates permission (role check) and rate limits
3. Server updates game state via `plantPhysics.update()` at 60Hz
4. Server broadcasts `STATE_UPDATE` to all clients at 20Hz
5. Client interpolates entity positions and updates UI

## Server Authority Model

The server owns ALL game state:

- Player positions, HP, roles
- Machine states (heat, RPM, MW, HP, status)
- Fuel rod counts
- Radiation levels
- Win/lose conditions

Clients are **dumb renderers**. They send intent (move, interact), never state mutations.

### Permission Matrix

| Action | PM | LO | RO |
|--------|----|----|-----|
| Move | Yes | Yes | Yes |
| Repair machines | Yes | No | No |
| Drive forklift | No | Yes | No |
| Control reactor | No | No | Yes |
| Assign tasks | No | No | Yes |
| Chat (global) | Yes | Yes | Yes |
| Chat (team) | Yes | Yes | Yes |

## Game Loop

### Server (60Hz Fixed Timestep)

```
setInterval(() => {
  const dt = 1 / 60;  // fixed timestep
  
  // 1. Process buffered player inputs
  processInputs(room, dt);
  
  // 2. Run plant physics
  updatePlant(room, dt);
  
  // 3. Check win/lose
  checkWinCondition(room);
  checkLoseCondition(room);
  
  // 4. Increment game time
  room.gameTime += dt;
}, 1000 / 60);
```

### Client-Server Sync (20Hz Broadcast)

```
setInterval(() => {
  const state = serializeRoom(room);
  io.to(roomId).emit('STATE_UPDATE', state);
}, 1000 / 20);
```

Clients interpolate between 20Hz updates for smooth 60fps rendering.

## Physics Simulation

Each tick, `plantPhysics.update()` processes machines in dependency order:

1. **Control Rods** → determines reactivity
2. **Reactor** → generates heat based on power output and rod position
3. **Pumps** → remove heat from reactor
4. **Pipes** → carry steam from reactor to turbines (pressure loss from leaks)
5. **Turbines** → convert steam pressure to RPM
6. **Generators** → convert RPM to electrical output (MW)
7. **Condenser** → converts exhaust steam back to water

### Failure Cascade

```
Pipe Leak → Pressure Loss → Low Turbine RPM → No Generator Output → Blackout
       ↓
  Radiation Leak → High Radiation → Player HP Damage
       ↓
Reactor Overheat → Meltdown (LOSE)
```

## Room Lifecycle

```
lobby → starting → running → won/lost
```

1. **lobby:** Players join, select roles, ready up
2. **starting:** 10-second countdown
3. **running:** Game loop active, physics simulated
4. **won/lost:** Results screen, option to restart

## File Organization

```
server/          → Authoritative game logic
  machines/      → Individual machine classes
client/          → Rendering and input only
  scenes/        → Phaser scene states
  entities/      → Game object wrappers
  ui/            → HUD, chat, control panels
shared/          → Constants and strings (both sides)
```

## Network Events

All events defined in `shared/constants.js` as `EVENT_NAMES`.

**Client → Server:**
- `PLAYER_JOIN`, `PLAYER_LEAVE`, `PLAYER_MOVE`, `PLAYER_ACTION`
- `CHAT_MESSAGE`, `CHAT_TEAM`
- `REACTOR_SCRAM`, `REACTOR_CONTROL_RODS`, `PUMP_SPEED_CHANGE`
- `MACHINE_REPAIR`, `FUEL_ROD_DELIVER`, `TASK_ASSIGN`

**Server → Client:**
- `STATE_UPDATE` (20Hz), `CHAT_MESSAGE`, `CHAT_SYSTEM`
- `GAME_START`, `GAME_OVER`, `GAME_WIN`
- `RADIATION_LEAK`, `MELTDOWN_WARNING`, `BLACKOUT_WARNING`

## Security

- All inputs validated server-side (role, rate, bounds)
- No client-side physics or state mutation
- Sanitize chat messages (strip HTML, limit length)
- Rate limit socket events (max 30 events/sec per player)
