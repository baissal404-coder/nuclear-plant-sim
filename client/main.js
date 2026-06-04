import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { ControlRoomScene } from './scenes/ControlRoomScene.js';
import { CraneScene } from './scenes/CraneScene.js';
import { AudioManager } from './audio.js';

export const audioManager = new AudioManager();

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: [BootScene, MenuScene, GameScene, ControlRoomScene, CraneScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: { pixelArt: false, antialias: true },
  audio: { disableWebAudio: false }
};

// Global error boundary
window.addEventListener('error', (e) => {
  showErrorOverlay(e.message || 'An unexpected error occurred.');
});

window.addEventListener('unhandledrejection', (e) => {
  showErrorOverlay(e.reason?.message || 'Unhandled promise rejection.');
});

function showErrorOverlay(msg) {
  let el = document.getElementById('error-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'error-overlay';
    el.innerHTML = `
      <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(10,10,20,0.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;">
        <h1 style="color:#e94560;font-size:28px;margin-bottom:10px;">⚠ GAME ERROR</h1>
        <p id="error-msg" style="color:#b0b0d0;font-size:14px;margin-bottom:20px;max-width:500px;text-align:center;">${msg}</p>
        <button onclick="location.reload()" style="background:#16213e;color:#4fc3f7;border:1px solid #4fc3f7;padding:12px 32px;font-family:monospace;font-size:16px;cursor:pointer;border-radius:8px;">Reload Game</button>
      </div>
    `;
    document.body.appendChild(el);
  } else {
    document.getElementById('error-msg').textContent = msg;
    el.style.display = 'flex';
  }
}

const game = new Phaser.Game(config);

// Init audio on first interaction
document.addEventListener('pointerdown', () => {
  audioManager.init();
  audioManager.startAmbient();
}, { once: true });

document.addEventListener('keydown', () => {
  audioManager.init();
}, { once: true });

export { game };
