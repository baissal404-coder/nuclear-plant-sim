import { CLASS_IDS, EVENT_NAMES, MACHINE_TYPES } from '../shared/constants.js';
import { handleReactorScram } from './reactorHandlers.js';

const CHAT_LIMIT_PER_SECOND = 5;
const CHAT_VIOLATION_KICK_THRESHOLD = 3;
const CHAT_MAX_LENGTH = 200;
const CHAT_LOG_LIMIT = 100;
const SPAM_WINDOW_MS = 5000;
const BLOCKED_TERMS = [
  'nigger',
  'faggot',
  'kike',
  'retard',
  'tranny',
  'chink',
  'spic',
];

export function setupChat(io, gameState, socket) {
  socket.on(EVENT_NAMES.CHAT_MESSAGE, (data) => handleChat(io, gameState, socket, data, 'global'));
  socket.on(EVENT_NAMES.CHAT_TEAM, (data) => handleChat(io, gameState, socket, data, 'team'));
}

function handleChat(io, gameState, socket, data, fallbackChannel) {
  const room = gameState.getRoom(socket.roomId);
  const player = room?.players.get(socket.id);
  if (!room || !player) {
    socket.emit('error', { message: 'Join a room before chatting.' });
    return;
  }

  const rawMessage = typeof data?.message === 'string' ? data.message : '';
  const channel = data?.channel === 'team' ? 'team' : fallbackChannel;
  const validation = validateMessage(player, rawMessage);
  if (!validation.ok) {
    handleChatViolation(io, gameState, socket, room, player, validation.error);
    return;
  }

  const message = sanitizeMessage(rawMessage);
  if (message.startsWith('/')) {
    handleCommand(io, gameState, socket, room, player, message);
    return;
  }

  const chatMessage = formatChatMessage(player.name, message, channel, player.socketId);
  addRoomMessage(room, chatMessage);
  emitChatMessage(io, room, player, chatMessage);
}

function validateMessage(player, message) {
  if (!message.trim()) return { ok: false, error: 'Empty message' };
  if (message.length > CHAT_MAX_LENGTH) return { ok: false, error: 'Message too long' };

  const now = Date.now();
  player.lastMessages = player.lastMessages.filter((entry) => now - entry.at <= SPAM_WINDOW_MS);
  const recentSecondCount = player.lastMessages.filter((entry) => now - entry.at <= 1000).length;
  if (recentSecondCount >= CHAT_LIMIT_PER_SECOND) return { ok: false, error: 'Chat rate limit exceeded' };

  const normalized = message.trim().toLowerCase();
  if (BLOCKED_TERMS.some((term) => normalized.includes(term))) {
    return { ok: false, error: 'Message blocked by chat filter' };
  }

  const repeatedCount = player.lastMessages.filter((entry) => entry.normalized === normalized).length;
  if (repeatedCount >= 2) return { ok: false, error: 'Repeated message spam' };

  player.lastMessages.push({ normalized, at: now });
  return { ok: true };
}

function handleChatViolation(io, gameState, socket, room, player, reason) {
  player.chatViolations += 1;
  socket.emit('error', { message: reason });

  if (player.chatViolations < CHAT_VIOLATION_KICK_THRESHOLD) return;

  addSystemMessage(room, `${player.name} was kicked for chat spam.`);
  gameState.removePlayerFromRoom(room.id, player.socketId);
  socket.emit(EVENT_NAMES.PLAYER_LEAVE, { reason: 'Chat spam' });
  socket.disconnect(true);
}

function handleCommand(io, gameState, socket, room, player, message) {
  const [command, ...args] = message.slice(1).split(/\s+/);
  const lowerCommand = command.toLowerCase();

  switch (lowerCommand) {
    case 'help':
      sendDirectSystem(socket, 'Commands: /help, /status, /tasks, /pm <msg>, /scram, /where <name>, /radiation, /turbines');
      break;
    case 'status':
      sendDirectSystem(socket, formatStatus(room));
      break;
    case 'tasks':
      sendDirectSystem(socket, formatTasks(player));
      break;
    case 'pm':
      handlePrivateMessage(io, room, player, args.join(' '));
      break;
    case 'scram':
      handleReactorScram(io, gameState, socket);
      break;
    case 'where':
      handleWhere(room, socket, args.join(' '));
      break;
    case 'radiation': {
      const reactor = [...room.machines.values()].find((m) => m.type === MACHINE_TYPES.REACTOR);
      const lvl = Math.round(room.radiationLevel);
      const heat = reactor ? Math.round(reactor.state.heat) : 0;
      sendDirectSystem(socket, `Radiation: ${lvl}/100 | Zones: ${room.radiationZones.length} | Reactor heat: ${heat}°C`);
      break;
    }
    case 'turbines': {
      const turbines = [...room.machines.values()].filter((m) => m.type === MACHINE_TYPES.TURBINE);
      const lines = turbines.map(t => `${t.id}: ${Math.round(t.state.rpm)} RPM | Temp: ${Math.round(t.state.temperature)}°C`);
      sendDirectSystem(socket, lines.join('\n') || 'No turbines online');
      break;
    }
    default:
      sendDirectSystem(socket, `Unknown command: /${command}`);
  }
}

function handlePrivateMessage(io, room, sender, rawText) {
  const message = sanitizeMessage(rawText);
  if (!message) return;

  const chatMessage = formatChatMessage(sender.name, message, 'team', sender.socketId);
  for (const [playerId, teammate] of room.players) {
    if (teammate.role === sender.role) {
      io.to(playerId).emit(EVENT_NAMES.CHAT_TEAM, chatMessage);
    }
  }
}

function formatStatus(room) {
  const reactor = [...room.machines.values()].find((machine) => machine.type === MACHINE_TYPES.REACTOR);
  const heatPercent = reactor ? Math.round((reactor.state.heat / 1000) * 100) : 0;
  return `Heat ${heatPercent}% | MW ${Math.round(room.totalOutput)} | Radiation ${Math.round(room.radiationLevel)} | Players ${room.players.size}`;
}

function formatTasks(player) {
  if (!player.assignedTasks.length) return 'No assigned tasks.';
  return player.assignedTasks.map((task) => `${task.type} ${task.targetId}`).join(', ');
}

function handleWhere(room, socket, name) {
  if (!name) { sendDirectSystem(socket, 'Usage: /where <player name>'); return; }
  const target = [...room.players.values()].find(p => p.name.toLowerCase().includes(name.toLowerCase()));
  if (!target) { sendDirectSystem(socket, `Player "${name}" not found`); return; }
  sendDirectSystem(socket, `${target.name} (${target.role}) at (${Math.round(target.position.x)}, ${Math.round(target.position.y)}) | HP: ${Math.round(target.hp)} | ${target.isAlive ? 'Alive' : 'Dead (respawning)'}`);
}

function sendDirectSystem(socket, message) {
  socket.emit(EVENT_NAMES.CHAT_SYSTEM, formatChatMessage('System', message, 'system'));
}

function emitChatMessage(io, room, sender, chatMessage) {
  if (chatMessage.type === 'team') {
    for (const [playerId, teammate] of room.players) {
      if (teammate.role === sender.role) io.to(playerId).emit(EVENT_NAMES.CHAT_TEAM, chatMessage);
    }
    return;
  }

  io.to(room.id).emit(EVENT_NAMES.CHAT_MESSAGE, chatMessage);
}

export function sendSystemMessage(io, roomId, message, gameState = null) {
  if (!io || !roomId || !message) return null;

  const room = gameState?.getRoom(roomId) || null;
  const formattedMessage = formatChatMessage('System', sanitizeMessage(message), 'system');
  if (room) addRoomMessage(room, formattedMessage);
  io.to(roomId).emit(EVENT_NAMES.CHAT_SYSTEM, formattedMessage);
  return formattedMessage;
}

export function addSystemMessage(room, message) {
  if (!room || !message) return null;
  const formattedMessage = formatChatMessage('System', sanitizeMessage(message), 'system');
  addRoomMessage(room, formattedMessage);
  return formattedMessage;
}

export function addRoomMessage(room, message) {
  room.chatLog.push(message);
  if (room.chatLog.length > CHAT_LOG_LIMIT) {
    room.chatLog.splice(0, room.chatLog.length - CHAT_LOG_LIMIT);
  }
}

export function sanitizeMessage(message) {
  return String(message)
    .slice(0, CHAT_MAX_LENGTH)
    .replace(/<[^>]*>/g, '')
    .replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]))
    .trim();
}

export function formatChatMessage(sender, message, type, playerId = null) {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sender: sanitizeMessage(sender),
    playerId,
    message: sanitizeMessage(message),
    type,
    timestamp: Date.now(),
  };
}

export function sendChatHistory(socket, room) {
  socket.emit(EVENT_NAMES.CHAT_HISTORY, room.chatLog);
}
