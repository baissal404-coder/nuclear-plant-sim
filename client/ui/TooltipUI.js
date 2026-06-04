import strings from '../../shared/strings.js';
import { MACHINE_TYPES } from '../../shared/constants.js';

const TOOLTIP_CONFIGS = {
  [MACHINE_TYPES.REACTOR]: { key: 'reactor', fields: { heat: 'state.heat', rods: 'state.controlRodInsertion' }, statusField: 'hp' },
  [MACHINE_TYPES.TURBINE]: { key: 'turbine', fields: { rpm: 'state.rpm', pressure: 'state.steamPressure' }, statusField: 'hp' },
  [MACHINE_TYPES.PUMP]: { key: 'pump', fields: { speed: 'state.speed', coolant: 'state.coolantLevel' }, statusField: 'hp' },
  [MACHINE_TYPES.GENERATOR]: { key: 'generator', fields: { mw: 'state.outputMW', rpm: 'state.rpm' }, statusField: 'hp' },
  [MACHINE_TYPES.PIPE]: { key: 'pipe', fields: { pressure: 'state.pressure' }, statusField: 'hp' },
  [MACHINE_TYPES.CONDENSER]: { key: 'condenser', fields: { efficiency: 'state.efficiency' }, statusField: 'hp' },
  [MACHINE_TYPES.CONTROL_RODS]: { key: 'control_rods', fields: { level: 'state.insertionLevel' }, statusField: 'hp' },
};

function getNested(obj, path) {
  return path.split('.').reduce((acc, key) => acc && acc[key] !== undefined ? acc[key] : 'N/A', obj);
}

function hpStatus(hp, maxHp) {
  const ratio = hp / maxHp;
  if (ratio > 0.7) return 'OK';
  if (ratio > 0.3) return 'WARNING';
  return 'CRITICAL';
}

export class TooltipUI {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
    this.hoverTimer = null;
    this.currentMachine = null;
    this.visible = false;
  }

  create() {
    this.container = this.scene.add.container(0, 0).setDepth(250).setScrollFactor(0).setAlpha(0);
    this.bg = this.scene.add.graphics();
    this.container.add(this.bg);
    this.text = this.scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#e0e0e0', lineSpacing: 3
    });
    this.container.add(this.text);
  }

  hoverMachine(machine, serverData) {
    if (this.currentMachine === machine) return;
    this.currentMachine = machine;
    if (this.hoverTimer) this.hoverTimer.remove();

    this.hoverTimer = this.scene.time.delayedCall(1000, () => {
      if (!machine || !serverData) return;
      const config = TOOLTIP_CONFIGS[machine.machineType];
      if (!config) return;

      const template = strings.TOOLTIPS[config.key];
      if (!template) return;

      const replacements = {};
      for (const [key, path] of Object.entries(config.fields)) {
        replacements[key] = Math.round(getNested(serverData, path));
      }
      replacements.status = hpStatus(serverData.hp, serverData.maxHp);

      let tip = template;
      for (const [key, val] of Object.entries(replacements)) {
        tip = tip.replace(`{${key}}`, val);
      }

      this.bg.clear();
      this.bg.fillStyle(0x111122, 0.92);
      this.bg.fillRoundedRect(0, 0, 220, 90, 8);
      this.bg.lineStyle(1, 0x4fc3f7, 0.5);
      this.bg.strokeRoundedRect(0, 0, 220, 90, 8);

      this.text.setText(tip);

      const pointer = this.scene.input.activePointer;
      let tx = pointer.x + 15;
      let ty = pointer.y + 15;
      const cw = this.scene.cameras.main.width;
      const ch = this.scene.cameras.main.height;
      if (tx + 230 > cw) tx = pointer.x - 230;
      if (ty + 100 > ch) ty = pointer.y - 100;

      this.container.setPosition(tx, ty);
      this.scene.tweens.add({
        targets: this.container, alpha: 1, duration: 150, ease: 'Power1'
      });
      this.visible = true;
    });
  }

  hide() {
    this.currentMachine = null;
    if (this.hoverTimer) { this.hoverTimer.remove(); this.hoverTimer = null; }
    if (this.visible) {
      this.scene.tweens.add({
        targets: this.container, alpha: 0, duration: 100, ease: 'Power1'
      });
      this.visible = false;
    }
  }

  destroy() {
    this.hide();
    if (this.container) this.container.destroy();
  }
}
