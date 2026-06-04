import { EventEmitter } from 'events';
import { MACHINE_TYPES, MACHINE_DEFAULTS, GAME_CONFIG } from '../../shared/constants.js';

export class Reactor extends EventEmitter {
  constructor(id, position) {
    super();
    this.id = id;
    this.position = position;
    this.type = MACHINE_TYPES.REACTOR;
    this.hp = MACHINE_DEFAULTS[MACHINE_TYPES.REACTOR].max_hp;
    this.max_hp = MACHINE_DEFAULTS[MACHINE_TYPES.REACTOR].max_hp;
    this.temperature = 25;
    this.heat = 0;
    this.power_output = 0;
    this.control_rod_insertion = 100;
    this.coolant_pressure = 0;
    this.isScrammed = false;
    this.status = 'offline';
  }

  update(dt, controlRodInsertion, pumpSpeed, pipeIntegrity) {
    if (this.isScrammed) {
      this.heat = Math.max(0, this.heat - 200 * dt);
    } else {
      const heatGen = this.power_output * MACHINE_DEFAULTS[MACHINE_TYPES.REACTOR].heat_generation_rate * (1 - controlRodInsertion / 100);
      const cooling = pumpSpeed * MACHINE_DEFAULTS[MACHINE_TYPES.PUMP].coolant_removal_rate * pipeIntegrity * dt;
      this.heat = Math.max(0, this.heat + heatGen * dt - cooling);
    }
    this.temperature = 25 + (this.heat / MACHINE_DEFAULTS[MACHINE_TYPES.REACTOR].max_heat) * 475;
    if (this.heat > MACHINE_DEFAULTS[MACHINE_TYPES.REACTOR].max_safe_heat) {
      const dmg = (this.heat - MACHINE_DEFAULTS[MACHINE_TYPES.REACTOR].max_safe_heat) / 100 * dt;
      this.hp = Math.max(0, this.hp - dmg);
    }
    if (this.heat >= GAME_CONFIG.meltdown_threshold) {
      this.emit('meltdown', this.id);
    }
    if (this.power_output === 0) this.status = 'offline';
    else if (this.heat > MACHINE_DEFAULTS[MACHINE_TYPES.REACTOR].max_safe_heat) this.status = 'warning';
    else if (this.hp < 30) this.status = 'critical';
    else this.status = 'online';
  }

  takeDamage(amount) {
    this.hp = Math.max(0, Math.min(this.max_hp, this.hp - amount));
    if (this.hp < 30) this.emit('critical', this.id);
  }

  repair(amount) {
    this.hp = Math.max(0, Math.min(this.max_hp, this.hp + amount));
  }

  scram() {
    this.isScrammed = true;
    this.power_output = 0;
    this.emit('scram', this.id);
  }

  setPowerOutput(level) {
    if (this.isScrammed) return;
    this.power_output = Math.max(0, Math.min(MACHINE_DEFAULTS[MACHINE_TYPES.REACTOR].base_power_output * 2, level));
  }

  serialize() {
    return {
      id: this.id, position: this.position, type: this.type, hp: this.hp, max_hp: this.max_hp,
      temperature: this.temperature, heat: this.heat, power_output: this.power_output,
      control_rod_insertion: this.control_rod_insertion, coolant_pressure: this.coolant_pressure,
      isScrammed: this.isScrammed, status: this.status,
    };
  }
}
