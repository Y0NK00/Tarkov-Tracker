// Trader definitions
// Images are fetched from tarkov.dev API at startup via loadTraderImages()
// Falls back to colored initials if images fail

const TRADERS = [
  { id: 'prapor',      name: 'Prapor',      color: '#c47a3a', fallback: 'PR', role: 'Weapons & Ammo',   desc: 'Warrant officer, supply warehouses' },
  { id: 'therapist',   name: 'Therapist',   color: '#4a90d9', fallback: 'TH', role: 'Medical & Intel',  desc: 'Head of Trauma Care Dept.' },
  { id: 'fence',       name: 'Fence',       color: '#778899', fallback: 'FN', role: 'Black Market',     desc: 'Anonymous fence' },
  { id: 'skier',       name: 'Skier',       color: '#7b68ee', fallback: 'SK', role: 'Smuggled Gear',    desc: 'Customs connections, gray market' },
  { id: 'peacekeeper', name: 'Peacekeeper', color: '#5aad7a', fallback: 'PK', role: 'Western Military', desc: 'UN supply officer, port zone' },
  { id: 'mechanic',    name: 'Mechanic',    color: '#e07050', fallback: 'MC', role: 'Weapons Tech',     desc: 'Electronics & weapon mods' },
  { id: 'ragman',      name: 'Ragman',      color: '#cc4444', fallback: 'RG', role: 'Gear & Clothing',  desc: 'Armor, rigs, backpacks' },
  { id: 'jaeger',      name: 'Jaeger',      color: '#8fbc8f', fallback: 'JG', role: 'Hunting & Nature', desc: 'Hunter, woods survivalist' },
  { id: 'lightkeeper', name: 'Lightkeeper', color: '#d4af37', fallback: 'LK', role: 'Mysterious',       desc: 'Enigmatic, Lighthouse' },
  { id: 'ref',         name: 'Ref',         color: '#aaaaaa', fallback: 'RF', role: 'Scav Rep',         desc: 'Scav karma & reputation' },
  { id: 'btr-driver',  name: 'BTR Driver',  color: '#bb9955', fallback: 'BTR',role: 'Vehicle Services', desc: 'Streets BTR operator' },
];

// imageLink map populated by loadTraderImages()
const TRADER_IMAGES = {};

async function loadTraderImages() {
  try {
    const query = `{ traders { name normalizedName imageLink } }`;
    const j = await tarkovGQL(query);
    if (j && j.data && j.data.traders) {
      j.data.traders.forEach(t => {
        TRADER_IMAGES[t.name] = t.imageLink;
      });
    }
  } catch(e) {
    console.warn('Could not load trader images:', e.message);
  }
}

const TRADER_MAP = Object.fromEntries(TRADERS.map(t => [t.name, t]));

function getTrader(name) {
  const t = TRADER_MAP[name] || { name, color: '#555', fallback: name.slice(0,2).toUpperCase() };
  return { ...t, image: TRADER_IMAGES[name] || null };
}

function traderPortraitHTML(name, size = 28) {
  const t = getTrader(name);
  const img = t.image ? `<img src="${t.image}" alt="${name}" style="width:100%;height:100%;object-fit:cover;object-position:top;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : '';
  const fallback = `<span style="display:${t.image ? 'none' : 'flex'};width:100%;height:100%;align-items:center;justify-content:center;font-family:'Rajdhani',sans-serif;font-size:${Math.round(size*0.4)}px;font-weight:700;color:${t.color};">${t.fallback}</span>`;
  return img + fallback;
}
