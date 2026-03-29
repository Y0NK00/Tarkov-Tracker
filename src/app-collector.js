// ── COLLECTOR MODULE ─────────────────────────────────────────────────────
// Fetches real Collector quest items from tarkov.dev API
// Uses task(normalizedName) to get only the Collector task efficiently

const COLLECTOR_GQL = `{
  tasks {
    id
    name
    objectives {
      ... on TaskObjectiveItem {
        id
        item {
          id
          name
          shortName
          iconLink
          wikiLink
        }
        count
        foundInRaid
      }
    }
  }
}`;

let collectorItems = [];
let collectorLoaded = false;

async function collectorInit() {
  const grid = document.getElementById('collector-grid');
  try {
    const j = await tarkovGQL(COLLECTOR_GQL);
    const tasks = j.data.tasks;
    // Find the Collector quest by name
    const task = tasks.find(t => t.name === 'Collector');
    if (!task) throw new Error('Collector quest not found in task list');

    collectorItems = task.objectives
      .filter(o => o.item)
      .map(o => ({
        id: o.id,
        name: o.item.name,
        shortName: o.item.shortName,
        iconLink: o.item.iconLink,
        wikiLink: o.item.wikiLink,
        count: o.count || 1,
        foundInRaid: o.foundInRaid
      }));

    collectorLoaded = true;
    collectorRender();
  } catch(e) {
    console.error('Collector error:', e);
    if (grid) grid.innerHTML = `<div class="state-box"><div class="state-icon">⚠</div><div class="state-title">Failed to Load</div><div class="state-sub">${e.message}</div></div>`;
  }
}

function collectorRender() {
  const grid = document.getElementById('collector-grid');
  if (!grid) return;

  const total = collectorItems.length || 0;
  const foundCount = collectorItems.filter(i => APP.progress.collector.has(i.id)).length;
  const pct = total > 0 ? Math.round((foundCount / total) * 100) : 0;

  const colText = document.getElementById('col-text');
  const colFill = document.getElementById('col-fill');
  const tcCol = document.getElementById('tc-col');
  const hCol = document.getElementById('h-col');
  if (colText) colText.textContent = `${foundCount} / ${total} streamer items found`;
  if (colFill) colFill.style.width = `${pct}%`;
  if (tcCol) tcCol.textContent = `${foundCount}/${total}`;
  if (hCol) hCol.textContent = `${foundCount}/${total}`;

  if (!collectorLoaded) {
    grid.innerHTML = '<div class="state-box"><div class="spinner"></div><div class="state-title">Loading Items</div></div>';
    return;
  }

  grid.innerHTML = '';
  const sorted = [...collectorItems].sort((a, b) => {
    const af = APP.progress.collector.has(a.id);
    const bf = APP.progress.collector.has(b.id);
    return af === bf ? a.name.localeCompare(b.name) : af ? 1 : -1;
  });

  sorted.forEach(item => {
    const isFound = APP.progress.collector.has(item.id);
    const card = document.createElement('div');
    card.className = 'col-card' + (isFound ? ' found' : '');
    card.innerHTML = `
      <div class="col-found-badge">✓</div>
      <div class="col-item-img">
        <img src="${item.iconLink || ''}" alt="${item.name}"
          onerror="this.style.display='none'"
          style="width:100%;height:100%;object-fit:contain;display:block;"/>
      </div>
      <div class="col-name">${item.name}</div>
      <div class="col-hint">${item.foundInRaid ? '⚠ FIR' : 'Any'} · ×${item.count}</div>
      ${item.wikiLink ? `<a class="col-wiki" href="${item.wikiLink}" target="_blank" onclick="event.stopPropagation()">Wiki ↗</a>` : ''}
    `;
    card.addEventListener('click', () => {
      if (APP.progress.collector.has(item.id)) APP.progress.collector.delete(item.id);
      else APP.progress.collector.add(item.id);
      APP.saveProgress();
      collectorRender();
      if (typeof updateDashboardStats === 'function') updateDashboardStats();
    });
    grid.appendChild(card);
  });
}

function collectorSetup() {
  const wipeBtn = document.getElementById('col-wipe');
  if (wipeBtn) {
    wipeBtn.addEventListener('click', () => {
      showWipeModal('Reset all Collector item progress?', () => {
        APP.progress.collector.clear();
        APP.saveProgress();
        collectorRender();
        showToast('Collector progress reset');
      });
    });
  }
  collectorInit();
}
