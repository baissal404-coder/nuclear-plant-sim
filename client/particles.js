const MAX_PARTICLES = 200;

class Particle {
  constructor() {
    this.active = false;
    this.sprite = null;
    this.type = '';
    this.life = 0;
    this.maxLife = 0;
    this.vx = 0;
    this.vy = 0;
    this.gravity = 0;
    this.startAlpha = 1;
    this.startScale = 1;
  }

  init(scene, type) {
    this.type = type;
    this.active = false;
    const colors = {
      steam: 0xcccccc,
      smoke: 0x444444,
      spark: 0xffff00,
      fire: 0xff4400,
      radiation: 0x00ff66,
      glow: 0x4fc3f7,
    };
    const color = colors[type] || 0xffffff;
    const size = type === 'steam' ? 8 : type === 'spark' ? 3 : type === 'radiation' ? 6 : 5;
    this.sprite = scene.add.circle(0, 0, size, color, 0.8).setDepth(type === 'radiation' ? 80 : 15).setAlpha(0);
  }

  spawn(x, y, vx, vy, life, opts = {}) {
    this.active = true;
    this.sprite.setPosition(x, y);
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.gravity = opts.gravity || 0;
    this.startAlpha = opts.alpha ?? 0.8;
    this.startScale = opts.scale ?? 1;
    this.sprite.setAlpha(this.startAlpha);
    this.sprite.setScale(this.startScale);
    this.sprite.setVisible(true);
  }

  update(dt) {
    if (!this.active) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.active = false;
      this.sprite.setVisible(false);
      return;
    }
    const ratio = this.life / this.maxLife;
    this.sprite.x += this.vx * dt;
    this.sprite.y += this.vy * dt;
    this.vy += this.gravity * dt;
    this.sprite.setAlpha(this.startAlpha * ratio);
    this.sprite.setScale(this.startScale * (0.5 + 0.5 * ratio));
  }

  destroy() {
    if (this.sprite) this.sprite.destroy();
  }
}

export class ParticlePool {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this._timers = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = new Particle();
      p.init(scene, 'steam');
      this.particles.push(p);
    }
  }

  _get(type) {
    for (const p of this.particles) {
      if (!p.active) {
        p.init(this.scene, type);
        return p;
      }
    }
    return null;
  }

  emit(type, x, y, count = 1, opts = {}) {
    const emitted = [];
    for (let i = 0; i < count; i++) {
      const p = this._get(type);
      if (!p) break;
      const spread = opts.spread || 30;
      const speed = opts.speed || 30;
      const life = opts.life || 1;
      const angle = (opts.angle || -Math.PI / 2) + (Math.random() - 0.5) * (spread / 180 * Math.PI);
      const vx = Math.cos(angle) * speed * (0.5 + Math.random() * 0.5);
      const vy = Math.sin(angle) * speed * (0.5 + Math.random() * 0.5);
      p.spawn(
        x + (Math.random() - 0.5) * (opts.spreadX || 10),
        y + (Math.random() - 0.5) * (opts.spreadY || 10),
        vx, vy, life * (0.7 + Math.random() * 0.3), opts
      );
      emitted.push(p);
    }
    return emitted;
  }

  emitSteam(x, y, opts = {}) {
    return this.emit('steam', x, y, opts.count || 2, {
      spread: 40, speed: 20, life: 1.5, gravity: -5, alpha: 0.4, scale: 1.5, angle: -Math.PI / 2, ...opts
    });
  }

  emitSmoke(x, y, opts = {}) {
    return this.emit('smoke', x, y, opts.count || 3, {
      spread: 60, speed: 15, life: 2, gravity: -3, alpha: 0.6, scale: 1.2, ...opts
    });
  }

  emitSparks(x, y, opts = {}) {
    return this.emit('spark', x, y, opts.count || 5, {
      spread: 120, speed: 80, life: 0.5, gravity: 50, alpha: 1, scale: 1, ...opts
    });
  }

  emitFire(x, y, opts = {}) {
    return this.emit('fire', x, y, opts.count || 2, {
      spread: 30, speed: 40, life: 0.6, gravity: -30, alpha: 0.9, scale: 1, ...opts
    });
  }

  emitRadiation(x, y, opts = {}) {
    return this.emit('radiation', x, y, opts.count || 1, {
      spread: 360, speed: 15, life: 0.8, gravity: 0, alpha: 0.5, scale: 1, ...opts
    });
  }

  schedule(type, x, y, delay, count = 1, opts = {}) {
    const timer = this.scene.time.delayedCall(delay, () => {
      this.emit(type, x, y, count, opts);
    });
    return timer;
  }

  update(dt) {
    for (const p of this.particles) {
      p.update(dt);
    }
  }

  destroy() {
    for (const p of this.particles) p.destroy();
    this.particles = [];
    for (const t of this._timers) t.remove();
    this._timers = [];
  }
}

export function createSteamPipeEmitter(pool, pipeX, pipeY) {
  return {
    update(dt, active) {
      if (!active) return;
      if (Math.random() < 0.3) pool.emitSteam(pipeX, pipeY);
    }
  };
}
