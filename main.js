const { app, BrowserWindow, shell, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const os = require('os');

// Cached overlay stats (built by renderer, forwarded here so overlay can read on load)
var cachedOverlayStats = {};

const TARKOV_GAME_ID = 21634;
const DEFAULT_HOTKEY = 'Ctrl+Shift+K';

// !! Replace with your real plan ID from the Overwolf Developer Console !!
const PREMIUM_PLAN_ID = 0;

var currentHotkey = DEFAULT_HOTKEY;

// ─── Data helpers ─────────────────────────────────────────────────────────────

function getDataPath() {
  return path.join(app.getPath('userData'), 'progress.json');
}

function loadProgress() {
  try {
    const p = getDataPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch(e) {}
  return {};
}

function saveProgress(data) {
  try { fs.writeFileSync(getDataPath(), JSON.stringify(data), 'utf8'); } catch(e) {}
}

// ─── GraphQL ──────────────────────────────────────────────────────────────────

function graphqlFetch(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const options = {
      hostname: 'api.tarkov.dev',
      path: '/graphql',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Invalid JSON response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(body);
    req.end();
  });
}

// ─── Window ───────────────────────────────────────────────────────────────────

let mainWindow = null;
let overlayWindow = null;

// ─── Overlay window ───────────────────────────────────────────────────────────

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 320,
    height: 480,
    minWidth: 260,
    minHeight: 300,
    resizable: true,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#060809',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'overlay-preload.js')
    },
    title: 'Kappa Tracker — Overlay'
  });

  overlayWindow.loadFile('src/overlay.html');
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.on('closed', () => { overlayWindow = null; });
}

function toggleOverlayWindow() {
  if (!overlayWindow) {
    createOverlayWindow();
  } else if (overlayWindow.isVisible()) {
    overlayWindow.hide();
  } else {
    overlayWindow.show();
    overlayWindow.focus();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    resizable: true,
    backgroundColor: '#080a0c',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Kappa Tracker — Escape from Tarkov'
  });

  mainWindow.loadFile('src/index.html');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

// ─── Overwolf overlay integration ─────────────────────────────────────────────

function setupOverwolfOverlay() {
  const owApp = app;

  if (!owApp.overwolf || !owApp.overwolf.packages) {
    console.log('[Overwolf] Overwolf packages API not available — running in standard mode');
    return;
  }

  console.log('[Overwolf] Waiting for overlay package to be ready...');

  owApp.overwolf.packages.on('ready', (e, packageName, version) => {
    if (packageName !== 'overlay') return;
    console.log('[Overwolf] Overlay package ready (v' + version + ')');

    const overlayApi = owApp.overwolf.packages.overlay;
    if (!overlayApi) {
      console.log('[Overwolf] Overlay API unavailable after ready event');
      return;
    }

    overlayApi.registerGames({ gamesIds: [TARKOV_GAME_ID] })
      .then(() => console.log('[Overwolf] Registered for Tarkov overlay injection'))
      .catch(err => console.error('[Overwolf] Failed to register games:', err));

    overlayApi.on('game-launched', (event, gameInfo) => {
      console.log('[Overwolf] Game launched:', (gameInfo && gameInfo.gameInfo && gameInfo.gameInfo.name) || gameInfo);

      if (gameInfo && gameInfo.processInfo && gameInfo.processInfo.isElevated) {
        console.log('[Overwolf] Game is running elevated — cannot inject without elevation');
        return;
      }

      event.inject();

      if (mainWindow) {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('game-event', { type: 'game-launched', state: { inGame: true, matchmaking: false, inRaid: false, currentMap: null } });
      }
      // Auto-show overlay when game launches
      if (!overlayWindow) createOverlayWindow();
    });

    overlayApi.on('game-injected', (gameInfo) => {
      console.log('[Overwolf] Successfully injected into:', (gameInfo && gameInfo.gameInfo && gameInfo.gameInfo.name) || gameInfo);
    });

    overlayApi.on('game-injection-error', (gameInfo, error) => {
      console.error('[Overwolf] Injection error:', error);
    });

    overlayApi.on('game-focus-changed', (window, game, hasFocus) => {
      if (hasFocus && mainWindow) {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
      }
    });
  });

  owApp.overwolf.packages.on('failed-to-initialize', (e, packageName) => {
    console.error('[Overwolf] Package failed to init:', packageName);
  });

  owApp.overwolf.packages.on('crashed', (e) => {
    console.error('[Overwolf] Package crashed — will auto-relaunch');
  });
}

// ─── EFT Live Game Integration (Log File Watcher) ─────────────────────────────

function getEFTLogPath() {
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Local', 'Battlestate Games', 'EFT', 'Logs'),
    path.join(os.homedir(), 'Documents', 'Escape from Tarkov', 'Logs'),
    path.join('C:\\', 'Battlestate Games', 'EFT', 'Logs'),
    path.join('C:\\', 'Battlestate Games', 'Escape from Tarkov', 'Logs'),
  ];
  for (var i = 0; i < candidates.length; i++) {
    try {
      if (fs.existsSync(candidates[i]) && fs.statSync(candidates[i]).isDirectory()) {
        console.log('[EFT] Found log directory:', candidates[i]);
        return candidates[i];
      }
    } catch(e) {}
  }
  return null;
}

// Live game state object
var gameState = {
  inGame: false,
  matchmaking: false,
  inRaid: false,
  currentMap: null,
  raidStartTime: null,
};

// EFT log line patterns
var LOG_PATTERNS = {
  matchmaking:   /[Mm]atching|Status.*Matching|Waiting for players|Queue position/,
  raidStart:     /Spawn on location|GameStarted|Raid Started|application loaded|InitMonoBehaviours/,
  raidEnd:       /GameOver|Left raid|Leave from menu|Session over|Raid Ended|Back to Lobby|LeaveFromMenu/,
  mapName:       /location[:\s]+([a-z_\-0-9]+)|Selected location[:\s]+([a-z_\-0-9]+)|Loading\s+([a-z_\-0-9]+)/i,
  // Quest completion: BSG writes a chat notification JSON with type:12 (QUEST_SUCCESS) and templateId
  // templateId contains the 24-char hex quest ID (matching tarkov.dev task IDs)
  questId:       /"templateId"\s*:\s*"([a-f0-9]{24})/i,
  // type:12 = TaskFinished in BSG's MessageType/TaskStatus enum (confirmed from TarkovMonitor source)
  questSuccess:  /"type"\s*:\s*12\b|QuestComplete/i,
};

// Map EFT internal names to tarkov.dev normalizedName slugs
var MAP_LOOKUP = {
  'bigmap':        'customs',
  'customs':       'customs',
  'woods':         'woods',
  'shoreline':     'shoreline',
  'interchange':   'interchange',
  'rezervbase':    'reserve',
  'reserve':       'reserve',
  'lighthouse':    'lighthouse',
  'tarkovstreets': 'streets-of-tarkov',
  'streets':       'streets-of-tarkov',
  'sandbox':       'ground-zero',
  'groundzero':    'ground-zero',
  'laboratory':    'the-lab',
  'lab':           'the-lab',
  'factory4_day':  'factory',
  'factory4_night':'factory',
  'factory':       'factory',
};

function normalizeMapName(raw) {
  var key = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  var keys = Object.keys(MAP_LOOKUP);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i].replace(/[^a-z0-9]/g, '');
    if (key === k || key.indexOf(k) !== -1) return MAP_LOOKUP[keys[i]];
  }
  return raw.toLowerCase();
}

function broadcastGameEvent(event) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('game-event', event);
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('game-event', event);
  }
}

function processLogLine(line) {
  var trimmed = line.trim();
  if (!trimmed) return;

  // Matchmaking detected
  if (!gameState.matchmaking && !gameState.inRaid && LOG_PATTERNS.matchmaking.test(trimmed)) {
    gameState.matchmaking = true;
    gameState.inGame = true;
    console.log('[EFT] Matchmaking detected');
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
    broadcastGameEvent({ type: 'matchmaking', state: Object.assign({}, gameState) });
    return;
  }

  // Raid started
  if (!gameState.inRaid && LOG_PATTERNS.raidStart.test(trimmed)) {
    gameState.inRaid = true;
    gameState.matchmaking = false;
    gameState.inGame = true;
    gameState.raidStartTime = Date.now();
    console.log('[EFT] Raid started, map:', gameState.currentMap);
    broadcastGameEvent({ type: 'raid-start', state: Object.assign({}, gameState) });
    return;
  }

  // Raid ended / back to menu
  if ((gameState.inRaid || gameState.matchmaking) && LOG_PATTERNS.raidEnd.test(trimmed)) {
    var wasInRaid = gameState.inRaid;
    var mapPlayed = gameState.currentMap;
    var raidDuration = gameState.raidStartTime ? Math.round((Date.now() - gameState.raidStartTime) / 1000) : 0;
    gameState.inRaid = false;
    gameState.matchmaking = false;
    gameState.currentMap = null;
    gameState.raidStartTime = null;
    console.log('[EFT] Raid/matchmaking ended (was in raid: ' + wasInRaid + ', map: ' + mapPlayed + ')');
    broadcastGameEvent({ type: 'raid-end', state: Object.assign({}, gameState), wasInRaid: wasInRaid, mapPlayed: mapPlayed, raidDuration: raidDuration });
    return;
  }

  // Map name extraction
  var mapMatch = trimmed.match(LOG_PATTERNS.mapName);
  if (mapMatch) {
    var rawMap = (mapMatch[1] || mapMatch[2] || mapMatch[3] || '').trim();
    if (rawMap && rawMap.length > 2) {
      var normalized = normalizeMapName(rawMap);
      if (normalized !== gameState.currentMap) {
        gameState.currentMap = normalized;
        console.log('[EFT] Map detected:', normalized);
        broadcastGameEvent({ type: 'map-detected', map: normalized, state: Object.assign({}, gameState) });
      }
    }
  }

  // Quest auto-completion — BSG writes chat notification JSON when a quest is handed in
  // Format: {"type":12,"templateId":"<24-hex-quest-id> ...","text":"..."}
  // type 12 = QUEST_SUCCESS in BSG's MessageType enum; templateId starts with the tarkov.dev quest ID
  var questIdMatch = trimmed.match(LOG_PATTERNS.questId);
  if (questIdMatch && LOG_PATTERNS.questSuccess.test(trimmed)) {
    var questId = questIdMatch[1];
    console.log('[EFT] Quest completion detected in log, id:', questId);
    broadcastGameEvent({ type: 'quest-complete', questId: questId });
  }
}

// Per-file read positions — allows watching multiple log files simultaneously
// (EFT writes several .log files; quest notifications may land in a different file
//  than the main application.log that game-state events come from)
var logFilePositions = {}; // { absolutePath: bytesRead }
var logPollInterval = null;

function tailAllLogFiles(logDir) {
  try {
    var files = fs.readdirSync(logDir)
      .filter(function(f) { return f.toLowerCase().endsWith('.log'); })
      .map(function(f) { return path.join(logDir, f); });

    files.forEach(function(filePath) {
      try {
        var stats = fs.statSync(filePath);
        if (!(filePath in logFilePositions)) {
          // Newly discovered file — seed near the end so we don't replay old history
          logFilePositions[filePath] = Math.max(0, stats.size - 8192);
          console.log('[EFT] Watching log file:', path.basename(filePath));
        }
        if (stats.size <= logFilePositions[filePath]) return;

        var fd = fs.openSync(filePath, 'r');
        var bufSize = stats.size - logFilePositions[filePath];
        var buf = Buffer.alloc(bufSize);
        fs.readSync(fd, buf, 0, bufSize, logFilePositions[filePath]);
        fs.closeSync(fd);
        logFilePositions[filePath] = stats.size;

        buf.toString('utf8').split('\n').forEach(function(line) { processLogLine(line); });
      } catch(e) {
        // File locked by EFT or inaccessible — ignore silently
      }
    });
  } catch(e) {}
}

function startEFTLogWatcher() {
  var logDir = getEFTLogPath();
  if (!logDir) {
    console.log('[EFT] Log directory not found — live game integration disabled');
    setTimeout(function() { broadcastGameEvent({ type: 'log-not-found' }); }, 500);
    return false;
  }

  setTimeout(function() { broadcastGameEvent({ type: 'log-watching', logDir: logDir }); }, 500);

  // Poll every 2 seconds — tails ALL .log files in the EFT log directory
  logPollInterval = setInterval(function() {
    tailAllLogFiles(logDir);
  }, 2000);

  // Watch for new log files appearing (new session or new log file rotation)
  try {
    fs.watch(logDir, { persistent: false }, function(eventType, filename) {
      if (eventType === 'rename' && filename && filename.toLowerCase().endsWith('.log')) {
        console.log('[EFT] New log file detected:', filename);
        // Will be picked up automatically on next poll
      }
    });
  } catch(e) {
    console.log('[EFT] Directory watch failed:', e.message);
  }

  console.log('[EFT] Log watcher running —', logDir);
  return true;
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('load-progress', () => loadProgress());
ipcMain.handle('save-progress', (_, data) => { saveProgress(data); return true; });

// ── Overlay IPC ───────────────────────────────────────────────────────────────

// Main renderer pushes computed stats here; we cache + forward to overlay
ipcMain.handle('push-overlay-stats', (_, stats) => {
  cachedOverlayStats = Object.assign({}, stats);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay-update', cachedOverlayStats);
  }
  return true;
});

// Overlay requests full data on load
ipcMain.handle('overlay-get-progress', () => {
  return Object.assign({}, cachedOverlayStats, { gameState: Object.assign({}, gameState) });
});

// Toggle overlay visibility (called from renderer hotkey or button)
ipcMain.handle('toggle-overlay', () => {
  toggleOverlayWindow();
  return true;
});

// Hide overlay (called from overlay close button)
ipcMain.handle('hide-overlay', () => {
  if (overlayWindow) overlayWindow.hide();
  return true;
});
ipcMain.handle('open-external', (_, url) => { shell.openExternal(url); return true; });

ipcMain.handle('set-opacity', (_, opacity) => {
  if (mainWindow) {
    var clamped = Math.max(0.1, Math.min(1.0, opacity));
    mainWindow.setOpacity(clamped);
  }
  return true;
});

ipcMain.handle('set-always-on-top', (_, value) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(value, 'screen-saver');
  }
  return true;
});

ipcMain.handle('hide-window', () => {
  if (mainWindow) mainWindow.hide();
  return true;
});

ipcMain.handle('get-game-state', () => Object.assign({}, gameState));

// ── Hotkey rebinding ──────────────────────────────────────────────────────────
ipcMain.handle('set-hotkey', (_, newHotkey) => {
  if (!newHotkey || typeof newHotkey !== 'string') return { success: false, error: 'Invalid hotkey' };
  try {
    globalShortcut.unregister(currentHotkey);
    var registered = globalShortcut.register(newHotkey, toggleWindow);
    if (registered) {
      currentHotkey = newHotkey;
      console.log('[Kappa Tracker] Hotkey changed to:', newHotkey);
      return { success: true, hotkey: newHotkey };
    } else {
      // Hotkey in use — restore previous
      globalShortcut.register(currentHotkey, toggleWindow);
      return { success: false, error: 'That key combination is already in use by another app.' };
    }
  } catch(e) {
    // Try to restore old hotkey
    try { globalShortcut.register(currentHotkey, toggleWindow); } catch(_) {}
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-hotkey', () => currentHotkey);

// ── Subscription / Premium check ──────────────────────────────────────────────
ipcMain.handle('check-subscription', async () => {
  // Try Overwolf overlay subscription API (only available in Overwolf runtime)
  try {
    var owApp = app;
    if (owApp.overwolf && owApp.overwolf.packages && owApp.overwolf.packages.overlay) {
      var overlayApi = owApp.overwolf.packages.overlay;
      if (overlayApi.subscriptions && typeof overlayApi.subscriptions.getActivePlans === 'function') {
        var result = await overlayApi.subscriptions.getActivePlans();
        var plans = (result && result.plans) ? result.plans : [];
        var isPremium = plans.some(function(p) { return p.planId === PREMIUM_PLAN_ID; });
        return { isPremium: isPremium, plans: plans };
      }
    }
  } catch(e) {
    console.log('[Subscription] Check failed:', e.message);
  }
  return { isPremium: false, plans: [] };
});

ipcMain.handle('open-store', () => {
  // Open Overwolf store page for subscription upgrade
  shell.openExternal('https://www.overwolf.com/app/kappa-tracker');
  return true;
});

ipcMain.handle('graphql', async (_, query) => {
  try {
    return await graphqlFetch(query);
  } catch(e) {
    if (e.message.includes('timed out') || e.message.includes('ECONNRESET')) {
      try {
        await new Promise(r => setTimeout(r, 1500));
        return await graphqlFetch(query);
      } catch(e2) { return { error: e2.message }; }
    }
    return { error: e.message };
  }
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  setupOverwolfOverlay();

  // Load saved hotkey from progress file (if user changed it previously)
  var savedProgress = loadProgress();
  if (savedProgress && savedProgress.hotkey) {
    currentHotkey = savedProgress.hotkey;
  }

  // Start EFT log watcher once renderer is ready to receive events
  mainWindow.webContents.once('did-finish-load', () => {
    startEFTLogWatcher();
  });

  // Register the toggle hotkey (default or user-customised)
  globalShortcut.register(currentHotkey, toggleWindow);
  console.log('[Kappa Tracker] Toggle hotkey registered:', currentHotkey);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (logPollInterval) clearInterval(logPollInterval);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
