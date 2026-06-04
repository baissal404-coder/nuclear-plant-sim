import { MACHINE_TYPES, MACHINE_DEFAULTS } from '../../shared/constants.js';

export class Condenser {
  constructor(id, position) {
    this.id = id;
    this.position = position;
    this.type = MACHINE_TYPES.CONDENSER;
    this.hp = MACHINE_DEFAULTS[MACHINE_TYPES.CONDENSER].max_hp;
    this.max_hp = MACHINE_DEFAULTS[MACHINE_TYPES.CONDENSER].max_hp;
    this.efficiency = MACHINE_DEFAULTS[MACHINE_TYPES.CONDENSER].max_efficiency;
    this.waterReturnRate = 0;
    this.status = 'offline';
  }

  update(dt, exhaustSteam) {
    this.waterReturnRate = exhaustSteam * (this.efficiency / 100);
    if (this.hp < 50) {
      this.efficiency = Math.max(30, this.efficiency - 0.4 * dt);
    }
    if (exhaustSteam === 0) this.status = 'offline';
    else if (this.efficiency < 70 || this.hp < 50) this.status = 'warning';
    else this.status = 'online';
  }

  takeDamage(amount) {
    this.hp = Math.max(0, Math.min(this.max_hp, this.hp - amount));
    this.efficiency = Math.max(30, this.efficiency - amount * 0.3);
  }

  repair(amount) {
    this.hp = Math.max(0, Math.min(this.max_hp, this.hp + amount));
    this.efficiency = Math.min(100, this.efficiency + amount * 0.3);
  }

  serialize() {
    return {
      id: this.id, position: this.position, type: this.type, hp: this.hp, max_hp: this.max_hp,
      efficiency: this.efficiency, waterReturnRate: this.waterReturnRate, status: this.status,
    };
  }
}
