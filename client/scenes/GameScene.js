import { CLASS_IDS, EVENT_NAMES, GAME_CONFIG, MACHINE_TYPES } from '../../shared/constants.js';
import { networkManager } from '../network.js';
import { ParticlePool, createSteamPipeEmitter } from '../particles.js';
import { TooltipUI } from '../ui/TooltipUI.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { TutorialUI } from '../ui/TutorialUI.js';
import { MobileInput } from '../ui/MobileInput.js';
import { playerStats, achievements } from '../stats.js';
import { audioManager } from '../main.js';
import strings from '../../shared/strings.js';

const ROLE_COLORS = {
  [CLASS_IDS.PM]: 0x4fc3f7, [CLASS_IDS.LO]: 0x66bb6a, [CLASS_IDS.RO]: 0xffb74d,
};
const ROLE_NAMES = {
  [CLASS_IDS.PM]: strings.ROLES.PM, [CLASS_IDS.LO]: strings.ROLES.LO, [CLASS_IDS.RO]: strings.ROLES.RO,
};

const MACHINE_TEXTURE_MAP = {
  [MACHINE_TYPES.REACTOR]: 'machine_reactor',
  [MACHINE_TYPES.CONTROL_RODS]: 'machine_control_rods',
  [MACHINE_TYPES.TURBINE]: 'machine_turbine',
  [MACHINE_TYPES.GENERATOR]: 'machine_generator',
  [MACHINE_TYPES.PUMP]: 'machine_pump',
  [MACHINE_TYPES.PIPE]: 'machine_pipe',
  [MACHINE_TYPES.CONDENSER]: 'machine_condenser',
};

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Game' });
    this.playerName = ''; this.playerRole = ''; this.playerId = ''; this.roomCode = '';
    this.localPlayer = null; this.playerSprites = new Map();
    this.machines = new Map(); this.latestState = null;
    this.serverTargets = new Map(); this.pendingInputs = [];
    this.inputSeq = 0; this.moveSpeed = 200;
    this.chatOpen = false; this.chatChannel = 'global'; this.chatDraft = '';
    this.chatMessages = []; this.scoreboardOpen = false;
    this.pool = null; this.tooltip = null; this.pauseMenu = null;
    this.tutorial = null; this.mobileInput = null;
    this.pipeEmitters = []; this.glowSprites = [];
    this.turbineSprites = []; this.generatorFlicker = 0;
    this._sessionTime = 0;
  }

  create(data) {
    this.playerName = data.playerName || 'Operator';
    this.playerRole = data.role || CLASS_IDS.PM;
    this.playerId = data.playerId || networkManager.playerId;
    this.roomCode = data.roomCode || networkManager.roomId;
    this.difficulty = data.difficulty || 'NORMAL';

    this.cameras.main.fadeIn(500, 10, 10, 20);
    this.cameras.main.setBackgroundColor('#0a0a14');

    this.pool = new ParticlePool(this);
    this.tooltip = new TooltipUI(this);
    this.tooltip.create();
    this.pauseMenu = new PauseMenu(this);
    this.pauseMenu.create();
    this.tutorial = new TutorialUI(this);
    this.mobileInput = new MobileInput(this);
    this.mobileInput.create();

    this._sessionTime = 0;
    this._meltdownWarned = false;
    this._lastScramCheck = false;
    this._graceOver = false;

    this.createTilemap();
    this.createMachines();
    this.createLocalPlayer();
    this.createHUD();
    this.createChatUI();
    this.createScoreboard();
    this.createRadiationOverlay();
    this.setupInput();
    this.setupNetworkListeners();

    if (data.initialState) this.applyState(data.initialState, true);

    this.showNotification(`Room ${this.roomCode} | ${ROLE_NAMES[this.playerRole]}`, 3000);

    if (this.tutorial.shouldShow()) {
      this.time.delayedCall(1000, () => this.tutorial.show());
    }
  }

  setupNetworkListeners() {
    networkManager.onStateUpdate((state) => this.applyState(state));
    networkManager.onChatMessage((message) => this.addChatMessage(message));
    networkManager.onNotification((event) => {
      if (event?.seconds) {
        this.showNotification(`Meltdown in ${event.seconds}s`, 3500);
        this.cameras.main.shake(200, event.seconds <= 5 ? 0.02 : 0.008);
        audioManager.play('alarm_meltdown', 0.6);
        this._meltdownWarned = true;
      } else {
        this.showNotification(event?.reason || 'Plant event', 3500);
      }
    });
    networkManager.on(EVENT_NAMES.PLAYER_LEAVE, (d) => this.showNotification(`${d.playerName || 'Player'} left`, 2500));
    networkManager.on(EVENT_NAMES.REACTOR_SCRAM, () => {
      this.showNotification('SCRAM ACTIVATED', 3000);
      audioManager.play('scram', 0.7);
    });
    networkManager.on(EVENT_NAMES.MACHINE_REPAIR, (d) => {
      if (d?.started) audioManager.play('repair_grind', 0.3);
      if (d?.result) audioManager.play('repair_grind', 0.4);
    });
    networkManager.on(EVENT_NAMES.FUEL_ROD_DELIVER, () => audioManager.play('fuel_clunk', 0.5));
    networkManager.on(EVENT_NAMES.GAME_OVER, (d) => {
      this.showNotification('GAME OVER - Meltdown', 5000);
      audioManager.play('explosion', 0.8);
      this.cameras.main.shake(1000, 0.03);
      this.time.delayedCall(2000, () => this.showGameOver('Reactor meltdown', 'lose'));
    });
    networkManager.on(EVENT_NAMES.GAME_WIN, (d) => {
      this.showNotification('VICTORY! Plant sustained!', 5000);
      this.time.delayedCall(2000, () => this.showGameOver('Plant online for full shift', 'win'));
    });
    networkManager.on('disconnect', () => {
      this.showNotification(strings.ERRORS.connection_lost, 6000);
    });
  }

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,E,T,TAB,ENTER,BACKSPACE,V,R,F');
    this.keys.SHIFT = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    this.input.keyboard.on('keydown', (event) => this.handleKeyboard(event));
  }

  handleKeyboard(event) {
    if (this.chatOpen) { this.handleChatKey(event); return; }
    if (event.key === 'Escape') { this.pauseMenu.toggle(); return; }
    if (event.key === 't' || event.key === 'T') { this.toggleChat(true); return; }
    if (event.key === 'Tab') { event.preventDefault(); this.scoreboardOpen = true; this.scoreboardContainer.setVisible(true); return; }
    if (event.key === 'e' || event.key === 'E') this.handleInteraction();
    if (event.key === 'v' || event.key === 'V') networkManager.sendAction('ventSteam');
    if (event.key === 'r' || event.key === 'R') { networkManager.sendAction('manualScram'); audioManager.play('button_click', 0.5); }
    if (event.key === 'f' || event.key === 'F') networkManager.sendAction('evacZone');
  }

  handleChatKey(event) {
    if (event.key === 'Escape') { this.toggleChat(false); return; }
    if (event.key === 'Tab') { event.preventDefault(); this.chatChannel = this.chatChannel === 'global' ? 'team' : this.chatChannel === 'team' ? 'system' : 'global'; this.updateChatInput(); return; }
  }

  update(time, delta) {
    const dt = delta / 1000;
    this._sessionTime += dt;

    this.processMovement(dt);
    this.interpolateRemotePlayers(dt);
    this.updateMachineVisuals(dt);
    this.updateParticles(dt);
    this.updateHUD();
    this.updateScoreboard();
    this.updateRadiationOverlay(dt);
    this.tooltip.hide();

    if (this.mobileInput.active) {
      const m = this.mobileInput.getMovement();
      if (m.dx !== 0 || m.dy !== 0) this._mobileMove(m);
    }

    // Check for graceful period end
    if (this.latestState && this.latestState.gameTime > 30 && !this._graceOver) {
      this._graceOver = true;
      this.showNotification('Grace period ended. Stay vigilant!', 3000);
    }
  }

  processMovement(dt) {
    if (!this.localPlayer || this.chatOpen) return;
    let dx = 0, dy = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) dx += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) dy += 1;

    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) { dx /= len; dy /= len; }

    const isMoving = len > 0;
    this.localPlayer.x = Phaser.Math.Clamp(this.localPlayer.x + dx * this.moveSpeed * dt, 0, GAME_CONFIG.world_width);
    this.localPlayer.y = Phaser.Math.Clamp(this.localPlayer.y + dy * this.moveSpeed * dt, 0, GAME_CONFIG.world_height);
    this.positionPlayerLabels(this.localPlayer);

    // Player bob animation
    if (this.localPlayer._bobTween) this.localPlayer._bobTween.remove();
    if (isMoving) {
      this.localPlayer._bobOffset = this.localPlayer._bobOffset || 0;
      this.localPlayer._bobOffset += dt * 8;
      const bobY = Math.sin(this.localPlayer._bobOffset) * 2;
      this.localPlayer.setScale(1, 1 + Math.sin(this.localPlayer._bobOffset * 2) * 0.05);
    } else {
      this.localPlayer.setScale(1, 1);
      this.localPlayer._bobOffset = 0;
    }

    const input = {
      seq: ++this.inputSeq,
      pos: { x: this.localPlayer.x, y: this.localPlayer.y },
      vel: { x: dx * this.moveSpeed, y: dy * this.moveSpeed },
      inputs: { dx, dy, sprint: this.keys.SHIFT.isDown || this.mobileInput.isPressed('shift') },
      action: null,
    };
    this.pendingInputs.push(input);
    if (this.pendingInputs.length > 120) this.pendingInputs.shift();
    networkManager.sendMovement(input);
  }

  _mobileMove(m) {
    if (!this.localPlayer || this.chatOpen) return;
    const dt = 1 / 60;
    this.localPlayer.x = Phaser.Math.Clamp(this.localPlayer.x + m.dx * this.moveSpeed * dt, 0, GAME_CONFIG.world_width);
    this.localPlayer.y = Phaser.Math.Clamp(this.localPlayer.y + m.dy * this.moveSpeed * dt, 0, GAME_CONFIG.world_height);
    this.positionPlayerLabels(this.localPlayer);

    const input = {
      seq: ++this.inputSeq,
      pos: { x: this.localPlayer.x, y: this.localPlayer.y },
      vel: { x: m.dx * this.moveSpeed, y: m.dy * this.moveSpeed },
      inputs: { dx: m.dx, dy: m.dy, sprint: this.mobileInput.isPressed('shift') },
      action: null,
    };
    this.pendingInputs.push(input);
    if (this.pendingInputs.length > 120) this.pendingInputs.shift();
    networkManager.sendMovement(input);
  }

  applyState(state, snap = false) {
    // Merge delta state
    if (state && (!state.players || !state.machines)) {
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
        state = this._stateCache;
      } else {
        return;
      }
    } else if (state) {
      this._stateCache = state;
    }

    this.latestState = state;
    if (!state) return;
    this.roomCode = state.id || this.roomCode;

    for (const player of state.players || []) {
      const sprite = this.ensurePlayerSprite(player);
      if (player.id === this.playerId) {
        this.reconcileLocalPlayer(player, snap);
      } else {
        this.serverTargets.set(player.id, { x: player.position.x, y: player.position.y });
        if (snap) sprite.setPosition(player.position.x, player.position.y);
      }
      this.updatePlayerSprite(sprite, player);
    }

    for (const [pid, sprite] of this.playerSprites) {
      if (!state.players.some(p => p.id === pid)) {
        this.destroyPlayerSprite(sprite);
        this.playerSprites.delete(pid);
      }
    }

    for (const machine of state.machines || []) {
      const sprite = this.machines.get(machine.id);
      if (sprite) sprite.serverData = machine;
    }
  }

  reconcileLocalPlayer(serverPlayer, snap) {
    if (!this.localPlayer) return;
    this.pendingInputs = this.pendingInputs.filter(i => i.seq > serverPlayer.lastProcessedSeq);
    const dx = serverPlayer.position.x - this.localPlayer.x;
    const dy = serverPlayer.position.y - this.localPlayer.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (snap || dist > 80) {
      this.localPlayer.setPosition(serverPlayer.position.x, serverPlayer.position.y);
    } else if (dist > 4) {
      this.tweens.add({ targets: this.localPlayer, x: serverPlayer.position.x, y: serverPlayer.position.y, duration: 100, ease: 'Sine.easeOut' });
    }
    this.positionPlayerLabels(this.localPlayer);
  }

  interpolateRemotePlayers(delta) {
    for (const [pid, target] of this.serverTargets) {
      const sprite = this.playerSprites.get(pid);
      if (!sprite) continue;
      const amt = Math.min(1, delta / 100);
      sprite.x += (target.x - sprite.x) * amt;
      sprite.y += (target.y - sprite.y) * amt;
      this.positionPlayerLabels(sprite);
    }
  }

  createTilemap() {
    const ts = 64;
    for (let row = 0; row < 12; row++)
      for (let col = 0; col < 20; col++)
        this.add.image(col * ts + ts / 2, row * ts + ts / 2, 'tile_floor').setAlpha(0.5);

    const gfx = this.add.graphics();
    this.drawRoom(gfx, 250, 80, 300, 250, 0xe94560, 'REACTOR BAY', 400, 100, 0.3);
    this.drawRoom(gfx, 600, 150, 400, 300, 0x4fc3f7, 'TURBINE HALL', 800, 160);
    this.drawRoom(gfx, 200, 350, 400, 250, 0x29b6f6, 'COOLANT SYSTEMS', 400, 360);
    this.drawRoom(gfx, 850, 450, 250, 200, 0xffb74d, 'CONTROL ROOM', 950, 460);
    this.drawRoom(gfx, 30, 120, 150, 180, 0x66bb6a, 'FUEL STORAGE', 80, 130);
    this.drawRoom(gfx, 550, 550, 200, 120, 0x78909c, 'BREAK ROOM', 640, 570);
    this.drawRoom(gfx, 30, 550, 150, 100, 0x4fc3f7, 'WORKSHOP', 80, 570);
    this.drawRoom(gfx, 1100, 550, 150, 100, 0xe94560, 'EMERGENCY EXIT', 1160, 570);
  }

  drawRoom(gfx, x, y, w, h, color, label, lx, ly, alpha = 0.4) {
    function darken(c, amt) {
      const r = Math.max(0, ((c >> 16) & 0xff) - amt);
      const g = Math.max(0, ((c >> 8) & 0xff) - amt);
      const b = Math.max(0, (c & 0xff) - amt);
      return (r << 16) | (g << 8) | b;
    }
    function lighten(c, amt) {
      const r = Math.min(255, ((c >> 16) & 0xff) + amt);
      const g = Math.min(255, ((c >> 8) & 0xff) + amt);
      const b = Math.min(255, (c & 0xff) + amt);
      return (r << 16) | (g << 8) | b;
    }
    gfx.fillStyle(darken(color, 60), alpha);
    gfx.fillRect(x, y, w, h);
    gfx.lineStyle(1, lighten(color, 20), 0.4);
    gfx.strokeRect(x, y, w, h);
    this.add.text(lx, ly, label, { fontFamily: 'monospace', fontSize: '10px', color: `#${color.toString(16).padStart(6, '0')}` }).setAlpha(0.7);
  }

  createMachines() {
    const machines = [
      ['reactor_1', MACHINE_TYPES.REACTOR, 400, 200, 'Reactor Core', 0xe94560, 52],
      ['control_rods_1', MACHINE_TYPES.CONTROL_RODS, 400, 120, 'Control Rods', 0xffb74d, 32],
      ['pump_1', MACHINE_TYPES.PUMP, 280, 420, 'Coolant Pump A', 0x29b6f6, 38],
      ['pump_2', MACHINE_TYPES.PUMP, 520, 420, 'Coolant Pump B', 0x29b6f6, 38],
      ['pipe_1', MACHINE_TYPES.PIPE, 340, 300, 'Steam Pipe A', 0x90a4ae, 36],
      ['pipe_2', MACHINE_TYPES.PIPE, 460, 300, 'Steam Pipe B', 0x90a4ae, 36],
      ['pipe_3', MACHINE_TYPES.PIPE, 400, 450, 'Steam Pipe C', 0x90a4ae, 36],
      ['turbine_1', MACHINE_TYPES.TURBINE, 750, 250, 'Turbine 1', 0x4fc3f7, 40],
      ['turbine_2', MACHINE_TYPES.TURBINE, 750, 380, 'Turbine 2', 0x4fc3f7, 40],
      ['generator_1', MACHINE_TYPES.GENERATOR, 880, 250, 'Generator 1', 0x66bb6a, 40],
      ['generator_2', MACHINE_TYPES.GENERATOR, 880, 380, 'Generator 2', 0x66bb6a, 40],
      ['condenser_1', MACHINE_TYPES.CONDENSER, 550, 520, 'Condenser', 0x29b6f6, 40],
      ['fuel_storage', 'STORAGE', 100, 180, 'Fuel Storage', 0x66bb6a, 36],
      ['control_room_door', 'DOOR', 950, 550, 'Control Room', 0xffb74d, 36],
      ['task_board', 'TASK_BOARD', 640, 620, 'Task Board', 0xffb74d, 32],
      ['emergency_exit', 'EXIT', 1250, 30, 'Emergency Exit', 0xe94560, 30],
    ];

    for (const [id, type, x, y, label, color, size] of machines) {
      const texName = MACHINE_TEXTURE_MAP[type] || 'machine_generic';
      const sprite = type === 'DOOR' || type === 'STORAGE' || type === 'TASK_BOARD' || type === 'EXIT'
        ? this.add.rectangle(x, y, size, size, color, 0.85).setStrokeStyle(2, color)
        : this.add.image(x, y, texName).setDisplaySize(size, size);

      sprite.machineId = id;
      sprite.machineType = type;
      sprite.serverData = null;
      sprite.statusDot = this.add.circle(x + size / 2 + 8, y - size / 2 - 5, 5, 0x66bb6a).setDepth(6);
      sprite.interactIcon = this.add.text(x, y - size / 2 - 16, '[E]', {
        fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', backgroundColor: '#16213e', padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setAlpha(0).setDepth(20);

      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerover', () => { if (sprite.serverData) this.tooltip.hoverMachine(sprite, sprite.serverData); });
      sprite.on('pointerout', () => this.tooltip.hide());

      this.add.text(x, y + size / 2 + 12, label, { fontFamily: 'monospace', fontSize: '8px', color: '#b0b0d0' }).setOrigin(0.5);
      this.machines.set(id, sprite);

      // Setup pipe emitters for steam
      if (type === MACHINE_TYPES.PIPE) {
        this.pipeEmitters.push(createSteamPipeEmitter(this.pool, x, y));
      }

      // Track turbine sprites for rotation
      if (type === MACHINE_TYPES.TURBINE) {
        this.turbineSprites.push(sprite);
      }

      // Glow effect for reactor
      if (type === MACHINE_TYPES.REACTOR) {
        const glow = this.add.image(x, y, 'glow_circle').setAlpha(0.15).setDepth(4).setScale(1.5);
        this.glowSprites.push({ sprite: glow, machineId: id });
      }
    }
  }

  createLocalPlayer() {
    this.localPlayer = this.ensurePlayerSprite({
      id: this.playerId, name: this.playerName, role: this.playerRole,
      position: { x: 150, y: 500 }, hp: 100, isAlive: true,
    });
    this.cameras.main.startFollow(this.localPlayer, true, 0.08, 0.08);
    this.cameras.main.setBounds(0, 0, GAME_CONFIG.world_width, GAME_CONFIG.world_height);
  }

  ensurePlayerSprite(player) {
    if (this.playerSprites.has(player.id)) return this.playerSprites.get(player.id);

    const color = ROLE_COLORS[player.role] || 0xffffff;
    const sprite = this.add.rectangle(player.position.x, player.position.y, 24, 32, color, 1).setDepth(10);
    sprite.playerId = player.id;

    // Inner highlight for depth
    const hl = this.add.rectangle(0, 0, 16, 24, 0xffffff, 0.2).setDepth(11);
    sprite._highlight = hl;

    sprite.nameTag = this.add.text(sprite.x, sprite.y - 22, player.name, {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 3, y: 1 },
    }).setOrigin(0.5).setDepth(11);

    sprite.roleTag = this.add.text(sprite.x, sprite.y + 20, `[${player.role}]`, {
      fontFamily: 'monospace', fontSize: '7px', color: `#${color.toString(16).padStart(6, '0')}`,
    }).setOrigin(0.5).setDepth(11);

    sprite.hpBar = this.add.rectangle(sprite.x - 12, sprite.y + 30, 24, 3, 0x66bb6a).setOrigin(0, 0).setDepth(11);

    // Progress arc for repair
    sprite.progressArc = this.add.graphics().setDepth(12);

    // Tool indicator
    sprite.toolIndicator = this.add.text(sprite.x + 16, sprite.y, '🔧', {
      fontFamily: 'monospace', fontSize: '12px',
    }).setOrigin(0.5).setDepth(11).setAlpha(0);

    this.playerSprites.set(player.id, sprite);
    return sprite;
  }

  updatePlayerSprite(sprite, player) {
    sprite.nameTag.setText(player.name);
    sprite.roleTag.setText(`[${player.role}]`);
    sprite.setAlpha(player.isAlive ? 1 : 0.35);
    sprite.hpBar.width = 24 * Math.max(0, Math.min(1, player.hp / 100));
    sprite.hpBar.setFillStyle(player.hp > 50 ? 0x66bb6a : player.hp > 25 ? 0xffb74d : 0xe94560);
    this.positionPlayerLabels(sprite);

    // Progress arc rendering
    sprite.progressArc.clear();
    if (player.isRepairing && player.repairProgress > 0) {
      const progress = player.repairProgress / 100;
      sprite.toolIndicator.setAlpha(1);
      sprite.progressArc.lineStyle(3, 0x4fc3f7, 0.9);
      sprite.progressArc.beginPath();
      sprite.progressArc.arc(sprite.x, sprite.y - 30, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      sprite.progressArc.strokePath();
    } else {
      sprite.toolIndicator.setAlpha(0);
    }
  }

  positionPlayerLabels(sprite) {
    sprite.nameTag?.setPosition(sprite.x, sprite.y - 22);
    sprite.roleTag?.setPosition(sprite.x, sprite.y + 20);
    sprite.hpBar?.setPosition(sprite.x - 12, sprite.y + 30);
    if (sprite._highlight) sprite._highlight.setPosition(sprite.x, sprite.y);
    if (sprite.toolIndicator) sprite.toolIndicator.setPosition(sprite.x + 16, sprite.y);
  }

  destroyPlayerSprite(sprite) {
    sprite.nameTag?.destroy();
    sprite.roleTag?.destroy();
    sprite.hpBar?.destroy();
    sprite.progressArc?.destroy();
    sprite.toolIndicator?.destroy();
    sprite._highlight?.destroy();
    sprite.destroy();
  }

  handleInteraction() {
    const machine = this.findNearestMachine();
    if (!machine) return;

    if (machine.machineType === 'DOOR') {
      if (this.playerRole === CLASS_IDS.RO) {
        this.cameras.main.fadeOut(300, 10, 10, 20);
        this.time.delayedCall(300, () => {
          this.scene.launch('ControlRoom', { roomCode: this.roomCode, role: this.playerRole });
          this.cameras.main.fadeIn(300, 10, 10, 20);
        });
      } else {
        this.showNotification('ACCESS DENIED — RO only', 2000);
        audioManager.play('button_click', 0.4);
      }
      return;
    }
    if (machine.machineType === 'STORAGE') {
      if (this.playerRole === CLASS_IDS.LO) {
        this.cameras.main.fadeOut(300, 10, 10, 20);
        this.time.delayedCall(300, () => {
          this.scene.launch('Crane', { roomCode: this.roomCode, role: this.playerRole });
          this.cameras.main.fadeIn(300, 10, 10, 20);
        });
      } else {
        this.showNotification('Fuel Storage — LO only', 2000);
      }
      return;
    }
    if (machine.machineType === MACHINE_TYPES.REACTOR && this.playerRole === CLASS_IDS.LO) {
      networkManager.sendAction('deliver', { targetId: 'reactor_1' });
      audioManager.play('fuel_clunk', 0.5);
      return;
    }
    if (machine.machineType === 'TASK_BOARD') {
      this.showTaskBoard();
      return;
    }
    if (machine.machineType === 'EXIT') {
      this.showNotification('Evacuating to safe zone...', 2000);
      const localPlayer = this.latestState?.players.find(p => p.id === this.playerId);
      if (localPlayer) {
        const roomCode = this.latestState?.id || this.roomCode;
        this.scene.restart({ roomCode, role: this.playerRole, playerName: this.playerName, playerId: this.playerId, difficulty: this.difficulty });
      }
      return;
    }
    if (this.playerRole === CLASS_IDS.PM && machine.machineType !== 'DOOR' && machine.machineType !== 'STORAGE' && machine.machineType !== 'TASK_BOARD') {
      networkManager.sendAction('repair', { targetId: machine.machineId });
      audioManager.play('repair_grind', 0.3);
      return;
    }
    networkManager.sendAction('interact', { targetId: machine.machineId });
  }

  findNearestMachine() {
    let nearest = null, nearestDist = Infinity;
    for (const machine of this.machines.values()) {
      const dist = Phaser.Math.Distance.Between(this.localPlayer.x, this.localPlayer.y, machine.x, machine.y);
      machine.interactIcon.setAlpha(dist <= 70 ? 1 : 0);
      if (dist <= 70 && dist < nearestDist) { nearest = machine; nearestDist = dist; }
    }
    return nearest;
  }

  updateMachineVisuals(dt) {
    this.findNearestMachine();
    for (const machine of this.machines.values()) {
      const data = machine.serverData;
      if (!data) continue;
      const ratio = data.hp / data.maxHp;
      const statusColor = ratio < 0.3 ? 0xe94560 : ratio < 0.7 ? 0xffb74d : 0x66bb6a;
      machine.statusDot.setFillStyle(statusColor);

      // Damage states: color shifts red as HP drops
      if (ratio < 0.7) {
        const flash = Math.sin(Date.now() / 250) * 0.25 + 0.75;
        machine.setAlpha(ratio < 0.25 ? 1 : flash);
        // Red shift
        const r = Phaser.Display.Color.IntegerToColor(0xe94560);
        const g = Phaser.Display.Color.IntegerToColor(0x607d8b);
        machine.setTint(Phaser.Display.Color.GetColor(
          r.red + (g.red - r.red) * ratio,
          r.green + (g.green - r.green) * ratio,
          r.blue + (g.blue - r.blue) * ratio
        ));
      } else {
        machine.setAlpha(1);
        machine.clearTint();
      }

      // Steam particles on broken machines
      if (ratio < 0.5 && ratio > 0) {
        this.pool.emitSteam(machine.x + (Math.random() - 0.5) * 20, machine.y + (Math.random() - 0.5) * 20, { count: 1 });
      }

      // Fire when HP < 25%
      if (ratio < 0.25 && ratio > 0) {
        if (Math.random() < 0.1) this.pool.emitFire(machine.x + (Math.random() - 0.5) * 10, machine.y, { count: 1 });
      }

      // Turbine rotation tied to RPM
      if (machine.machineType === MACHINE_TYPES.TURBINE && data.state) {
        const rpm = data.state.rpm || 0;
        const rot = (rpm / 3600) * dt * 10;
        machine.rotation += rot;
      }

      // Pump pulse
      if (machine.machineType === MACHINE_TYPES.PUMP && data.state) {
        const speed = data.state.speed || 0;
        const pulse = 1 + Math.sin(Date.now() / (500 - speed * 3)) * 0.05 * (speed / 100);
        machine.setScale(pulse, pulse);
      }

      // Generator sparks
      if (machine.machineType === MACHINE_TYPES.GENERATOR && data.state) {
        const mw = data.state.outputMW || 0;
        if (mw > 20 && Math.random() < mw / 500) {
          this.pool.emitSparks(
            machine.x + (Math.random() - 0.5) * 30,
            machine.y + (Math.random() - 0.5) * 30,
            { count: 2 }
          );
        }
      }

      // Pipe steam
      if (machine.machineType === MACHINE_TYPES.PIPE && data.state) {
        const isLeaking = data.state.isLeaking;
        const pressure = data.state.pressure || 0;
        if (isLeaking && pressure > 10) {
          this.pool.emitSteam(machine.x, machine.y - 10, { count: 1 });
        }
      }

      // Reactor glow
      if (machine.machineType === MACHINE_TYPES.REACTOR && data.state) {
        const glow = this.glowSprites.find(g => g.machineId === machine.machineId);
        if (glow) {
          const heatRatio = (data.state.heat || 0) / 1000;
          glow.sprite.setAlpha(0.08 + heatRatio * 0.3);
          glow.sprite.setScale(1.2 + heatRatio * 0.8);
          glow.sprite.setTint(heatRatio > 0.7 ? 0xff6600 : heatRatio > 0.4 ? 0xffaa00 : 0x4fc3f7);
        }
        // Radiation particles from hot reactor
        if (data.state.heat > 600 && Math.random() < 0.05) {
          this.pool.emitRadiation(machine.x + (Math.random() - 0.5) * 40, machine.y + (Math.random() - 0.5) * 40);
        }
      }
    }
  }

  updateParticles(dt) {
    this.pool.update(dt);
    // Pipe steam emitters
    for (const emitter of this.pipeEmitters) {
      const data = emitter.pipeId ? this.machines.get(emitter.pipeId)?.serverData : null;
      const active = data ? data.state?.isLeaking : false;
      emitter.update(dt, active);
    }
  }

  createHUD() {
    const roleColor = ROLE_COLORS[this.playerRole];
    this.hud = this.add.container(0, 0).setScrollFactor(0).setDepth(100);
    const roleBg = this.add.rectangle(10, 10, 210, 64, 0x000000, 0.72).setOrigin(0, 0).setStrokeStyle(1, roleColor);
    this.roleText = this.add.text(18, 18, ROLE_NAMES[this.playerRole], { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', fontStyle: 'bold' });
    this.roomText = this.add.text(18, 38, `Room ${this.roomCode}`, { fontFamily: 'monospace', fontSize: '10px', color: '#b0b0d0' });

    const statusBg = this.add.rectangle(1270, 10, 220, 162, 0x000000, 0.72).setOrigin(1, 0).setStrokeStyle(1, 0x3a3a5a);
    this.statusLines = {
      heat: this.add.text(1070, 20, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ff9800' }),
      mw: this.add.text(1070, 40, '', { fontFamily: 'monospace', fontSize: '11px', color: '#4fc3f7' }),
      rad: this.add.text(1070, 60, '', { fontFamily: 'monospace', fontSize: '11px', color: '#66bb6a' }),
      coolant: this.add.text(1070, 80, '', { fontFamily: 'monospace', fontSize: '11px', color: '#29b6f6' }),
      fuel: this.add.text(1070, 100, '', { fontFamily: 'monospace', fontSize: '11px', color: '#81c784' }),
      time: this.add.text(1070, 120, '', { fontFamily: 'monospace', fontSize: '11px', color: '#b0b0d0' }),
      blackout: this.add.text(1070, 140, '', { fontFamily: 'monospace', fontSize: '11px', color: '#e94560' }),
    };
    this.hud.add([roleBg, this.roleText, this.roomText, statusBg, ...Object.values(this.statusLines)]);
  }

  updateHUD() {
    if (!this.latestState) return;
    const reactor = this.latestState.machines.find(m => m.id === 'reactor_1');
    const pump = this.latestState.machines.find(m => m.id === 'pump_1');
    const heatPct = reactor ? Math.round((reactor.state.heat / 1000) * 100) : 0;
    const mins = Math.floor(this.latestState.gameTime / 60);
    const secs = Math.floor(this.latestState.gameTime % 60);

    this.statusLines.heat.setText(`Heat: ${heatPct}%`);
    this.statusLines.heat.setColor(heatPct > 80 ? '#e94560' : '#ff9800');
    this.statusLines.mw.setText(`Power: ${Math.round(this.latestState.totalOutput)} MW`);
    this.statusLines.rad.setText(`Radiation: ${Math.round(this.latestState.radiationLevel)}`);
    this.statusLines.rad.setColor(this.latestState.radiationLevel > 30 ? '#e94560' : '#66bb6a');
    this.statusLines.coolant.setText(`Coolant: ${Math.round(pump?.state.speed || 0)}%`);
    this.statusLines.fuel.setText(`Fuel: ${this.latestState.fuelRods} rods`);
    this.statusLines.time.setText(`Time: ${mins}:${secs.toString().padStart(2, '0')}`);
    this.statusLines.blackout.setText(this.latestState.blackoutActive ? 'BLACKOUT ACTIVE' : `Blackout: ${Math.floor(this.latestState.blackoutTimer)}s`);

    const radAlpha = this.latestState.radiationZones?.length ? 0.18 + Math.sin(Date.now() / 250) * 0.08 : 0;
    this.radiationOverlay.setAlpha(radAlpha);

    // Stats tracking
    playerStats.addMW(this.latestState.totalOutput * (1 / 60));
    if (reactor) {
      const rods = reactor.state.controlRodInsertion;
      if (rods >= 95 && !this._lastScramCheck) {
        this._lastScramCheck = true;
        if (achievements.checkMeltdownPrevented()) {
          this.showNotification(`Achievement: ${strings.ACHIEVEMENTS.meltdown_prevented}!`, 4000);
        }
      }
      if (rods < 95) this._lastScramCheck = false;
    }
  }

  createChatUI() {
    this.chatContainer = this.add.container(20, 520).setScrollFactor(0).setDepth(120);
    this.chatBg = this.add.rectangle(0, 0, 360, 178, 0x000000, 0.68).setOrigin(0, 0).setStrokeStyle(1, 0x3a3a5a);
    this.chatTabs = this.add.text(10, 8, 'Global | Team | System', { fontFamily: 'monospace', fontSize: '10px', color: '#b0b0d0' });
    this.chatInputText = this.add.text(10, 148, 'T: chat', { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff' });
    this.chatContainer.add([this.chatBg, this.chatTabs, this.chatInputText]);
  }

  toggleChat(open) {
    this.chatOpen = open;
    if (open) {
      this.chatDraft = '';
      this._chatInput = document.createElement('input');
      this._chatInput.type = 'text';
      this._chatInput.maxLength = 200;
      this._chatInput.placeholder = `[${this.chatChannel}] Type here...`;
      this._chatInput.style.cssText = 'position:fixed;bottom:170px;left:30px;width:340px;padding:6px 10px;background:#1a1a2e;color:#e0e0e0;border:1px solid #4fc3f7;border-radius:4px;font-family:monospace;font-size:13px;outline:none;z-index:10000;';
      document.body.appendChild(this._chatInput);
      this._chatInput.focus();
      this._chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.sendChat();
        } else if (e.key === 'Escape') {
          this.toggleChat(false);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          this.chatChannel = this.chatChannel === 'global' ? 'team' : this.chatChannel === 'team' ? 'system' : 'global';
          this._chatInput.placeholder = `[${this.chatChannel}] Type here...`;
          this.updateChatInput();
        }
        e.stopPropagation();
      });
      this._chatInput.addEventListener('blur', () => {
        if (this.chatOpen) this._chatInput.focus();
      });
    } else {
      if (this._chatInput) {
        this._chatInput.remove();
        this._chatInput = null;
      }
    }
    this.updateChatInput();
  }

  updateChatInput() {
    const label = this.chatOpen ? `[${this.chatChannel}] ${this.chatDraft}${this.chatDraft ? '_' : ''}` : 'T: chat';
    this.chatInputText.setText(label);
    this.chatBg.setStrokeStyle(1, this.chatOpen ? 0x4fc3f7 : 0x3a3a5a);
    if (this._chatInput) {
      this._chatInput.placeholder = `[${this.chatChannel}] Type here...`;
    }
  }

  sendChat() {
    const msg = this._chatInput ? this._chatInput.value.trim() : '';
    if (msg) networkManager.sendChat(msg, this.chatChannel);
    this.toggleChat(false);
  }

  addChatMessage(message) {
    this.chatMessages.push(message);
    if (this.chatMessages.length > 8) this.chatMessages.shift();
    this.renderChatMessages();
    audioManager.play('chat_ping', 0.4);
  }

  renderChatMessages() {
    this.chatLineTexts?.forEach(l => l.destroy());
    this.chatLineTexts = [];
    this.chatMessages.forEach((msg, i) => {
      const color = msg.type === 'team' ? '#4fc3f7' : msg.type === 'system' ? '#ffcc80' : '#ffffff';
      const line = this.add.text(10, 28 + i * 15, `${msg.sender}: ${msg.message}`, {
        fontFamily: 'monospace', fontSize: '10px', color, wordWrap: { width: 338 },
      });
      this.chatLineTexts.push(line);
      this.chatContainer.add(line);
    });
  }

  createScoreboard() {
    this.scoreboardContainer = this.add.container(440, 120).setScrollFactor(0).setDepth(150).setVisible(false);
    const bg = this.add.rectangle(0, 0, 400, 420, 0x000000, 0.82).setOrigin(0, 0).setStrokeStyle(1, 0x4fc3f7);
    this.scoreboardText = this.add.text(18, 18, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', lineSpacing: 4 });
    this.scoreboardContainer.add([bg, this.scoreboardText]);

    this.input.keyboard.on('keyup-TAB', () => {
      this.scoreboardOpen = false;
      this.scoreboardContainer.setVisible(false);
    });
  }

  updateScoreboard() {
    if (!this.scoreboardOpen || !this.latestState) return;
    const players = this.latestState.players.map(p =>
      `${p.name.padEnd(12)} ${p.role} ${Math.round(p.hp).toString().padStart(3)}hp ${p.ready ? 'READY' : ''}`
    ).join('\n');
    const score = this.latestState.score;
    this.scoreboardText.setText([
      `ROOM ${this.roomCode} | ${this.difficulty}`,
      '',
      players,
      '',
      `Uptime: ${score.uptimeSeconds}s`,
      `Generated: ${score.totalMWGenerated} MWs`,
      `Tasks: ${score.tasksCompleted}`,
      `Phase: ${this.latestState.gamePhase}`,
      '',
      '--- PLANT STATUS ---',
      ...this.latestState.machines.map(m =>
        `${m.id.padEnd(16)} HP: ${Math.round(m.hp)}/${Math.round(m.maxHp)} ${m.isActive ? 'ON' : 'OFF'}`
      ),
    ].join('\n'));
  }

  createRadiationOverlay() {
    this.radiationOverlay = this.add.rectangle(640, 360, 1280, 720, 0x2eff74, 0).setScrollFactor(0).setDepth(80);
  }

  updateRadiationOverlay(dt) {
    if (!this.latestState) return;
    if (this.latestState.radiationZones?.length > 0) {
      const intensity = Math.min(0.3, 0.1 + this.latestState.radiationLevel / 300);
      this.radiationOverlay.setAlpha(intensity + Math.sin(Date.now() / 200) * 0.05);
    } else {
      this.radiationOverlay.setAlpha(0);
    }
  }

  showTaskBoard() {
    if (!this.latestState) return;
    const localPlayer = this.latestState.players.find(p => p.id === this.playerId);
    if (!localPlayer) return;

    const tasks = localPlayer.assignedTasks || [];
    const allTasks = this.latestState.machines
      .filter(m => m.type === MACHINE_TYPES.TURBINE || m.type === MACHINE_TYPES.PUMP || m.type === MACHINE_TYPES.PIPE || m.type === MACHINE_TYPES.GENERATOR)
      .filter(m => m.hp < m.maxHp)
      .map(m => ({ machine: m.id, type: m.type, hp: Math.round(m.hp), maxHp: Math.round(m.maxHp) }));

    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    const board = this.add.container(0, 0).setDepth(400).setScrollFactor(0);
    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.75).setInteractive().setDepth(400);
    board.add(overlay);

    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRoundedRect(w / 2 - 240, h / 2 - 200, 480, 400, 16);
    bg.lineStyle(2, 0x4fc3f7, 0.6);
    bg.strokeRoundedRect(w / 2 - 240, h / 2 - 200, 480, 400, 16);
    board.add(bg);

    const title = this.add.text(w / 2, h / 2 - 180, 'TASK BOARD', {
      fontFamily: 'monospace', fontSize: '20px', color: '#4fc3f7', fontStyle: 'bold',
    }).setOrigin(0.5);
    board.add(title);

    const roleName = ['PM', 'LO', 'RO'].includes(this.playerRole)
      ? ({ PM: 'Maintenance', LO: 'Logistics', RO: 'Reactor Operator' })[this.playerRole]
      : this.playerRole;
    const roleLabel = this.add.text(w / 2, h / 2 - 155, `Role: ${roleName} | Tasks: ${tasks.length}`, {
      fontFamily: 'monospace', fontSize: '11px', color: '#b0b0d0',
    }).setOrigin(0.5);
    board.add(roleLabel);

    let yOff = h / 2 - 130;
    if (tasks.length === 0) {
      board.add(this.add.text(w / 2, yOff, 'No assigned tasks.', { fontFamily: 'monospace', fontSize: '13px', color: '#7a7a9e' }).setOrigin(0.5));
    } else {
      tasks.forEach((task, i) => {
        const color = task.isComplete ? '#66bb6a' : '#ffb74d';
        const status = task.isComplete ? '✓ DONE' : '… PENDING';
        board.add(this.add.text(w / 2 - 210, yOff + i * 24, `${task.type} @ ${task.targetId}`, {
          fontFamily: 'monospace', fontSize: '11px', color,
        }));
        board.add(this.add.text(w / 2 + 210, yOff + i * 24, status, {
          fontFamily: 'monospace', fontSize: '11px', color,
        }).setOrigin(1, 0));
      });
    }

    if (allTasks.length > 0) {
      board.add(this.add.text(w / 2 - 210, h / 2 + 20, 'BROKEN MACHINES:', {
        fontFamily: 'monospace', fontSize: '11px', color: '#e94560',
      }));
      allTasks.forEach((m, i) => {
        board.add(this.add.text(w / 2 - 210, h / 2 + 44 + i * 20, `${m.machine} — HP: ${m.hp}/${m.maxHp}`, {
          fontFamily: 'monospace', fontSize: '10px', color: '#b0b0d0',
        }));
      });
    }

    const closeBtn = this.add.text(w / 2, h / 2 + 170, 'CLOSE', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', backgroundColor: '#16213e', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    board.add(closeBtn);
    closeBtn.on('pointerdown', () => board.destroy(true));
    overlay.on('pointerdown', () => board.destroy(true));
  }

  showGameOver(reason, score) {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    const board = this.add.container(0, 0).setDepth(400).setScrollFactor(0);
    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.85).setDepth(400);
    board.add(overlay);

    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRoundedRect(w / 2 - 240, h / 2 - 180, 480, 360, 16);
    bg.lineStyle(2, score === 'win' ? 0x66bb6a : 0xe94560, 0.8);
    bg.strokeRoundedRect(w / 2 - 240, h / 2 - 180, 480, 360, 16);
    board.add(bg);

    const resultColor = score === 'win' ? '#66bb6a' : '#e94560';
    const resultText = score === 'win' ? 'VICTORY' : 'DEFEAT';
    board.add(this.add.text(w / 2, h / 2 - 150, resultText, {
      fontFamily: 'monospace', fontSize: '32px', color: resultColor, fontStyle: 'bold',
    }).setOrigin(0.5));

    board.add(this.add.text(w / 2, h / 2 - 110, reason || '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#b0b0d0',
    }).setOrigin(0.5));

    if (this.latestState && this.latestState.score) {
      const s = this.latestState.score;
      board.add(this.add.text(w / 2 - 180, h / 2 - 70, [
        `Uptime: ${s.uptimeSeconds}s`,
        `Power Generated: ${s.totalMWGenerated} MW`,
        `Tasks Completed: ${s.tasksCompleted}`,
      ].join('\n'), { fontFamily: 'monospace', fontSize: '12px', color: '#e0e0e0', lineSpacing: 6 }));
    }

    const btn = this.add.text(w / 2, h / 2 + 130, 'RETURN TO MENU', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', backgroundColor: '#16213e', padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    board.add(btn);
    btn.on('pointerdown', () => {
      board.destroy(true);
      this.scene.start('Menu');
    });
  }

  showNotification(message, duration = 3000) {
    const text = this.add.text(640, 180, message, {
      fontFamily: 'monospace', fontSize: '15px', color: '#ffffff', backgroundColor: '#16213e', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0);

    this.tweens.add({ targets: text, alpha: 1, y: text.y - 10, duration: 200, ease: 'Power2' });
    this.tweens.add({
      targets: text, alpha: 0, y: text.y - 50, duration: 500, ease: 'Power2', delay: (duration - 500) / 1000,
      onComplete: () => text.destroy()
    });
  }

  shutdown() {
    if (this._chatInput) { this._chatInput.remove(); this._chatInput = null; }
    if (this.pool) this.pool.destroy();
    if (this.tooltip) this.tooltip.destroy();
    if (this.pauseMenu) this.pauseMenu.destroy();
    if (this.mobileInput) this.mobileInput.destroy();
    if (this.tutorial) this.tutorial.destroy();
    playerStats.addPlayTime(this._sessionTime);
  }
}
