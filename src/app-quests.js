// ── QUESTS MODULE ─────────────────────────────────────────────────────────

const TRADER_ORDER = ['Prapor','Therapist','Fence','Skier','Peacekeeper','Mechanic','Ragman','Jaeger','Lightkeeper','BTR Driver','Ref'];

const MAP_LABELS = {
  'customs':'Customs',
  'factory-day':'Factory','factory-night':'Factory Night',
  'factory':'Factory','night-factory':'Factory Night',
  'woods':'Woods','shoreline':'Shoreline','interchange':'Interchange',
  'reserve':'Reserve','lighthouse':'Lighthouse','streets-of-tarkov':'Streets',
  'ground-zero':'Ground Zero','ground-zero-21':'Ground Zero',
  'the-lab':'Labs','the-labyrinth':'The Labyrinth',
  'sandbox':'Sandbox','sandbox-high':'Sandbox High'
};

const GQL_QUESTS = `{
  tasks {
    id name wikiLink kappaRequired
    minPlayerLevel
    trader { name }
    taskRequirements { task { id name } status }
    objectives {
      id type description
      maps { normalizedName }
      ... on TaskObjectivePlayerLevel { playerLevel }
    }
  }
}`;

let allQuests = [], questsLoaded = false;
let qFilter = 'all', qTrader = null, qSort = 'trader', qSearch = '', qMapFilter = null;

async function questsInit() {
  try {
    const j = await tarkovGQL(GQL_QUESTS);
    if (!j || !j.data || !j.data.tasks) {
      throw new Error('Bad API response: ' + JSON.stringify(j).slice(0, 200));
    }
    allQuests = j.data.tasks;
    questsLoaded = true;
    // Apply default map filter from preferences
    if (APP.progress.defaultMap) qMapFilter = APP.progress.defaultMap;
    buildQuestSidebarTraders();
    buildMapFilterButtons();
    questsRender();
    updateGlobalStats();
    buildDashboard();
    buildItemsToKeep();
    // Flush any quest-complete events that arrived before quests were loaded
    if (window._pendingAutoComplete && window._pendingAutoComplete.length) {
      window._pendingAutoComplete.forEach(id => {
        if (typeof autoCompleteQuestById === 'function') autoCompleteQuestById(id);
      });
      window._pendingAutoComplete = [];
    }
  } catch(e) {
    console.error('Quest load error:', e);
    document.getElementById('quest-list').innerHTML =
      `<div class="state-box"><div class="state-icon">⚠</div><div class="state-title">Failed to Load</div><div class="state-sub">${e.message}</div></div>`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getQuestMaps(q) {
  const s = new Set();
  (q.objectives||[]).forEach(o => (o.maps||[]).forEach(m => {
    if (m.normalizedName && m.normalizedName !== 'any') {
      s.add(MAP_LABELS[m.normalizedName] || m.normalizedName);
    }
  }));
  return [...s];
}

function qById() {
  const m = {};
  allQuests.forEach(q => m[q.id] = q);
  return m;
}

function getAllPrereqs(id, visited = new Set()) {
  if (visited.has(id)) return [];
  visited.add(id);
  const m = qById();
  const q = m[id];
  if (!q) return [];
  let ids = [];
  (q.taskRequirements||[]).forEach(r => {
    ids.push(r.task.id);
    ids = ids.concat(getAllPrereqs(r.task.id, visited));
  });
  return [...new Set(ids)];
}

function isAvailable(q) {
  if (APP.progress.quests.has(q.id)) return false;
  // Check direct level requirement (minPlayerLevel field)
  if (q.minPlayerLevel && APP.progress.level < q.minPlayerLevel) return false;
  // Check level from objectives (TaskObjectivePlayerLevel)
  for (const obj of (q.objectives||[])) {
    if (obj.playerLevel && APP.progress.level < obj.playerLevel) return false;
  }
  // Only block on prerequisites that require 'complete' status
  // (some requirements only need the quest to be 'active', not finished)
  const hardReqs = (q.taskRequirements||[]).filter(r => !r.status || r.status === 'complete');
  return hardReqs.every(r => APP.progress.quests.has(r.task.id));
}

// ── Toggle ────────────────────────────────────────────────────────────────

function toggleQuest(id) {
  const m = qById();
  const q = m[id];
  if (!q) return;

  if (APP.progress.quests.has(id)) {
    APP.progress.quests.delete(id);
  } else {
    const prereqs = getAllPrereqs(id);
    let newCount = 0;
    prereqs.forEach(pid => {
      if (!APP.progress.quests.has(pid)) {
        APP.progress.quests.add(pid);
        newCount++;
      }
    });
    APP.progress.quests.add(id);
    if (newCount > 0) showToast(`✓ Auto-checked ${newCount} prerequisite${newCount > 1 ? 's' : ''}`);
  }

  APP.saveProgress();
  questsRender();
  updateGlobalStats();
  updateDashboardStats();
}

// ── Filter + Group ────────────────────────────────────────────────────────

function getFilteredQuests() {
  let qs = [...allQuests];
  // Respect "show non-Kappa quests" preference (unless already in Kappa-only filter)
  if (APP.progress.showNonKappa === false && qFilter !== 'kappa') {
    qs = qs.filter(q => q.kappaRequired);
  }
  if (qTrader) qs = qs.filter(q => q.trader.name === qTrader);
  if (qFilter === 'kappa') qs = qs.filter(q => q.kappaRequired);
  else if (qFilter === 'available') qs = qs.filter(q => isAvailable(q));
  else if (qFilter === 'remaining') qs = qs.filter(q => !APP.progress.quests.has(q.id));
  else if (qFilter === 'done') qs = qs.filter(q => APP.progress.quests.has(q.id));
  if (qMapFilter) {
    qs = qs.filter(q => getQuestMaps(q).includes(qMapFilter));
  }
  if (qSearch) {
    const s = qSearch.toLowerCase();
    qs = qs.filter(q => q.name.toLowerCase().includes(s));
  }
  return qs;
}

function groupQuests(qs) {
  if (qSort === 'trader') {
    const g = {};
    qs.forEach(q => { const t = q.trader.name; (g[t] = g[t]||[]).push(q); });
    return TRADER_ORDER.filter(t => g[t]).map(t => ({ label: t, quests: g[t] }));
  }
  if (qSort === 'map') {
    const g = {};
    qs.forEach(q => { const maps = getQuestMaps(q); const k = maps[0]||'No Map'; (g[k]=g[k]||[]).push(q); });
    return Object.entries(g).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => ({ label: k, quests: v }));
  }
  if (qSort === 'status') {
    const avail = qs.filter(q => isAvailable(q));
    const locked = qs.filter(q => !APP.progress.quests.has(q.id) && !isAvailable(q));
    const done = qs.filter(q => APP.progress.quests.has(q.id));
    return [
      avail.length && { label: 'Available Now', quests: avail },
      locked.length && { label: 'Locked', quests: locked },
      done.length && { label: 'Completed', quests: done },
    ].filter(Boolean);
  }
  return [{ label: 'All Quests', quests: [...qs].sort((a,b) => a.name.localeCompare(b.name)) }];
}

// ── Render ────────────────────────────────────────────────────────────────

function makeQuestCard(q) {
  const done = APP.progress.quests.has(q.id);
  const avail = isAvailable(q);
  const maps = getQuestMaps(q);
  const prereqs = q.taskRequirements||[];
  const trader = getTrader(q.trader.name);

  const el = document.createElement('div');
  el.className = 'quest-card' + (done ? ' done' : '');
  el.dataset.id = q.id;
  el.style.setProperty('--tc', trader.color);

  const prereqHtml = prereqs.map(r => {
    const d = APP.progress.quests.has(r.task.id);
    return `<span class="prereq-pill ${d?'done':''}">${r.task.name}</span>`;
  }).join('');

  el.innerHTML = `
    <div class="qcheck"><span class="qcheck-mark">✓</span></div>
    <div class="qinfo">
      <div class="qname">${q.name}</div>
      <div class="qmeta">
        <span class="trader-tag" style="color:${trader.color}">${q.trader.name}</span>
        ${maps.length ? `<span class="map-tag">${maps.slice(0,2).join(' · ')}</span>` : ''}
        ${prereqs.length ? `<span class="prereq-tag">🔗 ${prereqs.length} prereq${prereqs.length>1?'s':''}</span>` : ''}
        ${q.kappaRequired ? '<span class="kappa-badge">κ KAPPA</span>' : ''}
        ${!done && avail ? '<span class="ready-tag">▶ READY</span>' : ''}
      </div>
      ${prereqs.length ? `<div class="prereq-list">${prereqHtml}</div>` : ''}
    </div>
    ${q.wikiLink ? `<a class="wiki-btn" href="${q.wikiLink}" target="_blank" onclick="event.stopPropagation()">WIKI ↗</a>` : ''}
  `;

  // Check button respects double-click preference
  let checkClickCount = 0; let checkTimer = null;
  el.querySelector('.qcheck').addEventListener('click', e => {
    e.stopPropagation();
    if (!APP.progress.doubleClickQuest) { toggleQuest(q.id); return; }
    checkClickCount++;
    if (checkClickCount === 1) {
      checkTimer = setTimeout(() => { checkClickCount = 0; }, 400);
    } else {
      clearTimeout(checkTimer); checkClickCount = 0; toggleQuest(q.id);
    }
  });
  el.addEventListener('click', e => {
    if (e.target.closest('.wiki-btn')) return;
    if (e.target.closest('.qinfo') && !e.target.closest('.qcheck') && prereqs.length) {
      el.classList.toggle('expanded');
      return;
    }
    if (APP.progress.doubleClickQuest) return; // card body single-click does nothing in dbl mode
    toggleQuest(q.id);
  });

  return el;
}

function updateQuestCounts() {
  if (!questsLoaded) return;
  const kappa = allQuests.filter(q => q.kappaRequired);
  const kDone = kappa.filter(q => APP.progress.quests.has(q.id)).length;
  const total = allQuests.length;
  const done = allQuests.filter(q => APP.progress.quests.has(q.id)).length;

  document.getElementById('qf-all').textContent = total;
  document.getElementById('qf-kappa').textContent = kappa.length;
  document.getElementById('qf-avail').textContent = allQuests.filter(q => isAvailable(q)).length;
  document.getElementById('qf-rem').textContent = allQuests.filter(q => !APP.progress.quests.has(q.id)).length;
  document.getElementById('qf-done').textContent = done;
  document.getElementById('tc-q').textContent = `${done}/${total}`;
}

function questsRender() {
  if (!questsLoaded) return;
  updateQuestCounts();
  const qs = getFilteredQuests();
  const groups = groupQuests(qs);
  const list = document.getElementById('quest-list');

  if (qs.length === 0) {
    list.innerHTML = `<div class="state-box"><div class="state-icon">⊘</div><div class="state-title">No Quests Found</div><div class="state-sub">Try adjusting your filters or search term.</div></div>`;
    return;
  }

  list.innerHTML = '';
  groups.forEach(g => {
    const hdr = document.createElement('div');
    hdr.className = 'group-hdr';
    const trader = getTrader(g.label);
    // Portrait in group header
    const portrait = document.createElement('div');
    portrait.className = 'group-hdr-portrait';
    portrait.style.cssText = 'position:relative;overflow:hidden;';
    portrait.innerHTML = traderPortraitHTML(g.label, 22);
    hdr.appendChild(portrait);
    hdr.appendChild(document.createTextNode(g.label));
    list.appendChild(hdr);
    g.quests.forEach(q => list.appendChild(makeQuestCard(q)));
  });
}

// ── Map filter ────────────────────────────────────────────────────────────

function buildMapFilterButtons() {
  const container = document.getElementById('map-filter-list');
  if (!container) return;

  // Collect all unique map labels from quest objectives
  const mapSet = new Set();
  allQuests.forEach(q => {
    getQuestMaps(q).forEach(m => mapSet.add(m));
  });
  const maps = [...mapSet].sort();

  // Rebuild list (keep "All" first)
  container.innerHTML = `<button class="map-chip${qMapFilter === null ? ' active' : ''}" data-qmap="">All</button>`;
  maps.forEach(mapName => {
    const btn = document.createElement('button');
    btn.className = 'map-chip' + (qMapFilter === mapName ? ' active' : '');
    btn.dataset.qmap = mapName;
    btn.textContent = mapName;
    container.appendChild(btn);
  });

  // Attach listeners using delegation
  container.addEventListener('click', e => {
    const btn = e.target.closest('[data-qmap]');
    if (!btn) return;
    const val = btn.dataset.qmap;
    qMapFilter = val === '' ? null : val;
    container.querySelectorAll('.map-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    questsRender();
  });
}

// ── Sidebar trader list ───────────────────────────────────────────────────

function buildQuestSidebarTraders() {
  const traders = [...new Set(allQuests.map(q => q.trader.name))];
  const sorted = TRADER_ORDER.filter(t => traders.includes(t)).concat(traders.filter(t => !TRADER_ORDER.includes(t)));
  const container = document.getElementById('trader-list');
  container.innerHTML = '';

  // Active-trader banner — shows when a trader is selected with a clear button
  if (qTrader !== null) {
    const banner = document.createElement('div');
    banner.className = 'trader-active-banner';
    banner.innerHTML = `
      <span>Filtering: <strong>${qTrader}</strong></span>
      <button class="trader-clear-btn" title="Show all traders">✕ Clear</button>
    `;
    banner.querySelector('.trader-clear-btn').addEventListener('click', () => {
      qTrader = null;
      buildQuestSidebarTraders();
      questsRender();
    });
    container.appendChild(banner);
  }

  // All traders button
  const allBtn = document.createElement('button');
  allBtn.className = 't-btn' + (qTrader === null ? ' active' : '');
  allBtn.innerHTML = `
    <div class="t-portrait" style="background:var(--surface3);font-size:10px;color:var(--text3);">ALL</div>
    <div class="t-info">
      <div class="t-name" style="color:var(--text2);">All Traders</div>
      <div class="t-prog-bar"><div class="t-prog-fill" style="width:${allQuests.length>0?Math.round(allQuests.filter(q=>APP.progress.quests.has(q.id)).length/allQuests.length*100):0}%;background:var(--gold);"></div></div>
    </div>
    <span class="t-count">${allQuests.filter(q=>APP.progress.quests.has(q.id)).length}/${allQuests.length}</span>
  `;
  allBtn.addEventListener('click', () => { qTrader = null; buildQuestSidebarTraders(); questsRender(); });
  container.appendChild(allBtn);

  sorted.forEach(name => {
    const trader = getTrader(name);
    const tqs = allQuests.filter(q => q.trader.name === name);
    const tDone = tqs.filter(q => APP.progress.quests.has(q.id)).length;
    const pct = tqs.length > 0 ? Math.round((tDone / tqs.length) * 100) : 0;

    const btn = document.createElement('button');
    btn.className = 't-btn' + (qTrader === name ? ' active' : '');

    btn.innerHTML = `
      <div class="t-portrait" style="border-bottom:2px solid ${trader.color};position:relative;">
        ${traderPortraitHTML(name, 28)}
      </div>
      <div class="t-info">
        <div class="t-name" style="color:${trader.color}">${name}</div>
        <div class="t-prog-bar"><div class="t-prog-fill" style="width:${pct}%;background:${trader.color};"></div></div>
      </div>
      <span class="t-count">${tDone}/${tqs.length}</span>
    `;

    btn.addEventListener('click', () => {
      qTrader = qTrader === name ? null : name;
      buildQuestSidebarTraders();
      questsRender();
    });
    container.appendChild(btn);
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────

function questsSetup() {
  document.querySelectorAll('[data-qf]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-qf]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      qFilter = btn.dataset.qf;
      questsRender();
    });
  });

  document.querySelectorAll('[data-qs]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-qs]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      qSort = btn.dataset.qs;
      questsRender();
    });
  });

  document.getElementById('q-search').addEventListener('input', e => { qSearch = e.target.value; questsRender(); });

  document.getElementById('q-export').addEventListener('click', () => {
    const data = {
      version: 2,
      quests: [...APP.progress.quests],
      collector: [...APP.progress.collector],
      hideout: [...APP.progress.hideout],
      story: [...APP.progress.story],
      level: APP.progress.level,
      ts: Date.now()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kappa-progress-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    showToast('✓ Progress exported');
  });

  document.getElementById('q-import').addEventListener('click', () => document.getElementById('q-import-file').click());
  document.getElementById('q-import-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d.quests) APP.progress.quests = new Set(d.quests);
        if (d.collector) APP.progress.collector = new Set(d.collector);
        if (d.hideout) APP.progress.hideout = new Set(d.hideout);
        if (d.story) APP.progress.story = new Set(d.story);
        if (d.level) APP.progress.level = d.level;
        APP.saveProgress();
        questsRender();
        collectorRender();
        storyRender();
        updateGlobalStats();
        buildDashboard();
        showToast(`✓ Progress imported successfully`);
      } catch { showToast('✗ Invalid file format'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });



  questsInit();
}
