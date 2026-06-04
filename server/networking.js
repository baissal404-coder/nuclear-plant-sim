import { CLASS_IDS, EVENT_NAMES, GAME_CONFIG, MACHINE_TYPES } from '../shared/constants.js';
import { canControlReactor, canRepair, createPlayer, startRepair } from './player.js';
import { addSystemMessage, sendChatHistory } from './chat.js';
import {
  handleControlRods,
  handleEmergencyProtocol,
  handleFuelDelivery,
  handleMachineRepair,
  handlePumpSpeed,
  handleReactorScram,
  handleTaskAssignment,
} from './reactorHandlers.js';

const SOCKET_EVENT_LIMIT = 60;
const VALID_ROLES = new Set([CLASS_IDS.PM, CLASS_IDS.LO, CLASS_IDS.RO]);
const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const PLAYER_NAME_PATTERN = /^[\w .-]{2,20}$/;

export function setupNetworking(io, gameState, socket) {
  socket.rateWindow = [];

  socket.use(([event, payload], next) => {
    if (!checkSocketRate(socket)) {
      next(new Error('Socket rate limit exceeded'));
      socket.disconnect(true);
      return;
    }
    next();
  });

  socket.on(EVENT_NAMES.ROOM_CREATE, (data) => handleRoomCreate(io, gameState, socket, data));
  socket.on(EVENT_NAMES.ROOM_JOIN, (data) => handleRoomJoin(io, gameState, socket, data));
  socket.on(EVENT_NAMES.ROOM_LIST, () => socket.emit(EVENT_NAMES.ROOM_LIST_UPDATE, gameState.listPublicRooms()));
  socket.on(EVENT_NAMES.PLAYER_JOIN, (data) => handleRoomJoin(io, gameState, socket, data));
  socket.on(EVENT_NAMES.PLAYER_READY, (data) => handleReady(io, gameState, socket, data));
  socket.on(EVENT_NAMES.PLAYER_MOVE, (data) => handlePlayerInput(gameState, socket, data));
  socket.on(EVENT_NAMES.PLAYER_ACTION, (data) => handlePlayerAction(io, gameState, socket, data));
  socket.on(EVENT_NAMES.REACTOR_SCRAM, () => handleReactorScram(io, gameState, socket));
  socket.on(EVENT_NAMES.REACTOR_CONTROL_RODS, (data) => handleControlRods(io, gameState, socket, data));
  socket.on(EVENT_NAMES.PUMP_SPEED_CHANGE, (data) => handlePumpSpeed(io, gameState, socket, data));
  socket.on(EVENT_NAMES.MACHINE_REPAIR, (data) => handleMachineRepair(io, gameState, socket, data));
  socket.on(EVENT_NAMES.FUEL_ROD_DELIVER, (data) => handleFuelDelivery(io, gameState, socket, data));
  socket.on(EVENT_NAMES.TASK_ASSIGN, (data) => handleTaskAssignment(io, gameState, socket, data));
  socket.on('disconnect', () => handleDisconnect(io, gameState, socket));
}

function checkSocketRate(socket) {
  const now = Date.now();
  socket.rateWindow = socket.rateWindow.filter((at) => now - at <= 1000);
  socket.rateWindow.push(now);
  return socket.rateWindow.length <= SOCKET_EVENT_LIMIT;
}

function handleRoomCreate(io, gameState, socket, data) {
  const joinData = normalizeJoinData(data);
  const validation = validateJoinData(joinData, false);
  if (!validation.ok) {
    socket.emit(EVENT_NAMES.ROOM_CREATE, { success: false, error: validation.error });
    return;
  }

  const difficulty = data?.difficulty || 'NORMAL';
  const room = gameState.createRoom(undefined, { public: data?.public !== false, difficulty });
  if (!room) {
    socket.emit(EVENT_NAMES.ROOM_CREATE, { success: false, error: 'Failed to create room' });
    return;
  }

  joinRoom(io, gameState, socket, room.id, joinData, EVENT_NAMES.ROOM_CREATE);
}

function handleRoomJoin(io, gameState, socket, data) {
  const joinData = normalizeJoinData(data);
  const validation = validateJoinData(joinData, true);
  if (!validation.ok) {
    socket.emit(EVENT_NAMES.ROOM_JOIN, { success: false, error: validation.error });
    return;
  }

  joinRoom(io, gameState, socket, joinData.roomId, joinData, EVENT_NAMES.ROOM_JOIN);
}

function normalizeJoinData(data) {
  return {
    name: typeof data?.name === 'string' ? data.name.trim() : typeof data?.playerName === 'string' ? data.playerName.trim() : '',
    role: typeof data?.role === 'string' ? data.role.trim().toUpperCase() : '',
    roomId: typeof data?.roomId === 'string'
      ? data.roomId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, GAME_CONFIG.room_code_length)
      : typeof data?.roomCode === 'string'
        ? data.roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, GAME_CONFIG.room_code_length)
        : '',
  };
}

function validateJoinData(data, requireRoom) {
  if (!PLAYER_NAME_PATTERN.test(data.name)) return { ok: false, error: 'Invalid name' };
  if (!VALID_ROLES.has(data.role)) return { ok: false, error: 'Invalid class' };
  if (requireRoom && !ROOM_CODE_PATTERN.test(data.roomId)) return { ok: false, error: 'Invalid room code' };
  return { ok: true };
}

function joinRoom(io, gameState, socket, roomId, data, replyEvent) {
  if (socket.roomId) handleDisconnect(io, gameState, socket);

  const room = gameState.getRoom(roomId);
  if (!room) {
    socket.emit(replyEvent, { success: false, error: 'Room not found' });
    return;
  }

  const player = createPlayer(socket.id, data.name, data.role);
  const result = gameState.addPlayerToRoom(room.id, player);
  if (!result.ok) {
    socket.emit(replyEvent, { success: false, error: result.error });
    return;
  }

  socket.join(room.id);
  socket.roomId = room.id;
  socket.playerId = player.socketId;

  socket.emit(replyEvent, {
    success: true,
    roomId: room.id,
    playerId: player.socketId,
    state: gameState.serializeRoom(room),
  });
  socket.emit(EVENT_NAMES.STATE_SNAPSHOT, gameState.serializeRoom(room));
  sendChatHistory(socket, room);
  io.to(room.id).emit(EVENT_NAMES.PLAYER_JOIN, { success: true, player });
}

function handleReady(io, gameState, socket, data) {
  const room = gameState.getRoom(socket.roomId);
  const player = room?.players.get(socket.id);
  if (!room || !player) return;
  player.ready = Boolean(data?.ready);
  addSystemMessage(room, `${player.name} is ${player.ready ? 'ready' : 'not ready'}.`);
  gameState.broadcastGameState(room.id);
}

function handlePlayerInput(gameState, socket, data) {
  const room = gameState.getRoom(socket.roomId);
  const player = room?.players.get(socket.id);
  if (!room || !player || !room.isRunning) return;

  const input = normalizeInput(data);
  if (!input) {
    registerViolation(socket, player, 'Invalid input packet');
    return;
  }

  if (input.seq <= player.lastProcessedSeq) return;
  if (violatesTeleport(player, input)) {
    registerViolation(socket, player, 'Movement rejected');
    return;
  }

  gameState.queueInput(room.id, player.socketId, input);
}

function normalizeInput(data) {
  if (!data || typeof data !== 'object') return null;
  const seq = Number(data.seq);
  const rawInputs = data.inputs || data;
  const dx = Number(rawInputs.dx ?? rawInputs.x ?? 0);
  const dy = Number(rawInputs.dy ?? rawInputs.y ?? 0);
  const sprint = Boolean(rawInputs.sprint);

  if (!Number.isSafeInteger(seq) || seq < 0) return null;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;

  const magnitude = Math.sqrt(dx * dx + dy * dy);
  if (magnitude > 1.05) return null;

  return { seq, inputs: { dx, dy, sprint } };
}

function violatesTeleport(player, input) {
  const now = Date.now();
  if (!player.lastInputAt) {
    player.lastInputAt = now;
    return false;
  }
  const elapsed = Math.max(0.016, (now - player.lastInputAt) / 1000);
  player.lastInputAt = now;
  const speed = input.inputs.sprint ? 300 : 200;
  return speed > GAME_CONFIG.max_player_speed || elapsed > 2;
}

function registerViolation(socket, player, message) {
  player.violations += 1;
  socket.emit('error', { message });
  if (player.violations >= 5) socket.disconnect(true);
}

function handlePlayerAction(io, gameState, socket, data) {
  const room = gameState.getRoom(socket.roomId);
  const player = room?.players.get(socket.id);
  if (!room || !player || !player.isAlive) return;

  const actionType = typeof data?.actionType === 'string'
    ? data.actionType
    : typeof data?.action === 'string'
      ? data.action
      : '';
  const targetId = typeof data?.targetId === 'string' ? data.targetId : typeof data?.machineId === 'string' ? data.machineId : '';

  switch (actionType) {
    case 'repair':
      startRepairAction(io, gameState, room, player, targetId);
      break;
    case 'deliver':
      handleFuelDelivery(io, gameState, socket, { reactorId: targetId || 'reactor_1' });
      break;
    case 'scram':
      handleReactorScram(io, gameState, socket);
      break;
    case 'ventSteam':
    case 'manualScram':
    case 'evacZone':
      handleEmergencyProtocol(io, gameState, socket, { protocol: actionType });
      break;
    case 'interact':
      emitInteraction(io, room, player, targetId);
      break;
    default:
      socket.emit('error', { message: 'Unknown action' });
  }
}

function startRepairAction(io, gameState, room, player, targetId) {
  if (!canRepair(player)) {
    io.to(player.socketId).emit('error', { message: 'Only PM can repair' });
    return;
  }

  const machine = room.machines.get(targetId);
  if (!machine || !gameState.isWithinRange(player, machine)) {
    io.to(player.socketId).emit('error', { message: 'Machine unavailable' });
    return;
  }

  if (!gameState.lockMachine(room, player, machine) || !startRepair(player, machine)) {
    io.to(player.socketId).emit('error', { message: 'Machine already being repaired' });
    return;
  }

  io.to(room.id).emit(EVENT_NAMES.MACHINE_REPAIR, { playerId: player.socketId, machineId: machine.id, started: true });
}

function emitInteraction(io, room, player, targetId) {
  const machine = room.machines.get(targetId);
  if (!machine) return;
  io.to(player.socketId).emit(EVENT_NAMES.MACHINE_INTERACT, { playerId: player.socketId, machine });
}

function handleDisconnect(io, gameState, socket) {
  const roomId = socket.roomId;
  if (!roomId) return;

  const player = gameState.removePlayerFromRoom(roomId, socket.id);
  if (!player) return;

  io.to(roomId).emit(EVENT_NAMES.PLAYER_LEAVE, { playerId: socket.id, playerName: player.name });
  gameState.broadcastGameState(roomId);
  socket.leave(roomId);
  socket.roomId = null;
  socket.playerId = null;
}
