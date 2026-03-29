// ── MAPS MODULE ───────────────────────────────────────────────────────────
// Fetches map list from tarkov.dev API, links to tarkov.dev interactive maps

const MAPS_GQL = `{
  maps {
    id
    name
    normalizedName
    players
    raidDuration
    wiki
  }
}`;

let mapsData = [];

async function mapsSetup() {
  const grid = document.getElementById('maps-grid');
  if (!grid) return;

  // Try loading from API first
  try {
    if (!mapsData.length) {
      const j = await tarkovGQL(MAPS_GQL);
      if (j && j.data && j.data.maps) {
        mapsData = j.data.maps.filter(m => m.name && m.normalizedName !== 'sandbox' && m.normalizedName !== 'sandbox-high');
      }
    }
  } catch(e) {
    console.warn('Maps API error:', e.message);
  }

  // Fallback static list if API fails
  if (!mapsData.length) {
    mapsData = [
      { name: 'Customs',         normalizedName: 'customs',           players: '8-12',  raidDuration: 35, svg: null },
      { name: 'Woods',            normalizedName: 'woods',             players: '8-14',  raidDuration: 40, svg: null },
      { name: 'Factory',          normalizedName: 'factory-day',       players: '4-6',   raidDuration: 25, svg: null },
      { name: 'Shoreline',        normalizedName: 'shoreline',         players: '8-12',  raidDuration: 45, svg: null },
      { name: 'Interchange',      normalizedName: 'interchange',       players: '10-14', raidDuration: 45, svg: null },
      { name: 'Reserve',          normalizedName: 'reserve',           players: '9-12',  raidDuration: 35, svg: null },
      { name: 'Lighthouse',       normalizedName: 'lighthouse',        players: '8-14',  raidDuration: 40, svg: null },
      { name: 'Streets of Tarkov',normalizedName: 'streets-of-tarkov', players: '10-20', raidDuration: 50, svg: null },
      { name: 'Ground Zero',      normalizedName: 'ground-zero',       players: '6-10',  raidDuration: 35, svg: null },
      { name: 'The Lab',          normalizedName: 'the-lab',           players: '6-10',  raidDuration: 35, svg: null },
    ];
  }

  renderMapGrid();
}

function renderMapGrid() {
  const grid = document.getElementById('maps-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const mapIcons = {
    'customs': '🏭', 'woods': '🌲', 'factory-day': '⚙️', 'shoreline': '🏖️',
    'interchange': '🏬', 'reserve': '🏰', 'lighthouse': '🔦',
    'streets-of-tarkov': '🏙️', 'ground-zero': '🔰', 'the-lab': '🧪'
  };

  // Count available quests per map
  const questCounts = {};
  if (typeof allQuests !== 'undefined') {
    allQuests.forEach(q => {
      if (APP.progress.quests.has(q.id)) return;
      (q.objectives||[]).forEach(o => {
        (o.maps||[]).forEach(m => {
          const n = m.normalizedName;
          if (n) questCounts[n] = (questCounts[n]||0) + 1;
        });
      });
    });
  }

  mapsData.forEach(map => {
    const nn = map.normalizedName;
    const icon = mapIcons[nn] || '🗺️';
    const qCount = questCounts[nn] || 0;
    const hasSvg = map.svgLink;

    const thumb = document.createElement('div');
    thumb.className = 'map-thumb';
    thumb.innerHTML = `
      <div style="font-size:28px;margin-bottom:8px;">${icon}</div>
      <div class="map-name">${map.name}</div>
      <div class="map-size">${map.players || ''} players · ${map.raidDuration || '?'} min</div>
      ${qCount > 0 ? `<div class="map-soon" style="color:var(--green);">${qCount} quest${qCount>1?'s':''} available</div>` : ''}
      <div class="map-soon" style="color:var(--blue);">Open in browser →</div>
    `;

    thumb.addEventListener('click', () => {
      const url = `https://tarkov.dev/map/${nn}`;
      if (window.electronAPI && window.electronAPI.openExternal) {
        window.electronAPI.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    });
    grid.appendChild(thumb);
  });
}

function openMapView(map) {
  const panel = document.getElementById('panel-maps');
  const main = panel.querySelector('.main-area');

  main.innerHTML = `
    <div style="background:var(--surface);border-bottom:1px solid var(--border);padding:10px 18px;display:flex;align-items:center;gap:12px;flex-shrink:0;">
      <button class="btn-sm" onclick="closeMapsView()">← Back</button>
      <div style="font-family:'Rajdhani',sans-serif;font-size:18px;font-weight:700;color:var(--gold);letter-spacing:2px;">${map.name.toUpperCase()}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--text3);">${map.players || ''} players · ${map.raidDuration || ''} min raids</div>
      ${map.wiki ? `<a href="${map.wiki}" target="_blank" class="wiki-btn" style="margin-left:auto;">WIKI ↗</a>` : ''}
    </div>
    <div style="flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:16px;">
      <div id="map-svg-container" style="max-width:100%;background:var(--surface2);border:1px solid var(--border);padding:12px;">
        <div class="state-box"><div class="spinner"></div><div class="state-title">Loading Map</div></div>
      </div>
    </div>
  `;

  // Fetch SVG
  const svgUrl = map.svgLink;
  if (!svgUrl) return;

  fetch(svgUrl)
    .then(r => { if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`); return r.text(); })
    .then(svg => {
      const container = document.getElementById('map-svg-container');
      if (!container) return;
      container.innerHTML = svg;
      const svgEl = container.querySelector('svg');
      if (svgEl) {
        svgEl.style.maxWidth = '100%';
        svgEl.style.height = 'auto';
        svgEl.style.display = 'block';
      }
    })
    .catch(err => {
      const container = document.getElementById('map-svg-container');
      if (container) container.innerHTML = `<div class="state-box"><div class="state-icon">⚠</div><div class="state-title">${err.message}</div><div class="state-sub">Try opening this map on tarkov.dev instead.</div></div>`;
    });
}

function closeMapsView() {
  const panel = document.getElementById('panel-maps');
  panel.querySelector('.main-area').innerHTML = `
    <div class="maps-coming">
      <div style="font-family:'Rajdhani',sans-serif;font-size:20px;font-weight:700;letter-spacing:3px;color:var(--gold);">SELECT MAP</div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:16px;">Interactive maps powered by tarkov.dev API</div>
      <div class="maps-grid" id="maps-grid"></div>
    </div>
  `;
  renderMapGrid();
}
