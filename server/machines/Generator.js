import { MACHINE_TYPES, MACHINE_DEFAULTS } from '../../shared/constants.js';

export class Generator {
  constructor(id, position) {
    this.id = id;
    this.position = position;
    this.type = MACHINE_TYPES.GENERATOR;
    this.hp = MACHINE_DEFAULTS[MACHINE_TYPES.GENERATOR].max_hp;
    this.max_hp = MACHINE_DEFAULTS[MACHINE_TYPES.GENERATOR].max_hp;
    this.rpm = 0;
    this.outputMw = 0;
    this.minRpm = MACHINE_DEFAULTS[MACHINE_TYPES.GENERATOR].min_rpm;
    this.maxOutputMw = MACHINE_DEFAULTS[MACHINE_TYPES.GENERATOR].max_output_mw;
    this.efficiency = 100;
    this.status = 'offline';
  }

  update(dt, turbineRpm) {
    this.rpm = turbineRpm;
    if (this.rpm >= this.minRpm) {
      const maxRpm = this.maxOutputMw * 36;
      this.outputMw = ((this.rpm - this.minRpm) / (maxRpm - this.minRpm)) * this.maxOutputMw * (this.efficiency / 100);
    } else {
      this.outputMw = 0;
    }
    if (this.hp < 50) {
      this.efficiency = Math.max(40, this.efficiency - 0.3 * dt);
    }
    if (this.outputMw === 0) this.status = 'offline';
    else if (this.efficiency < 70 || this.hp < 50) this.status = 'warning';
    else this.status = 'online';
  }

  setRpm(rpm) { this.rpm = rpm; }

  takeDamage(amount) {
    this.hp = Math.max(0, Math.min(this.max_hp, this.hp - amount));
    this.efficiency = Math.max(40, this.efficiency - amount * 0.4);
  }

  repair(amount) {
    this.hp = Math.max(0, Math.min(this.max_hp, this.hp + amount));
    this.efficiency = Math.min(100, this.efficiency + amount * 0.4);
  }

  serialize() {
    return {
      id: this.id, position: this.position, type: this.type, hp: this.hp, max_hp: this.max_hp,
      rpm: this.rpm, outputMw: this.outputMw, minRpm: this.minRpm, maxOutputMw: this.maxOutputMw,
      efficiency: this.efficiency, status: this.status,
    };
  }
}
