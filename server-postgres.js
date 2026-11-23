/*
 * Production API for RateMySummerSchool.
 *
 * This server uses Postgres (Supabase in production) instead of the local
 * SQLite file used by server.js. It intentionally keeps the same API so the
 * static GitHub Pages client can use it through RMS_API_BASE.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const { Pool } = require('pg');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required for the hosted API.');
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGIN || 'https://thedoctor7783.github.io')
  .split(',').map(value => value.trim()).filter(Boolean);
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const TYPES = { '.css':'text/css; charset=utf-8', '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.ico':'image/x-icon' };
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
}
function applyCors(req, res) {
  const origin = String(req.headers.origin || '');
  if (!ALLOWED_ORIGINS.includes(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Vary', 'Origin');
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
function sameSiteCookie() { return 'SameSite=None; Secure'; }
function serializeSurvey(row) { return { id: row.id, programId: row.program_id, roundKey: row.round_key, answers: JSON.parse(row.answers_json), ts: Number(row.submitted_at), verified: row.is_verified === true }; }
function serializeReview(row) { return { id: row.id, programId: row.program_id, author: row.author, who: row.who_text || '', stars: row.stars, text: row.body, createdAt: Number(row.created_at), verified: row.is_verified === true, foundingContributor: row.founding_contributor === true }; }

async function query(text, values = []) { return pool.query(text, values); }
async function one(text, values = []) { return (await query(text, values)).rows[0] || null; }
async function many(text, values = []) { return (await query(text, values)).rows; }
async function sessionUser(req) {
  const sid = cookies(req).rms_session;
  if (!sid) return null;
  return one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>$2', [sid, Date.now()]);
}
async function createSession(res, userId) {
  const id = randomBytes(32).toString('hex'), now = Date.now(), expires = now + 1000 * 60 * 60 * 24 * 14;
  await query('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ($1,$2,$3,$4)', [id, userId, expires, now]);
  res.setHeader('Set-Cookie', `rms_session=${id}; HttpOnly; ${sameSiteCookie()}; Path=/; Max-Age=${60 * 60 * 24 * 14}`);
}
async function destroySession(req, res) {
  const sid = cookies(req).rms_session;
  if (sid) await query('DELETE FROM sessions WHERE id=$1', [sid]);
  res.setHeader('Set-Cookie', `rms_session=; HttpOnly; ${sameSiteCookie()}; Path=/; Max-Age=0`);
}
async function savedPrograms(userId) { return (await many('SELECT program_id FROM saved_programs WHERE user_id=$1 ORDER BY created_at DESC', [userId])).map(row => row.program_id); }
async function matchmakerProfile(userId) {
  const row = await one('SELECT profile_json FROM matchmaker_profiles WHERE user_id=$1', [userId]);
  if (!row) return null;
  try { return JSON.parse(row.profile_json); } catch { return null; }
}
async function accountData(user) {
  return {
    user: publicUser(user),
    savedPrograms: await savedPrograms(user.id),
    matchmaker: await matchmakerProfile(user.id),
    reviews: (await many('SELECT * FROM reviews WHERE respondent_id=$1 ORDER BY created_at DESC', [user.id])).map(serializeReview),
  };
}

const matchmakerApi = require('./matchmaker-api').createMatchmakerHandler({
  root: ROOT, readBody: body, send,
  getFeedback: async programId => {
    const [rows, count] = await Promise.all([
      many("SELECT id, stars, body FROM reviews WHERE program_id=$1 AND id NOT LIKE 'sample-%' AND id NOT LIKE 'r-seed-%' ORDER BY created_at DESC LIMIT 8", [programId]),
      one("SELECT COUNT(*)::int AS n FROM reviews WHERE program_id=$1 AND id NOT LIKE 'sample-%' AND id NOT LIKE 'r-seed-%'", [programId]),
    ]);
    return { reviewCount: count?.n || 0, reviews: rows.map(row => ({ stars: row.stars, text: String(row.body).slice(0,700) })) };
  },
});

async function api(req, res, url) {
  if (await matchmakerApi(req,res,url)) return;
  if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
    const [surveyRows, reviewRows, user] = await Promise.all([
      many('SELECT * FROM survey_responses ORDER BY submitted_at ASC'),
      many('SELECT * FROM reviews ORDER BY created_at DESC'),
      sessionUser(req),
    ]);
    return send(res, 200, { surveys: surveyRows.map(serializeSurvey), reviews: reviewRows.map(serializeReview), user: publicUser(user), account: user ? await accountData(user) : null });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const input = await body(req);
    const email = String(input.email || '').trim().toLowerCase(), phone = String(input.phone || '').trim();
    if (!isText(input.name, 1, 80) || (!email && !phone) || !isText(input.password, 8, 200)) return send(res, 400, { error:'Invalid registration details' });
    const existing = await one('SELECT id FROM users WHERE lower(COALESCE(email, \'\'))=$1 OR phone=$2', [email, phone]);
    if (existing) return send(res, 409, { error:'Account already exists' });
    const now = Date.now(), id = randomUUID();
    await query('INSERT INTO users (id,name,email,phone,password_hash,grade,school,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, input.name.trim(), email || null, phone || null, hashPassword(input.password), String(input.grade || '').slice(0,20), String(input.school || '').trim().slice(0,120), now]);
    const user = await one('SELECT * FROM users WHERE id=$1', [id]); await createSession(res,id);
    return send(res, 201, { user: publicUser(user) });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const input = await body(req), contact = String(input.contact || '').trim();
    const user = await one('SELECT * FROM users WHERE lower(COALESCE(email, \'\'))=$1 OR phone=$2', [contact.toLowerCase(), contact]);
    if (!user || !verifyPassword(String(input.password || ''), user.password_hash)) return send(res, 401, { error:'Invalid credentials' });
    await createSession(res,user.id); return send(res, 200, { user:publicUser(user) });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') { await destroySession(req,res); return send(res,204,''); }
  if (url.pathname.startsWith('/api/account')) {
    const user = await sessionUser(req);
    if (!user) return send(res,401,{error:'Sign in required'});
    if (req.method === 'GET' && url.pathname === '/api/account') return send(res,200,await accountData(user));
    if (req.method === 'PATCH' && url.pathname === '/api/account') {
      const input = await body(req);
      if (!isText(input.name,1,80) || String(input.grade || '').length > 20 || String(input.school || '').length > 120) return send(res,400,{error:'Invalid account details'});
      const name=input.name.trim(), grade=String(input.grade || '').trim(), school=String(input.school || '').trim();
      await query('UPDATE users SET name=$1, grade=$2, school=$3 WHERE id=$4',[name,grade,school,user.id]);
      await query('UPDATE reviews SET author=$1 WHERE respondent_id=$2',[name,user.id]);
      return send(res,200,{user:publicUser(await one('SELECT * FROM users WHERE id=$1',[user.id]))});
    }
    if (req.method === 'POST' && url.pathname === '/api/account/saved') {
      const input=await body(req), programId=String(input.programId || '').trim();
      if (!isText(programId,1,120) || typeof input.saved !== 'boolean') return send(res,400,{error:'Invalid saved program'});
      if (input.saved) await query('INSERT INTO saved_programs (user_id,program_id,created_at) VALUES ($1,$2,$3) ON CONFLICT (user_id,program_id) DO NOTHING',[user.id,programId,Date.now()]);
      else await query('DELETE FROM saved_programs WHERE user_id=$1 AND program_id=$2',[user.id,programId]);
      return send(res,200,{savedPrograms:await savedPrograms(user.id)});
    }
    if (req.method === 'POST' && url.pathname === '/api/account/saved/merge') {
      const input=await body(req);
      if (!Array.isArray(input.programIds) || input.programIds.length > 200) return send(res,400,{error:'Invalid saved programs'});
      for (const id of input.programIds) if (isText(id,1,120)) await query('INSERT INTO saved_programs (user_id,program_id,created_at) VALUES ($1,$2,$3) ON CONFLICT (user_id,program_id) DO NOTHING',[user.id,id.trim(),Date.now()]);
      return send(res,200,{savedPrograms:await savedPrograms(user.id)});
    }
    if (req.method === 'PUT' && url.pathname === '/api/account/matchmaker') {
      const input=await body(req);
      if (!input || typeof input.state !== 'object' || Array.isArray(input.state) || !input.state.profile) return send(res,400,{error:'Invalid matchmaker state'});
      const json=JSON.stringify(input.state); if (json.length > 120000) return send(res,413,{error:'Matchmaker state too large'});
      await query('INSERT INTO matchmaker_profiles (user_id,profile_json,updated_at) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET profile_json=EXCLUDED.profile_json,updated_at=EXCLUDED.updated_at',[user.id,json,Date.now()]);
      return send(res,200,{ok:true});
    }
    if (req.method === 'DELETE' && url.pathname === '/api/account/matchmaker') { await query('DELETE FROM matchmaker_profiles WHERE user_id=$1',[user.id]); return send(res,200,{ok:true}); }
    const reviewMatch=url.pathname.match(/^\/api\/account\/reviews\/([^/]+)$/);
    if (req.method === 'DELETE' && reviewMatch) { const result=await query('DELETE FROM reviews WHERE id=$1 AND respondent_id=$2',[decodeURIComponent(reviewMatch[1]),user.id]); return send(res,result.rowCount ? 200 : 404,result.rowCount ? {ok:true}:{error:'Review not found'}); }
    if (req.method === 'GET' && url.pathname === '/api/account/export') return send(res,200,{account:publicUser(user),savedPrograms:await savedPrograms(user.id),matchmaker:await matchmakerProfile(user.id),reviews:(await many('SELECT * FROM reviews WHERE respondent_id=$1',[user.id])).map(serializeReview),surveyResponses:(await many('SELECT * FROM survey_responses WHERE respondent_id=$1',[user.id])).map(serializeSurvey)});
    if (req.method === 'DELETE' && url.pathname === '/api/account') {
      const input=await body(req); if (input.confirmation !== 'DELETE') return send(res,400,{error:'Type DELETE to confirm'});
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM survey_responses WHERE respondent_id=$1',[user.id]);
        await client.query('DELETE FROM reviews WHERE respondent_id=$1',[user.id]);
        await client.query('DELETE FROM saved_programs WHERE user_id=$1',[user.id]);
        await client.query('DELETE FROM matchmaker_profiles WHERE user_id=$1',[user.id]);
        await client.query('DELETE FROM sessions WHERE user_id=$1',[user.id]);
        await client.query('DELETE FROM users WHERE id=$1',[user.id]);
        await client.query('COMMIT');
      } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      await destroySession(req,res); return send(res,200,{ok:true});
    }
    return send(res,404,{error:'Not found'});
  }
  if (req.method === 'POST' && url.pathname === '/api/surveys') {
    const input=await body(req), user=await sessionUser(req);
    if (!user) return send(res,401,{error:'Sign in required'});
    if (!isText(input.programId,1,100) || !/^r[1-4]$/.test(input.roundKey || '') || !input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers)) return send(res,400,{error:'Invalid survey response'});
    const row={id:randomUUID(),programId:input.programId.trim(),roundKey:input.roundKey,answers:input.answers,ts:Date.now(),verified:true};
    await query('INSERT INTO survey_responses (id,program_id,round_key,answers_json,respondent_id,submitted_at,is_verified) VALUES ($1,$2,$3,$4,$5,$6,$7)',[row.id,row.programId,row.roundKey,JSON.stringify(row.answers),user.id,row.ts,true]);
    return send(res,201,{survey:row});
  }
  if (req.method === 'POST' && url.pathname === '/api/reviews') {
    const input=await body(req), user=await sessionUser(req);
    if (!user) return send(res,401,{error:'Sign in required'});
    if (!isText(input.programId,1,100) || !isText(input.text,20,3000) || !Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) return send(res,400,{error:'Invalid review'});
    const row={id:randomUUID(),programId:input.programId.trim(),author:user.name,who:String(input.who || '').slice(0,160),stars:input.stars,text:input.text.trim(),createdAt:Date.now(),verified:true,foundingContributor:input.foundingContributor === true};
    await query('INSERT INTO reviews (id,program_id,author,who_text,stars,body,respondent_id,created_at,is_verified,founding_contributor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[row.id,row.programId,row.author,row.who,row.stars,row.text,user.id,row.createdAt,true,row.foundingContributor]);
    return send(res,201,{review:row});
  }
  return send(res,404,{error:'Not found'});
}

async function schema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT UNIQUE, password_hash TEXT NOT NULL, grade TEXT, school TEXT, created_at BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS survey_responses (id TEXT PRIMARY KEY, program_id TEXT NOT NULL, round_key TEXT NOT NULL, answers_json TEXT NOT NULL, respondent_id TEXT, submitted_at BIGINT NOT NULL, is_verified BOOLEAN NOT NULL DEFAULT false);
    CREATE INDEX IF NOT EXISTS idx_surveys_program ON survey_responses(program_id);
    CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, program_id TEXT NOT NULL, author TEXT NOT NULL, who_text TEXT, stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5), body TEXT NOT NULL, respondent_id TEXT, created_at BIGINT NOT NULL, is_verified BOOLEAN NOT NULL DEFAULT false, founding_contributor BOOLEAN NOT NULL DEFAULT false);
    CREATE INDEX IF NOT EXISTS idx_reviews_program ON reviews(program_id);
    CREATE TABLE IF NOT EXISTS saved_programs (user_id TEXT NOT NULL, program_id TEXT NOT NULL, created_at BIGINT NOT NULL, PRIMARY KEY (user_id,program_id), FOREIGN KEY(user_id) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS matchmaker_profiles (user_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, updated_at BIGINT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
  `);
  await query('ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false');
  await query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false');
  await query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS founding_contributor BOOLEAN NOT NULL DEFAULT false');
}

schema().then(() => http.createServer(async (req,res) => {
  const url=new URL(req.url,`http://${req.headers.host || 'localhost'}`);
  try {
    applyCors(req,res);
    if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) { res.writeHead(204); return res.end(); }
    if (url.pathname === '/health') return send(res,200,{ok:true,service:'ratemysummerschool-api'});
    if (url.pathname.startsWith('/api/')) return await api(req,res,url);
    const requested=url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file=path.resolve(ROOT,'.'+requested);
    if (!file.startsWith(ROOT+path.sep)) return send(res,403,'Forbidden','text/plain; charset=utf-8');
    const stat=fs.existsSync(file) && fs.statSync(file);
    if (!stat || !stat.isFile()) return send(res,404,'Not found','text/plain; charset=utf-8');
    return send(res,200,fs.readFileSync(file),TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch(error) { console.error(error); return send(res,500,{error:'Server error'}); }
}).listen(PORT,'0.0.0.0',() => console.log(`RateMySummerSchool production API listening on ${PORT}`))).catch(error => { console.error('Database initialization failed',error); process.exit(1); });
