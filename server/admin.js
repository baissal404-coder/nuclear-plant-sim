import readline from 'readline';
import { CLASS_IDS, EVENT_NAMES, MACHINE_TYPES } from '../shared/constants.js';
import { sendSystemMessage, sanitizeMessage } from './chat.js';

const TEMP_BAN_MS = 5 * 60 * 1000;

export function setupAdmin(io, gameState, socket = null) {
  if (socket) return;
  setupStdinAdmin(io, gameState);
}

function setupStdinAdmin(io, gameState) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '[Admin] ',
  });

  console.log('[Admin] Server admin ready. Type "help" for commands.');
  rl.on('line', (input) => {
    const trimmed = input.trim();
    if (trimmed) handleAdminCommand(trimmed, io, gameState);
    rl.prompt();
  });
}

export function handleAdminCommand(command, io, gameState) {
  const [cmd = '', ...args] = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const normalizedArgs = args.map((arg) => arg.replace(/^"|"$/g, ''));

  switch (cmd.toLowerCase()) {
    case 'help':
      showHelp();
      break;
    case 'kick':
      kickPlayer(io, gameState, normalizedArgs[0], false);
      break;
    case 'ban':
      kickPlayer(io, gameState, normalizedArgs[0], true);
      break;
    case 'set':
      setValue(io, gameState, normalizedArgs);
      break;
    case 'tp':
      teleportPlayer(io, gameState, normalizedArgs);
      break;
    case 'announce':
      announce(io, gameState, normalizedArgs.join(' '));
      break;
    case 'status':
      dumpStatus(gameState);
      break;
    case 'rooms':
    case 'list':
      listRooms(gameState);
      break;
    case 'crash':
      triggerMeltdown(io, gameState);
      break;
    default:
      console.log(`[Admin] Unknown command: "${cmd}". Type "help" for commands.`);
  }
}

function showHelp() {
  console.log('[Admin] Commands:');
  console.log('  kick <playerId>              - Disconnect and temp-ban for 5 minutes');
  console.log('  ban <playerId>               - Permanently ban player id');
  console.log('  set <machineId> hp=0|100     - Force machine break/fix');
  console.log('  set <playerId> class=PM|LO|RO - Change player class');
  console.log('  tp <playerId> <x> <y>        - Teleport player');
  console.log('  announce <msg>               - Broadcast system chat to all rooms');
  console.log('  status                       - Dump plant state');
  console.log('  rooms                        - List active rooms');
  console.log('  crash                        - Trigger debug meltdown');
}

function kickPlayer(io, gameState, playerId, permanent) {
  if (!playerId) {
    console.log(`[Admin] Usage: ${permanent ? 'ban' : 'kick'} <playerId>`);
    return;
  }

  const found = findPlayer(gameState, playerId);
  if (!found) {
    console.log(`[Admin] Player ${playerId} not found`);
    return;
  }

  if (permanent) {
    gameState.permanentBans.add(playerId);
  } else {
    gameState.tempBans.set(playerId, Date.now() + TEMP_BAN_MS);
  }

  gameState.removePlayerFromRoom(found.room.id, playerId);
  const socket = io.sockets.sockets.get(playerId);
  socket?.emit(EVENT_NAMES.PLAYER_LEAVE, { reason: permanent ? 'Banned by admin' : 'Kicked by admin' });
  socket?.disconnect(true);
  console.log(`[Admin] ${permanent ? 'Banned' : 'Kicked'} ${found.player.name} (${playerId})`);
}

function setValue(io, gameState, args) {
  const [targetId, assignment] = args;
  if (!targetId || !assignment?.includes('=')) {
    console.log('[Admin] Usage: set <machineId> hp=0|100 OR set <playerId> class=PM|LO|RO');
    return;
  }

  const [key, value] = assignment.split('=');
  if (key === 'hp') {
    setMachineHp(io, gameState, targetId, Number(value));
    return;
  }

  if (key === 'class') {
    setPlayerClass(io, gameState, targetId, value);
    return;
  }

  console.log(`[Admin] Unsupported setter: ${key}`);
}

function setMachineHp(io, gameState, machineId, hp) {
  if (!Number.isFinite(hp)) {
    console.log('[Admin] HP must be a number');
    return;
  }

  for (const room of gameState.rooms.values()) {
    const machine = room.machines.get(machineId);
    if (!machine) continue;
    gameState.setMachineHp(machine, hp);
    sendSystemMessage(io, room.id, `Admin set ${machineId} HP to ${machine.hp}`, gameState);
    gameState.broadcastGameState(room.id);
    console.log(`[Admin] ${machineId} HP = ${machine.hp}`);
    return;
  }
  console.log(`[Admin] Machine ${machineId} not found`);
}

function setPlayerClass(io, gameState, playerId, role) {
  if (!Object.values(CLASS_IDS).includes(role)) {
    console.log('[Admin] Class must be PM, LO, or RO');
    return;
  }

  const found = findPlayer(gameState, playerId);
  if (!found) {
    console.log(`[Admin] Player ${playerId} not found`);
    return;
  }

  found.player.role = role;
  sendSystemMessage(io, found.room.id, `Admin changed ${found.player.name} to ${role}`, gameState);
  gameState.broadcastGameState(found.room.id);
  console.log(`[Admin] ${found.player.name} class = ${role}`);
}

function teleportPlayer(io, gameState, args) {
  const [playerId, xText, yText] = args;
  const x = Number(xText);
  const y = Number(yText);
  const found = findPlayer(gameState, playerId);
  if (!found || !Number.isFinite(x) || !Number.isFinite(y)) {
    console.log('[Admin] Usage: tp <playerId> <x> <y>');
    return;
  }

  found.player.position = { x: Math.max(0, Math.min(1280, x)), y: Math.max(0, Math.min(720, y)) };
  found.player.velocity = { x: 0, y: 0 };
  gameState.broadcastGameState(found.room.id);
  console.log(`[Admin] Teleported ${found.player.name} to ${found.player.position.x}, ${found.player.position.y}`);
}

function announce(io, gameState, message) {
  const safeMessage = sanitizeMessage(message);
  if (!safeMessage) {
    console.log('[Admin] Usage: announce <msg>');
    return;
  }

  for (const room of gameState.rooms.values()) {
    sendSystemMessage(io, room.id, safeMessage, gameState);
  }
  console.log(`[Admin] Announced: ${safeMessage}`);
}

export function listRooms(gameState) {
  if (gameState.rooms.size === 0) {
    console.log('[Admin] No active rooms');
    return;
  }

  for (const room of gameState.rooms.values()) {
    const players = [...room.players.values()].map((player) => `${player.name}/${player.role}/${player.hp.toFixed(0)}hp`).join(', ');
    console.log(`[Admin] ${room.id}: ${room.players.size}/8 ${room.gamePhase} MW=${room.totalOutput.toFixed(1)} rad=${room.radiationLevel.toFixed(1)}`);
    if (players) console.log(`  ${players}`);
  }
}

function dumpStatus(gameState) {
  for (const room of gameState.rooms.values()) {
    console.log(`[Admin] Room ${room.id}`);
    console.log(JSON.stringify(gameState.serializeRoom(room), null, 2));
  }
}

function triggerMeltdown(io, gameState) {
  for (const room of gameState.rooms.values()) {
    const reactor = [...room.machines.values()].find((machine) => machine.type === MACHINE_TYPES.REACTOR);
    if (!reactor) continue;
    reactor.state.heat = 1000;
    reactor.state.meltdown = true;
    room.meltdownOccurred = true;
    sendSystemMessage(io, room.id, 'Admin triggered debug meltdown.', gameState);
    gameState.endGame(room.id, 'lose', 'Debug meltdown.');
  }
  console.log('[Admin] Debug meltdown triggered.');
}

function findPlayer(gameState, playerId) {
  for (const room of gameState.rooms.values()) {
    const player = room.players.get(playerId);
    if (player) return { room, player };
  }
  return null;
}
