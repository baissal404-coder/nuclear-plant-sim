import { MACHINE_TYPES, MACHINE_DEFAULTS } from '../../shared/constants.js';

export class Pump {
  constructor(id, position) {
    this.id = id;
    this.position = position;
    this.type = MACHINE_TYPES.PUMP;
    this.hp = MACHINE_DEFAULTS[MACHINE_TYPES.PUMP].max_hp;
    this.max_hp = MACHINE_DEFAULTS[MACHINE_TYPES.PUMP].max_hp;
    this.speed = 0;
    this.maxSpeed = MACHINE_DEFAULTS[MACHINE_TYPES.PUMP].max_speed;
    this.coolantRemovalRate = MACHINE_DEFAULTS[MACHINE_TYPES.PUMP].coolant_removal_rate;
    this.status = 'offline';
  }

  update(dt) {
    if (this.speed > 0) {
      const effectiveSpeed = this.speed * (this.hp < 50 ? 0.6 : 1.0);
      const coolantRemoved = effectiveSpeed * this.coolantRemovalRate * dt;
      if (this.speed === 0) this.status = 'offline';
      else if (this.hp < 50) this.status = 'warning';
      else this.status = 'operational';
      return coolantRemoved;
    }
    this.status = 'offline';
    return 0;
  }

  setSpeed(speed) {
    this.speed = Math.max(0, Math.min(this.maxSpeed, speed));
    if (this.speed > 0 && this.status === 'offline') {
      this.status = 'operational';
    } else if (this.speed === 0) {
      this.status = 'offline';
    }
  }

  takeDamage(amount) {
    this.hp = Math.max(0, Math.min(this.max_hp, this.hp - amount));
  }

  repair(amount) {
    this.hp = Math.max(0, Math.min(this.max_hp, this.hp + amount));
  }

  serialize() {
    return {
      id: this.id, position: this.position, type: this.type, hp: this.hp, max_hp: this.max_hp,
      speed: this.speed, maxSpeed: this.maxSpeed, coolantRemovalRate: this.coolantRemovalRate, status: this.status,
    };
  }
}
