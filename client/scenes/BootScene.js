export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    const barW = 320, barH = 20;
    const barX = (w - barW) / 2;
    const barY = h / 2;

    const bg = this.add.rectangle(w / 2, barY, barW, barH, 0x16213e).setStrokeStyle(2, 0x0f3460);
    const fill = this.add.rectangle(barX, barY - barH / 2, 0, barH - 4, 0xe94560).setOrigin(0, 0);

    const loadingText = this.add.text(w / 2, barY - 40, 'Loading...', {
      fontFamily: 'monospace', fontSize: '18px', color: '#e0e0e0'
    }).setOrigin(0.5);

    const tips = [
      'Keep the reactor cool or it will melt down!',
      'PM repairs machines. LO delivers fuel. RO controls the reactor.',
      'Communication is key — use chat (T) to coordinate.',
      'A meltdown countdown gives you 10 seconds to act.',
      'Radiation zones damage players — evacuate with F!',
      'You can SCRAM the reactor with R or the Control Room button.',
    ];
    const tipText = this.add.text(w / 2, barY + 40, 'Tip: ' + tips[Math.floor(Math.random() * tips.length)], {
      fontFamily: 'monospace', fontSize: '12px', color: '#7a7a9e'
    }).setOrigin(0.5);

    this.load.on('progress', (v) => { fill.width = (barW - 4) * v; });
    this.load.on('complete', () => { loadingText.setText('Initializing systems...'); });

    // Dummy load to trigger the Phaser loader's complete event
    this.load.image('dummy', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
  }

  createTextures() {
    // Player textures with gradient-like look (layered rectangles)
    const playerColors = [0x4fc3f7, 0x81c784, 0xffb74d, 0xba68c8, 0xf06292];
    playerColors.forEach((color, index) => {
      const g = this.make.graphics({ add: false });
      g.fillStyle(darken(color, 40), 1);
      g.fillRoundedRect(0, 0, 32, 48, 6);
      g.fillStyle(color, 0.7);
      g.fillRoundedRect(4, 4, 24, 40, 4);
      g.generateTexture(`player_${index}`, 32, 48);
      g.destroy();
    });

    // Machine textures: rounded squares with inner highlight
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

    const machineTypes = [
      { name: 'machine_reactor', color: 0xe94560, size: 56 },
      { name: 'machine_turbine', color: 0x4fc3f7, size: 48 },
      { name: 'machine_pump', color: 0x29b6f6, size: 42 },
      { name: 'machine_generator', color: 0x66bb6a, size: 48 },
      { name: 'machine_pipe', color: 0x90a4ae, size: 36 },
      { name: 'machine_condenser', color: 0x29b6f6, size: 48 },
      { name: 'machine_control_rods', color: 0xffb74d, size: 36 },
      { name: 'machine_generic', color: 0x607d8b, size: 48 },
    ];
    machineTypes.forEach(({ name, color, size }) => {
      const g = this.make.graphics({ add: false });
      g.fillStyle(darken(color, 60), 1);
      g.fillRoundedRect(0, 0, size, size, 6);
      g.fillStyle(color, 0.8);
      g.fillRoundedRect(3, 3, size - 6, size - 6, 5);
      g.lineStyle(2, lighten(color, 40), 0.6);
      g.strokeRoundedRect(2, 2, size - 4, size - 4, 6);
      g.generateTexture(name, size, size);
      g.destroy();
    });

    // Fuel rod texture
    const rg = this.make.graphics({ add: false });
    rg.fillStyle(0x66bb6a, 1);
    rg.fillRect(0, 0, 12, 44);
    rg.fillStyle(0x81c784, 0.5);
    rg.fillRect(3, 3, 6, 38);
    rg.lineStyle(2, 0x4caf50, 0.8);
    rg.strokeRect(0, 0, 12, 44);
    rg.generateTexture('fuel_rod', 14, 48);
    rg.destroy();

    // Tile floor texture
    const tg = this.make.graphics({ add: false });
    tg.fillStyle(0x1a1a2e, 1);
    tg.fillRect(0, 0, 64, 64);
    tg.lineStyle(1, 0x2a2a4a, 0.3);
    tg.strokeRect(0, 0, 64, 64);
    tg.fillStyle(0x222244, 0.1);
    tg.fillRect(2, 2, 30, 30);
    tg.fillRect(32, 32, 30, 30);
    tg.generateTexture('tile_floor', 64, 64);
    tg.destroy();

    // Pipe texture
    const pg = this.make.graphics({ add: false });
    pg.fillStyle(0x90a4ae, 0.8);
    pg.fillRoundedRect(0, 4, 48, 12, 6);
    pg.lineStyle(2, 0xb0bec5, 0.6);
    pg.strokeRoundedRect(0, 4, 48, 12, 6);
    pg.generateTexture('pipe_h', 48, 20);
    pg.destroy();

    // Glow circle texture
    const gg = this.make.graphics({ add: false });
    gg.fillStyle(0x4fc3f7, 0.3);
    gg.fillCircle(24, 24, 24);
    gg.fillStyle(0x4fc3f7, 0.1);
    gg.fillCircle(24, 24, 40);
    gg.generateTexture('glow_circle', 80, 80);
    gg.destroy();
  }

  create() {
    this.createTextures();

    this.cameras.main.setBackgroundColor('#0a0a14');
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.style.display = 'none';

    this.cameras.main.fadeIn(500, 10, 10, 20);
    this.time.delayedCall(500, () => this.scene.start('Menu'));
  }
}
