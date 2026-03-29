// ── Cloud Sync — Firebase Firestore ────────────────────────────────────────
// Optional cross-device sync for Kappa Tracker progress.
// Requires firebase-config.js to be configured (replace the placeholder values).
// Loaded after platform.js and before the app scripts.
//
// Architecture:
//   • Google Sign-In via Firebase Auth
//   • Progress stored at: users/{uid}/progress/kappa_v3
//   • On sign-in: remote + local are MERGED (union for sets, max for level)
//   • On every saveProgress: debounced push (800 ms) to Firestore
//   • Offline persistence enabled — works without internet, syncs when back

var SYNC = (function () {

  // ── Private state ─────────────────────────────────────────────────────────
  var _db        = null;
  var _auth      = null;
  var _saveTimer = null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _docRef() {
    var user = _auth && _auth.currentUser;
    if (!_db || !user) return null;
    return _db.collection('users').doc(user.uid).collection('progress').doc('kappa_v3');
  }

  var _statusColors = {
    idle:    'var(--text4)',
    syncing: 'var(--gold)',
    ok:      'var(--green)',
    error:   'var(--red)'
  };

  function _setStatus(state, label) {
    var el  = document.getElementById('sync-status-text');
    var dot = document.getElementById('sync-status-dot');
    var mob = document.getElementById('mh-sync-dot');
    if (el)  el.textContent = label;
    if (dot) dot.style.background = _statusColors[state] || 'var(--text4)';
    // Mobile header: small colored dot — visible only when synced / syncing
    if (mob) {
      mob.style.background = _statusColors[state] || 'transparent';
      mob.style.opacity    = (state === 'ok' || state === 'syncing') ? '1' : '0';
    }
  }

  // ── Merge logic ───────────────────────────────────────────────────────────
  // Progress sets always UNION — you never lose a completed item.
  // Settings (theme, mode, etc.) come from whichever copy was saved later.
  // Level is always the maximum seen across devices.
  function _merge(local, remote) {
    if (!remote) return local;
    if (!local)  return remote;

    var localTime  = local.savedAt  || 0;
    var remoteTime = remote.savedAt || 0;
    // Start from whichever save is newer as the base for settings
    var base = Object.assign({}, remoteTime >= localTime ? remote : local);

    // Union progress sets — once an item is marked done it stays done
    ['quests', 'collector', 'hideout', 'story', 'raidItems'].forEach(function (k) {
      var a = new Set(Array.isArray(local[k])  ? local[k]  : []);
      var b = new Set(Array.isArray(remote[k]) ? remote[k] : []);
      base[k] = Array.from(new Set([...a, ...b]));
    });

    // Level: always take the higher value
    base.level = Math.max(local.level || 1, remote.level || 1);

    // Timestamp: track the highest seen across devices
    base.savedAt = Math.max(localTime, remoteTime);

    return base;
  }

  // ── Apply merged data directly to APP state (avoids re-triggering save) ──
  function _applyToApp(data) {
    if (!data || typeof APP === 'undefined') return;
    if (data.quests)         APP.progress.quests         = new Set(data.quests);
    if (data.collector)      APP.progress.collector      = new Set(data.collector);
    if (data.hideout)        APP.progress.hideout        = new Set(data.hideout);
    if (data.story)          APP.progress.story          = new Set(data.story);
    if (data.raidItems)      APP.progress.raidItems      = new Set(data.raidItems);
    if (data.raidItemCounts) APP.progress.raidItemCounts = data.raidItemCounts;
    if (data.level)          APP.progress.level          = data.level;
    if (data.lastEnding)     APP.progress.lastEnding     = data.lastEnding;
    if (data.faction)        APP.progress.faction        = data.faction;
    if (data.hideoutCounts)  APP.progress.hideoutCounts  = data.hideoutCounts;
    if (data.storyItems)     APP.progress.storyItems     = data.storyItems;
    if (data.storyStepChecks) APP.progress.storyStepChecks = data.storyStepChecks;

    if (data.theme && typeof applyTheme === 'function') applyTheme(data.theme);
    if (data.mode  && typeof applyMode  === 'function') applyMode(data.mode);

    // Refresh UI displays
    if (typeof updateLevelDisplay === 'function') updateLevelDisplay();
    if (typeof updateGlobalStats  === 'function') updateGlobalStats();
    if (typeof buildDashboard     === 'function') buildDashboard();
  }

  // ── Upload to Firestore ───────────────────────────────────────────────────
  function _upload(data) {
    var ref = _docRef();
    if (!ref) return Promise.resolve();
    return ref.set(data)
      .then(function () {
        var t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        _setStatus('ok', '✓ Synced at ' + t);
      })
      .catch(function (e) {
        _setStatus('error', '✕ Sync failed');
        console.error('[Sync] upload error:', e);
      });
  }

  // ── Auth state handler ────────────────────────────────────────────────────
  async function _onSignIn(user) {
    SYNC.isEnabled  = true;
    SYNC.userId     = user.uid;
    SYNC.userEmail  = user.displayName || user.email || 'Signed in';
    _setStatus('syncing', '↻ Syncing…');
    _updateUI(true);

    try {
      var ref = _docRef();
      if (!ref) return;

      // Read last signed-in UID to detect account switch
      var lastUid = null;
      try { lastUid = localStorage.getItem('kappa_last_uid'); } catch (e) {}
      var isSameAccount = (lastUid === user.uid);

      // Download remote snapshot
      var snap   = await ref.get();
      var remote = snap.exists ? snap.data() : null;

      var merged = null;

      if (isSameAccount) {
        // Same account — merge local + remote (safe to union progress sets)
        var local = null;
        if (window.electronAPI) {
          try { local = await window.electronAPI.loadProgress(); } catch (e) {}
        } else {
          var raw = localStorage.getItem('kappa_v3');
          try { local = raw ? JSON.parse(raw) : null; } catch (e) {}
        }
        merged = _merge(local, remote);
      } else {
        // Different account — use remote data only (don't bleed another account's progress)
        merged = remote;
        console.log('[Sync] Account switch detected — loading remote data only');
      }

      if (merged) {
        _applyToApp(merged);
        try { localStorage.setItem('kappa_v3', JSON.stringify(merged)); } catch (e) {}
        try { localStorage.setItem('kappa_last_uid', user.uid); } catch (e) {}
        await _upload(merged);
      } else {
        // First time signing in — push local progress up to this new account
        var local = null;
        if (window.electronAPI) {
          try { local = await window.electronAPI.loadProgress(); } catch (e) {}
        } else {
          var raw2 = localStorage.getItem('kappa_v3');
          try { local = raw2 ? JSON.parse(raw2) : null; } catch (e) {}
        }
        if (local) {
          try { localStorage.setItem('kappa_last_uid', user.uid); } catch (e) {}
          await _upload(local);
        }
        _setStatus('ok', '✓ No cloud data yet');
      }
    } catch (e) {
      _setStatus('error', '✕ Sync error');
      console.error('[Sync] sign-in sync error:', e);
    }
  }

  function _onSignOut() {
    SYNC.isEnabled = false;
    SYNC.userId    = null;
    SYNC.userEmail = null;
    try { localStorage.removeItem('kappa_last_uid'); } catch (e) {}
    _updateUI(false);
    _setStatus('idle', 'Not signed in');
  }

  // ── Settings panel UI ─────────────────────────────────────────────────────
  function _updateUI(signedIn) {
    var inEl  = document.getElementById('sync-signed-in');
    var outEl = document.getElementById('sync-signed-out');
    var emEl  = document.getElementById('sync-user-email');
    if (inEl)  inEl.style.display  = signedIn ? '' : 'none';
    if (outEl) outEl.style.display = signedIn ? 'none' : '';
    if (emEl && signedIn) emEl.textContent = SYNC.userEmail || '';
  }

  // ── Mobile (Capacitor) sign-in — Firestore relay ──────────────────────────
  // auth-mobile.html is deployed to Firebase Hosting (an authorised domain).
  // It does signInWithPopup, then writes tokens to auth_sessions/{sessionId}.
  // We poll that document every 2 s and sign in once it appears.

  var MOBILE_AUTH_URL = 'https://kappa-tracker-4bff9.web.app/auth-mobile.html';

  function _openMobileAuth() {
    // Random 32-char session ID — effectively a one-time secret
    var sessionId = [1,2,3,4].map(function () {
      return Math.random().toString(36).substr(2, 8);
    }).join('');

    var done = false;

    // Open auth page in system browser (Chrome on Android / Silk on Fire OS)
    window.open(MOBILE_AUTH_URL + '?s=' + sessionId, '_system');
    _setStatus('syncing', '↻ Complete sign-in in your browser…');

    // Poll Firestore for the session document the auth page will write
    var _pollTimer = setInterval(function () {
      if (done) return;
      _db.collection('auth_sessions').doc(sessionId).get()
        .then(function (snap) {
          if (!snap.exists) return;
          var data = snap.data();
          if (data && data.type === 'kappa-auth') {
            done = true;
            clearInterval(_pollTimer);
            clearTimeout(_timeout);
            // Clean up the one-time session document
            _db.collection('auth_sessions').doc(sessionId).delete().catch(function () {});
            _handleAuthTokens(data);
          }
        })
        .catch(function () {}); // Firestore offline / initialising — keep polling
    }, 2000);

    // Give up after 5 minutes
    var _timeout = setTimeout(function () {
      if (!done) {
        done = true;
        clearInterval(_pollTimer);
        _setStatus('idle', 'Not signed in');
      }
    }, 5 * 60 * 1000);
  }

  // ── Electron / Overwolf sign-in ───────────────────────────────────────────
  // signInWithPopup() fails in Overwolf because the app runs on an
  // overwolf-extension:// scheme which is not an authorized Firebase domain.
  //
  // Solution — dual-path approach:
  //   Primary:   auth-popup.html POSTs tokens to localhost:47291/store-token
  //              and this function polls /get-token every 1.5 s.
  //   Secondary: also listen for window.postMessage in case the environment
  //              supports cross-origin messaging.
  //
  // Both paths call _handleAuthTokens() when credentials arrive.

  var AUTH_URL  = 'http://localhost:47291/';
  var GET_TOKEN = 'http://localhost:47291/get-token';

  function _handleAuthTokens(data) {
    if (!data || data.cancelled) return;
    var idToken     = data.idToken;
    var accessToken = data.accessToken;
    if (!idToken && !accessToken) {
      _setStatus('error', '✕ Sign-in failed');
      return;
    }
    var credential = firebase.auth.GoogleAuthProvider.credential(idToken, accessToken);
    _auth.signInWithCredential(credential).catch(function (e) {
      _setStatus('error', '✕ Sign-in failed');
      console.error('[Sync] credential sign-in error:', e);
    });
  }

  function _openElectronAuth() {
    var done = false; // prevent double-handling

    // ── postMessage listener (secondary path) ────────────────────────────────
    function _onMessage(event) {
      if (!event.data || event.data.type !== 'kappa-auth') return;
      if (done) return;
      done = true;
      cleanup();
      _handleAuthTokens(event.data);
    }
    window.addEventListener('message', _onMessage);

    // ── Open the auth popup ───────────────────────────────────────────────────
    var popup = window.open(AUTH_URL, 'kappa-auth',
      'width=420,height=520,resizable=no,scrollbars=no');

    // In Overwolf, window.open() often returns null because Overwolf redirects
    // the URL to the user's default browser instead of opening an in-app popup.
    // That's fine — the auth page still opens, the user can sign in there, and
    // our polling loop below will pick up the tokens regardless.
    // We only bail out if the URL never opened at all (which would also mean
    // the polling would time out anyway, so we just show a friendlier message).
    if (!popup) {
      _setStatus('syncing', '↻ Complete sign-in in your browser…');
      // Do NOT return — fall through and start the polling loop.
    }

    // ── Polling loop (primary path) ───────────────────────────────────────────
    var _pollTimer = setInterval(function () {
      fetch(GET_TOKEN)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (done) return;
          if (data && data.type === 'kappa-auth') {
            done = true;
            cleanup();
            _handleAuthTokens(data);
          }
        })
        .catch(function () {}); // server starting up / unreachable — keep polling
    }, 1500);

    // ── Timeout after 3 minutes ───────────────────────────────────────────────
    var _timeout = setTimeout(function () {
      if (!done) cleanup();
    }, 3 * 60 * 1000);

    function cleanup() {
      clearInterval(_pollTimer);
      clearTimeout(_timeout);
      window.removeEventListener('message', _onMessage);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    isEnabled: false,
    userId:    null,
    userEmail: null,

    // Called from boot IIFE — initialises Firebase if config is present
    init: function () {
      if (!window.FIREBASE_CONFIG ||
          window.FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
        console.log('[Sync] firebase-config.js not yet configured — sync disabled.');
        var section = document.getElementById('sync-section');
        if (section) {
          section.innerHTML =
            '<div style="font-family:\'Share Tech Mono\',monospace;font-size:9px;' +
            'color:var(--text4);letter-spacing:1px;">' +
            'CLOUD SYNC — configure firebase-config.js to enable</div>';
        }
        return;
      }

      try {
        // Guard against double-init if hot-reloaded
        if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);

        _db   = firebase.firestore();
        _auth = firebase.auth();

        // Enable offline persistence (works even with multiple tabs open)
        _db.enablePersistence({ synchronizeTabs: true })
          .catch(function (err) {
            if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
              console.warn('[Sync] Offline persistence:', err.code);
            }
          });

        // Watch auth state — triggers whenever user signs in or out
        _auth.onAuthStateChanged(function (user) {
          if (user) {
            _onSignIn(user);
          } else {
            _onSignOut();
          }
        });

        // Nothing extra needed for mobile on init — sign-in uses Firestore relay.

        _setStatus('idle', 'Not signed in');
        _updateUI(false);
      } catch (e) {
        console.error('[Sync] init failed:', e);
      }
    },

    // Debounced — called automatically by APP.saveProgress on every save
    schedulePush: function (data) {
      if (!this.isEnabled) return;
      clearTimeout(_saveTimer);
      _setStatus('syncing', '↻ Saving…');
      _saveTimer = setTimeout(function () { _upload(data); }, 800);
    },

    // Manual sync button in Settings
    syncNow: async function () {
      if (!this.isEnabled) return;
      _setStatus('syncing', '↻ Syncing…');
      if (typeof APP !== 'undefined') APP.saveProgress();
    },

    signIn: async function () {
      if (!_auth) return;

      // Overwolf / Electron — app runs on an extension:// scheme so
      // signInWithPopup() would immediately fail with auth/unauthorized-domain.
      // Route through the local auth helper server instead.
      if (typeof IS_ELECTRON !== 'undefined' && IS_ELECTRON) {
        _openElectronAuth();
        return;
      }

      // Mobile (Capacitor) — signInWithPopup / signInWithRedirect both fail
      // inside a Capacitor WebView because Firebase can't redirect back to
      // https://localhost reliably.
      //
      // Instead: open a page hosted on Firebase Hosting (an authorised domain)
      // in the system browser via window.open(url, '_system').  That page does
      // signInWithPopup (works fine there), then writes the tokens to a
      // short-lived Firestore document.  We poll Firestore until we see it,
      // then sign in here with signInWithCredential and delete the document.
      if (typeof IS_MOBILE !== 'undefined' && IS_MOBILE) {
        _openMobileAuth();
        return;
      }

      // Web — standard popup flow works fine.
      try {
        var provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await _auth.signInWithPopup(provider);
      } catch (e) {
        if (e.code !== 'auth/popup-closed-by-user') {
          _setStatus('error', '✕ Sign-in failed');
          console.error('[Sync] sign-in error:', e);
        }
      }
    },

    signOut: async function () {
      if (!_auth) return;
      await _auth.signOut();
    }
  };

}());
