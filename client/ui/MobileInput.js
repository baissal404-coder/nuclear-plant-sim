export class MobileInput {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
    this.joystickBase = null;
    this.joystickThumb = null;
    this.dx = 0;
    this.dy = 0;
    this.actionButtons = {};
    this.active = false;
    this._touchId = null;
    this._isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  isMobile() { return this._isMobile; }

  create() {
    if (!this._isMobile) return;
    this.active = true;
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;
    this.container = this.scene.add.container(0, 0).setDepth(400).setScrollFactor(0);

    const jsX = 120, jsY = h - 120, jsR = 60;
    this.joystickBase = this.scene.add.circle(jsX, jsY, jsR, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.3);
    this.container.add(this.joystickBase);
    this.joystickThumb = this.scene.add.circle(jsX, jsY, 25, 0x4fc3f7, 0.5);
    this.container.add(this.joystickThumb);
    this._jsOrigin = { x: jsX, y: jsY };
    this._jsR = jsR;

    this.joystickBase.setInteractive({ draggable: true });
    this.joystickBase.on('drag', (pointer, dx, dy) => {
      if (this._touchId && this._touchId !== pointer.id) return;
      this._touchId = pointer.id;
      const ox = this._jsOrigin.x, oy = this._jsOrigin.y;
      let nx = ox + dx, ny = oy + dy;
      const dist = Math.sqrt((nx - ox) ** 2 + (ny - oy) ** 2);
      if (dist > jsR) { nx = ox + (nx - ox) / dist * jsR; ny = oy + (ny - oy) / dist * jsR; }
      this.joystickThumb.setPosition(nx, ny);
      this.dx = (nx - ox) / jsR;
      this.dy = (ny - oy) / jsR;
    });
    this.joystickBase.on('dragend', () => {
      this._touchId = null;
      this.joystickThumb.setPosition(this._jsOrigin.x, this._jsOrigin.y);
      this.dx = 0;
      this.dy = 0;
    });

    const btnDefs = [
      { id: 'interact', label: 'E', x: w - 80, y: h - 120, color: 0x4fc3f7, key: 'e' },
      { id: 'sprint', label: '>>', x: w - 80, y: h - 200, color: 0xffb74d, key: 'shift' },
      { id: 'action', label: 'F', x: w - 160, y: h - 120, color: 0xe94560, key: 'f' },
    ];

    btnDefs.forEach(def => {
      const btn = this.scene.add.circle(def.x, def.y, 28, def.color, 0.5).setStrokeStyle(2, def.color, 0.8);
      btn.setInteractive({ useHandCursor: true });
      this.container.add(btn);
      const label = this.scene.add.text(def.x, def.y, def.label, {
        fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.container.add(label);
      this.actionButtons[def.id] = { btn, label, pressed: false, key: def.key };
    });
  }

  isPressed(key) {
    for (const act of Object.values(this.actionButtons)) {
      if (act.key === key && act.pressed) return true;
    }
    return false;
  }

  getMovement() {
    return { dx: this.dx, dy: this.dy };
  }

  update() {}

  destroy() {
    if (this.container) this.container.destroy();
  }
}
