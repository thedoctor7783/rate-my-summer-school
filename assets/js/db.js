/* =========================================================================
 * db.js — localStorage-backed data store
 *
 * Holds four collections, all under a single key so they're easy to reset:
 *   - programs : the catalogue (seeded from window.SSDATA, user-editable)
 *   - reviews  : student reviews submitted through the site
 *   - users    : registered accounts (email/phone + password)
 *   - session  : { userId | null }
 *
 * Exposes window.SSDB. Depends on data.js (loaded before this) and i18n.js
 * for the language used in seeded review text.
 * ======================================================================= */

(function () {
  var DB_KEY = 'ss.db.v1';

  /* ---------- tiny password hash (NOT cryptographically secure; demo only) */
  function hash(pw) {
    var h = 0;
    var s = String(pw || '');
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return 'h' + (h >>> 0).toString(16) + ':' + s.length;
  }

  /* ---------- load / save ------------------------------------------------ */
  function load() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }
  function save(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {}
  }

  /* ---------- seed -------------------------------------------------------- */
  function seedPrograms() {
    var seed = JSON.parse(JSON.stringify(window.SSDATA.PROGRAMS || []));
    return seed;
  }
  /* Reviews always begin empty; only verified student submissions are shown. */
  function seedReviews() { return []; }

  function buildSeed() {
    return {
      programs:  seedPrograms(),
      reviews:   seedReviews(),
      users:     [],
      surveys:   [],          // recorded round submissions {programId, roundKey, answers, ts}
      list:      [],          // Saved program IDs (private to this browser)
      savedByUser: {},        // Per-account local save cache; keeps Account responsive while syncing
      session:   { userId: null },
    };
  }

  var db = load() || buildSeed();
  /* Purge legacy design-preview records from browsers that used older builds. */
  (function removeLegacySampleRecords() {
    var isLegacySample = function (record) {
      var id = String((record && record.id) || '');
      return !!(record && (record.sample || record.demo || record.seed || /^(?:sample-|r-seed-)/.test(id)));
    };
    db.reviews = (db.reviews || []).filter(function (record) { return !isLegacySample(record); });
    db.surveys = (db.surveys || []).filter(function (record) { return !isLegacySample(record); });
    save(db);
  })();
  var accountSnapshot = null;
  /* If data.js added new programs, merge them in (idempotent). */
  (function syncPrograms() {
    var src = window.SSDATA.PROGRAMS || [];
    var byId = {};
    db.programs.forEach(function (p) { byId[p.id] = p; });
    src.forEach(function (p) {
      if (!byId[p.id]) db.programs.push(JSON.parse(JSON.stringify(p)));
    });
    save(db);
  })();

  /* ---------- programs --------------------------------------------------- */
  function getPrograms() { return db.programs; }
  function getProgram(id) {
    return db.programs.find(function (p) { return p.id === id; }) || (window.SSDATA.PROGRAMS.find(function (p) { return p.id === id; })) || null;
  }
  function updateProgram(id, patch) {
    var i = db.programs.findIndex(function (p) { return p.id === id; });
    if (i < 0) return false;
    Object.assign(db.programs[i], patch);
    save(db);
    return true;
  }
  function deleteProgram(id) {
    db.programs = db.programs.filter(function (p) { return p.id !== id; });
    db.reviews  = db.reviews.filter(function (r) { return r.programId !== id; });
    save(db);
  }

  /* ---------- reviews ---------------------------------------------------- */
  function isPublishedRecord(record) {
    return !!(record && record.verified === true && !record.sample && !record.demo && !record.seed && !/^(?:sample-|r-seed-)/.test(String(record.id || '')));
  }
  function getReviews(programId) {
    return db.reviews.filter(function (r) { return r.programId === programId && isPublishedRecord(r); });
  }
  function getAllReviews() { return db.reviews.filter(isPublishedRecord); }
  function addReview(r) {
    r.id = 'r-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    r.createdAt = Date.now();
    r.verified = true;
    db.reviews.push(r);
    save(db);
    postJSON('/api/reviews', r).then(function (saved) {
      if (saved && saved.review && saved.review.id) r.id = saved.review.id;
      save(db);
    });
    return r;
  }
  function deleteReview(id) {
    db.reviews = db.reviews.filter(function (r) { return r.id !== id; });
    save(db);
  }
  function deleteReviewsForProgram(programId) {
    db.reviews = db.reviews.filter(function (r) { return r.programId !== programId; });
    save(db);
  }

  /* ---------- users / auth ---------------------------------------------- */
  function getUsers() { return db.users; }
  function findByContact(contact) {
    var c = String(contact || '').trim().toLowerCase();
    return db.users.find(function (u) {
      return (u.email && u.email.toLowerCase() === c) ||
             (u.phone && u.phone === contact);
    }) || null;
  }
  function registerUser(input) {
    var contact = (input.email || input.phone || '').trim();
    if (!contact || !input.password) return { ok: false, error: 'missing' };
    if (findByContact(contact)) return { ok: false, error: 'exists' };
    var u = {
      id: 'u-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      name:    String(input.name    || '').trim(),
      email:   input.email ? String(input.email).trim() : '',
      phone:   input.phone ? String(input.phone).trim() : '',
      grade:   input.grade  || '',
      school:  input.school || '',
      pwHash:  hash(input.password),
      createdAt: Date.now(),
    };
    db.users.push(u);
    db.session.userId = u.id;
    save(db);
    return { ok: true, user: u };
  }
  function loginUser(contact, password) {
    var u = findByContact(contact);
    if (!u) return { ok: false, error: 'invalid' };
    if (u.pwHash !== hash(password)) return { ok: false, error: 'invalid' };
    db.session.userId = u.id;
    save(db);
    return { ok: true, user: u };
  }
  function logout() { db.session.userId = null; save(db); }
  function getSession() { return db.session; }
  function currentUser() {
    if (!db.session.userId) return null;
    return db.users.find(function (u) { return u.id === db.session.userId; }) || null;
  }

  /* ---------- shortlist: browser-local before sign-in, account-owned after */
  function uniqueProgramIds(values) {
    return Array.from(new Set((values || []).filter(function (id) { return typeof id === 'string' && id; })));
  }
  function cachedListFor(userId) {
    db.savedByUser = db.savedByUser || {};
    if (!Array.isArray(db.savedByUser[userId])) db.savedByUser[userId] = [];
    return db.savedByUser[userId];
  }
  function hasCachedListFor(userId) {
    return !!(db.savedByUser && Object.prototype.hasOwnProperty.call(db.savedByUser, userId));
  }
  function rememberAccountList(user) {
    if (!user) return;
    db.savedByUser = db.savedByUser || {};
    var ids = uniqueProgramIds(accountSnapshot && accountSnapshot.savedPrograms || cachedListFor(user.id));
    db.savedByUser[user.id] = ids;
    // `list` remains the browser-side mirror for a just-clicked save.  It is
    // intentionally kept in sync with the account list so Rankings and
    // Account can never be driven by two different arrays during navigation.
    db.list = ids.slice();
    if (accountSnapshot) accountSnapshot.savedPrograms = ids.slice();
    save(db);
  }
  function activeList() {
    var user = currentUser();
    if (user) {
      if (!accountSnapshot || accountSnapshot.user.id !== user.id) accountSnapshot = { user:user, savedPrograms:[], reviews:[], matchmaker:null };
      // The first signed-in render adopts both the server list and anything
      // saved locally just before sign-in. Afterwards this account's local
      // mirror is the source of truth until the server confirms the change.
      if (!hasCachedListFor(user.id)) {
        db.savedByUser = db.savedByUser || {};
        db.savedByUser[user.id] = uniqueProgramIds((accountSnapshot.savedPrograms || []).concat(db.list || []));
        save(db);
      }
      var list = cachedListFor(user.id);
      // Older previews stored a signed-in shortlist in `db.list` while the
      // account cache was already present. Reconcile the two on every read,
      // then immediately write the single result back to both places. This
      // also ensures a click from Rankings cannot disappear when Account
      // refreshes a moment later.
      var reconciled = uniqueProgramIds(list.concat(db.list || []));
      if (reconciled.length !== list.length || reconciled.some(function (id, index) { return id !== list[index]; })) {
        db.savedByUser[user.id] = reconciled;
        list = db.savedByUser[user.id];
        save(db);
      }
      accountSnapshot.savedPrograms = list.slice();
      db.list = list.slice();
      return list;
    }
    db.list = db.list || [];
    return db.list;
  }
  function saveListChange(id, saved) {
    if (!currentUser()) { save(db); return; }
    var user = currentUser();
    // Persist the exact list which Ranking just mutated before waiting for a
    // request. This means a route change cannot replace it with an older GET
    // response from the account endpoint.
    if (accountSnapshot) accountSnapshot.savedPrograms = cachedListFor(user.id).slice();
    rememberAccountList(user);
    postJSON('/api/account/saved', { programId:id, saved:saved }).then(function (result) {
      if (result && Array.isArray(result.savedPrograms) && accountSnapshot) {
        // The UI is local-first; retain the just-clicked state until a later
        // refresh confirms it, rather than making a fast navigation appear to
        // undo the save.
        accountSnapshot.serverSavedPrograms = uniqueProgramIds(result.savedPrograms);
      }
    });
  }
  function getList()        { return activeList().slice(); }
  function inList(id)       { return activeList().indexOf(id) >= 0; }
  function addToList(id)    { var list = activeList(); if (list.indexOf(id) < 0) { list.push(id); saveListChange(id, true); } return true; }
  function removeFromList(id){ var list = activeList(); var index = list.indexOf(id); if (index >= 0) { list.splice(index, 1); saveListChange(id, false); } }
  function toggleList(id)    { if (inList(id)) { removeFromList(id); return false; } addToList(id); return true; }

  /* ---------- survey aggregation -------------------------------------- */
  /* Empty but fully shaped aggregates: the UI can name every option without
   * inventing a percentage before a student has actually answered. */
  function emptyQuestionDist(q) {
    if (q.type === 'stars') return { type: 'stars', max: q.max || 5, dist: Array(q.max || 5).fill(0), n: 0, sum: 0, avg: 0 };
    if (q.type === 'pills-single' || q.type === 'pills-multi') return { type: q.type, total: 0, options: q.options.map(function (o) { return { value:o.value, en:o.en, zh:o.zh, count:0 }; }) };
    if (q.type === 'likert-grid') return { type:q.type, scale:q.scale, total:0, items:q.subItems.map(function (s) { return { key:s.key, label:s.label, dist:[0,0,0,0,0], n:0, sum:0 }; }) };
    if (q.type === 'word-pick') return { type:q.type, total:0, words:q.words.map(function (w) { return { en:w.en, zh:w.zh, count:0 }; }) };
    if (q.type === 'category-grid') return { type:q.type, total:0, items:q.subItems.map(function (s) { return { key:s.key, label:s.label, dist:[0,0,0,0,0], n:0, sum:0 }; }) };
    return null;
  }
  function apiURL(path) {
    var base = String(window.RMS_API_BASE || '').replace(/\/+$/, '');
    return base ? base + path : path;
  }
  function apiFetch(path, options) {
    var request = Object.assign({}, options || {});
    request.credentials = window.RMS_API_BASE ? 'include' : 'same-origin';
    return fetch(apiURL(path), request);
  }
  function postJSON(path, value) {
    if (!window.fetch || location.protocol === 'file:') return Promise.resolve(null);
    // Be explicit about the account session. Saved programs need the same
    // session cookie as Account, including when this is called from Rankings.
    return apiFetch(path, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(value) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function authRequest(path, value) {
    if (!window.fetch || location.protocol === 'file:') return Promise.resolve({ ok:false, error:'offline' });
    return apiFetch(path, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(value || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (data) { return { ok:r.ok, data:data }; }); })
      .then(async function (result) {
        if (result.ok && result.data.user) {
          db.users = [result.data.user]; db.session = { userId:result.data.user.id }; save(db);
          await hydrateRemote();
        }
        return result.ok ? { ok:true, user:result.data.user } : { ok:false, error:result.data.error || 'invalid' };
      }).catch(function () { return { ok:false, error:'offline' }; });
  }
  function registerRemote(input) { return authRequest('/api/auth/register', input); }
  function loginRemote(contact, password) { return authRequest('/api/auth/login', { contact:contact, password:password }); }
  function localOwnerAccessRemote() { return authRequest('/api/auth/local-owner', {}); }
  function logoutRemote() {
    if (!window.fetch || location.protocol === 'file:') { logout(); accountSnapshot = null; return Promise.resolve(); }
    return apiFetch('/api/auth/logout', { method:'POST' }).catch(function () {}).then(function () { logout(); accountSnapshot = null; });
  }
  function accountRequest(path, method, value) {
    if (!window.fetch || location.protocol === 'file:') return Promise.resolve({ ok:false, error:'offline' });
    return apiFetch(path, { method:method, headers:{ 'Content-Type':'application/json' }, body:value === undefined ? undefined : JSON.stringify(value) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (data) { return { ok:r.ok, data:data, error:data.error }; }); })
      .catch(function () { return { ok:false, error:'offline' }; });
  }
  function getAccountSnapshot() { return accountSnapshot; }
  async function refreshAccount() {
    var result = await accountRequest('/api/account', 'GET');
    if (result.ok) {
      accountSnapshot = result.data;
      accountSnapshot._hydrated = true;
      var user = currentUser();
      if (user) {
        if (hasCachedListFor(user.id)) {
          accountSnapshot.serverSavedPrograms = uniqueProgramIds(accountSnapshot.savedPrograms || []);
          accountSnapshot.savedPrograms = cachedListFor(user.id).slice();
          db.list = accountSnapshot.savedPrograms.slice();
        } else rememberAccountList(user);
      }
    }
    return result;
  }
  async function updateAccount(input) {
    var result = await accountRequest('/api/account', 'PATCH', input);
    if (result.ok && result.data.user) {
      db.users = [result.data.user]; db.session = { userId:result.data.user.id };
      if (accountSnapshot) {
        accountSnapshot.user = result.data.user;
        var ownedIds = new Set((accountSnapshot.reviews || []).map(function (r) { return r.id; }));
        db.reviews.forEach(function (r) { if (ownedIds.has(r.id)) r.author = result.data.user.name; });
      }
      save(db);
      await refreshAccount();
    }
    return result;
  }
  async function deleteOwnedReview(id) {
    var result = await accountRequest('/api/account/reviews/' + encodeURIComponent(id), 'DELETE');
    if (result.ok) {
      db.reviews = db.reviews.filter(function (r) { return r.id !== id; });
      if (accountSnapshot) accountSnapshot.reviews = accountSnapshot.reviews.filter(function (r) { return r.id !== id; });
      save(db);
    }
    return result;
  }
  function saveMatchmakerState(state) {
    if (!currentUser()) return Promise.resolve({ ok:false, error:'Sign in required' });
    if (accountSnapshot) accountSnapshot.matchmaker = state;
    return accountRequest('/api/account/matchmaker', 'PUT', { state:state });
  }
  async function clearMatchmakerState() {
    var result = await accountRequest('/api/account/matchmaker', 'DELETE');
    if (result.ok && accountSnapshot) accountSnapshot.matchmaker = null;
    return result;
  }
  async function deleteAccountRemote() {
    var result = await accountRequest('/api/account', 'DELETE', { confirmation:'DELETE' });
    if (result.ok) {
      accountSnapshot = null;
      db.users = []; db.session = { userId:null }; db.list = [];
      save(db);
    }
    return result;
  }
  function hydrateRemote() {
    if (!window.fetch || location.protocol === 'file:') return Promise.resolve(false);
    return apiFetch('/api/bootstrap').then(function (r) { return r.ok ? r.json() : null; }).then(function (payload) {
      if (!payload) return false;
      db.reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
      db.surveys = Array.isArray(payload.surveys) ? payload.surveys : [];
      db.users = payload.user ? [payload.user] : [];
      db.session = { userId: payload.user ? payload.user.id : null };
      accountSnapshot = payload.account || null;
      if (accountSnapshot) accountSnapshot._hydrated = true;
      save(db);
      if (payload.user && accountSnapshot) {
        var cachedSavedPrograms = hasCachedListFor(payload.user.id) ? cachedListFor(payload.user.id) : uniqueProgramIds(accountSnapshot.savedPrograms || []);
        var pendingSavedPrograms = uniqueProgramIds((db.list || []).concat(cachedSavedPrograms));
        accountSnapshot.savedPrograms = uniqueProgramIds(cachedSavedPrograms.concat(db.list || []));
        rememberAccountList(payload.user);
        if (!pendingSavedPrograms.length) return true;
        return accountRequest('/api/account/saved/merge', 'POST', { programIds:pendingSavedPrograms }).then(function (result) {
          if (result.ok && accountSnapshot) {
            accountSnapshot.serverSavedPrograms = uniqueProgramIds(result.data.savedPrograms || []);
            db.list = [];
            rememberAccountList(payload.user);
          }
          return true;
        });
      }
      return true;
    }).catch(function () { return false; });
  }
  function buildAggregate(programId) {
    var agg = {};
    (window.SSDATA.QUESTIONNAIRE || []).forEach(function (round) {
      round.questions.forEach(function (q) {
        agg[q.key] = emptyQuestionDist(q);
      });
    });
    return agg;
  }
  function applyRecord(agg, roundKey, answers) {
    if (!agg || !answers) return;
    var rounds = window.SSDATA.QUESTIONNAIRE || [];
    /* Questions can move between survey rounds as the questionnaire evolves.
     * A stored record's roundKey therefore only tells us when it was submitted;
     * it must not decide which still-recognized answers are counted. Build a
     * unique map from the current schema and aggregate any compatible key. */
    var questionsByKey = {};
    rounds.forEach(function (round) {
      (round.questions || []).forEach(function (q) {
        if (!questionsByKey[q.key]) questionsByKey[q.key] = q;
      });
    });
    Object.keys(questionsByKey).forEach(function (key) {
      var q = questionsByKey[key];
      var res = agg[q.key];
      if (!res) return;
      var v = answers[q.key];
      if (v == null) return;
      if (q.type === 'stars') {
        if (typeof v === 'number' && v >= 1 && v <= res.max) { res.dist[v - 1]++; res.n++; res.sum += v; res.avg = res.sum / res.n; }
      } else if (q.type === 'pills-single') {
        var idx = q.options.findIndex(function (o) { return o.value === v; });
        if (idx >= 0) { res.options[idx].count++; res.total++; }
      } else if (q.type === 'pills-multi') {
        if (Array.isArray(v)) {
          var answered = false;
          v.forEach(function (x) {
            var i2 = q.options.findIndex(function (o) { return o.value === x; });
            if (i2 >= 0) { res.options[i2].count++; answered = true; }
          });
          // Count respondents once, not once per selected activity. This is
          // the denominator for "reported by X% of students" on the format map.
          if (answered) res.total++;
        }
      } else if (q.type === 'likert-grid') {
        if (v && typeof v === 'object') q.subItems.forEach(function (s, i) {
          var x = v[s.key];
          if (typeof x === 'number' && x >= 1 && x <= 5) { res.items[i].dist[x - 1]++; res.items[i].n++; res.items[i].sum += x; }
        });
      } else if (q.type === 'word-pick') {
        /* Survey drafts historically saved word picks as an array directly,
         * while the renderer also understands { values: [...] }. Arrays have
         * a built-in .values function, so never read that property unless it
         * is itself an array. */
        var vals = Array.isArray(v) ? v : (v && Array.isArray(v.values) ? v.values : []);
        var recognizedWord = false;
        vals.forEach(function (w) {
          var i3 = q.words.findIndex(function (x) { return x.en === w; });
          if (i3 >= 0) { res.words[i3].count++; recognizedWord = true; }
        });
        // The denominator for a multi-select word question is respondents,
        // not the total number of words selected.
        if (recognizedWord) res.total++;
      } else if (q.type === 'category-grid') {
        if (v && typeof v === 'object') q.subItems.forEach(function (s, i) {
          var x2 = v[s.key];
          if (typeof x2 === 'number' && x2 >= 1 && x2 <= 5) { res.items[i].dist[x2 - 1]++; res.items[i].n++; res.items[i].sum += x2; }
        });
      }
    });
  }
  function recordRound(programId, roundKey, answers) {
    db.surveys = db.surveys || [];
    var record = { id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), programId: programId, roundKey: roundKey, answers: answers || {}, ts: Date.now(), verified: true };
    db.surveys.push(record);
    save(db);
    postJSON('/api/surveys', record).then(function (saved) {
      if (saved && saved.survey && saved.survey.id) record.id = saved.survey.id;
      save(db);
    });
  }
  function getAggregate(programId) {
    var agg = buildAggregate(programId);
    var recs = (db.surveys || []).filter(function (s) { return s.programId === programId && isPublishedRecord(s); });
    recs.forEach(function (s) { applyRecord(agg, s.roundKey, s.answers); });
    return agg;
  }

  /* ---------- export ----------------------------------------------------- */
  window.SSDB = {
    getPrograms:      getPrograms,
    getProgram:       getProgram,
    updateProgram:    updateProgram,
    deleteProgram:    deleteProgram,
    getReviews:       getReviews,
    getAllReviews:    getAllReviews,
    addReview:        addReview,
    deleteReview:     deleteReview,
    deleteReviewsForProgram: deleteReviewsForProgram,
    recordRound:      recordRound,
    getAggregate:     getAggregate,
    getSurveyResponses: function (programId) { return (db.surveys || []).filter(function (s) { return s.programId === programId; }); },
    hydrateRemote:    hydrateRemote,
    registerRemote:   registerRemote,
    loginRemote:      loginRemote,
    localOwnerAccessRemote: localOwnerAccessRemote,
    logoutRemote:     logoutRemote,
    getUsers:         getUsers,
    findByContact:    findByContact,
    registerUser:     registerUser,
    loginUser:        loginUser,
    logout:           logout,
    getSession:       getSession,
    currentUser:      currentUser,
    getAccountSnapshot: getAccountSnapshot,
    refreshAccount: refreshAccount,
    updateAccount: updateAccount,
    deleteOwnedReview: deleteOwnedReview,
    saveMatchmakerState: saveMatchmakerState,
    clearMatchmakerState: clearMatchmakerState,
    deleteAccountRemote: deleteAccountRemote,
    getList:          getList,
    inList:           inList,
    addToList:        addToList,
    removeFromList:   removeFromList,
    toggleList:       toggleList,
    _raw:             function () { return db; },  // for the maintenance panel
    _reset:           function () { db = buildSeed(); save(db); },
  };
})();
