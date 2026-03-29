const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  getProgress:  () => ipcRenderer.invoke('overlay-get-progress'),
  getGameState: () => ipcRenderer.invoke('get-game-state'),
  onUpdate:     (cb) => { ipcRenderer.on('overlay-update',  (_, d) => cb(d)); },
  onGameEvent:  (cb) => { ipcRenderer.on('game-event',      (_, e) => cb(e)); },
  close:        () => ipcRenderer.invoke('hide-overlay'),
  isOverlay: true
});
