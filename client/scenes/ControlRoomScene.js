import { EVENT_NAMES } from '../../shared/constants.js';
import { networkManager } from '../network.js';
import { audioManager } from '../main.js';

export class ControlRoomScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ControlRoom' });
    this.sliders = {}; this.gauges = {}; this.scramButton = null;
    this.warningFlashes = {}; this.roomCode = ''; this.playerRole = '';
    this.lastState = null; this.exitKey = null;
    this._ledState = false; this._emergencyLights = false;
  }

  create(data) {
    this.roomCode = data.roomCode || 'SINGLE';
    this.playerRole = data.role || 'RO';

    if (this.playerRole !== 'RO') {
      this.add.text(640, 360, 'ACCESS DENIED', { fontFamily: 'monospace', fontSize: '24px', color: '#e94560' }).setOrigin(0.5);
      this.time.delayedCall(2000, () => { this.cameras.main.fadeOut(200); this.time.delayedCall(200, () => this.scene.stop()); });
      return;
    }

    this.cameras.main.fadeIn(400, 10, 10, 20);
    this.cameras.main.setBackgroundColor('#0d0d1a');

    this.createBackground();
    this.createControlPanel();
    this.createAnalogGauges();
    this.createSCRAMButton();
    this.createStatusDisplay();
    this.createExitButton();
    this.setupInput();
    this.setupStateListeners();

    audioManager.play('button_click', 0.3);
  }

  createBackground() {
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x1a1a3a, 0.3);
    for (let x = 0; x < 1280; x += 40) { gfx.moveTo(x, 0); gfx.lineTo(x, 720); }
    for (let y = 0; y < 720; y += 40) { gfx.moveTo(0, y); gfx.lineTo(1280, y); }
    gfx.strokePath();

    this.add.text(640, 20, 'REACTOR CONTROL CENTER', {
      fontFamily: 'monospace', fontSize: '20px', color: '#e94560', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.ledIndicator = this.add.circle(1200, 30, 6, 0x4fc3f7, 1).setDepth(10);
  }

  createAnalogGauges() {
    const cx = 380, cy = 70;
    const gaugeDefs = [
      { key: 'heat', label: 'REACTOR HEAT', x: cx + 60, y: cy + 70, min: 0, max: 1000, color: 0xff9800 },
      { key: 'mw', label: 'POWER MW', x: cx + 200, y: cy + 70, min: 0, max: 200, color: 0x4fc3f7 },
      { key: 'rad', label: 'RADIATION', x: cx + 340, y: cy + 70, min: 0, max: 100, color: 0x66bb6a },
      { key: 'rpm', label: 'TURBINE RPM', x: cx + 60, y: cy + 195, min: 0, max: 3600, color: 0xce93d8 },
      { key: 'press', label: 'STEAM PRESS', x: cx + 200, y: cy + 195, min: 0, max: 100, color: 0xffcc80 },
      { key: 'coolant', label: 'COOLANT %', x: cx + 340, y: cy + 195, min: 0, max: 100, color: 0x29b6f6 },
    ];

    gaugeDefs.forEach(def => {
      const r = 35;
      const gfx = this.add.graphics();
      gfx.lineStyle(3, 0x2a2a4a, 0.8);
      gfx.strokeCircle(def.x, def.y, r);
      gfx.fillStyle(0x0a0a14, 1);
      gfx.fillCircle(def.x, def.y, r - 2);

      const needle = this.add.graphics();
      this.gauges[def.key] = { needle, gfx, x: def.x, y: def.y, r, min: def.min, max: def.max, color: def.color, value: 0 };

      // Label
      this.add.text(def.x, def.y + r + 12, def.label, {
        fontFamily: 'monospace', fontSize: '8px', color: '#9090b0',
      }).setOrigin(0.5);
    });

    // Numeric readout
    this.gaugeTexts = {};
    gaugeDefs.forEach(def => {
      this.gaugeTexts[def.key] = this.add.text(def.x, def.y - 5, '0', {
        fontFamily: 'monospace', fontSize: '10px', color: `#${def.color.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold',
      }).setOrigin(0.5);
    });
  }

  updateAnalogGauges() {
    if (!this.lastState) return;
    const state = this.lastState;
    const reactor = state.machines.find(m => m.id === 'reactor_1');
    const turbine1 = state.machines.find(m => m.id === 'turbine_1');
    const pump1 = state.machines.find(m => m.id === 'pump_1');

    const updates = {
      heat: reactor ? reactor.state.heat : 0,
      mw: state.totalOutput || 0,
      rad: state.radiationLevel || 0,
      rpm: turbine1 ? turbine1.state.rpm : 0,
      press: turbine1 ? turbine1.state.steamPressure : 0,
      coolant: pump1 ? pump1.state.speed : 0,
    };

    for (const [key, value] of Object.entries(updates)) {
      this.updateAnalogGauge(key, value);
    }
  }

  updateAnalogGauge(key, value) {
    const gauge = this.gauges[key];
    if (!gauge) return;
    gauge.value = value;
    const ratio = (value - gauge.min) / (gauge.max - gauge.min);
    const angle = -135 + ratio * 270;

    const rad = angle * (Math.PI / 180);
    const len = gauge.r - 8;
    const ex = gauge.x + Math.cos(rad) * len;
    const ey = gauge.y + Math.sin(rad) * len;

    gauge.needle.clear();
    gauge.needle.lineStyle(2, gauge.color, 0.9);
    gauge.needle.beginPath();
    gauge.needle.moveTo(gauge.x, gauge.y);
    gauge.needle.lineTo(ex, ey);
    gauge.needle.strokePath();

    // Tick marks
    gauge.gfx.clear();
    gauge.gfx.lineStyle(3, 0x2a2a4a, 0.8);
    gauge.gfx.strokeCircle(gauge.x, gauge.y, gauge.r);
    for (let i = 0; i <= 10; i++) {
      const a = (-135 + i * 27) * (Math.PI / 180);
      const inner = gauge.r - 5;
      const outer = gauge.r - 1;
      gauge.gfx.lineStyle(1, 0x4a4a6a, 0.5);
      gauge.gfx.beginPath();
      gauge.gfx.moveTo(gauge.x + Math.cos(a) * inner, gauge.y + Math.sin(a) * inner);
      gauge.gfx.lineTo(gauge.x + Math.cos(a) * outer, gauge.y + Math.sin(a) * outer);
      gauge.gfx.strokePath();
    }

    // Update numeric readout
    if (this.gaugeTexts && this.gaugeTexts[key]) {
      this.gaugeTexts[key].setText(Math.round(value));
      const danger = ratio > 0.9 ? 0xe94560 : ratio > 0.7 ? 0xffb74d : gauge.color;
      this.gaugeTexts[key].setColor(`#${danger.toString(16).padStart(6, '0')}`);
    }
  }

  createControlPanel() {
    this.add.text(40, 60, 'REACTOR CONTROLS', {
      fontFamily: 'monospace', fontSize: '14px', color: '#e94560', fontStyle: 'bold'
    });

    this.createSlider(40, 100, 'CONTROL ROD INSERTION', 0, 100, 50, (v) => {
      networkManager.sendReactorCommand(EVENT_NAMES.REACTOR_CONTROL_RODS, { insertionLevel: v });
    });
    this.createSlider(40, 200, 'COOLANT PUMP A SPEED', 0, 100, 50, (v) => {
      networkManager.sendReactorCommand(EVENT_NAMES.PUMP_SPEED_CHANGE, { pumpId: 'pump_1', speed: v });
    });
    this.createSlider(40, 300, 'COOLANT PUMP B SPEED', 0, 100, 50, (v) => {
      networkManager.sendReactorCommand(EVENT_NAMES.PUMP_SPEED_CHANGE, { pumpId: 'pump_2', speed: v });
    });
  }

  createSlider(x, y, label, min, max, initial, onChange) {
    const sw = 280, sh = 14;

    this.add.text(x, y - 20, label, { fontFamily: 'monospace', fontSize: '11px', color: '#9090b0' });
    this.add.text(x, y + sh + 2, `${min}`, { fontFamily: 'monospace', fontSize: '8px', color: '#5a5a7a' });
    this.add.text(x + sw - 20, y + sh + 2, `${max}`, { fontFamily: 'monospace', fontSize: '8px', color: '#5a5a7a' });

    const trackBg = this.add.rectangle(x, y, sw, sh, 0x16213e).setStrokeStyle(1, 0x3a3a5a).setOrigin(0, 0);
    const fillW = ((initial - min) / (max - min)) * sw;
    const trackFill = this.add.rectangle(x, y, fillW, sh - 2, 0x4fc3f7).setOrigin(0, 0);
    const handleX = x + fillW;
    const handle = this.add.circle(handleX, y + sh / 2, 10, 0xffffff).setStrokeStyle(2, 0x4fc3f7).setInteractive({ draggable: true, useHandCursor: true });
    const valueText = this.add.text(x + sw + 20, y + 2, `${initial}`, { fontFamily: 'monospace', fontSize: '12px', color: '#4fc3f7', fontStyle: 'bold' }).setOrigin(0, 0.5);

    let currentValue = initial;
    handle.on('drag', (pointer, dragX) => {
      const cx = Phaser.Math.Clamp(dragX, x, x + sw);
      handle.x = cx;
      trackFill.width = cx - x;
      const ratio = (cx - x) / sw;
      currentValue = Math.round(min + ratio * (max - min));
      valueText.setText(`${currentValue}`);
      trackFill.setFillStyle(currentValue > 80 ? 0xe94560 : currentValue > 50 ? 0xffb74d : 0x4fc3f7);
    });
    handle.on('dragend', () => onChange(currentValue));

    this.sliders[label] = { handle, trackFill, valueText, min, max, getValue: () => currentValue, setValue: (val) => {
      currentValue = val;
      const ratio = (val - min) / (max - min);
      handle.x = x + ratio * sw;
      trackFill.width = ratio * sw;
      valueText.setText(`${val}`);
    }};
  }

  createSCRAMButton() {
    const bx = 40, by = 420, bw = 180, bh = 70;

    const bg = this.add.rectangle(bx, by, bw, bh, 0xb71c1c).setStrokeStyle(3, 0xff1744).setOrigin(0, 0).setInteractive({ useHandCursor: true });

    this.add.text(bx + bw / 2, by + bh / 2 - 8, 'SCRAM', {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(bx + bw / 2, by + bh / 2 + 14, 'EMERGENCY SHUTDOWN', {
      fontFamily: 'monospace', fontSize: '8px', color: '#ff5252'
    }).setOrigin(0.5);

    // Glow effect
    this.scramGlow = this.add.circle(bx + bw / 2, by + bh / 2, 50, 0xff0000, 0.08).setDepth(1);

    bg.on('pointerover', () => { bg.setFillStyle(0xd32f2f); this.tweens.add({ targets: this.scramGlow, alpha: 0.3, duration: 200 }); });
    bg.on('pointerout', () => { bg.setFillStyle(0xb71c1c); this.tweens.add({ targets: this.scramGlow, alpha: 0.08, duration: 200 }); });
    bg.on('pointerdown', () => this.confirmSCRAM());

    this.scramButton = { bg };

    // Emergency light
    this.emergencyLight = this.add.circle(30, 30, 15, 0xff4444, 0.3).setDepth(10);
  }

  confirmSCRAM() {
    const overlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.8).setDepth(50);
    const modalBg = this.add.rectangle(640, 360, 420, 220, 0x1a1a2e).setStrokeStyle(3, 0xe94560).setDepth(51);
    this.add.text(640, 290, '⚠ CONFIRM SCRAM ⚠', { fontFamily: 'monospace', fontSize: '22px', color: '#e94560', fontStyle: 'bold' }).setOrigin(0.5).setDepth(51);
    this.add.text(640, 340, 'This will perform an emergency shutdown.\nAll control rods will be inserted.\nHeat will begin to drop.', {
      fontFamily: 'monospace', fontSize: '12px', color: '#b0b0d0', align: 'center'
    }).setOrigin(0.5).setDepth(51);

    const yesBtn = this.add.rectangle(560, 410, 120, 45, 0xb71c1c).setStrokeStyle(2, 0xff1744).setInteractive({ useHandCursor: true }).setDepth(51);
    this.add.text(560, 412, 'SCRAM!', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(51);
    const noBtn = this.add.rectangle(720, 410, 120, 45, 0x2a2a4a).setStrokeStyle(2, 0x5a5a7a).setInteractive({ useHandCursor: true }).setDepth(51);
    this.add.text(720, 412, 'CANCEL', { fontFamily: 'monospace', fontSize: '14px', color: '#9090b0' }).setOrigin(0.5).setDepth(51);

    const cleanup = () => { overlay.destroy(); modalBg.destroy(); this.children.list.filter(c => c.depth > 50).forEach(c => c.destroy()); };
    yesBtn.on('pointerdown', () => {
      networkManager.sendReactorCommand(EVENT_NAMES.REACTOR_SCRAM);
      audioManager.play('scram', 0.7);
      this.showFloatingText(640, 360, 'SCRAM ACTIVATED', '#ff1744');
      cleanup();
    });
    noBtn.on('pointerdown', cleanup);
  }

  createStatusDisplay() {
    const px = 380, py = 60, pw = 550, ph = 400;
    this.add.rectangle(px, py, pw, ph, 0x111122, 1).setStrokeStyle(2, 0x3a3a5a).setOrigin(0, 0);
    this.add.text(px + 10, py + 10, 'REAL-TIME PLANT STATUS', { fontFamily: 'monospace', fontSize: '14px', color: '#4fc3f7', fontStyle: 'bold' });

    // Machine status
    this.add.text(px + 10, py + 285, 'MACHINE STATUS', { fontFamily: 'monospace', fontSize: '12px', color: '#ffb74d' });

    this.machineStatusDots = [];
    const names = [
      { id: 'reactor_1', label: 'Reactor' }, { id: 'turbine_1', label: 'Turbine 1' }, { id: 'turbine_2', label: 'Turbine 2' },
      { id: 'generator_1', label: 'Gen 1' }, { id: 'generator_2', label: 'Gen 2' }, { id: 'condenser_1', label: 'Condenser' },
    ];
    names.forEach((m, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = px + 30 + col * 180, y = py + 305 + row * 50;
      this.add.text(x, y, m.label, { fontFamily: 'monospace', fontSize: '10px', color: '#9090b0' });
      const dot = this.add.circle(x + 70, y + 4, 8, 0x66bb6a);
      this.machineStatusDots.push({ dot, id: m.id });
    });
  }

  createExitButton() {
    const btn = this.add.rectangle(1100, 30, 80, 30, 0x2a2a4a).setStrokeStyle(1, 0x5a5a7a).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.add.text(1140, 45, 'EXIT', { fontFamily: 'monospace', fontSize: '11px', color: '#9090b0' }).setOrigin(0.5);
    btn.on('pointerdown', () => { this.cameras.main.fadeOut(200); this.time.delayedCall(200, () => { this.scene.stop(); this.scene.resume('Game'); }); });
  }

  setupInput() {
    this.exitKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

  setupStateListeners() {
    networkManager.onStateUpdate((state) => { this.lastState = state; });
    networkManager.on(EVENT_NAMES.REACTOR_SCRAM, () => this.showFloatingText(640, 300, '⚠ SCRAM ACTIVATED ⚠', '#ff1744'));
    networkManager.on(EVENT_NAMES.BLACKOUT_WARNING, (d) => {
      if (d?.active) {
        this._emergencyLights = true;
        this.showFloatingText(640, 200, '⚠ EMERGENCY POWER ONLY ⚠', '#ff5252');
      } else {
        this._emergencyLights = false;
      }
    });
  }

  update(time, delta) {
    this.updateGaugeDisplays();
    this.updateAnalogGauges();
    this.updateLED();
    this.updateEmergencyLights();
    this.updateSCRAMGlow();
    this.checkExitKey();
  }

  checkExitKey() {
    if (Phaser.Input.Keyboard.JustDown(this.exitKey)) {
      this.cameras.main.fadeOut(200);
      this.time.delayedCall(200, () => { this.scene.stop(); this.scene.resume('Game'); });
    }
  }

  updateLED() {
    this._ledState = !this._ledState;
    this.ledIndicator.setFillStyle(this._ledState ? 0x4fc3f7 : 0x1a3a5a);
  }

  updateEmergencyLights() {
    if (this._emergencyLights) {
      const flicker = Math.random() > 0.9 ? 0.1 : 0.4 + Math.sin(Date.now() / 100) * 0.1;
      this.emergencyLight.setAlpha(flicker);
    } else {
      this.emergencyLight.setAlpha(0.3);
    }
  }

  updateSCRAMGlow() {
    if (!this.lastState) return;
    const reactor = this.lastState.machines.find(m => m.id === 'reactor_1');
    if (reactor && reactor.state.heat > 700) {
      const intensity = Math.min(0.25, (reactor.state.heat - 700) / 1200);
      this.scramGlow.setAlpha(intensity + Math.sin(Date.now() / 150) * 0.05);
      this.scramGlow.setScale(1 + Math.sin(Date.now() / 200) * 0.1);
    } else {
      this.scramGlow.setAlpha(0.05);
    }
  }

  updateGaugeDisplays() {
    if (!this.lastState) return;
    const state = this.lastState;
    const reactor = state.machines.find(m => m.id === 'reactor_1');
    const pump1 = state.machines.find(m => m.id === 'pump_1');
    const turbine1 = state.machines.find(m => m.id === 'turbine_1');

    this.machineStatusDots?.forEach(({ dot, id }) => {
      const m = state.machines.find(x => x.id === id);
      if (m) {
        const ratio = m.hp / m.maxHp;
        dot.setFillStyle(ratio < 0.3 ? 0xe94560 : ratio < 0.7 ? 0xffb74d : 0x66bb6a);
      }
    });
  }

  showFloatingText(x, y, msg, color) {
    const text = this.add.text(x, y, msg, {
      fontFamily: 'monospace', fontSize: '20px', color, fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(60).setAlpha(0);

    this.tweens.add({ targets: text, alpha: 1, duration: 150, ease: 'Power2' });
    this.tweens.add({
      targets: text, y: y - 50, alpha: 0, duration: 2000, ease: 'Power2', delay: 0.5,
      onComplete: () => text.destroy()
    });
  }
}
