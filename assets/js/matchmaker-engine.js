/* Local, explainable matching against published catalog facts. No ratings or prestige inputs. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SSMatchmakerEngine = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var FORMATS = ['residential', 'commuter', 'online'];
  var GOALS = ['explore', 'deepen', 'project', 'credit', 'campus', 'peers'];
  var SUBJECTS = {
    'STEM': ['stem', 'science', 'engineering', 'math', 'computer science', 'coding', '理工', '科学', '工程', '数学', '计算机', '编程'],
    'Humanities & Social Sciences': ['humanities', 'social science', 'history', 'philosophy', 'literature', '人文', '社会科学', '历史', '哲学', '文学'],
    'Business & Economics': ['business', 'economics', 'finance', 'entrepreneurship', '商业', '商科', '经济', '金融', '创业'],
    'Arts & Design': ['arts', 'art', 'design', '艺术', '设计', '美术'],
    'Medicine & Health': ['medicine', 'medical', 'health', '医学', '医疗', '健康'],
    'Law & Government': ['law', 'government', 'politics', '法律', '法学', '政治', '公共事务'],
    'Architecture': ['architecture', '建筑'],
    'Journalism & Media': ['journalism', '新闻'],
    'College Preparation': ['college preparation', 'college prep', '大学预备', '升学准备'],
    'Film & Media': ['film', 'cinema', '电影', '影视'],
    'Environmental Studies': ['environment', 'environmental', '环境']
  };
  var METHODS = {
    'Classes & Lectures': ['classes', 'lectures', 'lecture', '课堂', '讲座'],
    'Project-Based Learning': ['project-based', 'project based', 'hands-on project', '项目式', '项目制', '做项目'],
    'Seminars & Workshops': ['seminar', 'workshop', '研讨', '工作坊'],
    'Research': ['research', '科研', '研究'],
    'Labs & Experiments': ['labs', 'laboratory', 'experiments', 'lab work', '实验', '实操'],
    'Case Studies & Simulations': ['case studies', 'case study', 'simulation', '案例', '模拟'],
    'Studio & Performance': ['studio', 'performance', '工作室', '表演'],
    'Mentorship & Advising': ['mentorship', 'mentoring', 'advising', '导师'],
    'Fieldwork & Site Visits': ['fieldwork', 'site visits', '田野', '实地', '参访'],
    'Internships': ['internship', 'internships', '实习']
  };
  var ZH = {
    'STEM': '理工科', 'Humanities & Social Sciences': '人文与社会科学', 'Business & Economics': '商业与经济',
    'Arts & Design': '艺术与设计', 'Medicine & Health': '医学与健康', 'Law & Government': '法律与公共事务',
    'Architecture': '建筑', 'Journalism & Media': '新闻与媒体', 'College Preparation': '大学预备',
    'Film & Media': '影视与媒体', 'Environmental Studies': '环境研究',
    'Classes & Lectures': '课堂与讲座', 'Project-Based Learning': '项目式学习', 'Seminars & Workshops': '研讨与工作坊',
    'Research': '科研', 'Labs & Experiments': '实验与实操', 'Case Studies & Simulations': '案例与模拟',
    'Studio & Performance': '工作室与表演', 'Mentorship & Advising': '导师指导',
    'Fieldwork & Site Visits': '实地考察与参访', 'Internships': '实习',
    residential: '住宿', commuter: '通勤', online: '线上', explore: '探索兴趣', deepen: '深入学习',
    project: '完成项目', credit: '大学学分', campus: '校园体验', peers: '结识同伴'
  };
  function tr(lang, en, zh) { return lang === 'zh' ? zh : en; }
  function label(value, lang) { return lang === 'zh' ? (ZH[value] || value) : value; }
  function localized(value, lang) {
    if (value == null) return '';
    return typeof value === 'object' ? String(value[lang] || value.en || value.zh || '') : String(value);
  }
  function unique(list) { return Array.from(new Set(list)); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function safeStrings(value, max) { return unique(array(value).filter(function (v) { return typeof v === 'string'; }).map(function (v) { return v.trim().slice(0, 150); }).filter(Boolean)).slice(0, max || 30); }
  function number(value, min, max) { if (value === '' || value == null) return null; var n = Number(value); return Number.isFinite(n) && n >= min && n <= max ? n : null; }
  function isDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value; }
  function plainRecord(value) { return value && typeof value === 'object' && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {}; }
  function defaults() {
    return { version: 2, year: 2027, subjects: [], methods: [], goals: [], formats: [], completedGrade: null,
      graduationYear: null, budget: null, hardBudget: false, aidNeeded: false, availableStart: '', availableEnd: '',
      dateFlexible: true, commuteLocations: [], extraText: '', contextByStep: {}, eligibilityAnswers: {}, sortBy: 'fit', excludedFormats: [] };
  }
  function normalizeProfile(input) {
    var p = input && typeof input === 'object' ? input : {}, out = defaults();
    out.year = Math.round(number(p.year, 2020, 2100) || 2027);
    out.subjects = safeStrings(p.subjects); out.methods = safeStrings(p.methods);
    out.goals = safeStrings(p.goals).filter(function (x) { return GOALS.indexOf(x) !== -1; });
    out.formats = safeStrings(p.formats).filter(function (x) { return FORMATS.indexOf(x) !== -1; });
    out.excludedFormats = safeStrings(p.excludedFormats).filter(function (x) { return FORMATS.indexOf(x) !== -1; });
    out.formats = out.formats.filter(function (x) { return out.excludedFormats.indexOf(x) === -1; });
    out.completedGrade = number(p.completedGrade, 1, 12); if (out.completedGrade != null) out.completedGrade = Math.round(out.completedGrade);
    out.graduationYear = number(p.graduationYear, 2020, 2100); if (out.graduationYear != null) out.graduationYear = Math.round(out.graduationYear);
    out.budget = number(p.budget, 0, 10000000); out.hardBudget = p.hardBudget === true; out.aidNeeded = p.aidNeeded === true;
    out.availableStart = isDate(p.availableStart) ? p.availableStart : ''; out.availableEnd = isDate(p.availableEnd) ? p.availableEnd : '';
    out.dateFlexible = p.dateFlexible !== false; out.commuteLocations = safeStrings(p.commuteLocations, 10);
    out.extraText = typeof p.extraText === 'string' ? p.extraText.slice(-6000) : '';
    out.contextByStep = plainRecord(p.contextByStep); out.eligibilityAnswers = plainRecord(p.eligibilityAnswers);
    out.sortBy = ['cost', 'cheapest', 'price', 'budget'].indexOf(p.sortBy) !== -1 ? 'cost' : 'fit';
    return out;
  }
  function items(fields, key) { return array((fields[key] || {}).items); }
  function textOf(fields, key, lang) { return items(fields, key).map(function (i) { return localized(i.text, lang); }).filter(Boolean).join('\n'); }
  function known(fields, key) {
    if (!fields[key] || fields[key].status === 'unknown' || (key === 'academicCredit' && fields[key].policy === 'not_stated')) return false;
    return items(fields, key).some(function (i) { return !/^(?:unknown|not (?:yet )?(?:published|posted|specified|stated|available)|pending|check official)(?:\b|[.!])/i.test(localized(i.text, 'en').trim()); });
  }
  function years(text) { return unique((String(text).match(/\b20\d{2}\b/g) || []).map(Number)); }
  function cycleYear(fields) {
    var text = textOf(fields, 'dataCycle', 'en'), ys = years(text);
    return ys.length === 1 && !/pending|not yet|reference|not posted|not published|tentative/i.test(text) ? ys[0] : null;
  }
  function canonicalFormats(values) { return unique(array(values).filter(function (x) { return FORMATS.indexOf(x) !== -1; })); }
  function formatInfo(fields) {
    var f = fields.participationFormat || {}, all = unique(array(f.options).concat.apply(array(f.options), items(fields, 'participationFormat').map(function (i) { return array(i.formats); })));
    var exact = canonicalFormats(all);
    return { exact: exact, generic: all.some(function (x) { return x === 'on_campus' || x === 'hybrid'; }), known: known(fields, 'participationFormat') && exact.length > 0 };
  }
  function compatible(itemFormats, allowed, info) {
    var exact = canonicalFormats(itemFormats);
    if (!allowed.length) return { match: true, linked: false };
    if (exact.length) return { match: exact.some(function (x) { return allowed.indexOf(x) !== -1; }), linked: true };
    if (array(itemFormats).indexOf('on_campus') !== -1) return { match: allowed.some(function (x) { return x !== 'online'; }), linked: false };
    if (info.exact.length === 1 && !info.generic) return { match: allowed.indexOf(info.exact[0]) !== -1, linked: true };
    return { match: true, linked: false };
  }
  function dollar(n) { return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function priceInfo(fields, profile, info, allowed, lang) {
    var raw = items(fields, 'tuition'), monetaryYears = unique(raw.filter(function (i) { return array(i.amountsUSD).length; }).flatMap(function (i) { return i.year ? [Number(i.year)] : years(localized(i.text, 'en')); }));
    var fallbackYear = monetaryYears.length === 1 ? monetaryYears[0] : cycleYear(fields);
    var candidates = [], ambiguity = false, incomplete = false, population = false, unknownAlternative = false;
    raw.forEach(function (i) {
      var en = localized(i.text, 'en'), nums = array(i.amountsUSD).filter(function (n) { return Number.isFinite(n) && n >= 0; });
      var y = Number(i.year) || (years(en).length === 1 ? years(en)[0] : fallbackYear);
      var link = compatible(i.formats, allowed, info);
      if (!link.match) return;
      if (y !== profile.year) { if (nums.length || /tuition|fee|cost|price|free|funded/i.test(en)) { incomplete = true; unknownAlternative = true; } return; }
      if (/not (?:yet )?(?:posted|published|available)|pending|varies|vary|check|income|assets|threshold/i.test(en)) { incomplete = true; unknownAlternative = true; return; }
      if (/stipend|scholarship|deposit|credited toward|enrollment|registration|security|per (?:unit|point|credit)|additional|plus fees/i.test(en)) { incomplete = true; return; }
      if (/domestic|international/i.test(en)) { population = true; incomplete = true; return; }
      if (!nums.length && /no (?:program )?tuition|no cost to|free of charge|tuition.free|fully funded|tuition.*paid by/i.test(en)) nums = [0];
      if (!nums.length) return;
      var exact = canonicalFormats(i.formats), value = null;
      if (exact.length > 1 && nums.length > 1) { ambiguity = true; incomplete = true; return; }
      if (/\+|\bplus\b/.test(en) && !/=/.test(en)) { incomplete = true; return; }
      if (/=/.test(en)) value = nums[nums.length - 1]; else value = Math.min.apply(Math, nums);
      if (nums.length > 1 || /per course|per session|per .*week|estimate|tuition only|tuition per/i.test(en)) incomplete = true;
      candidates.push({ amount: value, year: y, formats: exact.length ? exact : (info.exact.length === 1 ? info.exact.slice() : []), text: localized(i.text, lang), linked: link.linked });
    });
    candidates.sort(function (a, b) { return a.amount - b.amount; });
    var best = candidates[0];
    return { amount: best ? best.amount : null, year: best ? best.year : null, formats: best ? best.formats : [],
      label: best ? tr(lang, 'From ' + dollar(best.amount) + ' · ' + best.year + ' listed tuition/program fee', '已公布学费／项目费 ' + dollar(best.amount) + ' 起 · ' + best.year + ' 年') : tr(lang, profile.year + ' compatible-format price unconfirmed', profile.year + ' 年所选形式的费用待确认'),
      raw: best ? best.text : textOf(fields, 'tuition', lang), complete: !!best && !incomplete && !ambiguity && !population,
      formatLinked: !!best && best.linked, sessionLinked: false, ambiguity: ambiguity, populationSpecific: population,
      hardExcludable: !!best && !ambiguity && !population && !unknownAlternative && candidates.every(function (x) { return x.amount > profile.budget; }) };
  }
  function sessionInfo(fields, profile, info, allowed, lang) {
    var all = [], unknownApplicable = false, uncertain = false;
    items(fields, 'programDates').forEach(function (i) {
      var relation = compatible(i.formats, allowed, info); if (!relation.match) return;
      var text = localized(i.text, lang), en = localized(i.text, 'en');
      var tentative = /tentative|pending|conflict|may change|not (?:yet )?(?:posted|published)|to be announced/i.test(en);
      if (tentative) uncertain = true;
      if (!array(i.dates).length && /session|date|week|program/i.test(en)) unknownApplicable = true;
      var full = array(i.dates).filter(function (d) { return isDate(d.start) && isDate(d.end); });
      if (!full.length) unknownApplicable = true;
      full.forEach(function (d) {
        if (+d.start.slice(0, 4) !== profile.year || +d.end.slice(0, 4) !== profile.year) return;
        all.push({ start: d.start, end: d.end, text: text, formats: canonicalFormats(i.formats), formatLinked: relation.linked, tentative: tentative });
      });
    });
    var validWindow = !(profile.availableStart && profile.availableEnd && profile.availableStart > profile.availableEnd);
    var fit = all.filter(function (s) { return validWindow && (!profile.availableStart || s.start >= profile.availableStart) && (!profile.availableEnd || s.end <= profile.availableEnd); });
    return { all: all, fit: fit, unknown: !all.length || unknownApplicable, uncertain: uncertain, validWindow: validWindow,
      hasWindow: !!(profile.availableStart || profile.availableEnd), fullyLinked: all.length > 0 && all.every(function (s) { return s.formatLinked; }) };
  }
  function gradeNumbers(text) {
    var s = text.toLowerCase().replace(/freshm[ae]n/g, '9').replace(/sophomores?/g, '10').replace(/juniors?/g, '11').replace(/seniors?/g, '12');
    s = s.replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/g, '$1');
    var found = [];
    var range = /\b(\d{1,2})\s*[–—-]\s*(\d{1,2})\b/g, match;
    while ((match = range.exec(s))) { var a = +match[1], b = +match[2]; if (a >= 1 && b <= 12 && a <= b) for (var k = a; k <= b; k++) found.push(k); }
    (s.match(/\b(?:[1-9]|1[0-2])\b/g) || []).forEach(function (x) { found.push(+x); });
    return unique(found).sort(function (a, b) { return a - b; });
  }
  function gradeInfo(fields, p, lang) {
    var checks = [], failures = [], matched = false, parsed = false, cy = cycleYear(fields);
    var inconsistent = p.completedGrade != null && p.graduationYear != null && (p.year + 12 - p.completedGrade !== p.graduationYear);
    if (inconsistent) checks.push(tr(lang, 'Completed grade and graduation year may use different school calendars; confirm both.', '已完成年级与毕业年份可能采用不同学制，请核对。'));
    items(fields, 'eligibility').forEach(function (i) {
      var en = localized(i.text, 'en'), local = localized(i.text, lang), absoluteYears = years(en);
      if (/graduat|class of/i.test(en) && absoluteYears.length && !/age|turn|before|after/i.test(en)) {
        parsed = true;
        if (p.graduationYear == null || inconsistent) checks.push(tr(lang, 'Confirm graduation-year requirement: ', '确认毕业年份要求：') + local);
        else if (absoluteYears.indexOf(p.graduationYear) === -1) failures.push(tr(lang, 'Graduation year does not match: ', '毕业年份不符合：') + local);
        else matched = true;
        return;
      }
      if (!/grade|freshm|sophomore|junior|senior|three years of high school|one year of high school/i.test(en)) return;
      if (/english|does not specify|course.specific|case.by.case|may be|most admitted/i.test(en)) { checks.push(local); return; }
      var mode = /rising|entering.*(?:year|grade)/i.test(en) ? 'rising' : /complet/i.test(en) ? 'completed' : /current|apply during|apply as|at application|when applying|in fall/i.test(en) ? 'current' : '';
      var relevant = mode === 'rising' ? en.slice(en.search(/rising|entering/i)) : en;
      var nums = gradeNumbers(relevant);
      if (/completed.*three years of high school/i.test(en)) { nums = [11]; mode = 'completed'; }
      if (/completed at least one year of high school.*not yet completed senior/i.test(en)) { nums = [9, 10, 11]; mode = 'completed'; }
      var yearLinked = cy === p.year || absoluteYears.indexOf(p.year) !== -1 || (/fall/i.test(en) && absoluteYears.indexOf(p.year - 1) !== -1);
      if (!nums.length || !mode || !yearLinked || inconsistent || /not eligible/i.test(en)) { checks.push(tr(lang, 'Confirm grade wording for ' + p.year + ': ', '确认 ' + p.year + ' 年年级定义：') + local); return; }
      parsed = true;
      if (p.completedGrade == null) { checks.push(local); return; }
      var expected = mode === 'rising' ? p.completedGrade + 1 : p.completedGrade;
      var accepts = /or above|at least grade/i.test(en) ? expected >= Math.min.apply(Math, nums) : nums.indexOf(expected) !== -1;
      if (!accepts) failures.push(tr(lang, 'Completed grade does not match the published rule: ', '已完成年级不符合公布要求：') + local);
      else matched = true;
    });
    return { matched: matched, parsed: parsed, failures: failures, checks: unique(checks), inconsistent: inconsistent };
  }
  function goalMatches(program, fields, info, p) {
    var methods = array((program.discovery || {}).methods), subjects = array((program.discovery || {}).subjects), matches = [];
    p.goals.forEach(function (g) {
      if (g === 'explore' && subjects.length >= 3) matches.push(g);
      if (g === 'deepen' && methods.some(function (m) { return /Research|Labs|Seminars|Mentorship/.test(m); })) matches.push(g);
      if (g === 'project' && methods.some(function (m) { return /Project|Research|Labs|Studio/.test(m); })) matches.push(g);
      if (g === 'credit' && (fields.academicCredit || {}).policy === 'credit') matches.push(g);
      if (g === 'campus' && info.exact.some(function (f) { return f === 'residential' || f === 'commuter'; })) matches.push(g);
      // A residential option alone is not evidence of a particular social experience.
    });
    return matches;
  }
  function rankPrograms(programs, input, options) {
    var p = normalizeProfile(input), opts = options || {}, lang = opts.lang === 'zh' ? 'zh' : 'en', limit = Math.max(1, Math.min(100, Math.floor(Number(opts.limit) || 5)));
    var list = array(programs), results = [], excluded = [], active = { subjects: p.subjects.length > 0, methods: p.methods.length > 0, goals: p.goals.length > 0 };
    var base = { subjects: 0.45, methods: 0.30, goals: 0.25 }, denom = Object.keys(base).reduce(function (sum, k) { return sum + (active[k] ? base[k] : 0); }, 0), weights = {};
    Object.keys(base).forEach(function (k) { weights[k] = denom && active[k] ? base[k] / denom : 0; });
    list.forEach(function (program) {
      var fields = (program.officialStructured || {}).fields || {}, source = (program.officialStructured || {}).source || {}, info = formatInfo(fields);
      var allowed = (p.formats.length ? p.formats : FORMATS).filter(function (f) { return p.excludedFormats.indexOf(f) === -1; });
      var reasons = [], checks = [], failures = [], matchedSubjects = array((program.discovery || {}).subjects).filter(function (s) { return p.subjects.indexOf(s) !== -1; }), matchedMethods = array((program.discovery || {}).methods).filter(function (m) { return p.methods.indexOf(m) !== -1; });
      var offered = info.exact.filter(function (f) { return allowed.indexOf(f) !== -1; });
      if ((p.formats.length || p.excludedFormats.length) && info.known && !offered.length && !info.generic) failures.push(tr(lang, 'Published participation formats do not match your choices.', '公布的参加形式不符合你的选择。'));
      if (!info.known || ((p.formats.length || p.excludedFormats.length) && !offered.length && info.generic)) checks.push(tr(lang, 'Confirm availability of your preferred participation format.', '确认项目是否提供你所选的参加形式。'));
      if (p.formats.length && offered.length) reasons.push(tr(lang, 'Published format: ', '公布的参加形式：') + offered.map(function (x) { return label(x, lang); }).join(' / '));
      var dates = sessionInfo(fields, p, info, allowed, lang), price = priceInfo(fields, p, info, allowed, lang), grade = gradeInfo(fields, p, lang);
      failures = failures.concat(grade.failures); checks = checks.concat(grade.checks);
      if (!dates.validWindow) checks.push(tr(lang, 'Your availability end is before its start; correct the dates.', '可参加结束日期早于开始日期，请修正。'));
      if (!dates.all.length) checks.push(tr(lang, 'Complete ' + p.year + ' sessions for the selected format are unconfirmed; earlier-year dates are not reused.', '所选形式的 ' + p.year + ' 年完整期次待确认；未套用往年日期。'));
      else if (dates.hasWindow && !dates.fit.length) {
        if (!p.dateFlexible && !dates.unknown && !dates.uncertain && dates.fullyLinked && dates.validWindow) failures.push(tr(lang, 'No complete published session fits your availability.', '没有完整的已公布期次符合你的可参加日期。'));
        else checks.push(tr(lang, 'No confirmed full session fits these dates; verify alternatives or adjust flexible dates.', '暂无已确认完整期次符合这些日期，请核实其他期次或调整弹性日期。'));
      } else if (dates.hasWindow && dates.fit.length) reasons.push(dates.fullyLinked ? tr(lang, 'At least one listed full session fits your availability.', '至少一个公布的完整期次符合你的可参加日期。') : tr(lang, 'A listed session falls within your dates; its participation format needs confirmation.', '有公布期次落在你的日期范围内；其对应参加形式仍待确认。'));
      if (dates.uncertain) checks.push(tr(lang, 'Official dates are tentative, pending, or conflicting; confirm before planning travel.', '官方日期有暂定、待审批或冲突信息，请确认后再安排行程。'));
      if (dates.all.length && !dates.fullyLinked) checks.push(tr(lang, 'Session-to-format linkage is not explicit; confirm the exact option.', '期次与参加形式的对应关系未明确，请核实具体选项。'));
      if (price.amount == null) checks.push(tr(lang, 'No unambiguous ' + p.year + ' fee for the compatible format; this is not a zero-cost quote.', '缺少所选形式明确的 ' + p.year + ' 年费用信息；不代表免费。'));
      else {
        if (!price.complete) checks.push(tr(lang, 'The displayed fee is a listed starting option; confirm all required fees and the selected duration.', '显示费用为已公布起始选项，请核实所选时长及全部必付费用。'));
        if (!price.formatLinked) checks.push(tr(lang, 'Fee-to-format linkage is unconfirmed.', '费用与参加形式的对应关系待确认。'));
        if (dates.all.length) checks.push(tr(lang, 'Confirm that the listed fee applies to your exact session; travel and other charges may be additional.', '确认公布费用适用于你的具体期次；交通及其他费用可能另计。'));
        if (p.budget != null && price.amount <= p.budget) reasons.push(tr(lang, 'A listed tuition/program-fee starting point is within your budget; total cost needs confirmation.', '公布学费／项目费起点在预算内；总费用仍需确认。'));
        if (p.budget != null && price.amount > p.budget) {
          if (p.hardBudget && price.hardExcludable && price.formatLinked) failures.push(tr(lang, 'Known compatible-format ' + p.year + ' fee exceeds your hard budget.', '已知所选形式的 ' + p.year + ' 年费用超过硬性预算。'));
          else checks.push(tr(lang, 'Listed starting fee exceeds your budget; final applicable cost still needs confirmation.', '公布费用起点超过预算；最终适用费用仍需确认。'));
        }
      }
      if (price.ambiguity) checks.push(tr(lang, 'Several prices and formats share one line; they have not been paired automatically.', '同一条目包含多个价格和参加形式，系统未自动配对。'));
      if (price.populationSpecific) checks.push(tr(lang, 'Domestic/international prices differ; confirm which fee schedule applies.', '本国／国际学生费用不同，请确认适用费用表。'));
      if (p.aidNeeded) checks.push(tr(lang, 'Financial aid is not subtracted from cost. Confirm eligibility, award size, and deadlines: ', '费用未扣除资助。请确认资助资格、金额及截止日期：') + (textOf(fields, 'financialAid', lang) || tr(lang, 'Not published.', '未公布。')));
      if (p.commuteLocations.length && offered.indexOf('commuter') !== -1) checks.push(tr(lang, 'Check your commute from ' + p.commuteLocations.join(', ') + ' to ' + localized(program.location, lang) + '.', '请核实从' + p.commuteLocations.join('、') + '至' + localized(program.location, lang) + '的通勤。'));
      if (matchedSubjects.length) reasons.push(tr(lang, 'Subject match: ', '学科匹配：') + matchedSubjects.map(function (x) { return label(x, lang); }).join(' / '));
      if (matchedMethods.length) reasons.push(tr(lang, 'Learning method match: ', '学习方式匹配：') + matchedMethods.map(function (x) { return label(x, lang); }).join(' / '));
      var matchedGoals = goalMatches(program, fields, info, p);
      if (matchedGoals.length) reasons.push(tr(lang, 'Related to your goals: ', '与目标相关：') + matchedGoals.map(function (x) { return label(x, lang); }).join(' / '));
      if (p.goals.indexOf('credit') !== -1 && (fields.academicCredit || {}).policy !== 'credit') checks.push(tr(lang, 'College credit is not confirmed for this option: ', '此选项尚未确认提供大学学分：') + (textOf(fields, 'academicCredit', lang) || tr(lang, 'Unknown.', '未知。')));
      var officialEligibility = textOf(fields, 'eligibility', lang);
      checks.push(tr(lang, 'Eligibility requires official confirmation (age, citizenship/residency, prerequisites and other rules may apply): ', '申请资格须由官方确认（可能涉及年龄、国籍／居住地、先修课及其他要求）：') + (officialEligibility || tr(lang, 'Not published.', '未公布。')));
      if (failures.length) { excluded.push({ programId: program.id, name: localized(program.name, lang), reasons: unique(failures) }); return; }
      var score = weights.subjects * (p.subjects.length ? matchedSubjects.length / p.subjects.length : 0) + weights.methods * (p.methods.length ? matchedMethods.length / p.methods.length : 0) + weights.goals * (p.goals.length ? matchedGoals.length / p.goals.length : 0);
      var coverage = { eligibility: known(fields, 'eligibility'), format: info.known, currentYearDates: dates.all.length > 0 && !dates.uncertain,
        currentYearPrice: price.amount != null, credit: known(fields, 'academicCredit'), financialAid: known(fields, 'financialAid'), gradeRuleMatched: grade.matched,
        formatSessionLinked: dates.fullyLinked, feeSessionLinked: false, dateFit: dates.hasWindow && dates.fullyLinked && !dates.uncertain ? !!dates.fit.length : null };
      coverage.knownCount = ['eligibility', 'format', 'currentYearDates', 'currentYearPrice', 'credit', 'financialAid'].filter(function (k) { return coverage[k]; }).length;
      coverage.requiresConfirmation = true;
      var urls = [{ label: tr(lang, 'Official facts source', '官方资料来源'), url: source.sourceUrl || program.sourceUrl }, { label: tr(lang, 'Official program', '项目官网'), url: source.programUrl || program.website }, { label: tr(lang, 'Application', '申请页面'), url: source.applicationUrl || program.applicationUrl }];
      var seen = new Set(), sources = urls.filter(function (s) { if (!/^https?:\/\//i.test(s.url || '') || seen.has(s.url)) return false; seen.add(s.url); return true; }).map(function (s) { return { label: s.label, url: s.url, checked: source.checked || (program.source || {}).checked || '' }; });
      if (!reasons.length) reasons.push(tr(lang, 'An option to explore; choose interests to personalize the order.', '可供探索的选项；选择兴趣后可进一步排序。'));
      var matchLabel = !denom ? tr(lang, 'Explore this option', '探索此选项') : score >= 0.75 ? tr(lang, 'Strong preference match', '偏好匹配较高') : score > 0 ? tr(lang, 'Some preferences match', '部分偏好匹配') : tr(lang, 'Broader alternative', '拓展选项');
      results.push({ program: program, score: score, matchLabel: matchLabel, reasons: unique(reasons), checks: unique(checks), sources: sources,
        eligibilityStatus: grade.matched ? 'grade_matches' : known(fields, 'eligibility') ? 'needs_confirmation' : 'unknown', price: price,
        sessions: (dates.hasWindow && dates.fit.length ? dates.fit : dates.all), matchedSubjects: matchedSubjects, matchedMethods: matchedMethods,
        official: { eligibility: officialEligibility, tuition: textOf(fields, 'tuition', lang), dates: textOf(fields, 'programDates', lang), credit: textOf(fields, 'academicCredit', lang), format: textOf(fields, 'participationFormat', lang), deadline: textOf(fields, 'applicationDeadline', lang), financialAid: textOf(fields, 'financialAid', lang) }, coverage: coverage });
    });
    results.sort(function (a, b) {
      if (p.sortBy === 'cost') { var ac = a.price.amount == null ? Infinity : a.price.amount, bc = b.price.amount == null ? Infinity : b.price.amount; if (ac !== bc) return ac - bc; }
      return b.score - a.score || b.coverage.knownCount - a.coverage.knownCount || localized(a.program.name, lang).localeCompare(localized(b.program.name, lang), lang === 'zh' ? 'zh' : 'en');
    });
    var count = results.length, unknownCount = results.filter(function (r) { return !r.coverage.currentYearDates || !r.coverage.currentYearPrice || !r.coverage.eligibility || !r.coverage.format; }).length;
    if (!p.subjects.length && !p.methods.length && p.sortBy !== 'cost' && results.length > 1) {
      var pool = results.slice(), slate = [], covered = new Set();
      while (pool.length && slate.length < limit) {
        var bestAt = 0, bestValue = -Infinity;
        pool.forEach(function (r, index) {
          var tags = array((r.program.discovery || {}).subjects).map(function (x) { return 's:' + x; }).concat(array((r.program.discovery || {}).methods).map(function (x) { return 'm:' + x; }));
          var novelty = tags.filter(function (t) { return !covered.has(t); }).length / Math.sqrt(Math.max(tags.length, 1));
          var value = r.score * 5 + novelty + r.coverage.knownCount * 0.02;
          if (value > bestValue) { bestValue = value; bestAt = index; }
        });
        var selected = pool.splice(bestAt, 1)[0]; slate.push(selected);
        array((selected.program.discovery || {}).subjects).forEach(function (x) { covered.add('s:' + x); });
        array((selected.program.discovery || {}).methods).forEach(function (x) { covered.add('m:' + x); });
      }
      results = slate.concat(pool);
    }
    var appliedCriteria = [tr(lang, 'Program year: ', '项目年份：') + p.year];
    if (p.formats.length) appliedCriteria.push(tr(lang, 'Formats: ', '参加形式：') + p.formats.map(function (x) { return label(x, lang); }).join(' / '));
    if (p.excludedFormats.length) appliedCriteria.push(tr(lang, 'Avoid formats: ', '排除形式：') + p.excludedFormats.map(function (x) { return label(x, lang); }).join(' / '));
    if (p.budget != null) appliedCriteria.push(tr(lang, (p.hardBudget ? 'Hard' : 'Preferred') + ' budget: ', (p.hardBudget ? '硬性' : '期望') + '预算：') + dollar(p.budget));
    if (p.availableStart || p.availableEnd) appliedCriteria.push(tr(lang, 'Availability: ', '可参加日期：') + (p.availableStart || '…') + ' — ' + (p.availableEnd || '…') + tr(lang, p.dateFlexible ? ' (flexible)' : ' (fixed)', p.dateFlexible ? '（可调整）' : '（固定）'));
    if (p.completedGrade != null) appliedCriteria.push(tr(lang, 'Completed grade before program: ', '项目前已完成年级：') + p.completedGrade);
    if (p.graduationYear != null) appliedCriteria.push(tr(lang, 'Graduation year: ', '高中毕业年份：') + p.graduationYear);
    var notes = [tr(lang, 'Unknown facts remain candidates and require confirmation; no result guarantees eligibility or admission.', '未知信息会保留为待确认候选；结果不保证申请资格或录取。'), tr(lang, 'Only explicit subject, method and goal preferences affect fit. Ratings, acceptance estimates and school prestige are not used.', '匹配只使用明确的学科、学习方式和目标偏好，不使用评分、估算录取率或学校名气。'), tr(lang, 'Published tuition/program fees are not a complete travel budget; aid is never assumed.', '已公布学费／项目费不等于完整出行预算；系统不预设获得资助。')];
    if (!p.subjects.length && !p.methods.length && p.sortBy !== 'cost') notes.push(tr(lang, 'With interests undecided, the shortlist includes varied subjects and learning methods.', '尚未确定兴趣时，候选名单会涵盖不同学科和学习方式。'));
    return { results: results.slice(0, limit), excluded: excluded, summary: { considered: list.length, totalEligible: count, excludedCount: excluded.length, unknownCount: unknownCount, notes: notes }, appliedCriteria: appliedCriteria,
      methodology: { weights: weights, engine: 'local-rules-v2', evaluatedAt: isDate(opts.nowDate) ? opts.nowDate : '', explanation: tr(lang, 'Published constraints first, then stated preferences; data coverage and program name break ties. Eligibility remains subject to official review.', '先检查已公布的限制，再按明确偏好排序；同分时参考资料完整度和项目名称。申请资格最终由官方审核。') } };
  }
  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function mentions(text, aliases) {
    var found = [];
    aliases.forEach(function (alias) {
      var re = new RegExp(/[\u3400-\u9fff]/.test(alias) ? escapeRegex(alias) : '\\b' + escapeRegex(alias) + '(?:s)?\\b', 'ig'), m;
      while ((m = re.exec(text))) found.push({ at: m.index, alias: alias, end: re.lastIndex });
    });
    return found;
  }
  function isNegative(text, at) {
    var before = text.slice(Math.max(0, at - 65), at).split(/[,.!?;，。！？；]|\bbut\b|\bhowever\b|但是|但|而是/i).pop();
    return /(?:\b(?:no|not|without|avoid|exclude|except|rather than|don't|do not)\s*(?:(?:want|prefer|interested in|looking for|consider|any|the|in|an?)\s+){0,3}|(?:不(?:想|要|考虑|喜欢|需要|选|希望)?(?:参加|学习|读|住|有)?|排除|除了|非)(?:任何|的|纯)?\s*)$/i.test(before) && !/not only|不仅/i.test(before);
  }
  function messageDateWindow(text, year) {
    var iso = text.match(/\b20\d{2}-\d{2}-\d{2}\b/g);
    if (iso && iso.length >= 2) return iso.slice(0, 2);
    var monthNames = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    var dateYear = (text.match(/\b20\d{2}\b/) || [String(year)])[0], dates = [], hit;
    var english = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?/ig;
    while ((hit = english.exec(text))) dates.push(dateYear + '-' + String(monthNames[hit[1].slice(0, 3).toLowerCase()]).padStart(2, '0') + '-' + hit[2].padStart(2, '0'));
    if (dates.length >= 2) return dates.slice(0, 2);
    var chinese = /(\d{1,2})月\s*(\d{1,2})[日号]?/g;
    while ((hit = chinese.exec(text))) dates.push(dateYear + '-' + hit[1].padStart(2, '0') + '-' + hit[2].padStart(2, '0'));
    return dates.length >= 2 ? dates.slice(0, 2) : [];
  }
  function applyMessage(input, message, programs, lang) {
    lang = lang === 'zh' ? 'zh' : 'en'; var p = normalizeProfile(input), text = String(message || '').trim().slice(0, 3000), before = JSON.stringify(p), changes = [], understood = false;
    if (!text) return { profile: p, changed: false, changes: [], reply: tr(lang, 'Describe a budget, subject, learning method, format, or date range.', '可以描述预算、学科、学习方式、参加形式或日期范围。'), unsupported: true };
    function change(en, zh) { changes.push(tr(lang, en, zh)); understood = true; }
    if (/cheaper|cheapest|lower.cost|more affordable|便宜|更低.*费|价格从低|低价/i.test(text) && !/not cheaper|不要.*便宜/i.test(text)) { p.sortBy = 'cost'; change('Sort by known current-year starting fees; unknown fees come last.', '按已知当年费用起点排序，未知费用排在后面。'); }
    if (/no budget limit|unlimited budget|budget.*(?:flexible|no limit)|预算不限|没有预算限制|不限预算/i.test(text)) { p.budget = null; p.hardBudget = false; change('Removed the budget limit.', '已取消预算限制。'); }
    else if (!/人民币|\brmb\b|\bcny\b|[¥￥]|\beur\b|€/i.test(text)) {
      var money = text.match(/(?:\$|USD\s*|budget\s*(?:of|is|:|=)?\s*|预算(?:是|为|[:：])?\s*|(?:under|below|less than|up to|at most)\s*\$?)\s*(\d[\d,]*(?:\.\d+)?)\s*([kK]|千|万)?/i) || text.match(/(\d[\d,]*(?:\.\d+)?)\s*([kK]|千|万)?\s*(?:美元|美金|USD)/i);
      if (money && !isNegative(text, money.index)) { var amount = Number(money[1].replace(/,/g, '')) * (money[2] && /k|千/i.test(money[2]) ? 1000 : money[2] === '万' ? 10000 : 1); if (Number.isFinite(amount) && amount <= 10000000) { p.budget = amount; p.hardBudget = /under|below|less than|up to|at most|hard|no more than|不能超过|不超过|以内|上限|最多/i.test(text); change('Set USD budget to ' + dollar(amount) + (p.hardBudget ? ' (hard limit on confirmed fees).' : ' (preference).'), '美元预算设为 ' + dollar(amount) + (p.hardBudget ? '（对已确认费用设硬性上限）。' : '（偏好）。')); } }
    }
    [['subjects', SUBJECTS], ['methods', METHODS]].forEach(function (pair) {
      Object.keys(pair[1]).forEach(function (canonical) {
        var hits = mentions(text, [canonical].concat(pair[1][canonical])); if (!hits.length) return;
        var hit = hits.sort(function (a, b) { return a.at - b.at; })[0], negative = isNegative(text, hit.at);
        if (negative) { p[pair[0]] = p[pair[0]].filter(function (x) { return x !== canonical; }); change('Removed ' + canonical + ' as a preference; this does not exclude programs that also offer it.', '已移除“' + label(canonical, lang) + '”偏好；不会因此排除同时开设该领域的项目。'); }
        else { p[pair[0]] = unique(p[pair[0]].concat(canonical)); change('Added preference: ' + canonical + '.', '已添加偏好：' + label(canonical, lang) + '。'); }
      });
    });
    var formatAliases = { residential: ['residential', 'boarding', '住宿', '住校'], commuter: ['commuter', 'commuting', '通勤', '走读'], online: ['online', 'virtual', 'remote learning', '线上', '在线', '网课'] };
    Object.keys(formatAliases).forEach(function (f) {
      var hits = mentions(text, formatAliases[f]); if (!hits.length) return; var neg = isNegative(text, hits[0].at);
      if (neg) { p.formats = p.formats.filter(function (x) { return x !== f; }); p.excludedFormats = unique(p.excludedFormats.concat(f)); change('Avoid format: ' + f + '; ambiguous format records still need confirmation.', '排除参加形式：' + label(f, lang) + '；形式不明确的记录仍需核实。'); }
      else { p.formats = unique(p.formats.concat(f)); p.excludedFormats = p.excludedFormats.filter(function (x) { return x !== f; }); change('Added format: ' + f + '.', '已添加参加形式：' + label(f, lang) + '。'); }
    });
    if (/\bonly\b|只要|只看|仅限|只考虑/i.test(text)) { var explicit = FORMATS.filter(function (f) { return mentions(text, formatAliases[f]).some(function (h) { return !isNegative(text, h.at); }); }); if (explicit.length) { p.formats = explicit; change('Restricted preferred formats to the ones explicitly named.', '参加形式限定为本条消息明确提到的选项。'); } }
    var credit = mentions(text, ['college credit', 'academic credit', '学分']);
    if (credit.length) { if (isNegative(text, credit[0].at)) p.goals = p.goals.filter(function (x) { return x !== 'credit'; }); else p.goals = unique(p.goals.concat('credit')); change('Updated the college-credit preference; credit transfer still needs school approval.', '已更新大学学分偏好；学分转认仍需学校批准。'); }
    if (/need (?:financial )?aid|financial aid|scholarship|需要资助|奖学金|助学金/i.test(text) && !/don't need|do not need|no (?:financial )?aid|不需要.*(?:资助|奖学金)/i.test(text)) { p.aidNeeded = true; change('Flagged financial-aid needs; no award is assumed.', '已标记资助需求，未预设获得任何资助。'); }
    var iso = messageDateWindow(text, p.year);
    if (iso.length >= 2 && isDate(iso[0]) && isDate(iso[1]) && iso[0] <= iso[1] && /available|attend|between|from|to|through|日期|参加|有空|从|至|到|—|–/i.test(text)) { p.availableStart = iso[0]; p.availableEnd = iso[1]; p.year = +iso[0].slice(0, 4); p.dateFlexible = /flexible|可调整|灵活|弹性/i.test(text); change('Set the full-session availability window to ' + iso[0] + ' — ' + iso[1] + '.', '完整期次的可参加日期设为 ' + iso[0] + ' — ' + iso[1] + '。'); }
    var graduation = text.match(/(?:graduat(?:e|ing|ion)(?:\s+(?:year|in|is))?|class of|毕业(?:年份|年)?(?:是|为|于)?)[\s:：]*(20\d{2})/i);
    if (graduation) { p.graduationYear = +graduation[1]; change('Saved graduation year ' + p.graduationYear + '; other eligibility rules remain unverified.', '已保存毕业年份 ' + p.graduationYear + '；其他申请要求仍待核实。'); }
    var completed = text.match(/(?:completed|finished|完成(?:了)?|已读完)\s*(?:grade\s*)?(\d{1,2})(?:th|st|nd|rd|年级)?/i);
    if (completed && +completed[1] >= 1 && +completed[1] <= 12) { p.completedGrade = +completed[1]; change('Saved grade completed before the program: ' + p.completedGrade + '.', '已保存项目前完成年级：' + p.completedGrade + '。'); }
    var compare = /compare|comparison|对比|比较/i.test(text);
    p.extraText = (p.extraText ? p.extraText + '\n' : '') + text;
    p = normalizeProfile(p);
    var unsupported = !understood || /人民币|\brmb\b|\bcny\b|[¥￥]|\beur\b|€|guarantee|admission chance|acceptance chance|am I eligible|保证|包录|录取概率|能否录取|符合.*资格/i.test(text);
    var reply = changes.join(' ');
    if (compare) reply += (reply ? ' ' : '') + tr(lang, 'Use the Compare action on result cards to place programs side by side.', '可使用结果卡片上的“对比”操作，将项目并排查看。');
    if (!understood && !compare) reply = tr(lang, 'Saved your note. This assistant uses local rules, so nuanced requests are not automatically interpreted. Use the profile controls for precise changes; I cannot confirm admission eligibility.', '已保留你的说明。此助手使用本地规则，无法自动理解复杂要求；请使用资料选项进行精确调整，申请资格仍须官方确认。');
    else if (unsupported) reply += ' ' + tr(lang, 'The additional nuance is saved for review; currency conversion and eligibility guarantees are not inferred.', '补充说明已保留，系统不会自动换算货币或推断申请资格保证。');
    return { profile: p, changed: JSON.stringify(p) !== before, changes: unique(changes), reply: reply, unsupported: unsupported };
  }
  return { defaults: defaults, normalizeProfile: normalizeProfile, rankPrograms: rankPrograms, applyMessage: applyMessage };
});
