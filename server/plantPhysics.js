import {
  MACHINE_TYPES,
  MACHINE_DEFAULTS,
  GAME_CONFIG,
} from '../shared/constants.js';

export function updatePlant(room, dt) {
  const machines = [...room.machines.values()];
  const reactor = machines.find((m) => m.type === MACHINE_TYPES.REACTOR);
  const controlRods = machines.find((m) => m.type === MACHINE_TYPES.CONTROL_RODS);
  const pumps = machines.filter((m) => m.type === MACHINE_TYPES.PUMP);
  const pipes = machines.filter((m) => m.type === MACHINE_TYPES.PIPE);
  const turbines = machines.filter((m) => m.type === MACHINE_TYPES.TURBINE);
  const generators = machines.filter((m) => m.type === MACHINE_TYPES.GENERATOR);
  const condenser = machines.find((m) => m.type === MACHINE_TYPES.CONDENSER);

  if (!reactor) return;

  const diff = room.diffConfig || { decayMultiplier: 1, failureRate: 1 };
  const decay = diff.decayMultiplier;
  const failRate = diff.failureRate;

  // Process pending control rod commands
  if (controlRods && controlRods.state.pendingCommands.length > 0) {
    const latestCommand = controlRods.state.pendingCommands.pop();
    controlRods.state.insertionLevel = Math.max(
      MACHINE_DEFAULTS[MACHINE_TYPES.CONTROL_RODS].insertion_range[0],
      Math.min(
        MACHINE_DEFAULTS[MACHINE_TYPES.CONTROL_RODS].insertion_range[1],
        latestCommand.insertionLevel
      )
    );
    reactor.state.controlRodInsertion = controlRods.state.insertionLevel;
  }

  updateReactor(reactor, dt, pumps, decay);
  updatePumps(pumps, dt, decay);
  updatePipes(pipes, condenser, dt, failRate);
  updateTurbines(turbines, pipes, condenser, dt);
  updateGenerators(generators, turbines, dt);
  updateCondenser(condenser, pipes, dt);
  updateRadiation(room, reactor, pipes);
  updateMeltdownSequence(room, reactor, dt);
}

function updateReactor(reactor, dt, pumps, decay = 1) {
  if (!reactor || !reactor.isActive) return;

  const defaults = MACHINE_DEFAULTS[MACHINE_TYPES.REACTOR];
  const rodFactor = reactor.state.controlRodInsertion / 100;
  const effectivePower = defaults.base_power_output * (1 - rodFactor * 0.8);
  const heatGen = effectivePower * defaults.heat_generation_rate;

  // Heat increases faster when rods are withdrawn beyond 50%
  const rodWithdrawalBonus = reactor.state.controlRodInsertion < 50
    ? (50 - reactor.state.controlRodInsertion) / 50 * 1.5
    : 0;

  // Apply cooling from pumps
  let coolingAmount = 0;
  for (const pump of pumps) {
    if (pump.isActive && pump.hp > 0) {
      const pumpDefaults = MACHINE_DEFAULTS[MACHINE_TYPES.PUMP];
      const pumpEffectiveness = pump.hp / pump.maxHp;
      coolingAmount += pump.state.speed / pumpDefaults.max_speed * pumpDefaults.coolant_removal_rate * pumpEffectiveness;
    }
  }

  reactor.state.heat += (heatGen * (1 + rodWithdrawalBonus) - coolingAmount) * dt * decay;
  reactor.state.heat = Math.max(0, reactor.state.heat);
  reactor.state.powerOutput = effectivePower;

  if (reactor.state.heat > defaults.max_safe_heat) {
    const overheatDamage = (reactor.state.heat - defaults.max_safe_heat) / 100 * dt;
    reactor.hp = Math.max(0, reactor.hp - overheatDamage);
  }

  reactor.state.fuelLevel -= dt * 0.1 * decay;
  if (reactor.state.fuelLevel <= 0) {
    reactor.state.fuelLevel = 0;
    reactor.state.powerOutput = 0;
    reactor.state.heat -= dt * 5;
  }
}

function updatePumps(pumps, dt, decay = 1) {
  const defaults = MACHINE_DEFAULTS[MACHINE_TYPES.PUMP];

  for (const pump of pumps) {
    if (!pump.isActive || pump.hp <= 0) continue;

    const effectiveness = pump.hp / pump.maxHp;
    pump.state.speed = Math.min(
      defaults.max_speed,
      pump.state.speed * effectiveness
    );
    pump.state.coolantLevel -= dt * 0.05 * (pump.state.speed / defaults.max_speed) * decay;
    pump.state.coolantLevel = Math.max(0, pump.state.coolantLevel);

    if (pump.state.coolantLevel <= 0) {
      pump.state.speed = 0;
    }
  }
}

function updatePipes(pipes, condenser, dt, failRate = 1) {
  const defaults = MACHINE_DEFAULTS[MACHINE_TYPES.PIPE];

  for (const pipe of pipes) {
    if (!pipe.isActive || pipe.hp <= 0) {
      pipe.state.pressure = 0;
      pipe.state.isLeaking = false;
      continue;
    }

    const healthFactor = pipe.hp / pipe.maxHp;
    const condenserFactor = condenser
      ? condenser.state.efficiency / MACHINE_DEFAULTS[MACHINE_TYPES.CONDENSER].max_efficiency
      : 1;

    pipe.state.pressure = defaults.max_pressure * healthFactor * condenserFactor;

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

function updateTurbines(turbines, pipes, condenser, dt) {
  const defaults = MACHINE_DEFAULTS[MACHINE_TYPES.TURBINE];
  const pipeDefaults = MACHINE_DEFAULTS[MACHINE_TYPES.PIPE];
  const steamPressure = calculateSteamPressure(pipes, condenser);

  for (const turbine of turbines) {
    if (!turbine.isActive || turbine.hp <= 0) {
      turbine.state.rpm = Math.max(0, turbine.state.rpm - dt * 100);
      continue;
    }

    if (steamPressure >= defaults.min_steam_pressure) {
      const pressureFactor = (steamPressure - defaults.min_steam_pressure) /
        (pipeDefaults.max_pressure * pipes.length - defaults.min_steam_pressure);
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

function updateGenerators(generators, turbines, dt) {
  const defaults = MACHINE_DEFAULTS[MACHINE_TYPES.GENERATOR];

  for (const generator of generators) {
    if (!generator.isActive || generator.hp <= 0) {
      generator.state.rpm = Math.max(0, generator.state.rpm - dt * 80);
      generator.state.outputMW = 0;
      continue;
    }

    const connectedTurbine = turbines.find((t) => t.state.rpm > 0);
    const turbineRPM = connectedTurbine ? connectedTurbine.state.rpm : 0;

    if (turbineRPM >= defaults.min_rpm) {
      const rpmFactor = (turbineRPM - defaults.min_rpm) /
        (defaults.max_output_mw * 36 - defaults.min_rpm);
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

function updateCondenser(condenser, pipes, dt) {
  if (!condenser || !condenser.isActive || condenser.hp <= 0) {
    if (condenser) condenser.state.efficiency = 0;
    return;
  }

  const defaults = MACHINE_DEFAULTS[MACHINE_TYPES.CONDENSER];
  const healthFactor = condenser.hp / condenser.maxHp;
  const leakingPipes = pipes.filter((p) => p.state.isLeaking).length;
  const leakPenalty = leakingPipes * 5;

  condenser.state.efficiency = Math.max(0, defaults.max_efficiency * healthFactor - leakPenalty);
  condenser.state.waterLevel += dt * condenser.state.efficiency / 100;
  condenser.state.waterLevel = Math.min(100, condenser.state.waterLevel);

  const incomingSteam = pipes.reduce((sum, p) => sum + p.state.pressure * 0.1, 0);
  condenser.state.exhaustSteam = incomingSteam * (1 - condenser.state.efficiency / 100);
}

function updateRadiation(room, reactor, pipes) {
  if (!reactor) return;

  const baseRadiation = reactor.state.heat / GAME_CONFIG.meltdown_threshold * 50;
  const pipeLeakRadiation = pipes
    .filter((p) => p.state.isLeaking)
    .reduce((sum, p) => sum + (1 - p.hp / p.maxHp) * 20, 0);

  room.radiationLevel = Math.min(
    GAME_CONFIG.max_radiation,
    baseRadiation + pipeLeakRadiation
  );
}

export function updateMeltdownSequence(room, reactor, dt) {
  reactor.state.meltdownArmedSeconds ??= 0;
  reactor.state.meltdownCountdown ??= null;
  reactor.state.meltdown = Boolean(reactor.state.meltdown);

  const pumps = [...room.machines.values()].filter((m) => m.type === MACHINE_TYPES.PUMP);
  const coolantRestored = pumps.some((pump) => pump.hp > 0 && pump.state.speed >= 50 && pump.state.coolantLevel > 0);
  const heatCritical = reactor.state.heat >= GAME_CONFIG.meltdown_threshold;

  if (!heatCritical || coolantRestored || reactor.state.controlRodInsertion >= 95) {
    reactor.state.meltdownArmedSeconds = 0;
    reactor.state.meltdownCountdown = null;
    return;
  }

  reactor.state.meltdownArmedSeconds += dt;
  if (reactor.state.meltdownArmedSeconds < GAME_CONFIG.meltdown_arm_seconds) return;

  reactor.state.meltdownCountdown = reactor.state.meltdownCountdown ?? GAME_CONFIG.meltdown_countdown_seconds;
  reactor.state.meltdownCountdown -= dt;

  if (reactor.state.meltdownCountdown <= 0) {
    reactor.state.meltdown = true;
    room.meltdownOccurred = true;
  }
}

export function calculateSteamPressure(pipes, condenser) {
  let totalPressure = 0;
  let leakLoss = 0;

  for (const pipe of pipes) {
    if (!pipe.isActive || pipe.hp <= 0) continue;
    totalPressure += pipe.state.pressure;
    if (pipe.state.isLeaking) {
      leakLoss += pipe.state.leakRate * pipe.state.pressure;
    }
  }

  const condenserEfficiency = condenser
    ? condenser.state.efficiency / MACHINE_DEFAULTS[MACHINE_TYPES.CONDENSER].max_efficiency
    : 1;

  return Math.max(0, (totalPressure - leakLoss) * condenserEfficiency);
}

export function calculateTotalOutput(generators) {
  return generators.reduce((total, gen) => total + (gen.state.outputMW || 0), 0);
}

export function checkWinCondition(room) {
  if (room.meltdownOccurred) return false;
  if (room.totalOutput <= 0) return false;
  if (room.gameTime < room.winDuration) return false;
  const reactor = [...room.machines.values()].find((m) => m.type === MACHINE_TYPES.REACTOR);
  return reactor && !reactor.state.meltdown;
}

export function checkLoseCondition(room) {
  if (room.meltdownOccurred) return true;
  const reactor = [...room.machines.values()].find((m) => m.type === MACHINE_TYPES.REACTOR);
  if (reactor && reactor.state.meltdown) {
    room.meltdownOccurred = true;
    return true;
  }
  return false;
}
