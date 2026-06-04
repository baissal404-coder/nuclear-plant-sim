import { MACHINE_TYPES, MACHINE_DEFAULTS } from '../../shared/constants.js';

export class Pipe {
  constructor(id, position, length) {
    this.id = id;
    this.position = position;
    this.type = MACHINE_TYPES.PIPE;
    this.hp = MACHINE_DEFAULTS[MACHINE_TYPES.PIPE].max_hp;
    this.max_hp = MACHINE_DEFAULTS[MACHINE_TYPES.PIPE].max_hp;
    this.pressure = MACHINE_DEFAULTS[MACHINE_TYPES.PIPE].max_pressure;
    this.maxPressure = MACHINE_DEFAULTS[MACHINE_TYPES.PIPE].max_pressure;
    this.leakRate = 0;
    this.isLeaking = false;
    this.length = length || 1;
    this.status = 'operational';
  }

  update(dt) {
    if (this.isLeaking) {
      this.pressure = Math.max(0, this.pressure - this.leakRate * dt);
    }
    if (this.hp < 50) {
      const leakChance = (50 - this.hp) * 0.01 * dt;
      if (Math.random() < leakChance) {
        this.isLeaking = true;
        this.leakRate = MACHINE_DEFAULTS[MACHINE_TYPES.PIPE].leak_rate * (1 - Math.max(0.1, this.hp / this.max_hp) + 0.5);
      }
    }
    if (this.pressure < 20) this.status = 'critical';
    else if (this.isLeaking) this.status = 'warning';
    else this.status = 'operational';
    if (this.hp <= 0) {
      this.isLeaking = true;
      this.leakRate = MACHINE_DEFAULTS[MACHINE_TYPES.PIPE].leak_rate * 2;
      this.pressure = 0;
    }
    if (this.hp > 80 && this.isLeaking) {
      this.isLeaking = false;
      this.leakRate = 0;
    }
  }

  setLeaking(leaking) {
    this.isLeaking = leaking;
    if (leaking) {
      const hpRatio = Math.max(0.1, this.hp / this.max_hp);
      this.leakRate = MACHINE_DEFAULTS[MACHINE_TYPES.PIPE].leak_rate * (1 - hpRatio + 0.5);
    } else {
      this.leakRate = 0;
    }
  }

  takeDamage(amount) {
    this.hp = Math.max(0, Math.min(this.max_hp, this.hp - amount));
    if (this.isLeaking) {
      const hpRatio = Math.max(0.1, this.hp / this.max_hp);
      this.leakRate = MACHINE_DEFAULTS[MACHINE_TYPES.PIPE].leak_rate * (1 - hpRatio + 0.5);
    }
  }

  repair(amount) {
    this.hp = Math.max(0, Math.min(this.max_hp, this.hp + amount));
    if (this.hp > 80) { this.isLeaking = false; this.leakRate = 0; }
    else if (this.isLeaking) {
      const hpRatio = Math.max(0.1, this.hp / this.max_hp);
      this.leakRate = MACHINE_DEFAULTS[MACHINE_TYPES.PIPE].leak_rate * (1 - hpRatio + 0.5);
    }
  }

  getPressureLoss() {
    if (this.maxPressure === 0) return 0;
    return ((this.maxPressure - this.pressure) / this.maxPressure) * 100;
  }

  serialize() {
    return {
      id: this.id, position: this.position, type: this.type, hp: this.hp, max_hp: this.max_hp,
      pressure: this.pressure, maxPressure: this.maxPressure, leakRate: this.leakRate,
      isLeaking: this.isLeaking, length: this.length, status: this.status,
    };
  }
}
