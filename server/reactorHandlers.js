import {
  EVENT_NAMES,
  CLASS_IDS,
  GAME_CONFIG,
  MACHINE_TYPES,
} from '../shared/constants.js';
import {
  canRepair,
  canControlReactor,
  startRepair,
  updateRepair,
  completeRepair,
} from './player.js';
import { sendSystemMessage } from './chat.js';

export function handleReactorScram(io, gameState, socket) {
  const room = gameState.getRoom(socket.roomId);
  if (!room || !room.isRunning) return;

  const player = room.players.get(socket.id);
  if (!player || !canControlReactor(player)) {
    socket.emit('error', { message: 'Permission denied' });
    return;
  }

  const reactor = [...room.machines.values()].find((m) => m.type === MACHINE_TYPES.REACTOR);
  if (!reactor) return;

  const controlRods = [...room.machines.values()].find((m) => m.type === MACHINE_TYPES.CONTROL_RODS);
  if (controlRods) {
    controlRods.state.insertionLevel = 100;
    controlRods.state.pendingCommands = [];
    reactor.state.controlRodInsertion = 100;
  }
  reactor.state.meltdownArmedSeconds = 0;
  reactor.state.meltdownCountdown = null;
  reactor.state.heat = Math.max(0, reactor.state.heat - 80);

  io.to(room.id).emit(EVENT_NAMES.REACTOR_SCRAM, {
    playerId: player.socketId,
    message: 'Emergency reactor shutdown initiated',
  });

  sendSystemMessage(io, room.id, `REACTOR SCRAM initiated by ${player.name}`);
}

export function handleControlRods(io, gameState, socket, data) {
  const { insertionLevel } = data;
  const room = gameState.getRoom(socket.roomId);
  if (!room || !room.isRunning) return;

  const player = room.players.get(socket.id);
  if (!player || !canControlReactor(player)) {
    socket.emit('error', { message: 'Permission denied' });
    return;
  }

  if (typeof insertionLevel !== 'number' || insertionLevel < 0 || insertionLevel > 100) {
    socket.emit('error', { message: 'Invalid insertion level' });
    return;
  }

  const controlRods = [...room.machines.values()].find((m) => m.type === MACHINE_TYPES.CONTROL_RODS);
  if (!controlRods) return;

  controlRods.state.pendingCommands.push({ insertionLevel, timestamp: Date.now() });

  io.to(room.id).emit(EVENT_NAMES.REACTOR_CONTROL_RODS, {
    playerId: player.socketId,
    insertionLevel,
  });
}

export function handlePumpSpeed(io, gameState, socket, data) {
  const { pumpId, speed } = data;
  const room = gameState.getRoom(socket.roomId);
  if (!room || !room.isRunning) return;

  const player = room.players.get(socket.id);
  if (!player || !canControlReactor(player)) {
    socket.emit('error', { message: 'Permission denied' });
    return;
  }

  if (typeof speed !== 'number' || speed < 0 || speed > 100) {
    socket.emit('error', { message: 'Invalid speed' });
    return;
  }

  const pump = room.machines.get(pumpId);
  if (!pump || pump.type !== MACHINE_TYPES.PUMP) {
    socket.emit('error', { message: 'Invalid pump' });
    return;
  }

  pump.state.speed = speed;

  io.to(room.id).emit(EVENT_NAMES.PUMP_SPEED_CHANGE, {
    playerId: player.socketId,
    pumpId,
    speed,
  });
}

export function handleMachineRepair(io, gameState, socket, data) {
  const { machineId } = data;
  const room = gameState.getRoom(socket.roomId);
  if (!room || !room.isRunning) return;

  const player = room.players.get(socket.id);
  if (!player || !canRepair(player)) {
    socket.emit('error', { message: 'Permission denied' });
    return;
  }

  const machine = room.machines.get(machineId);
  if (!machine) {
    socket.emit('error', { message: 'Machine not found' });
    return;
  }

  if (!isWithinRange(player, machine)) {
    socket.emit('error', { message: 'Too far away' });
    return;
  }

  const repairComplete = updateRepair(player, 1 / gameState.tickRate);
  if (repairComplete) {
    const result = completeRepair(player, machine);
    if (result) {
      io.to(room.id).emit(EVENT_NAMES.MACHINE_REPAIR, {
        playerId: player.socketId,
        machineId,
        result,
      });

      room.score.tasksCompleted += 1;
      sendSystemMessage(io, room.id, `${player.name} repaired ${machine.type}`);
    }
  }
}

export function handleFuelDelivery(io, gameState, socket, data) {
  const { reactorId } = data;
  const room = gameState.getRoom(socket.roomId);
  if (!room || !room.isRunning) return;

  const player = room.players.get(socket.id);
  if (!player || player.role !== CLASS_IDS.LO) {
    socket.emit('error', { message: 'Only LO can deliver fuel' });
    return;
  }

  const reactor = room.machines.get(reactorId);
  if (!reactor || reactor.type !== MACHINE_TYPES.REACTOR) {
    socket.emit('error', { message: 'Invalid reactor' });
    return;
  }

  if (!isWithinRange(player, reactor)) {
    socket.emit('error', { message: 'Too far away' });
    return;
  }

  if (room.fuelRods <= 0) {
    socket.emit('error', { message: 'No fuel rods available' });
    return;
  }

  room.fuelRods -= 1;
  reactor.state.fuelLevel = Math.min(100, reactor.state.fuelLevel + 20);
  room.score.tasksCompleted += 1;

  io.to(room.id).emit(EVENT_NAMES.FUEL_ROD_DELIVER, {
    playerId: player.socketId,
    machineId: reactorId,
    fuelRodsRemaining: room.fuelRods,
  });
}

export function handleTaskAssignment(io, gameState, socket, data) {
  const { targetPlayerId, task } = data;
  const room = gameState.getRoom(socket.roomId);
  if (!room || !room.isRunning) return;

  const player = room.players.get(socket.id);
  if (!player || !canControlReactor(player)) {
    socket.emit('error', { message: 'Permission denied' });
    return;
  }

  const targetPlayer = room.players.get(targetPlayerId);
  if (!targetPlayer) {
    socket.emit('error', { message: 'Target player not found' });
    return;
  }

  if (!task || !task.type || !task.targetId) {
    socket.emit('error', { message: 'Invalid task data' });
    return;
  }

  targetPlayer.assignedTasks.push({
    id: `task_${Date.now()}`,
    type: task.type,
    targetId: task.targetId,
    assignedAt: Date.now(),
    isComplete: false,
  });

  io.to(targetPlayerId).emit(EVENT_NAMES.TASK_ASSIGN, {
    taskId: task.id,
    taskType: task.type,
    targetId: task.targetId,
    assignedBy: player.name,
  });

  sendSystemMessage(io, room.id, `Task assigned to ${targetPlayer.name}`);
}

export function handleEmergencyProtocol(io, gameState, socket, data) {
  const room = gameState.getRoom(socket.roomId);
  if (!room || !room.isRunning) return;

  const player = room.players.get(socket.id);
  if (!player || !player.isAlive) return;

  switch (data?.protocol) {
    case 'ventSteam':
      handleVentSteam(io, room, player);
      break;
    case 'manualScram':
      handleReactorScram(io, gameState, socket);
      break;
    case 'evacZone':
      handleEvacZone(io, gameState, room, player);
      break;
    default:
      socket.emit('error', { message: 'Unknown emergency protocol' });
  }
}

function handleVentSteam(io, room, player) {
  if (!canControlReactor(player)) {
    io.to(player.socketId).emit('error', { message: 'Only RO can vent steam' });
    return;
  }

  const reactor = [...room.machines.values()].find((m) => m.type === MACHINE_TYPES.REACTOR);
  const pipes = [...room.machines.values()].filter((m) => m.type === MACHINE_TYPES.PIPE);
  if (!reactor) return;

  reactor.state.heat = Math.max(0, reactor.state.heat - 120);
  for (const pipe of pipes) {
    pipe.state.pressure = Math.max(0, pipe.state.pressure - 40);
  }

  room.score.tasksCompleted += 1;
  sendSystemMessage(io, room.id, `${player.name} vented steam pressure.`);
}

function handleEvacZone(io, gameState, room, player) {
  const inRadiation = gameState.isPlayerInRadiation(room, player);
  if (!inRadiation) {
    io.to(player.socketId).emit('error', { message: 'Evac is only available inside radiation zones' });
    return;
  }

  player.position = { ...player.spawnPosition };
  player.velocity = { x: 0, y: 0 };
  player.evacuatedFromRadiation = true;
  player.hp = Math.max(25, player.hp);
  sendSystemMessage(io, room.id, `${player.name} evacuated from radiation.`);
}

function isWithinRange(player, machine) {
  const dx = player.position.x - machine.x;
  const dy = player.position.y - machine.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance <= player.interactionRadius;
}
