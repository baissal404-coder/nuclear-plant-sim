export const MACHINE_TYPES = Object.freeze({
  REACTOR: 'REACTOR',
  CONTROL_RODS: 'CONTROL_RODS',
  TURBINE: 'TURBINE',
  GENERATOR: 'GENERATOR',
  PUMP: 'PUMP',
  PIPE: 'PIPE',
  CONDENSER: 'CONDENSER',
});

export const CLASS_TYPES = Object.freeze({
  PLANT_MAINTENANCE: 'PLANT_MAINTENANCE',
  LOGISTICS_OPERATOR: 'LOGISTICS_OPERATOR',
  REACTOR_OPERATOR: 'REACTOR_OPERATOR',
});

export const CLASS_IDS = Object.freeze({
  PM: 'PM',
  LO: 'LO',
  RO: 'RO',
});

export const CLASS_SPAWN_LOCATIONS = Object.freeze({
  PM: 'workshop',
  LO: 'garage',
  RO: 'control_room',
});

export const MACHINE_DEFAULTS = Object.freeze({
  [MACHINE_TYPES.REACTOR]: {
    max_hp: 100,
    max_safe_heat: 500,
    max_heat: 1000,
    heat_generation_rate: 0.8,
    base_power_output: 50,
  },
  [MACHINE_TYPES.CONTROL_RODS]: {
    max_hp: 100,
    rod_count: 50,
    insertion_range: [0, 100],
  },
  [MACHINE_TYPES.PUMP]: {
    max_hp: 100,
    max_speed: 100,
    coolant_removal_rate: 2.0,
  },
  [MACHINE_TYPES.PIPE]: {
    max_hp: 100,
    max_pressure: 100,
    leak_rate: 0.5,
  },
  [MACHINE_TYPES.TURBINE]: {
    max_hp: 100,
    min_steam_pressure: 30,
    max_rpm: 3600,
  },
  [MACHINE_TYPES.GENERATOR]: {
    max_hp: 100,
    min_rpm: 1000,
    max_output_mw: 100,
  },
  [MACHINE_TYPES.CONDENSER]: {
    max_hp: 100,
    max_efficiency: 100,
  },
});

export const TICK_RATE = 60;
export const BROADCAST_RATE = 20;
export const FIXED_TIMESTEP = 1 / 60;

export const GAME_CONFIG = Object.freeze({
  max_players: 8,
  win_duration_minutes: 15,
  starting_fuel_rods: 10,
  max_radiation: 100,
  meltdown_threshold: 950,
  meltdown_arm_seconds: 10,
  meltdown_countdown_seconds: 10,
  blackout_threshold: 0,
  blackout_seconds: 30,
  room_code_length: 6,
  world_width: 1280,
  world_height: 720,
  max_player_speed: 500,
  respawn_seconds: 10,
  radiation_damage_per_second: 1,
});

export const EVENT_NAMES = Object.freeze({
  PLAYER_JOIN: 'player:join',
  PLAYER_LEAVE: 'player:leave',
  PLAYER_READY: 'player:ready',
  PLAYER_MOVE: 'player:move',
  PLAYER_ACTION: 'player:action',
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LIST: 'room:list',
  ROOM_LIST_UPDATE: 'room:list_update',
  STATE_UPDATE: 'state:update',
  STATE_SNAPSHOT: 'state:snapshot',
  CHAT_MESSAGE: 'chat:message',
  CHAT_TEAM: 'chat:team',
  CHAT_SYSTEM: 'chat:system',
  CHAT_HISTORY: 'chat:history',
  MACHINE_REPAIR: 'machine:repair',
  MACHINE_INTERACT: 'machine:interact',
  MACHINE_STATUS: 'machine:status',
  REACTOR_SCRAM: 'reactor:scram',
  REACTOR_CONTROL_RODS: 'reactor:control_rods',
  REACTOR_POWER_LEVEL: 'reactor:power_level',
  PUMP_SPEED_CHANGE: 'pump:speed_change',
  TURBINE_RPM_CHANGE: 'turbine:rpm_change',
  FUEL_ROD_DELIVER: 'fuel_rod:deliver',
  PART_DELIVER: 'part:deliver',
  TASK_ASSIGN: 'task:assign',
  TASK_COMPLETE: 'task:complete',
  TASK_LIST: 'task:list',
  ADMIN_COMMAND: 'admin:command',
  ADMIN_BROADCAST: 'admin:broadcast',
  GAME_START: 'game:start',
  GAME_OVER: 'game:over',
  GAME_WIN: 'game:win',
  RADIATION_LEAK: 'radiation:leak',
  PIPE_LEAK: 'pipe:leak',
  MELTDOWN_WARNING: 'meltdown:warning',
  BLACKOUT_WARNING: 'blackout:warning',
});

export const PLAYER_SPEED = Object.freeze({
  walk: 200,
  sprint: 300,
});

export const TOOL_TYPES = Object.freeze({
  WRENCH: 'WRENCH',
  WELDER: 'WELDER',
  FUEL_ROD: 'FUEL_ROD',
  SPARE_PART: 'SPARE_PART',
});

export const TASK_TYPES = Object.freeze({
  REPAIR_PIPE: 'REPAIR_PIPE',
  REPAIR_PUMP: 'REPAIR_PUMP',
  REPAIR_TURBINE: 'REPAIR_TURBINE',
  REPAIR_GENERATOR: 'REPAIR_GENERATOR',
  DELIVER_FUEL: 'DELIVER_FUEL',
  DELIVER_PART: 'DELIVER_PART',
});

/**
 * Returns the default configuration object for the given machine type.
 * Throws if the type is not recognized.
 * @param {string} type - One of the MACHINE_TYPES values
 * @returns {object} A shallow copy of the default config for that machine type
 */
export const DIFFICULTY = Object.freeze({
  EASY: { decayMultiplier: 0.5, failureRate: 0.3, name: 'Easy' },
  NORMAL: { decayMultiplier: 1.0, failureRate: 1.0, name: 'Normal' },
  HARD: { decayMultiplier: 1.8, failureRate: 2.5, name: 'Hard' },
});

export const COLOR_BLIND_PALETTES = Object.freeze({
  normal: { heat: '#ff9800', power: '#4fc3f7', radiation: '#66bb6a', coolant: '#29b6f6', alarm: '#e94560' },
  deuteranopia: { heat: '#1976d2', power: '#90caf9', radiation: '#424242', coolant: '#00bcd4', alarm: '#ff5252' },
  protanopia: { heat: '#1565c0', power: '#90caf9', radiation: '#616161', coolant: '#00acc1', alarm: '#ff5252' },
  tritanopia: { heat: '#c62828', power: '#4fc3f7', radiation: '#2e7d32', coolant: '#00838f', alarm: '#d50000' },
});

export function getMachineDefaults(type) {
  const defaults = MACHINE_DEFAULTS[type];
  if (!defaults) {
    throw new Error(`Unknown machine type: "${type}". Valid types: ${Object.values(MACHINE_TYPES).join(', ')}`);
  }
  return { ...defaults };
}
