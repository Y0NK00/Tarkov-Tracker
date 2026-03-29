// ── Kappa Tracker — Dev Launcher ────────────────────────────────────────────
// Starts both the auth helper server (src/auth-server.js) and ow-electron
// in parallel. Use this instead of calling ow-electron directly so that
// Google Sign-In works from within the Overwolf/Electron context.
//
//   npm start   →   node start.js

var spawn = require('child_process').spawn;
var path  = require('path');

var ROOT    = __dirname;
var BIN_DIR = path.join(ROOT, 'node_modules', '.bin');

// ── Auth helper server ───────────────────────────────────────────────────────
var authServer = spawn(process.execPath, [path.join(ROOT, 'src', 'auth-server.js')], {
  stdio: 'inherit',
  cwd:   ROOT
});
authServer.on('error', function (e) {
  console.warn('[start] Could not start auth server:', e.message);
});

// ── ow-electron ──────────────────────────────────────────────────────────────
// Try the local bin first; fall back to the system PATH.
var owBin = path.join(BIN_DIR, process.platform === 'win32' ? 'ow-electron.cmd' : 'ow-electron');

var owElectron = spawn(owBin, ['.'], {
  stdio: 'inherit',
  cwd:   ROOT,
  shell: true   // shell:true lets Windows find .cmd scripts reliably
});
owElectron.on('error', function (e) {
  console.error('[start] Could not start ow-electron:', e.message);
  console.error('        Make sure devDependencies are installed: npm install');
  authServer.kill();
  process.exit(1);
});

// ── Cleanup ──────────────────────────────────────────────────────────────────
function cleanup() {
  try { authServer.kill(); }  catch (e) {}
  try { owElectron.kill(); }  catch (e) {}
}
owElectron.on('close', function (code) {
  cleanup();
  process.exit(code || 0);
});
process.on('SIGINT',  function () { cleanup(); process.exit(0); });
process.on('SIGTERM', function () { cleanup(); process.exit(0); });
