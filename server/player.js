import {
  CLASS_IDS,
  GAME_CONFIG,
  PLAYER_SPEED,
  TOOL_TYPES,
} from '../shared/constants.js';

export class Player {
  constructor(socketId, name, role) {
    this.socketId = socketId;
    this.name = name;
    this.role = role;
    this.position = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.hp = 100;
    this.speed = PLAYER_SPEED.walk;
    this.currentTool = null;
    this.assignedTasks = [];
    this.isInVehicle = false;
    this.isRepairing = false;
    this.repairProgress = 0;
    this.repairTarget = null;
    this.lastAction = null;
    this.spawnPosition = { x: 0, y: 0 };
    this.isAlive = true;
    this.respawnTimer = 0;
    this.interactionRadius = 50;
    this.ready = false;
    this.lastProcessedSeq = 0;
    this.lastInputAt = 0;
    this.violations = 0;
    this.chatViolations = 0;
    this.lastMessages = [];
    this.evacuatedFromRadiation = false;
  }
}

export function createPlayer(socketId, name, role) {
  const validRoles = [CLASS_IDS.PM, CLASS_IDS.LO, CLASS_IDS.RO];
  if (!validRoles.includes(role)) return null;

  const player = new Player(socketId, name, role);
  setSpawnPosition(player);
  return player;
}

function setSpawnPosition(player) {
  const spawnPositions = {
    [CLASS_IDS.PM]: { x: 100, y: 600 },
    [CLASS_IDS.LO]: { x: 100, y: 400 },
    [CLASS_IDS.RO]: { x: 700, y: 200 },
  };
  player.position = { ...spawnPositions[player.role] };
  player.spawnPosition = { ...spawnPositions[player.role] };
}

export function getPlayerRole(player) {
  return player ? player.role : null;
}

export function canRepair(player) {
  return player && player.role === CLASS_IDS.PM && !player.isRepairing && player.isAlive;
}

export function canDrive(player) {
  return player && player.role === CLASS_IDS.LO && !player.isInVehicle && player.isAlive;
}

export function canControlReactor(player) {
  return player && player.role === CLASS_IDS.RO && player.isAlive;
}

export function startRepair(player, machine) {
  if (!canRepair(player)) return false;
  if (!machine || machine.hp >= machine.maxHp) return false;

  player.isRepairing = true;
  player.repairProgress = 0;
  player.repairTarget = machine.id;
  player.lastAction = { type: 'repair', target: machine.id, timestamp: Date.now() };
  return true;
}

export function updateRepair(player, dt, repairRate = 25) {
  if (!player.isRepairing || !player.repairTarget) return false;

  player.repairProgress += dt * repairRate;

  if (player.repairProgress >= 100) {
    return true;
  }
  return false;
}

export function completeRepair(player, machine) {
  if (!player.isRepairing || !machine) return null;

  const repairAmount = 25;
  const previousHp = machine.hp;
  machine.hp = Math.min(machine.maxHp, machine.hp + repairAmount);

  player.isRepairing = false;
  player.repairProgress = 0;
  player.repairTarget = null;
  player.lastAction = { type: 'repair_complete', target: machine.id, timestamp: Date.now() };

  return {
    machineId: machine.id,
    hpBefore: previousHp,
    hpAfter: machine.hp,
    repaired: machine.hp >= machine.maxHp,
  };
}

export function assignTask(player, task) {
  if (!player || !task) return false;
  if (player.assignedTasks.length >= 5) return false;

  const existingTask = player.assignedTasks.find((t) => t.id === task.id);
  if (existingTask) return false;

  player.assignedTasks.push({
    id: task.id,
    type: task.type,
    targetId: task.targetId,
    assignedAt: Date.now(),
    isComplete: false,
  });
  return true;
}

export function removeTask(player, taskId) {
  if (!player) return false;

  const taskIndex = player.assignedTasks.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) return false;

  player.assignedTasks.splice(taskIndex, 1);
  return true;
}

export function serializePlayer(player) {
  return {
    id: player.socketId,
    name: player.name,
    role: player.role,
    position: { ...player.position },
    velocity: { ...player.velocity },
    hp: player.hp,
    currentTool: player.currentTool,
    assignedTasks: player.assignedTasks.map((t) => ({ ...t })),
    isInVehicle: player.isInVehicle,
    isRepairing: player.isRepairing,
    repairProgress: player.repairProgress,
    isAlive: player.isAlive,
    respawnTimer: player.respawnTimer,
    ready: player.ready,
    lastProcessedSeq: player.lastProcessedSeq,
    lastAction: player.lastAction ? { ...player.lastAction } : null,
  };
}

export function movePlayer(player, dx, dy, dt, speed = player.speed) {
  if (!player || !player.isAlive) return false;

  const magnitude = Math.sqrt(dx * dx + dy * dy);
  if (magnitude === 0) return false;

  const normalizedDx = dx / magnitude;
  const normalizedDy = dy / magnitude;

  const moveX = normalizedDx * speed * dt;
  const moveY = normalizedDy * speed * dt;

  const bounds = { minX: 0, maxX: GAME_CONFIG.world_width, minY: 0, maxY: GAME_CONFIG.world_height };
  player.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, player.position.x + moveX));
  player.position.y = Math.max(bounds.minY, Math.min(bounds.maxY, player.position.y + moveY));
  player.velocity = { x: normalizedDx * speed, y: normalizedDy * speed };

  player.lastAction = { type: 'move', timestamp: Date.now() };
  return true;
}

export function damagePlayer(player, amount) {
  if (!player || !player.isAlive) return false;

  player.hp = Math.max(0, player.hp - amount);

  if (player.hp <= 0) {
    player.isAlive = false;
    player.velocity = { x: 0, y: 0 };
    player.respawnTimer = GAME_CONFIG.respawn_seconds;
    player.lastAction = { type: 'death', timestamp: Date.now() };
  }

  return player.isAlive;
}

export function respawnPlayer(player) {
  if (!player || player.isAlive) return false;

  player.isAlive = true;
  player.hp = 100;
  player.position = { ...player.spawnPosition };
  player.velocity = { x: 0, y: 0 };
  player.isRepairing = false;
  player.repairProgress = 0;
  player.repairTarget = null;
  player.lastAction = { type: 'respawn', timestamp: Date.now() };
  return true;
}
