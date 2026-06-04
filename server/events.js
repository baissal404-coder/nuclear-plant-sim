import { EVENT_NAMES, MACHINE_TYPES } from '../shared/constants.js';

const EVENT_TYPES = [
  { type: 'pipe_leak', weight: 3, minTime: 60, maxTime: 120 },
  { type: 'sensor_failure', weight: 2, minTime: 60, maxTime: 120 },
  { type: 'power_surge', weight: 2, minTime: 90, maxTime: 150 },
  { type: 'fuel_rod_defect', weight: 1, minTime: 120, maxTime: 180 },
];

function pickEvent() {
  const totalWeight = EVENT_TYPES.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const ev of EVENT_TYPES) {
    r -= ev.weight;
    if (r <= 0) return ev;
  }
  return EVENT_TYPES[0];
}

export function setupRandomEvents(room, io) {
  room._eventTimer = 0;
  room._nextEventTime = pickEventInterval();

  return function updateEvents(dt) {
    if (!room.isRunning) return;
    room._eventTimer += dt;
    if (room._eventTimer < room._nextEventTime) return;
    room._eventTimer = 0;
    room._nextEventTime = pickEventInterval();
    triggerRandomEvent(room, io);
  };
}

function pickEventInterval() {
  const ev = pickEvent();
  return ev.minTime + Math.random() * (ev.maxTime - ev.minTime);
}

function triggerRandomEvent(room, io) {
  const ev = pickEvent();
  const machines = [...room.machines.values()];
  let targetMachine, message;

  switch (ev.type) {
    case 'pipe_leak': {
      const pipes = machines.filter(m => m.type === MACHINE_TYPES.PIPE && m.hp > 0);
      if (pipes.length === 0) return;
      targetMachine = pipes[Math.floor(Math.random() * pipes.length)];
      targetMachine.hp = Math.max(0, targetMachine.hp - 30);
      targetMachine.state.isLeaking = true;
      targetMachine.state.leakRate = 0.5;
      message = `Pipe leak detected at ${targetMachine.id}!`;
      break;
    }
    case 'sensor_failure': {
      const reactor = machines.find(m => m.type === MACHINE_TYPES.REACTOR);
      if (!reactor) return;
      reactor.state.heat += 50;
      message = 'Sensor malfunction! Reactor heat readings may be inaccurate.';
      break;
    }
    case 'power_surge': {
      const generators = machines.filter(m => m.type === MACHINE_TYPES.GENERATOR && m.hp > 0);
      if (generators.length === 0) return;
      targetMachine = generators[Math.floor(Math.random() * generators.length)];
      targetMachine.hp = Math.max(0, targetMachine.hp - 20);
      const turbines = machines.filter(m => m.type === MACHINE_TYPES.TURBINE);
      turbines.forEach(t => { t.hp = Math.max(0, t.hp - 10); });
      message = 'Power surge damaged electrical systems!';
      break;
    }
    case 'fuel_rod_defect': {
      const reactor2 = machines.find(m => m.type === MACHINE_TYPES.REACTOR);
      if (!reactor2) return;
      reactor2.state.fuelLevel = Math.max(0, reactor2.state.fuelLevel - 20);
      reactor2.state.heat += 30;
      room.fuelRods = Math.max(0, room.fuelRods - 1);
      message = 'Defective fuel rod detected! Fuel efficiency decreased.';
      break;
    }
  }

  if (message && io) {
    io.to(room.id).emit(EVENT_NAMES.CHAT_SYSTEM, {
      id: `event_${Date.now()}`, sender: '[SYSTEM]', message, type: 'system', timestamp: Date.now()
    });
  }
}
