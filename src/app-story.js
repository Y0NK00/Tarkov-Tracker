// ── STORY MODULE (Chapter-list + Detail panel) ────────────────────────────────

// Currently selected path / ending
let activeEnding = 'savior';
// Currently selected quest ID in the left panel
let activeQuestId = null;

// Cache: item name (lowercase) → iconLink URL
const itemIconCache = {};

// Fetch item icons from tarkov.dev for a list of keyItems, then patch the DOM
async function loadKeyItemIcons(keyItems, gridEl) {
  // Only lookup items with a specific name (skip "Any …" generics)
  const lookups = keyItems.filter(it => it.name && !/^any\b/i.test(it.name));
  if (!lookups.length) return;

  // Items not yet cached
  const uncached = lookups.filter(it => !(it.name.toLowerCase() in itemIconCache));

  if (uncached.length) {
    // Build a batched GQL query using aliases
    const aliases = uncached.map((it, i) => {
      const safe = it.name.replace(/[^a-z0-9]/gi, ' ').trim().replace(/\s+/g, ' ');
      return `item${i}: items(name: ${JSON.stringify(safe)}, lang: en) { iconLink }`;
    }).join('\n');
    try {
      const result = await tarkovGQL(`{ ${aliases} }`);
      uncached.forEach((it, i) => {
        const rows = result.data[`item${i}`];
        itemIconCache[it.name.toLowerCase()] = (rows && rows[0]) ? rows[0].iconLink : null;
      });
    } catch (e) {
      console.warn('Story: item icon fetch failed', e);
    }
  }

  // Patch icons into already-rendered grid rows
  if (!gridEl) return;
  gridEl.querySelectorAll('.sdv-item-row[data-item-name]').forEach(row => {
    const key = row.dataset.itemName.toLowerCase();
    const url = itemIconCache[key];
    if (url && !row.querySelector('.sdv-item-img')) {
      const img = document.createElement('img');
      img.src = url;
      img.className = 'sdv-item-img';
      img.alt = '';
      img.loading = 'lazy';
      row.prepend(img);
    }
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function storySetup() {
  activeEnding = APP.progress.lastEnding || 'savior';

  renderPathSelector();
  renderQuestList();
  updateStoryCount();

  // Search box live filter
  const searchEl = document.getElementById('story-search');
  if (searchEl) {
    searchEl.addEventListener('input', () => renderQuestList(searchEl.value.trim().toLowerCase()));
  }
}

// ── Path selector (compact ending tabs above quest list) ──────────────────────

function renderPathSelector() {
  const row = document.getElementById('story-path-row');
  if (!row) return;
  row.innerHTML = '';

  STORY_DATA.endings.forEach(e => {
    const btn = document.createElement('button');
    btn.className = 'story-path-btn' + (activeEnding === e.id ? ' active' : '');
    btn.textContent = e.icon + ' ' + e.name;
    btn.style.setProperty('--pc', e.color);
    if (activeEnding === e.id) btn.style.borderColor = e.color;
    btn.addEventListener('click', () => {
      activeEnding = e.id;
      APP.progress.lastEnding = e.id;
      APP.saveProgress();
      renderPathSelector();
      renderQuestList();
      updateStoryCount();
      if (typeof updateDashboardStory === 'function') updateDashboardStory();
    });
    row.appendChild(btn);
  });
}

// ── Quest list (left panel) ───────────────────────────────────────────────────

function buildQuestList() {
  return STORY_DATA.shared.map(q => ({ ...q, _section: 'Story Chapters' }));
}

function renderQuestList(filter = '') {
  const listEl = document.getElementById('story-quest-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const all = buildQuestList();
  const filtered = filter
    ? all.filter(q => q.name.toLowerCase().includes(filter) || (q.description || '').toLowerCase().includes(filter))
    : all;

  if (!filtered.length) {
    listEl.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--text3);text-align:center;">No chapters match.</div>';
    return;
  }

  let lastSection = null;
  let chapterNum = 0;

  filtered.forEach(q => {
    // Section divider
    if (q._section !== lastSection) {
      lastSection = q._section;
      const div = document.createElement('div');
      div.className = 'sq-section';
      div.textContent = q._section;
      // Colour the path section heading with the ending colour
      if (!q._section.includes('Shared') && activeEnding) {
        const ending = STORY_DATA.endings.find(e => e.id === activeEnding);
        if (ending) div.style.color = ending.color;
      }
      listEl.appendChild(div);
    }

    chapterNum++;
    const done = APP.progress.story.has(q.id);

    const item = document.createElement('div');
    item.className = 'sq-item' + (done ? ' done' : '') + (q.id === activeQuestId ? ' active' : '');
    item.dataset.qid = q.id;

    item.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
        <div style="display:flex;align-items:flex-start;gap:8px;flex:1;min-width:0;">
          ${q.iconUrl ? `<img src="${q.iconUrl}" class="sq-icon" alt="" loading="lazy">` : ''}
          <div style="flex:1;min-width:0;">
            <div class="sq-num">CHAPTER ${chapterNum}</div>
            <div class="sq-name">${q.name}</div>
            <div class="sq-meta">
              <span>${q.trader || ''}</span>
              ${q.map ? `<span class="sq-meta-sep">•</span><span>${q.map}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="sq-done-check" title="${done ? 'Mark incomplete' : 'Mark complete'}">${done ? '✓' : ''}</div>
      </div>
    `;

    // Click on the check icon to toggle done
    item.querySelector('.sq-done-check').addEventListener('click', e => {
      e.stopPropagation();
      toggleStoryStep(q.id);
    });

    // Click anywhere else to open detail
    item.addEventListener('click', () => {
      activeQuestId = q.id;
      // Update active state in list
      listEl.querySelectorAll('.sq-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      renderQuestDetail(q, chapterNum);
    });

    listEl.appendChild(item);
  });
}

// ── Quest detail (right panel) ────────────────────────────────────────────────

function renderQuestDetail(q, chapterNum) {
  const emptyEl  = document.getElementById('sdp-empty');
  const detailEl = document.getElementById('story-quest-detail');
  if (!emptyEl || !detailEl) return;

  emptyEl.style.display  = 'none';
  detailEl.style.display = 'block';
  detailEl.innerHTML     = '';

  if (!APP.progress.storyStepChecks) APP.progress.storyStepChecks = {};

  const done   = APP.progress.story.has(q.id);
  const ending = STORY_DATA.endings.find(e => e.id === activeEnding);
  const color  = q.type === 'shared' ? 'var(--blue)' : (ending ? ending.color : 'var(--gold)');

  // Required vs optional steps
  const required = (q.steps || []).filter(s => !s.optional);
  const optional = (q.steps || []).filter(s => s.optional);

  // Key items from wiki data
  const relatedItems = q.keyItems || [];

  const wrap = document.createElement('div');
  wrap.className = 'sdv-wrap';

  // ── Header ──
  const badge = document.createElement('div');
  badge.className = 'sdv-badge';
  badge.textContent = `Chapter ${chapterNum}`;
  wrap.appendChild(badge);

  const titleEl = document.createElement('div');
  titleEl.className = 'sdv-title';
  titleEl.textContent = q.name;
  titleEl.style.borderLeft = `3px solid ${color}`;
  titleEl.style.paddingLeft = '10px';
  wrap.appendChild(titleEl);

  // Meta line: Trader • Map • Level
  const metaEl = document.createElement('div');
  metaEl.className = 'sdv-meta';
  const parts = [q.trader, q.map, q.levelReq != null ? `Level ${q.levelReq}` : null].filter(Boolean);
  metaEl.innerHTML = parts.map((p, i) =>
    i < parts.length - 1 ? `<span>${p}</span><span class="sdv-meta-sep">•</span>` : `<span>${p}</span>`
  ).join('');
  wrap.appendChild(metaEl);

  // Description
  if (q.description) {
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:13px;color:var(--text3);line-height:1.6;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border);';
    desc.textContent = q.description;
    wrap.appendChild(desc);
  }

  // ── Main objectives ──
  const mainTitle = document.createElement('div');
  mainTitle.className = 'sdv-section-title';
  mainTitle.textContent = 'Main objectives';
  wrap.appendChild(mainTitle);

  if (required.length) {
    const ul = document.createElement('ul');
    ul.className = 'sdv-obj-list';
    required.forEach((step, i) => {
      const key     = q.id + ':req:' + i;
      const checked = !!APP.progress.storyStepChecks[key];
      ul.appendChild(makeObjItem(step, key, q, false, checked, color));
    });
    wrap.appendChild(ul);
  } else {
    const empty = document.createElement('div');
    empty.className = 'sdv-empty-section';
    empty.textContent = 'No main objectives detected in current feed.';
    wrap.appendChild(empty);
  }

  // ── Optional objectives ──
  const optTitle = document.createElement('div');
  optTitle.className = 'sdv-section-title';
  optTitle.style.marginTop = '20px';
  optTitle.textContent = 'Optional objectives';
  wrap.appendChild(optTitle);

  if (optional.length) {
    const ul = document.createElement('ul');
    ul.className = 'sdv-obj-list';
    optional.forEach((step, i) => {
      const key     = q.id + ':opt:' + i;
      const checked = !!APP.progress.storyStepChecks[key];
      ul.appendChild(makeObjItem(step, key, q, true, checked, color));
    });
    wrap.appendChild(ul);
  } else {
    const empty = document.createElement('div');
    empty.className = 'sdv-empty-section';
    empty.textContent = 'No optional objectives detected in current feed.';
    wrap.appendChild(empty);
  }

  // ── Key items ──
  if (relatedItems.length) {
    const itemsTitle = document.createElement('div');
    itemsTitle.className = 'sdv-section-title';
    itemsTitle.style.marginTop = '20px';
    itemsTitle.textContent = 'Key items';
    wrap.appendChild(itemsTitle);

    const grid = document.createElement('div');
    grid.className = 'sdv-items-grid';
    relatedItems.forEach(item => {
      const tags = [];
      if (item.fir)      tags.push('<span class="sdv-item-tag fir">FIR</span>');
      if (item.handover) tags.push('<span class="sdv-item-tag hand">Hand Over</span>');

      const row = document.createElement('div');
      row.className = 'sdv-item-row';
      row.dataset.itemName = item.name;
      row.innerHTML = `
        <div class="sdv-item-info">
          <div class="sdv-item-name">${item.name}${item.amount != null ? ` <span class="sdv-item-amt">×${item.amount}</span>` : ''}</div>
          <div class="sdv-item-tags">${tags.join('')}${item.note ? `<span class="sdv-item-note">${item.note}</span>` : ''}</div>
        </div>
      `;
      grid.appendChild(row);
    });
    wrap.appendChild(grid);

    // Async: fetch icons from tarkov.dev and patch them in
    loadKeyItemIcons(relatedItems, grid);
  }

  // ── Wiki link ──
  if (q.wikiLink) {
    const wikiWrap = document.createElement('div');
    wikiWrap.style.marginTop = '16px';
    const wikiLink = document.createElement('a');
    wikiLink.href = q.wikiLink;
    wikiLink.target = '_blank';
    wikiLink.style.cssText = 'font-family:\'Share Tech Mono\',monospace;font-size:10px;letter-spacing:1.5px;color:var(--gold);text-decoration:none;border:1px solid rgba(200,168,75,.3);padding:4px 10px;display:inline-block;transition:all .12s;';
    wikiLink.textContent = 'OPEN WIKI ↗';
    wikiLink.addEventListener('mouseover', () => { wikiLink.style.background = 'rgba(200,168,75,.1)'; });
    wikiLink.addEventListener('mouseout',  () => { wikiLink.style.background = 'none'; });
    wikiLink.addEventListener('click', e => {
      if (window.electronAPI) { e.preventDefault(); window.electronAPI.openExternal(q.wikiLink); }
    });
    wikiWrap.appendChild(wikiLink);
    wrap.appendChild(wikiWrap);
  }

  // ── Mark complete button ──
  const doneBtn = document.createElement('button');
  doneBtn.className = 'sdv-done-btn' + (done ? ' undo' : '');
  doneBtn.textContent = done ? '↩ Mark Quest Incomplete' : '✓ Mark Quest Complete';
  doneBtn.style.marginTop = '24px';
  doneBtn.addEventListener('click', () => {
    toggleStoryStep(q.id);
    // Re-render both panels
    const currentNum = parseInt(wrap.querySelector('.sdv-badge').textContent.replace('Chapter ', ''), 10) || chapterNum;
    renderQuestDetail(q, currentNum);
    // Refresh list item done state without full re-render
    const listEl = document.getElementById('story-quest-list');
    if (listEl) {
      const itm = listEl.querySelector(`[data-qid="${q.id}"]`);
      if (itm) {
        const isDone = APP.progress.story.has(q.id);
        itm.classList.toggle('done', isDone);
        const chk = itm.querySelector('.sq-done-check');
        if (chk) chk.textContent = isDone ? '✓' : '';
      }
    }
  });
  wrap.appendChild(doneBtn);

  detailEl.appendChild(wrap);
}

// Build a single objective list item with a checkable box
function makeObjItem(step, key, quest, isOpt, checked, color) {
  const li = document.createElement('li');
  li.className = (isOpt ? 'opt' : '') + (checked ? ' checked' : '');

  const box = document.createElement('div');
  box.className = 'sdv-step-check' + (checked ? ' chk' : '');
  box.textContent = checked ? '✓' : '';
  box.title = checked ? 'Uncheck' : 'Check';
  box.addEventListener('click', e => {
    e.stopPropagation();
    APP.progress.storyStepChecks[key] = !APP.progress.storyStepChecks[key];
    APP.saveProgress();
    box.classList.toggle('chk', APP.progress.storyStepChecks[key]);
    box.textContent = APP.progress.storyStepChecks[key] ? '✓' : '';
    li.classList.toggle('checked', APP.progress.storyStepChecks[key]);
    const txt = li.querySelector('.sdv-step-txt');
    if (txt) txt.style.textDecoration = APP.progress.storyStepChecks[key] ? 'line-through' : '';
  });

  const txt = document.createElement('span');
  txt.className = 'sdv-step-txt';
  txt.textContent = step.text;
  if (checked) txt.style.textDecoration = 'line-through';

  li.appendChild(box);
  li.appendChild(txt);
  return li;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function toggleStoryStep(id) {
  if (APP.progress.story.has(id)) APP.progress.story.delete(id);
  else APP.progress.story.add(id);
  APP.saveProgress();
  updateStoryCount();
  if (typeof updateDashboardStory === 'function') updateDashboardStory();
}

function updateStoryCount() {
  const all  = STORY_DATA.shared;
  const done = all.filter(q => APP.progress.story.has(q.id)).length;
  const el   = document.getElementById('tc-story');
  if (el) el.textContent = `${done}/${all.length}`;
}

// Called from dashboard to show story progress summary
function updateDashboardStory() {
  const all  = STORY_DATA.shared;
  const done = all.filter(q => APP.progress.story.has(q.id)).length;
  const pct  = all.length > 0 ? Math.round(done / all.length * 100) : 0;
  const el   = document.getElementById('s-story-pct');
  if (el) el.textContent = pct + '%';
}

// Re-render (called on tab switch)
function storyRender() {
  renderPathSelector();
  renderQuestList();
  updateStoryCount();
}
