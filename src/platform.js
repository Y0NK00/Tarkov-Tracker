// ── Platform Detection ──────────────────────────────────────────────────────
// Detects whether the app is running inside Electron (desktop overlay),
// Capacitor (iOS / Android), or a plain browser (dev / web).
// Must be loaded FIRST — before any other app script.

var PLATFORM = (function () {
  if (window.electronAPI && window.electronAPI.isElectron) return 'electron';
  if (typeof window.Capacitor !== 'undefined') {
    if (window.Capacitor.isNativePlatform()) {
      return window.Capacitor.getPlatform(); // 'ios' | 'android'
    }
    return 'web'; // Capacitor in browser dev mode
  }
  return 'web';
}());

var IS_ELECTRON = PLATFORM === 'electron';
var IS_IOS      = PLATFORM === 'ios';
var IS_ANDROID  = PLATFORM === 'android';
var IS_MOBILE   = IS_IOS || IS_ANDROID;
var IS_WEB      = !IS_ELECTRON && !IS_MOBILE;

// Apply CSS classes to <html> immediately so stylesheets can react before render
if (IS_MOBILE)  document.documentElement.classList.add('is-mobile');
if (IS_IOS)     document.documentElement.classList.add('is-ios');
if (IS_ANDROID) document.documentElement.classList.add('is-android');
if (IS_ELECTRON) document.documentElement.classList.add('is-electron');

console.log('[Platform] Running as:', PLATFORM);
