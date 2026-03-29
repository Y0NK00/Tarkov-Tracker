// ── APP COORDINATOR ───────────────────────────────────────────────────────

const APP = {
  progress: {
    quests: new Set(),
    collector: new Set(),
    hideout: new Set(),
    story: new Set(),
    raidItems: new Set(),
    raidItemCounts: {},     // { itemKey: count } — partial progress tracking
    level: 1,
    lastEnding: 'savior',
    faction: null,          // 'bear' | 'usec' | null
    hideoutCounts: {},      // { stationId_itemId: count }
    storyItems: {},         // { itemId: count }
    storyStepChecks: {},    // { 'questId:stepIdx' | 'questId:stepIdx:subIdx': true }
    theme: 'gold',          // accent color theme
    mode: 'dark',           // 'dark' | 'light'
    doubleClickQuest: false, // require double-click to complete a quest
    showNonKappa: true,      // show non-Kappa quests in quest list
    defaultMap: ''           // default map filter selected on startup
  },

  async loadProgress() {
    try {
      let data = null;
      if (window.electronAPI) {
        data = await window.electronAPI.loadProgress();
      } else {
        const raw = localStorage.getItem('kappa_v3');
        if (raw) data = JSON.parse(raw);
      }
      if (data) {
        if (data.quests) this.progress.quests = new Set(data.quests);
        if (data.collector) this.progress.collector = new Set(data.collector);
        if (data.hideout) this.progress.hideout = new Set(data.hideout);
        if (data.story) this.progress.story = new Set(data.story);
        if (data.raidItems) this.progress.raidItems = new Set(data.raidItems);
        if (data.raidItemCounts) this.progress.raidItemCounts = data.raidItemCounts;
        if (data.level) this.progress.level = data.level;
        if (data.lastEnding) this.progress.lastEnding = data.lastEnding;
        if (data.faction) this.progress.faction = data.faction;
        if (data.hideoutCounts) this.progress.hideoutCounts = data.hideoutCounts;
        if (data.storyItems) this.progress.storyItems = data.storyItems;
        if (data.storyStepChecks) this.progress.storyStepChecks = data.storyStepChecks;
        if (data.theme) this.progress.theme = data.theme;
        if (data.mode) this.progress.mode = data.mode;
        if (data.doubleClickQuest !== undefined) this.progress.doubleClickQuest = data.doubleClickQuest;
        if (data.showNonKappa !== undefined) this.progress.showNonKappa = data.showNonKappa;
        if (data.defaultMap !== undefined) this.progress.defaultMap = data.defaultMap;
        if (data.ftueComplete !== undefined) this.progress.ftueComplete = data.ftueComplete;
        if (data.hotkey) this.progress.hotkey = data.hotkey;
        if (data.windowOpacity !== undefined) this.progress.windowOpacity = data.windowOpacity;
        if (data.alwaysOnTop !== undefined) this.progress.alwaysOnTop = data.alwaysOnTop;
        if (data.autoShowOnMatchmaking !== undefined) this.progress.autoShowOnMatchmaking = data.autoShowOnMatchmaking;
        if (data.raidReminder !== undefined) this.progress.raidReminder = data.raidReminder;
        if (data.postRaidPanel !== undefined) this.progress.postRaidPanel = data.postRaidPanel;
        if (data.autoQuestComplete !== undefined) this.progress.autoQuestComplete = data.autoQuestComplete;
      }
    } catch(e) { console.error('Load error:', e); }
    applyTheme(this.progress.theme);
    applyMode(this.progress.mode);
  },

  saveProgress() {
    const data = {
      version: 3,
      quests: [...this.progress.quests],
      collector: [...this.progress.collector],
      hideout: [...this.progress.hideout],
      story: [...this.progress.story],
      raidItems: [...(this.progress.raidItems || [])],
      raidItemCounts: this.progress.raidItemCounts || {},
      level: this.progress.level,
      lastEnding: this.progress.lastEnding,
      faction: this.progress.faction,
      hideoutCounts: this.progress.hideoutCounts || {},
      storyItems: this.progress.storyItems || {},
      storyStepChecks: this.progress.storyStepChecks || {},
      theme: this.progress.theme || 'gold',
      mode: this.progress.mode || 'dark',
      doubleClickQuest: this.progress.doubleClickQuest || false,
      showNonKappa: this.progress.showNonKappa !== false,
      defaultMap: this.progress.defaultMap || '',
      ftueComplete: this.progress.ftueComplete || false,
      hotkey: this.progress.hotkey || '',
      windowOpacity: this.progress.windowOpacity || 100,
      alwaysOnTop: this.progress.alwaysOnTop || false,
      autoShowOnMatchmaking: this.progress.autoShowOnMatchmaking !== false,
      raidReminder: this.progress.raidReminder !== false,
      postRaidPanel: this.progress.postRaidPanel !== false,
      autoQuestComplete: this.progress.autoQuestComplete !== false,
      savedAt: Date.now()
    };
    try {
      if (window.electronAPI) {
        window.electronAPI.saveProgress(data);
      } else {
        localStorage.setItem('kappa_v3', JSON.stringify(data));
      }
      // Cloud sync — debounced push to Firestore (no-op if not signed in)
      if (typeof SYNC !== 'undefined') SYNC.schedulePush(data);
    } catch(e) { console.error('Save error:', e); }
  }
};

// ── Toast ─────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = type === 'warn' ? 'warn show' : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ── Wipe modal ────────────────────────────────────────────────────────────
function showWipeModal(msg, onConfirm) {
  document.getElementById('wipe-modal-text').textContent = msg;
  document.getElementById('wipe-modal').classList.add('open');
  document.getElementById('wipe-confirm').onclick = () => {
    document.getElementById('wipe-modal').classList.remove('open');
    onConfirm();
  };
}
document.getElementById('wipe-cancel').addEventListener('click', () => {
  document.getElementById('wipe-modal').classList.remove('open');
});

// ── PMC Level ─────────────────────────────────────────────────────────────
function adjustLevel(delta) {
  APP.progress.level = Math.max(1, Math.min(79, APP.progress.level + delta));
  APP.saveProgress();
  updateLevelDisplay();
  if (typeof questsRender === 'function') questsRender();
}

function updateLevelDisplay() {
  document.getElementById('h-level').textContent = APP.progress.level;
  const ld = document.getElementById('level-display');
  if (ld) ld.textContent = APP.progress.level;
  // Mobile header level badge
  const mhLevel = document.getElementById('mh-level');
  if (mhLevel) mhLevel.textContent = 'LVL ' + APP.progress.level;
}

// ── Global stats ──────────────────────────────────────────────────────────
function updateGlobalStats() {
  if (typeof allQuests === 'undefined' || !allQuests.length) return;

  const kappa = allQuests.filter(q => q.kappaRequired);
  const kDone = kappa.filter(q => APP.progress.quests.has(q.id)).length;
  const pct = kappa.length > 0 ? Math.round((kDone / kappa.length) * 100) : 0;

  document.getElementById('h-kd').textContent = kDone;
  document.getElementById('h-kt').textContent = kappa.length;
  document.getElementById('h-pct').textContent = pct + '%';
  document.getElementById('kappa-fill').style.width = pct + '%';
  // Mobile header progress badge + slim bar
  var mhPct = document.getElementById('mh-progress');
  if (mhPct) mhPct.textContent = pct + '%';
  var mobBar = document.getElementById('mob-kappa-fill');
  if (mobBar) mobBar.style.width = pct + '%';

  updateDashboardStats();
  pushOverlayStats();
}

// ── Overlay data push ─────────────────────────────────────────────────────────
function pushOverlayStats() {
  if (!window.electronAPI || !window.electronAPI.pushOverlayStats) return;
  if (typeof allQuests === 'undefined' || !allQuests.length) return;

  const kappa    = allQuests.filter(q => q.kappaRequired);
  const kDone    = kappa.filter(q => APP.progress.quests.has(q.id)).length;
  const colDone  = APP.progress.collector.size;
  const colTotal = (typeof collectorItems !== 'undefined' && collectorItems.length) ? collectorItems.length : null;

  // Active (incomplete) quests for the overlay list
  const activeQuests = allQuests
    .filter(q => !APP.progress.quests.has(q.id))
    .slice(0, 10)
    .map(q => ({ name: q.name, trader: q.trader && q.trader.name }));

  // Raid item names for keys/meds/ammo detection
  const raidItemNames = Array.from(APP.progress.raidItems || []);

  window.electronAPI.pushOverlayStats({
    level:          APP.progress.level,
    faction:        APP.progress.faction,
    kappaDone:      kDone,
    kappaTotal:     kappa.length,
    collectorDone:  colDone,
    collectorTotal: colTotal,
    activeQuests,
    raidItemNames
  });
}

function updateDashboardStats() {
  if (typeof allQuests === 'undefined' || !allQuests.length) return;

  const kappa = allQuests.filter(q => q.kappaRequired);
  const kDone = kappa.filter(q => APP.progress.quests.has(q.id)).length;
  const kPct = kappa.length > 0 ? Math.round((kDone / kappa.length) * 100) : 0;

  const colDone = APP.progress.collector.size;
  const colTotal = (typeof collectorItems !== 'undefined' && collectorItems.length) ? collectorItems.length : '—';
  const colPct = typeof colTotal === 'number' && colTotal > 0 ? Math.round((colDone / colTotal) * 100) : 0;

  document.getElementById('ds-kd').textContent = kDone;
  document.getElementById('ds-kt').textContent = kappa.length;
  document.getElementById('ds-kpct').textContent = `${kPct}% complete`;
  document.getElementById('ds-kbar').style.width = kPct + '%';

  document.getElementById('ds-cd').textContent = colDone;
  const dsct = document.getElementById('ds-ct'); if (dsct) dsct.textContent = colTotal;
  document.getElementById('ds-cpct').textContent = `${colPct}% found`;
  document.getElementById('ds-cbar').style.width = colPct + '%';

  document.getElementById('h-col').textContent = `${colDone}/${colTotal}`;
  document.getElementById('tc-col').textContent = `${colDone}/${colTotal}`;

  // Recently completed
  const recentEl = document.getElementById('dash-recent');
  if (recentEl) {
    const recent = allQuests.filter(q => APP.progress.quests.has(q.id)).slice(-5).reverse();
    if (recent.length === 0) {
      recentEl.innerHTML = `<div style="font-size:12px;color:var(--text3);padding:8px 0;">No completed quests yet.</div>`;
    } else {
      recentEl.innerHTML = recent.map(q => {
        const trader = getTrader(q.trader.name);
        return `<div class="act-row">
          <div class="act-dot" style="background:${trader.color}"></div>
          <div class="act-name">${q.name}</div>
          <div class="act-time" style="color:${trader.color};font-size:10px;">${q.trader.name}</div>
        </div>`;
      }).join('');
    }
  }

  // Up next
  const nextEl = document.getElementById('dash-next');
  const availEl = document.getElementById('dash-avail-count');
  if (nextEl) {
    const avail = allQuests.filter(q => {
      if (APP.progress.quests.has(q.id)) return false;
      return (q.taskRequirements||[]).every(r => APP.progress.quests.has(r.task.id));
    });
    const kappaFirst = [...avail.filter(q => q.kappaRequired), ...avail.filter(q => !q.kappaRequired)].slice(0, 6);

    if (availEl) availEl.textContent = `${avail.length} ready`;
    if (kappaFirst.length === 0) {
      nextEl.innerHTML = `<div style="font-size:12px;color:var(--text3);padding:8px 0;">No quests available yet. Complete more prerequisites.</div>`;
    } else {
      nextEl.innerHTML = kappaFirst.map((q, i) => {
        const trader = getTrader(q.trader.name);
        return `<div class="next-row" onclick="switchTab('quests')">
          <div class="next-num">0${i+1}</div>
          <div class="next-name">${q.name}</div>
          ${q.kappaRequired ? '<span class="next-badge">κ</span>' : ''}
          <div class="next-map" style="color:${trader.color}">${q.trader.name}</div>
        </div>`;
      }).join('');
    }
  }

  // Trader grid on dashboard
  updateDashboardTraderGrid();
}

function updateDashboardTraderGrid() {
  const grid = document.getElementById('dash-trader-grid');
  if (!grid || typeof allQuests === 'undefined') return;

  grid.innerHTML = '';
  TRADERS.forEach(trader => {
    const tqs = allQuests.filter(q => q.trader.name === trader.name);
    if (tqs.length === 0) return;
    const tDone = tqs.filter(q => APP.progress.quests.has(q.id)).length;
    const pct = tqs.length > 0 ? Math.round((tDone / tqs.length) * 100) : 0;

    const card = document.createElement('div');
    card.className = 'tcard';
    card.style.setProperty('--tc', trader.color);
    card.title = `${trader.name}: ${tDone}/${tqs.length} quests`;

    card.innerHTML = `
      <div class="tcard-portrait" style="border-bottom-color:${trader.color};position:relative;">
        ${traderPortraitHTML(trader.name, 80)}
      </div>
      <div class="tcard-name" style="color:${trader.color}">${trader.name}</div>
      <div class="tcard-prog"><div class="tcard-prog-fill" style="width:${pct}%;background:${trader.color};"></div></div>
      <div class="tcard-count">${tDone}/${tqs.length}</div>
    `;
    card.addEventListener('click', () => {
      switchTab('quests');
      setTimeout(() => {
        // Filter to this trader
        const btns = document.querySelectorAll('.t-btn');
        btns.forEach(b => { if (b.dataset && b.innerText && b.innerText.includes(trader.name)) b.click(); });
      }, 100);
    });
    grid.appendChild(card);
  });
}

function buildDashboard() {
  updateLevelDisplay();
  updateDashboardStats();
  updateDashboardHideout();
  updateDashboardStory();
}

function updateDashboardHideout() {
  const el = document.getElementById('ds-hd');
  const elT = document.getElementById('ds-ht');
  const elPct = document.getElementById('ds-hpct');
  const elBar = document.getElementById('ds-hbar');
  const ctEl = document.getElementById('tc-h');
  if (!el) return;

  const done = APP.progress.hideout.size;
  el.textContent = done;
  if (elBar) elBar.style.width = '0%'; // Will update when hideout loads
  if (ctEl) ctEl.textContent = `${done}/…`;
}

function updateDashboardStory() {
  const ending = STORY_DATA.endings.find(e => e.id === APP.progress.lastEnding) || STORY_DATA.endings[0];
  const chain = STORY_DATA.chains[ending.id] || [];
  const total = STORY_DATA.shared.length + chain.length;
  const done = [...STORY_DATA.shared, ...chain].filter(q => APP.progress.story.has(q.id)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const elD = document.getElementById('ds-sd');
  const elT = document.getElementById('ds-st');
  const elP = document.getElementById('ds-spath');
  const elBar = document.getElementById('ds-sbar');
  const tcEl = document.getElementById('tc-story');

  if (elD) elD.textContent = done;
  if (elT) elT.textContent = total;
  if (elP) elP.textContent = ending.name + ' path';
  if (elBar) elBar.style.width = pct + '%';
  if (tcEl) tcEl.textContent = `${done}/${total}`;
}

// ── Tab switching ─────────────────────────────────────────────────────────
let hideoutInited = false, ammoInited = false, itemsInited = false, storyInited = false;

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');
  const panel = document.getElementById(`panel-${tab}`);
  if (panel) panel.classList.add('active');

  // ── Mobile nav active state ─────────────────────────────────────────────
  // Primary tabs (Home, Quests, Hideout, Collector) each have a direct button.
  // Secondary tabs (Items, Ammo, Maps, Story, Settings) highlight "More".
  if (typeof IS_MOBILE !== 'undefined' && IS_MOBILE) {
    var SECONDARY = ['items', 'ammo', 'maps', 'story', 'settings'];
    document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
    var mobActiveTab = SECONDARY.includes(tab) ? null : tab;
    if (mobActiveTab) {
      var mobBtn = document.querySelector(`.mob-nav-btn[data-tab="${mobActiveTab}"]`);
      if (mobBtn) mobBtn.classList.add('active');
    } else {
      var moreBtn = document.getElementById('mob-more-btn');
      if (moreBtn) moreBtn.classList.add('active');
    }
  }

  // Lazy init
  if (tab === 'hideout' && !hideoutInited) { hideoutInited = true; hideoutSetup(); }
  if (tab === 'ammo'    && !ammoInited)    { ammoInited    = true; ammoSetup();    }
  if (tab === 'items'   && !itemsInited)   { itemsInited   = true; itemsSetup();   }
  if (tab === 'story'   && !storyInited)   { storyInited   = true; storySetup();   }
  if (tab === 'maps') { mapsSetup(); }
  if (tab === 'settings' && !settingsInited) { settingsSetup(); }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── Theme & Mode ──────────────────────────────────────────────────────────────
const THEME_LABELS = { gold: 'GOLD', green: 'GREEN', blue: 'BLUE', red: 'RED', purple: 'PURPLE' };

function applyTheme(theme) {
  const t = theme || 'gold';
  document.documentElement.setAttribute('data-theme', t === 'gold' ? '' : t);
  APP.progress.theme = t;
  document.querySelectorAll('.theme-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.theme === t);
  });
  const lbl = document.getElementById('theme-label');
  if (lbl) lbl.textContent = THEME_LABELS[t] || t.toUpperCase();
}

function applyMode(mode) {
  const m = mode || 'dark';
  document.documentElement.setAttribute('data-mode', m === 'light' ? 'light' : '');
  APP.progress.mode = m;
  // Update toggle pill
  document.querySelectorAll('.mode-toggle-opt').forEach(el => {
    el.classList.toggle('active', el.dataset.mode === m);
  });
}

// ── Settings Tab ─────────────────────────────────────────────────────────────
let settingsInited = false;
function settingsSetup() {
  if (settingsInited) return;
  settingsInited = true;

  // ── Opacity slider ──────────────────────────────────────────────────────
  const opacitySlider = document.getElementById('opacity-slider');
  const opacityVal    = document.getElementById('opacity-val');
  if (opacitySlider && window.electronAPI && window.electronAPI.setOpacity) {
    const savedOpacity = APP.progress.windowOpacity || 100;
    opacitySlider.value = savedOpacity;
    if (opacityVal) opacityVal.textContent = savedOpacity + '%';
    window.electronAPI.setOpacity(savedOpacity / 100);

    opacitySlider.addEventListener('input', () => {
      const v = parseInt(opacitySlider.value, 10);
      if (opacityVal) opacityVal.textContent = v + '%';
      window.electronAPI.setOpacity(v / 100);
      APP.progress.windowOpacity = v;
      APP.saveProgress();
    });
  }

  // ── Always on Top ───────────────────────────────────────────────────────
  const aotCheck = document.getElementById('pref-always-on-top');
  if (aotCheck && window.electronAPI && window.electronAPI.setAlwaysOnTop) {
    aotCheck.checked = !!APP.progress.alwaysOnTop;
    window.electronAPI.setAlwaysOnTop(!!APP.progress.alwaysOnTop);
    aotCheck.addEventListener('change', () => {
      APP.progress.alwaysOnTop = aotCheck.checked;
      window.electronAPI.setAlwaysOnTop(aotCheck.checked);
      APP.saveProgress();
      showToast(aotCheck.checked ? 'Always on top: ON' : 'Always on top: OFF');
    });
  }

  // ── Live integration preferences ────────────────────────────────────────
  const autoQuest = document.getElementById('pref-auto-quest');
  if (autoQuest) {
    autoQuest.checked = APP.progress.autoQuestComplete !== false;
    autoQuest.addEventListener('change', () => { APP.progress.autoQuestComplete = autoQuest.checked; APP.saveProgress(); });
  }
  const autoShow = document.getElementById('pref-auto-show');
  if (autoShow) {
    autoShow.checked = APP.progress.autoShowOnMatchmaking !== false;
    autoShow.addEventListener('change', () => { APP.progress.autoShowOnMatchmaking = autoShow.checked; APP.saveProgress(); });
  }
  const raidReminder = document.getElementById('pref-raid-reminder');
  if (raidReminder) {
    raidReminder.checked = APP.progress.raidReminder !== false;
    raidReminder.addEventListener('change', () => { APP.progress.raidReminder = raidReminder.checked; APP.saveProgress(); });
  }
  const postRaid = document.getElementById('pref-post-raid');
  if (postRaid) {
    postRaid.checked = APP.progress.postRaidPanel !== false;
    postRaid.addEventListener('change', () => { APP.progress.postRaidPanel = postRaid.checked; APP.saveProgress(); });
  }

  // ── Hotkey rebinding ────────────────────────────────────────────────────
  setupHotkeyRebind();

  // Theme swatches
  document.querySelectorAll('.theme-swatch').forEach(btn => {
    btn.addEventListener('click', () => { applyTheme(btn.dataset.theme); APP.saveProgress(); });
  });
  applyTheme(APP.progress.theme);

  // Dark / Light mode toggle
  document.querySelectorAll('.mode-toggle-opt').forEach(btn => {
    btn.addEventListener('click', () => { applyMode(btn.dataset.mode); APP.saveProgress(); });
  });
  applyMode(APP.progress.mode);

  // Double-click to complete quest
  const dblToggle = document.getElementById('pref-dbl-click');
  if (dblToggle) {
    dblToggle.checked = APP.progress.doubleClickQuest || false;
    dblToggle.addEventListener('change', () => {
      APP.progress.doubleClickQuest = dblToggle.checked;
      APP.saveProgress();
    });
  }

  // Show / hide non-Kappa quests
  const nonKappaToggle = document.getElementById('pref-non-kappa');
  if (nonKappaToggle) {
    nonKappaToggle.checked = APP.progress.showNonKappa !== false;
    nonKappaToggle.addEventListener('change', () => {
      APP.progress.showNonKappa = nonKappaToggle.checked;
      APP.saveProgress();
      if (typeof questsRender === 'function') questsRender();
    });
  }

  // Default startup map
  const mapSelect = document.getElementById('pref-default-map');
  if (mapSelect) {
    mapSelect.value = APP.progress.defaultMap || '';
    mapSelect.addEventListener('change', () => {
      APP.progress.defaultMap = mapSelect.value;
      APP.saveProgress();
    });
  }

  // Export / Import
  document.getElementById('s-export').addEventListener('click', () => {
    document.getElementById('q-export').click();
  });
  document.getElementById('s-import').addEventListener('click', () => {
    document.getElementById('q-import').click();
  });

  // Wipe buttons
  document.getElementById('wipe-quests-btn').addEventListener('click', () => {
    showWipeModal('Wipe ALL quest progress? This cannot be undone.', () => {
      try {
        APP.progress.quests.clear(); APP.saveProgress();
        if (typeof questsRender === 'function') questsRender();
        if (typeof updateGlobalStats === 'function') updateGlobalStats();
        if (typeof buildDashboard === 'function') buildDashboard();
        showToast('Quest progress wiped');
      } catch(e) { console.error('Wipe quests error:', e); showToast('Error: ' + e.message); }
    });
  });
  document.getElementById('wipe-col-btn').addEventListener('click', () => {
    showWipeModal('Reset Collector item progress?', () => {
      APP.progress.collector.clear(); APP.saveProgress();
      try { if(typeof collectorRender==='function') collectorRender(); if(typeof updateDashboardStats==='function') updateDashboardStats(); } catch(e){}
      showToast('Collector progress reset');
    });
  });
  document.getElementById('wipe-hide-btn').addEventListener('click', () => {
    showWipeModal('Wipe Hideout item progress?', () => {
      APP.progress.hideout.clear();
      APP.progress.hideoutCounts = {};
      APP.saveProgress();
      try {
        if (typeof updateHideoutCount === 'function') updateHideoutCount();
        if (activeStation) { const s = hideoutData.find(x => x.id === activeStation); if (s) renderStation(s); }
      } catch(e){}
      showToast('Hideout progress wiped');
    });
  });
  document.getElementById('wipe-story-btn').addEventListener('click', () => {
    showWipeModal('Wipe all Story progress? Ending choice, step checks and story items will be reset.', () => {
      APP.progress.story.clear();
      APP.progress.storyStepChecks = {};
      APP.progress.storyItems = {};
      APP.saveProgress();
      try { if (typeof storyRender === 'function') storyRender(); } catch(e){}
      showToast('Story progress wiped');
    });
  });
  document.getElementById('wipe-all-btn').addEventListener('click', () => {
    showWipeModal('WIPE EVERYTHING? All quest, collector, hideout and story progress will be permanently deleted.', () => {
      try {
        APP.progress.quests.clear();
        APP.progress.collector.clear();
        APP.progress.hideout.clear();
        APP.progress.hideoutCounts = {};
        APP.progress.story.clear();
        APP.progress.storyStepChecks = {};
        APP.progress.storyItems = {};
        if (APP.progress.raidItems) APP.progress.raidItems.clear();
        APP.progress.raidItemCounts = {};
        APP.progress.level = 1;
        APP.saveProgress();
        if (typeof questsRender === 'function') questsRender();
        if (typeof collectorRender === 'function') collectorRender();
        if (typeof storyRender === 'function') storyRender();
        if (typeof updateGlobalStats === 'function') updateGlobalStats();
        if (typeof buildDashboard === 'function') buildDashboard();
        if (typeof updateLevelDisplay === 'function') updateLevelDisplay();
        if (typeof updateHideoutCount === 'function') updateHideoutCount();
        showToast('All progress wiped', 'warn');
      } catch(e) { console.error('Wipe all error:', e); showToast('Error: ' + e.message); }
    });
  });
}


// ── Faction ────────────────────────────────────────────────────────────────
function factionSetup() {
  // Show modal on first launch
  if (!APP.progress.faction) {
    document.getElementById('faction-modal').classList.add('open');
  }
  updateFactionBadge();
}

function selectFaction(f) {
  APP.progress.faction = f;
  APP.saveProgress();
  document.getElementById('faction-modal').classList.remove('open');
  updateFactionBadge();
  showToast(`Faction set: ${f.toUpperCase()}`);
}

function skipFaction() {
  document.getElementById('faction-modal').classList.remove('open');
}

function updateFactionBadge() {
  const badge = document.getElementById('faction-badge');
  if (badge) {
    const f = APP.progress.faction;
    badge.className = 'faction-badge ' + (f || 'none');
    badge.textContent = f ? f.toUpperCase() : 'FACTION';
    badge.title = 'Click to change faction';
  }
  // Highlight active faction in settings
  ['bear','usec'].forEach(f => {
    const btn = document.getElementById('s-' + f);
    if (btn) btn.classList.toggle('selected', APP.progress.faction === f);
  });
  // Highlight in faction modal
  ['bear','usec'].forEach(f => {
    const card = document.getElementById('faction-' + f);
    if (card) card.classList.toggle('selected', APP.progress.faction === f);
  });
}


// ── Raid Planner ─────────────────────────────────────────────────────────────
function openRaidPlanner() {
  document.getElementById('raid-modal').classList.add('open');
  // Auto-select last used map if available
  renderRaidQuests();
}

function renderRaidQuests() {
  const mapVal = document.getElementById('raid-map-select').value;
  const list = document.getElementById('raid-quest-list');
  const footer = document.getElementById('raid-footer');
  const summary = document.getElementById('raid-summary');
  
  if (!mapVal) {
    list.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px;font-family:monospace;font-size:12px;">Select a map to see active quests</div>';
    footer.style.display = 'none';
    return;
  }

  if (typeof allQuests === 'undefined' || !allQuests.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px;">Quests not loaded yet — open the Quests tab first</div>';
    return;
  }

  // Find incomplete quests with objectives on this map
  const questsOnMap = allQuests.filter(q => {
    if (APP.progress.quests.has(q.id)) return false;
    return (q.objectives || []).some(o => (o.maps || []).some(m => m.normalizedName === mapVal));
  });

  // Use the same isAvailable logic as the quests tab
  const checkAvailable = (q) => {
    if (q.minPlayerLevel && APP.progress.level < q.minPlayerLevel) return false;
    for (const obj of (q.objectives||[])) {
      if (obj.playerLevel && APP.progress.level < obj.playerLevel) return false;
    }
    const hardReqs = (q.taskRequirements||[]).filter(r => !r.status || r.status === 'complete');
    return hardReqs.every(r => APP.progress.quests.has(r.task.id));
  };

  // Separate into available and locked
  const available = questsOnMap.filter(q => checkAvailable(q));
  const locked = questsOnMap.filter(q => !checkAvailable(q));

  if (!questsOnMap.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--green);padding:40px;font-family:monospace;">✓ No active quests on this map!</div>';
    footer.style.display = 'none';
    return;
  }

  let html = '';
  if (available.length) {
    html += `<div style="font-family:monospace;font-size:9px;letter-spacing:2px;color:var(--green);margin-bottom:8px;">AVAILABLE NOW — ${available.length} QUESTS</div>`;
    available.forEach(q => {
      const trader = getTrader(q.trader.name);
      const objectives = (q.objectives||[]).filter(o=>(o.maps||[]).some(m=>m.normalizedName===mapVal));
      html += `
        <div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${trader.color};padding:10px 14px;margin-bottom:6px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:13px;font-weight:600;color:var(--text);">${q.name}</span>
            ${q.kappaRequired ? '<span style="font-size:10px;background:rgba(212,175,55,.15);color:var(--gold);padding:1px 5px;border:1px solid rgba(212,175,55,.3);">KAPPA</span>' : ''}
            <span style="font-size:11px;color:${trader.color};margin-left:auto;">${q.trader.name}</span>
          </div>
          ${objectives.map(o => `<div style="font-size:11px;color:var(--text3);padding-left:8px;border-left:2px solid var(--border2);">• ${o.description||o.type}</div>`).join('')}
        </div>`;
    });
  }

  if (locked.length) {
    html += `<div style="font-family:monospace;font-size:9px;letter-spacing:2px;color:var(--text3);margin:12px 0 8px;">LOCKED — ${locked.length} MORE QUESTS ON THIS MAP</div>`;
    locked.forEach(q => {
      const trader = getTrader(q.trader.name);
      const lvlLock = q.minPlayerLevel && APP.progress.level < q.minPlayerLevel;
      const lockReason = lvlLock ? ` (Lvl ${q.minPlayerLevel})` : '';
      html += `
        <div style="background:var(--surface);border:1px solid var(--border);padding:8px 14px;margin-bottom:4px;opacity:.5;">
          <span style="font-size:12px;color:var(--text2);">🔒 ${q.name}${lockReason}</span>
          <span style="font-size:11px;color:${trader.color};float:right;">${q.trader.name}</span>
        </div>`;
    });
  }

  list.innerHTML = html;
  summary.textContent = `${available.length} active · ${locked.length} locked · ${questsOnMap.length} total on this map`;
  footer.style.display = 'block';
}

// ── Live Game Integration ─────────────────────────────────────────────────────

// Formatted display names for tarkov.dev normalized map slugs
const MAP_DISPLAY = {
  'customs':           'Customs',
  'woods':             'Woods',
  'shoreline':         'Shoreline',
  'interchange':       'Interchange',
  'reserve':           'Reserve',
  'lighthouse':        'Lighthouse',
  'streets-of-tarkov': 'Streets of Tarkov',
  'ground-zero':       'Ground Zero',
  'the-lab':           'The Lab',
  'factory':           'Factory',
};

function setGameStatusBadge(state, text, color) {
  const dot  = document.getElementById('game-status-dot');
  const txt  = document.getElementById('game-status-text');
  const badge = document.getElementById('game-status-badge');
  if (!dot || !txt) return;
  dot.style.background = color;
  txt.textContent = text;
  txt.style.color = color;
  if (badge) badge.title = 'Live game integration: ' + text;
}

function showMatchmakingOverlay(currentMap) {
  if (APP.progress.autoShowOnMatchmaking === false) return;
  const overlay = document.getElementById('matchmaking-overlay');
  const hint    = document.getElementById('mm-map-hint');
  if (!overlay) return;
  if (hint) {
    hint.textContent = currentMap
      ? 'Map: ' + (MAP_DISPLAY[currentMap] || currentMap)
      : 'Waiting to detect map…';
  }
  overlay.style.display = 'block';
  // Auto-hide after 2 minutes
  setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 120000);
}

function showPostRaidPanel(mapPlayed, raidDuration) {
  if (APP.progress.postRaidPanel === false) return;
  if (!mapPlayed) return;

  const panel = document.getElementById('post-raid-panel');
  const list  = document.getElementById('post-raid-list');
  const label = document.getElementById('post-raid-map-label');
  if (!panel || !list) return;

  const mapName = MAP_DISPLAY[mapPlayed] || mapPlayed;
  if (label) {
    const mins = Math.floor(raidDuration / 60);
    const secs = raidDuration % 60;
    label.textContent = mapName + (raidDuration > 0 ? ' · ' + mins + 'm ' + secs + 's' : '');
  }

  // Get available quests that were on this map
  if (typeof allQuests === 'undefined' || !allQuests.length) {
    list.innerHTML = '<div style="padding:12px 16px;font-size:12px;color:var(--text3);">Load the Quests tab first to enable this feature.</div>';
    panel.style.display = 'flex';
    return;
  }

  const mapQuests = allQuests.filter(q => {
    if (APP.progress.quests.has(q.id)) return false;
    return (q.objectives || []).some(o => (o.maps || []).some(m => m.normalizedName === mapPlayed));
  });

  // Only show available quests (prereqs met)
  const available = mapQuests.filter(q => {
    if (q.minPlayerLevel && APP.progress.level < q.minPlayerLevel) return false;
    return (q.taskRequirements || []).filter(r => !r.status || r.status === 'complete')
      .every(r => APP.progress.quests.has(r.task.id));
  });

  if (available.length === 0) {
    list.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--green);text-align:center;">✓ No active quests on ' + mapName + '!</div>';
  } else {
    list.innerHTML = available.map(q => {
      const trader = getTrader(q.trader.name);
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s;" ' +
        'onmouseover="this.style.background=\'var(--surface)\'" onmouseout="this.style.background=\'transparent\'" ' +
        'onclick="postRaidCompleteQuest(\'' + q.id + '\', this)">' +
        '<div style="width:4px;height:32px;background:' + trader.color + ';flex-shrink:0;"></div>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + q.name + '</div>' +
        '<div style="font-size:10px;color:' + trader.color + ';">' + q.trader.name + (q.kappaRequired ? ' · κ' : '') + '</div>' +
        '</div>' +
        '<div style="font-size:10px;color:var(--text3);flex-shrink:0;">TAP TO COMPLETE</div>' +
        '</div>';
    }).join('');
  }

  panel.style.display = 'flex';
}

function postRaidCompleteQuest(questId, rowEl) {
  if (!questId || APP.progress.quests.has(questId)) return;
  APP.progress.quests.add(questId);
  APP.saveProgress();
  if (typeof updateGlobalStats === 'function') updateGlobalStats();
  if (typeof buildDashboard === 'function') buildDashboard();

  // Visual feedback — strike through and fade
  rowEl.style.opacity = '0.4';
  rowEl.style.pointerEvents = 'none';
  const nameEl = rowEl.querySelector('div[style*="font-size:12px"]');
  if (nameEl) nameEl.style.textDecoration = 'line-through';

  showToast('Quest marked complete!');
}

function handleGameEvent(event) {
  if (!event || !event.type) return;

  switch (event.type) {

    case 'log-not-found': {
      setGameStatusBadge('not-found', 'NOT FOUND', 'var(--text4)');
      const logPathEl = document.getElementById('live-log-path');
      const badge = document.getElementById('live-status-badge');
      if (logPathEl) logPathEl.textContent = 'EFT log directory not found. Install EFT and launch it once to generate logs.';
      if (badge) { badge.textContent = 'NOT FOUND'; badge.style.color = 'var(--text4)'; badge.style.borderColor = 'var(--border2)'; }
      break;
    }

    case 'log-watching': {
      setGameStatusBadge('watching', 'STANDBY', 'var(--text3)');
      const logPathEl = document.getElementById('live-log-path');
      const badge = document.getElementById('live-status-badge');
      if (logPathEl) logPathEl.textContent = 'Watching: ' + (event.logDir || '');
      if (badge) { badge.textContent = 'ACTIVE'; badge.style.color = 'var(--green)'; badge.style.borderColor = 'rgba(76,175,110,.4)'; }
      break;
    }

    case 'game-launched': {
      setGameStatusBadge('launched', 'IN GAME', '#4a90d9');
      showToast('Tarkov detected — tracker ready', 'success');
      break;
    }

    case 'matchmaking': {
      setGameStatusBadge('matchmaking', 'MATCHING', 'var(--gold)');
      document.getElementById('matchmaking-overlay') && (document.getElementById('matchmaking-overlay').style.display = 'none');
      showMatchmakingOverlay(event.state && event.state.currentMap);
      showToast('Matchmaking started…', 'success');
      break;
    }

    case 'map-detected': {
      const mapName = MAP_DISPLAY[event.map] || event.map;
      // Update matchmaking overlay hint if visible
      const hint = document.getElementById('mm-map-hint');
      if (hint && hint.isConnected) hint.textContent = 'Map: ' + mapName;
      // Update raid planner dropdown if open
      const raidSelect = document.getElementById('raid-map-select');
      if (raidSelect && event.map) {
        // Find closest matching option
        const opts = Array.from(raidSelect.options);
        const match = opts.find(o => o.value && (o.value.toLowerCase() === event.map || o.text.toLowerCase().includes(mapName.toLowerCase())));
        if (match) { raidSelect.value = match.value; if (typeof renderRaidQuests === 'function') renderRaidQuests(); }
      }
      break;
    }

    case 'raid-start': {
      const map = event.state && event.state.currentMap;
      const mapName = map ? (MAP_DISPLAY[map] || map) : 'Unknown map';
      setGameStatusBadge('in-raid', 'IN RAID', 'var(--red)');
      // Hide matchmaking overlay
      const mmOverlay = document.getElementById('matchmaking-overlay');
      if (mmOverlay) mmOverlay.style.display = 'none';
      // Show quest reminder toast
      if (APP.progress.raidReminder !== false) {
        const count = (typeof allQuests !== 'undefined' && map)
          ? allQuests.filter(q => !APP.progress.quests.has(q.id) && (q.objectives||[]).some(o => (o.maps||[]).some(m => m.normalizedName === map))).length
          : 0;
        showToast('Raid started — ' + mapName + (count > 0 ? ' · ' + count + ' active quests' : ''), 'success');
      }
      break;
    }

    case 'raid-end': {
      setGameStatusBadge('menu', 'IN MENU', 'var(--text3)');
      // Show post-raid quick-complete panel
      if (event.wasInRaid && event.mapPlayed) {
        setTimeout(() => showPostRaidPanel(event.mapPlayed, event.raidDuration || 0), 500);
      }
      break;
    }

    case 'quest-complete': {
      // Auto-complete a quest detected in the EFT log file
      var detectedId = event.questId;
      if (!detectedId) break;
      if (typeof allQuests === 'undefined' || !allQuests.length) {
        // Quests tab not loaded yet — queue for when it loads
        if (!window._pendingAutoComplete) window._pendingAutoComplete = [];
        window._pendingAutoComplete.push(detectedId);
        break;
      }
      autoCompleteQuestById(detectedId);
      break;
    }
  }
}

// Auto-complete a quest by its tarkov.dev ID (called from log watcher events)
function autoCompleteQuestById(questId) {
  if (APP.progress.autoQuestComplete === false) return; // user disabled the feature
  if (!questId || APP.progress.quests.has(questId)) return;
  const q = (typeof allQuests !== 'undefined') && allQuests.find(q => q.id === questId);
  if (!q) return; // Not a known quest ID — ignore
  APP.progress.quests.add(questId);
  APP.saveProgress();
  if (typeof questsRender === 'function') questsRender();
  if (typeof updateGlobalStats === 'function') updateGlobalStats();
  if (typeof buildDashboard === 'function') buildDashboard();
  showToast('✓ Auto-completed: ' + q.name);
  console.log('[KappaTracker] Quest auto-completed from log:', q.name, '(' + questId + ')');
}

function setupLiveIntegration() {
  if (!window.electronAPI || !window.electronAPI.onGameEvent) return;
  window.electronAPI.onGameEvent(handleGameEvent);
  console.log('[KappaTracker] Live game integration listener registered');
}

// ── Hotkey Rebinding ──────────────────────────────────────────────────────────

// Converts a DOM KeyboardEvent into an Electron globalShortcut accelerator string
function keyEventToAccelerator(e) {
  var parts = [];
  if (e.ctrlKey)  parts.push('Ctrl');
  if (e.altKey)   parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey)  parts.push('Super');

  var key = e.key;
  // Ignore bare modifier presses
  if (['Control', 'Alt', 'Shift', 'Meta', 'Super'].includes(key)) return null;

  // Map browser key names → Electron accelerator names
  var keyMap = {
    ' ': 'Space', 'ArrowUp': 'Up', 'ArrowDown': 'Down',
    'ArrowLeft': 'Left', 'ArrowRight': 'Right',
    'Escape': 'Escape', 'Tab': 'Tab', 'Enter': 'Return',
    'Backspace': 'Backspace', 'Delete': 'Delete',
    'Home': 'Home', 'End': 'End',
    'PageUp': 'PageUp', 'PageDown': 'PageDown',
    'Insert': 'Insert', 'PrintScreen': 'PrintScreen',
    'F1':'F1','F2':'F2','F3':'F3','F4':'F4','F5':'F5','F6':'F6',
    'F7':'F7','F8':'F8','F9':'F9','F10':'F10','F11':'F11','F12':'F12',
  };

  var mapped = keyMap[key] || (key.length === 1 ? key.toUpperCase() : null);
  if (!mapped) return null;
  // Must have at least one modifier (to avoid conflicts with normal typing)
  if (parts.length === 0) return null;
  parts.push(mapped);
  return parts.join('+');
}

var hotkeyCapturing = false;
var hotkeyKeydownHandler = null;

function setupHotkeyRebind() {
  if (!window.electronAPI || !window.electronAPI.setHotkey) return;

  var display    = document.getElementById('hotkey-display');
  var rebindBtn  = document.getElementById('hotkey-rebind-btn');
  var captureRow = document.getElementById('hotkey-capture-row');
  var hint       = document.getElementById('hotkey-capture-hint');
  var cancelBtn  = document.getElementById('hotkey-cancel-btn');
  var errorEl    = document.getElementById('hotkey-error');
  if (!rebindBtn || !display) return;

  // Load saved hotkey from main process
  window.electronAPI.getHotkey().then(function(hk) {
    if (hk && display) display.textContent = hk;
  });

  function enterCaptureMode() {
    hotkeyCapturing = true;
    if (captureRow) captureRow.style.display = 'flex';
    if (errorEl) errorEl.style.display = 'none';
    if (hint) hint.textContent = 'Press your new hotkey combination…';
    rebindBtn.textContent = 'LISTENING…';
    rebindBtn.style.color = 'var(--gold)';
    rebindBtn.style.borderColor = 'rgba(200,168,75,.4)';

    hotkeyKeydownHandler = function(e) {
      if (!hotkeyCapturing) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { exitCaptureMode(); return; }
      var accel = keyEventToAccelerator(e);
      if (!accel) {
        if (hint) hint.textContent = 'Add Ctrl, Alt or Shift + a key…';
        return;
      }
      if (hint) hint.textContent = 'Setting: ' + accel + '…';
      window.electronAPI.setHotkey(accel).then(function(result) {
        exitCaptureMode();
        if (result && result.success) {
          if (display) display.textContent = accel;
          syncHotkeyLabels(accel);
          APP.progress.hotkey = accel;
          APP.saveProgress();
          showToast('Hotkey set: ' + accel);
        } else {
          if (errorEl) { errorEl.textContent = (result && result.error) || 'Could not set hotkey — try a different combination.'; errorEl.style.display = 'block'; }
        }
      });
    };
    document.addEventListener('keydown', hotkeyKeydownHandler, true);
  }

  function exitCaptureMode() {
    hotkeyCapturing = false;
    if (captureRow) captureRow.style.display = 'none';
    rebindBtn.textContent = 'CHANGE';
    rebindBtn.style.color = '';
    rebindBtn.style.borderColor = '';
    if (hotkeyKeydownHandler) {
      document.removeEventListener('keydown', hotkeyKeydownHandler, true);
      hotkeyKeydownHandler = null;
    }
  }

  rebindBtn.addEventListener('click', function() {
    if (hotkeyCapturing) exitCaptureMode();
    else enterCaptureMode();
  });
  if (cancelBtn) cancelBtn.addEventListener('click', exitCaptureMode);
}

// ── FTUE / Header Hotkey ──────────────────────────────────────────────────────

// Sync both hotkey labels (header button + FTUE modal) from a given accelerator string
function syncHotkeyLabels(accel) {
  var headerLabel = document.getElementById('header-hotkey-label');
  var ftueLabel   = document.getElementById('ftue-hotkey-label');
  if (headerLabel) headerLabel.textContent = accel;
  if (ftueLabel)   ftueLabel.textContent   = accel;
}

// Called by the header hotkey button — hides the window so users know the hotkey works
function toggleWindowHotkey() {
  if (window.electronAPI && window.electronAPI.hideWindow) {
    window.electronAPI.hideWindow();
  }
}

// Called by the FTUE modal "LET'S GO" button
function closeFTUE() {
  var modal = document.getElementById('ftue-modal');
  if (modal) modal.style.display = 'none';
  var dontShow = document.getElementById('ftue-dont-show');
  if (dontShow && dontShow.checked) {
    APP.progress.ftueComplete = true;
    APP.saveProgress();
  }
}

// Show FTUE if this is the user's first launch (ftueComplete not set)
function maybeShowFTUE() {
  if (APP.progress.ftueComplete) return;
  var modal = document.getElementById('ftue-modal');
  if (modal) modal.style.display = 'flex';
}

// ── Ad Integration ────────────────────────────────────────────────────────────

var owAdInstance = null;

// Called by the OwAd SDK script's onload attribute
function owAdSdkReady() {
  console.log('[Ad] Overwolf Ad SDK loaded');
  // Only init the ad if the user is not premium
  if (!APP.isPremium) {
    initOwAd();
  }
}

function initOwAd() {
  if (owAdInstance) return; // Already initialised
  var container = document.getElementById('overwolf-ad');
  if (!container || !window.OwAd) return;
  try {
    owAdInstance = new window.OwAd(container, { size: { width: 400, height: 300 } });
    owAdInstance.addEventListener('ow_internal_rendered', function() {
      console.log('[Ad] Ad rendered successfully');
    });
    owAdInstance.addEventListener('player_got_ad', function() {
      console.log('[Ad] Ad filled');
    });
    console.log('[Ad] OwAd initialised');
  } catch(e) {
    console.log('[Ad] OwAd init failed:', e.message);
  }
}

function destroyOwAd() {
  if (owAdInstance && typeof owAdInstance.removeAd === 'function') {
    owAdInstance.removeAd();
  }
  owAdInstance = null;
}

// ── Subscription / Premium ────────────────────────────────────────────────────

// Attach to APP so it's accessible from inline HTML onclick handlers
APP.isPremium = false;

function applyPremiumState(isPremium) {
  APP.isPremium = isPremium;
  var adSection       = document.getElementById('ad-section');
  var premiumBadge    = document.getElementById('premium-badge-section');

  if (isPremium) {
    if (adSection)    adSection.style.display = 'none';
    if (premiumBadge) premiumBadge.style.display = 'block';
    destroyOwAd();
    console.log('[Premium] Ad-free mode active');
  } else {
    if (adSection)    adSection.style.display = 'block';
    if (premiumBadge) premiumBadge.style.display = 'none';
    // Init ad if SDK already loaded
    if (window.OwAd) initOwAd();
  }
}

async function checkAndApplySubscription() {
  if (!window.electronAPI || !window.electronAPI.checkSubscription) return;
  try {
    var result = await window.electronAPI.checkSubscription();
    applyPremiumState(!!(result && result.isPremium));
  } catch(e) {
    console.log('[Premium] Subscription check failed:', e);
    applyPremiumState(false);
  }
}

function premiumUpgrade() {
  if (window.electronAPI && window.electronAPI.openStore) {
    window.electronAPI.openStore();
  } else if (window.electronAPI && window.electronAPI.openExternal) {
    window.electronAPI.openExternal('https://www.overwolf.com/app/kappa-tracker');
  }
}

// ── Mobile drawer helpers ──────────────────────────────────────────────────
function openMobMore() {
  document.getElementById('mob-more-overlay').classList.add('open');
  document.getElementById('mob-more-sheet').classList.add('open');
}
function closeMobMore() {
  document.getElementById('mob-more-overlay').classList.remove('open');
  document.getElementById('mob-more-sheet').classList.remove('open');
}

// ── Mobile quest filter chips ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  var chips = document.querySelectorAll('#mob-quest-filters .mob-filter-chip');
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      // Mirror the desktop sidebar filter button click
      var qf = chip.dataset.qf;
      var desktopBtn = document.querySelector('.f-btn[data-qf="' + qf + '"]');
      if (desktopBtn) desktopBtn.click();
    });
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────
(async () => {
  await APP.loadProgress();
  updateLevelDisplay();

  // Desktop-only: sync hotkey labels
  if (!IS_MOBILE) {
    if (window.electronAPI && window.electronAPI.getHotkey) {
      try {
        var savedHotkey = await window.electronAPI.getHotkey();
        if (savedHotkey) syncHotkeyLabels(savedHotkey);
      } catch(_) {}
    } else if (APP.progress.hotkey) {
      syncHotkeyLabels(APP.progress.hotkey);
    }
  }

  // Initialise cloud sync (no-op if firebase-config.js has the placeholder values)
  if (typeof SYNC !== 'undefined') SYNC.init();

  // Load trader images in background - don't block main content
  loadTraderImages().then(() => {
    if (typeof buildDashboard === 'function') buildDashboard();
  }).catch(e => console.warn('Trader images failed:', e));
  factionSetup();
  questsSetup();
  collectorSetup();
  // story is lazily initialised in switchTab() on first visit

  // Live integration only makes sense on desktop (reads local EFT log file)
  if (!IS_MOBILE) {
    setupLiveIntegration();
  }

  // Subscription / ads — skip on mobile (no Overwolf ad SDK)
  if (!IS_MOBILE) {
    checkAndApplySubscription();
    // Show FTUE on first launch
    setTimeout(maybeShowFTUE, 600);
  }

  // Dashboard, hideout, ammo, items load lazily
})();
