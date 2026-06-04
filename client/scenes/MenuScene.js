import { EVENT_NAMES } from '../../shared/constants.js';
import { networkManager } from '../network.js';
import { audioManager } from '../main.js';
import strings from '../../shared/strings.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Menu' });
    this.playerName = '';
    this.selectedRole = null;
    this.roomCode = '';
    this.isCreating = false;
    this.selectedDifficulty = 'NORMAL';
    this.networkModule = null;
    this.nameInput = null;
    this.roomInput = null;
    this.selectedButton = null;
    this.roleButtons = [];
    this.actionButtons = [];
    this.activeInput = null;
  }

  create() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    this.cameras.main.fadeIn(500, 10, 10, 20);

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a14, 0x0a0a14, 0x1a1a3e, 0x1a1a3e, 1);
    bg.fillRect(0, 0, w, h);

    // Decorative grid lines
    const gridGfx = this.add.graphics();
    gridGfx.lineStyle(1, 0x1a1a3a, 0.2);
    for (let x = 0; x < w; x += 40) { gridGfx.moveTo(x, 0); gridGfx.lineTo(x, h); }
    for (let y = 0; y < h; y += 40) { gridGfx.moveTo(0, y); gridGfx.lineTo(w, y); }
    gridGfx.strokePath();

    this.add.text(w / 2, 50, 'NUCLEAR PLANT SIMULATOR', {
      fontFamily: 'monospace', fontSize: '32px', color: '#e94560', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(w / 2, 90, 'Cooperative Reactor Management', {
      fontFamily: 'monospace', fontSize: '14px', color: '#7a7a9e'
    }).setOrigin(0.5);

    // Player name
    this.add.text(w / 2 - 220, 130, strings.UI.player_name, {
      fontFamily: 'monospace', fontSize: '12px', color: '#9090b0'
    });
    this.nameInput = this.createStyledInput(w / 2 - 220, 150, 440, 36, 'Enter your name...', (v) => { this.playerName = v; });

    // Role selection
    this.add.text(w / 2 - 220, 210, strings.UI.select_role, {
      fontFamily: 'monospace', fontSize: '12px', color: '#9090b0'
    });

    const roles = [
      { key: 'PM', label: strings.ROLES.PM, desc: 'Repair & maintain machines', color: 0x4fc3f7 },
      { key: 'LO', label: strings.ROLES.LO, desc: 'Deliver fuel rods', color: 0x66bb6a },
      { key: 'RO', label: strings.ROLES.RO, desc: 'Control the reactor', color: 0xffb74d }
    ];

    roles.forEach((role, index) => {
      const x = w / 2 - 220 + index * 150;
      const y = 230;
      const btn = this.createRoleButton(x, y, 140, 70, role, () => {
        this.selectedRole = role.key;
        this.roleButtons.forEach(b => b.setStrokeStyle(2, 0x3a3a5a));
        btn.setStrokeStyle(2, role.color);
        this.selectedButton = btn;
      });
      this.roleButtons.push(btn);
    });

    // Difficulty
    this.add.text(w / 2 - 220, 330, strings.UI.difficulty, {
      fontFamily: 'monospace', fontSize: '12px', color: '#9090b0'
    });

    const diffs = [
      { key: 'EASY', label: strings.UI.easy, color: 0x66bb6a },
      { key: 'NORMAL', label: strings.UI.normal, color: 0xffb74d },
      { key: 'HARD', label: strings.UI.hard, color: 0xe94560 },
    ];
    diffs.forEach((diff, i) => {
      const x = w / 2 - 220 + i * 150;
      const y = 350;
      const hex = `#${diff.color.toString(16).padStart(6, '0')}`;
      const btn = this.add.rectangle(x, y, 140, 36, 0x16213e).setStrokeStyle(2, diff.color).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      const txt = this.add.text(x + 70, y + 18, diff.label, { fontFamily: 'monospace', fontSize: '13px', color: hex, fontStyle: 'bold' }).setOrigin(0.5);
      btn.on('pointerdown', () => {
        this.selectedDifficulty = diff.key;
        document.querySelectorAll('.diff-btn').forEach(b => b.setStrokeStyle(2, 0x3a3a5a));
        btn.setStrokeStyle(2, diff.color);
      });
      btn._className = 'diff-btn';
    });

    // Room code
    this.add.text(w / 2 - 220, 410, strings.UI.room_code, {
      fontFamily: 'monospace', fontSize: '12px', color: '#9090b0'
    });
    this.roomInput = this.createStyledInput(w / 2 - 220, 430, 280, 36, 'Enter room code...', (v) => { this.roomCode = v; });

    // Action buttons
    const createBtn = this.createActionButton(w / 2 - 220, 490, 200, 50, strings.UI.create_room, 0x4fc3f7, () => {
      this.isCreating = true; this.handleAction();
    });
    this.actionButtons.push(createBtn);

    const joinBtn = this.createActionButton(w / 2 + 20, 490, 200, 50, strings.UI.join_game, 0x66bb6a, () => {
      this.isCreating = false; this.handleAction();
    });
    this.actionButtons.push(joinBtn);

    this.statusText = this.add.text(w / 2, 570, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#e94560'
    }).setOrigin(0.5);

    this.waitingGroup = this.add.group();
    this.waitingText = null;

    // Version
    this.add.text(w, h - 10, 'v1.0.0', {
      fontFamily: 'monospace', fontSize: '10px', color: '#3a3a5a'
    }).setOrigin(1, 1);

    this.setupNetwork();
  }

  handleAction() {
    if (!this.playerName || this.playerName.trim().length < 2) {
      this.statusText.setText('Please enter a valid name (min 2 characters)');
      return;
    }
    if (!this.selectedRole) {
      this.statusText.setText('Please select a role');
      return;
    }
    if (!this.isCreating && (!this.roomCode || this.roomCode.trim().length < 4)) {
      this.statusText.setText('Please enter a valid room code');
      return;
    }

    this.statusText.setText('');
    this.showWaitingState();

    audioManager.play('button_click', 0.5);

    const payload = {
      name: this.playerName.trim(),
      role: this.selectedRole,
      roomCode: this.isCreating ? null : this.roomCode.trim().toUpperCase(),
      difficulty: this.isCreating ? this.selectedDifficulty : undefined,
    };
    this.connectAndJoin(payload);
  }

  setupNetwork() {
    networkManager.on(EVENT_NAMES.ROOM_CREATE, (r) => this.handleJoinResponse(r));
    networkManager.on(EVENT_NAMES.ROOM_JOIN, (r) => this.handleJoinResponse(r));
    networkManager.on('error', (e) => {
      this.statusText.setText(e?.message || 'Connection error');
      this.resetWaitingState();
    });
  }

  async connectAndJoin(payload) {
    try {
      if (!networkManager.isConnected()) await networkManager.connect(window.location.origin);
      if (this.isCreating) networkManager.createRoom(payload.name, payload.role, true, payload.difficulty);
      else networkManager.joinRoom(payload.roomCode, payload.name, payload.role);
    } catch (error) {
      this.statusText.setText(error.message || 'Unable to connect');
      this.resetWaitingState();
    }
  }

  handleJoinResponse(response) {
    if (!response?.success) {
      this.statusText.setText(response?.error || 'Unable to join room');
      this.resetWaitingState();
      return;
    }
    networkManager.playerId = response.playerId;
    networkManager.roomId = response.roomId;
    this.cameras.main.fadeOut(300, 10, 10, 20);
    this.time.delayedCall(300, () => {
      this.scene.start('Game', {
        playerName: this.playerName.trim(),
        role: this.selectedRole,
        roomCode: response.roomId,
        playerId: response.playerId,
        initialState: response.state,
        difficulty: this.selectedDifficulty,
      });
    });
  }

  showWaitingState() {
    const w = this.cameras.main.width;
    this.actionButtons.forEach(b => b.setAlpha(0.4));
    this.waitingText = this.add.text(w / 2, 550, 'Connecting to server...', {
      fontFamily: 'monospace', fontSize: '14px', color: '#4fc3f7'
    }).setOrigin(0.5);
    this.waitingGroup.add(this.waitingText);
  }

  resetWaitingState() {
    this.actionButtons.forEach(b => b.setAlpha(1));
    this.waitingGroup.clear(true, true);
    this.waitingText = null;
  }

  createStyledInput(x, y, width, height, placeholder, onChange) {
    const container = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, width, height, 0x16213e).setStrokeStyle(1, 0x3a3a5a).setOrigin(0, 0);
    const displayText = this.add.text(10, height / 2, placeholder, {
      fontFamily: 'monospace', fontSize: '14px', color: '#5a5a7a'
    }).setOrigin(0, 0.5);

    container.add([bg, displayText]);
    let currentValue = '';

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      this.activeInput = container;
      bg.setStrokeStyle(2, 0x4fc3f7);
    });

    this.input.keyboard.on('keydown', (event) => {
      if (!bg.scene) return;
      if (this.activeInput !== container) return;
      if (event.key === 'Backspace' && currentValue.length > 0) currentValue = currentValue.slice(0, -1);
      else if (event.key.length === 1 && currentValue.length < 20) currentValue += event.key;
      displayText.setText(currentValue.length > 0 ? currentValue : placeholder);
      displayText.setColor(currentValue.length > 0 ? '#e0e0e0' : '#5a5a7a');
      onChange(currentValue);
    });

    container.bg = bg;
    container.displayText = displayText;
    return container;
  }

  createRoleButton(x, y, width, height, roleData, onClick) {
    const container = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, width, height, 0x16213e).setStrokeStyle(2, 0x3a3a5a).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    const hex = `#${roleData.color.toString(16).padStart(6, '0')}`;
    const label = this.add.text(width / 2, 14, roleData.label, { fontFamily: 'monospace', fontSize: '11px', color: hex, fontStyle: 'bold' }).setOrigin(0.5);
    const desc = this.add.text(width / 2, 36, roleData.desc, { fontFamily: 'monospace', fontSize: '9px', color: '#7a7a9e' }).setOrigin(0.5);
    const icon = this.add.text(width / 2, 54, roleData.key, { fontFamily: 'monospace', fontSize: '12px', color: hex }).setOrigin(0.5);
    container.add([bg, label, desc, icon]);

    bg.on('pointerover', () => { if (this.selectedButton !== bg) bg.setFillStyle(0x1e2a4a); });
    bg.on('pointerout', () => { if (this.selectedButton !== bg) bg.setFillStyle(0x16213e); });
    bg.on('pointerdown', onClick);

    container.bg = bg;
    return bg;
  }

  createActionButton(x, y, width, height, label, color, onClick) {
    const container = this.add.container(x, y);
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    const bg = this.add.rectangle(0, 0, width, height, 0x16213e).setStrokeStyle(2, color).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    const text = this.add.text(width / 2, height / 2, label, { fontFamily: 'monospace', fontSize: '14px', color: hex, fontStyle: 'bold' }).setOrigin(0.5);
    container.add([bg, text]);

    bg.on('pointerover', () => { bg.setFillStyle(0x1e2a4a); this.tweens.add({ targets: bg, scaleX: 1.02, scaleY: 1.02, duration: 100, ease: 'Power1' }); });
    bg.on('pointerout', () => { bg.setFillStyle(0x16213e); this.tweens.add({ targets: bg, scaleX: 1, scaleY: 1, duration: 100, ease: 'Power1' }); });
    bg.on('pointerdown', () => { bg.setFillStyle(0x0f1a30); this.tweens.add({ targets: bg, scaleX: 0.98, scaleY: 0.98, duration: 50, ease: 'Power1', yoyo: true, onComplete: onClick }); });

    container.bg = bg;
    container.text = text;
    return bg;
  }
}
