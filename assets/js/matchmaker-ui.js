/* Matchmaker v2: a persistent, bilingual catalogue-planning workspace. */
(function () {
  'use strict';
  const KEY = 'ss.matchmaker.v2';
  const GOALS = { explore:['Explore a new interest','探索新兴趣'], deepen:['Go deeper in a subject','深入一个学科'], project:['Make a project or portfolio','完成项目或作品集'], credit:['Earn college credit','获得大学学分'], campus:['Experience campus life','体验校园生活'], peers:['Meet people who share my interests','结识兴趣相投的同学'] };
  const FORMATS = { residential:['Residential','住宿'], commuter:['Commuter','走读'], online:['Online','线上'] };
  const LABELS = { subjects:['Subjects','学科兴趣'], methods:['Learning methods','学习方式'], goals:['Summer goals','暑期目标'], formats:['Program format','项目形式'], excludedFormats:['Avoided formats','排除的项目形式'], completedGrade:['Grade completed before summer','暑期前完成的年级'], graduationYear:['High school graduation year','高中毕业年份'], budget:['Budget in USD','预算（美元）'], hardBudget:['Strict budget limit','严格预算上限'], aidNeeded:['Financial aid needed','需要经济资助'], availableStart:['Available from','最早可参加日期'], availableEnd:['Available until','最晚结束日期'], dateFlexible:['Flexible dates','日期灵活'], commuteLocations:['Commuting locations','可走读地点'], extraText:['Additional context','补充说明'], eligibilityAnswers:['Eligibility answers','资格补充信息'], sortBy:['Ordering','排序方式'], year:['Summer year','暑期年份'] };
  let lastRouteKey = '', ownerKey = '', saveTimer = null;
  let state, current, sequence = 0, aiEnabled = false, aiChecked = false, aiChecking = false, chatBusy = false;
  function apiURL(path) { var base = String(window.RMS_API_BASE || '').replace(/\/+$/, ''); return base ? base + path : path; }
  function apiOptions(options) { return Object.assign({ credentials: window.RMS_API_BASE ? 'include' : 'same-origin' }, options || {}); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function tr(en, zh) { return current && current.lang === 'zh' ? zh : en; }
  function text(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join(' · ');
    if (typeof value === 'object') return text(value[current.lang] || value.en || value.zh || value.text || value.label || value.value || value.message || value.reason || '');
    return '';
  }
  function safeURL(value) { try { const u = new URL(String(value)); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch (_) { return ''; } }
  function engine() { return window.SSMatchmakerEngine || {}; }
  function defaults() {
    const d = engine().defaults;
    return Object.assign({version:2,year:2027,subjects:[],methods:[],goals:[],formats:[],completedGrade:null,graduationYear:null,budget:null,hardBudget:false,aidNeeded:false,availableStart:'',availableEnd:'',dateFlexible:true,commuteLocations:[],extraText:'',contextByStep:{},eligibilityAnswers:{},sortBy:'fit'}, typeof d === 'function' ? d() : (d || {}));
  }
  function normalize(profile) { return engine().normalizeProfile ? engine().normalizeProfile(profile) : Object.assign(defaults(), profile); }
  function storageKey(options) {
    const user = options && options.db && options.db.currentUser && options.db.currentUser();
    return user ? KEY + '.' + user.id : KEY;
  }
  function save() {
    const user = current && current.db && current.db.currentUser && current.db.currentUser();
    if (!user) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }
    if (!user || !current.db.saveMatchmakerState) return;
    clearTimeout(saveTimer);
    const userId = user.id, snapshot = JSON.parse(JSON.stringify(state));
    saveTimer = setTimeout(() => {
      if (current.db.currentUser()?.id === userId) current.db.saveMatchmakerState(snapshot);
    }, 700);
  }
  function load(options) {
    const key = storageKey(options);
    if (state && ownerKey === key) return;
    clearTimeout(saveTimer);
    ownerKey = key;
    const remote = options.db && options.db.getAccountSnapshot && options.db.getAccountSnapshot()?.matchmaker;
    try { state = remote && remote.profile ? remote : JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { state = null; }
    const migratedLocal = key !== KEY && !remote && !!state?.profile;
    if (key !== KEY) { try { localStorage.removeItem(key); } catch (_) {} }
    if (!state || !state.profile) state = {profile:defaults(),history:[],recognitions:[],lastStep:1,started:false,carried:false,shortlist:[],proposal:null};
    state.profile = normalize(Object.assign(defaults(), state.profile));
    const previousTimingNote = (state.profile.contextByStep || {})[4];
    if (previousTimingNote) {
      if (!state.profile.extraText.includes(previousTimingNote)) state.profile.extraText = [state.profile.extraText,previousTimingNote].filter(Boolean).join('\n');
      delete state.profile.contextByStep[4];
    }
    state.history = Array.isArray(state.history) ? state.history.slice(-60) : [];
    state.recognitions = Array.isArray(state.recognitions) ? state.recognitions : [];
    state.shortlist = Array.isArray(state.shortlist) ? state.shortlist : [];
    if (!state.carried) {
      if (!state.profile.subjects.length) state.profile.subjects = (options.initialSubjects || []).slice();
      if (!state.profile.methods.length) state.profile.methods = (options.initialMethods || []).slice();
      const old = options.legacyProfile;
      if (old && !state.started) {
        const notes = [old.interests, typeof old.goals === 'string' ? old.goals : ''].filter(Boolean).join('\n');
        if (notes) state.profile.extraText = notes;
      }
      state.carried = true;
      state.profile = normalize(state.profile);
      save();
    }
    else if (migratedLocal) save();
  }
  function route() {
    const h = location.hash.replace(/^#\/?/, '').split('/');
    if (h[1] === 'step') return {page:'step',step:Math.min(4,Math.max(1,Number(h[2]) || 1))};
    return {page:h[1] === 'saved' ? 'saved' : h[1] === 'results' ? 'results' : h[1] === 'review' ? 'review' : 'intro'};
  }
  function go(path) { location.hash = '#/matchmaker' + (path ? '/' + path : ''); }
  function button(label, attrs, secondary) { return '<button type="button" class="mm2-button' + (secondary ? ' mm2-button--secondary' : '') + '" ' + (attrs || '') + '>' + esc(label) + '</button>'; }
  function link(label, href, secondary) { return '<a class="mm2-button' + (secondary ? ' mm2-button--secondary' : '') + '" href="' + esc(href) + '">' + esc(label) + '</a>'; }
  function choiceLabel(key, field) { if (field === 'goals' && GOALS[key]) return tr(...GOALS[key]); if ((field === 'formats' || field === 'excludedFormats') && FORMATS[key]) return tr(...FORMATS[key]); return current.lang === 'zh' ? ((window.SS_PROGRAM_DISCOVERY || {}).translations || {})[key] || key : key; }
  function fieldLabel(key) { return LABELS[key] ? tr(...LABELS[key]) : key; }
  function displayValue(key, value) {
    if (Array.isArray(value)) return value.length ? value.map(x => choiceLabel(String(x),key)).join(' · ') : tr('Open to any','不限');
    if (value == null || value === '') return tr('Not specified','未填写');
    if (typeof value === 'boolean') return value ? tr('Yes','是') : tr('No','否');
    if (key === 'budget') return '$' + Number(value).toLocaleString() + ' USD';
    if (key === 'completedGrade') return tr('Grade ','') + value + tr('',' 年级');
    if (key === 'sortBy') return value === 'cost' ? tr('Known starting cost','已知费用起点') : tr('Preference fit','偏好匹配');
    return text(value);
  }
  function changes(before, after) { return Object.keys(LABELS).filter(k => k !== 'extraText' && JSON.stringify(before[k]) !== JSON.stringify(after[k])); }
  function patchProposal(before, result) {
    if (!result) return null;
    const patch = result.profilePatch || result.patch || (result.proposal && (result.proposal.profilePatch || result.proposal.patch));
    const after = normalize(result.profile || result.updatedProfile || (patch ? Object.assign({},before,patch) : before));
    const keys = changes(before,after);
    return keys.length ? {profile:after,keys:keys} : null;
  }
  function applyLocal(message) {
    try { return engine().applyMessage ? engine().applyMessage(state.profile,message,current.programs,current.lang) : null; } catch (_) { return null; }
  }
  function recognizedHTML(proposal) {
    if (!proposal || !proposal.keys || !proposal.keys.length) return '';
    return '<ul>' + proposal.keys.map(k => '<li><strong>' + esc(fieldLabel(k)) + ':</strong> ' + esc(displayValue(k,proposal.profile[k])) + '</li>').join('') + '</ul>';
  }
  function applyProposal() {
    if (!state.proposal) return;
    state.profile = normalize(Object.assign({},state.profile,Object.fromEntries((state.proposal.keys || []).map(k => [k,state.proposal.profile[k]]))));
    state.recognitions.push({source:state.proposal.source || '',keys:state.proposal.keys || [],at:Date.now(),origin:state.proposal.origin || 'text'});
    state.recognitions = state.recognitions.slice(-15);
    state.proposal = null; save(); renderCurrent();
  }
  function stepper(active) {
    const names = [tr('Interests','兴趣'),tr('Experience','体验'),tr('Practicalities','实际条件'),tr('Timing','时间')];
    return '<nav aria-label="' + esc(tr('Matchmaker progress','匹配进度')) + '"><ol class="mm2-stepper">' + names.map((name,i) => '<li class="' + (active === i+1 ? 'is-active' : active > i+1 ? 'is-complete' : '') + '"><a href="#/matchmaker/step/' + (i+1) + '"' + (active === i+1 ? ' aria-current="step"' : '') + '><span>' + (i+1) + '</span>' + esc(name) + '</a></li>').join('') + '</ol></nav>';
  }
  function intro() {
    const hasProfile = state.started || state.profile.subjects.length || state.profile.methods.length;
    const preview = (current.programs || []).find(p => p.discovery) || (current.programs || [])[0];
    return '<main class="mm2-page"><div class="mm2-shell"><section class="mm2-intro"><div><p class="mm2-eyebrow">' + esc(tr('YOUR SUMMER, WITH DIRECTION','让暑期选择更有方向')) + '</p><span class="mm2-badge">' + esc(tr('Catalogue matchmaker · preview','项目目录匹配助手 · 预览')) + '</span><h1 class="mm2-title" tabindex="-1">' + esc(tr('Find a summer that fits you.','找到适合你的那个夏天。')) + '</h1><p class="mm2-lead">' + esc(tr('A few short questions. A thoughtful shortlist. Start with what you want to learn, then check the details that make it possible.','回答几个简短问题，得到一份有依据的项目清单。从想学什么开始，再核对年级、费用和时间。')) + '</p><div class="mm2-actions">' + button(hasProfile ? tr('Continue my match','继续匹配') : tr('Find my summer','开始匹配'),'data-start') + link(tr('Browse all programs','浏览全部项目'),'#/pick',true) + '</div></div><aside class="mm2-preview" aria-label="' + esc(tr('What your shortlist includes','你的清单会包含')) + '"><p class="mm2-kicker">' + esc(tr('A useful starting point','帮你做下一步判断')) + '</p><h2>' + esc(tr('More than a name on a list.','不只给你一个项目名字。')) + '</h2><div class="mm2-preview__card"><span class="mm2-badge">' + esc(tr('Preview of the format','展示样式示例')) + '</span><h3>' + esc(preview ? text(preview.name) : tr('Your summer shortlist','你的暑期项目清单')) + '</h3><p>' + esc(tr('Why it fits your interests','为什么适合你的兴趣')) + '</p><p>' + esc(tr('Cost, dates, eligibility — and what still needs checking','费用、时间、资格，以及仍需核实的信息')) + '</p><p>' + esc(tr('Official sources and real student feedback, when available','官方来源，以及已有的真实学生反馈')) + '</p></div><p class="mm2-footnote">' + esc(tr('Recommendations use this site’s real catalogue. Missing or older facts are flagged. Fit is not an admissions prediction.','推荐来自本站真实项目目录。缺失或旧年份的信息会明确标注；匹配程度不代表录取概率。')) + '</p></aside></section><div class="mm2-grid mm2-intro-features"><div><span class="mm2-kicker">01</span><h3>' + esc(tr('Tell us what matters','告诉我们你在意什么')) + '</h3><p>' + esc(tr('Interests, learning style, budget and timing. Skip anything you do not know yet.','兴趣、学习方式、预算和时间。不确定的内容可以先跳过。')) + '</p></div><div><span class="mm2-kicker">02</span><h3>' + esc(tr('Check your preferences','确认你的偏好')) + '</h3><p>' + esc(tr('Review every preference before building your shortlist. You can change it any time.','生成清单前查看并编辑偏好，之后也能随时调整。')) + '</p></div><div><span class="mm2-kicker">03</span><h3>' + esc(tr('Explore your next steps','继续探索和比较')) + '</h3><p>' + esc(tr('Refine your matches in chat, compare programs and save the ones worth exploring.','通过对话细化结果，比较项目，并保存值得进一步了解的选择。')) + '</p></div></div></div></main>';
  }
  function choices(field, keys) {
    return '<div class="mm2-options">' + keys.map(k => '<button type="button" class="mm2-option' + ((state.profile[field] || []).includes(k) ? ' mm2-option--selected' : '') + '" data-choice="' + esc(field) + '" data-value="' + esc(k) + '" aria-pressed="' + ((state.profile[field] || []).includes(k) ? 'true' : 'false') + '">' + esc(choiceLabel(k,field)) + '</button>').join('') + '</div>';
  }
  function fieldset(title,body,sub) { return '<section class="mm2-question-card"><fieldset class="mm2-fieldset"><legend>' + esc(title) + '</legend>' + (sub ? '<p class="mm2-footnote">' + esc(sub) + '</p>' : '') + body + '</fieldset></section>'; }
  function check(name,label) { return '<label class="mm2-check"><input type="checkbox" name="' + esc(name) + '"' + (state.profile[name] ? ' checked' : '') + '> <span>' + esc(label) + '</span></label>'; }
  function input(name,label,type,extra) { return '<label class="mm2-field"><span>' + esc(label) + '</span><input name="' + esc(name) + '" type="' + (type || 'text') + '" value="' + esc(state.profile[name] == null ? '' : state.profile[name]) + '" ' + (extra || '') + '></label>'; }
  function contextHTML(step) {
    const value = (state.profile.contextByStep || {})[step] || '';
    const proposal = state.proposal && state.proposal.origin === 'step' && state.proposal.step === step ? state.proposal : null;
    const placeholder = step === 2
      ? tr('For example: I would like hands-on research and an online program.','例如：我想参加动手做研究的线上项目。')
      : step === 3
        ? tr('For example: My budget is under $5,000 and I need financial aid.','例如：我的预算不超过 5,000 美元，需要经济资助。')
        : tr('Tell us about an interest or goal you would like to explore.','告诉我们你想探索的兴趣或目标。');
    return `<section class="mm2-question-card mm2-context-card" aria-labelledby="mm2-context-title">
      <h2 id="mm2-context-title">${esc(tr('Tell us more','多说一点'))} <span class="mm2-optional">${esc(tr('Optional','可选'))}</span></h2>
      <label class="mm2-field"><span>${esc(tr('Anything else that matters for this step?','关于这一部分，还有什么想告诉我们？'))}</span>
      <textarea name="stepContext" rows="3" maxlength="3000" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>
      <p class="mm2-footnote">${esc(tr('Your note is saved. Recognizable preferences can be used for matching after you confirm them.','文字会保存为备注。可识别的偏好会在你确认后用于匹配。'))}</p>
      ${button(tr('Recognize preferences','识别偏好'),'data-recognize-step',true)}
      <div id="mm2-recognition" aria-live="polite">${proposal ? '<div class="mm2-proposal"><strong>' + esc(tr('Please confirm these changes','请确认以下修改')) + '</strong>' + recognizedHTML(proposal) + button(tr('Apply these changes','应用这些修改'),'data-apply-proposal') + ' ' + button(tr('Keep as a note','仅保留备注'),'data-dismiss-proposal',true) + '</div>' : ''}</div>
    </section>`;
  }
  function stepPage(step) {
    const p = state.profile;
    const cat = window.SS_PROGRAM_DISCOVERY || {programs:{}};
    const tags = field => Array.from(new Set(Object.values(cat.programs || {}).flatMap(x => x[field] || [])));
    const titles = [tr('What draws you in?','你想探索什么？'),tr('How would you like to learn?','你喜欢怎样的学习体验？'),tr('Let’s make it practical.','让选择更贴近实际。'),tr('When is your summer open?','你暑期的时间安排是？')];
    const subs = [tr('Choose as many as you like. Curiosity is a good place to start.','可以多选。从你的好奇心开始。'),tr('Pick the experiences that sound like you. Keep your options open if you are unsure.','选择吸引你的学习和生活方式。不确定时可以保留更多可能。'),tr('These details help us flag eligibility and costs. Leaving a field blank keeps it open.','这些信息帮助核对资格和费用，留空表示暂不限制。'),tr('A clear window helps check sessions. It is fine if your plans are still taking shape.','有明确时间就能更好地核对期次，计划未定也没关系。')];
    let body = '';
    if (step === 1) {
      body = fieldset(tr('What would you like to study?','你想学什么？'),choices('subjects',tags('subjects')),tr('Select any · Leave blank for all subjects','可多选 · 留空表示不限学科'))
        + fieldset(tr('What would make the summer worthwhile?','什么收获会让这个夏天值得？'),choices('goals',Object.keys(GOALS)));
    }
    if (step === 2) {
      body = fieldset(tr('Which learning methods interest you?','你偏好哪些学习方式？'),choices('methods',tags('methods')),tr('Select any · No preference is also a useful answer','可多选 · 没有偏好也可以'))
        + fieldset(tr('Where would you like to take part?','你想以什么形式参加？'),choices('formats',Object.keys(FORMATS)))
        + `<div id="mm2-commute"${p.formats.includes('commuter') ? '' : ' hidden'}>${fieldset(tr('Where could you commute?','你可以在哪些地点走读？'),'<label class="mm2-field"><span class="mm2-sr-only">' + esc(tr('City, state or region','城市、州或地区')) + '</span><input name="commuteLocations" value="' + esc(p.commuteLocations.join(', ')) + '" placeholder="' + esc(tr('City, state or region — separate with commas','城市、州或地区，用逗号分隔')) + '"></label>',tr('Optional. Travel time and housing availability need your own check.','可选。具体通勤时间和住宿情况需自行核实。'))}</div>`;
    }
    if (step === 3) {
      const grade = '<label class="mm2-field"><span>' + esc(tr('Grade completed by summer ' + p.year,'到 ' + p.year + ' 年暑期已完成的年级')) + '</span><select name="completedGrade"><option value="">' + esc(tr('Not sure / skip','不确定／跳过')) + '</option>' + [7,8,9,10,11,12].map(g => '<option value="' + g + '"' + (Number(p.completedGrade) === g ? ' selected' : '') + '>' + esc(tr('Grade ' + g,g + ' 年级')) + '</option>').join('') + '</select></label>';
      const budgetChoices = '<div class="mm2-options">' + [[null,tr('Not sure yet','还不确定')],[2000,'$2,000'],[5000,'$5,000'],[10000,'$10,000']].map(v => '<button type="button" class="mm2-option' + (p.budget === v[0] ? ' mm2-option--selected' : '') + '" data-budget="' + (v[0] == null ? '' : v[0]) + '" aria-pressed="' + (p.budget === v[0]) + '">' + esc(v[1]) + '</button>').join('') + '</div>';
      body = fieldset(tr('Which summer are you planning for?','你计划参加哪一年的夏校？'),input('year',tr('Summer year','暑期年份'),'number','min="2026" max="2035"'))
        + fieldset(tr('What grade will you have completed?','参加前你将完成哪个年级？'),grade,tr('Use the grade finished before the program starts. Age, residency and other program requirements may still need checking.','填写项目开始前已完成的年级。年龄、居住地及其他项目要求仍可能需要核实。'))
        + fieldset(tr('What is your program budget?','你的项目预算是多少？'),budgetChoices + input('budget',tr('Or enter a maximum in USD','或输入预算上限（美元）'),'number','min="0" step="100" inputmode="numeric" placeholder="' + esc(tr('No budget set','暂不设置预算')) + '"') + check('hardBudget',tr('Only show programs within this budget when cost is known','费用已知时，只显示预算以内的项目')),tr('Tuition may exclude travel, application fees and personal expenses.','学费可能不含交通、申请费及个人开支。'))
        + fieldset(tr('Will you need financial support?','你是否需要经济资助？'),check('aidNeeded',tr('I need financial aid or a scholarship','我需要经济资助或奖学金')),tr('We flag published aid options; an award is not guaranteed.','我们会标注已公布的资助信息；获得资助并无保证。'));
    }
    if (step === 4) {
      body = fieldset(tr('When can you attend?','你可以在什么时间参加？'),'<div class="mm2-grid">' + input('availableStart',tr('I can start on or after','最早可以开始的日期'),'date') + input('availableEnd',tr('I need to finish by','最晚需要结束的日期'),'date') + '</div>' + check('dateFlexible',tr('My dates are flexible / not sure yet','我的时间灵活／尚未确定')),tr('Turn off flexible dates to exclude known sessions outside your window. Missing or older dates remain unconfirmed.','关闭时间灵活选项后，会排除已知不在时间范围内的期次。缺失或旧年份日期仍会标为待核实。'))
        + fieldset(tr('Anything else we should keep in mind?','还有什么需要考虑的？'),'<label class="mm2-field"><span class="mm2-sr-only">' + esc(tr('Additional context','补充说明')) + '</span><textarea name="extraText" rows="3" maxlength="5000" placeholder="' + esc(tr('Accessibility, location preferences, questions to investigate…','无障碍需求、地点偏好、想进一步确认的问题……')) + '">' + esc(p.extraText) + '</textarea></label>',tr('Optional. Saved with your preferences as context; these notes do not automatically filter programs.','可选。随偏好保存为补充说明，不会自动用于筛除项目。'));
    }
    return '<main class="mm2-page"><div class="mm2-shell mm2-shell--form">' + stepper(step) + '<form class="mm2-form" id="mm2-form" novalidate><header class="mm2-question__head"><p class="mm2-eyebrow">' + esc(tr('STEP ' + step + ' OF 4', '第 ' + step + ' 步，共 4 步')) + '</p><h1 class="mm2-title" tabindex="-1">' + esc(titles[step-1]) + '</h1><p class="mm2-lead">' + esc(subs[step-1]) + '</p></header>' + body + (step < 4 ? contextHTML(step) : '') + '<p class="mm2-error" id="mm2-error" role="alert" hidden></p><div class="mm2-bottom">' + link(tr('← Back','← 上一步'),step === 1 ? '#/matchmaker' : '#/matchmaker/step/' + (step-1),true) + '<span class="mm2-footnote">' + esc(tr('Preferences are optional','所有偏好均可跳过')) + '</span><button class="mm2-button" type="submit">' + esc(step === 4 ? tr('Review preferences →','确认偏好 →') : tr('Next →','下一步 →')) + '</button></div></form></div></main>';
  }
  function reviewGroup(step,title,keys) {
    return '<section class="mm2-review-group"><div class="mm2-review-group__head"><h2>' + esc(title) + '</h2><a href="#/matchmaker/step/' + step + '">' + esc(tr('Edit','编辑')) + '</a></div><dl class="mm2-facts">' + keys.map(k => '<div><dt>' + esc(fieldLabel(k)) + '</dt><dd>' + esc(displayValue(k,state.profile[k])) + '</dd></div>').join('') + '</dl>' + ((state.profile.contextByStep || {})[step] ? '<p class="mm2-note"><strong>' + esc(tr('Your note: ','你的备注：')) + '</strong>' + esc(state.profile.contextByStep[step]) + '</p>' : '') + '</section>';
  }
  function reviewPage() {
    return '<main class="mm2-page"><div class="mm2-shell mm2-shell--form">' + stepper(5) + '<header><p class="mm2-eyebrow">' + esc(tr('A MOMENT TO CHECK','最后确认一下')) + '</p><h1 class="mm2-title" tabindex="-1">' + esc(tr('Does this sound like you?','这些偏好符合你的想法吗？')) + '</h1><p class="mm2-lead">' + esc(tr('These are the preferences we will use. Edit any section, or leave it open and explore.','我们将根据以下偏好推荐项目。你可以编辑任何部分，也可以保留开放选项。')) + '</p></header><div class="mm2-review">' + reviewGroup(1,tr('Your interests & goals','兴趣与目标'),['subjects','goals']) + reviewGroup(2,tr('Your learning experience','学习体验'),['methods','formats','excludedFormats','commuteLocations']) + reviewGroup(3,tr('Your practical details','实际条件'),['year','completedGrade','graduationYear','budget','hardBudget','aidNeeded']) + reviewGroup(4,tr('Your availability','时间安排'),['availableStart','availableEnd','dateFlexible','extraText']) + '</div>' + (state.recognitions.length ? '<details class="mm2-more"><summary>' + esc(tr('Preferences recognized from your words','从文字中确认的偏好')) + '</summary>' + state.recognitions.map(r => '<div class="mm2-note"><q>' + esc(r.source) + '</q><p>' + esc((r.keys || []).map(fieldLabel).join(' · ')) + '</p></div>').join('') + '</details>' : '') + (state.proposal ? '<div class="mm2-proposal"><h3>' + esc(tr('You have unconfirmed text preferences','还有尚未确认的文字偏好')) + '</h3>' + recognizedHTML(state.proposal) + button(tr('Apply changes','应用修改'),'data-apply-proposal') + ' ' + button(tr('Keep only my existing choices','保留已有选择'),'data-dismiss-proposal',true) + '</div>' : '') + '<p class="mm2-footnote">' + esc(tr('A catalogue shortlist, not a guarantee of eligibility, affordability or admission. Unconfirmed details will stay visible.','这是一份基于目录的清单，不保证资格、费用或录取结果。待核实事项会在结果中显示。')) + '</p><div class="mm2-bottom">' + link(tr('← Back','← 上一步'),'#/matchmaker/step/4',true) + button(tr('Build my shortlist →','生成我的清单 →'),'data-generate') + '</div></div></main>';
  }
  function rank() {
    try { return engine().rankPrograms ? engine().rankPrograms(current.programs,state.profile,{lang:current.lang,limit:5,nowDate:new Date().toISOString().slice(0,10)}) : {results:[],summary:{notes:[tr('The matching catalogue is not available. Please try again.','匹配目录暂时不可用，请重试。')]}}; }
    catch (_) { return {results:[],error:true,summary:{notes:[tr('We could not read the catalogue. Your preferences are saved.','暂时无法读取目录。你的偏好已保存。')]}}; }
  }
  function realReviews(p) {
    try { return (current.db.getReviews(p.id) || []).filter(r => !r.seed && !r.demo && !r.sample && !/^(?:r-seed-|sample-)/.test(r.id || '')); } catch (_) { return []; }
  }
  function academicCount(p) {
    try { const agg = current.db.getAggregate(p.id); return agg && agg.academic_rating && !agg.academic_rating.demo ? Number(agg.academic_rating.n) || 0 : 0; } catch (_) { return 0; }
  }
  function fact(label,value) { return '<div><dt>' + esc(label) + '</dt><dd>' + esc(text(value) || tr('Not confirmed','待核实')) + '</dd></div>'; }
  function officialValue(value) { return value && typeof value === 'object' ? text(value.value || value.text || value.label || value) : text(value); }
  function card(item,index) {
    const p = item.program;
    if (!p || !p.id) return '';
    const official = item.official || {};
    const reviews = realReviews(p), academicN = academicCount(p);
    const sources = (item.sources || []).filter(s => safeURL(s.url));
    const price = item.price || {};
    const fees = text(price.label) || officialValue(official.tuition) || tr('Not confirmed','待核实');
    const sessions = (item.sessions || []).slice(0,3).map(s => text(s.text) || [s.start,s.end].filter(Boolean).join(' – ')).filter(Boolean).join('; ');
    const dateFact = sessions || officialValue(official.dates);
    const website = safeURL(p.applicationUrl) || safeURL(p.officialInfo && p.officialInfo.applicationUrl) || safeURL(p.website);
    const saved = current.db && current.db.inList ? current.db.inList(p.id) : state.shortlist.includes(p.id);
    const base = '#/program/' + encodeURIComponent(p.id);
    return '<article class="mm2-card"><div class="mm2-card__top"><span class="mm2-card__rank">' + String(index+1).padStart(2,'0') + '</span><div><p class="mm2-card__school">' + esc(text(p.host)) + '</p><h2 class="mm2-card__title"><a href="' + esc(base) + '">' + esc(text(p.name)) + '</a></h2></div><span class="mm2-card__fit">' + esc(text(item.matchLabel) || tr('Worth exploring','值得探索')) + '</span></div><ul class="mm2-reasons">' + (item.reasons || []).slice(0,4).map(r => '<li>' + esc(text(r)) + '</li>').join('') + '</ul><div class="mm2-tags">' + [...(item.matchedSubjects || []).map(x => choiceLabel(x,'subjects')),...(item.matchedMethods || []).slice(0,2).map(x => choiceLabel(x,'methods'))].map(x => '<span class="mm2-tag">' + esc(x) + '</span>').join('') + '</div><dl class="mm2-facts">' + fact(tr('Program cost','项目费用'),fees + '') + fact(tr('Dates in the catalogue','目录中的项目日期'),dateFact) + fact(tr('Format & location','形式与地点'),[officialValue(official.format),text(p.location)].filter(Boolean).join(' · ')) + fact(tr('Eligibility','申请资格'),officialValue(official.eligibility)) + '</dl>' + (item.checks && item.checks.length ? '<div class="mm2-checks"><strong>' + esc(tr('Before you decide','决定前请核实')) + '</strong><ul>' + item.checks.map(c => '<li>' + esc(text(c)) + '</li>').join('') + '</ul></div>' : '') + '<div class="mm2-sources">' + sources.slice(0,5).map(s => '<a href="' + esc(safeURL(s.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(text(s.label) || tr('Official source','官方来源')) + ' ↗</a>' + (s.checked ? '<small>' + esc(tr('Checked ','核对：') + text(s.checked)) + '</small>' : '')).join(' ') + '</div><div class="mm2-card__actions">' + link(tr('Program details','查看项目'),base,true) + button(saved ? tr('Saved ✓','已保存 ✓') : tr('Save','保存'),'data-save="' + esc(p.id) + '" aria-pressed="' + saved + '"',true) + (website ? '<a href="' + esc(website) + '" target="_blank" rel="noopener noreferrer">' + esc(tr('Official site / apply','官网／申请')) + ' ↗</a>' : '') + '</div><div class="mm2-review-links">' + (reviews.length ? '<a href="' + esc(base + '/students') + '">' + esc(tr(reviews.length + ' student review' + (reviews.length === 1 ? '' : 's'),reviews.length + ' 条学生评价')) + ' →</a>' : '<span class="mm2-footnote">' + esc(tr('No submitted student reviews yet','暂无已提交的学生评价')) + '</span>') + ' <a href="' + esc(base + '/academics') + '">' + esc(tr('Academics','学术详情')) + (academicN ? ' · ' + esc(academicN) + ' ' + esc(tr('responses','份反馈')) : '') + ' →</a></div></article>';
  }
  function methodology(result) {
    const weights = result.methodology && result.methodology.weights;
    return '<details class="mm2-methodology"><summary>' + esc(tr('How these matches are ordered','这些匹配如何排序')) + '</summary><p>' + esc(tr('First, known eligibility conflicts and your explicit hard limits are filtered. Then your selected interests, learning methods, goals determine preference fit; format, budget and dates add checks or explicit filters. Missing evidence is flagged. Among equally matched programs, clearer catalogue evidence comes first.','先筛除已知资格冲突和明确不符合硬性条件的项目，再根据学科、学习方式、目标计算偏好匹配；形式、预算和日期用于核对或明确筛选。缺失的信息会明确标注；匹配度相同时，目录资料更完整的项目优先。')) + '</p>' + (weights ? '<p>' + esc(tr('Active preference weights (adjusted when a category is left open):','当前偏好权重（未选择的类别不计入，其他类别按比例调整）：')) + '</p><dl class="mm2-facts">' + Object.entries(weights).filter(([,v]) => v > 0).map(([k,v]) => fact(fieldLabel(k),Math.round(v * 100) + '%')).join('') + '</dl>' : '') + '<p>' + esc(tr('This is personal fit within this catalogue. It is separate from the site’s “Best” rankings. Student ratings, university prestige and acceptance odds do not create a match percentage. Ties use evidence coverage and program name. When interests are open, the shortlist includes varied subjects and methods.','这里展示目录内的个人匹配，与网站“最佳项目”榜单分开。学生评分、学校名气和录取概率不会换算为匹配百分比。同分时参考资料完整度和项目名称。兴趣未定时，清单会涵盖不同学科和学习方式。')) + '</p></details>';
  }
  function savedPage() {
    const ids = current.db && current.db.getList ? current.db.getList() : state.shortlist;
    const programs = current.programs.filter(p => ids.includes(p.id));
    const all = engine().rankPrograms ? engine().rankPrograms(programs,defaults(),{lang:current.lang,limit:100}) : {results:[]};
    return '<main class="mm2-page"><div class="mm2-shell mm2-shell--form"><p class="mm2-eyebrow">' + esc(tr('YOUR SAVED PROGRAMS','已保存的项目')) + '</p><h1 class="mm2-title" tabindex="-1">' + esc(tr('Keep the possibilities close.','把值得探索的可能保存下来。')) + '</h1><p class="mm2-lead">' + esc(tr('Saved in this browser. These cards show catalogue facts with no preference filters.','保存在当前浏览器。这些卡片展示目录信息，未应用你的偏好筛选。')) + '</p><div class="mm2-actions">' + link(tr('← Back to my matches','← 返回匹配结果'),'#/matchmaker/results',true) + '</div><div class="mm2-cards">' + ((all.results || []).length ? (all.results || []).map(card).join('') : '<div class="mm2-empty"><p>' + esc(tr('No saved programs yet. Save a card from your shortlist to find it here.','尚未保存项目。可以在匹配结果中保存感兴趣的项目。')) + '</p></div>') + '</div></div></main>';
  }
  function chatHTML() {
    const status = aiEnabled ? tr('AI planning assistant + catalogue filters','AI 规划助手 + 目录筛选') : tr('Local catalogue assistant','本地目录匹配助手');
    const initial = tr('Your shortlist is ready. Tell me what to change: a subject, learning style, format, budget or availability. I will show which preferences changed.','你的清单已生成。可以告诉我想调整的学科、学习方式、形式、预算或时间，我会说明哪些偏好发生了变化。');
    return '<aside class="mm2-chat" aria-label="' + esc(tr('Refine your shortlist','细化你的清单')) + '"><div class="mm2-chat-head"><p class="mm2-kicker" id="mm2-assistant-status">' + esc(status) + '</p><h2>' + esc(tr('Let’s narrow it down.','一起缩小选择范围。')) + '</h2><p class="mm2-footnote">' + esc(tr('Your program cards stay here while we refine.','调整偏好的同时，项目卡片始终可见。')) + '</p></div><div class="mm2-chat-log" id="mm2-chat-log" role="log" aria-live="polite" aria-label="' + esc(tr('Conversation','对话记录')) + '"><div class="mm2-message mm2-message--assistant">' + esc(initial) + '</div>' + state.history.map(m => '<div class="mm2-message mm2-message--' + (m.role === 'user' ? 'user' : 'assistant') + '"><span class="mm2-message__role">' + esc(m.role === 'user' ? tr('You','你') : tr('Assistant','助手')) + '</span><p>' + esc(text(m.content)) + '</p>' + (m.changes && m.changes.length ? '<ul>' + m.changes.map(x => '<li>' + esc(x && x.key ? fieldLabel(x.key) + ': ' + displayValue(x.key,x.value) : text(x)) + '</li>').join('') + '</ul>' : '') + (m.sources || []).filter(s => safeURL(s.url)).map(s => '<a href="' + esc(safeURL(s.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(text(s.label) || tr('Source','来源')) + ' ↗</a>').join(' ') + '</div>').join('') + '</div>' + (state.proposal && state.proposal.origin === 'chat' ? '<div class="mm2-proposal"><strong>' + esc(tr('Proposed preferences — please confirm','建议的偏好修改，请先确认')) + '</strong>' + recognizedHTML(state.proposal) + button(tr('Apply changes','应用修改'),'data-apply-proposal') + ' ' + button(tr('Dismiss','暂不应用'),'data-dismiss-proposal',true) + '</div>' : '') + '<div class="mm2-chips">' + [tr('Only online programs','只看线上项目'),tr('My budget is $5,000','我的预算是 5000 美元'),tr('I want research','我想做科研')].map(x => '<button type="button" class="mm2-chip" data-chat-suggestion="' + esc(x) + '">' + esc(x) + '</button>').join('') + '</div><form class="mm2-chat-form" id="mm2-chat-form"><label class="mm2-field"><span class="mm2-sr-only">' + esc(tr('Your message','你的消息')) + '</span><textarea name="message" maxlength="3000" rows="2" placeholder="' + esc(tr('What would you like to change?','你想调整什么？')) + '" required>' + esc(state.chatDraft || '') + '</textarea></label><button class="mm2-button" type="submit"' + (chatBusy ? ' disabled' : '') + '>' + esc(chatBusy ? tr('Sending…','发送中…') : tr('Send ↑','发送 ↑')) + '</button></form><p class="mm2-footnote" id="mm2-chat-explainer">' + esc(aiEnabled ? tr('AI helps with planning; program facts come from the sourced cards. Preference changes need your confirmation.','AI 协助规划；项目信息以有来源的卡片为准。AI 建议的偏好需先确认。') : tr('Works locally with recognized preferences. Free-form notes are saved; this mode does not use generative AI.','根据可识别偏好在本地工作。自由文字会保存为备注；此模式未使用生成式 AI。')) + '</p>' + (state.chatError ? '<p class="mm2-error" role="status">' + esc(tr('The AI service is unavailable. Your cards and messages are saved. You can use the local preferences above.','AI 服务暂不可用，卡片和消息均已保留。你仍可使用上方的本地偏好调整。')) + '</p>' + button(tr('Retry last message','重试上一条消息'),'data-retry-chat',true) : '') + '</aside>';
  }
  function resultsPage() {
    const result = rank(); current.result = result;
    const items = (result.results || []).slice(0,5);
    const sum = result.summary || {};
    const criteria = result.appliedCriteria || [];
    return '<main class="mm2-page"><div class="mm2-shell"><header class="mm2-results-head"><div><p class="mm2-eyebrow">' + esc(tr('YOUR SUMMER ' + state.profile.year + ' SHORTLIST',state.profile.year + ' 年 · 你的暑期项目清单')) + '</p><h1 class="mm2-title" tabindex="-1">' + esc(items.length ? tr('A few good places to start.','从这几个项目开始探索。') : tr('Let’s revisit the details.','一起重新看看条件。')) + '</h1><p class="mm2-lead">' + esc(items.length ? tr('Matched to your preferences, with the details and open questions alongside.','根据你的偏好匹配，同时列出实际信息和待核实事项。') : tr('No program currently satisfies the known constraints. Your preferences have been kept exactly as you set them.','目前没有项目符合已知的限制条件。我们已保留你设置的偏好。')) + '</p></div><div class="mm2-actions">' + link(tr('Edit preferences','编辑偏好'),'#/matchmaker/review',true) + link(tr('My saved programs','已保存的项目'),'#/matchmaker/saved',true) + '</div></header><div class="mm2-results-layout mm2-results-layout--cards-only"><section class="mm2-cards" aria-label="' + esc(tr('Recommended programs','推荐项目')) + '"><div class="mm2-results-summary"><span>' + esc(tr('Showing ' + items.length + ' of ' + (sum.totalEligible == null ? (result.results || []).length : sum.totalEligible) + ' candidates', '展示 ' + items.length + ' 个，共 ' + (sum.totalEligible == null ? (result.results || []).length : sum.totalEligible) + ' 个候选项目')) + '</span>' + (sum.considered != null ? '<span class="mm2-footnote">' + esc(tr(sum.considered + ' catalogue entries checked', '已核对 ' + sum.considered + ' 个目录项目')) + '</span>' : '') + '</div>' + (criteria.length ? '<div class="mm2-tags" aria-label="' + esc(tr('Applied preferences','已应用的偏好')) + '">' + criteria.map(c => '<span class="mm2-tag">' + esc(text(c)) + '</span>').join('') + '</div>' : '') + (items.length ? items.map(card).join('') : '<div class="mm2-empty"><h2>' + esc(tr('No matches with these preferences','当前偏好下暂无匹配')) + '</h2><p>' + esc(tr('Known eligibility, strict budget, format or date limits may conflict. Review the reasons below, then choose a change yourself.','已知资格、严格预算、形式或日期限制可能存在冲突。请查看下方原因，再自行决定调整哪项条件。')) + '</p>' + ((result.excluded || []).length ? '<ul>' + Array.from(new Set((result.excluded || []).flatMap(x => x.reasons || x.reason || x.checks || []).map(text))).slice(0,8).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '<div class="mm2-actions">' + link(tr('Review all preferences','检查全部偏好'),'#/matchmaker/review') + (state.profile.hardBudget ? button(tr('Use budget as a preference','将预算改为软性偏好'),'data-relax="budget"',true) : '') + (!state.profile.dateFlexible && (state.profile.availableStart || state.profile.availableEnd) ? button(tr('Make dates flexible','将时间设为灵活'),'data-relax="dates"',true) : '') + (state.profile.formats.length ? button(tr('Consider all formats','考虑所有参与形式'),'data-relax="formats"',true) : '') + '</div></div>') + (sum.notes && sum.notes.length ? '<div class="mm2-note">' + sum.notes.map(n => '<p>' + esc(text(n)) + '</p>').join('') + '</div>' : '') + methodology(result) + '<p class="mm2-footnote">' + esc(tr('Check official program pages for the current admissions cycle before applying. A missing detail is not a confirmed fit.','申请前请在官方页面核对当前申请周期的信息。缺失的信息不代表已确认符合条件。')) + '</p></section></div></div></main>';
  }
  function readForm(step,validate) {
    const form = current.root.querySelector('#mm2-form'); if (!form) return true;
    const p = Object.assign({},state.profile), val = name => { const e = form.elements.namedItem(name); return e ? e.value.trim() : ''; };
    if (step === 2) p.commuteLocations = val('commuteLocations').split(/[,，;；\n]+/).map(x => x.trim()).filter(Boolean);
    if (step === 3) {
      p.completedGrade = val('completedGrade') ? Number(val('completedGrade')) : null;
      p.year = val('year') ? Number(val('year')) : 2027;
      p.graduationYear = val('graduationYear') ? Number(val('graduationYear')) : null;
      p.budget = val('budget') !== '' ? Number(val('budget')) : null;
      p.hardBudget = form.elements.namedItem('hardBudget').checked;
      p.aidNeeded = form.elements.namedItem('aidNeeded').checked;
    }
    if (step === 4) { p.availableStart = val('availableStart'); p.availableEnd = val('availableEnd'); p.dateFlexible = form.elements.namedItem('dateFlexible').checked; p.extraText = val('extraText'); }
    p.contextByStep = Object.assign({},p.contextByStep,{[step]:val('stepContext')});
    let error = '';
    if (step === 3 && p.budget != null && (!Number.isFinite(p.budget) || p.budget < 0)) error = tr('Enter a budget of zero or more, or leave it blank.','请输入零或以上的预算，或留空。');
    if (step === 3 && (!Number.isFinite(p.year) || p.year < 2026 || p.year > 2035)) error = tr('Choose a summer year between 2026 and 2035.','请选择 2026 至 2035 年之间的暑期年份。');
    if (step === 4 && p.availableStart && p.availableEnd && p.availableEnd < p.availableStart) error = tr('Your end date needs to be on or after your start date.','最晚结束日期需等于或晚于开始日期。');
    state.profile = error ? Object.assign({},p,{budget:state.profile.budget,year:state.profile.year}) : normalize(p);
    state.started = true; state.lastStep = step; save();
    if (validate && error) { const el = current.root.querySelector('#mm2-error'); el.textContent = error; el.hidden = false; el.tabIndex = -1; el.focus(); return false; }
    const el = current.root.querySelector('#mm2-error'); if (el && !error) el.hidden = true;
    return !error;
  }
  function addHistory(role,content,extra) { state.history.push(Object.assign({role:role,content:content},extra || {})); state.history = state.history.slice(-60); }
  function localFallback(result) { return result && (result.reply || result.message) || {en:'I saved your note. To change the shortlist, try “only online”, “budget $5,000”, “research”, a subject, or dates. You can edit all preferences above.',zh:'你的备注已保存。可以尝试“只看线上”“预算 5000 美元”“科研”、学科或日期来调整清单，也可以直接编辑上方偏好。'}; }
  function safeAIProposal(data,message) {
    const raw = data.profilePatch || (data.proposal && (data.proposal.profilePatch || data.proposal.patch)) || (data.proposal && typeof data.proposal === 'object' && data.proposal.profile ? data.proposal.profile : null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const allowed = {};
    Object.keys(LABELS).forEach(k => { if (Object.prototype.hasOwnProperty.call(raw,k)) allowed[k] = raw[k]; });
    const proposal = patchProposal(state.profile,{profilePatch:allowed});
    return proposal ? Object.assign(proposal,{source:message,origin:'chat'}) : null;
  }
  async function sendChat(message,retry) {
    if (chatBusy || !message.trim()) return;
    message = message.trim().slice(0,3000); state.chatDraft = ''; state.chatError = false;
    if (!retry) addHistory('user',message);
    const before = state.profile, local = applyLocal(message), proposal = patchProposal(before,local);
    if (proposal) {
      state.profile = proposal.profile;
      state.recognitions.push({source:message,keys:proposal.keys,at:Date.now(),origin:'chat-local'});
      addHistory('assistant',local && (local.reply || local.message) || {en:'Updated your preferences and rebuilt the shortlist.',zh:'已更新偏好并重新生成清单。'},{changes:proposal.keys.map(k => ({key:k,value:proposal.profile[k]}))});
      save(); renderCurrent(); return;
    }
    if (local && !local.unsupported && local.changes && local.changes.length) { state.profile.extraText = local.profile.extraText; addHistory('assistant',local.reply); save(); renderCurrent(); return; }
    if (!aiEnabled || !/^https?:$/.test(location.protocol)) { addHistory('assistant',localFallback(local)); state.profile.extraText = local && local.profile ? local.profile.extraText : [state.profile.extraText,message].filter(Boolean).join('\n').slice(-8000); save(); renderCurrent(); return; }
    if (local && local.profile) state.profile.extraText = local.profile.extraText;
    chatBusy = true; save(); renderCurrent();
    const token = sequence;
    try {
      const response = await fetch(apiURL('/api/matchmaker/chat'),apiOptions({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:message,profile:state.profile,history:state.history.slice(-20).map(m => ({role:m.role,content:typeof m.content === 'string' ? m.content : text(m.content)})),lang:current.lang})}));
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      if (!data || data.enabled !== true || typeof data.reply !== 'string') throw new Error('Unavailable');
      state.proposal = safeAIProposal(data,message);
      addHistory('assistant',data.reply.slice(0,12000),{sources:(data.sources || []).filter(s => s && safeURL(s.url)).slice(0,5)});
    } catch (_) { state.chatError = true; state.retryMessage = message; addHistory('assistant',{en:'The AI service could not answer. Your shortlist is still available. Try a specific preference or use “Edit preferences”.',zh:'AI 服务暂时无法回答。你的清单仍然可用；可以尝试具体的偏好，或点击“编辑偏好”。'}); }
    finally { chatBusy = false; save(); if (sequence === token || route().page === 'results') renderCurrent(); }
  }
  function fieldEnglish(k) { return LABELS[k] ? LABELS[k][0] : k; }
  function fieldChinese(k) { return LABELS[k] ? LABELS[k][1] : k; }
  function bind(routeInfo) {
    const root = current.root;
    root.querySelectorAll('[data-start]').forEach(el => el.addEventListener('click',() => { state.started = true; save(); go('step/' + (state.lastStep || 1)); }));
    root.querySelectorAll('[data-choice]').forEach(el => el.addEventListener('click',() => {
      if (routeInfo.page === 'step') readForm(routeInfo.step,false);
      const field = el.dataset.choice,value = el.dataset.value,values = state.profile[field] || [];
      state.profile[field] = values.includes(value) ? values.filter(x => x !== value) : values.concat(value);
      if (field === 'formats' && state.profile[field].includes(value)) state.profile.excludedFormats = (state.profile.excludedFormats || []).filter(x => x !== value);
      el.classList.toggle('mm2-option--selected'); el.setAttribute('aria-pressed',String(state.profile[field].includes(value)));
      const commute = root.querySelector('#mm2-commute'); if (commute) commute.hidden = !state.profile.formats.includes('commuter');
      state.started = true; save();
    }));
    root.querySelectorAll('[data-budget]').forEach(el => el.addEventListener('click',() => {
      const input = root.querySelector('[name="budget"]'); input.value = el.dataset.budget;
      root.querySelectorAll('[data-budget]').forEach(b => { const active = b === el; b.classList.toggle('mm2-option--selected',active); b.setAttribute('aria-pressed',String(active)); });
      readForm(3,false);
    }));
    const form = root.querySelector('#mm2-form');
    if (form) {
      form.addEventListener('input',() => readForm(routeInfo.step,false)); form.addEventListener('change',() => readForm(routeInfo.step,false));
      form.addEventListener('submit',e => { e.preventDefault(); if (readForm(routeInfo.step,true)) go(routeInfo.step === 4 ? 'review' : 'step/' + (routeInfo.step+1)); });
    }
    root.querySelectorAll('[data-recognize-step]').forEach(el => el.addEventListener('click',() => {
      if (!readForm(routeInfo.step,true)) return;
      const message = (state.profile.contextByStep || {})[routeInfo.step] || '', result = applyLocal(message), proposal = patchProposal(state.profile,result);
      if (proposal) { state.proposal = Object.assign(proposal,{source:message,origin:'step',step:routeInfo.step}); save(); renderCurrent(); }
      else { const area = root.querySelector('#mm2-recognition'); area.textContent = tr('Note saved. I could not identify a specific new preference; use the choices above for exact matching.','备注已保存。未识别出可应用的新偏好；你可以使用上方选项准确设置。'); }
    }));
    root.querySelectorAll('[data-apply-proposal]').forEach(el => el.addEventListener('click',applyProposal));
    root.querySelectorAll('[data-dismiss-proposal]').forEach(el => el.addEventListener('click',() => { state.proposal = null; save(); renderCurrent(); }));
    root.querySelectorAll('[data-generate]').forEach(el => el.addEventListener('click',() => { if (state.profile.availableStart && state.profile.availableEnd && state.profile.availableEnd < state.profile.availableStart) { go('step/4'); return; } state.started = true; state.generated = true; save(); go('results'); }));
    root.querySelectorAll('[data-save]').forEach(el => el.addEventListener('click',() => {
      const id = el.dataset.save;
      let saved;
      if (current.db && current.db.toggleList) saved = current.db.toggleList(id);
      else { saved = !state.shortlist.includes(id); state.shortlist = saved ? state.shortlist.concat(id) : state.shortlist.filter(x => x !== id); }
      el.textContent = saved ? tr('Saved ✓','已保存 ✓') : tr('Save','保存'); el.setAttribute('aria-pressed',String(saved)); save();
    }));
    root.querySelectorAll('[data-relax]').forEach(el => el.addEventListener('click',() => { if (el.dataset.relax === 'budget') state.profile.hardBudget = false; if (el.dataset.relax === 'dates') state.profile.dateFlexible = true; if (el.dataset.relax === 'formats') state.profile.formats = []; save(); renderCurrent(); }));
    const chat = root.querySelector('#mm2-chat-form');
    if (chat) { chat.addEventListener('submit',e => { e.preventDefault(); sendChat(chat.elements.namedItem('message').value); }); chat.elements.namedItem('message').addEventListener('input',e => { state.chatDraft = e.target.value; save(); }); }
    root.querySelectorAll('[data-chat-suggestion]').forEach(el => el.addEventListener('click',() => sendChat(el.dataset.chatSuggestion)));
    root.querySelectorAll('[data-retry-chat]').forEach(el => el.addEventListener('click',() => sendChat(state.retryMessage || '',true)));
    if (routeInfo.page === 'results') { const log = root.querySelector('#mm2-chat-log'); if (log && state.history.length) log.scrollTop = log.scrollHeight; checkAI(); }
  }
  function checkAI() {
    if (aiChecked || aiChecking || typeof fetch !== 'function' || !/^https?:$/.test(location.protocol)) return;
    aiChecking = true;
    fetch(apiURL('/api/matchmaker/status'),apiOptions()).then(r => r.ok ? r.json() : null).then(data => {
      aiEnabled = !!(data && data.enabled === true); aiChecked = true; aiChecking = false;
      if (!current || route().page !== 'results') return;
      const label = current.root.querySelector('#mm2-assistant-status'); if (label) label.textContent = aiEnabled ? tr('AI planning assistant + catalogue filters','AI 规划助手 + 目录筛选') : tr('Local catalogue assistant','本地目录匹配助手');
      const explanation = current.root.querySelector('#mm2-chat-explainer'); if (explanation && aiEnabled) explanation.textContent = tr('AI helps with planning; program facts come from the sourced cards. Preference changes need your confirmation.','AI 协助规划；项目信息以有来源的卡片为准。AI 建议的偏好需先确认。');
    }).catch(() => { aiChecking = false; aiChecked = true; aiEnabled = false; });
  }
  function renderCurrent() { if (current) render(current); }
  function render(options) {
    current = options; sequence++; load(options);
    const r = route();
    options.root.innerHTML = (options.headerHTML || '') + (r.page === 'step' ? stepPage(r.step) : r.page === 'review' ? reviewPage() : r.page === 'results' ? resultsPage() : r.page === 'saved' ? savedPage() : intro()) + (options.footerHTML || '');
    if (options.bindHeaderEvents) options.bindHeaderEvents();
    bind(r);
    const routeKey = location.hash;
    if (routeKey !== lastRouteKey) {
      lastRouteKey = routeKey;
      const heading = options.root.querySelector('.mm2-title');
      if (heading) heading.focus({preventScroll:true});
      window.scrollTo({top:0,behavior:'instant'});
    }
  }
  function clearForUser(userId) {
    clearTimeout(saveTimer);
    try { localStorage.removeItem(KEY + '.' + userId); } catch (_) {}
    if (ownerKey === KEY + '.' + userId) { state = null; ownerKey = ''; }
  }
  window.SSMatchmakerUI = {render:render,clearForUser:clearForUser};
})();
