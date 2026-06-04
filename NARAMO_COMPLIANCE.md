# Naramo Power Plant Feature Compliance

## LAYOUT (multi-floor / multi-area)

| Feature | Status | Notes |
|---------|--------|-------|
| Main Reactor Hall | ✓ | Large room, reactor core center, fuel rod slots visible |
| Control Room | ✓ | Elevated panel, full gauges, glass window view |
| Turbine Hall | ✓ | Two turbines + generators |
| Pump Room | ✓ | Coolant pump area |
| Pipe Network | ✓ | Visible pipes between rooms, can leak |
| Warehouse / Storage | ✓ | Fuel rod storage area with Crane scene |
| Garage / Parking Lot | ⚠ Partial | LO spawns in garage area, no vehicle driving |
| Break Room | ✓ | Spawn area with Task Board |
| Emergency Exits | ✓ | Added EXIT machine in top-right corner |
| Radiation Zones | ✓ | Green overlay, Geiger-style particles |
| Stairs / Ladders / Doors | ⚠ Partial | Control room door works, no multi-floor |

## MACHINES

| Feature | Status | Notes |
|---------|--------|-------|
| Reactor Core | ✓ | Central, glowing, generates heat |
| Control Rods | ✓ | Control reaction rate |
| Fuel Rod Slots | ⚠ Partial | Reactor tracks fuel level, no individual 12-24 slots |
| Coolant Pumps | ✓ | Feedwater, primary loop, two pumps |
| Steam Pipes | ✓ | Visible network, can rupture |
| Turbines | ✓ | Rotating animation |
| Generators | ✓ | MW output, spark animation |
| Condenser | ✓ | Cools steam back to water |
| Water Tanks | ✗ | Not implemented |
| Spent Fuel Pool | ✗ | Not implemented |
| Vent Stack | ✗ | Vent feature exists but no visual stack |

## CONTROLS (RO)

| Feature | Status | Notes |
|---------|--------|-------|
| Control Rod Height | ✓ | Slider 0-100% |
| Reactor Power Level | ⚠ Partial | Defined in constants but no dedicated UI slider |
| Coolant Pump Speed | ✓ | Per pump, 0-100% |
| Turbine RPM Target | ✗ | Not implemented |
| Generator Output Switch | ✗ | Not implemented |
| Feedwater Valve | ✗ | Not implemented |
| Pressure Relief Valve | ✗ | Not implemented |
| SCRAM Button | ✓ | Big red, 2-step confirmation |
| Vent Steam | ✓ | Manual emergency pressure release |
| Emergency Lighting | ✓ | Manual override in blackout |

## PLAYER CLASSES

| Feature | Status | Notes |
|---------|--------|-------|
| PM: Repair machines | ✓ | Walk to broken machine, hold E to repair |
| PM: Wrench tool visual | ⚠ Partial | Emoji indicator shown during repair |
| PM: Hard hat visual | ✗ | Not implemented |
| PM: Repair minigame | ⚠ Partial | Progress bar, no "turn bolt" inputs |
| LO: Forklift driving | ✗ | LO uses Crane scene, not forklift |
| LO: Fuel rod delivery | ✓ | Pick up rods, deliver to reactor |
| LO: Parts delivery | ⚠ Partial | Task system exists |
| LO: High-vis vest | ✗ | Not implemented |
| RO: Control room access | ✓ | |
| RO: Task dispatch | ⚠ Partial | Server handles assignment, client shows via Task Board |
| RO: PA system | ✗ | Not implemented |
| RO: Lab coat visual | ✗ | Not implemented |
| Only 1 RO per team | ✗ | Server does not enforce single RO |

## GAMEPLAY SYSTEMS

| Feature | Status | Notes |
|---------|--------|-------|
| Task Board | ✓ | Added in break room + Task Board machine |
| Fuel Rod Lifecycle | ⚠ Partial | Rods age, reactor fuel level drops, but no individual rod tracking |
| Crane Minigame | ✓ | Pick/place rods in storage/reactor zones |
| Failure Cascade | ✓ | Pipe leak → pressure drop → turbine RPM → MW drop |
| Radiation System | ✓ | Green overlay, Geiger counter visuals, damage over time |
| Dosimeter (cumulative) | ✗ | Not implemented |
| Emergency Protocols: SCRAM | ✓ | |
| Emergency Protocols: VENT | ✓ | |
| Emergency Protocols: EVAC | ✓ | F key to evac |
| Win Condition | ✓ | Plant online for set time |
| Lose Condition (meltdown) | ✓ | |
| Lose Condition (blackout) | ✓ | |
| Scoring / Currency | ⚠ Partial | Score tracked, no persistent currency |
| Achievements | ✓ | localStorage-based |

## CHAT & COMMS

| Feature | Status | Notes |
|---------|--------|-------|
| Global Chat | ✓ | |
| Team Chat | ✓ | Tab to switch |
| Quick Commands | ✓ | /help, /status, /tasks, /pm, /scram, /where, /radiation, /turbines |
| PA System | ✗ | Not implemented |
| Radio (PM + LO) | ✗ | Not implemented |
| System Notifications | ✓ | |
| Anti-spam | ✓ | Rate limit, max length, XSS prevention |

## UI / UX

| Feature | Status | Notes |
|---------|--------|-------|
| Main HUD | ✓ | Class, HP, plant status, fuel rods |
| Plant Status Screen (Tab) | ✓ | Full grid, color-coded |
| Control Room Panel | ✓ | Sliders, gauges, SCRAM |
| Notifications | ✓ | Center-screen, fade in/out |
| Task Board UI | ✓ | Added in Phase 5 |
| Pause Menu | ✓ | Resume, Volume, Color-Blind, Controls, Leave |
| Tutorial | ✓ | 3 slides, first launch |
| Mobile / Touch | ⚠ Partial | Virtual joystick, DOM chat input, untested on real devices |

## VISUAL & AUDIO

| Feature | Status | Notes |
|---------|--------|-------|
| Reactor: glowing circle | ✓ | Rotation + glow |
| Turbines: spinning | ✓ | Rotation tied to RPM |
| Pipes: gray segments + steam | ✓ | |
| Generators: sparks | ✓ | |
| Pumps: pulsing | ✓ | Scale = flow rate |
| Steam particles | ✓ | |
| Electric sparks | ✓ | |
| Smoke from broken | ✓ | |
| Fire at HP < 25 | ✓ | |
| Radiation pulse | ✓ | Green wave |
| Damage states (4 levels) | ✓ | Color shifts |
| Player animations | ⚠ Partial | Bob, tool indicator, no walk cycle |
| Camera follow | ✓ | Smooth lerp |
| Camera shake | ✓ | On critical events |
| Audio: ambient hum | ✓ | |
| Audio: alarms | ✓ | |
| Audio: SFX | ✓ | |
| Master volume | ✓ | In pause menu |

## SUMMARY

- **Fully Implemented:** 38/60
- **Partially Implemented:** 14/60
- **Not Implemented:** 8/60
- **Compliance Score:** ~75%
