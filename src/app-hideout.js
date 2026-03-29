// ── HIDEOUT MODULE ────────────────────────────────────────────────────────

const HIDEOUT_GQL = `{
  hideoutStations {
    id
    name
    levels {
      id
      level
      itemRequirements {
        item { id name shortName iconLink }
        count
      }
      stationLevelRequirements {
        station { name }
        level
      }
    }
  }
}`;

let hideoutData = [];
let activeStation = null;

async function hideoutInit() {
  try {
    const j = await tarkovGQL(HIDEOUT_GQL);
    hideoutData = j.data.hideoutStations.sort((a,b)=>a.name.localeCompare(b.name));
    buildStationList();
    updateHideoutCount();
  } catch(e) {
    console.error('Hideout error:', e);
    document.getElementById('hideout-stations').innerHTML =
      `<div class="state-box" style="padding:30px 10px"><div class="state-icon">⚠</div><div class="state-sub">${e.message}</div></div>`;
  }
}

function buildStationList() {
  const container = document.getElementById('hideout-stations');
  container.innerHTML = '';
  hideoutData.forEach(station=>{
    const allItems = station.levels.flatMap(l=>l.itemRequirements||[]);
    let totalNeeded = 0, totalHave = 0;
    allItems.forEach(ir => {
      const needed = ir.count || 1;
      const key = `${station.id}_${ir.item.id}`;
      const have = Math.min((APP.progress.hideoutCounts && APP.progress.hideoutCounts[key]) || 0, needed);
      totalNeeded += needed;
      totalHave += have;
    });
    const pct = totalNeeded > 0 ? Math.round((totalHave/totalNeeded)*100) : 0;

    const btn = document.createElement('button');
    btn.className = 'station-btn' + (activeStation===station.id?' active':'');
    btn.innerHTML = `<span>${station.name}</span><span class="station-done-pct">${pct}%</span>`;
    btn.addEventListener('click',()=>{ activeStation=station.id; buildStationList(); renderStation(station); });
    container.appendChild(btn);
  });
}

function renderStation(station) {
  const main = document.getElementById('hideout-main');
  main.innerHTML = '';

  station.levels.forEach(level=>{
    const items = level.itemRequirements||[];
    const allDone = items.length>0 && items.every(ir=>APP.progress.hideout.has(`${station.id}_${ir.item.id}`));
    const someDone = items.some(ir=>APP.progress.hideout.has(`${station.id}_${ir.item.id}`));

    const card = document.createElement('div');
    card.className = 'level-card';

    const statusText = allDone ? 'BUILT ✓' : (someDone ? 'IN PROGRESS' : 'NOT STARTED');
    const statusClass = allDone ? 'built' : (someDone ? 'partial' : '');

    let reqHtml = '';
    if(level.stationLevelRequirements&&level.stationLevelRequirements.length) {
      reqHtml = `<div style="font-size:11px;color:var(--text3);margin-bottom:8px;font-family:'Share Tech Mono',monospace;">Requires: ${level.stationLevelRequirements.map(r=>`${r.station.name} Lvl ${r.level}`).join(', ')}</div>`;
    }

    let itemsHtml = '';
    if(items.length===0) {
      itemsHtml = `<div style="font-size:12px;color:var(--text3);padding:4px 0;">No item requirements for this level.</div>`;
    } else {
      items.forEach(ir=>{
        const key = `${station.id}_${ir.item.id}`;
        const have = APP.progress.hideout.has(key);
        const needed = ir.count || 1;
        const current = (APP.progress.hideoutCounts && APP.progress.hideoutCounts[key]) || 0;
        const complete = current >= needed;
        const countClass = complete ? 'complete' : current > 0 ? 'partial' : 'zero';
        const iconHtml = ir.item.iconLink
          ? `<img src="${ir.item.iconLink}" style="width:36px;height:36px;object-fit:contain;" onerror="this.style.display='none'">`
          : `<span style="font-size:16px;">${getItemIcon(ir.item.name)}</span>`;
        itemsHtml += `
          <div class="item-row ${complete?'have':''}" data-key="${key}" data-needed="${needed}" style="cursor:default;">
            <div class="item-ico" style="width:40px;height:40px;background:var(--surface3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">${iconHtml}</div>
            <div class="item-name">${ir.item.name}</div>
            <div class="h-count-controls">
              <button class="h-count-btn" onclick="adjustHideoutCount('${key}', -1, ${needed})">−</button>
              <div class="h-count-display ${countClass}">${current} / ${needed}</div>
              <button class="h-count-btn" onclick="adjustHideoutCount('${key}', 1, ${needed})">+</button>
            </div>
          </div>`;
      });
    }

    card.innerHTML = `
      <div class="level-header">
        <div class="level-title">${station.name} — Level ${level.level}</div>
        <div class="level-status ${statusClass}">${statusText}</div>
      </div>
      <div class="level-body">
        ${reqHtml}
        ${itemsHtml}
      </div>
    `;

    card.querySelectorAll('.item-row').forEach(row=>{
      row.addEventListener('click',()=>{
        const k = row.dataset.key;
        const needed = parseInt(row.dataset.needed) || 1;
        if (!APP.progress.hideoutCounts) APP.progress.hideoutCounts = {};
        if(APP.progress.hideout.has(k)) {
          APP.progress.hideout.delete(k);
          APP.progress.hideoutCounts[k] = 0;
        } else {
          APP.progress.hideout.add(k);
          APP.progress.hideoutCounts[k] = needed;
        }
        // Update just this row
        row.classList.toggle('have');
        const nameEl = row.querySelector('.item-name');
        if(row.classList.contains('have')) nameEl.style.cssText='color:var(--text3);text-decoration:line-through;';
        else nameEl.style.cssText='';
        // Check if whole level is now done → cascade previous levels
        const levelItems = card.querySelectorAll('.item-row');
        const allNowDone = [...levelItems].every(r=>r.classList.contains('have'));
        const someNowDone = [...levelItems].some(r=>r.classList.contains('have'));
        if (allNowDone) {
          const cascadeStation = hideoutData.find(s => s.id === activeStation);
          if (cascadeStation) {
            if (cascadeHideoutLevels(cascadeStation, level.level)) {
              // Lower levels were auto-filled — do a full re-render to reflect it
              APP.saveProgress();
              buildStationList();
              renderStation(cascadeStation);
              updateHideoutCount();
              return;
            }
          }
        }
        // Update level status badge in place
        const statusEl = card.querySelector('.level-status');
        if(allNowDone){ statusEl.textContent='BUILT ✓'; statusEl.className='level-status built'; }
        else if(someNowDone){ statusEl.textContent='IN PROGRESS'; statusEl.className='level-status partial'; }
        else{ statusEl.textContent='NOT STARTED'; statusEl.className='level-status'; }
        APP.saveProgress();
        buildStationList();
        updateHideoutCount();
      });
    });

    main.appendChild(card);
  });
}

function getItemIcon(name) {
  const n = name.toLowerCase();
  if(n.includes('bitcoin')) return '₿';
  if(n.includes('gpu')||n.includes('graphic')) return '🖥️';
  if(n.includes('ledx')) return '💊';
  if(n.includes('fuel')||n.includes('canister')) return '⛽';
  if(n.includes('filter')||n.includes('water')) return '💧';
  if(n.includes('screw')||n.includes('bolt')||n.includes('nut')) return '🔩';
  if(n.includes('wire')||n.includes('electric')) return '⚡';
  if(n.includes('tool')) return '🔧';
  if(n.includes('drill')) return '🔩';
  if(n.includes('gun')||n.includes('pistol')||n.includes('rifle')) return '🔫';
  if(n.includes('med')||n.includes('saline')||n.includes('blood')) return '💉';
  if(n.includes('food')||n.includes('ration')) return '🍱';
  if(n.includes('book')||n.includes('manual')) return '📚';
  if(n.includes('battery')) return '🔋';
  if(n.includes('tube')) return '🧪';
  if(n.includes('rope')||n.includes('cord')) return '🪢';
  return '📦';
}

function updateHideoutCount() {
  const total = hideoutData.flatMap(s=>s.levels.flatMap(l=>l.itemRequirements||[])).length;
  const done = APP.progress.hideout.size;
  const pct = total > 0 ? Math.round((done/total)*100) : 0;
  document.getElementById('tc-h').textContent = `${done}/${total}`;
  const elD = document.getElementById('ds-hd');
  const elT = document.getElementById('ds-ht');
  const elPct = document.getElementById('ds-hpct');
  const elBar = document.getElementById('ds-hbar');
  if(elD) elD.textContent = done;
  if(elT) elT.textContent = total;
  if(elPct) elPct.textContent = `${pct}% gathered`;
  if(elBar) elBar.style.width = pct + '%';
}

function hideoutSetup() {
  hideoutInit();
}

// Fills all levels below completedLevelNumber on the given station to 100%
function cascadeHideoutLevels(station, completedLevelNumber) {
  if (!APP.progress.hideoutCounts) APP.progress.hideoutCounts = {};
  let changed = false;
  station.levels.forEach(l => {
    if (l.level >= completedLevelNumber) return;
    (l.itemRequirements || []).forEach(ir => {
      const k = `${station.id}_${ir.item.id}`;
      const needed = ir.count || 1;
      if ((APP.progress.hideoutCounts[k] || 0) < needed) {
        APP.progress.hideoutCounts[k] = needed;
        APP.progress.hideout.add(k);
        changed = true;
      }
    });
  });
  return changed;
}

function adjustHideoutCount(key, delta, max) {
  if (!APP.progress.hideoutCounts) APP.progress.hideoutCounts = {};
  const current = APP.progress.hideoutCounts[key] || 0;
  const next = Math.max(0, Math.min(max, current + delta));
  APP.progress.hideoutCounts[key] = next;
  // Also update legacy hideout Set for compatibility
  if (next >= max) APP.progress.hideout.add(key);
  else APP.progress.hideout.delete(key);

  // Cascade: if this item just became complete, check if its whole level is now done
  if (next >= max && activeStation) {
    const station = hideoutData.find(s => s.id === activeStation);
    if (station) {
      station.levels.forEach(level => {
        const items = level.itemRequirements || [];
        if (!items.some(ir => `${station.id}_${ir.item.id}` === key)) return;
        const allComplete = items.every(ir => {
          const k = `${station.id}_${ir.item.id}`;
          return (APP.progress.hideoutCounts[k] || 0) >= (ir.count || 1);
        });
        if (allComplete) cascadeHideoutLevels(station, level.level);
      });
    }
  }

  APP.saveProgress();
  // Re-render the current station
  if (activeStation) {
    const station = hideoutData.find(s => s.id === activeStation);
    if (station) { buildStationList(); renderStation(station); }
  }
  updateHideoutCount();
}
