# Nuclear Plant Simulator

A 2D multiplayer web game where 2-8 players cooperate to run a nuclear power plant. Inspired by Roblox games like Naramo Nuclear Plant.

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.

## How to Play

1. Enter a name, select a role (PM/LO/RO), choose difficulty
2. Create or join a room (share the 6-letter code with friends)
3. Cooperate to keep the plant online for 15 minutes
4. **Win:** Plant produces power for 15 full minutes
5. **Lose:** Reactor meltdown (heat > 900°C) or total blackout (0 MW for 30s)

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrows | Move |
| E | Interact / Repair / Deliver fuel |
| T | Open chat |
| Tab | Plant status screen |
| ESC | Pause |
| V | Vent steam (RO) |
| R | Manual SCRAM (RO) |
| F | Evacuate radiation zone |
| Shift | Sprint |

## Roles

| Role | Job |
|------|-----|
| **PM** (Plant Maintenance) | Repair broken machines with E |
| **LO** (Logistics Operator) | Deliver fuel rods from storage to reactor using the crane |
| **RO** (Reactor Operator) | Control room — adjust rods/pumps, SCRAM, vent steam |

## Deploy Online (Free)

1. Push this repo to GitHub
2. Go to https://render.com, sign up (free, no credit card)
3. Click **New +** → **Web Service**, connect your GitHub repo
4. Render auto-detects Node.js — set start command: `node server/index.js`
5. Click **Deploy** — you get a `*.onrender.com` URL to share with anyone

## Tech Stack

- **Client:** Phaser 3.60, Web Audio API, Socket.io
- **Server:** Node.js, Express, Socket.io

## License

MIT
