import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLASS_IDS, GAME_CONFIG, MACHINE_TYPES } from '../shared/constants.js';
import { sanitizeMessage } from './chat.js';
import { GameState } from './gameState.js';
import { calculateSteamPressure, updatePlant } from './plantPhysics.js';
import { createPlayer } from './player.js';
import { handleAdminCommand } from './admin.js';

function createStateWithRoom() {
  const state = new GameState();
  const emitted = [];
  state.setIo({
    to: () => ({ emit: (...args) => emitted.push(args) }),
    emit: (...args) => emitted.push(args),
    sockets: { sockets: new Map() },
  });
  const room = state.createRoom('ABC123');
  return { state, room, emitted };
}

test('plant physics keeps turbine and generator values finite', () => {
  const { room } = createStateWithRoom();

  for (let i = 0; i < 180; i++) updatePlant(room, 1 / 60);

  const turbine = room.machines.get('turbine_1');
  const generator = room.machines.get('generator_1');
  assert.equal(Number.isFinite(turbine.state.rpm), true);
  assert.equal(Number.isFinite(generator.state.outputMW), true);
  assert.ok(calculateSteamPressure([...room.machines.values()].filter((m) => m.type === MACHINE_TYPES.PIPE)) >= 0);
});

test('room enforces max 8 players and serializes player readiness', () => {
  const { state, room } = createStateWithRoom();

  for (let i = 0; i < GAME_CONFIG.max_players; i++) {
    const player = createPlayer(`p${i}`, `Player${i}`, CLASS_IDS.PM);
    assert.equal(state.addPlayerToRoom(room.id, player).ok, true);
  }

  const extra = createPlayer('extra', 'Extra', CLASS_IDS.LO);
  assert.equal(state.addPlayerToRoom(room.id, extra).ok, false);
  room.players.get('p0').ready = true;
  assert.equal(state.serializeRoom(room).players.find((player) => player.id === 'p0').ready, true);
});

test('radiation zones damage, kill, and respawn players', () => {
  const { state, room } = createStateWithRoom();
  const player = createPlayer('rad', 'Rad Tech', CLASS_IDS.PM);
  state.addPlayerToRoom(room.id, player);

  const reactor = room.machines.get('reactor_1');
  reactor.state.heat = 900;
  player.position = { x: reactor.x, y: reactor.y };

  state.updateScoreAndHazards(room, 1);
  state.updatePlayerStatus(room, 100);
  assert.equal(player.isAlive, false);

  state.updatePlayerStatus(room, GAME_CONFIG.respawn_seconds + 0.1);
  assert.equal(player.isAlive, true);
  assert.equal(player.hp, 100);
});

test('meltdown countdown can be armed and resolved to defeat', () => {
  const { state, room } = createStateWithRoom();
  const player = createPlayer('test', 'Tester', CLASS_IDS.PM);
  room.players.set(player.socketId, player);
  room.inputQueues.set(player.socketId, []);
  room.graceActive = false;
  room.gamePhase = 'playing';
  room.isRunning = true;
  const reactor = room.machines.get('reactor_1');
  reactor.state.heat = 1000;
  reactor.state.controlRodInsertion = 0;
  for (const machine of room.machines.values()) {
    if (machine.type === MACHINE_TYPES.PUMP) machine.state.speed = 0;
  }

  for (let i = 0; i < (GAME_CONFIG.meltdown_arm_seconds + GAME_CONFIG.meltdown_countdown_seconds + 1) * 60; i++) {
    state.updateRoom(room.id, 1 / 60);
  }

  assert.equal(room.gamePhase, 'lost');
  assert.equal(room.meltdownOccurred, true);
});

test('chat sanitizer strips tags and escapes entities', () => {
  assert.equal(sanitizeMessage('<img src=x onerror=1>&"'), '&amp;&quot;');
});

test('admin commands mutate server-owned state', () => {
  const { state, room } = createStateWithRoom();
  const player = createPlayer('admin_target', 'Admin Target', CLASS_IDS.PM);
  state.addPlayerToRoom(room.id, player);

  handleAdminCommand('set reactor_1 hp=0', state.io, state);
  assert.equal(room.machines.get('reactor_1').hp, 0);

  handleAdminCommand('set admin_target class=RO', state.io, state);
  assert.equal(player.role, CLASS_IDS.RO);

  handleAdminCommand('tp admin_target 10 20', state.io, state);
  assert.deepEqual(player.position, { x: 10, y: 20 });
});
