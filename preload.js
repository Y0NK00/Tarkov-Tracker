const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadProgress: () => ipcRenderer.invoke('load-progress'),
  saveProgress: (data) => ipcRenderer.invoke('save-progress', data),
  graphql: (query) => ipcRenderer.invoke('graphql', query),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  setOpacity: (opacity) => ipcRenderer.invoke('set-opacity', opacity),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('set-always-on-top', value),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  getGameState: () => ipcRenderer.invoke('get-game-state'),
  // Hotkey rebinding
  getHotkey: () => ipcRenderer.invoke('get-hotkey'),
  setHotkey: (hotkey) => ipcRenderer.invoke('set-hotkey', hotkey),
  // Subscription / Premium
  checkSubscription: () => ipcRenderer.invoke('check-subscription'),
  openStore: () => ipcRenderer.invoke('open-store'),
  // Register listener for live game events (matchmaking, raid-start, raid-end, etc.)
  onGameEvent: (callback) => {
    ipcRenderer.on('game-event', (_, event) => callback(event));
  },
  // Overlay controls
  toggleOverlay:    ()       => ipcRenderer.invoke('toggle-overlay'),
  pushOverlayStats: (stats)  => ipcRenderer.invoke('push-overlay-stats', stats),
  isElectron: true,
  isOverwolf: true
});
