import { Router } from 'express';
import {
  BROADCAST_RATE,
  DIFFICULTY,
  EVENT_NAMES,
  FIXED_TIMESTEP,
  GAME_CONFIG,
  MACHINE_DEFAULTS,
  MACHINE_TYPES,
  TICK_RATE,
} from '../shared/constants.js';
import { calculateTotalOutput, checkLoseCondition, checkWinCondition, updatePlant } from './plantPhysics.js';
import { damagePlayer, movePlayer, respawnPlayer, serializePlayer, updateRepair, completeRepair } from './player.js';
import { addSystemMessage } from './chat.js';
import { setupRandomEvents } from './events.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RADIATION_REACTOR_RADIUS = 170;
const RADIATION_PIPE_RADIUS = 100;
const INTERACTION_LOCK_TIMEOUT_SECONDS = 8;

export class GameState {
  constructor() {
    this.rooms = new Map();
    this.io = null;
    this.tickRate = TICK_RATE;
    this.broadcastRate = BROADCAST_RATE;
    this.tickIntervals = new Map();
    this.broadcastIntervals = new Map();
    this.tempBans = new Map();
    this.permanentBans = new Set();
  }

  setIo(io) {
    this.io = io;
  }

  createRoom(roomId = this.generateRoomCode(), options = {}) {
    const code = this.normalizeRoomCode(roomId);
    if (!code || this.rooms.has(code)) return null;

    const diffKey = options.difficulty || 'NORMAL';
    const diffConfig = DIFFICULTY[diffKey] || DIFFICULTY.NORMAL;

    const room = {
      id: code,
      public: options.public !== false,
      difficulty: diffKey,
      diffConfig,
      players: new Map(),
      machines: new Map(),
      fuelRods: GAME_CONFIG.starting_fuel_rods,
      gameTime: 0,
      isRunning: false,
      winDuration: GAME_CONFIG.win_duration_minutes * 60,
      gamePhase: 'lobby',
      radiationLevel: 0,
      radiationZones: [],
      blackoutTimer: 0,
      blackoutActive: false,
      meltdownOccurred: false,
      totalOutput: 0,
      inputQueues: new Map(),
      chatLog: [],
      score: {
        uptimeSeconds: 0,
        totalMWGenerated: 0,
        tasksCompleted: 0,
      },
      interactionLocks: new Map(),
      lastWarnings: {
        meltdownCountdown: null,
        blackout: false,
      },
      gracePeriod: 0,
      graceActive: true,
    };

    this.initializeMachines(room);
    this.rooms.set(code, room);
    this.startBroadcastLoop(code);
    room.updateEvents = setupRandomEvents(room, this.io);
    return room;
  }

  generateRoomCode() {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < GAME_CONFIG.room_code_length; i++) {
        code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return `R${Date.now().toString(36).slice(-5).toUpperCase()}`;
  }

  normalizeRoomCode(roomId) {
    return typeof roomId === 'string'
      ? roomId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, GAME_CONFIG.room_code_length)
      : '';
  }

  initializeMachines(room) {
    const machineConfigs = [
      { id: 'reactor_1', type: MACHINE_TYPES.REACTOR, x: 400, y: 200 },
      { id: 'control_rods_1', type: MACHINE_TYPES.CONTROL_RODS, x: 400, y: 120 },
      { id: 'pump_1', type: MACHINE_TYPES.PUMP, x: 280, y: 420 },
      { id: 'pump_2', type: MACHINE_TYPES.PUMP, x: 520, y: 420 },
      { id: 'pipe_1', type: MACHINE_TYPES.PIPE, x: 340, y: 300 },
      { id: 'pipe_2', type: MACHINE_TYPES.PIPE, x: 460, y: 300 },
      { id: 'pipe_3', type: MACHINE_TYPES.PIPE, x: 400, y: 450 },
      { id: 'turbine_1', type: MACHINE_TYPES.TURBINE, x: 750, y: 250 },
      { id: 'turbine_2', type: MACHINE_TYPES.TURBINE, x: 750, y: 380 },
      { id: 'generator_1', type: MACHINE_TYPES.GENERATOR, x: 880, y: 250 },
      { id: 'generator_2', type: MACHINE_TYPES.GENERATOR, x: 880, y: 380 },
      { id: 'condenser_1', type: MACHINE_TYPES.CONDENSER, x: 550, y: 520 },
    ];

    for (const config of machineConfigs) {
      const defaults = MACHINE_DEFAULTS[config.type];
      const machine = {
        id: config.id,
        type: config.type,
        hp: defaults.max_hp,
        maxHp: defaults.max_hp,
        x: config.x,
        y: config.y,
        state: this.createMachineState(config.type),
        isActive: true,
      };
      room.machines.set(config.id, machine);
    }
  }

  createMachineState(type) {
    switch (type) {
      case MACHINE_TYPES.REACTOR:
        return {
          heat: 50,
          powerOutput: 0,
          controlRodInsertion: 50,
          fuelLevel: 100,
          meltdown: false,
          meltdownArmedSeconds: 0,
          meltdownCountdown: null,
        };
      case MACHINE_TYPES.CONTROL_RODS:
        return { insertionLevel: 50, rodCount: MACHINE_DEFAULTS[type].rod_count, pendingCommands: [] };
      case MACHINE_TYPES.PUMP:
        return { speed: 50, coolantLevel: 100, isActive: true };
      case MACHINE_TYPES.PIPE:
        return { pressure: 80, leakRate: 0, isLeaking: false };
      case MACHINE_TYPES.TURBINE:
        return { rpm: 0, steamPressure: 0, temperature: 20 };
      case MACHINE_TYPES.GENERATOR:
        return { rpm: 0, outputMW: 0, voltage: 0, frequency: 60 };
      case MACHINE_TYPES.CONDENSER:
        return { efficiency: 100, waterLevel: 100, exhaustSteam: 0 };
      default:
        return {};
    }
  }

  getRoom(roomId) {
    return this.rooms.get(this.normalizeRoomCode(roomId)) || null;
  }

  listPublicRooms() {
    return [...this.rooms.values()]
      .filter((room) => room.public)
      .map((room) => ({
        id: room.id,
        playerCount: room.players.size,
        maxPlayers: GAME_CONFIG.max_players,
        gamePhase: room.gamePhase,
        isRunning: room.isRunning,
      }));
  }

  addPlayerToRoom(roomId, player) {
    const room = this.getRoom(roomId);
    if (!room) return { ok: false, error: 'Room not found' };
    if (room.players.size >= GAME_CONFIG.max_players) return { ok: false, error: 'Room is full' };
    if (room.gamePhase === 'won' || room.gamePhase === 'lost') return { ok: false, error: 'Round already ended' };

    room.players.set(player.socketId, player);
    room.inputQueues.set(player.socketId, []);
    addSystemMessage(room, `${player.name} joined as ${player.role}`);
    if (!room.isRunning) this.startGameLoop(room.id);
    return { ok: true, room };
  }

  removePlayerFromRoom(roomId, playerId) {
    const room = this.getRoom(roomId);
    if (!room) return null;

    const player = room.players.get(playerId);
    if (!player) return null;

    this.freeMachineLocks(room, playerId);
    room.players.delete(playerId);
    room.inputQueues.delete(playerId);
    addSystemMessage(room, `${player.name} left the game`);

    if (room.players.size === 0) {
      this.stopGameLoop(room.id, false);
    } else if (player.role === 'RO') {
      this.reassignReactorOperator(room);
    }

    return player;
  }

  queueInput(roomId, playerId, input) {
    const room = this.getRoom(roomId);
    if (!room || !room.inputQueues.has(playerId)) return false;

    const queue = room.inputQueues.get(playerId);
    queue.push(input);
    if (queue.length > this.tickRate) queue.splice(0, queue.length - this.tickRate);
    return true;
  }

  startGameLoop(roomId) {
    const room = this.getRoom(roomId);
    if (!room || this.tickIntervals.has(room.id)) return;

    room.isRunning = true;
    room.gamePhase = 'playing';

    const interval = setInterval(() => {
      this.updateRoom(room.id, FIXED_TIMESTEP);
    }, 1000 / this.tickRate);

    this.tickIntervals.set(room.id, interval);
    addSystemMessage(room, 'Round started. Keep the plant online.');
    this.broadcastGameState(room.id, EVENT_NAMES.GAME_START);
  }

  stopGameLoop(roomId, resetToLobby = true) {
    const room = this.getRoom(roomId);
    if (!room) return;

    const interval = this.tickIntervals.get(room.id);
    if (interval) clearInterval(interval);
    this.tickIntervals.delete(room.id);
    room.isRunning = false;
    if (resetToLobby) room.gamePhase = 'lobby';
  }

  startBroadcastLoop(roomId) {
    const room = this.getRoom(roomId);
    if (!room || this.broadcastIntervals.has(room.id)) return;

    const interval = setInterval(() => {
      this.broadcastGameState(room.id, EVENT_NAMES.STATE_UPDATE);
    }, 1000 / this.broadcastRate);
    this.broadcastIntervals.set(room.id, interval);
  }

  stopBroadcastLoop(roomId) {
    const room = this.getRoom(roomId);
    const key = room?.id || roomId;
    const interval = this.broadcastIntervals.get(key);
    if (interval) clearInterval(interval);
    this.broadcastIntervals.delete(key);
  }

  updateRoom(roomId, dt) {
    const room = this.getRoom(roomId);
    if (!room || !room.isRunning || room.players.size === 0) return;

    if (room.graceActive) {
      room.gracePeriod += dt;
      if (room.gracePeriod >= 30) room.graceActive = false;
    }

    this.processInputs(room, dt);
    this.updateRepairs(room, dt);
    updatePlant(room, dt);
    this.updateScoreAndHazards(room, dt);
    this.updatePlayerStatus(room, dt);
    this.emitWarnings(room);
    if (room.updateEvents) room.updateEvents(dt);
    room.gameTime += dt;

    if (checkWinCondition(room)) {
      this.endGame(room.id, 'win', 'Plant remained online for the full shift.');
      return;
    }

    if (checkLoseCondition(room)) {
      this.applyMeltdownDamage(room);
      this.endGame(room.id, 'lose', 'Reactor meltdown.');
    }
  }

  processInputs(room, dt) {
    for (const [playerId, queue] of room.inputQueues) {
      const player = room.players.get(playerId);
      if (!player || !player.isAlive) continue;

      const input = queue.pop();
      queue.length = 0;
      if (!input) {
        player.velocity = { x: 0, y: 0 };
        continue;
      }

      player.lastProcessedSeq = input.seq;
      movePlayer(player, input.inputs.dx, input.inputs.dy, dt, input.inputs.sprint ? 300 : 200);
    }
  }

  updateRepairs(room, dt) {
    for (const player of room.players.values()) {
      if (!player.isRepairing || !player.repairTarget) continue;
      const machine = room.machines.get(player.repairTarget);
      if (!machine || !this.isWithinRange(player, machine)) {
        this.freeMachineLocks(room, player.socketId);
        continue;
      }

      const repairComplete = updateRepair(player, dt);
      if (!repairComplete) continue;

      const result = completeRepair(player, machine);
      this.freeMachineLocks(room, player.socketId);
      if (!result) continue;

      room.score.tasksCompleted += 1;
      addSystemMessage(room, `${player.name} repaired ${machine.type}`);
      this.io?.to(room.id).emit(EVENT_NAMES.MACHINE_REPAIR, { playerId: player.socketId, machineId: machine.id, result });
    }
  }

  updateScoreAndHazards(room, dt) {
    const generators = [...room.machines.values()].filter((m) => m.type === MACHINE_TYPES.GENERATOR);
    room.totalOutput = calculateTotalOutput(generators);
    room.score.uptimeSeconds = Math.floor(room.gameTime);
    room.score.totalMWGenerated += room.totalOutput * dt;

    if (room.totalOutput <= GAME_CONFIG.blackout_threshold) {
      room.blackoutTimer += dt;
      room.blackoutActive = room.blackoutTimer >= GAME_CONFIG.blackout_seconds;
    } else {
      room.blackoutTimer = 0;
      room.blackoutActive = false;
      room.lastWarnings.blackout = false;
    }

    room.radiationZones = this.calculateRadiationZones(room);
  }

  calculateRadiationZones(room) {
    const zones = [];
    const reactor = [...room.machines.values()].find((m) => m.type === MACHINE_TYPES.REACTOR);
    if (reactor && reactor.state.heat > 800) {
      zones.push({
        id: 'reactor_heat',
        x: reactor.x,
        y: reactor.y,
        radius: RADIATION_REACTOR_RADIUS,
        intensity: Math.min(1, (reactor.state.heat - 800) / 200),
      });
    }

    for (const pipe of room.machines.values()) {
      if (pipe.type !== MACHINE_TYPES.PIPE || !pipe.state.isLeaking) continue;
      zones.push({
        id: pipe.id,
        x: pipe.x,
        y: pipe.y,
        radius: RADIATION_PIPE_RADIUS,
        intensity: Math.max(0.25, pipe.state.leakRate),
      });
    }
    return zones;
  }

  updatePlayerStatus(room, dt) {
    for (const player of room.players.values()) {
      if (!player.isAlive) {
        player.respawnTimer -= dt;
        if (player.respawnTimer <= 0) {
          respawnPlayer(player);
          addSystemMessage(room, `${player.name} respawned.`);
        }
        continue;
      }

      if (this.isPlayerInRadiation(room, player)) {
        const survived = damagePlayer(player, GAME_CONFIG.radiation_damage_per_second * dt);
        if (!survived) addSystemMessage(room, `${player.name} was incapacitated by radiation.`);
      }
    }
  }

  isPlayerInRadiation(room, player) {
    return room.radiationZones.some((zone) => {
      const dx = player.position.x - zone.x;
      const dy = player.position.y - zone.y;
      return Math.sqrt(dx * dx + dy * dy) <= zone.radius;
    });
  }

  emitWarnings(room) {
    const reactor = [...room.machines.values()].find((m) => m.type === MACHINE_TYPES.REACTOR);
    if (reactor?.state.meltdownCountdown !== null) {
      const seconds = Math.ceil(reactor.state.meltdownCountdown);
      if (seconds !== room.lastWarnings.meltdownCountdown) {
        room.lastWarnings.meltdownCountdown = seconds;
        addSystemMessage(room, `MELTDOWN WARNING: ${seconds}s until containment failure.`);
        this.io?.to(room.id).emit(EVENT_NAMES.MELTDOWN_WARNING, { seconds });
      }
    }

    if (room.blackoutActive && !room.lastWarnings.blackout) {
      room.lastWarnings.blackout = true;
      addSystemMessage(room, 'BLACKOUT: control room power is offline. Manual protocols only.');
      this.io?.to(room.id).emit(EVENT_NAMES.BLACKOUT_WARNING, { active: true });
    }
  }

  endGame(roomId, result, reason) {
    const room = this.getRoom(roomId);
    if (!room) return;

    room.isRunning = false;
    room.gamePhase = result === 'win' ? 'won' : 'lost';
    this.stopGameLoop(room.id, false);
    addSystemMessage(room, result === 'win' ? `Victory: ${reason}` : `Defeat: ${reason}`);

    const eventName = result === 'win' ? EVENT_NAMES.GAME_WIN : EVENT_NAMES.GAME_OVER;
    this.broadcastGameState(room.id, eventName);
  }

  applyMeltdownDamage(room) {
    for (const player of room.players.values()) {
      damagePlayer(player, 100);
    }
  }

  broadcastGameState(roomId, eventName = EVENT_NAMES.STATE_UPDATE) {
    if (!this.io) return;
    const room = this.getRoom(roomId);
    if (!room) return;
    const prevState = this._prevStates?.get(room.id);
    const state = this.serializeRoom(room, prevState);
    if (!state) return;
    this.io.to(room.id).emit(eventName, state);
  }

  serializeRoom(room, prevState = null) {
    const newState = {
      id: room.id,
      gameTime: room.gameTime,
      gamePhase: room.gamePhase,
      fuelRods: room.fuelRods,
      radiationLevel: room.radiationLevel,
      radiationZones: room.radiationZones,
      totalOutput: room.totalOutput,
      blackoutTimer: room.blackoutTimer,
      blackoutActive: room.blackoutActive,
      score: { uptimeSeconds: room.score.uptimeSeconds, totalMWGenerated: Math.round(room.score.totalMWGenerated), tasksCompleted: room.score.tasksCompleted },
      players: [...room.players.values()].map(serializePlayer),
      machines: [...room.machines.values()].map((m) => ({
        id: m.id, type: m.type, hp: Math.round(m.hp * 10) / 10, maxHp: m.maxHp,
        x: m.x, y: m.y, state: { ...m.state }, isActive: m.isActive,
      })),
    };

    if (!prevState) {
      this._prevStates = this._prevStates || new Map();
      this._prevStates.set(room.id, newState);
      return newState;
    }

    const delta = { id: room.id };
    let changed = false;
    for (const key of ['gameTime', 'gamePhase', 'fuelRods', 'radiationLevel', 'totalOutput', 'blackoutTimer', 'blackoutActive']) {
      if (newState[key] !== prevState[key]) { delta[key] = newState[key]; changed = true; }
    }
    if (JSON.stringify(newState.radiationZones) !== JSON.stringify(prevState.radiationZones)) { delta.radiationZones = newState.radiationZones; changed = true; }
    if (JSON.stringify(newState.score) !== JSON.stringify(prevState.score)) { delta.score = newState.score; changed = true; }

    const changedPlayers = newState.players.filter(p => {
      const prev = prevState.players.find(x => x.id === p.id);
      return !prev || JSON.stringify(p) !== JSON.stringify(prev);
    });
    if (changedPlayers.length > 0) { delta.players = changedPlayers; changed = true; }

    const changedMachines = newState.machines.filter(m => {
      const prev = prevState.machines.find(x => x.id === m.id);
      return !prev || JSON.stringify(m) !== JSON.stringify(prev);
    });
    if (changedMachines.length > 0) { delta.machines = changedMachines; changed = true; }

    this._prevStates.set(room.id, newState);
    return changed ? delta : null;
  }

  deleteRoom(roomId) {
    const room = this.getRoom(roomId);
    if (!room) return false;
    this.stopGameLoop(room.id, false);
    this.stopBroadcastLoop(room.id);
    return this.rooms.delete(room.id);
  }

  setMachineHp(machine, hp) {
    machine.hp = Math.max(0, Math.min(machine.maxHp, hp));
    machine.isActive = machine.hp > 0;
  }

  isWithinRange(player, machine) {
    const dx = player.position.x - machine.x;
    const dy = player.position.y - machine.y;
    return Math.sqrt(dx * dx + dy * dy) <= player.interactionRadius;
  }

  lockMachine(room, player, machine) {
    const existing = room.interactionLocks.get(machine.id);
    const now = Date.now();
    if (existing && existing.playerId !== player.socketId && now - existing.at < INTERACTION_LOCK_TIMEOUT_SECONDS * 1000) {
      return false;
    }
    room.interactionLocks.set(machine.id, { playerId: player.socketId, at: now });
    return true;
  }

  freeMachineLocks(room, playerId) {
    for (const [machineId, lock] of room.interactionLocks) {
      if (lock.playerId === playerId) room.interactionLocks.delete(machineId);
    }
    const player = room.players.get(playerId);
    if (player) {
      player.isRepairing = false;
      player.repairProgress = 0;
      player.repairTarget = null;
    }
  }

  reassignReactorOperator(room) {
    const replacement = [...room.players.values()].find((player) => player.isAlive);
    if (!replacement) return;
    replacement.role = 'RO';
    addSystemMessage(room, `${replacement.name} reassigned to RO after disconnect.`);
  }
}

const gameState = new GameState();

export function createGameRouter(state = gameState) {
  const router = Router();

  router.get('/api/rooms', (req, res) => {
    res.json(state.listPublicRooms());
  });

  router.get('/api/rooms/:id', (req, res) => {
    const room = state.getRoom(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(state.serializeRoom(room));
  });

  return router;
}

export default gameState;
