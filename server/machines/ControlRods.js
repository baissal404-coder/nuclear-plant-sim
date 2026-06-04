import { MACHINE_TYPES, MACHINE_DEFAULTS } from '../../shared/constants.js';

export class ControlRods {
  constructor(id, position) {
    this.id = id;
    this.position = position;
    this.type = MACHINE_TYPES.CONTROL_RODS;
    this.hp = MACHINE_DEFAULTS[MACHINE_TYPES.CONTROL_RODS].max_hp;
    this.max_hp = MACHINE_DEFAULTS[MACHINE_TYPES.CONTROL_RODS].max_hp;
    this.rodCount = MACHINE_DEFAULTS[MACHINE_TYPES.CONTROL_RODS].rod_count;
    this.currentInsertion = 100;
    this.targetInsertion = 100;
    this.movementSpeed = 5;
    this.status = 'operational';
  }

  update(dt) {
    if (this.currentInsertion < this.targetInsertion) {
      this.currentInsertion = Math.min(this.targetInsertion, this.currentInsertion + this.movementSpeed * dt);
    } else if (this.currentInsertion > this.targetInsertion) {
      this.currentInsertion = Math.max(this.targetInsertion, this.currentInsertion - this.movementSpeed * dt);
    }
    this.status = this.hp < 30 ? 'critical' : 'operational';
  }

  setInsertion(level) {
    this.targetInsertion = Math.max(0, Math.min(100, level));
  }

  emergencyInsert() {
    this.targetInsertion = 0;
    this.currentInsertion = 0;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, Math.min(this.max_hp, this.hp - amount));
    this.movementSpeed = Math.max(0.5, 5 * (this.hp / this.max_hp));
  }

  repair(amount) {
    this.hp = Math.max(0, Math.min(this.max_hp, this.hp + amount));
    this.movementSpeed = Math.max(0.5, 5 * (this.hp / this.max_hp));
  }

  serialize() {
    return {
      id: this.id, position: this.position, type: this.type, hp: this.hp, max_hp: this.max_hp,
      rodCount: this.rodCount, currentInsertion: this.currentInsertion,
      targetInsertion: this.targetInsertion, movementSpeed: this.movementSpeed, status: this.status,
    };
  }
}
