import { MACHINE_TYPES, MACHINE_DEFAULTS } from '../../shared/constants.js';

export class Turbine {
  constructor(id, position) {
    this.id = id;
    this.position = position;
    this.type = MACHINE_TYPES.TURBINE;
    this.hp = MACHINE_DEFAULTS[MACHINE_TYPES.TURBINE].max_hp;
    this.max_hp = MACHINE_DEFAULTS[MACHINE_TYPES.TURBINE].max_hp;
    this.rpm = 0;
    this.targetRpm = 0;
    this.steamPressure = 0;
    this.minSteamPressure = MACHINE_DEFAULTS[MACHINE_TYPES.TURBINE].min_steam_pressure;
    this.maxRpm = MACHINE_DEFAULTS[MACHINE_TYPES.TURBINE].max_rpm;
    this.efficiency = 100;
    this.status = 'offline';
  }

  update(dt, steamPressure) {
    this.steamPressure = steamPressure;
    if (steamPressure > this.minSteamPressure) {
      this.targetRpm = (steamPressure / 100) * this.maxRpm * (this.efficiency / 100);
    } else {
      this.targetRpm = 0;
    }
    const diff = this.targetRpm - this.rpm;
    const step = 1000 * dt;
    if (Math.abs(diff) < 1) {
      this.rpm = this.targetRpm;
    } else if (diff > 0) {
      this.rpm = Math.min(this.targetRpm, this.rpm + step);
    } else {
      this.rpm = Math.max(this.targetRpm, this.rpm - step);
    }
    if (this.rpm > 0 && this.hp < 50) {
      this.efficiency = Math.max(30, this.efficiency - 0.5 * dt);
    }
    if (this.rpm === 0) this.status = 'offline';
    else if (this.efficiency < 70 || this.hp < 50) this.status = 'warning';
    else this.status = 'online';
  }

  setSteamPressure(pressure) {
    this.steamPressure = pressure;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, Math.min(this.max_hp, this.hp - amount));
    this.efficiency = Math.max(30, this.efficiency - amount * 0.5);
  }

  repair(amount) {
    this.hp = Math.max(0, Math.min(this.max_hp, this.hp + amount));
    this.efficiency = Math.min(100, this.efficiency + amount * 0.5);
  }

  serialize() {
    return {
      id: this.id, position: this.position, type: this.type, hp: this.hp, max_hp: this.max_hp,
      rpm: this.rpm, targetRpm: this.targetRpm, steamPressure: this.steamPressure,
      minSteamPressure: this.minSteamPressure, maxRpm: this.maxRpm, efficiency: this.efficiency, status: this.status,
    };
  }
}
