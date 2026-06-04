const STORAGE_KEY = 'nps_stats';
const ACHIEVEMENT_KEY = 'nps_achievements';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch { return {}; }
}

function save(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

export const playerStats = {
  get totalPlayTime() { return load().totalPlayTime || 0; },
  set totalPlayTime(v) { const d = load(); d.totalPlayTime = v; save(d); },

  get meltdownsSurvived() { return load().meltdownsSurvived || 0; },
  set meltdownsSurvived(v) { const d = load(); d.meltdownsSurvived = v; save(d); },

  get mwGenerated() { return load().mwGenerated || 0; },
  set mwGenerated(v) { const d = load(); d.mwGenerated = v; save(d); },

  addPlayTime(seconds) {
    this.totalPlayTime += seconds;
  },

  incrementMeltdownsSurvived() {
    this.meltdownsSurvived += 1;
  },

  addMW(mw) {
    this.mwGenerated += mw;
  },
};

function loadAchievements() {
  try {
    return JSON.parse(localStorage.getItem(ACHIEVEMENT_KEY)) || [];
  } catch { return []; }
}

function saveAchievements(a) {
  try { localStorage.setItem(ACHIEVEMENT_KEY, JSON.stringify(a)); } catch {}
}

export const achievements = {
  list: loadAchievements(),

  _unlock(id) {
    if (this.list.includes(id)) return false;
    this.list.push(id);
    saveAchievements(this.list);
    return true;
  },

  checkMeltdownPrevented() {
    return this._unlock('meltdown_prevented');
  },

  checkMWGenerated(total) {
    if (total >= 100) return this._unlock('mw_generated');
    return false;
  },

  checkPerfectShift(totalFailures) {
    if (totalFailures === 0) return this._unlock('perfect_shift');
    return false;
  },

  checkAllTurbines(turbineRPMs) {
    if (turbineRPMs.every(rpm => rpm > 500)) return this._unlock('all_turbines');
    return false;
  },

  isUnlocked(id) {
    return this.list.includes(id);
  },
};
