import { networkManager } from '../network.js';

export class CraneScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Crane' });
    this.crane = null;
    this.fuelRods = [];
    this.storageArea = null;
    this.targetArea = null;
    this.carryingRod = null;
    this.moveSpeed = 200;
    this.spaceKey = null;
    this.cursors = null;
    this.score = 0;
    this.targetCount = 5;
    this.completedCount = 0;
    this.roomCode = '';
    this.playerRole = '';
    this.hudText = null;
    this.feedbackText = null;
    this.rodSnapPositions = [];
    this.targetSnapPositions = [];
    this.exitKey = null;
  }

  create(data) {
    this.roomCode = data.roomCode || 'SINGLE';
    this.playerRole = data.role || 'LO';

    if (this.playerRole !== 'LO') {
      this.add.text(640, 360, 'ACCESS DENIED', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#e94560'
      }).setOrigin(0.5);
      this.add.text(640, 400, 'Logistics Operator Role Required', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#9090b0'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => this.scene.stop());
      return;
    }

    this.cameras.main.setBackgroundColor('#0d0d1a');
    this.createBackground();
    this.createAreas();
    this.createFuelRods();
    this.createCrane();
    this.createHUD();
    this.setupInput();
    this.updateFuelCount();
  }

  createBackground() {
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x1a1a3a, 0.4);

    for (let x = 0; x < 1280; x += 40) {
      gfx.moveTo(x, 0);
      gfx.lineTo(x, 720);
    }
    for (let y = 0; y < 720; y += 40) {
      gfx.moveTo(0, y);
      gfx.lineTo(1280, y);
    }
    gfx.strokePath();
  }

  createAreas() {
    // Storage area (left side)
    this.storageArea = this.add.rectangle(180, 360, 280, 500, 0x16213e, 0.3);
    this.storageArea.setStrokeStyle(2, 0x66bb6a);

    this.add.text(180, 80, 'FUEL ROD\nSTORAGE', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#66bb6a',
      align: 'center',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Target area (right side)
    this.targetArea = this.add.rectangle(1000, 360, 280, 500, 0x16213e, 0.3);
    this.targetArea.setStrokeStyle(2, 0x4fc3f7);

    this.add.text(1000, 80, 'REACTOR\nCORE LOADING', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#4fc3f7',
      align: 'center',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Generate snap positions for storage
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        this.rodSnapPositions.push({
          x: 80 + col * 60,
          y: 150 + row * 80,
          occupied: false
        });
      }
    }

    // Generate snap positions for target
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        this.targetSnapPositions.push({
          x: 900 + col * 60,
          y: 150 + row * 80,
          occupied: false
        });
      }
    }
  }

  createFuelRods() {
    this.targetCount = 5;

    for (let i = 0; i < this.targetCount; i++) {
      const snapPos = this.rodSnapPositions[i];
      if (snapPos) {
        const rod = this.createRod(snapPos.x, snapPos.y, `rod_${i}`);
        snapPos.occupied = true;
        this.fuelRods.push(rod);
      }
    }
  }

  createRod(x, y, id) {
    // Create rod texture
    const gfx = this.make.graphics({ add: false });
    gfx.fillStyle(0x66bb6a, 1);
    gfx.fillRect(0, 0, 14, 50);
    gfx.lineStyle(2, 0x81c784, 1);
    gfx.strokeRect(0, 0, 14, 50);
    gfx.generateTexture(`rod_${id}`, 14, 50);
    gfx.destroy();

    const rod = this.add.sprite(x, y, `rod_${id}`);
    rod.rodId = id;
    rod.isPlaced = false;
    rod.setInteractive({ useHandCursor: true });

    rod.on('pointerdown', () => {
      if (!this.carryingRod) {
        this.pickupRod(rod);
      }
    });

    return rod;
  }

  createCrane() {
    // Crane beam (horizontal)
    this.craneBeam = this.add.rectangle(640, 50, 1100, 8, 0x78909c);
    this.craneBeam.setDepth(5);

    // Crane trolley
    this.craneTrolley = this.add.rectangle(640, 50, 40, 24, 0x607d8b);
    this.craneTrolley.setStrokeStyle(2, 0x90a4ae);
    this.craneTrolley.setDepth(6);

    // Cable
    this.craneCable = this.add.rectangle(640, 70, 3, 50, 0xb0bec5);
    this.craneCable.setDepth(5);

    // Hook
    this.craneHook = this.add.triangle(640, 122, 0, 0, 10, 14, -10, 14, 0xffcc80);
    this.craneHook.setDepth(6);

    this.crane = {
      x: 640,
      y: 50
    };
  }

  createHUD() {
    const hudContainer = this.add.container(0, 0);
    hudContainer.setScrollFactor(0);
    hudContainer.setDepth(100);

    const bg = this.add.rectangle(640, 30, 350, 44, 0x000000, 0.7);
    bg.setStrokeStyle(1, 0x3a3a5a);

    this.hudText = this.add.text(640, 32, `Fuel Rods: 0 / ${this.targetCount}`, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#66bb6a',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    hudContainer.add([bg, this.hudText]);

    // Instructions
    const instrBg = this.add.rectangle(640, 680, 600, 30, 0x000000, 0.5);
    instrBg.setOrigin(0.5, 1);
    const instrText = this.add.text(640, 670, '← → : Move Crane | Click Rod: Pick Up | SPACE: Drop | ESC: Exit', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#7a7a9e'
    }).setOrigin(0.5);

    hudContainer.add([instrBg, instrText]);

    // Feedback
    this.feedbackText = this.add.text(640, 350, '', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(110);
    this.feedbackText.setAlpha(0);
  }

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.exitKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.dropKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  update(time, delta) {
    this.processInput(delta);
    this.updateCranePosition();
    this.checkPlacement();
    this.updateVisuals();
    this.checkExitKey();
    if (this.carryingRod && Phaser.Input.Keyboard.JustDown(this.dropKey)) {
      this.dropRod();
    }
  }

  checkExitKey() {
    if (Phaser.Input.Keyboard.JustDown(this.exitKey)) {
      this.scene.stop();
      this.scene.resume('Game');
    }
  }

  processInput(delta) {
    if (!this.crane) return;

    const speed = this.moveSpeed * (delta / 1000);

    if (this.cursors.left.isDown) {
      this.crane.x -= speed;
    }
    if (this.cursors.right.isDown) {
      this.crane.x += speed;
    }

    this.crane.x = Phaser.Math.Clamp(this.crane.x, 100, 1180);
  }

  updateCranePosition() {
    if (!this.crane) return;

    this.craneTrolley.x = this.crane.x;
    this.craneCable.x = this.crane.x;

    const cableLength = this.carryingRod ? 100 : 50;
    this.craneCable.height = cableLength;
    this.craneCable.y = 60 + cableLength / 2;

    this.craneHook.x = this.crane.x;
    this.craneHook.y = 60 + cableLength + 10;

    if (this.carryingRod) {
      this.carryingRod.x = this.crane.x;
      this.carryingRod.y = this.craneHook.y + 25;
    }
  }

  pickupRod(rod) {
    if (this.carryingRod || rod.isPlaced) return;

    this.carryingRod = rod;
    rod.disableInteractive();

    // Free snap position
    this.rodSnapPositions.forEach(pos => {
      if (Math.abs(pos.x - rod.x) < 30 && Math.abs(pos.y - rod.y) < 30) {
        pos.occupied = false;
      }
    });

    rod.setTint(0xffcc80);
    this.showFeedback('Rod picked up!', '#ffcc80');
  }

  dropRod() {
    if (!this.carryingRod) return;

    const rod = this.carryingRod;
    const snapTarget = this.findNearestSnap(rod.x, rod.y, this.targetSnapPositions);

    // Check if in target zone
    if (rod.x > 850 && rod.x < 1150 && snapTarget && !snapTarget.occupied) {
      rod.x = snapTarget.x;
      rod.y = snapTarget.y;
      snapTarget.occupied = true;
      rod.isPlaced = true;
      rod.setTint(0x4fc3f7);

      this.completedCount++;
      this.updateFuelCount();

      networkManager.sendFuelDelivery({ reactorId: 'reactor_1' });

      this.showFeedback(`Rod placed! (${this.completedCount}/${this.targetCount})`, '#66bb6a');

      if (this.completedCount >= this.targetCount) {
        this.showFeedback('ALL RODS LOADED!', '#66bb6a');
        this.time.delayedCall(2000, () => {
          this.scene.stop();
          this.scene.resume('Game');
        });
      }
    } else {
      // Return to storage
      const storageSnap = this.findNearestSnap(rod.x, rod.y, this.rodSnapPositions);
      if (storageSnap && !storageSnap.occupied) {
        rod.x = storageSnap.x;
        rod.y = storageSnap.y;
        storageSnap.occupied = true;
        this.showFeedback('Returned to storage', '#ffb74d');
      } else {
        rod.x = 180;
        rod.y = 500;
        this.showFeedback('Dropped', '#e94560');
      }

      rod.setTint(0x66bb6a);
    }

    rod.setInteractive({ useHandCursor: true });
    this.carryingRod = null;
  }

  findNearestSnap(x, y, snapPositions) {
    let nearest = null;
    let nearestDist = Infinity;

    snapPositions.forEach(pos => {
      const dist = Phaser.Math.Distance.Between(x, y, pos.x, pos.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = pos;
      }
    });

    return nearestDist < 50 ? nearest : null;
  }

  checkPlacement() {
    if (this.carryingRod) {
      const inTarget = this.carryingRod.x > 800;
      this.targetArea.setFillStyle(inTarget ? 0x1a3a2e : 0x16213e, inTarget ? 0.5 : 0.3);

      const inStorage = this.carryingRod.x < 350;
      this.storageArea.setFillStyle(inStorage ? 0x1a2a1e : 0x16213e, inStorage ? 0.5 : 0.3);
    } else {
      this.targetArea.setFillStyle(0x16213e, 0.3);
      this.storageArea.setFillStyle(0x16213e, 0.3);
    }
  }

  updateVisuals() {
    this.fuelRods.forEach(rod => {
      if (!rod.isPlaced && rod !== this.carryingRod) {
        const pulse = Math.sin(Date.now() / 500 + rod.x * 0.01) * 0.2 + 0.8;
        rod.setAlpha(pulse);
      }
    });

    if (this.carryingRod) {
      const swing = Math.sin(Date.now() / 250) * 3;
      this.craneCable.x = this.crane.x + swing;
      this.craneHook.x = this.crane.x + swing;
    }
  }

  updateFuelCount() {
    if (this.hudText) {
      this.hudText.setText(`Fuel Rods: ${this.completedCount} / ${this.targetCount}`);
      if (this.completedCount >= this.targetCount) {
        this.hudText.setColor('#66bb6a');
      }
    }
  }

  showFeedback(message, color) {
    if (!this.feedbackText) return;

    this.feedbackText.setText(message);
    this.feedbackText.setColor(color);
    this.feedbackText.setAlpha(1);

    this.tweens.killTweensOf(this.feedbackText);
    this.tweens.add({
      targets: this.feedbackText,
      alpha: 0,
      y: 330,
      duration: 1500,
      ease: 'Power2',
      delay: 500,
      onComplete: () => {
        this.feedbackText.y = 350;
      }
    });
  }
}
