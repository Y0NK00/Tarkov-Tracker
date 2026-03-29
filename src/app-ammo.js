// ── AMMO MODULE ──────────────────────────────────────────────────────────

const AMMO_GQL = `{
  ammo(gameMode: regular) {
    item { id name shortName }
    caliber
    damage
    penetrationPower
    armorDamage
    fragmentationChance
    tracer
  }
}`;

// Maps raw caliber IDs → weapon category
const CALIBER_CATEGORY = {
  'Caliber9x18PM':     'pistol',
  'Caliber9x19PARA':   'smg',
  'Caliber9x21':       'smg',
  'Caliber9x33R':      'pistol',
  'Caliber1143x23ACP': 'smg',
  'Caliber57x28':      'smg',
  'Caliber762x25TT':   'pistol',
  'Caliber46x30':      'smg',
  'Caliber545x39':     'ar',
  'Caliber556x45NATO': 'ar',
  'Caliber762x39':     'ar',
  'Caliber762x35':     'ar',
  'Caliber762x51':     'dmr',
  'Caliber762x54R':    'dmr',
  'Caliber86x70':      'sniper',
  'Caliber9x39':       'special',
  'Caliber127x55':     'special',
  'Caliber366TKM':     'special',
  'Caliber12g':        'shotgun',
  'Caliber12x70':      'shotgun',
  'Caliber20g':        'shotgun',
  'Caliber20x70':      'shotgun',
  'Caliber23x75':      'shotgun',
  'Caliber40x46':      'grenade',
  'Caliber40mmRU':     'grenade',
  'Caliber26x75':      'grenade',
  'Caliber30x29':      'grenade',
};

const CATEGORY_META = [
  { id: 'pistol',  label: 'Pistols & Revolvers',  icon: '🔫' },
  { id: 'smg',     label: 'SMGs',                  icon: '💨' },
  { id: 'ar',      label: 'Assault Rifles',         icon: '⚡' },
  { id: 'dmr',     label: 'Battle Rifles & DMRs',   icon: '🎯' },
  { id: 'sniper',  label: 'Sniper Rifles',          icon: '👁️' },
  { id: 'special', label: 'Special / Subsonic',     icon: '🔕' },
  { id: 'shotgun', label: 'Shotguns',               icon: '💥' },
  { id: 'grenade', label: 'Grenades & Launchers',   icon: '💣' },
  { id: 'other',   label: 'Other',                  icon: '❓' },
];

let ammoData = [];
let ammoSort = { col: 'damage', dir: -1 };
let ammoSearch = '';

async function ammoInit() {
  try {
    const j = await tarkovGQL(AMMO_GQL);
    ammoData = j.data.ammo || [];
    ammoRender();
  } catch(e) {
    console.error('Ammo error:', e);
    const wrap = document.getElementById('ammo-wrap');
    if (wrap) wrap.innerHTML =
      `<div class="state-box"><div class="state-icon">⚠</div><div class="state-title">Failed to Load Ammo</div><div class="state-sub">${e.message}</div></div>`;
  }
}

function penColor(pen) {
  if (pen >= 60) return '#e05252';
  if (pen >= 50) return '#e07050';
  if (pen >= 40) return '#d4af37';
  if (pen >= 30) return '#8fbc8f';
  if (pen >= 20) return '#4a90d9';
  return '#4a5568';
}

// Clean up raw API caliber names to human-readable format
function formatCaliber(raw) {
  if (!raw) return '—';
  const map = {
    'Caliber9x18PM': '9x18mm PM',     'Caliber9x19PARA': '9x19mm Para',
    'Caliber9x21': '9x21mm',          'Caliber9x33R': '.357 Magnum',
    'Caliber1143x23ACP': '.45 ACP',   'Caliber40x46': '40x46mm',
    'Caliber545x39': '5.45x39mm',     'Caliber556x45NATO': '5.56x45mm',
    'Caliber762x25TT': '7.62x25mm TT','Caliber762x35': '.300 Blackout',
    'Caliber762x39': '7.62x39mm',     'Caliber762x51': '7.62x51mm NATO',
    'Caliber762x54R': '7.62x54mmR',   'Caliber86x70': '.338 Lapua',
    'Caliber9x39': '9x39mm',          'Caliber46x30': '4.6x30mm HK',
    'Caliber57x28': '5.7x28mm FN',    'Caliber127x55': '12.7x55mm',
    'Caliber20g': '20 Gauge',         'Caliber12g': '12 Gauge',
    'Caliber23x75': '23x75mm',        'Caliber366TKM': '.366 TKM',
    'Caliber40mmRU': '40mm RU',       'Caliber26x75': '26x75mm',
    'Caliber30x29': '30x29mm',        'Caliber12x70': '12 Gauge',
    'Caliber20x70': '20 Gauge',       'CaliberShotgun': 'Shotgun'
  };
  return map[raw] || raw.replace('Caliber','').replace(/(\d+)x(\d+)/,'$1x$2mm');
}

// Armor class effectiveness rating (0–6)
function acRating(pen, armorClass) {
  const thresholds = [20, 30, 40, 50, 60, 70];
  const needed = thresholds[armorClass - 1] || 20;
  if (pen >= needed * 1.3) return 6;
  if (pen >= needed * 1.1) return 5;
  if (pen >= needed * 0.9) return 4;
  if (pen >= needed * 0.7) return 3;
  if (pen >= needed * 0.5) return 2;
  if (pen >= needed * 0.3) return 1;
  return 0;
}

function acColor(rating) {
  const colors = ['#444','#8b0000','#cc4400','#bb8800','#6b9900','#3a9900','#00aa44'];
  return colors[rating] || '#444';
}

function sortAmmoData(data) {
  data.sort((a, b) => {
    let av = a[ammoSort.col], bv = b[ammoSort.col];
    if (ammoSort.col === 'name')    { av = a.item.name;  bv = b.item.name; }
    if (ammoSort.col === 'caliber') { av = a.caliber||''; bv = b.caliber||''; }
    if (typeof av === 'string') return ammoSort.dir * av.localeCompare(bv);
    return ammoSort.dir * ((av||0) - (bv||0));
  });
}

function buildAmmoRow(a) {
  const pen = a.penetrationPower || 0;
  const color = penColor(pen);
  const acHtml = [1,2,3,4,5,6].map(cls => {
    const rating = acRating(pen, cls);
    const c = acColor(rating);
    return `<div class="ac-pip" style="background:${c};color:#fff;font-weight:700;min-width:22px;text-align:center;padding:2px 4px;font-size:11px;border-radius:2px;" title="AC${cls}">${rating}</div>`;
  }).join('');
  const penPct = Math.min(100, (pen / 70) * 100);
  const tracerDot = a.tracer ? ' <span style="font-size:9px;color:#d4af37;font-family:\'Share Tech Mono\',monospace;">TRACER</span>' : '';

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><div class="ammo-name">${a.item.shortName||a.item.name}${tracerDot}</div></td>
    <td><div class="ammo-caliber">${formatCaliber(a.caliber)||'—'}</div></td>
    <td style="color:var(--text);font-family:'Share Tech Mono',monospace;font-size:13px;">${a.damage||'—'}</td>
    <td>
      <div class="pen-bar-wrap">
        <div class="pen-bar" style="width:${penPct}px;background:${color};opacity:.8;"></div>
        <div class="pen-val" style="color:${color}">${pen||'—'}</div>
      </div>
    </td>
    <td style="font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--text2);">${a.armorDamage!=null?Math.round(a.armorDamage)+'%':'—'}</td>
    <td style="font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--text2);">${a.fragmentationChance!=null?Math.round(a.fragmentationChance*100)+'%':'—'}</td>
    <td style="font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--text3);">—</td>
    <td><div class="ac-cell">${acHtml}</div></td>
  `;
  return tr;
}

function buildCategoryTable(items) {
  const tableWrap = document.createElement('div');
  tableWrap.className = 'ammo-table-inner';

  const table = document.createElement('table');
  table.className = 'ammo-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th data-col="name">Name</th>
      <th>Caliber</th>
      <th data-col="damage">Damage</th>
      <th data-col="penetrationPower">Penetration</th>
      <th data-col="armorDamage">Armor Dmg</th>
      <th data-col="fragmentationChance">Frag %</th>
      <th></th>
      <th>vs AC 1–6</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  items.forEach(a => tbody.appendChild(buildAmmoRow(a)));
  table.appendChild(tbody);
  tableWrap.appendChild(table);

  // Sort on column header click
  thead.querySelectorAll('th[data-col]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (ammoSort.col === col) ammoSort.dir *= -1;
      else { ammoSort.col = col; ammoSort.dir = -1; }
      ammoRender();
    });
  });

  return tableWrap;
}

function ammoRender() {
  const wrap = document.getElementById('ammo-wrap');
  if (!wrap) return;

  let data = [...ammoData];

  if (ammoSearch) {
    const s = ammoSearch.toLowerCase();
    data = data.filter(a =>
      (a.item.name||'').toLowerCase().includes(s) ||
      (a.item.shortName||'').toLowerCase().includes(s)
    );
  }

  sortAmmoData(data);

  if (data.length === 0) {
    wrap.innerHTML = `<div class="state-box"><div class="state-icon">⊘</div><div class="state-title">No results</div></div>`;
    return;
  }

  // Group by weapon category
  const byCategory = {};
  data.forEach(a => {
    const catId = CALIBER_CATEGORY[a.caliber] || 'other';
    (byCategory[catId] = byCategory[catId] || []).push(a);
  });

  wrap.innerHTML = '';

  CATEGORY_META.forEach(cat => {
    const items = byCategory[cat.id];
    if (!items || items.length === 0) return;

    const bestPen = Math.max(...items.map(a => a.penetrationPower || 0));
    const penCol = penColor(bestPen);

    const section = document.createElement('details');
    section.className = 'ammo-category';
    section.open = true;

    const summary = document.createElement('summary');
    summary.className = 'ammo-cat-header';
    summary.innerHTML = `
      <span class="ammo-cat-icon">${cat.icon}</span>
      <span class="ammo-cat-label">${cat.label}</span>
      <span class="ammo-cat-count">${items.length} round${items.length !== 1 ? 's' : ''}</span>
      <span class="ammo-cat-pen" style="color:${penCol}">Best pen: <strong>${bestPen}</strong></span>
      <span class="ammo-cat-chevron">▾</span>
    `;
    section.appendChild(summary);
    section.appendChild(buildCategoryTable(items));
    wrap.appendChild(section);
  });
}

function ammoSetup() {
  const searchEl = document.getElementById('ammo-search');
  if (searchEl) searchEl.addEventListener('input', e => { ammoSearch = e.target.value; ammoRender(); });
  ammoInit();
}
