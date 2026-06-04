import {
  MACHINE_TYPES,
  MACHINE_DEFAULTS,
  CLASS_IDS,
  GAME_CONFIG,
} from '../shared/constants.js';

/**
 * LocalGameState - Client-side simulation of server game state
 * Mirrors server logic for single-player play (Phase 2)
 */
export class LocalGameState {
  constructor() {
    this.machines = new Map();
    this.players = new Map();
    this.roomCode = '';
    this.gameTime = 0;
    this.isRunning = false;
    this.radiationLevel = 0;
    this.blackoutTimer = 0;
    this.totalOutput = 0;
    this.fuelRods = GAME_CONFIG.starting_fuel_rods;
    this.winDuration = GAME_CONFIG.win_duration_minutes * 60;
    this.gamePhase = 'lobby';
    this.lastTick = Date.now();
    this.tickInterval = null;
    this.listeners = new Map();
  }

  initialize(roomCode = 'SINGLE') {
    this.roomCode = roomCode;
    this.gameTime = 0;
    this.isRunning = false;
    this.radiationLevel = 0;
    this.blackoutTimer = 0;
    this.totalOutput = 0;
    this.fuelRods = GAME_CONFIG.starting_fuel_rods;
    this.gamePhase = 'lobby';

    this.initializeMachines();
    this.emit('initialized', this.serialize());
  }

  initializeMachines() {
    const machineConfigs = [
      { id: 'reactor_1', type: MACHINE_TYPES.REACTOR, x: 400, y: 250 },
      { id: 'control_rods_1', type: MACHINE_TYPES.CONTROL_RODS, x: 400, y: 150 },
      { id: 'pump_1', type: MACHINE_TYPES.PUMP, x: 250, y: 400 },
      { id: 'pump_2', type: MACHINE_TYPES.PUMP, x: 550, y: 400 },
      { id: 'pipe_1', type: MACHINE_TYPES.PIPE, x: 320, y: 320 },
      { id: 'pipe_2', type: MACHINE_TYPES.PIPE, x: 480, y: 320 },
      { id: 'pipe_3', type: MACHINE_TYPES.PIPE, x: 400, y: 450 },
      { id: 'turbine_1', type: MACHINE_TYPES.TURBINE, x: 750, y: 250 },
      { id: 'turbine_2', type: MACHINE_TYPES.TURBINE, x: 750, y: 380 },
      { id: 'generator_1', type: MACHINE_TYPES.GENERATOR, x: 880, y: 250 },
      { id: 'generator_2', type: MACHINE_TYPES.GENERATOR, x: 880, y: 380 },
      { id: 'condenser_1', type: MACHINE_TYPES.CONDENSER, x: 550, y: 500 },
      { id: 'fuel_storage', type: 'STORAGE', x: 100, y: 200 },
      { id: 'control_room_door', type: 'DOOR', x: 900, y: 550 },
    ];

    for (const config of machineConfigs) {
      const defaults = config.type in MACHINE_DEFAULTS ? MACHINE_DEFAULTS[config.type] : { max_hp: 100 };
      this.machines.set(config.id, {
        id: config.id,
        type: config.type,
        hp: defaults.max_hp || 100,
        maxHp: defaults.max_hp || 100,
        x: config.x,
        y: config.y,
        state: this.createMachineState(config.type),
        isActive: true,
      });
    }
  }

  createMachineState(type) {
    switch (type) {
      case MACHINE_TYPES.REACTOR:
        return { heat: 50, powerOutput: 20, controlRodInsertion: 50, fuelLevel: 100, meltdown: false };
      case MACHINE_TYPES.CONTROL_RODS:
        return { insertionLevel: 50 };
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
      case 'STORAGE':
        return { capacity: 20, current: 10 };
      case 'DOOR':
        return { targetScene: 'ControlRoom', requiredRole: CLASS_IDS.RO };
      default:
        return {};
    }
  }

  addPlayer(player) {
    this.players.set(player.id, player);
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  startGame() {
    this.isRunning = true;
    this.gamePhase = 'playing';
    this.lastTick = Date.now();

    this.tickInterval = setInterval(() => {
      const now = Date.now();
      const dt = (now - this.lastTick) / 1000;
      this.lastTick = now;
      this.update(dt);
    }, 1000 / 60);

    this.emit('gameStart', this.serialize());
  }

  stopGame() {
    this.isRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.gamePhase = 'lobby';
  }

  update(dt) {
    if (!this.isRunning) return;

    this.updatePlant(dt);
    this.gameTime += dt;
    this.totalOutput = this.calculateTotalOutput();

    if (this.totalOutput === 0) {
      this.blackoutTimer += dt;
    } else {
      this.blackoutTimer = 0;
    }

    // Win condition
    if (this.gameTime >= this.winDuration && this.totalOutput > 0) {
      this.gamePhase = 'won';
      this.stopGame();
      this.emit('gameWin', this.serialize());
      return;
    }

    // Lose conditions
    const reactor = this.machines.get('reactor_1');
    if (reactor && reactor.state.meltdown) {
      this.gamePhase = 'lost';
      this.stopGame();
      this.emit('gameOver', { reason: 'meltdown', ...this.serialize() });
      return;
    }

    if (this.blackoutTimer >= 30) {
      this.gamePhase = 'lost';
      this.stopGame();
      this.emit('gameOver', { reason: 'blackout', ...this.serialize() });
      return;
    }

    this.emit('stateUpdate', this.serialize());
  }

  updatePlant(dt) {
    const reactor = this.machines.get('reactor_1');
    const controlRods = this.machines.get('control_rods_1');
    const pumps = [...this.machines.values()].filter(m => m.type === MACHINE_TYPES.PUMP);
    const pipes = [...this.machines.values()].filter(m => m.type === MACHINE_TYPES.PIPE);
    const turbines = [...this.machines.values()].filter(m => m.type === MACHINE_TYPES.TURBINE);
    const generators = [...this.machines.values()].filter(m => m.type === MACHINE_TYPES.GENERATOR);
    const condenser = [...this.machines.values()].find(m => m.type === MACHINE_TYPES.CONDENSER);

    if (!reactor || !reactor.isActive) return;

    // Process control rod changes
    if (controlRods) {
      reactor.state.controlRodInsertion = controlRods.state.insertionLevel;
    }

    // Update reactor
    this.updateReactor(reactor, dt, pumps);
    this.updatePumps(pumps, dt);
    this.updatePipes(pipes, condenser, dt);
    this.updateTurbines(turbines, pipes, condenser, dt);
    this.updateGenerators(generators, turbines, dt);
    this.updateCondenser(condenser, pipes, dt);
    this.updateRadiation(reactor, pipes);
  }

  updateReactor(reactor, dt, pumps) {
    if (!reactor || !reactor.isActive) return;

    const defaults = MACHINE_DEFAULTS[MACHINE_TYPES.REACTOR];
    const rodFactor = reactor.state.controlRodInsertion / 100;
    const effectivePower = defaults.base_power_output * (1 - rodFactor * 0.8);
    const heatGen = effectivePower * defaults.heat_generation_rate;

    let coolingAmount = 0;
    for (const pump of pumps) {
      if (pump.isActive && pump.hp > 0) {
        const pumpDefaults = MACHINE_DEFAULTS[MACHINE_TYPES.PUMP];
        const pumpEffectiveness = pump.hp / pump.maxHp;
        coolingAmount += (pump.state.speed / pumpDefaults.max_speed) * pumpDefaults.coolant_removal_rate * pumpEffectiveness;
      }
    }

    reactor.state.heat += (heatGen - coolingAmount) * dt;
    reactor.state.heat = Math.max(0, reactor.state.heat);
    reactor.state.powerOutput = effectivePower;

    // Overheat damage
    if (reactor.state.heat > defaults.max_safe_heat) {
      const overheatDamage = (reactor.state.heat - defaults.max_safe_heat) / 100 * dt;
      reactor.hp = Math.max(0, reactor.hp - overheatDamage);
    }

    // Meltdown
    if (reactor.state.heat >= GAME_CONFIG.meltdown_threshold) {
      reactor.state.meltdown = true;
    }

    // Fuel consumption
    reactor.state.fuelLevel -= dt * 0.05;
    reactor.state.fuelLevel = Math.max(0, reactor.state.fuelLevel);
  }

  updatePumps(pumps, dt) {
    for (const pump of pumps) {
      if (!pump.isActive || pump.hp <= 0) continue;

      const effectiveness = pump.hp / pump.maxHp;
      pump.state.coolantLevel -= dt * 0.05 * (pump.state.speed / 100);
      pump.state.coolantLevel = Math.max(0, pump.state.coolantLevel);

      if (pump.state.coolantLevel <= 0) {
        pump.state.speed = 0;
      }
    }
  }

  updatePipes(pipes, condenser, dt) {
    const defaults = MACHINE_DEFAULTS[MACHINE_TYPES.PIPE];

    for (const pipe of pipes) {
      if (!pipe.isActive || pipe.hp <= 0) {
        pipe.state.pressure = 0;
        pipe.state.isLeaking = false;
        continue;
      }

      const healthFactor = pipe.hp / pipe.maxHp;
      const condenserFactor = condenser ? condenser.state.efficiency / 100 : 1;

      pipe.state.pressure = defaults.max_pressure * healthFactor * condenserFactor;

      // Leaking when damaged
      if (pipe.hp < pipe.maxHp * 0.7) {
        pipe.state.isLeaking = true;
        pipe.state.leakRate = (1 - healthFactor) * defaults.leak_rate;
        pipe.state.pressure *= 1 - pipe.state.leakRate;
        pipe.hp -= pipe.state.leakRate * dt * 10;
      } else {
        pipe.state.isLeaking = false;
        pipe.state.leakRate = 0;
      }

      pipe.hp = Math.max(0, pipe.hp);
    }
  }

  updateTurbines(turbines, pipes, condenser, dt) {
    const defaults = MACHINE_DEFAULTS[MACHINE_TYPES.TURBINE];
    const steamPressure = this.calculateSteamPressure(pipes, condenser);

    for (const turbine of turbines) {
      if (!turbine.isActive || turbine.hp <= 0) {
        turbine.state.rpm = Math.max(0, turbine.state.rpm - dt * 100);
        continue;
      }

      if (steamPressure >= defaults.min_steam_pressure) {
        const pressureFactor = (steamPressure - defaults.min_steam_pressure) / (defaults.max_pressure - defaults.min_steam_pressure);
        const targetRPM = defaults.max_rpm * Math.min(1, pressureFactor);
        const healthFactor = turbine.hp / turbine.maxHp;

        turbine.state.rpm += (targetRPM * healthFactor - turbine.state.rpm) * dt * 2;
        turbine.state.rpm = Math.max(0, Math.min(defaults.max_rpm, turbine.state.rpm));
        turbine.state.temperature += (turbine.state.rpm / defaults.max_rpm) * dt * 10;

        if (turbine.state.temperature > 200) {
          turbine.hp -= (turbine.state.temperature - 200) / 100 * dt;
          turbine.hp = Math.max(0, turbine.hp);
        }
      } else {
        turbine.state.rpm = Math.max(0, turbine.state.rpm - dt * 50);
        turbine.state.temperature = Math.max(20, turbine.state.temperature - dt * 5);
      }

      turbine.state.steamPressure = steamPressure;
    }
  }

  updateGenerators(generators, turbines, dt) {
    const defaults = MACHINE_DEFAULTS[MACHINE_TYPES.GENERATOR];

    for (const generator of generators) {
      if (!generator.isActive || generator.hp <= 0) {
        generator.state.rpm = Math.max(0, generator.state.rpm - dt * 80);
        generator.state.outputMW = 0;
        continue;
      }

      const connectedTurbine = turbines.find(t => t.state.rpm > 0);
      const turbineRPM = connectedTurbine ? connectedTurbine.state.rpm : 0;

      if (turbineRPM >= defaults.min_rpm) {
        const rpmFactor = (turbineRPM - defaults.min_rpm) / (defaults.max_output_mw * 36 - defaults.min_rpm);
        const healthFactor = generator.hp / generator.maxHp;

        generator.state.rpm += (turbineRPM - generator.state.rpm) * dt * 3;
        generator.state.outputMW = defaults.max_output_mw * Math.min(1, rpmFactor) * healthFactor;
        generator.state.voltage = generator.state.outputMW * 10;
        generator.state.frequency = 60 * (generator.state.rpm / 3600);
      } else {
        generator.state.rpm = Math.max(0, generator.state.rpm - dt * 60);
        generator.state.outputMW = 0;
        generator.state.voltage = 0;
      }
    }
  }

  updateCondenser(condenser, pipes, dt) {
    if (!condenser || !condenser.isActive || condenser.hp <= 0) {
      if (condenser) condenser.state.efficiency = 0;
      return;
    }

    const defaults = MACHINE_DEFAULTS[MACHINE_TYPES.CONDENSER];
    const healthFactor = condenser.hp / condenser.maxHp;
    const leakingPipes = pipes.filter(p => p.state.isLeaking).length;
    const leakPenalty = leakingPipes * 5;

    condenser.state.efficiency = Math.max(0, defaults.max_efficiency * healthFactor - leakPenalty);
    condenser.state.waterLevel += dt * condenser.state.efficiency / 100;
    condenser.state.waterLevel = Math.min(100, condenser.state.waterLevel);

    const incomingSteam = pipes.reduce((sum, p) => sum + p.state.pressure * 0.1, 0);
    condenser.state.exhaustSteam = incomingSteam * (1 - condenser.state.efficiency / 100);
  }

  updateRadiation(reactor, pipes) {
    if (!reactor) return;

    const baseRadiation = reactor.state.heat / GAME_CONFIG.meltdown_threshold * 50;
    const pipeLeakRadiation = pipes
      .filter(p => p.state.isLeaking)
      .reduce((sum, p) => sum + (1 - p.hp / p.maxHp) * 20, 0);

    this.radiationLevel = Math.min(GAME_CONFIG.max_radiation, baseRadiation + pipeLeakRadiation);
  }

  calculateSteamPressure(pipes, condenser) {
    let totalPressure = 0;
    let leakLoss = 0;

    for (const pipe of pipes) {
      if (!pipe.isActive || pipe.hp <= 0) continue;
      totalPressure += pipe.state.pressure;
      if (pipe.state.isLeaking) {
        leakLoss += pipe.state.leakRate * pipe.state.pressure;
      }
    }

    const condenserEfficiency = condenser ? condenser.state.efficiency / 100 : 1;
    return Math.max(0, (totalPressure - leakLoss) * condenserEfficiency);
  }

  calculateTotalOutput() {
    const generators = [...this.machines.values()].filter(m => m.type === MACHINE_TYPES.GENERATOR);
    return generators.reduce((total, gen) => total + (gen.state.outputMW || 0), 0);
  }

  // Player actions
  repairMachine(playerId, machineId, dt) {
    const player = this.players.get(playerId);
    const machine = this.machines.get(machineId);

    if (!player || player.role !== CLASS_IDS.PM) return false;
    if (!machine || machine.hp >= machine.maxHp) return false;

    const repairRate = 20 * dt; // HP per second
    machine.hp = Math.min(machine.maxHp, machine.hp + repairRate);

    this.emit('machineRepaired', { machineId, hp: machine.hp });
    return true;
  }

  scram() {
    const controlRods = this.machines.get('control_rods_1');
    if (controlRods) {
      controlRods.state.insertionLevel = 100;
    }

    const pumps = [...this.machines.values()].filter(m => m.type === MACHINE_TYPES.PUMP);
    pumps.forEach(pump => {
      pump.state.speed = 100;
    });

    this.emit('scramActivated', {});
    return true;
  }

  setControlRodInsertion(level) {
    const controlRods = this.machines.get('control_rods_1');
    if (controlRods) {
      controlRods.state.insertionLevel = Math.max(0, Math.min(100, level));
      return true;
    }
    return false;
  }

  setPumpSpeed(pumpId, speed) {
    const pump = this.machines.get(pumpId);
    if (pump && pump.type === MACHINE_TYPES.PUMP) {
      pump.state.speed = Math.max(0, Math.min(100, speed));
      return true;
    }
    return false;
  }

  deliverFuelRod(machineId) {
    const machine = this.machines.get(machineId);
    if (!machine || machine.type !== MACHINE_TYPES.REACTOR) return false;
    if (this.fuelRods <= 0) return false;

    this.fuelRods -= 1;
    machine.state.fuelLevel = Math.min(100, machine.state.fuelLevel + 15);

    this.emit('fuelRodDelivered', { fuelRodsRemaining: this.fuelRods });
    return true;
  }

  // Event system
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) callbacks.splice(index, 1);
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach(cb => cb(data));
  }

  // Serialization for UI
  serialize() {
    return {
      roomCode: this.roomCode,
      gameTime: this.gameTime,
      gamePhase: this.gamePhase,
      fuelRods: this.fuelRods,
      radiationLevel: this.radiationLevel,
      totalOutput: this.totalOutput,
      blackoutTimer: this.blackoutTimer,
      machines: [...this.machines.values()].map(m => ({
        id: m.id,
        type: m.type,
        hp: m.hp,
        maxHp: m.maxHp,
        x: m.x,
        y: m.y,
        state: m.state,
        isActive: m.isActive,
      })),
      players: [...this.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        x: p.x,
        y: p.y,
        hp: p.hp,
      })),
    };
  }
}

// Singleton instance
export const localGameState = new LocalGameState();