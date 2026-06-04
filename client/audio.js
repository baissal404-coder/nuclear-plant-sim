export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.masterVolume = 0.7;
    this.ambientNodes = [];
    this.isMuted = false;
    this.initialized = false;
    this._oscillators = {};
  }

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch (e) {
      console.warn('[Audio] Web Audio API unavailable');
    }
  }

  ensureResumed() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  _createOsc(type, freq, gainVal, detune = 0) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const gain = this.ctx.createGain();
    gain.gain.value = gainVal;
    osc.connect(gain);
    gain.connect(this.masterGain);
    return { osc, gain };
  }

  _noiseBuffer() {
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  play(soundName, volume = 1) {
    if (this.isMuted || !this.initialized) return;
    this.ensureResumed();
    const vol = volume * this.masterVolume;
    switch (soundName) {
      case 'button_click': this._playBlip(800, 0.05, vol); break;
      case 'chat_ping': this._playBlip(1200, 0.08, vol * 0.6); break;
      case 'alarm_meltdown': this._playAlarm(800, vol); break;
      case 'alarm_broken': this._playDescendingTone(vol); break;
      case 'alarm_radiation': this._playBeep(1800, 0.1, 0.3, vol * 0.8); break;
      case 'repair_grind': this._playNoise(0.2, vol * 0.5); break;
      case 'fuel_clunk': this._playBlip(150, 0.1, vol * 0.7); break;
      case 'scram': this._playScram(vol); break;
      case 'explosion': this._playNoise(0.5, vol * 0.9); break;
      case 'error': this._playBlip(200, 0.15, vol); break;
      case 'footstep': this._playNoise(0.05, vol * 0.15); break;
    }
  }

  _playBlip(freq, duration, vol) {
    const { osc, gain } = this._createOsc('sine', freq, vol);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + duration);
  }

  _playAlarm(freq, vol) {
    const dur = 0.4;
    for (let i = 0; i < 4; i++) {
      const t = this.ctx.currentTime + i * dur;
      const { osc, gain } = this._createOsc('square', freq, vol);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.setValueAtTime(0, t + dur * 0.4);
      gain.gain.setValueAtTime(vol, t + dur * 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur);
    }
  }

  _playDescendingTone(vol) {
    const now = this.ctx.currentTime;
    const { osc, gain } = this._createOsc('sawtooth', 600, vol);
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.8);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.start(now);
    osc.stop(now + 0.8);
  }

  _playBeep(freq, dur, gap, vol) {
    const now = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const t = now + i * (dur + gap);
      const { osc, gain } = this._createOsc('sine', freq, vol);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur);
    }
  }

  _playNoise(duration, vol) {
    const buf = this._noiseBuffer();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    src.start();
    src.stop(this.ctx.currentTime + duration);
  }

  _playScram(vol) {
    const now = this.ctx.currentTime;
    for (let f = 200; f < 800; f += 100) {
      const t = now + (f - 200) / 800;
      const { osc, gain } = this._createOsc('square', f, vol * 0.6);
      gain.gain.setValueAtTime(vol * 0.6, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  playMusic(trackName, loop = true) {
    if (this.isMuted || !this.initialized) return;
    this.ensureResumed();
    this.stopMusic();
    this._musicGain = this.ctx.createGain();
    this._musicGain.gain.value = 0.3 * this.masterVolume;
    this._musicGain.connect(this.masterGain);

    if (trackName === 'ambient_hum') {
      const nodes = [];
      [60, 120, 180, 240].forEach((freq, i) => {
        const { osc, gain } = this._createOsc('sine', freq, 0.08 / (i + 1));
        gain.disconnect();
        gain.connect(this._musicGain);
        osc.start();
        nodes.push(osc);
      });
      const { osc: oscL, gain: gainL } = this._createOsc('sine', 55, 0.04);
      oscL.type = 'triangle';
      gainL.disconnect();
      gainL.connect(this._musicGain);
      oscL.start();
      nodes.push(oscL);
      this._musicNodes = nodes;
    }
  }

  stopMusic() {
    if (this._musicNodes) {
      this._musicNodes.forEach(n => { try { n.stop(); } catch (e) {} });
      this._musicNodes = null;
    }
  }

  startAmbient() {
    this.playMusic('ambient_hum', true);
  }

  setVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain) this.masterGain.gain.value = this.masterVolume;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      if (this.masterGain) this.masterGain.gain.value = 0;
      this.stopMusic();
    } else {
      if (this.masterGain) this.masterGain.gain.value = this.masterVolume;
      this.startAmbient();
    }
  }

  preload(scene) {}
}
