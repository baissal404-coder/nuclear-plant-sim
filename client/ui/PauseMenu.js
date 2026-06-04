import strings from '../../shared/strings.js';
import { audioManager } from '../main.js';

export class PauseMenu {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
    this.open = false;
  }

  create() {
    this.container = this.scene.add.container(0, 0).setDepth(500).setScrollFactor(0).setVisible(false);
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;

    this.overlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.7).setInteractive();
    this.container.add(this.overlay);

    this.panelBg = this.scene.add.graphics();
    this.panelBg.fillStyle(0x1a1a2e, 1);
    this.panelBg.fillRoundedRect(w / 2 - 160, h / 2 - 180, 320, 360, 16);
    this.panelBg.lineStyle(2, 0x4fc3f7, 0.6);
    this.panelBg.strokeRoundedRect(w / 2 - 160, h / 2 - 180, 320, 360, 16);
    this.container.add(this.panelBg);

    this.title = this.scene.add.text(w / 2, h / 2 - 150, 'PAUSED', {
      fontFamily: 'monospace', fontSize: '24px', color: '#e94560', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.container.add(this.title);

    const buttons = [
      { label: strings.UI.resume, action: () => this.close() },
      { label: `${strings.UI.volume}: ${Math.round(audioManager.masterVolume * 100)}%`, action: () => this._cycleVolume(), id: 'vol' },
      { label: `${strings.UI.color_blind}: OFF`, action: () => this._toggleCB(), id: 'cb' },
      { label: strings.UI.controls, action: () => this._showControls() },
      { label: strings.UI.leave, action: () => this._leave() },
    ];

    this.buttons = [];
    buttons.forEach((btnDef, i) => {
      const y = h / 2 - 100 + i * 55;
      const bg = this.scene.add.text(w / 2, y, btnDef.label, {
        fontFamily: 'monospace', fontSize: '14px', color: '#b0b0d0',
        backgroundColor: '#0d0d1a', padding: { x: 12, y: 6 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setBackgroundColor('#16213e'));
      bg.on('pointerout', () => bg.setBackgroundColor('#0d0d1a'));
      bg.on('pointerdown', btnDef.action);
      bg._id = btnDef.id;
      this.container.add(bg);
      this.buttons.push(bg);
    });

    this.scene.input.keyboard.on('keydown', (event) => {
      if (event.key === 'Escape' && this.open) this.close();
    });
  }

  _getBtn(id) { return this.buttons.find(b => b._id === id); }

  _cycleVolume() {
    const vol = [0, 0.25, 0.5, 0.75, 1];
    const idx = vol.indexOf(audioManager.masterVolume);
    const next = vol[(idx + 1) % vol.length];
    audioManager.setVolume(next);
    const btn = this._getBtn('vol');
    if (btn) btn.setText(`${strings.UI.volume}: ${Math.round(next * 100)}%`);
  }

  _toggleCB() {
    const cb = !this._colorBlind;
    this._colorBlind = cb;
    const btn = this._getBtn('cb');
    if (btn) btn.setText(`${strings.UI.color_blind}: ${cb ? 'ON' : 'OFF'}`);
    document.documentElement.classList.toggle('color-blind', cb);
  }

  _showControls() {
    this.overlay.removeInteractive();
    this.container.setVisible(false);
    const c = this.scene.add.container(0, 0).setDepth(550).setScrollFactor(0);
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;

    const ov = this.scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.8).setInteractive();
    c.add(ov);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRoundedRect(w / 2 - 250, h / 2 - 180, 500, 360, 16);
    bg.lineStyle(2, 0x4fc3f7, 0.6);
    bg.strokeRoundedRect(w / 2 - 250, h / 2 - 180, 500, 360, 16);
    c.add(bg);

    const title = this.scene.add.text(w / 2, h / 2 - 150, strings.UI.controls, {
      fontFamily: 'monospace', fontSize: '20px', color: '#4fc3f7', fontStyle: 'bold'
    }).setOrigin(0.5);
    c.add(title);

    const binds = [
      'WASD / Arrows — Move',
      'E — Interact / Repair / Deliver',
      'T — Open Chat',
      'Tab — Toggle Plant Status / Switch Chat',
      'ESC — Pause / Close',
      'V — Vent Steam',
      'R — Manual SCRAM',
      'F — Evacuate Radiation Zone',
    ];
    binds.forEach((line, i) => {
      const t = this.scene.add.text(w / 2, h / 2 - 110 + i * 26, line, {
        fontFamily: 'monospace', fontSize: '12px', color: '#b0b0d0'
      }).setOrigin(0.5);
      c.add(t);
    });

    const closeBtn = this.scene.add.text(w / 2, h / 2 + 140, strings.UI.back, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
      backgroundColor: '#16213e', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    c.add(closeBtn);

    closeBtn.on('pointerdown', () => { c.destroy(true); this.container.setVisible(true); this.overlay.setInteractive(); });
    ov.on('pointerdown', () => { c.destroy(true); this.container.setVisible(true); this.overlay.setInteractive(); });
  }

  _leave() {
    this.close();
    window.location.reload();
  }

  toggle() {
    if (this.open) this.close();
    else this.open();
  }

  open() {
    this.open = true;
    this.container.setVisible(true);
    this.container.setAlpha(0);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: 200, ease: 'Power2' });
  }

  close() {
    this.open = false;
    this.container.setVisible(false);
  }

  destroy() {
    if (this.container) this.container.destroy();
  }
}
