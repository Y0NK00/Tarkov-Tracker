// ── ITEMS TO KEEP MODULE ─────────────────────────────────────────────────
// Shows all items needed for incomplete quests with +/- count tracking

const ITEMS_GQL = `{
  tasks {
    id name kappaRequired
    trader { name }
    objectives {
      ... on TaskObjectiveItem {
        id description
        item { id name shortName iconLink wikiLink }
        count
        foundInRaid
      }
    }
  }
}`;

let itemsData = [];
let itemsLoaded = false;
let itemsFilter = 'fir';

async function itemsInit() {
  try {
    const j = await tarkovGQL(ITEMS_GQL);
    itemsData = j.data.tasks;
    itemsLoaded = true;
    buildItemsToKeep();
  } catch(e) {
    console.error('Items load error:', e);
    const main = document.getElementById('items-main');
    if (main) main.innerHTML = `<div class="state-box"><div class="state-icon">⚠</div><div class="state-title">Failed to Load</div><div class="state-sub">${e.message}</div></div>`;
  }
}

function buildItemsToKeep() {
  if (!itemsLoaded) return;
  const main = document.getElementById('items-main');
  if (!main) return;

  if (!APP.progress.raidItemCounts) APP.progress.raidItemCounts = {};

  // Filter to incomplete quests only
  let tasks = itemsData.filter(t => !APP.progress.quests.has(t.id));
  if (itemsFilter === 'kappa') tasks = tasks.filter(t => t.kappaRequired);

  // Aggregate items
  const itemMap = {};
  tasks.forEach(task => {
    const trader = getTrader(task.trader.name);
    (task.objectives || []).forEach(obj => {
      if (!obj.item || !obj.count) return;
      if (itemsFilter === 'fir' && !obj.foundInRaid) return;

      const key = obj.item.id + (obj.foundInRaid ? '_fir' : '_any');
      if (!itemMap[key]) {
        itemMap[key] = {
          id: obj.item.id,
          key,
          name: obj.item.name,
          shortName: obj.item.shortName,
          iconLink: obj.item.iconLink,
          wikiLink: obj.item.wikiLink,
          totalCount: 0,
          foundInRaid: obj.foundInRaid,
          quests: []
        };
      }
      itemMap[key].totalCount += obj.count;
      itemMap[key].quests.push({ name: task.name, count: obj.count, traderColor: trader.color, traderName: trader.name });
    });
  });

  const items = Object.values(itemMap).sort((a, b) => {
    // Sort: incomplete first, then by totalCount desc
    const aDone = (APP.progress.raidItemCounts[a.key] || 0) >= a.totalCount;
    const bDone = (APP.progress.raidItemCounts[b.key] || 0) >= b.totalCount;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return b.totalCount - a.totalCount || a.name.localeCompare(b.name);
  });

  const firItems = items.filter(i => i.foundInRaid);
  const anyItems = items.filter(i => !i.foundInRaid);
  const totalItems = items.length;
  const doneItems = items.filter(i => (APP.progress.raidItemCounts[i.key] || 0) >= i.totalCount).length;

  // Build header
  let html = `
    <div style="background:var(--surface);border:1px solid var(--border);padding:12px 16px;margin-bottom:16px;border-left:3px solid var(--gold);">
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:8px;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:16px;font-weight:700;color:var(--gold);letter-spacing:1px;">ITEMS TO KEEP IN RAID</div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--text3);">${doneItems}/${totalItems} collected</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="sort-btn${itemsFilter==='fir'?' active':''}" onclick="setItemsFilter('fir')">Found in Raid Only</button>
        <button class="sort-btn${itemsFilter==='all'?' active':''}" onclick="setItemsFilter('all')">All Items</button>
        <button class="sort-btn${itemsFilter==='kappa'?' active':''}" onclick="setItemsFilter('kappa')">Kappa Quests Only</button>
      </div>
    </div>
  `;

  if (items.length === 0) {
    html += `<div class="state-box"><div class="state-icon">✓</div><div class="state-title">All Clear!</div><div class="state-sub">No items needed for your current filter and quest progress.</div></div>`;
    main.innerHTML = html;
    return;
  }

  main.innerHTML = html;

  // Render item rows using DOM (not innerHTML) for counter buttons
  function renderSection(sectionItems, label, labelColor) {
    if (sectionItems.length === 0) return;
    const hdr = document.createElement('div');
    hdr.className = 'raid-section-title';
    hdr.style.color = labelColor || '';
    hdr.textContent = label;
    main.appendChild(hdr);

    sectionItems.forEach(item => {
      main.appendChild(makeItemRow(item));
    });
  }

  if (firItems.length > 0) {
    renderSection(firItems, `Found in Raid Required — ${firItems.length} items`, 'var(--red)');
  }
  if (anyItems.length > 0 && itemsFilter === 'all') {
    renderSection(anyItems, `Any Condition — ${anyItems.length} items`, '');
  }
}

function makeItemRow(item) {
  const have = APP.progress.raidItemCounts[item.key] || 0;
  const need = item.totalCount;
  const done = have >= need;
  const pct = Math.min(100, Math.round((have / need) * 100));
  const questTip = item.quests.map(q => `${q.name} (×${q.count})`).join(', ');

  const row = document.createElement('div');
  row.className = 'item-row' + (done ? ' have' : '');
  row.title = questTip;

  row.innerHTML = `
    <div class="item-ico" style="width:46px;height:46px;background:var(--surface3);border:1px solid var(--border);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
      ${item.iconLink ? `<img src="${item.iconLink}" alt="${item.name}" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none'">` : '📦'}
    </div>
    <div class="item-info" style="flex:1;min-width:0;">
      <div class="item-name" style="font-size:13px;${done ? 'color:var(--text3);text-decoration:line-through;' : ''}">${item.name}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:${item.foundInRaid ? 'var(--red)' : 'var(--text3)'};">
        ×${need}${item.foundInRaid ? ' FIR' : ''} · ${item.quests.length} quest${item.quests.length > 1 ? 's' : ''}
      </div>
      <div style="font-size:10px;color:var(--text3);">
        ${item.quests.slice(0, 2).map(q => `<span style="color:${q.traderColor}">${q.traderName}</span>`).join(' · ')}
      </div>
      <div class="itk-bar-bg" style="margin-top:5px;">
        <div class="itk-bar-fill" style="width:${pct}%;background:${done ? 'var(--green)' : item.foundInRaid ? 'var(--red)' : 'var(--gold)'};"></div>
      </div>
    </div>
    <div class="itk-counter">
      <div class="itk-fraction" style="color:${done ? 'var(--green)' : 'var(--text)'}">
        ${have}<span style="color:var(--text3);font-size:12px;">/${need}</span>
      </div>
      <div class="itk-pct" style="color:${done ? 'var(--green)' : 'var(--text3)'}">${pct}%</div>
      <div class="itk-btns">
        <button class="itk-btn" data-key="${item.key}" data-delta="-1" data-max="${need}" ${have <= 0 ? 'disabled' : ''}>−</button>
        <button class="itk-btn itk-btn-plus" data-key="${item.key}" data-delta="1" data-max="${need}" ${done ? 'disabled' : ''}>+</button>
      </div>
      ${done ? '<div class="itk-done">✓ DONE</div>' : ''}
    </div>
    ${item.wikiLink ? `<a href="${item.wikiLink}" target="_blank" class="wiki-btn" onclick="event.stopPropagation()">WIKI</a>` : ''}
  `;

  // Counter buttons
  row.querySelectorAll('[data-key]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const key = btn.dataset.key;
      const delta = parseInt(btn.dataset.delta, 10);
      const max = parseInt(btn.dataset.max, 10);
      if (!APP.progress.raidItemCounts) APP.progress.raidItemCounts = {};
      const cur = APP.progress.raidItemCounts[key] || 0;
      APP.progress.raidItemCounts[key] = Math.max(0, Math.min(max, cur + delta));
      APP.saveProgress();
      buildItemsToKeep();
    });
  });

  return row;
}

function setItemsFilter(f) {
  itemsFilter = f;
  buildItemsToKeep();
}

// Legacy toggle kept for backward compat (no longer used in UI)
function toggleRaidItem(key) {
  if (APP.progress.raidItems.has(key)) APP.progress.raidItems.delete(key);
  else APP.progress.raidItems.add(key);
  APP.saveProgress();
  buildItemsToKeep();
}

function itemsSetup() {
  itemsInit();
}
