#!/usr/bin/env node
/* Migrate the reviewed catalog facts into bilingual, typed records.
 * Run once against the current spreadsheet-generated catalog; do not infer
 * missing amounts or dates. The generated asset is the site's runtime source.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = { window: {} };
for (const name of ['program-catalog-top100.js', 'official-zh.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js', name), 'utf8'), context, { filename: name });
}
const catalog = context.window.SS_PROGRAM_CATALOG_TOP100;
const translate = context.window.SSOfficialZh.translate;
if (!Array.isArray(catalog) || !catalog.length) throw new Error('The program catalog is empty or unavailable');

const months = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
const monthNumber = word => months[String(word || '').slice(0, 3).toLowerCase()] || null;
const iso = (year, month, day) => year && month && day ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
const matchDates = (text, sectionYear) => {
  const dates = [...String(text).matchAll(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:\s*[–-]\s*(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+)?(\d{1,2}))?(?:,?\s*(20\d{2}))?/gi)];
  const explicitYear = dates.map(m => m[5]).find(Boolean) || String(text).match(/\b(20\d{2})\b/)?.[1] || sectionYear || null;
  return dates.map(m => {
    const year = m[5] || explicitYear;
    const start = iso(year, monthNumber(m[1]), Number(m[2]));
    const end = m[4] ? iso(year, monthNumber(m[3] || m[1]), Number(m[4])) : null;
    return { start, end, yearBasis:m[5] || /\b20\d{2}\b/.test(text) ? 'line' : sectionYear ? 'section' : 'unknown' };
  });
};
const formatTokens = text => {
  const lower = String(text).toLowerCase();
  const result = [];
  if (/\b(residential|boarding|on-campus housing)\b/.test(lower) && !/no (?:on-campus )?(?:residential|housing)/.test(lower)) result.push('residential');
  if (/\b(commuter|day program)\b/.test(lower)) result.push('commuter');
  if (/\b(online|virtual)\b/.test(lower)) result.push('online');
  if (/\bhybrid\b/.test(lower)) result.push('hybrid');
  if (/\b(in-person|on-campus|on campus)\b/.test(lower)) result.push('on_campus');
  return [...new Set(result)];
};
const category = (field, text) => {
  if (field === 'eligibility') {
    if (/\b(age|ages|years old|turn \d+|at least \d+|under \d+)\b/i.test(text)) return 'age';
    if (/\b(grade|graduat|sophomore|junior|senior|high school)\b/i.test(text)) return 'grade';
    if (/\b(citizen|permanent resident|green card|DACA|nationality)\b/i.test(text)) return 'citizenship';
    if (/\b(reside|live in|attend high school in|local|area)\b/i.test(text)) return 'residency';
    if (/\b(english|language)\b/i.test(text)) return 'language';
    if (/\b(prerequisite|preparation|physics|mathematics|algebra|GPA)\b/i.test(text)) return 'prerequisite';
  }
  if (field === 'applicationDeadline') return /\b(open|opens|available)\b/i.test(text) ? 'opening' : /\b(deadline|due|early|regular|late|priority|final)\b/i.test(text) ? 'deadline' : 'note';
  if (field === 'programDates') return /\b(tentative|pending|not published|not posted|vary|unknown)\b/i.test(text) ? 'status' : 'session';
  if (field === 'tuition') return /\$\s*[\d,]+/.test(text) ? 'price' : 'note';
  if (field === 'financialAid') return /\b(no|not|unavailable)\b/i.test(text) ? 'restriction' : 'aid';
  return 'detail';
};
const itemFrom = (field, rawLine, sectionYear) => {
  const bullet = /^\s*[•·▪‣–—-]\s*/.test(rawLine);
  const en = rawLine.replace(/^\s*[•·▪‣–—-]\s*/, '').trim();
  const item = { text: { en, zh: translate(en) }, bullet, kind: category(field, en) };
  if (field === 'applicationDeadline' || field === 'programDates') {
    const dates = matchDates(en, sectionYear);
    if (dates.length) item.dates = dates;
  }
  if (field === 'sessionLength') {
    const matches = [...en.matchAll(/\b(\d+)(?:\s*(?:or|to|[–-])\s*(\d+))?\s*(days?|weeks?|months?)\b/gi)];
    if (matches.length) item.duration = matches.map(m => ({ min: Number(m[1]), max: m[2] ? Number(m[2]) : Number(m[1]), unit: m[3].toLowerCase().replace(/s$/, '') }));
  }
  if (field === 'tuition' || field === 'applicationFee') {
    const amounts = [...en.matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g)].map(m => Number(m[1].replace(/,/g, '')));
    if (amounts.length) item.amountsUSD = amounts;
    const year = en.match(/\b(20\d{2})\b/);
    if (year) item.year = Number(year[1]);
  }
  if (field === 'participationFormat' || field === 'sessionLength' || field === 'tuition' || field === 'programDates') {
    const formats = formatTokens(en);
    if (formats.length) item.formats = formats;
  }
  return item;
};
const fieldFrom = (field, value) => {
  const raw = String(value == null ? '' : value);
  const years = [...new Set([...raw.matchAll(/\b(20\d{2})\b/g)].map(match => match[1]))];
  const sectionYear = years.length === 1 ? years[0] : null;
  const items = raw.split(/\r?\n/).filter(line => line.trim()).map(line => itemFrom(field, line, sectionYear));
  return { status: /^\s*Unknown\s*$/i.test(raw) ? 'unknown' : items.length ? 'known' : 'missing', items };
};

const fields = ['tracksFocus', 'eligibility', 'applicationDeadline', 'selectivity', 'sessionLength', 'tuition', 'applicationFee', 'financialAid', 'programDates', 'academicCredit', 'participationFormat', 'dataCycle'];
const output = {};
for (const program of catalog) {
  const legacy = program.officialInfo || {};
  const record = {
    schemaVersion: 1,
    source: {
      programUrl: legacy.programUrl || program.website || '',
      applicationUrl: legacy.applicationUrl || program.applicationUrl || '',
      sourceUrl: legacy.sourceUrl || program.sourceUrl || '',
      checked: program.source && program.source.checked || null
    },
    fields: {}
  };
  for (const field of fields) record.fields[field] = fieldFrom(field, legacy[field]);
  const credit = record.fields.academicCredit;
  credit.policy = credit.status === 'unknown' ? 'unknown' : /\b(non-credit|no (?:formal )?(?:college|university|course) credit)\b/i.test(legacy.academicCredit || '') ? 'non_credit' : /\b(credit|credits)\b/i.test(legacy.academicCredit || '') ? 'credit' : 'not_stated';
  record.fields.participationFormat.options = [...new Set(record.fields.participationFormat.items.flatMap(item => item.formats || []))];
  output[program.id] = record;
}

// The entries are canonical; the old renderer can reconstruct the exact
// bullet-delimited input until it is migrated to consume typed rows directly.
const hydrate = `\n(function () {\n  const records = window.SS_PROGRAM_OFFICIAL_STRUCTURED;\n  const line = (item, lang) => (item.bullet ? '• ' : '') + item.text[lang];\n  const field = (record, name, lang) => record.fields[name].items.map(item => line(item, lang)).join('\\n');\n  (window.SS_PROGRAM_CATALOG_TOP100 || []).forEach(program => {\n    const record = records[program.id];\n    if (!record) throw new Error('Missing structured official facts for ' + program.id);\n    program.officialStructured = record;\n    const info = {};\n    for (const name of Object.keys(record.fields)) info[name] = field(record, name, 'en');\n    Object.assign(info, record.source);\n    program.officialInfo = info;\n    program.duration = { en:info.sessionLength, zh:field(record, 'sessionLength', 'zh') };\n    program.tuition = { en:info.tuition, zh:field(record, 'tuition', 'zh') };\n    program.deadline = { en:info.applicationDeadline, zh:field(record, 'applicationDeadline', 'zh') };\n  });\n  window.SSStructuredOfficial = {\n    value: (program, name, lang) => program && program.officialStructured ? field(program.officialStructured, name, lang) : null\n  };\n})();\n`;
const asset = '/* Generated by scripts/build_structured_official.js. Edit source data, not this file. */\n' +
  'window.SS_PROGRAM_OFFICIAL_STRUCTURED = ' + JSON.stringify(output) + ';\n' + hydrate;
const destination = path.join(root, 'assets/js/program-official-structured.js');
const chunk = process.argv.find(arg => /^--chunk=\d+$/.test(arg));
if (chunk) {
  const start = Number(chunk.split('=')[1]) * 5;
  console.log(Object.entries(output).slice(start, start + 5).map(([id, record]) => `${JSON.stringify(id)}: ${JSON.stringify(record)}`).join(',\n'));
} else if (process.argv.includes('--write')) {
  fs.writeFileSync(destination, asset);
  console.log(`Wrote ${Object.keys(output).length} structured official records to ${destination}`);
} else {
  console.log(JSON.stringify({ programs:Object.keys(output).length, bytes:Buffer.byteLength(asset), sample:output[catalog[0].id] }, null, 2));
}
