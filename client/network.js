import { EVENT_NAMES } from '../shared/constants.js';

export class NetworkManager {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.playerId = null;
    this.roomId = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.lastJoin = null;
  }

  async connect(url) {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(url, {
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: this.maxReconnectAttempts,
        });

        this.socket.on('connect', () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          if (this.lastJoin) {
            this.emit(this.lastJoin.event, this.lastJoin.payload);
          }
          resolve();
        });

        this.socket.on('disconnect', (reason) => {
          this.connected = false;
          this.emitLocal('disconnect', { reason });
          const ro = document.getElementById('reconnect-overlay');
          if (ro && reason !== 'io server disconnect') ro.style.display = 'flex';
        });

        this.socket.on('connect', () => {
          const ro = document.getElementById('reconnect-overlay');
          if (ro) ro.style.display = 'none';
        });

        this.socket.on('connect_error', (err) => {
          this.reconnectAttempts++;
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            reject(new Error('Failed to connect after max attempts'));
          }
        });

        // Register all stored listeners
        this.listeners.forEach((callback, event) => {
          this.socket.on(event, callback);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  on(event, callback) {
    this.listeners.set(event, callback);
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  emit(event, data) {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
    }
  }

  emitLocal(event, data) {
    this.listeners.forEach((callback, key) => {
      if (key === event) callback(data);
    });
  }

  joinRoom(roomId, playerName, role) {
    this.roomId = roomId;
    const payload = {
      roomId,
      name: playerName,
      role,
    };
    this.lastJoin = { event: EVENT_NAMES.ROOM_JOIN, payload };
    this.emit(EVENT_NAMES.ROOM_JOIN, payload);
  }

  createRoom(playerName, role, isPublic = true, difficulty = 'NORMAL') {
    const payload = {
      name: playerName,
      role,
      public: isPublic,
      difficulty,
    };
    this.lastJoin = { event: EVENT_NAMES.ROOM_CREATE, payload };
    this.emit(EVENT_NAMES.ROOM_CREATE, payload);
  }

  sendMovement(input) {
    this.emit(EVENT_NAMES.PLAYER_MOVE, input);
  }

  sendAction(action, data = {}) {
    this.emit(EVENT_NAMES.PLAYER_ACTION, { action, ...data });
  }

  sendChat(message, type = 'global') {
    const event = type === 'team' ? EVENT_NAMES.CHAT_TEAM : EVENT_NAMES.CHAT_MESSAGE;
    this.emit(event, { message, type });
  }

  sendReactorCommand(command, data = {}) {
    this.emit(command, data);
  }

  sendRepairCommand(machineId) {
    this.emit(EVENT_NAMES.MACHINE_REPAIR, { machineId });
  }

  sendFuelDelivery(fuelData) {
    this.emit(EVENT_NAMES.FUEL_ROD_DELIVER, fuelData);
  }

  onStateUpdate(callback) {
    this._stateCache = null;
    this.on(EVENT_NAMES.STATE_UPDATE, (state) => {
      if (!state) return;
      if (!state.players || !state.machines) {
        if (this._stateCache) {
          for (const key of Object.keys(state)) {
            if (key === 'players' && state.players) {
              for (const p of state.players) {
                const idx = this._stateCache.players.findIndex(x => x.id === p.id);
                if (idx >= 0) this._stateCache.players[idx] = p;
                else this._stateCache.players.push(p);
              }
            } else if (key === 'machines' && state.machines) {
              for (const m of state.machines) {
                const idx = this._stateCache.machines.findIndex(x => x.id === m.id);
                if (idx >= 0) this._stateCache.machines[idx] = m;
                else this._stateCache.machines.push(m);
              }
            } else {
              this._stateCache[key] = state[key];
            }
          }
          callback(this._stateCache);
        }
        return;
      }
      this._stateCache = state;
      callback(state);
    });
    this.on(EVENT_NAMES.STATE_SNAPSHOT, (state) => {
      this._stateCache = state;
      callback(state);
    });
  }

  onChatMessage(callback) {
    this.on(EVENT_NAMES.CHAT_MESSAGE, callback);
    this.on(EVENT_NAMES.CHAT_TEAM, callback);
    this.on(EVENT_NAMES.CHAT_SYSTEM, callback);
    this.on(EVENT_NAMES.CHAT_HISTORY, (messages) => messages.forEach(callback));
  }

  onNotification(callback) {
    this.on(EVENT_NAMES.RADIATION_LEAK, callback);
    this.on(EVENT_NAMES.MELTDOWN_WARNING, callback);
    this.on(EVENT_NAMES.BLACKOUT_WARNING, callback);
    this.on(EVENT_NAMES.GAME_OVER, callback);
    this.on(EVENT_NAMES.GAME_WIN, callback);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.playerId = null;
      this.roomId = null;
    }
  }

  isConnected() {
    return this.connected;
  }
}

export const networkManager = new NetworkManager();
