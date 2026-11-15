/*
 * RateMySummerSchool local server
 *
 * Starts a same-origin static site and a SQLite-backed API.  Student survey
 * responses and reviews are persisted in data/ratemysummerschool.sqlite;
 * program catalogue content remains in assets/js/data.js for now.
 *
 * Run with: node server.js
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const DATA_DIR = path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'ratemysummerschool.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT UNIQUE,
    password_hash TEXT NOT NULL, grade TEXT, school TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS programs (
    id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS survey_responses (
    id TEXT PRIMARY KEY, program_id TEXT NOT NULL, round_key TEXT NOT NULL,
    answers_json TEXT NOT NULL, respondent_id TEXT, submitted_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_surveys_program ON survey_responses(program_id);
  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY, program_id TEXT NOT NULL, author TEXT NOT NULL,
    who_text TEXT, stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
    body TEXT NOT NULL, respondent_id TEXT, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reviews_program ON reviews(program_id);
  CREATE TABLE IF NOT EXISTS saved_programs (
    user_id TEXT NOT NULL, program_id TEXT NOT NULL, created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, program_id), FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS matchmaker_profiles (
    user_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, updated_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);
// Supports the database created by the previous local prototype.
try { db.exec('ALTER TABLE users ADD COLUMN grade TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE users ADD COLUMN school TEXT'); } catch (_) {}

const TYPES = { '.css':'text/css; charset=utf-8', '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.ico':'image/x-icon' };
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options':'nosniff' });
  // Static files are Buffers. Sending them through JSON.stringify turns the
  // page into {"type":"Buffer","data":[…]} in the browser.
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 250000) { reject(new Error('Payload too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function isText(value, min, max) { return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max; }
function publicUser(row) { return row ? { id:row.id, name:row.name, email:row.email || '', phone:row.phone || '', grade:row.grade || '', school:row.school || '' } : null; }
function hashPassword(password) { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(password, salt, 64).toString('hex'); }
function verifyPassword(password, stored) { const parts = String(stored || '').split(':'); if (parts.length !== 2) return false; const actual = scryptSync(password, parts[0], 64); const expected = Buffer.from(parts[1], 'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected); }
function cookies(req) { return Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim().split('=').map(decodeURIComponent)).filter(x => x.length === 2)); }
function sessionUser(req) {
  const sid = cookies(req).rms_session;
  if (!sid) return null;
  const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>?').get(sid, Date.now());
  return row || null;
}
function createSession(res, userId) {
  const id = randomBytes(32).toString('hex'), now = Date.now(), expires = now + 1000 * 60 * 60 * 24 * 14;
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(id, userId, expires, now);
  res.setHeader('Set-Cookie', `rms_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 14}`);
}
function destroySession(req, res) { const sid = cookies(req).rms_session; if (sid) db.prepare('DELETE FROM sessions WHERE id=?').run(sid); res.setHeader('Set-Cookie', 'rms_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); }
function isLoopback(req) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(req.socket.remoteAddress || ''));
}
function serializeSurvey(row) { return { id: row.id, programId: row.program_id, roundKey: row.round_key, answers: JSON.parse(row.answers_json), ts: row.submitted_at }; }
function serializeReview(row) { return { id: row.id, programId: row.program_id, author: row.author, who: row.who_text || '', stars: row.stars, text: row.body, createdAt: row.created_at }; }
function savedPrograms(userId) {
  return db.prepare('SELECT program_id FROM saved_programs WHERE user_id=? ORDER BY created_at DESC').all(userId).map(row => row.program_id);
}
function matchmakerProfile(userId) {
  const row = db.prepare('SELECT profile_json FROM matchmaker_profiles WHERE user_id=?').get(userId);
  if (!row) return null;
  try { return JSON.parse(row.profile_json); } catch { return null; }
}
function accountData(user) {
  return {
    user: publicUser(user),
    savedPrograms: savedPrograms(user.id),
    matchmaker: matchmakerProfile(user.id),
    reviews: db.prepare('SELECT * FROM reviews WHERE respondent_id=? ORDER BY created_at DESC').all(user.id).map(serializeReview),
  };
}

const matchmakerApi = require('./matchmaker-api').createMatchmakerHandler({
  root:ROOT, readBody:body, send,
  getFeedback:(programId) => {
    const rows=db.prepare("SELECT id, stars, body FROM reviews WHERE program_id=? AND id NOT GLOB 'sample-*' AND id NOT GLOB 'r-seed-*' ORDER BY created_at DESC LIMIT 8").all(programId);
    const count=db.prepare("SELECT COUNT(*) AS n FROM reviews WHERE program_id=? AND id NOT GLOB 'sample-*' AND id NOT GLOB 'r-seed-*'").get(programId).n;
    return {reviewCount:count,reviews:rows.map(row=>({stars:row.stars,text:String(row.body).slice(0,700)}))};
  },
});

async function api(req, res, url) {
  if (await matchmakerApi(req,res,url)) return;
  if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
    const surveys = db.prepare('SELECT * FROM survey_responses ORDER BY submitted_at ASC').all().map(serializeSurvey);
    const reviews = db.prepare('SELECT * FROM reviews ORDER BY created_at DESC').all().map(serializeReview);
    const user = sessionUser(req);
    return send(res, 200, { surveys, reviews, user: publicUser(user), account: user ? accountData(user) : null });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const input = await body(req);
    const email = String(input.email || '').trim().toLowerCase(), phone = String(input.phone || '').trim();
    if (!isText(input.name, 1, 80) || (!email && !phone) || !isText(input.password, 8, 200)) return send(res, 400, { error:'Invalid registration details' });
    const existing = db.prepare('SELECT id FROM users WHERE lower(email)=? OR phone=?').get(email, phone);
    if (existing) return send(res, 409, { error:'Account already exists' });
    const now = Date.now(), id = randomUUID();
    db.prepare('INSERT INTO users (id, name, email, phone, password_hash, grade, school, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, input.name.trim(), email || null, phone || null, hashPassword(input.password), String(input.grade || '').slice(0, 20), String(input.school || '').trim().slice(0, 120), now);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(id); createSession(res, id);
    return send(res, 201, { user:publicUser(user) });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const input = await body(req), contact = String(input.contact || '').trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE lower(email)=? OR phone=?').get(contact, String(input.contact || '').trim());
    if (!user || !verifyPassword(String(input.password || ''), user.password_hash)) return send(res, 401, { error:'Invalid credentials' });
    createSession(res, user.id); return send(res, 200, { user:publicUser(user) });
  }
  /* A visible, loopback-only test profile keeps local UI work unblocked when
     a developer has forgotten a password. It is unavailable in production
     and does not weaken the normal sign-in endpoint. */
  if (req.method === 'POST' && url.pathname === '/api/auth/local-owner') {
    if (process.env.NODE_ENV === 'production' || !isLoopback(req)) return send(res, 404, { error:'Not found' });
    const email = 'local-owner@ratemysummerschool.test';
    let user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!user) {
      const now = Date.now(), id = randomUUID();
      db.prepare('INSERT INTO users (id, name, email, phone, password_hash, grade, school, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, 'Local Site Owner', email, null, hashPassword(randomBytes(24).toString('hex')), '', '', now);
      user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    }
    createSession(res, user.id); return send(res, 200, { user:publicUser(user) });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') { destroySession(req, res); return send(res, 204, ''); }
  if (url.pathname.startsWith('/api/account')) {
    const user = sessionUser(req);
    if (!user) return send(res, 401, { error:'Sign in required' });
    if (req.method === 'GET' && url.pathname === '/api/account') return send(res, 200, accountData(user));
    if (req.method === 'PATCH' && url.pathname === '/api/account') {
      const input = await body(req);
      if (!isText(input.name, 1, 80) || String(input.grade || '').length > 20 || String(input.school || '').length > 120) return send(res, 400, { error:'Invalid account details' });
      const name = input.name.trim(), grade = String(input.grade || '').trim(), school = String(input.school || '').trim();
      db.exec('BEGIN');
      try {
        db.prepare('UPDATE users SET name=?, grade=?, school=? WHERE id=?').run(name, grade, school, user.id);
        db.prepare('UPDATE reviews SET author=? WHERE respondent_id=?').run(name, user.id);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return send(res, 200, { user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) });
    }
    if (req.method === 'POST' && url.pathname === '/api/account/saved') {
      const input = await body(req), programId = String(input.programId || '').trim();
      if (!isText(programId, 1, 120) || typeof input.saved !== 'boolean') return send(res, 400, { error:'Invalid saved program' });
      if (input.saved) db.prepare('INSERT OR IGNORE INTO saved_programs (user_id,program_id,created_at) VALUES (?,?,?)').run(user.id, programId, Date.now());
      else db.prepare('DELETE FROM saved_programs WHERE user_id=? AND program_id=?').run(user.id, programId);
      return send(res, 200, { savedPrograms:savedPrograms(user.id) });
    }
    if (req.method === 'POST' && url.pathname === '/api/account/saved/merge') {
      const input = await body(req);
      if (!Array.isArray(input.programIds) || input.programIds.length > 200) return send(res, 400, { error:'Invalid saved programs' });
      const insert = db.prepare('INSERT OR IGNORE INTO saved_programs (user_id,program_id,created_at) VALUES (?,?,?)');
      input.programIds.forEach(id => { if (isText(id, 1, 120)) insert.run(user.id, id.trim(), Date.now()); });
      return send(res, 200, { savedPrograms:savedPrograms(user.id) });
    }
    if (req.method === 'PUT' && url.pathname === '/api/account/matchmaker') {
      const input = await body(req);
      if (!input || typeof input.state !== 'object' || Array.isArray(input.state) || !input.state.profile) return send(res, 400, { error:'Invalid matchmaker state' });
      const json = JSON.stringify(input.state);
      if (json.length > 120000) return send(res, 413, { error:'Matchmaker state too large' });
      db.prepare('INSERT INTO matchmaker_profiles (user_id,profile_json,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET profile_json=excluded.profile_json,updated_at=excluded.updated_at').run(user.id, json, Date.now());
      return send(res, 200, { ok:true });
    }
    if (req.method === 'DELETE' && url.pathname === '/api/account/matchmaker') {
      db.prepare('DELETE FROM matchmaker_profiles WHERE user_id=?').run(user.id);
      return send(res, 200, { ok:true });
    }
    const reviewMatch = url.pathname.match(/^\/api\/account\/reviews\/([^/]+)$/);
    if (req.method === 'DELETE' && reviewMatch) {
      const deleted = db.prepare('DELETE FROM reviews WHERE id=? AND respondent_id=?').run(decodeURIComponent(reviewMatch[1]), user.id);
      return send(res, deleted.changes ? 200 : 404, deleted.changes ? { ok:true } : { error:'Review not found' });
    }
    if (req.method === 'GET' && url.pathname === '/api/account/export') {
      return send(res, 200, {
        account: publicUser(user), savedPrograms:savedPrograms(user.id), matchmaker:matchmakerProfile(user.id),
        reviews:db.prepare('SELECT * FROM reviews WHERE respondent_id=?').all(user.id).map(serializeReview),
        surveyResponses:db.prepare('SELECT * FROM survey_responses WHERE respondent_id=?').all(user.id).map(serializeSurvey),
      });
    }
    if (req.method === 'DELETE' && url.pathname === '/api/account') {
      const input = await body(req);
      if (input.confirmation !== 'DELETE') return send(res, 400, { error:'Type DELETE to confirm' });
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM survey_responses WHERE respondent_id=?').run(user.id);
        db.prepare('DELETE FROM reviews WHERE respondent_id=?').run(user.id);
        db.prepare('DELETE FROM saved_programs WHERE user_id=?').run(user.id);
        db.prepare('DELETE FROM matchmaker_profiles WHERE user_id=?').run(user.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
        db.prepare('DELETE FROM users WHERE id=?').run(user.id);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      destroySession(req, res);
      return send(res, 200, { ok:true });
    }
    return send(res, 404, { error:'Not found' });
  }
  if (req.method === 'POST' && url.pathname === '/api/surveys') {
    const input = await body(req);
    const user = sessionUser(req);
    if (!user) return send(res, 401, { error:'Sign in required' });
    if (!isText(input.programId, 1, 100) || !/^r[1-4]$/.test(input.roundKey || '') || !input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers)) return send(res, 400, { error:'Invalid survey response' });
    const row = { id: randomUUID(), programId: input.programId.trim(), roundKey: input.roundKey, answers: input.answers, ts: Date.now() };
    db.prepare('INSERT INTO survey_responses (id, program_id, round_key, answers_json, respondent_id, submitted_at) VALUES (?, ?, ?, ?, ?, ?)').run(row.id, row.programId, row.roundKey, JSON.stringify(row.answers), user.id, row.ts);
    return send(res, 201, { survey: row });
  }
  if (req.method === 'POST' && url.pathname === '/api/reviews') {
    const input = await body(req);
    const user = sessionUser(req);
    if (!user) return send(res, 401, { error:'Sign in required' });
    if (!isText(input.programId, 1, 100) || !isText(input.text, 20, 3000) || !Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) return send(res, 400, { error:'Invalid review' });
    const row = { id: randomUUID(), programId: input.programId.trim(), author: user.name, who: String(input.who || '').slice(0, 160), stars: input.stars, text: input.text.trim(), createdAt: Date.now() };
    db.prepare('INSERT INTO reviews (id, program_id, author, who_text, stars, body, respondent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(row.id, row.programId, row.author, row.who, row.stars, row.text, user.id, row.createdAt);
    return send(res, 201, { review: row });
  }
  return send(res, 404, { error:'Not found' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(ROOT, '.' + requested);
    if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    const stat = fs.existsSync(file) && fs.statSync(file);
    if (!stat || !stat.isFile()) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch (error) {
    console.error(error);
    return send(res, 500, { error:'Server error' });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`RateMySummerSchool running at http://localhost:${PORT}`));
