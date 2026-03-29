// ── Kappa Tracker — Local Auth Helper Server ────────────────────────────────
// Firebase's Google Sign-In popup requires an authorized HTTP domain.
// Overwolf/Electron apps run on an extension:// scheme which is never on that
// list, so signInWithPopup() fails immediately.
//
// Flow:
//   1. app-sync.js opens http://localhost:47291/ in a popup window
//   2. auth-popup.html signs in with Google (localhost IS authorized)
//   3. auth-popup.html POSTs the Google OAuth tokens to /store-token
//   4. app-sync.js polls /get-token until the tokens arrive
//   5. app-sync.js calls signInWithCredential() to complete Firebase auth
//
// No npm dependencies — uses Node.js built-in 'http' and 'fs' only.
// Started automatically by start.js alongside ow-electron.

var http = require('http');
var fs   = require('fs');
var path = require('path');

var PORT     = 47291;
var htmlFile = path.join(__dirname, 'auth-popup.html');

// In-memory one-time token store — cleared as soon as it is consumed.
var _pendingToken = null;

var server = http.createServer(function (req, res) {

  // CORS headers — required so the Overwolf renderer can fetch these endpoints.
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Serve the auth popup page ──────────────────────────────────────────────
  if (req.method === 'GET' && (req.url === '/' || req.url === '/auth-popup.html')) {
    fs.readFile(htmlFile, function (err, data) {
      if (err) {
        res.writeHead(500);
        res.end('Error loading auth-popup.html: ' + err.message);
        return;
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      res.end(data);
    });
    return;
  }

  // ── Receive tokens from auth-popup.html ───────────────────────────────────
  if (req.method === 'POST' && req.url === '/store-token') {
    var body = '';
    req.on('data', function (chunk) { body += chunk; });
    req.on('end', function () {
      try {
        _pendingToken = JSON.parse(body);
        console.log('[Kappa Auth] Token stored — waiting for main window to collect.');
      } catch (e) {
        console.error('[Kappa Auth] Could not parse token payload:', e.message);
      }
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // ── Main window polls here ────────────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/get-token') {
    var token     = _pendingToken;
    _pendingToken = null; // consume: each token is delivered exactly once
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(token || {}));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('[Kappa Auth] Helper server ready at http://localhost:' + PORT);
});

server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.log('[Kappa Auth] Port ' + PORT + ' already in use — auth server already running.');
  } else {
    console.error('[Kappa Auth] Server error:', err.message);
  }
});
