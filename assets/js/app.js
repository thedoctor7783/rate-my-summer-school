/* =========================================================================
 * app.js  —  sunmark SPA: routing, views, questionnaire logic
 * Depends on i18n.js + data.js (loaded first).
 * ======================================================================= */
(function () {
  // Boot-time safety net: surface any runtime error instead of a blank page.
  // (Wrapping in an IIFE also keeps this file's top-level consts from colliding
  //  with the globals declared in data.js / i18n.js, which would otherwise
  //  throw a cross-script "Identifier already declared" SyntaxError.)
  function showFatal(msg) {
    var a = document.getElementById('app');
    if (!a) return;
    var box = '<div style="max-width:720px;margin:64px auto 0;padding:24px 26px;' +
      'border:1.5px solid #b85a3e;border-radius:14px;background:#fff;' +
      'box-shadow:0 6px 20px rgba(16,43,34,.08);font-family:sans-serif">' +
      '<div style="color:#b85a3e;font-weight:700;font-size:18px;margin-bottom:8px">' +
      '⚠ 出错了 / Something went wrong</div>' +
      '<div style="color:#333;white-space:pre-wrap;font-size:14px">' +
      String(msg || '') + '</div></div>';
    a.innerHTML = box + a.innerHTML;
  }
  window.addEventListener('error', function (e) {
    showFatal((e.error && e.error.stack) || e.message);
  });
  window.addEventListener('unhandledrejection', function (e) {
    showFatal((e.reason && e.reason.stack) || e.reason);
  });

const { SURVEY_CONTEXT = [], SURVEY_CONTEXT_BY_PROGRAM = {}, QUESTIONNAIRE, PROGRAMS, RANKINGS, PROGRAM_DETAILS } = window.SSDATA;
const { t, currentLang, setLang } = window.SSI18N;

/* ============================ UTIL =================================== */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
));
const L = () => currentLang();
const pickL = (obj) => (obj && (obj[L()] ?? obj.en ?? obj.zh ?? ''));
const programById = (id) => PROGRAMS.find(p => p.id === id) || PROGRAMS[0];

/* ============================ STATE ================================== */
const STORAGE_KEY = 'ss.state.v1';
const State = {
  lang: currentLang(),
  route: { name: 'home', params: {} },
  /* survey: { programId, context, contextIndex, contextComplete, currentRound,
     qIndex, answers:{r1:{},r2:{},r3:{},r4:{}}, doneRounds:[bool] } */
  survey: null,
  /* The new conversational review is deliberately its own draft shape.
     It stays in this browser until the reviewer explicitly signs in and
     saves, so it cannot be confused with submissions from the legacy flow. */
  reviewDraft: null,
  /* matchmaker: { grade, interests, goals, budget } */
  matchmaker: null,
  picker: { query: '', subjects: new Set(), methods: new Set(), filtersOpen: false, fromFinder: false },
  guided: { step: 1, subjects: new Set(), methods: new Set(), expandedSubjects: false, expandedMethods: false },
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.survey) State.survey = saved.survey;
      if (saved.reviewDraft) State.reviewDraft = saved.reviewDraft;
      if (saved.matchmaker) State.matchmaker = saved.matchmaker;
    }
  } catch {}
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      survey: State.survey,
      reviewDraft: State.reviewDraft,
      matchmaker: State.matchmaker,
    }));
  } catch {}
}
load();

/* ============================ HEADER / FOOTER ======================= */
function renderHeader(active) {
  const lang = L();
  const user = window.SSDB.currentUser();
  return `
    <header class="site-header">
      <div class="site-header__inner">
        <a class="brand" href="#/">
          <span class="brand__mark"></span>
          <span class="brand__text">
            <span class="brand__name">${esc(t('brand', lang))}</span>
            <span class="brand__slogan">${esc(t('brandTagline', lang))}</span>
          </span>
        </a>
        <nav class="site-nav">
          <a href="#/"           class="${active==='home'?'active':''}">${esc(t('navHome', lang))}</a>
          <a href="#/pick"      class="${active==='pick'?'active':''}">${esc(t('navReview', lang))}</a>
          <a href="#/rankings"  class="${active==='rankings'?'active':''}">${esc(t('navRankings', lang))}</a>
          <a href="#/matchmaker" class="${active==='match'?'active':''}">${esc(t('navMatchmaker', lang))}</a>
          ${user ? `<a href="#/account" class="${active==='account'?'active':''}">${esc(t('navAccount', lang))}</a>` : ''}
        </nav>
        <div class="lang-switch" role="tablist" aria-label="Language">
          <button class="${lang==='en'?'on':''}" data-lang="en">EN</button>
          <button class="${lang==='zh'?'on':''}" data-lang="zh">中文</button>
        </div>
        <div class="auth-area">
          ${user
            ? `<a class="auth-link" href="#/account">${esc(user.name || t('navAccount', lang))}</a>`
            : `<a class="auth-link" href="#/login">${esc(t('authSignIn', lang))}</a>`}
        </div>
      </div>
    </header>
  `;
}

function renderFooter() {
  const lang = L();
  return `
    <footer class="site-footer">
      <div class="site-footer__suggestion">
        <div>
          <p class="site-footer__eyebrow">${esc(lang === 'zh' ? '帮助我们做得更好' : 'HELP US MAKE THIS BETTER')}</p>
          <h2>${esc(lang === 'zh' ? '有建议想告诉我们吗？' : 'Have a suggestion?')}</h2>
          <p>${esc(lang === 'zh' ? '你的想法会帮助下一位学生更容易找到适合自己的暑期项目。' : 'Your ideas can help the next student find a summer that fits.')}</p>
        </div>
        <a class="site-footer__suggestion-button" href="https://docs.google.com/forms/d/e/1FAIpQLSdf6na2ZIfBQTVmkpxmr6-ktLIpskJ--ZwRey2U097-99gR-w/viewform?usp=publish-editor" target="_blank" rel="noopener noreferrer">${esc(lang === 'zh' ? '告诉我们' : 'Share a suggestion')}</a>
      </div>
      <a class="site-footer__contributors" href="#/contributors">${esc(lang === 'zh' ? '早期贡献者' : 'Early contributors')}</a>
    </footer>
  `;
}

function renderContributors() {
  const lang = L();
  const copy = lang === 'zh' ? {
    eyebrow: 'FOUNDING CONTRIBUTORS · 早期贡献者', title: '由愿意真诚分享的学生共同建立。', lede: '每一份评价，都让下一位学生更容易找到适合自己的项目。这个页面感谢最早选择分享经验、帮助我们建立这份资源的人。', calloutTitle: '成为前 100 位贡献者之一。', calloutText: '提交评价后，你可以决定是否以昵称和所评项目出现在这里。', cta: '写一份评价', wall: '早期贡献者名单', note: '仅展示明确同意的人。', emptyTitle: '这里会从第一位早期贡献者开始。', emptyText: '提交一份真实评价后，你可以选择加入感谢名单。', privacyTitle: '隐私优先。', privacyText: '贡献者自行决定是否加入。我们只会展示昵称（或“匿名贡献者”）和所评项目；绝不会展示手机号、邮箱或完整评价内容。', reviewed: '评价了', anonymous: '匿名贡献者'
  } : {
    eyebrow: 'FOUNDING CONTRIBUTORS · EARLY CONTRIBUTORS', title: 'Built with students who shared honestly.', lede: 'Every review makes it easier for the next student to find a program that fits. This page thanks the people who chose to help build that resource from the beginning.', calloutTitle: 'Be part of the first 100.', calloutText: 'Submit a review, then choose whether to appear here with your display name and program.', cta: 'Write a review', wall: 'The early contributors', note: 'Shown only with each contributor’s permission.', emptyTitle: 'The wall begins with its first contributor.', emptyText: 'After submitting a real review, you can choose to join this thank-you list.', privacyTitle: 'Privacy first.', privacyText: 'Contributors choose whether to appear. We show only a display name (or “Anonymous contributor”) and the program reviewed—never a phone number, email, or full review response.', reviewed: 'Reviewed', anonymous: 'Anonymous contributor'
  };
  const contributors = (window.SSDB?.getAllReviews?.() || []).filter(review => review.foundingContributor === true);
  const initials = name => String(name || copy.anonymous).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.slice(0, 1)).join('').toUpperCase() || 'R';
  const card = review => {
    const program = programById(review.programId);
    const author = String(review.author || '').trim() || copy.anonymous;
    return `<article class="contributors-page__person"><span class="contributors-page__avatar" aria-hidden="true">${esc(initials(author))}</span><h2>${esc(author)}</h2><p>${esc(copy.reviewed)}<br><strong>${esc(rvProgramName(program))}</strong></p></article>`;
  };
  const wall = contributors.length
    ? `<div class="contributors-page__wall">${contributors.map(card).join('')}</div>`
    : `<div class="contributors-page__empty"><span aria-hidden="true">✦</span><h2>${esc(copy.emptyTitle)}</h2><p>${esc(copy.emptyText)}</p></div>`;
  $('#app').innerHTML = `${renderHeader('contributors')}
    <main class="contributors-page">
      <section class="contributors-page__hero">
        <div><p class="contributors-page__eyebrow">${esc(copy.eyebrow)}</p><h1>${esc(copy.title)}</h1><p class="contributors-page__lede">${esc(copy.lede)}</p></div>
        <aside class="contributors-page__callout"><h2>${esc(copy.calloutTitle)}</h2><p>${esc(copy.calloutText)}</p><a href="#/survey" class="contributors-page__button">${esc(copy.cta)}</a></aside>
      </section>
      <section class="contributors-page__list" aria-labelledby="contributors-wall-title">
        <div class="contributors-page__list-head"><h2 id="contributors-wall-title">${esc(copy.wall)}</h2><p>${esc(copy.note)}</p></div>
        ${wall}
        <p class="contributors-page__privacy"><span aria-hidden="true">✓</span><span><strong>${esc(copy.privacyTitle)}</strong> ${esc(copy.privacyText)}</span></p>
      </section>
    </main>${renderFooter()}`;
  bindHeaderEvents();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function bindHeaderEvents() {
  $$('.lang-switch button').forEach(b => {
    b.addEventListener('click', () => {
      const newLang = b.dataset.lang;
      if (newLang === L()) return;
      setLang(newLang);
      State.lang = newLang;
      // re-render current view
      render();
    });
  });
  updateNavOverflow();
  if (!window.__navResizeBound) {
    window.__navResizeBound = true;
    window.addEventListener('resize', updateNavOverflow);
  }
}

/* Niche-style horizontal scroll hint: if the site-nav overflows on this
 * viewport, fade its right edge and append a "…" indicator so users know
 * there are more items off-screen. Re-evaluated on every render + resize. */
function updateNavOverflow() {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;
  // remove any old indicator first
  const existing = nav.querySelector('.site-nav__more');
  if (existing) existing.remove();
  // overflow = scrollWidth exceeds visible width (allow 1px slack).
  // We only fade the right edge — no "…" dots — per design feedback.
  if (nav.scrollWidth - nav.clientWidth > 1) {
    nav.classList.add('site-nav--has-overflow');
  } else {
    nav.classList.remove('site-nav--has-overflow');
  }
}

/* ============================ PROGRESS HELPERS ====================== */
function totalQuestions() {
  return QUESTIONNAIRE.reduce((s, r) => s + r.questions.length, 0);
}
function answeredCount() {
  if (!State.survey) return 0;
  let n = 0;
  QUESTIONNAIRE.forEach((r, ri) => {
    const ans = State.survey.answers[`r${ri+1}`] || {};
    r.questions.forEach(q => {
      if (q.type === 'category-grid' || q.type === 'likert-grid') return; // optional
      const v = ans[q.key];
      if (q.type === 'pills-multi' || q.type === 'word-pick') { if (v && (v.length || (v.other && v.other.trim()))) n++; }
      else if (q.type === 'open') {
        const words = String(v || '').trim().match(/\S+/g)?.length || 0;
        if (v && (q.minWords ? words >= q.minWords : String(v).trim().length >= (q.min || 0))) n++;
      }
      else if (v !== undefined && v !== null && v !== '') { n++; }
    });
  });
  return n;
}
function overallProgress() {
  return Math.min(100, Math.round(answeredCount() / totalQuestions() * 100));
}

/* ============================ QUESTION RENDERERS ==================== */

function renderStars(q, value, onPick) {
  const max = q.max || 5;
  return `
    <div class="stars" role="radiogroup" aria-label="${esc(pickL(q.prompt))}">
      ${Array.from({length: max}, (_, i) => {
        const n = i + 1;
        return `<button class="star ${value>=n?'is-on':''}" role="radio"
          aria-checked="${value===n}" data-n="${n}" aria-label="${n}">★</button>`;
      }).join('')}
    </div>
  `;
}

function renderCategoryGrid(q, values, onPick) {
  return `
    <div class="cat-grid">
      ${q.subItems.map(s => {
        const v = values?.[s.key];
        return `
          <div class="cat-grid__item" data-key="${esc(s.key)}">
            <div class="cat-grid__label">${esc(pickL(s.label))}</div>
            <div class="cat-grid__row">
              ${[1,2,3,4,5].map(n =>
                `<button class="star ${v && typeof v === 'number' && v>=n?'is-on':''}" data-n="${n}" aria-label="${n}">${v && typeof v === 'number' && v>=n?'★':'☆'}</button>`
              ).join('')}
              <button class="cat-grid__na ${v === 'NA'?'is-on':''}" data-na="1">${esc(t('surveyNa', L()))}</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderPillsSingle(q, value, onPick) {
  const labels = q.options.map(o => pickL(o));
  const hasLongLabels = labels.some(label => String(label).length > 24);
  return `
    <div class="pills pills--row pills--count-${q.options.length} ${hasLongLabels ? 'pills--long' : 'pills--compact'}" role="radiogroup">
      ${q.options.map(o => {
        const label = pickL(o);
        return `<button type="button" class="pill pill--row ${value===o.value?'is-on':''}"
          role="radio" aria-checked="${value===o.value}" data-val="${esc(o.value)}">${esc(label)}</button>`;
      }).join('')}
    </div>
  `;
}

function renderPillsMulti(q, values, onPick) {
  // Defensive: tolerate non-array values (e.g. corrupted older saves
  // or when somebody pressed a single-select button here by mistake).
  const vals = (Array.isArray(values) || typeof values === 'string' || values == null)
    ? (Array.isArray(values) ? values : [])
    : [];
  return `
    <div class="pills pills--multi">
      ${q.options.map(o => {
        const label = pickL(o);
        const on = vals.includes(o.value);
        return `<button type="button" class="btn--pill pill pill--ghost pill--word ${on?'is-active':''}"
          data-val="${esc(o.value)}" aria-pressed="${on}">${esc(label)}</button>`;
      }).join('')}
    </div>
  `;
}

function renderLikertGrid(q, values, onPick) {
  const labels = pickL(q.scale);
  return `
    <table class="likert" role="grid">
      <thead>
        <tr>
          <th></th>
          ${labels.map((lbl, i) => `<th>${esc(lbl)}</th>`).join('')}
          <th class="likert__na"></th>
        </tr>
      </thead>
      <tbody>
        ${q.subItems.map(s => {
          const v = values?.[s.key];
          return `
            <tr data-key="${esc(s.key)}">
              <td class="label">${esc(pickL(s.label))}</td>
              ${[1,2,3,4,5].map(n => `
                <td class="likert__cell">
                  <button class="${v===n?'is-on':''}" data-n="${n}" aria-label="${n}">${n}</button>
                </td>
              `).join('')}
              <td class="likert__na">
                <button class="${v==='NA'?'is-on':''}" data-na="1">${esc(t('surveyNa', L()))}</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderOpen(q, value, onPick) {
  const min = q.min || 0;
  const minWords = q.minWords || 0;
  const max = q.max || 1000;
  const cur = (value || '').length;
  const wordCount = String(value || '').trim().match(/\S+/g)?.length || 0;
  const minOk = minWords ? wordCount >= minWords : cur >= min;
  const requirement = minWords
    ? `${wordCount} / ${minWords} ${L() === 'zh' ? '个词' : 'words'}`
    : `${min} ${t('surveyMinChar', L())}`;
  return `
    <div>
      <textarea class="open-text" data-open="1" maxlength="${max}"
        placeholder="${esc(pickL(q.placeholder) || '')}">${esc(value || '')}</textarea>
      <div class="open-text__row">
        <span class="open-text__hint ${minOk?'':'is-err'}" data-open-hint>
          ${minOk ? '✓ ' : ''}${esc(requirement)}
        </span>
        <span data-open-remaining>${max - cur} ${esc(t('surveyRemaining', L()))}</span>
      </div>
    </div>
  `;
}

function renderWordPick(q, values, otherText, onPick) {
  const v = values || [];
  const min = q.pick?.min || 0;
  const max = Number.isFinite(q.pick?.max) ? q.pick.max : Infinity;
  const allowOther = q.pick?.allowOther;
  const helpText = Number.isFinite(max) && min === max
    ? `${t('surveyChoose', L())} ${min}`
    : (Number.isFinite(max) && max > 0 ? `${t('surveyUpTo', L())} ${max}` : '');
  return `
    ${helpText ? `<p class="survey__helper">${esc(helpText)}</p>` : ''}
    <div class="pills" style="max-width:780px;margin:0 auto">
      ${q.words.map(w => {
        const label = pickL(w);
        const on = v.includes(w.en);
        return `<button class="btn--pill pill pill--word ${on?'is-on':''}"
          data-word="${esc(w.en)}" aria-pressed="${on}">${esc(label)}</button>`;
      }).join('')}
      ${allowOther ? `
        <button class="btn--pill pill pill--word pill--other ${v.includes('Other')?'is-on':''}" data-word="Other">
          ${L()==='zh' ? '其他' : 'Other'}<input type="text" data-other="1" value="${esc(otherText||'')}" placeholder="...">
        </button>` : ''}
    </div>
  `;
}

/* ============================ SURVEY RENDER ========================= */

function boundedSurveyIndex(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return fallback;
  return Math.floor(n);
}

function isSurveyAnswerMap(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/* The selected program is already in the URL. Programs can therefore swap
 * the generic setup fields for compact, comparable choices without changing
 * any of the four review rounds. */
function getSurveyContextConfig(programId) {
  return SURVEY_CONTEXT_BY_PROGRAM[programId] || {
    version: 'generic-context-2027-1',
    title: { en: 'About your program experience', zh: '关于你的项目经历' },
    subtitle: {
      en: 'A few quick details help us keep different student experiences comparable.',
      zh: '几项简短信息，帮助我们更准确地比较不同学生的体验。',
    },
    fields: SURVEY_CONTEXT,
  };
}

function isContextFieldVisible(q) {
  const condition = q.dependsOn;
  if (!condition) return true;
  const answer = (State.survey?.context || {})[condition.key];
  return (condition.values || []).includes(answer);
}

function isContextOptionVisible(option) {
  const condition = option.visibleWhen;
  if (!condition) return true;
  const answer = (State.survey?.context || {})[condition.key];
  return (condition.values || []).includes(answer);
}

function visibleContextFields(programId) {
  return (getSurveyContextConfig(programId).fields || []).filter(isContextFieldVisible);
}

function ensureSurvey(programId) {
  const contextConfig = getSurveyContextConfig(programId);
  const surveyOwner = window.SSDB.currentUser()?.id || null;
  if (!State.survey || State.survey.programId !== programId || (State.survey.ownerId && State.survey.ownerId !== surveyOwner)) {
    State.survey = {
      programId,
      ownerId: surveyOwner,
      context: {},
      contextIndex: 0,
      contextVersion: contextConfig.version,
      contextComplete: contextConfig.fields.length === 0,
      currentRound: 0,
      qIndex: 0,
      doneRounds: [false, false, false, false],
      answers: { r1:{}, r2:{}, r3:{}, r4:{} },
    };
    save();
    return;
  }
  /*
   * The questionnaire changes over time, while an unfinished response lives
   * in localStorage. A saved question index can therefore point beyond the
   * new round (or even to a removed round). Normalize that state before any
   * renderer reads QUESTIONNAIRE[ri].questions[qi]. This retains all saved
   * answers, rather than discarding an in-progress review after an update.
   */
  const roundCount = QUESTIONNAIRE.length;
  State.survey.context = isSurveyAnswerMap(State.survey.context) ? State.survey.context : {};
  State.survey.answers = isSurveyAnswerMap(State.survey.answers) ? State.survey.answers : {};

  const savedDoneRounds = Array.isArray(State.survey.doneRounds) ? State.survey.doneRounds : [];
  State.survey.doneRounds = Array.from({ length: roundCount }, (_, i) => savedDoneRounds[i] === true);
  QUESTIONNAIRE.forEach((_, i) => {
    const key = `r${i + 1}`;
    State.survey.answers[key] = isSurveyAnswerMap(State.survey.answers[key]) ? State.survey.answers[key] : {};
  });

  const firstIncompleteRound = State.survey.doneRounds.findIndex(done => !done);
  const fallbackRound = firstIncompleteRound >= 0 ? firstIncompleteRound : Math.max(0, roundCount - 1);
  State.survey.currentRound = boundedSurveyIndex(
    State.survey.currentRound,
    fallbackRound,
    Math.max(0, roundCount - 1)
  );

  const activeRound = QUESTIONNAIRE[State.survey.currentRound];
  const questionCount = activeRound && Array.isArray(activeRound.questions) ? activeRound.questions.length : 0;
  State.survey.qIndex = boundedSurveyIndex(State.survey.qIndex, 0, Math.max(0, questionCount - 1));

  /* A changed setup format should reopen only the small setup card. Answers
     to the four review rounds remain intact in the saved draft. */
  if (State.survey.contextVersion !== contextConfig.version) {
    State.survey.contextVersion = contextConfig.version;
    State.survey.contextComplete = contextConfig.fields.length === 0;
    State.survey.contextIndex = 0;
  } else if (typeof State.survey.contextComplete !== 'boolean') {
    State.survey.contextComplete = contextConfig.fields.length === 0;
  }
  State.survey.contextIndex = State.survey.contextComplete
    ? 0
    : boundedSurveyIndex(State.survey.contextIndex, 0, Math.max(0, contextConfig.fields.length - 1));
  save();
}

function setAnswer(ri, key, value) {
  State.survey.answers[`r${ri+1}`][key] = value;
  save();
}

function getAnswer(ri, q) {
  const a = State.survey.answers[`r${ri+1}`] || {};
  if (q.type === 'word-pick') {
    return { values: a[q.key+'_words'] || [], other: a[q.key+'_other'] || '' };
  }
  return a[q.key];
}

function getContextAnswer(q) {
  return (State.survey.context || {})[q.key];
}

function setContextAnswer(key, value) {
  State.survey.context[key] = value;
  reconcileContextAnswers(State.survey.programId);
  save();
}

function reconcileContextAnswers(programId) {
  const fields = getSurveyContextConfig(programId).fields || [];
  fields.forEach(q => {
    const value = State.survey.context[q.key];
    if (value === undefined) return;
    if (!isContextFieldVisible(q)) {
      delete State.survey.context[q.key];
      return;
    }
    if (q.options && !q.options.some(option =>
      String(option.value) === String(value) && isContextOptionVisible(option)
    )) delete State.survey.context[q.key];
  });
  /* Discard retired generic setup fields rather than passing ambiguous
     format/length values into a YYGS response after the new compact flow. */
  if (programId === 'yygs') {
    delete State.survey.context.participation_format;
    delete State.survey.context.program_length;
  }
}

function isContextAnswered(q) {
  if (q.required === false) return true;
  const value = getContextAnswer(q);
  if (q.type === 'open') {
    if (!value) return false;
    const words = String(value).trim().match(/\S+/g)?.length || 0;
    return q.minWords ? words >= q.minWords : String(value).trim().length >= (q.min || 0);
  }
  return value !== undefined && value !== null && value !== '';
}

function renderContextField(q) {
  const value = getContextAnswer(q);
  const style = q.style || 'compact';
  const label = esc(pickL(q.prompt));
  const helper = q.helper ? `<span class="context-field__helper">${esc(pickL(q.helper))}</span>` : '';
  if (q.type === 'open') {
    return `
      <label class="context-field context-field--${esc(style)}" data-context-field="${esc(q.key)}">
        <span class="context-field__label">${label}${q.required === false ? ` <small>${esc(L()==='zh' ? '可选' : 'Optional')}</small>` : ''}</span>
        ${helper}
        <input class="context-text-input" type="text" data-context-input="${esc(q.key)}" value="${esc(value || '')}" placeholder="${esc(pickL(q.placeholder))}">
      </label>`;
  }
  return `
    <section class="context-field context-field--${esc(style)}" data-context-field="${esc(q.key)}">
      <p class="context-field__label">${label}${q.required === false ? ` <small>${esc(L()==='zh' ? '可选' : 'Optional')}</small>` : ''}</p>
      ${helper}
      <div class="context-choices context-choices--${esc(style)}" role="group" aria-label="${label}">
        ${(q.options || []).filter(isContextOptionVisible).map(option => {
          const on = String(value) === String(option.value);
          return `<button class="context-choice ${on ? 'is-on' : ''}" type="button" data-context-choice data-key="${esc(q.key)}" data-val="${esc(option.value)}" aria-pressed="${on}">${esc(pickL(option))}</button>`;
        }).join('')}
      </div>
    </section>`;
}

function renderSurveyContext(programId) {
  const config = getSurveyContextConfig(programId);
  const fields = visibleContextFields(programId);
  const program = programById(programId);
  const lang = L();
  /* Program details are deliberately collected one at a time. This keeps the
     setup calm on small screens and matches the rest of the survey flow. */
  const layout = 'guided';
  State.survey.contextLayout = 'guided';
  State.survey.contextIndex = boundedSurveyIndex(State.survey.contextIndex, 0, Math.max(0, fields.length - 1));
  const contextIndex = State.survey.contextIndex;
  const displayedFields = layout === 'guided' ? [fields[contextIndex]] : fields;
  const progress = fields.length ? Math.round(((contextIndex + 1) / fields.length) * 100) : 100;
  if (!fields.length) {
    State.survey.contextComplete = true;
    State.survey.contextIndex = 0;
    save();
    renderSurvey(programId);
    return;
  }

  $('#app').innerHTML = `
    ${renderHeader('pick')}
    <main class="survey survey--setup">
      <div class="survey__stage survey__stage--setup">
        <section class="survey-context-shell survey-context-shell--${layout}">
          <aside class="survey-context-intro">
            <div>
              <span class="survey-context-intro__step">${esc(layout === 'guided'
                ? (lang === 'zh' ? `准备 · ${contextIndex + 1}/${fields.length}` : `Setup · ${contextIndex + 1} of ${fields.length}`)
                : (lang === 'zh' ? '快速准备 · 约 1 分钟' : 'Quick setup · about 1 min'))}</span>
              <span class="eyebrow">${esc(lang === 'zh' ? '写评价前' : 'Before you review')}</span>
              <h1>${esc(pickL(config.title))}</h1>
              <p>${esc(pickL(config.subtitle))}</p>
            </div>
            <div class="survey-context-intro__program">
              <span>${esc(lang === 'zh' ? '你正在评价' : 'You’re reviewing')}</span>
              <strong>${esc(program ? pickL(program.name) : programId.toUpperCase())}</strong>
            </div>
          </aside>
          <div class="survey-context-card survey-context-card--${layout}">
            <div class="survey-context-card__head">
              <span class="eyebrow">${esc(layout === 'guided'
                ? (lang === 'zh' ? `问题 ${contextIndex + 1}/${fields.length}` : `Question ${contextIndex + 1} of ${fields.length}`)
                : (lang === 'zh' ? '项目详情' : 'Program details'))}</span>
              <h2>${esc(lang === 'zh' ? '先了解你的经历' : 'First, place your experience')}</h2>
              <p>${esc(layout === 'guided'
                ? (lang === 'zh' ? '一次只回答一个问题，轻松完成。' : 'One quick question at a time.')
                : (lang === 'zh' ? '选择最符合你经历的选项。' : 'Choose the options that best match your experience.'))}</p>
              ${layout === 'guided' ? `<div class="survey-context-progress"><i style="width:${progress}%"></i></div>` : ''}
            </div>
            <div class="survey-context-card__fields">
              ${displayedFields.map(renderContextField).join('')}
            </div>
            <div data-err aria-live="polite"></div>
            <div class="survey-context-card__footer">
              ${layout === 'guided' && contextIndex > 0
                ? `<button class="btn btn--outline" id="context-back">${esc(lang === 'zh' ? '返回' : 'Back')}</button>`
                : `<span class="muted">${esc(lang === 'zh' ? '之后进入 4 轮评价' : 'Then 4 review rounds')}</span>`}
              <button class="btn btn--arrow" id="context-next">${esc(layout === 'guided' && contextIndex < fields.length - 1
                ? (lang === 'zh' ? '下一个问题' : 'Next question')
                : (lang === 'zh' ? '继续第一轮' : 'Continue to Round 1'))}</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  `;
  bindHeaderEvents();
  bindSurveyContextEvents();
}

function bindSurveyContextEvents() {
  const card = $('.survey-context-card');
  if (!card) return;
  const fields = visibleContextFields(State.survey.programId);
  const layout = 'guided';

  $$('[data-context-choice]', card).forEach(button => button.addEventListener('click', () => {
    setContextAnswer(button.dataset.key, button.dataset.val);
    renderSurveyContext(State.survey.programId);
  }));
  $$('[data-context-input]', card).forEach(input => input.addEventListener('input', () => {
    setContextAnswer(input.dataset.contextInput, input.value);
  }));

  const back = $('#context-back');
  if (back) back.addEventListener('click', () => {
    State.survey.contextIndex = Math.max(0, State.survey.contextIndex - 1);
    save();
    renderSurveyContext(State.survey.programId);
  });

  $('#context-next').addEventListener('click', () => {
    const currentField = fields[State.survey.contextIndex];
    const fieldsToValidate = layout === 'guided' ? [currentField] : fields;
    const missing = fieldsToValidate.filter(q => q && !isContextAnswered(q));
    if (missing.length) {
      const err = $('[data-err]', card);
      missing.forEach(q => {
        const field = $(`[data-context-field="${q.key}"]`, card);
        if (field) field.classList.add('is-invalid');
      });
      if (err) err.innerHTML = `<div class="notice">⚠ ${esc(langRequiredMessage(missing))}</div>`;
      const firstMissing = $(`[data-context-field="${missing[0].key}"]`, card);
      if (firstMissing) firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (layout === 'guided' && State.survey.contextIndex < fields.length - 1) {
      State.survey.contextIndex += 1;
      save();
      renderSurveyContext(State.survey.programId);
      return;
    }
    const anyMissing = fields.filter(q => !isContextAnswered(q));
    if (anyMissing.length) {
      State.survey.contextIndex = fields.indexOf(anyMissing[0]);
      save();
      renderSurveyContext(State.survey.programId);
      return;
    }
    State.survey.contextComplete = true;
    State.survey.contextIndex = 0;
    save();
    renderSurvey(State.survey.programId);
  });
}

function langRequiredMessage(missing) {
  const labels = missing.map(q => pickL(q.prompt)).join(L() === 'zh' ? '、' : ', ');
  return L() === 'zh' ? `请完成：${labels}` : `Please complete: ${labels}`;
}

function isAnswered(ri, q) {
  const v = getAnswer(ri, q);
  if (q.type === 'category-grid' || q.type === 'likert-grid') return true; // optional
  if (q.type === 'stars')            return v && v > 0;
  if (q.type === 'pills-single')     return v !== undefined && v !== null && v !== '';
  if (q.type === 'pills-multi')      return v && v.length > 0;
  if (q.type === 'word-pick') {
    const min = q.pick?.min || 0;
    if (min === 0) return true;
    const n = v.values.length + (v.other && v.other.trim() ? 1 : 0);
    return n >= min;
  }
  if (q.type === 'open') {
    if (!v) return false;
    const words = String(v).trim().match(/\S+/g)?.length || 0;
    return q.minWords ? words >= q.minWords : String(v).trim().length >= (q.min || 0);
  }
  return true;
}

function renderLegacySurvey(programId) {
  ensureSurvey(programId);
  if (!State.survey.contextComplete) {
    renderSurveyContext(programId);
    return;
  }
  const ri = State.survey.currentRound;
  const round = QUESTIONNAIRE[ri];
  const qIndex = State.survey.qIndex;
  const q = round && Array.isArray(round.questions) ? round.questions[qIndex] : null;
  /* Defense in depth for malformed legacy drafts: no renderer should ever
     try to access q.key when a saved index refers to a removed question. */
  if (!round || !q) {
    State.survey.currentRound = 0;
    State.survey.qIndex = 0;
    save();
    renderSurvey(programId);
    return;
  }
  if (q.requiresAuth && !window.SSDB.currentUser()) {
    beginReviewAuthGate(ri, qIndex);
    return;
  }
  const program = programById(programId);
  const lang = L();
  const progress = overallProgress();

  const html = `
    ${renderHeader('pick')}
    <main class="survey">
      <div class="survey__stepper">
        ${QUESTIONNAIRE.map((_, i) => `<span class="${i<=ri?'on':''}"></span>`).join('')}
      </div>
      <div class="survey__roundHead">
        <span class="eyebrow">${esc(t('surveyRound', lang))} ${ri+1} ${esc(t('surveyOf', lang))} ${QUESTIONNAIRE.length}</span>
        <h2>${esc(pickL(round.title))}</h2>
        <p>${esc(pickL(round.subtitle))}</p>
      </div>
      <div class="survey__stage">
        <div class="survey__card" data-qkey="${esc(q.key)}" data-ri="${ri}" data-qi="${qIndex}">
          <h1 class="survey__title">
            ${esc(pickL(q.prompt))
              .replace(/^([^.]+)\.?\s*$/, '$1') /* keep clean */ ? esc(pickL(q.prompt)) : ''}
            ${q.helper ? '' : ''}
          </h1>
          ${q.helper ? `<p class="survey__helper">${esc(pickL(q.helper))}</p>` : ''}
          ${renderQuestionBody(ri, q)}
          <div data-err></div>
        </div>
      </div>
      <div class="survey__nav">
        <button class="btn btn--arrow-back" id="nav-back" ${qIndex===0 && ri===0 ? 'disabled' : ''}>${esc(t('surveyBack', lang))}</button>
        <span class="muted" style="font-size:13px">${esc(t('surveySaved', lang))} · ${progress}%</span>
        <button class="btn btn--arrow" id="nav-next">${isLastQuestionInSurvey() ? esc(t('surveySubmit', lang)) : esc(t('surveyNext', lang))}</button>
      </div>
      <div class="survey__progress"><i style="width:${progress}%"></i></div>
    </main>
  `;
  $('#app').innerHTML = html;
  bindHeaderEvents();
  bindSurveyEvents();
}

function renderQuestionBody(ri, q) {
  const v = getAnswer(ri, q);
  switch (q.type) {
    case 'stars':         return renderStars(q, v || 0, ()=>{});
    case 'category-grid': return renderCategoryGrid(q, v || {}, ()=>{});
    case 'pills-single':  return renderPillsSingle(q, v, ()=>{});
    case 'pills-multi':   return renderPillsMulti(q, v || [], ()=>{});
    case 'likert-grid':   return renderLikertGrid(q, v || {}, ()=>{});
    case 'open':          return renderOpen(q, v, ()=>{});
    case 'word-pick':     return renderWordPick(q, v.values, v.other, ()=>{});
  }
  return '';
}

function isLastQuestionInSurvey() {
  const ri = State.survey.currentRound;
  return State.survey.qIndex === QUESTIONNAIRE[ri].questions.length - 1;
}

function bindSurveyEvents() {
  const card = $('.survey__card');
  if (!card) return;
  const ri = +card.dataset.ri;
  const qi = +card.dataset.qi;
  const q = QUESTIONNAIRE[ri].questions[qi];

  // stars
  $$('.stars .star', card).forEach(b => {
    b.addEventListener('click', () => {
      const n = +b.dataset.n;
      setAnswer(ri, q.key, n);
      renderSurvey(State.survey.programId);
    });
  });

  // category-grid
  $$('.cat-grid__item', card).forEach(item => {
    const key = item.dataset.key;
    $$('.star', item).forEach(b => {
      b.addEventListener('click', () => {
        const n = +b.dataset.n;
        const cur = State.survey.answers[`r${ri+1}`][q.key] || {};
        cur[key] = n;
        setAnswer(ri, q.key, cur);
        renderSurvey(State.survey.programId);
      });
    });
    $('.cat-grid__na', item).addEventListener('click', () => {
      const cur = State.survey.answers[`r${ri+1}`][q.key] || {};
      cur[key] = 'NA';
      setAnswer(ri, q.key, cur);
      renderSurvey(State.survey.programId);
    });
  });

  // pills-single (only for single-select questions; attaching this handler to
  // multi-select buttons would clobber the array answer with a string, then
  // the multi handler's .filter() would throw a TypeError — that's the
  // "questionnaire errored" bug.)
  if (q.type === 'pills-single') {
    $$('.pills [data-val]', card).forEach(b => {
      b.addEventListener('click', () => {
        const val = isNaN(+b.dataset.val) ? b.dataset.val : +b.dataset.val;
        setAnswer(ri, q.key, val);
        renderSurvey(State.survey.programId);
      });
    });
  }

  // pills-multi
  if (q.type === 'pills-multi') {
    $$('.pills [data-val]', card).forEach(b => {
      b.addEventListener('click', () => {
        const val = b.dataset.val;
        // Always start from a real array; if a legacy save stored a string here,
        // treat that single value as the only current selection.
        const curRaw = State.survey.answers[`r${ri+1}`][q.key];
        const cur = Array.isArray(curRaw) ? curRaw
                  : (curRaw === undefined || curRaw === null || curRaw === '') ? []
                  : [curRaw];
        const i = cur.indexOf(val);
        const exclusiveValues = q.options.filter(option => option.exclusive).map(option => option.value);
        const isExclusive = exclusiveValues.includes(val);
        const next = i >= 0
          ? cur.filter(x => x !== val)
          : (isExclusive ? [val] : [...cur.filter(x => !exclusiveValues.includes(x)), val]);
        setAnswer(ri, q.key, next);
        renderSurvey(State.survey.programId);
      });
    });
  }

  // likert-grid
  $$('.likert tbody tr', card).forEach(tr => {
    const key = tr.dataset.key;
    $$('button[data-n]', tr).forEach(b => {
      b.addEventListener('click', () => {
        const n = +b.dataset.n;
        const cur = State.survey.answers[`r${ri+1}`][q.key] || {};
        cur[key] = n;
        setAnswer(ri, q.key, cur);
        renderSurvey(State.survey.programId);
      });
    });
    $('button[data-na]', tr).addEventListener('click', () => {
      const cur = State.survey.answers[`r${ri+1}`][q.key] || {};
      cur[key] = 'NA';
      setAnswer(ri, q.key, cur);
      renderSurvey(State.survey.programId);
    });
  });

  // open
  const ta = $('textarea[data-open]', card);
  if (ta) {
    ta.addEventListener('input', () => {
      const value = ta.value;
      setAnswer(ri, q.key, value);
      const currentCharacters = value.length;
      const currentWords = value.trim().match(/\S+/g)?.length || 0;
      const minimumWords = q.minWords || 0;
      const minimumCharacters = q.min || 0;
      const maximumCharacters = q.max || 1000;
      const requirementMet = minimumWords
        ? currentWords >= minimumWords
        : currentCharacters >= minimumCharacters;
      const hint = $('[data-open-hint]', card);
      const remaining = $('[data-open-remaining]', card);
      if (hint) {
        hint.textContent = minimumWords
          ? `${requirementMet ? '✓ ' : ''}${currentWords} / ${minimumWords} ${L() === 'zh' ? '个词' : 'words'}`
          : `${requirementMet ? '✓ ' : ''}${minimumCharacters} ${t('surveyMinChar', L())}`;
        hint.classList.toggle('is-err', !requirementMet);
      }
      if (remaining) {
        remaining.textContent = `${Math.max(0, maximumCharacters - currentCharacters)} ${t('surveyRemaining', L())}`;
      }
      if (requirementMet) {
        const err = $('[data-err]', card);
        if (err) err.innerHTML = '';
      }
    });
  }

  // word-pick
  $$('.pills [data-word]', card).forEach(b => {
    b.addEventListener('click', (e) => {
      if (e.target.matches('input')) return; // ignore typing
      const word = b.dataset.word;
      const cur = State.survey.answers[`r${ri+1}`] || {};
      const listKey = q.key + '_words';
      const otherKey = q.key + '_other';
      const list = cur[listKey] || [];
      const max = Number.isFinite(q.pick?.max) ? q.pick.max : Infinity;
      let next;
      if (list.includes(word)) {
        next = list.filter(x => x !== word);
      } else {
        if (list.length >= max) return;
        next = [...list, word];
      }
      cur[listKey] = next;
      setAnswer(ri, q.key, next); // also store as value for getAnswer
      State.survey.answers[`r${ri+1}`][listKey] = next; // ensure
      if (cur[otherKey]) setAnswer(ri, otherKey, cur[otherKey]);
      renderSurvey(State.survey.programId);
    });
  });
  const otherInput = $('input[data-other]', card);
  if (otherInput) {
    otherInput.addEventListener('click', e => e.stopPropagation());
    otherInput.addEventListener('input', () => {
      const cur = State.survey.answers[`r${ri+1}`] || {};
      const otherKey = q.key + '_other';
      cur[otherKey] = otherInput.value;
      State.survey.answers[`r${ri+1}`][otherKey] = otherInput.value;
      // ensure 'Other' is in the list when typing
      const listKey = q.key + '_words';
      const list = cur[listKey] || [];
      if (otherInput.value && !list.includes('Other')) {
        const max = q.pick?.max || 99;
        if (list.length < max) {
          const next = [...list, 'Other'];
          cur[listKey] = next;
          State.survey.answers[`r${ri+1}`][listKey] = next;
        }
      }
      save();
    });
  }

  // nav
  $('#nav-back').addEventListener('click', goBack);
  $('#nav-next').addEventListener('click', goNext);
}

function goBack() {
  const ri = State.survey.currentRound;
  const qi = State.survey.qIndex;
  if (qi > 0) { State.survey.qIndex = qi - 1; save(); renderSurvey(State.survey.programId); return; }
  if (ri > 0) {
    // back to previous round's last question
    State.survey.currentRound = ri - 1;
    State.survey.qIndex = QUESTIONNAIRE[ri-1].questions.length - 1;
    save();
    renderSurvey(State.survey.programId);
  }
}

function goNext() {
  const ri = State.survey.currentRound;
  const q = QUESTIONNAIRE[ri].questions[State.survey.qIndex];
  if (!isAnswered(ri, q)) {
    const card = $('.survey__card');
    const err = $('[data-err]', card);
    if (err) err.innerHTML = `<div class="notice">⚠ ${esc(t('surveyRequired', L()))}</div>`;
    return;
  }
  if (State.survey.qIndex < QUESTIONNAIRE[ri].questions.length - 1) {
    const nextIndex = State.survey.qIndex + 1;
    const nextQuestion = QUESTIONNAIRE[ri].questions[nextIndex];
    if (nextQuestion.requiresAuth && !window.SSDB.currentUser()) {
      beginReviewAuthGate(ri, nextIndex);
      return;
    }
    State.survey.qIndex = nextIndex;
    save();
    renderSurvey(State.survey.programId);
  } else {
    // submit this round
    submitRound();
  }
}

function submitRound() {
  const ri = State.survey.currentRound;
  State.survey.doneRounds[ri] = true;
  save();
  /* After Round 1, anonymous users must sign in to save their review.
     Logged-in users (or later rounds) continue straight to the thank-you. */
  if (ri === 0 && !window.SSDB.currentUser()) {
    State.surveyReturnTo = '#/survey/' + State.survey.programId;
    State.surveyGatedRound = ri;
    save();
    renderSaveGate();
    return;
  }
  // Server storage links every submitted round to the signed-in account.
  try { window.SSDB.recordRound(State.survey.programId, 'r' + (ri + 1), roundAnswersForSubmission(ri)); } catch (e) {}
  publishReviewFromRound(ri);
  renderThankYou(ri);
}

/* A written Round 1 response is the public review a student intended to
 * contribute.  Saving the questionnaire alone used to leave it invisible on
 * the program page; this writes one review as soon as that signed-in student
 * submits the round. */
function publishReviewFromRound(ri) {
  if (ri !== 0 || !State.survey || State.survey.reviewPublished || !window.SSDB.currentUser()) return;
  const answers = State.survey.answers?.r1 || {};
  const text = String(answers.review || '').trim();
  const stars = Number(answers.overall);
  if (!text || !Number.isInteger(stars) || stars < 1 || stars > 5) return;
  const user = window.SSDB.currentUser();
  const context = State.survey.context || {};
  const who = [context.attended_year || context.year, context.participation_format || context.format]
    .filter(Boolean).join(' · ');
  try {
    window.SSDB.addReview({
      programId: State.survey.programId,
      author: user.name || (L() === 'zh' ? '匿名学生' : 'Student'),
      who,
      stars,
      text,
    });
    State.survey.reviewPublished = true;
    save();
  } catch (e) {}
}

function roundAnswersForSubmission(ri) {
  const answers = State.survey.answers[`r${ri + 1}`] || {};
  // Context only needs to travel with the first submitted round. It stays
  // separate from response fields in browser state, so it cannot be confused
  // with a scored question when the website aggregates results.
  return ri === 0 ? { ...(State.survey.context || {}), ...answers } : answers;
}

function renderSaveGate() {
  const lang = L();
  const program = programById(State.survey.programId);
  $('#app').innerHTML = `
    ${renderHeader('pick')}
    <main class="thanks">
      <div class="thanks__inner">
        <span class="eyebrow">${esc(pickL(program.name))} · ${esc(pickL(program.host))}</span>
        <h1>${esc(t('saveGateTitle', lang))}</h1>
        <p>${esc(t('saveGateSub', lang))}</p>
        <div style="margin-top:28px;display:flex;gap:10px;flex-wrap:wrap">
          <a class="btn--solid" href="#/login">${esc(t('authSignIn', lang))} ›</a>
          <a class="btn--pill" href="#/register">${esc(t('authRegister', lang))}</a>
        </div>
        <div style="margin-top:18px">
          <a class="muted" href="#/program/${State.survey.programId}">${esc(t('saveGateSkip', lang))}</a>
        </div>
      </div>
    </main>
  `;
  bindHeaderEvents();
}

/* The written review is intentionally account-only. Earlier rating choices
 * remain a local draft, then the reviewer returns to this exact question once
 * they have signed in or created an account. */
function beginReviewAuthGate(ri, qi) {
  State.surveyReturnTo = '#/survey/' + State.survey.programId;
  State.surveyGate = { type: 'review', ri, qi };
  save();
  renderReviewAuthGate();
}

function renderReviewAuthGate() {
  const lang = L();
  const program = programById(State.survey.programId);
  const title = lang === 'zh' ? '登录后继续写评价' : 'Sign in to write your review';
  const subtitle = lang === 'zh'
    ? '你刚才选择的评分已经保存。登录或注册后，即可继续填写你的文字评价。'
    : 'Your ratings so far are saved. Sign in or create an account to continue with your written review.';
  $('#app').innerHTML = `
    ${renderHeader('pick')}
    <main class="thanks">
      <div class="thanks__inner">
        <span class="eyebrow">${esc(pickL(program.name))} · ${esc(pickL(program.host))}</span>
        <h1>${esc(title)}</h1>
        <p>${esc(subtitle)}</p>
        <div style="margin-top:28px;display:flex;gap:10px;flex-wrap:wrap">
          <a class="btn--solid" href="#/login">${esc(t('authSignIn', lang))} ›</a>
          <a class="btn--pill" href="#/register">${esc(t('authRegister', lang))}</a>
        </div>
        <div style="margin-top:18px">
          <a class="muted" href="#/program/${State.survey.programId}">${esc(t('surveySaveExit', lang))}</a>
        </div>
      </div>
    </main>
  `;
  bindHeaderEvents();
}

function renderThankYou(roundIdx) {
  const lang = L();
  const program = programById(State.survey.programId);
  const isLast = roundIdx === QUESTIONNAIRE.length - 1;
  const nextRound = roundIdx + 1;
  const title = isLast
    ? t('tyAllDoneTitle', lang)
    : `${t('tyTitle', lang)} ${roundIdx+1}.`;
  const cta = isLast
    ? t('tyDone', lang)
    : `${t('tyContinue', lang)} ${nextRound + 1}`;
  const sub = isLast ? t('tyAllDoneSub', lang) : t('tySub', lang);

  $('#app').innerHTML = `
    ${renderHeader('pick')}
    <main class="thanks">
      <div class="thanks__inner">
        <span class="eyebrow" style="color:#e3ddc9">${esc(pickL(program.name))} · ${esc(pickL(program.host))}</span>
        <h1>${esc(title)}</h1>
        <p>${esc(sub)}</p>
        <div style="margin-top:28px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn--pill" id="cont">${esc(cta)} ›</button>
          <button class="btn--pill" id="exit">${esc(t('surveySaveExit', lang))}</button>
        </div>
      </div>
      <div class="thanks__art" aria-hidden="true">
        <svg class="s1" width="180" height="180" viewBox="0 0 180 180"><g fill="${'#f49a3a'}">
          ${Array.from({length:10}).map((_,i)=>{
            const a = (i/10)*Math.PI*2; const x1=90+Math.cos(a)*80; const y1=90+Math.sin(a)*80;
            const x2=90+Math.cos(a)*20; const y2=90+Math.sin(a)*20;
            return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${'#f49a3a'}" stroke-width="22" stroke-linecap="round"/>`;
          }).join('')}
          <circle cx="90" cy="90" r="20" fill="${'#f49a3a'}"/></g></svg>
        <svg class="s2" width="120" height="120" viewBox="0 0 120 120">
          <ellipse cx="60" cy="60" rx="55" ry="45" fill="#e25a3a"/>
        </svg>
        <svg class="s3" width="160" height="160" viewBox="0 0 160 160">
          <path d="M80 20 C120 60 120 100 80 140 C40 100 40 60 80 20 Z" fill="#7d8ce8"/>
        </svg>
      </div>
    </main>
  `;
  bindHeaderEvents();
  $('#cont').addEventListener('click', () => {
    if (isLast) {
      // finalize: jump to program profile
      location.hash = `#/program/${State.survey.programId}`;
    } else {
      State.survey.currentRound = nextRound;
      State.survey.qIndex = 0;
      save();
      renderSurvey(State.survey.programId);
    }
  });
  $('#exit').addEventListener('click', () => { location.hash = '#/'; });
}

/* ===================== CONVERSATIONAL REVIEW V2 =====================
 * Local-first, memory-led review flow.  This is intentionally separate from
 * the retired four-round schema above so past submissions remain readable.
 * A reviewer completes their story before any account gate appears. */
const REVIEW_V2 = {
  // Mix warm, neutral, and difficult descriptors throughout the list so a
  // reviewer never feels nudged toward a "positive" answer by its order.
  vibes: ['Inspiring', 'Stressful', 'Eye-opening', 'Competitive', 'Fun', 'Cliquey', 'Welcoming', 'Intense', 'Supportive', 'Disorganized', 'Relaxed', 'Underwhelming', 'Rigorous', 'Isolating', 'Social', 'Boring', 'Independent', 'Structured'],
  reflectionPrompts: [
    'Share your most memorable story about your program experience.',
    'What did you like and dislike the most about the program (can be anything from lectures to late night parties).',
    "If a friend were thinking about attending this program, what’s one thing you’d want them to know?"
  ],
  categories: [
    {
      id: 'academics', title: 'Academics', kicker: 'Learning, teaching, and the moments that stayed with you.',
      fields: [
        { key:'academic_rating', type:'stars', label:'Overall, how would you rate the academic experience?', helper:'Very dissatisfied → Very satisfied' },
        { key:'workload', type:'select', label:'How heavy was the workload?', options:['Very heavy, took up most of my free time', 'Somewhat heavy, but manageable', 'Moderate', 'Fairly light', 'Very light'] },
        { key:'instructors', type:'grid', label:'How would you rate your instructors?', na:true, items:['Teaching clarity', 'Engagement and enthusiasm', 'Encouragement of class discussion', 'Approachability and helpfulness outside class'] },
        { key:'academic_memory', type:'open', optional:true, label:"What’s one class, professor, or academic moment that left an impression on you?", placeholder:'A few sentences are enough…' }
      ]
    },
    {
      id: 'studentLife', title: 'Student Life', kicker: 'The people, the pace, and what happened outside class.',
      fields: [
        { key:'life_rating', type:'stars', label:'Overall, how would you rate student life?', helper:'Very dissatisfied → Very satisfied' },
        { key:'activities', type:'multi', label:'What was available outside class?', options:['Weekend trips or excursions', 'Daytime activities such as snacks or crafts', 'Evening events such as movie nights, games, or dances', 'Clubs or interest groups', 'Sports or outdoor recreation', 'Showcases or talent nights', 'Honestly not much', 'We made our own fun'], exclusive:'We made our own fun' },
        { key:'making_friends', type:'select', label:'How easy was it to make friends?', options:['Very easy', 'Somewhat easy', 'Mixed experience', 'Somewhat difficult', 'Very difficult'] },
        { key:'life_memory', type:'prompt', optional:true, label:'Pick one memory prompt, if you’d like to share more.', prompts:['What did a typical afternoon or weekend look like?', 'What do you wish the program had done differently?', 'What’s one special memory about people you met?'] }
      ]
    },
    {
      id: 'campusLife', title: 'Campus Life', kicker: 'The practical details that shape everyday life.',
      fields: [
        { key:'campus_ratings', type:'grid', label:'How would you rate the setting?', na:true, items:['Food', 'Dorms / Accommodation', 'Classrooms and study spaces', 'Recreation facilities and common areas'] },
        { key:'safety', type:'stars', label:'How safe did you feel?', helper:'Very unsafe → Very safe' },
        { key:'getting_around', type:'stars', label:'How convenient was it to get around?', helper:'Very inconvenient → Very convenient' },
        { key:'nearby', type:'multi', label:'What was nearby?', options:['Good food', 'Grocery shopping', 'Public transportation', 'Shopping', 'Entertainment', 'Natural spaces', 'Healthcare and pharmacies', 'Cultural and historical landmarks'] },
        { key:'campus_memory', type:'open', optional:true, label:'What was your favorite campus spot or place outside campus?', placeholder:'Tell us about it…' }
      ]
    },
    {
      id: 'outcomes', title: 'Outcomes', kicker: 'Anything you carried forward after the summer.',
      fields: [
        { key:'takeaway', type:'open', optional:true, label:'Tell us anything you walked away with after attending the program (it can be tangible like a certificate of completion, rec letters; it can also be intangible like friendships, a taste of college life etc).', placeholder:'There is no right kind of outcome…' }
      ]
    }
  ]
};

function rvText(en, zh) { return L() === 'zh' ? (zh || en) : en; }
function rvDraft(programId) {
  if (!State.reviewDraft || State.reviewDraft.programId !== programId) {
    State.reviewDraft = {
      version: 2, programId, ownerId: window.SSDB.currentUser()?.id || null,
      screen: 'context', activeCategory: null,
      context: { attendedYear:'', trackCourse:'', format:'' },
      general: { overall:'', value:'', vibes:[], reflectionPrompt:'', reflectionText:'' },
      optional: { academics:{}, studentLife:{}, campusLife:{}, outcomes:{} },
      foundingContributor: false,
      awaitingAuth: false,
    };
    save();
  }
  return State.reviewDraft;
}
function rvPersist() { save(); }
function rvProgramName(program) { return pickL(program?.name || { en:'Summer program', zh:'暑期项目' }); }
function rvCategory(id) { return REVIEW_V2.categories.find(c => c.id === id); }
function rvCompletedCategory(category, draft) {
  const answers = draft.optional[category.id] || {};
  return category.fields.some(field => {
    const value = answers[field.key];
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return String(value || '').trim().length > 0;
  });
}
function rvGeneralReady(draft) {
  const g = draft.general;
  return !!(g.overall && g.value && g.vibes.length && g.reflectionPrompt && String(g.reflectionText || '').trim());
}
function rvDraftNote() {
  return `<p class="review-v2__draft-note">${esc(rvText('Draft kept on this device', '草稿保存在此设备上'))}</p>`;
}
function rvChoiceHTML(options, value, attrs, multi) {
  const values = Array.isArray(value) ? value : [];
  const variant = attrs.includes('data-rv-reflection-prompt') ? 'review-v2__choices--prompt' : '';
  return `<div class="review-v2__choices ${multi ? 'review-v2__choices--tags' : ''} ${variant}">
    ${options.map(option => {
      const active = multi ? values.includes(option) : value === option;
      return `<button type="button" class="review-v2__choice ${active ? 'is-selected' : ''}" ${attrs} data-value="${esc(option)}" aria-pressed="${active}">${esc(option)}</button>`;
    }).join('')}
  </div>`;
}
function rvStarsHTML(value, attrs) {
  return `<div class="review-v2__stars" role="radiogroup">${[1,2,3,4,5].map(n => `<button type="button" ${attrs} data-value="${n}" class="${Number(value) >= n ? 'is-selected' : ''}" aria-label="${n} out of 5">★</button>`).join('')}</div>`;
}
function rvFieldHTML(field, answers, categoryId) {
  const value = answers[field.key];
  const fieldHead = `<div class="review-v2__question-head"><h3>${esc(field.label)}</h3>${field.optional ? `<span>${esc(rvText('Optional', '可选'))}</span>` : ''}</div>`;
  const attrs = `data-rv-area="${esc(categoryId)}" data-rv-key="${esc(field.key)}"`;
  let body = '';
  if (field.type === 'stars') body = `${rvStarsHTML(value, `data-rv-star ${attrs}`)}${field.helper ? `<p class="review-v2__scale-note">${esc(field.helper)}</p>` : ''}`;
  if (field.type === 'select') body = rvChoiceHTML(field.options, value, `data-rv-choice ${attrs}`, false);
  if (field.type === 'multi') body = rvChoiceHTML(field.options, value || [], `data-rv-choice data-rv-multi="1" data-rv-exclusive="${esc(field.exclusive || '')}" ${attrs}`, true);
  if (field.type === 'open') body = `<textarea class="review-v2__textarea" data-rv-text ${attrs} placeholder="${esc(field.placeholder || '')}">${esc(value || '')}</textarea>`;
  if (field.type === 'grid') {
    const grid = value && typeof value === 'object' ? value : {};
    body = `<div class="review-v2__grid">${field.items.map(item => `<div class="review-v2__grid-row"><span>${esc(item)}</span><div>${[1,2,3,4,5].map(n => `<button type="button" data-rv-grid ${attrs} data-sub="${esc(item)}" data-value="${n}" class="${grid[item] === n ? 'is-selected' : ''}">${n}</button>`).join('')}${field.na ? `<button type="button" data-rv-grid ${attrs} data-sub="${esc(item)}" data-value="NA" class="review-v2__na ${grid[item] === 'NA' ? 'is-selected' : ''}">N/A</button>` : ''}</div></div>`).join('')}</div>`;
  }
  if (field.type === 'prompt') {
    const promptKey = field.key + '_prompt';
    const textKey = field.key + '_text';
    body = `${rvChoiceHTML(field.prompts, answers[promptKey] || '', `data-rv-prompt data-rv-area="${esc(categoryId)}" data-rv-key="${esc(promptKey)}"`, false)}<textarea class="review-v2__textarea" data-rv-text data-rv-area="${esc(categoryId)}" data-rv-key="${esc(textKey)}" placeholder="${esc(rvText('A few sentences are enough…', '几句话就够了……'))}">${esc(answers[textKey] || '')}</textarea>`;
  }
  return `<section class="review-v2__question">${fieldHead}${body}</section>`;
}
function renderSurvey(programId, { preserveScroll = false } = {}) {
  if (!programId) return renderSurveyProgramPicker();
  const scrollTop = preserveScroll ? window.scrollY : 0;
  const draft = rvDraft(programId);
  const program = programById(programId);
  const screen = draft.screen || 'context';
  const shared = `${renderHeader('pick')}<main class="review-v2">`;
  let body = '';
  if (screen === 'context') body = rvContextView(draft, program);
  else if (screen === 'general') body = rvGeneralView(draft, program);
  else if (screen === 'reflection') body = rvReflectionView(draft, program);
  else if (screen === 'topics') body = rvTopicsView(draft, program);
  else if (screen === 'category') body = rvCategoryView(draft, program);
  else if (screen === 'review') body = rvReviewView(draft, program);
  else if (screen === 'thanks') body = rvThanksView(program);
  $('#app').innerHTML = `${shared}${body}</main>`;
  bindHeaderEvents();
  bindReviewV2();
  if (preserveScroll) {
    requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: 'instant' }));
  } else {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}
function renderSurveyProgramPicker() {
  const lang = L();
  const copy = lang === 'zh' ? {
    eyebrow: '分享你的体验',
    title: '你想评价哪个项目？',
    lede: '先选择你参加过的夏校，我们会在问卷中自动记住它。',
    placeholder: '搜索项目或学校…',
    empty: '没有找到匹配项目。试试学校名称或项目名称。',
    choose: '选择并开始评价',
    back: '返回搜索项目'
  } : {
    eyebrow: 'SHARE YOUR EXPERIENCE',
    title: 'Which program are you reviewing?',
    lede: 'Choose the summer program you attended. We’ll keep it selected throughout your questionnaire.',
    placeholder: 'Search a program or school…',
    empty: 'No matching program yet. Try a program or school name.',
    choose: 'Choose this program',
    back: 'Back to Search Programs'
  };
  const programRows = (query = '') => {
    const needle = normalizePickerText(query);
    const matches = PROGRAMS.filter(p => !needle || normalizePickerText([pickL(p.name), pickL(p.host), p.city, p.state].join(' ')).includes(needle)).slice(0, 8);
    return matches.length ? matches.map(p => `<button type="button" class="review-program-picker__option" data-review-program="${esc(p.id)}"><span><strong>${esc(pickL(p.name))}</strong><small>${esc(pickL(p.host))}${p.city ? ` · ${esc(p.city)}` : ''}</small></span><b>${esc(copy.choose)} →</b></button>`).join('') : `<p class="review-program-picker__empty">${esc(copy.empty)}</p>`;
  };
  $('#app').innerHTML = `${renderHeader('pick')}<main class="review-v2"><section class="review-v2__shell review-v2__shell--intro review-program-picker"><p class="review-v2__eyebrow">${esc(copy.eyebrow)}</p><h1>${esc(copy.title)}</h1><p class="review-v2__lede">${esc(copy.lede)}</p><label class="review-program-picker__search"><span>${esc(copy.placeholder)}</span><input type="search" id="reviewProgramSearch" placeholder="${esc(copy.placeholder)}" autocomplete="off"></label><div class="review-program-picker__results" id="reviewProgramResults">${programRows()}</div><div class="review-v2__footer"><a class="review-v2__back" href="#/pick">${esc(copy.back)}</a></div></section></main>`;
  bindHeaderEvents();
  const search = $('#reviewProgramSearch');
  const results = $('#reviewProgramResults');
  search?.addEventListener('input', () => { results.innerHTML = programRows(search.value); });
  results?.addEventListener('click', event => {
    const option = event.target.closest('[data-review-program]');
    if (option) location.hash = `#/survey/${option.dataset.reviewProgram}`;
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function rvContextView(draft, program) {
  const c = draft.context;
  return `<section class="review-v2__shell review-v2__shell--intro">
    <p class="review-v2__eyebrow">${esc(rvText('YOUR SUMMER, YOUR STORY', '你的暑期，你的故事'))}</p>
    <h1>${esc(rvText('Your Summer, Your Story', '你的暑期，你的故事'))}</h1>
    <p class="review-v2__lede">${esc(rvText('A few quick questions, then share what you remember.', '几个简短问题，然后分享你记得的经历。'))}</p>
    <div class="review-v2__program"><span>${esc(rvText('You’re reviewing', '你正在评价'))}</span><strong>${esc(rvProgramName(program))}</strong></div>
    <div class="review-v2__panel review-v2__context">
      <label><span>${esc(rvText('When did you attend?', '你在哪一年参加？'))}</span><input data-rv-context="attendedYear" value="${esc(c.attendedYear)}" placeholder="${esc(rvText('For example: Summer 2025', '例如：2025 年夏季'))}"></label>
      <label><span>${esc(rvText('What track, course, or subject did you take?', '你参加了哪个方向、课程或学科？'))} <em>${esc(rvText('Optional', '可选'))}</em></span><input data-rv-context="trackCourse" value="${esc(c.trackCourse)}" placeholder="${esc(rvText('For example: Biology practicum', '例如：生物学实践课'))}"></label>
      <div><span class="review-v2__label">${esc(rvText('How did you attend?', '你以什么形式参加？'))} <em>${esc(rvText('Optional', '可选'))}</em></span>${rvChoiceHTML(['Residential', 'Commuter', 'Online', 'Hybrid'], c.format, 'data-rv-context-choice data-rv-key="format"', false)}</div>
    </div>
    <div class="review-v2__footer"><a class="review-v2__back" href="#/program/${esc(program.id)}">${esc(rvText('Back to program', '返回项目'))}</a><button class="review-v2__primary" data-rv-next="general">${esc(rvText('Start my review', '开始评价'))}</button></div>${rvDraftNote()}
  </section>`;
}
function rvGeneralView(draft, program) {
  const g = draft.general;
  return `<section class="review-v2__shell">
    <div class="review-v2__progress"><span class="is-on"></span><span></span></div>
    <p class="review-v2__eyebrow">${esc(rvText('GENERAL REVIEW · 1 OF 2', '总体评价 · 1/2'))}</p>
    <h1>${esc(rvText('First impressions', '初印象'))}</h1>
    <p class="review-v2__lede review-v2__lede--compact review-v2__lede--affirmation">${esc(rvText('Please answer the questions honestly and engage with your true feelings. Your answers could be the Eureka moment for the next student :)', '请诚实回答，并感受自己的真实想法。你的回答可能会成为下一位学生的 Eureka 时刻 :)'))}</p>
    <div class="review-v2__panel">
      <section class="review-v2__question"><div class="review-v2__question-head"><h3>${esc(rvText('Overall, how was your experience in this program?', '总体来说，你在这个项目中的体验如何？'))}</h3></div>${rvChoiceHTML(['Loved it', 'Liked it', 'Mixed feelings', 'Didn’t like it', 'Regretted it'], g.overall, 'data-rv-general data-rv-key="overall"', false)}</section>
      <section class="review-v2__question"><div class="review-v2__question-head"><h3>${esc(rvText('Looking back, was it worth the time and money?', '回头看，它值得你投入的时间和金钱吗？'))}</h3></div>${rvChoiceHTML(['Definitely yes', 'Mostly yes', 'Not sure', 'Probably not', 'Definitely not'], g.value, 'data-rv-general data-rv-key="value"', false)}</section>
      <section class="review-v2__question"><div class="review-v2__question-head"><h3>${esc(rvText('Pick up to THREE words that capture the vibe of your program.', '最多选三个词，概括这个项目的氛围。'))}</h3><span>${g.vibes.length}/3</span></div>${rvChoiceHTML(REVIEW_V2.vibes, g.vibes, 'data-rv-vibe', true)}</section>
    </div>
    <div class="review-v2__footer"><button class="review-v2__back" data-rv-go="context">${esc(rvText('Back', '返回'))}</button><button class="review-v2__primary" data-rv-next="reflection">${esc(rvText('Continue', '继续'))}</button></div>${rvDraftNote()}
  </section>`;
}
function rvReflectionView(draft) {
  const g = draft.general;
  return `<section class="review-v2__shell review-v2__shell--story">
    <aside class="review-v2__memory-strip" aria-hidden="true"><div class="review-v2__polaroid review-v2__polaroid--campus"></div><div class="review-v2__polaroid review-v2__polaroid--sunset"></div><p>${esc(rvText('A moment from that summer…', '那年夏天的一个瞬间……'))}</p></aside>
    <div class="review-v2__story-main">
      <div class="review-v2__story-top"><p class="review-v2__eyebrow">${esc(rvText('GENERAL REVIEW · 2 OF 2', '总体评价 · 2/2'))}</p><div class="review-v2__progress"><span class="is-on"></span><span class="is-on"></span><span></span><span></span></div></div>
      <h1>${esc(rvText("There’s more to your summer than a rating. Tell us a little about it!", '暑期经历不止是一串评分。多讲一点吧！'))}</h1>
      <p class="review-v2__lede review-v2__lede--compact">${esc(rvText('You can pick one prompt to answer; a few sentences will be enough.', '选择一个提示回答即可；几句话就够了。'))}</p>
      <div class="review-v2__panel"><section class="review-v2__question">${rvChoiceHTML(REVIEW_V2.reflectionPrompts, g.reflectionPrompt, 'data-rv-reflection-prompt', false)}<textarea class="review-v2__textarea review-v2__textarea--large" data-rv-general-text="reflectionText" placeholder="${esc(rvText('Write what you remember…', '写下你记得的事情……'))}">${esc(g.reflectionText || '')}</textarea></section></div>
      <div class="review-v2__footer"><button class="review-v2__back" data-rv-go="general">${esc(rvText('← Back', '← 返回'))}</button><button class="review-v2__primary" data-rv-next="topics">${esc(rvText('Continue →', '继续 →'))}</button></div>${rvDraftNote()}
    </div>
  </section>`;
}
function rvTopicsView(draft, program) {
  return `<section class="review-v2__shell review-v2__shell--topics">
    <p class="review-v2__eyebrow">${esc(rvText('YOUR MEMORIES', '你的回忆'))}</p><h1>${esc(rvText('Have more memories to share?', '还有更多回忆想分享吗？'))}</h1>
    <p class="review-v2__lede review-v2__lede--compact">${esc(rvText('Choose any topic you have thoughts about. Entirely optional.', '选择任何你有想法的主题。全部可选。'))}</p>
    <div class="review-v2__topic-grid">${REVIEW_V2.categories.map(category => { const done = rvCompletedCategory(category, draft); return `<button class="review-v2__topic-card ${done ? 'is-done' : ''}" data-rv-topic="${category.id}"><span>${done ? '✓' : '＋'}</span><h2>${esc(category.title)}</h2><p>${esc(category.kicker)}</p><small>${esc(done ? rvText('Added to your draft', '已加入草稿') : rvText('Optional', '可选'))}</small></button>`; }).join('')}</div>
    <div class="review-v2__footer"><button class="review-v2__back" data-rv-go="reflection">${esc(rvText('Back', '返回'))}</button><button class="review-v2__primary" data-rv-go="review">${esc(rvText('Review my answers', '查看我的回答'))}</button></div>${rvDraftNote()}
  </section>`;
}
function rvCategoryView(draft) {
  const category = rvCategory(draft.activeCategory) || REVIEW_V2.categories[0];
  const answers = draft.optional[category.id] || (draft.optional[category.id] = {});
  return `<section class="review-v2__shell">
    <button class="review-v2__back review-v2__back--top" data-rv-go="topics">${esc(rvText('← Back to topics', '← 返回专题'))}</button>
    <p class="review-v2__eyebrow">${esc(rvText('OPTIONAL TOPIC', '可选专题'))}</p><h1>${esc(category.title)}</h1><p class="review-v2__lede review-v2__lede--compact">${esc(category.kicker)}</p>
    <div class="review-v2__panel">${category.fields.map(field => rvFieldHTML(field, answers, category.id)).join('')}</div>
    <div class="review-v2__footer"><button class="review-v2__back" data-rv-go="topics">${esc(rvText('Back to topics', '返回专题'))}</button><button class="review-v2__primary" data-rv-go="topics">${esc(rvText('Done', '完成'))}</button></div>${rvDraftNote()}
  </section>`;
}
function rvReviewView(draft, program) {
  const selected = REVIEW_V2.categories.filter(c => rvCompletedCategory(c, draft));
  return `<section class="review-v2__shell">
    <p class="review-v2__eyebrow">${esc(rvText('READY TO SAVE', '准备保存'))}</p><h1>${esc(rvText('Your review, at a glance', '你的评价，一览'))}</h1>
    <p class="review-v2__lede review-v2__lede--compact">${esc(rvText('You can still go back and edit anything before saving.', '保存前，你仍可以返回修改任何内容。'))}</p>
    <div class="review-v2__summary"><div><span>${esc(rvText('Program', '项目'))}</span><strong>${esc(rvProgramName(program))}</strong></div><div><span>${esc(rvText('General review', '总体评价'))}</span><strong>${esc(rvGeneralReady(draft) ? rvText('Completed', '已完成') : rvText('Needs a little more', '还差一点'))}</strong></div><div><span>${esc(rvText('Optional topics', '可选专题'))}</span><strong>${esc(selected.length ? selected.map(c => c.title).join(' · ') : rvText('Skipped for now', '暂时跳过'))}</strong></div></div>
    <label class="review-v2__contributor-optin"><input type="checkbox" data-rv-contributor-optin ${draft.foundingContributor ? 'checked' : ''}><span><strong>${esc(rvText('Join our Early Contributors wall', '加入早期贡献者感谢名单'))}</strong><small>${esc(rvText('With your permission, we’ll show your display name and the program you reviewed. Your contact details and review text stay private.', '经你同意后，我们会展示你的昵称与所评项目。联系方式和完整评价内容始终保持私密。'))}</small></span></label>
    <div class="review-v2__save-note"><strong>${esc(rvText('Save My Review', '保存我的评价'))}</strong><p>${esc(rvText('Sign in or create an account to save your answers and publish your review.', '登录或创建账户，以保存你的回答并发布评价。'))}</p></div>
    <div class="review-v2__footer"><button class="review-v2__back" data-rv-go="topics">${esc(rvText('Back to topics', '返回专题'))}</button><button class="review-v2__primary" data-rv-save>${esc(rvText('Save My Review', '保存我的评价'))}</button></div>${rvDraftNote()}
  </section>`;
}
function rvThanksView(program) {
  const joined = State.reviewDraft?.foundingContributor === true;
  return `<section class="review-v2__shell review-v2__thanks"><p class="review-v2__eyebrow">${esc(rvText('REVIEW SAVED', '评价已保存'))}</p><h1>${esc(rvText('Your review has been saved. Thank you for sharing your summer experience.', '你的评价已保存。感谢你分享自己的暑期经历。'))}</h1><p class="review-v2__lede">${esc(rvText('Your perspective can help the next student make a more informed choice.', '你的视角可以帮助下一位学生做出更明智的选择。'))}</p>${joined ? `<p class="review-v2__contributor-thanks">${esc(rvText('You also chose to join the Early Contributors wall. Thank you for helping build this resource.', '你还选择加入早期贡献者感谢名单。感谢你帮助我们建立这份资源。'))}</p><a class="review-v2__back review-v2__back--center" href="#/contributors">${esc(rvText('View the thank-you page', '查看感谢名单'))}</a>` : ''}<a class="review-v2__primary" href="#/program/${esc(program.id)}">${esc(rvText('Back to program', '返回项目'))}</a></section>`;
}
function bindReviewV2() {
  const draft = State.reviewDraft;
  if (!draft) return;
  $$('[data-rv-context]').forEach(input => input.addEventListener('input', () => { draft.context[input.dataset.rvContext] = input.value; rvPersist(); }));
  $$('[data-rv-context-choice]').forEach(button => button.addEventListener('click', () => { draft.context[button.dataset.rvKey] = button.dataset.value; rvPersist(); renderSurvey(draft.programId, { preserveScroll: true }); }));
  $$('[data-rv-general]').forEach(button => button.addEventListener('click', () => { draft.general[button.dataset.rvKey] = button.dataset.value; rvPersist(); renderSurvey(draft.programId, { preserveScroll: true }); }));
  $$('[data-rv-vibe]').forEach(button => button.addEventListener('click', () => { const value = button.dataset.value, values = draft.general.vibes; draft.general.vibes = values.includes(value) ? values.filter(v => v !== value) : (values.length >= 3 ? values : [...values, value]); rvPersist(); renderSurvey(draft.programId, { preserveScroll: true }); }));
  $$('[data-rv-reflection-prompt]').forEach(button => button.addEventListener('click', () => { draft.general.reflectionPrompt = button.dataset.value; rvPersist(); renderSurvey(draft.programId, { preserveScroll: true }); }));
  $$('[data-rv-general-text]').forEach(textarea => textarea.addEventListener('input', () => { draft.general[textarea.dataset.rvGeneralText] = textarea.value; rvPersist(); }));
  $$('[data-rv-choice]').forEach(button => button.addEventListener('click', () => { const bucket = draft.optional[button.dataset.rvArea]; const key = button.dataset.rvKey, value = button.dataset.value; if (button.dataset.rvMulti) { const values = Array.isArray(bucket[key]) ? bucket[key] : []; const exclusive = button.dataset.rvExclusive; bucket[key] = values.includes(value) ? values.filter(v => v !== value) : (value === exclusive ? [value] : [...values.filter(v => v !== exclusive), value]); } else bucket[key] = value; rvPersist(); renderSurvey(draft.programId, { preserveScroll: true }); }));
  $$('[data-rv-star]').forEach(button => button.addEventListener('click', () => { const bucket = draft.optional[button.dataset.rvArea]; bucket[button.dataset.rvKey] = Number(button.dataset.value); rvPersist(); renderSurvey(draft.programId, { preserveScroll: true }); }));
  $$('[data-rv-grid]').forEach(button => button.addEventListener('click', () => { const bucket = draft.optional[button.dataset.rvArea]; const values = bucket[button.dataset.rvKey] || {}; values[button.dataset.sub] = button.dataset.value === 'NA' ? 'NA' : Number(button.dataset.value); bucket[button.dataset.rvKey] = values; rvPersist(); renderSurvey(draft.programId, { preserveScroll: true }); }));
  $$('[data-rv-text]').forEach(textarea => textarea.addEventListener('input', () => { draft.optional[textarea.dataset.rvArea][textarea.dataset.rvKey] = textarea.value; rvPersist(); }));
  $$('[data-rv-prompt]').forEach(button => button.addEventListener('click', () => { draft.optional[button.dataset.rvArea][button.dataset.rvKey] = button.dataset.value; rvPersist(); renderSurvey(draft.programId, { preserveScroll: true }); }));
  $$('[data-rv-contributor-optin]').forEach(input => input.addEventListener('change', () => { draft.foundingContributor = input.checked; rvPersist(); }));
  $$('[data-rv-topic]').forEach(button => button.addEventListener('click', () => { draft.activeCategory = button.dataset.rvTopic; draft.screen = 'category'; rvPersist(); renderSurvey(draft.programId); }));
  $$('[data-rv-go]').forEach(button => button.addEventListener('click', () => { draft.screen = button.dataset.rvGo; rvPersist(); renderSurvey(draft.programId); }));
  $$('[data-rv-next]').forEach(button => button.addEventListener('click', () => {
    const next = button.dataset.rvNext;
    if (next === 'reflection' && !(draft.general.overall && draft.general.value && draft.general.vibes.length)) return rvShowError(rvText('Please answer the three quick questions first.', '请先完成三个简短问题。'));
    if (next === 'topics' && !(draft.general.reflectionPrompt && String(draft.general.reflectionText || '').trim())) return rvShowError(rvText('Choose one prompt and write a few sentences before continuing.', '继续前请选择一个提示并写几句话。'));
    draft.screen = next; rvPersist(); renderSurvey(draft.programId);
  }));
  const saveButton = $('[data-rv-save]');
  if (saveButton) saveButton.addEventListener('click', () => rvSaveReview());
}
function rvShowError(message) {
  const existing = $('.review-v2__error');
  if (existing) existing.remove();
  const el = document.createElement('p'); el.className = 'review-v2__error'; el.textContent = message;
  $('.review-v2__footer')?.before(el);
}
function rvSaveReview() {
  const draft = State.reviewDraft;
  if (!rvGeneralReady(draft)) { draft.screen = 'general'; rvPersist(); renderSurvey(draft.programId); return; }
  if (!window.SSDB.currentUser()) {
    draft.awaitingAuth = true; rvPersist();
    location.hash = '#/login';
    return;
  }
  const scoreMap = { 'Loved it':5, 'Liked it':4, 'Mixed feelings':3, 'Didn’t like it':2, 'Regretted it':1 };
  const context = draft.context || {};
  const who = [context.attendedYear, context.format].filter(Boolean).join(' · ');
  try {
    window.SSDB.recordRound(draft.programId, 'conversational-v2', { context, general:draft.general, optional:draft.optional, version:2 });
    window.SSDB.addReview({ programId:draft.programId, author:window.SSDB.currentUser().name || rvText('Student', '学生'), who, stars:scoreMap[draft.general.overall] || 3, text:draft.general.reflectionText, foundingContributor: draft.foundingContributor === true });
  } catch (err) {
    rvShowError(rvText('We could not save your review just yet. Your draft is still safe on this device.', '暂时无法保存评价。草稿仍安全地保存在此设备上。'));
    return;
  }
  draft.screen = 'thanks'; draft.awaitingAuth = false; rvPersist(); renderSurvey(draft.programId);
}

/* ============================ LANDING / PICKER ======================= */

const GUIDED_SUBJECT_ORDER = [
  'STEM', 'Business & Economics', 'Humanities & Social Sciences',
  'Arts & Design', 'Medicine & Health', 'Law & Government',
  'Architecture', 'Journalism & Media', 'Film & Media',
  'Environmental Studies', 'College Preparation'
];
const GUIDED_METHOD_ORDER = [
  'Classes & Lectures', 'Research', 'Project-Based Learning',
  'Seminars & Workshops', 'Labs & Experiments', 'Internships',
  'Mentorship & Advising', 'Case Studies & Simulations',
  'Fieldwork & Site Visits', 'Studio & Performance'
];

function guidedOptions(key) {
  const available = new Set(pickerFilterOptions(PROGRAMS, key).map(([value]) => value));
  const order = key === 'subjects' ? GUIDED_SUBJECT_ORDER : GUIDED_METHOD_ORDER;
  return [...order.filter(value => available.has(value)), ...[...available].filter(value => !order.includes(value))];
}

function guidedLabel(value, lang) {
  const translations = window.SS_PROGRAM_DISCOVERY?.translations || {};
  return lang === 'zh' ? (translations[value] || value) : value;
}

function guidedCardHTML(lang) {
  const step = State.guided.step;
  const key = step === 1 ? 'subjects' : 'methods';
  const options = guidedOptions(key);
  const selected = State.guided[key];
  const question = t(step === 1 ? 'landingExplorerSubjectTitle' : 'landingExplorerMethodTitle', lang);
  return `
    <div class="discovery-card__top">
      <span>${esc(t('landingExplorerStep', lang).replace('%d', step))}</span>
      <div class="discovery-card__progress" aria-hidden="true"><i class="is-active"></i><i class="${step === 2 ? 'is-active' : ''}"></i></div>
    </div>
    <h2 id="guidedQuestion" tabindex="-1">${esc(question)}</h2>
    <div class="discovery-options" role="group" aria-labelledby="guidedQuestion">
      ${options.map(value => `<button type="button" class="discovery-option ${selected.has(value) ? 'is-selected' : ''}" data-guided-value="${esc(value)}" aria-pressed="${selected.has(value)}"><span>${esc(guidedLabel(value, lang))}</span><span class="discovery-option__check" aria-hidden="true">${selected.has(value) ? '✓' : '+'}</span></button>`).join('')}
    </div>
    <div class="discovery-card__actions ${step === 1 ? 'discovery-card__actions--end' : ''}">
      ${step === 1
        ? `<button type="button" class="discovery-card__primary" id="guidedNext">${esc(t('landingExplorerContinue', lang))} <span aria-hidden="true">→</span></button>`
        : `<button type="button" class="discovery-card__secondary" id="guidedBack">${esc(t('landingExplorerBack', lang))}</button><button type="button" class="discovery-card__primary" id="guidedSubmit">${esc(t('landingExplorerSeeResults', lang))} <span aria-hidden="true">→</span></button>`}
    </div>
  `;
}

function openGuidedResults() {
  State.picker.query = '';
  State.picker.subjects = new Set(State.guided.subjects);
  State.picker.methods = new Set(State.guided.methods);
  State.picker.fromFinder = !!(State.picker.subjects.size || State.picker.methods.size);
  location.hash = '#/pick';
  window.scrollTo(0, 0);
}

function bindGuidedCard(lang, moveFocus = false) {
  const card = $('#guidedCard');
  if (!card) return;
  card.innerHTML = guidedCardHTML(lang);
  if (moveFocus) $('#guidedQuestion', card)?.focus();
  const key = State.guided.step === 1 ? 'subjects' : 'methods';
  $$('.discovery-option', card).forEach(button => button.addEventListener('click', () => {
    const value = button.dataset.guidedValue;
    const selected = State.guided[key];
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    const isSelected = selected.has(value);
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
    $('.discovery-option__check', button).textContent = isSelected ? '✓' : '+';
  }));
  $('#guidedNext', card)?.addEventListener('click', () => {
    State.guided.step = 2;
    bindGuidedCard(lang, true);
  });
  $('#guidedBack', card)?.addEventListener('click', () => {
    State.guided.step = 1;
    bindGuidedCard(lang, true);
  });
  $('#guidedSubmit', card)?.addEventListener('click', openGuidedResults);
}

function renderLanding() {
  const lang = L();
  const titleLines = lang === 'zh'
    ? ['找到属于', '你的夏天。']
    : ['Let’s find', 'your kind', 'of summer.'];
  const hasProgress = State.survey && State.survey.answers && Object.values(State.survey.answers).some(a => Object.keys(a).length);
  const program = hasProgress ? programById(State.survey.programId) : null;
  const experienceModules = [
    { route:'academics', title:'landingFeatureAcademics', question:'landingFeatureAcademicsQuestion', icon:'<path d="M3 5.5c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0V20c-3-1.5-6-1.5-9 0-3-1.5-6-1.5-9 0Z"/><path d="M12 5.5V20"/>' },
    { route:'students', title:'landingFeatureStudentLife', question:'landingFeatureStudentLifeQuestion', icon:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>' },
    { route:'campus', title:'landingFeatureCampusLife', question:'landingFeatureCampusLifeQuestion', icon:'<path d="m3 9 9-6 9 6H3ZM5 10v9m7-9v9m7-9v9M3 21h18"/>' },
    { route:'outcomes', title:'landingFeatureTakeaways', question:'landingFeatureTakeawaysQuestion', icon:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>' }
  ];
  const missionGraphics = ['home-person-1.svg', 'home-person-2.svg', 'home-person-3.svg'];
  const journeyPaths = [
    { href: '#/pick', title: 'landingPathHaveTitle', body: 'landingPathHaveBody', action: 'landingPathHaveAction', catalog: true, figure: 1, notes: lang === 'zh' ? ['同一页面', '项目官方信息 + 学生体验', '日期 · 费用 · 申请资格'] : ['One page', 'Official program facts + student experiences', 'Dates · Cost · Eligibility'] },
    { href: '#/matchmaker', title: 'landingPathMatchTitle', body: 'landingPathMatchBody', action: 'landingPathMatchAction', figure: 2, notes: lang === 'zh' ? ['从你出发', '感兴趣的学科', '学习方式 · 预算 · 日期'] : ['Start with you', 'Subjects you enjoy', 'Learning style · Budget · Dates'] },
    { href: '#/pick', title: 'landingPathReviewTitle', body: 'landingPathReviewBody', action: 'landingPathReviewAction', catalog: true, figure: 3, notes: lang === 'zh' ? ['你的视角', '有什么出乎意料？', '你会告诉朋友什么？'] : ['Your perspective', 'What surprised you?', 'What would you tell a friend?'] },
    { href: '#/rankings', title: 'landingPathRankTitle', body: 'landingPathRankBody', action: 'landingPathRankAction', notes: [] }
  ];
  const html = `
    ${renderHeader('home')}
    <main>
      <section class="discovery-hero">
        <figure class="discovery-hero__photo">
          <img src="assets/images/home-students-illustrative.jpg" alt="${esc(t('landingPhotoAlt', lang))}" loading="eager" decoding="async">
          <figcaption>${esc(t('landingPhotoCaption', lang))}</figcaption>
        </figure>
        <div class="discovery-hero__inner">
          <div class="discovery-hero__copy">
            <div class="discovery-hero__message">
              <span class="eyebrow">${esc(t('landingExplorerEyebrow', lang))}</span>
              <h1>${titleLines.map(line => `<span>${esc(line)}</span>`).join('')}</h1>
              <p>${esc(t('landingExplorerSub', lang))}</p>
              <a class="discovery-browse landing-catalog-link" href="#/pick" id="browseAllPrograms">${esc(t('landingExplorerBrowse', lang))} <span aria-hidden="true">→</span></a>
              <span class="discovery-hero__note">${esc(t('landingExplorerNoLogin', lang))}</span>
            </div>
          </div>
          <div class="discovery-card" id="guidedCard"></div>
          ${program ? `
            <div class="discovery-resume">
              <div><span>${esc(t('landingCta', lang))}</span><strong>${esc(pickL(program.name))}</strong></div>
              <a href="#/survey/${esc(program.id)}">${esc(t('surveyNext', lang))} <span aria-hidden="true">→</span></a>
            </div>
          ` : ''}
        </div>
      </section>
      <section class="landing-mission-artwork" aria-labelledby="landingMissionTitle">
        <svg class="landing-home-icon-sprite" aria-hidden="true" focusable="false">
          <symbol id="landing-wallet" viewBox="0 0 64 64"><rect x="7" y="18" width="50" height="35" rx="7"/><path d="M10 18v-6a5 5 0 0 1 5-5h35v11M38 31h19v14H38a6 6 0 0 1-6-7 6 6 0 0 1 6-7Z"/><circle cx="41" cy="38" r="1.5"/></symbol>
          <symbol id="landing-megaphone" viewBox="0 0 64 64"><path d="M8 29v12h11l31 13V16L19 29H8ZM19 41l4 14h10l-5-18M50 25l7-4M50 45l7 4"/></symbol>
          <symbol id="landing-search" viewBox="0 0 64 64"><circle cx="26" cy="25" r="16"/><path d="m38 38 16 16M20 25h12M26 19v12"/></symbol>
          <symbol id="landing-book" viewBox="0 0 64 64"><path d="M7 13c10-5 18-5 25 0 7-5 15-5 25 0v40c-10-5-18-5-25 0-7-5-15-5-25 0V13ZM32 13v40M13 23c4-2 8-2 12 0M39 23c4-2 8-2 12 0"/></symbol>
          <symbol id="landing-spark" viewBox="0 0 64 64"><path d="m31 5 5 17 17 5-17 5-5 17-5-17-17-5 17-5 5-17ZM50 42l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z"/></symbol>
          <symbol id="landing-pen" viewBox="0 0 64 64"><path d="M14 44 44 14l7 7-30 30-12 4 5-11ZM39 19l7 7M11 58h42"/></symbol>
          <symbol id="landing-chart" viewBox="0 0 64 64"><path d="M8 56h48M13 45V30h9v15M28 45V21h9v24M43 45V12h9v33"/></symbol>
        </svg>
        <div class="landing-mission-artwork__inner">
          <span class="landing-mission-artwork__spark landing-mission-artwork__spark--left" aria-hidden="true">✦</span>
          <span class="landing-mission-artwork__spark landing-mission-artwork__spark--right" aria-hidden="true">✦</span>
          <h2 id="landingMissionTitle">${esc(t('landingMissionTitle', lang))}</h2>
          <p class="landing-mission-artwork__intro">${esc(t('landingMissionIntro', lang))}</p>
          <div class="landing-mission-artwork__cards">
            ${['landingMissionCost', 'landingMissionMarketing', 'landingMissionForums'].map((key, index) => `
              <article class="landing-mission-artwork__card">
                <span class="landing-mission-artwork__card-number" aria-hidden="true">0${index + 1}</span>
                <div class="landing-mission-artwork__card-copy"><p>${esc(t(key, lang))}</p></div>
                <img class="landing-mission-artwork__graphic" src="assets/images/${missionGraphics[index]}" alt="" aria-hidden="true">
                <span class="landing-mission-artwork__card-spark" aria-hidden="true">✦</span>
              </article>
            `).join('')}
          </div>
        </div>
      </section>
      <section class="landing-pathways" aria-labelledby="landingPathsTitle">
        <div class="landing-pathways__inner">
          <div class="landing-section__heading">
            <h2 id="landingPathsTitle">${esc(t('landingPathsTitle', lang))}</h2>
            <p>${esc(t('landingPathsIntro', lang))}</p>
          </div>
          <div class="landing-pathways__journey">
            ${journeyPaths.map((path, index) => `
              <article class="landing-pathways__step landing-pathways__step--${index + 1}">
                <div class="landing-pathways__copy">
                  <span class="landing-pathways__number" aria-hidden="true">0${index + 1}</span>
                  ${lang === 'en' ? `<img class="landing-pathways__vector-copy" src="assets/images/home-lettering-${index + 1}.svg" alt="" aria-hidden="true" loading="lazy">` : ''}
                  <div class="landing-pathways__live-copy${lang === 'en' ? ' landing-pathways__live-copy--accessible' : ''}"><h3>${esc(t(path.title, lang))}</h3><p>${esc(t(path.body, lang))}</p></div>
                  <a class="landing-pathways__action${path.catalog ? ' landing-catalog-link' : ''}" href="${path.href}">${esc(t(path.action, lang))}</a>
                </div>
                <div class="landing-pathways__visual" aria-hidden="true">
                  ${path.figure ? `<span class="landing-pathways__figure landing-pathways__figure--${index + 1}"><img src="assets/images/home-person-${path.figure}.svg" alt="" loading="lazy"></span>
                    <span class="landing-pathways__note landing-pathways__note--top"><small>${esc(path.notes[0])}</small>${esc(path.notes[1])}</span>
                    <span class="landing-pathways__note landing-pathways__note--bottom">${esc(path.notes[2])}</span>` : `
                    <div class="landing-pathways__scoreboard"><strong>${lang === 'zh' ? '学生评分维度' : 'Student rating categories'}</strong><span>${lang === 'zh' ? '总体体验' : 'Overall'}</span><span>${lang === 'zh' ? '学术' : 'Academics'}</span><span>${lang === 'zh' ? '学生生活' : 'Student life'}</span><span>${lang === 'zh' ? '校园生活' : 'Campus life'}</span></div>`}
                  <span class="landing-pathways__doodle landing-pathways__doodle--top">✦</span><span class="landing-pathways__doodle landing-pathways__doodle--bottom">✦</span>
                </div>
              </article>
            `).join('')}
          </div>
        </div>
      </section>

    </main>
    ${renderFooter()}
  `;
  $('#app').innerHTML = html;
  bindHeaderEvents();
  bindGuidedCard(lang);
  $$('.landing-catalog-link').forEach(link => link.addEventListener('click', () => {
    State.picker.query = '';
    State.picker.subjects.clear();
    State.picker.methods.clear();
    State.picker.fromFinder = false;
  }));
}

function normalizePickerText(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().replace(/\s+/g, ' ');
}

function pickerFilterOptions(programs, key) {
  const counts = new Map();
  programs.forEach(program => (program.discovery && program.discovery[key] || []).forEach(value => {
    counts.set(value, (counts.get(value) || 0) + 1);
  }));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function pickerFilteredPrograms(programs) {
  const selected = State.picker;
  const translations = (window.SS_PROGRAM_DISCOVERY && window.SS_PROGRAM_DISCOVERY.translations) || {};
  const terms = normalizePickerText(selected.query).split(' ').filter(Boolean);
  return programs.filter(program => {
    const discovery = program.discovery || { subjects: [], methods: [] };
    if (selected.subjects.size && !discovery.subjects.some(value => selected.subjects.has(value))) return false;
    if (selected.methods.size && !discovery.methods.some(value => selected.methods.has(value))) return false;
    if (!terms.length) return true;
    const places = [...(programCardPlace(program, 'en') || []), ...(programCardPlace(program, 'zh') || [])];
    const tags = [...discovery.subjects, ...discovery.methods];
    const fields = [
      ...Object.values(program.name || {}), ...Object.values(program.host || {}),
      ...Object.values(program.location || {}), ...Object.values(program.category || {}),
      ...places, ...tags, ...tags.map(value => translations[value] || ''),
    ];
    const haystack = fields.map(normalizePickerText).join(' ');
    return terms.every(term => haystack.includes(term));
  });
}

function pickerFilterGroupHTML(programs, key, lang) {
  const catalog = window.SS_PROGRAM_DISCOVERY;
  const heading = catalog.labels[key][lang];
  const selected = State.picker[key];
  return `
    <fieldset class="program-filters__group">
      <legend>${esc(heading)}</legend>
      ${pickerFilterOptions(programs, key).map(([value, count]) => `
        <label class="program-filter-option">
          <input type="checkbox" data-filter-group="${key}" value="${esc(value)}" ${selected.has(value) ? 'checked' : ''}>
          <span class="program-filter-option__label">${esc(lang === 'zh' ? catalog.translations[value] || value : value)}</span>
          <span class="program-filter-option__count" aria-hidden="true">${count}</span>
        </label>`).join('')}
    </fieldset>`;
}

function pickerResultsHTML(programs, lang) {
  return programs.length
    ? programs.map(program => {
      const matched = State.picker.fromFinder
        ? ['subjects', 'methods'].flatMap(key => (program.discovery?.[key] || []).filter(value => State.picker[key].has(value)))
        : [];
      return programCardHTML(program, lang, matched);
    }).join('')
    : `<div class="program-catalog-empty"><p>${esc(t('pickerNoMatch', lang))}</p><button type="button" id="clearAllResults">${esc(t('pickerClearAll', lang))}</button></div>`;
}

function renderPicker(filter) {
  const lang = L();
  // The full pre-college catalog remains browseable; the optional route
  // segment is accepted for old links but does not change the listing.
  const programs = PROGRAMS;
  const initialResults = pickerFilteredPrograms(programs);
  const activeCount = State.picker.subjects.size + State.picker.methods.size;
  const html = `
    ${renderHeader('pick')}
    <main>
      <section class="hero ${State.picker.fromFinder ? 'guided-results-hero' : ''}" style="padding-top:50px;padding-bottom:10px">
        <h1 id="pickerPageTitle">${esc(t(State.picker.fromFinder ? 'pickerGuidedTitle' : 'pickerTitle', lang))}</h1>
        <p id="pickerPageSub">${esc(t(State.picker.fromFinder ? 'pickerGuidedSub' : 'pickerSub', lang))}</p>
        ${State.picker.fromFinder ? `
          <div class="guided-results-summary" id="guidedResultsSummary">
            <span class="guided-results-summary__label">${esc(t('pickerGuidedYourChoices', lang))}</span>
            <span class="guided-results-summary__choices" id="guidedResultsChoices">${[...State.picker.subjects, ...State.picker.methods].map(value => `<span class="guided-results-summary__chip">${esc(guidedLabel(value, lang))}</span>`).join('')}</span>
            <a href="#/" id="editGuidedChoices">${esc(t('pickerGuidedEdit', lang))} →</a>
          </div>` : ''}
      </section>
      <section class="section section--catalog" style="padding-top:0">
        <div class="search">
          <input id="search" type="search" aria-label="${esc(t('pickerSearch', lang))}" placeholder="${esc(t('pickerSearch', lang))}" value="${esc(State.picker.query)}">
        </div>
        <div class="program-catalog-layout">
          <aside class="program-filters ${State.picker.filtersOpen ? 'is-open' : ''}" aria-label="${esc(t('pickerFilters', lang))}">
            <div class="program-filters__header">
              <h2>${esc(t('pickerFilters', lang))}</h2>
              <button type="button" id="clearFilters" ${activeCount ? '' : 'disabled'}>${esc(t('pickerClearFilters', lang))}</button>
            </div>
            <button type="button" class="program-filters__toggle" id="filterToggle" aria-expanded="${State.picker.filtersOpen}" aria-controls="filterGroups">
              <span class="program-filters__toggle-label">${esc(t(State.picker.filtersOpen ? 'pickerHideFilters' : 'pickerShowFilters', lang))}</span>
              <span class="program-filters__selection">${esc(t('pickerSelected', lang).replace('%d', activeCount))}</span>
            </button>
            <div class="program-filters__groups" id="filterGroups">
              <p class="program-filters__hint">${esc(t('pickerFilterHint', lang))}</p>
              ${pickerFilterGroupHTML(programs, 'subjects', lang)}
              ${pickerFilterGroupHTML(programs, 'methods', lang)}
            </div>
          </aside>
          <div class="program-catalog-results">
            <div class="program-catalog-toolbar">
              <div class="program-catalog-count" id="programCatalogCount" role="status" aria-live="polite">${esc(t('pickerCount', lang).replace('%d', initialResults.length))}</div>
              <div class="program-catalog-toolbar__actions">
                <a class="program-catalog-feedback" href="https://docs.google.com/forms/d/e/1FAIpQLSctKBz1oGqSyFv1Wkur0fK4GDRzMipfX0uqW1PXSrZNkWTj2g/viewform?usp=publish-editor" target="_blank" rel="noopener noreferrer">${esc(lang === 'zh' ? '找不到项目？告诉我们！' : 'Can’t find a program? Tell us!')}</a>
                <button type="button" class="program-catalog-write-review" id="programCatalogWriteReview">${esc(lang === 'zh' ? '写评价' : 'Write a review')}</button>
              </div>
            </div>
            <p class="program-catalog-review-hint" id="programCatalogReviewHint" hidden aria-live="polite"></p>
            <div class="program-grid" id="grid">${pickerResultsHTML(initialResults, lang)}</div>
          </div>
        </div>
      </section>
    </main>
    ${renderFooter()}
  `;
  $('#app').innerHTML = html;
  bindHeaderEvents();

  const input = $('#search');
  const grid = $('#grid');
  const filtersPanel = $('.program-filters');
  const clearFilters = $('#clearFilters');
  const toggle = $('#filterToggle');
  $('#programCatalogWriteReview')?.addEventListener('click', () => {
    location.hash = '#/survey';
  });
  $('#editGuidedChoices')?.addEventListener('click', () => { State.guided.step = 1; });
  const updateResults = () => {
    const matches = pickerFilteredPrograms(programs);
    if (State.picker.fromFinder && !State.picker.subjects.size && !State.picker.methods.size) {
      State.picker.fromFinder = false;
      $('#guidedResultsSummary')?.remove();
      $('.guided-results-hero')?.classList.remove('guided-results-hero');
      $('#pickerPageTitle').textContent = t('pickerTitle', lang);
      $('#pickerPageSub').textContent = t('pickerSub', lang);
    }
    const chosen = $('#guidedResultsChoices');
    if (chosen) chosen.innerHTML = [...State.picker.subjects, ...State.picker.methods]
      .map(value => `<span class="guided-results-summary__chip">${esc(guidedLabel(value, lang))}</span>`).join('');
    $('#programCatalogCount').textContent = t('pickerCount', lang).replace('%d', matches.length);
    grid.innerHTML = pickerResultsHTML(matches, lang);
    const count = State.picker.subjects.size + State.picker.methods.size;
    clearFilters.disabled = count === 0;
    $('.program-filters__selection', toggle).textContent = t('pickerSelected', lang).replace('%d', count);
    const clearAll = $('#clearAllResults');
    if (clearAll) clearAll.addEventListener('click', () => {
      State.picker.query = '';
      input.value = '';
      resetFilters();
    });
  };
  const resetFilters = () => {
    State.picker.subjects.clear();
    State.picker.methods.clear();
    $$('.program-filter-option input', filtersPanel).forEach(checkbox => { checkbox.checked = false; });
    updateResults();
  };
  input.addEventListener('input', () => {
    State.picker.query = input.value;
    updateResults();
  });
  $$('.program-filter-option input', filtersPanel).forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const selected = State.picker[checkbox.dataset.filterGroup];
      if (checkbox.checked) selected.add(checkbox.value);
      else selected.delete(checkbox.value);
      updateResults();
    });
  });
  clearFilters.addEventListener('click', resetFilters);
  toggle.addEventListener('click', () => {
    State.picker.filtersOpen = !State.picker.filtersOpen;
    filtersPanel.classList.toggle('is-open', State.picker.filtersOpen);
    toggle.setAttribute('aria-expanded', String(State.picker.filtersOpen));
    $('.program-filters__toggle-label', toggle).textContent = t(State.picker.filtersOpen ? 'pickerHideFilters' : 'pickerShowFilters', lang);
  });
  grid.addEventListener('click', event => {
    const card = event.target.closest('.program-card');
    if (card) location.hash = `#/program/${card.dataset.id}`;
  });
  grid.addEventListener('keydown', event => {
    const card = event.target.closest('.program-card');
    if (!card || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    location.hash = `#/program/${card.dataset.id}`;
  });
  const clearAll = $('#clearAllResults');
  if (clearAll) clearAll.addEventListener('click', () => {
    State.picker.query = '';
    input.value = '';
    resetFilters();
  });
}

const PROGRAM_CARD_PLACES = {
  'berkeley.edu': ['California', 'Berkeley', '加利福尼亚州', '伯克利'],
  'brown.edu': ['Rhode Island', 'Providence', '罗德岛州', '普罗维登斯'],
  'bu.edu': ['Massachusetts', 'Boston', '马萨诸塞州', '波士顿'],
  'cee.org': ['Massachusetts / California', 'Cambridge / Stanford', '马萨诸塞州 / 加利福尼亚州', '剑桥 / 斯坦福'],
  'cmu.edu': ['Pennsylvania', 'Pittsburgh', '宾夕法尼亚州', '匹兹堡'],
  'columbia.edu': ['New York', 'New York City', '纽约州', '纽约市'],
  'duke.edu': ['North Carolina', 'Durham', '北卡罗来纳州', '达勒姆'],
  'georgetown.edu': ['District of Columbia', 'Washington', '华盛顿特区', '华盛顿'],
  'harvard.edu': ['Massachusetts', 'Cambridge', '马萨诸塞州', '剑桥'],
  'jhu.edu': ['Maryland', 'Baltimore', '马里兰州', '巴尔的摩'],
  'mit.edu': ['Massachusetts', 'Cambridge', '马萨诸塞州', '剑桥'],
  'nd.edu': ['Indiana', 'Notre Dame', '印第安纳州', '圣母大学'],
  'northwestern.edu': ['Illinois', 'Evanston', '伊利诺伊州', '埃文斯顿'],
  'rice.edu': ['Texas', 'Houston', '德克萨斯州', '休斯顿'],
  'stanford.edu': ['California', 'Stanford', '加利福尼亚州', '斯坦福'],
  'uchicago.edu': ['Illinois', 'Chicago', '伊利诺伊州', '芝加哥'],
  'ucla.edu': ['California', 'Los Angeles', '加利福尼亚州', '洛杉矶'],
  'ucsb.edu': ['California', 'Santa Barbara', '加利福尼亚州', '圣巴巴拉'],
  'ucsc.edu': ['California', 'Santa Cruz', '加利福尼亚州', '圣克鲁兹'],
  'ucsd.edu': ['California', 'La Jolla', '加利福尼亚州', '拉霍亚'],
  'umich.edu': ['Michigan', 'Ann Arbor', '密歇根州', '安娜堡'],
  'upenn.edu': ['Pennsylvania', 'Philadelphia', '宾夕法尼亚州', '费城'],
  'usc.edu': ['California', 'Los Angeles', '加利福尼亚州', '洛杉矶'],
  'yale.edu': ['Connecticut', 'New Haven', '康涅狄格州', '纽黑文'],
};

const PROGRAM_CARD_SCHOOLS = {
  'berkeley.edu': ['University of California, Berkeley', '加州大学伯克利分校'],
  'brown.edu': ['Brown University', '布朗大学'],
  'bu.edu': ['Boston University', '波士顿大学'],
  'cee.org': ['MIT · Stanford University', '麻省理工学院 · 斯坦福大学'],
  'cmu.edu': ['Carnegie Mellon University', '卡内基梅隆大学'],
  'columbia.edu': ['Columbia University', '哥伦比亚大学'],
  'duke.edu': ['Duke University', '杜克大学'],
  'georgetown.edu': ['Georgetown University', '乔治城大学'],
  'harvard.edu': ['Harvard University', '哈佛大学'],
  'jhu.edu': ['Johns Hopkins University', '约翰斯·霍普金斯大学'],
  'mit.edu': ['Massachusetts Institute of Technology', '麻省理工学院'],
  'nd.edu': ['University of Notre Dame', '圣母大学'],
  'northwestern.edu': ['Northwestern University', '西北大学'],
  'rice.edu': ['Rice University', '莱斯大学'],
  'stanford.edu': ['Stanford University', '斯坦福大学'],
  'uchicago.edu': ['University of Chicago', '芝加哥大学'],
  'ucla.edu': ['University of California, Los Angeles', '加州大学洛杉矶分校'],
  'ucsb.edu': ['University of California, Santa Barbara', '加州大学圣巴巴拉分校'],
  'ucsc.edu': ['University of California, Santa Cruz', '加州大学圣克鲁兹分校'],
  'ucsd.edu': ['University of California, San Diego', '加州大学圣地亚哥分校'],
  'umich.edu': ['University of Michigan', '密歇根大学'],
  'upenn.edu': ['University of Pennsylvania', '宾夕法尼亚大学'],
  'usc.edu': ['University of Southern California', '南加州大学'],
  'yale.edu': ['Yale University', '耶鲁大学'],
};

function programLogoDomain(p) {
  return String(p.logoDomain || (window.SSDATA && window.SSDATA.UNIV_DOMAIN && window.SSDATA.UNIV_DOMAIN[p.id]) || '').toLowerCase();
}

const PROGRAM_CARD_HD_LOGOS = {
  'adelphi.edu': 'adelphi.edu.hd.png',
  'american.edu': 'american.edu.hd.svg',
  'awesomemath.org': 'awesomemath.org.hd.png',
  'babson.edu': 'babson.edu.hd.svg',
  'barnard.edu': 'barnard.edu.hd.png',
  'bentley.edu': 'bentley.edu.hd.png',
  'brandeis.edu': 'brandeis.edu.hd.png',
  'clemson.edu': 'clemson.edu.hd.png',
  'cornell.edu': 'cornell.edu.hd.svg',
  'depauw.edu': 'depauw.edu.hd.png',
  'drexel.edu': 'drexel.edu.hd.png',
  'emory.edu': 'emory.edu.hd.svg',
  'gatech.edu': 'gatech.edu.hd.svg',
  'highpoint.edu': 'highpoint.edu.hd.svg',
  'ithaca.edu': 'ithaca.edu.hd.png',
  'kenyonreview.org': 'kenyonreview.org.hd.svg',
  'launchx.com': 'launchx.com.hd.svg',
  'leangap.org': 'leangap.org.hd.svg',
  'lehigh.edu': 'lehigh.edu.hd.png',
  'marist.edu': 'marist.edu.hd.svg',
  'mathcamp.org': 'mathcamp.org.hd.svg',
  'mathily.org': 'mathily.org.hd.jpg',
  'mathpath.org': 'mathpath.org.hd.jpg',
  'miamioh.edu': 'miamioh.edu.hd.svg',
  'mtu.edu': 'mtu.edu.hd.png',
  'nmt.edu': 'nmt.edu.hd.png',
  'nyu.edu': 'nyu.edu.hd.svg',
  'princeton.edu': 'princeton.edu.hd.svg',
  'promys.org': 'promys.org.hd.png',
  'psu.edu': 'psu.edu.hd.svg',
  'purdue.edu': 'purdue.edu.hd.svg',
  'rochester.edu': 'rochester.edu.hd.svg',
  'rose-hulman.edu': 'rose-hulman.edu.hd.png',
  'rossprogram.org': 'rossprogram.org.hd.svg',
  'rutgers.edu': 'rutgers.edu.hd.svg',
  'sewanee.edu': 'sewanee.edu.hd.png',
  'skidmore.edu': 'skidmore.edu.hd.svg',
  'smith.edu': 'smith.edu.hd.svg',
  'ssp.org': 'ssp.org.hd.svg',
  'stevens.edu': 'stevens.edu.hd.png',
  'stonybrook.edu': 'stonybrook.edu.hd.png',
  'syr.edu': 'syr.edu.hd.svg',
  'theadroitjournal.org': 'theadroitjournal.org.hd.png',
  'ttu.edu': 'ttu.edu.hd.svg',
  'tufts.edu': 'tufts.edu.hd.svg',
  'tulane.edu': 'tulane.edu.hd.svg',
  'ucdavis.edu': 'ucdavis.edu.hd.svg',
  'uconn.edu': 'uconn.edu.hd.svg',
  'ucsb.edu': 'ucsb.edu.hd.png',
  'udel.edu': 'udel.edu.hd.svg',
  'ufl.edu': 'ufl.edu.hd.svg',
  'uiowa.edu': 'uiowa.edu.hd.png',
  'umass.edu': 'umass.edu.hd.svg',
  'umd.edu': 'umd.edu.hd.svg',
  'unh.edu': 'unh.edu.hd.svg',
  'utexas.edu': 'utexas.edu.hd.svg',
  'uvm.edu': 'uvm.edu.hd.svg',
  'vanderbilt.edu': 'vanderbilt.edu.hd.svg',
  'vassar.edu': 'vassar.edu.hd.png',
  'virginia.edu': 'virginia.edu.hd.svg',
  'vt.edu': 'vt.edu.hd.svg',
  'washu.edu': 'washu.edu.hd.svg',
  'wfu.edu': 'wfu.edu.hd.svg',
  'wisc.edu': 'wisc.edu.hd.svg',
  'wm.edu': 'wm.edu.hd.svg',
  'wpi.edu': 'wpi.edu.hd.svg',
};

function programLogoUrl(p) {
  const domain = programLogoDomain(p);
  if (!domain) return '';
  const name = PROGRAM_CARD_HD_LOGOS[domain] || domain + (PROGRAM_CARD_PLACES[domain] ? '.svg' : '.png');
  return 'assets/images/school-logos/' + encodeURIComponent(name);
}

function programCardPlace(p, lang) {
  const place = PROGRAM_CARD_PLACES[programLogoDomain(p)];
  if (!place) return null;
  if (p.id === 'catalog-061-aspire-high-school-mentoring-program') {
    return lang === 'zh' ? ['马里兰州', '劳雷尔'] : ['Maryland', 'Laurel'];
  }
  return lang === 'zh' ? [place[2], place[3]] : [place[0], place[1]];
}

function programCardDiscoveryHTML(p, lang) {
  const catalog = window.SS_PROGRAM_DISCOVERY;
  if (!catalog || !p.discovery) return '';
  const groups = ['subjects', 'methods'].map(key => {
    const values = p.discovery[key] || [];
    if (!values.length) return '';
    const label = catalog.labels[key][lang] || catalog.labels[key].en;
    return `
      <div class="program-card__discovery-group" role="group" aria-label="${esc(label)}">
        <span class="program-card__discovery-label">${esc(label)}</span>
        <div class="program-card__tags">
          ${values.map(value => `<span class="program-card__tag">${esc(lang === 'zh' ? catalog.translations[value] || value : value)}</span>`).join('')}
        </div>
      </div>`;
  }).join('');
  return `<div class="program-card__discovery">${groups}</div>`;
}

function programCardHTML(p, lang, matchedLabels = []) {
  const logo = programLogoUrl(p);
  const logoCoverStyle = ['uconn.edu', 'uvm.edu', 'promys.org'].includes(programLogoDomain(p)) ? 'background:#103d33' : '';
  const img = logo || p.image;
  const isLogo = !!logo || (!!p.image && /\.svg(?:\.png)?|seal|shield|logo|crest|coat[_-]of[_-]arms/i.test(String(p.image)));
  const place = programCardPlace(p, lang);
  const initials = pickL(p.host).split(/\s+/).filter(Boolean).slice(0, 3).map(word => word.charAt(0)).join('').toUpperCase();
  const fallbackStyle = `background:linear-gradient(135deg,${esc(p.cover || '#0a3a2e')}22,${esc(p.cover || '#0a3a2e')}66)`;
  return `
    <article class="program-card" data-id="${esc(p.id)}" tabindex="0" role="link" aria-label="${esc(pickL(p.name))}" style="cursor:pointer">
      <div class="program-card__cover ${img ? '' : 'program-card__cover--fallback'} ${isLogo ? 'program-card__cover--logo' : ''}" ${img ? (logoCoverStyle ? `style="${logoCoverStyle}"` : '') : `style="${fallbackStyle}"`}>
        ${img ? `<img class="program-card__image" src="${esc(img)}" alt="${esc(isLogo ? pickL(p.host) + ' logo' : pickL(p.name))}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.parentElement.classList.remove('program-card__cover--logo');this.parentElement.classList.add('program-card__cover--fallback');this.parentElement.style.background='${fallbackStyle.replace(/'/g, '&apos;')}'">` : ''}
        <span class="program-card__monogram" aria-hidden="true">${esc(initials || 'SS')}</span>
      </div>
      <div class="program-card__body">
        <h3>${esc(pickL(p.name))}</h3>
        ${matchedLabels.length ? `<p class="program-card__match-note"><strong>${esc(t('pickerGuidedMatch', lang))}:</strong> ${esc(matchedLabels.map(value => guidedLabel(value, lang)).join(' · '))}</p>` : ''}
        <div class="program-card__details">
          <div class="program-card__identity">
            <div class="program-card__school">${esc((PROGRAM_CARD_SCHOOLS[programLogoDomain(p)] || [pickL(p.host), pickL(p.host)])[lang === 'zh' ? 1 : 0])}</div>
            ${place ? `<div class="program-card__place"><span>${esc(place[0])}</span><span>${esc(place[1])}</span></div>` : ''}
          </div>
          ${programCardDiscoveryHTML(p, lang)}
        </div>
      </div>
    </article>
  `;
}

/* ============================ PROGRAM PROFILE ======================= */

function programSummaryIcon(type) {
  const paths = {
    location: '<path d="M12 21s7-5.2 7-12A7 7 0 1 0 5 9c0 6.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    format: '<path d="m3 9 9-6 9 6-9 6-9-6Z"/><path d="M7 12v5c3 2 7 2 10 0v-5"/>',
    host: '<path d="M4 21V9l8-5 8 5v12M9 21v-6h6v6M3 21h18"/>',
    academics: '<path d="M3 5.5c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0V20c-3-1.5-6-1.5-9 0-3-1.5-6-1.5-9 0Z"/><path d="M12 5.5V20"/>',
    students: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>',
    campus: '<path d="m3 9 9-6 9 6H3ZM5 10v9m7-9v9m7-9v9M3 21h18"/>',
    outcomes: '<path d="M4 4h16v5a8 8 0 0 1-16 0V4Z"/><path d="M8 21h8M12 17v4M4 7H2v2a4 4 0 0 0 4 4M20 7h2v2a4 4 0 0 1-4 4"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[type] || paths.academics}</svg>`;
}

/* Program experience pages ---------------------------------------------------
 * Student-generated scores, distributions, and stories are only rendered
 * after verified responses exist.  The page never falls back to layout/demo
 * data, so visitors cannot mistake a placeholder for student feedback.
 */

function isYYGSProgramId(id) {
  return id === 'yygs' || /yale-young-global-scholars|yygs/i.test(String(id || ''));
}

function yygsPreviewCopy(lang) {
  return lang === 'zh'
    ? '示例预览 · 48 份虚构回答，仅用于确认页面布局'
    : 'Sample preview · 48 fictional responses for layout review';
}

function yygsPlainValue(value, lang, fallback) {
  const localized = value && typeof value === 'object' ? pickL(value) : value;
  const translated = officialText(localized, lang);
  const text = String(translated || localized || '')
    .replace(/<[^>]*>/g, '')
    .replace(/^[•\s]+/, '')
    .split(/\n|•/)[0]
    .trim();
  return text || fallback;
}

function yygsHeaderFacts(program, lang) {
  const zh = lang === 'zh';
  const pending = zh ? '待官网确认' : 'To be confirmed';
  const info = program?.officialInfo || {};
  return {
    title: yygsPlainValue(program?.name, lang, pending),
    host: yygsPlainValue(program?.host, lang, pending),
    dates: yygsPlainValue(info.programDates || program?.duration, lang, pending),
    location: yygsPlainValue(program?.location, lang, pending),
    format: yygsPlainValue(info.participationFormat, lang, pending)
  };
}

function yygsPageHeader(active, lang, programId = 'yygs') {
  const p = programById(programId) || programById('yygs');
  const routeId = p?.id || programId || 'yygs';
  const photo = campusPhotoFor(p, { id:'program-summary' });
  const facts = yygsHeaderFacts(p, lang);
  const tabs = [
    ['overview', lang === 'zh' ? '概览' : 'Overview', `#/program/${routeId}`],
    ['academics', lang === 'zh' ? '学术' : 'Academics', `#/program/${routeId}/academics`],
    ['students', lang === 'zh' ? '学生生活' : 'Student Life', `#/program/${routeId}/students`],
    ['campus', lang === 'zh' ? '校园生活' : 'Campus Life', `#/program/${routeId}/campus`],
    ['outcomes', lang === 'zh' ? '项目收获' : 'Outcomes', `#/program/${routeId}/outcomes`]
  ];
  return `<section class="yygs-program-head">
    <div class="yygs-program-head__main">
      <img src="${esc(photo)}" alt="${esc(lang === 'zh' ? `${facts.title} 校园示意图` : `Illustrative ${facts.title} campus scene`)}">
      <div class="yygs-program-head__content">
        <h1>${esc(facts.title)}</h1>
        <div class="yygs-program-head__meta">
          <span class="yygs-program-head__host">${esc(facts.host)}</span>
          <span>${programSummaryIcon('calendar')}<b>${esc(facts.dates)}</b></span>
          <span>${programSummaryIcon('location')}<b>${esc(facts.location)}</b></span>
          <span>${programSummaryIcon('format')}<b>${esc(facts.format)}</b></span>
        </div>
      </div>
      <a class="yygs-program-head__review" href="#/survey/${esc(routeId)}">${esc(lang === 'zh' ? '写评价' : 'Write a review')}</a>
    </div>
    <nav class="yygs-tabs" aria-label="${esc(lang === 'zh' ? '项目页面' : 'Program pages')}">
      ${tabs.map(tab => `<a class="${tab[0] === active ? 'is-active' : ''}" href="${tab[2]}">${esc(tab[1])}</a>`).join('')}
    </nav>
  </section>`;
}

function yygsBars(rows) {
  return `<div class="yygs-bars">${rows.map(row => `<div class="yygs-bar"><span>${esc(row[0])}</span><i><b style="width:${Number(row[1]) || 0}%"></b></i><strong>${Number(row[1]) || 0}%</strong></div>`).join('')}</div>`;
}

function yygsDonut(values, center, ariaLabel) {
  const colors = ['#006c38','#55a76d','#9bc58c','#cddfbe','#ecebe7'];
  let cursor = 0;
  const stops = values.map((value, index) => {
    const start = cursor;
    cursor += Number(value) || 0;
    return `${colors[index]} ${start}% ${cursor}%`;
  }).join(',');
  return `<div class="yygs-donut" style="--yygs-donut:conic-gradient(${stops})" role="img" aria-label="${esc(ariaLabel)}"><span aria-hidden="true"></span></div>`;
}

function yygsLegend(labels, values) {
  return `<ul class="yygs-legend">${labels.map((label, index) => `<li><i class="yygs-legend__dot yygs-legend__dot--${index + 1}"></i><span>${esc(label)}</span><strong>${values[index]}%</strong></li>`).join('')}</ul>`;
}

function yygsStorySamples(title, quote, author, lang) {
  const zh = lang === 'zh';
  const key = title.toLowerCase();
  const authors = zh ? ['2025 年参与者', '2024 年参与者', '2025 年参与者'] : ['2025 Participant', '2024 Participant', '2025 Participant'];
  const responses = (en, cn) => (zh ? cn : en).map((story, index) => ({ quote: story, author: authors[index] }));

  if (/most memorable|最难忘/.test(key)) return responses(
    [
      'The Model UN simulation was the highlight. My group included students from five countries, and we stayed up until 2 a.m. revising our resolution. It was exhausting, exciting, and genuinely collaborative.',
      'One evening our cohort sat outside after dinner and kept talking until curfew. Nothing official was planned, but that was the moment the group began to feel like a real community.',
      'Presenting our final project was the moment I remember most. I was nervous, but everyone encouraged one another, and I left feeling much more confident than when I arrived.'
    ],
    [
      '模拟联合国是我最难忘的经历。我们组有来自五个国家的学生，为了修改决议一直讨论到凌晨两点。虽然很累，但特别兴奋，也真的感受到合作。',
      '有一天晚饭后，我们整个小组坐在外面聊天，一直聊到宵禁。那不是安排好的活动，却是大家真正成为一个集体的时刻。',
      '最终项目展示是我记得最清楚的时刻。我本来很紧张，但大家一直互相鼓励，结束时我比刚来时自信了很多。'
    ]
  );
  if (/like and dislike|喜欢与最不喜欢|最喜欢与最不喜欢/.test(key)) return responses(
    [
      'I loved how international and curious the cohort was. What I liked least was how packed the schedule could feel; some days I wanted more time to process everything.',
      'The seminars and instructors were excellent, but the dining choices became repetitive by the second week.',
      'I liked that people were ambitious without making everything competitive. I only wish we had been given more time to explore New Haven independently.'
    ],
    [
      '我最喜欢的是同学来自不同国家，而且都很有好奇心。最不喜欢的是日程有时太满，有些天我很希望能多一点时间消化当天的内容。',
      '研讨课和老师都很棒，但到了第二周，餐厅的选择开始有些重复。',
      '我喜欢大家都很有目标，却不会把一切变成竞争。我只是希望能有更多时间自己探索纽黑文。'
    ]
  );
  if (/friend were thinking|朋友考虑参加/.test(key)) return responses(
    [
      'Talk to people outside your assigned group from the first day. The program becomes much richer once you stop staying only with the people you already know.',
      'You do not need to attend every optional event. Leave enough time to sleep and reflect, or the two weeks can become overwhelming.',
      'Participate even when you feel unsure. Ask questions, volunteer ideas, and introduce yourself—the program gives back what you put into it.'
    ],
    [
      '从第一天开始就主动认识分组以外的人。不要只和已经熟悉的人待在一起，这样项目体验会丰富很多。',
      '不需要参加每一个可选活动。一定要留出睡觉和整理思绪的时间，不然两周会很容易让人疲惫。',
      '即使不确定也要主动参与。多提问、表达想法、介绍自己——你投入多少，项目就会回馈多少。'
    ]
  );
  if (/typical afternoon|典型下午/.test(key)) return responses(
    [
      'After class I usually grabbed dinner with friends, then went to an evening event or movie night. On weekends we explored New Haven together.',
      'A typical afternoon meant snacks in the common room, a quick volleyball game, and then finishing assignments before the evening program.',
      'We often visited a museum or café after class, then returned for dinner and whatever residential activity was planned that night.'
    ],
    [
      '下课后我通常和朋友一起吃晚饭，然后参加晚间活动或电影之夜。周末我们会结伴探索纽黑文。',
      '一个典型的下午通常是先在公共休息室吃零食、打一会儿排球，再在晚间活动前完成作业。',
      '我们下课后常去博物馆或咖啡馆，然后回来吃晚饭，参加当晚安排的住宿生活动。'
    ]
  );
  if (/wish you.d done differently|希望自己做过什么不同/.test(key)) return responses(
    [
      'I wish I had introduced myself to more people during the first few days instead of waiting for conversations to happen naturally.',
      'I would protect my sleep more. I tried to do everything at first, and I enjoyed the program much more once I found a better balance.',
      'I wish I had explored more of New Haven rather than spending every free hour inside the residence hall.'
    ],
    [
      '我希望自己在最初几天能主动认识更多人，而不是等着对话自然发生。',
      '我会更重视睡眠。刚开始我想参加所有活动，后来找到平衡之后反而更享受项目。',
      '我希望自己能多探索一些纽黑文，而不是把所有空闲时间都留在宿舍。'
    ]
  );
  if (/special memory involving|特别记忆/.test(key)) return responses(
    [
      'My cohort surprised one student with a birthday celebration in the common room. Everyone contributed something small, and it felt unexpectedly warm.',
      'A late-night conversation with my roommate about our families and schools became one of the most meaningful parts of the program.',
      'At the final dinner, we wrote short notes to one another. I still have mine, and they remind me how close the group became in only two weeks.'
    ],
    [
      '我们在公共休息室给一位同学准备了生日惊喜。每个人都贡献了一点东西，氛围出乎意料地温暖。',
      '有一次深夜，我和室友聊各自的家庭和学校，那次谈话成了整个项目里最有意义的记忆之一。',
      '最后一顿晚餐时，我们给彼此写了小纸条。我现在还留着，也一直记得大家在短短两周里变得多么亲近。'
    ]
  );
  if (/class, professor|课堂、教授|学术瞬间/.test(key)) return responses(
    [
      'The global health policy seminar stood out because the professor made us debate real trade-offs instead of searching for one correct answer.',
      'In an ethics and technology workshop, classmates challenged an assumption I had never questioned before. I kept thinking about that discussion after the program ended.',
      'An instructor stayed after class to help me narrow my research question. That conversation changed how I approach open-ended academic work.'
    ],
    [
      '全球健康政策研讨课让我印象最深，因为老师让我们讨论真实世界的取舍，而不是寻找唯一正确答案。',
      '在科技伦理工作坊里，同学们挑战了一个我从未质疑过的假设。项目结束后，我仍然常常想到那次讨论。',
      '一位老师课后留下来帮我缩小研究问题。那次对话改变了我处理开放式学术任务的方式。'
    ]
  );
  if (/favorite spot on campus|校园里的哪个地方/.test(key)) return responses(
    [
      'The Beinecke Rare Book & Manuscript Library was my favorite spot. It was peaceful, visually unforgettable, and a great place to explore Yale’s history.',
      'I loved sitting on Cross Campus between activities. It was the easiest place to run into friends without planning anything.',
      'The courtyard near Sterling Library became my quiet place to read or reset before the next session.'
    ],
    [
      '贝内克珍本与手稿图书馆是我最喜欢的地方。那里很安静、视觉上也很震撼，是了解耶鲁历史的好去处。',
      '我很喜欢在活动间隙坐在 Cross Campus。完全不用提前约，就能遇到认识的朋友。',
      '斯特林图书馆附近的庭院成了我安静阅读、在下一场活动前重新调整状态的地方。'
    ]
  );
  if (/outside campus|校外/.test(key)) return responses(
    [
      'The Yale University Art Gallery is close by, free, and worth visiting more than once because the collection is much larger than I expected.',
      'Go to East Rock if your schedule allows. The view made it feel like we had briefly stepped outside the program bubble.',
      'The small cafés downtown were good places to decompress with friends when we had a free afternoon.'
    ],
    [
      '耶鲁大学美术馆很近、免费，而且值得去不止一次，因为馆藏比我想象中丰富很多。',
      '如果时间允许，一定去 East Rock。那里的景色让我们短暂离开项目的“小泡泡”，换一种视角看城市。',
      '市中心的小咖啡馆很适合在空闲的下午和朋友一起放松。'
    ]
  );
  if (/walked away|参加项目后带走/.test(key)) return responses(
    [
      'I walked away with lifelong friends from around the world, a deeper understanding of global issues, and more confidence sharing my ideas.',
      'The program helped me identify which subjects I genuinely want to study and made me more comfortable living independently.',
      'I became less afraid of asking difficult questions. That confidence has stayed with me in school long after the summer ended.'
    ],
    [
      '我带走了来自世界各地的长期友谊、对全球议题更深入的理解，以及表达自己想法的信心。',
      '项目帮我更清楚地知道自己真正想学什么，也让我更适应独立生活。',
      '我不再害怕提出困难的问题。夏天结束很久以后，这种信心仍然留在我的学习中。'
    ]
  );

  return responses(
    [quote, 'The experience gave me a clearer sense of what I value in a summer program.', 'The people and conversations stayed with me longer than any single scheduled activity.'],
    [quote, '这段经历让我更清楚自己真正重视怎样的夏校体验。', '比起某一个正式活动，真正长久留在我记忆里的是人和彼此之间的谈话。']
  ).map((story, index) => index === 0 ? { quote, author } : story);
}

function yygsStories(title, prompts, quote, author, lang) {
  const storyGroups = prompts.map(prompt => yygsStorySamples(prompt || title, quote, author, lang));
  const storyCount = Math.max(...storyGroups.map(group => group.length));
  return `<section class="yygs-panel yygs-stories">
    <div class="yygs-stories__head"><h2>${esc(title)}</h2><div class="yygs-story-nav" aria-label="${esc(lang === 'zh' ? '切换当前问题的学生回答' : 'Change student response for this prompt')}"><button class="yygs-story-prev" type="button" aria-label="${esc(lang === 'zh' ? '上一个回答' : 'Previous response')}">‹</button><div class="yygs-story-dots">${Array.from({ length: storyCount }, (_, index) => `<button class="${index === 0 ? 'is-active' : ''}" type="button" data-story-dot="${index}" aria-label="${esc((lang === 'zh' ? '回答 ' : 'Response ') + (index + 1))}"></button>`).join('')}</div><button class="yygs-story-next" type="button" aria-label="${esc(lang === 'zh' ? '下一个回答' : 'Next response')}">›</button></div></div>
    <div class="yygs-stories__body">
      <div class="yygs-stories__prompts">${prompts.map((prompt, index) => `<button class="${index === 0 ? 'is-active' : ''}" data-story-prompt="${index}" type="button">${esc(prompt)}</button>`).join('')}</div>
      <div class="yygs-story-viewport">${storyGroups.map((stories, promptIndex) => `<div class="yygs-story-group ${promptIndex === 0 ? 'is-active' : ''}" data-story-group="${promptIndex}"><div class="yygs-story-track">${stories.map(story => `<blockquote class="yygs-story-slide"><span>“</span><p>${esc(story.quote)}</p><cite>— ${esc(story.author)}</cite></blockquote>`).join('')}</div></div>`).join('')}</div>
    </div>
  </section>`;
}

function bindYYGSStoryCarousels() {
  if (State.yygsStoryIntervals) State.yygsStoryIntervals.forEach(clearInterval);
  State.yygsStoryIntervals = [];
  $$('.yygs-stories').forEach(carousel => {
    const groups = $$('[data-story-group]', carousel);
    const dots = $$('[data-story-dot]', carousel);
    const prompts = $$('[data-story-prompt]', carousel);
    if (!groups.length) return;
    let promptIndex = 0;
    let storyIndex = 0;
    let pointerStart = null;
    const activeSlides = () => $$('.yygs-story-slide', groups[promptIndex]);
    const showStory = nextIndex => {
      const slides = activeSlides();
      const track = groups[promptIndex]?.querySelector('.yygs-story-track');
      if (!track || !slides.length) return;
      storyIndex = (nextIndex + slides.length) % slides.length;
      track.style.transform = `translateX(-${storyIndex * 100}%)`;
      dots.forEach((dot, dotIndex) => {
        dot.hidden = dotIndex >= slides.length;
        dot.classList.toggle('is-active', dotIndex === storyIndex);
      });
    };
    const selectPrompt = nextPromptIndex => {
      promptIndex = Math.max(0, Math.min(nextPromptIndex, groups.length - 1));
      storyIndex = 0;
      groups.forEach((group, groupIndex) => group.classList.toggle('is-active', groupIndex === promptIndex));
      prompts.forEach((prompt, index) => prompt.classList.toggle('is-active', index === promptIndex));
      showStory(0);
    };
    const restart = () => {
      clearInterval(carousel._yygsTimer);
      carousel._yygsTimer = setInterval(() => showStory(storyIndex + 1), 60000);
    };
    carousel.querySelector('.yygs-story-prev')?.addEventListener('click', () => { showStory(storyIndex - 1); restart(); });
    carousel.querySelector('.yygs-story-next')?.addEventListener('click', () => { showStory(storyIndex + 1); restart(); });
    dots.forEach((dot, dotIndex) => dot.addEventListener('click', () => { showStory(dotIndex); restart(); }));
    prompts.forEach((prompt, index) => prompt.addEventListener('click', () => { selectPrompt(index); restart(); }));
    carousel.addEventListener('pointerdown', event => { pointerStart = event.clientX; });
    carousel.addEventListener('pointerup', event => {
      if (pointerStart == null) return;
      const distance = event.clientX - pointerStart;
      pointerStart = null;
      if (Math.abs(distance) < 48) return;
      showStory(storyIndex + (distance < 0 ? 1 : -1));
      restart();
    });
    carousel.addEventListener('pointercancel', () => { pointerStart = null; });
    selectPrompt(0);
    carousel._yygsTimer = setInterval(() => showStory(storyIndex + 1), 60000);
    State.yygsStoryIntervals.push(carousel._yygsTimer);
  });
}

function yygsOfficialLines(value, lang) {
  const localized = value && typeof value === 'object' ? pickL(value) : value;
  const translated = officialText(localized, lang);
  return String(translated || localized || '')
    .replace(/\r/g, '')
    .split(/\n|•/)
    .map(line => line.trim())
    .filter(Boolean);
}

function yygsOfficialFact(title, value, lang, className = '') {
  const lines = yygsOfficialLines(value, lang);
  if (!lines.length) return '';
  return `<article class="yygs-official-card ${className}">
    <h3>${esc(title)}</h3>
    <ul>${lines.map(line => `<li>${esc(line)}</li>`).join('')}</ul>
  </article>`;
}

function yygsOfficialInfoHTML(lang, programId = 'yygs') {
  const zh = lang === 'zh';
  const program = programById(programId) || programById('yygs');
  const info = program?.officialInfo || {};
  const sourceUrl = info.sourceUrl || program?.source?.officialUrl || info.programUrl || program?.website;
  const programUrl = info.programUrl || program?.website || sourceUrl;
  const applicationUrl = info.applicationUrl || program?.applicationUrl;
  const subjects = program?.discovery?.subjects || [];
  const format = [info.participationFormat, info.sessionLength || program?.duration, info.academicCredit]
    .map(value => yygsOfficialLines(value, lang)[0])
    .filter(Boolean);
  return `<section class="yygs-official-facts">
    <div class="yygs-official-facts__head">
      <div>
        <p class="yygs-official-facts__eyebrow">${esc(zh ? '来自耶鲁全球青年学者项目' : 'From Yale Young Global Scholars')}</p>
        <h2>${esc(zh ? '官方项目信息' : 'Official program information')}</h2>
      </div>
      ${programUrl ? `<a class="yygs-official-facts__source" href="${esc(programUrl)}" target="_blank" rel="noopener noreferrer">${esc(zh ? '查看项目官网' : 'View official program site')} ↗</a>` : ''}
    </div>
    <div class="yygs-official-grid">
      ${yygsOfficialFact(zh ? '申请时间' : 'Dates & deadlines', info.applicationDeadline || program?.deadline, lang)}
      ${yygsOfficialFact(zh ? '2027 项目时间' : '2027 sessions', info.programDates || program?.duration, lang)}
      ${yygsOfficialFact(zh ? '费用与资助' : 'Tuition & aid', `${info.tuition || program?.tuition || ''}\n${info.financialAid || ''}`, lang)}
      ${yygsOfficialFact(zh ? '申请资格' : 'Eligibility', info.eligibility, lang)}
    </div>
    <article class="yygs-official-format">
      <div>
        <h3>${esc(zh ? '形式与学术方向' : 'Format & academics')}</h3>
        <p>${esc(format.join(' · '))}</p>
        ${subjects.length ? `<div>${subjects.map(subject => `<i>${esc(officialText(subject, lang))}</i>`).join('')}</div>` : ''}
      </div>
      ${applicationUrl ? `<a href="${esc(applicationUrl)}" target="_blank" rel="noopener noreferrer">${esc(zh ? '准备申请？' : 'Ready to apply?')}</a>` : ''}
    </article>
  </section>`;
}

function yygsOverviewHTML(lang, programId = 'yygs') {
  const zh = lang === 'zh';
  const prompts = zh
    ? ['分享你对项目最难忘的故事。','你最喜欢与最不喜欢项目的什么？','如果朋友考虑参加，你最想告诉他们什么？']
    : ['Share your most memorable story about your program experience.','What did you like and dislike the most about the program?','If a friend were thinking about attending, what would you want them to know?'];
  return `<div class="yygs-page-body yygs-page-body--overview">
    <section class="yygs-panel yygs-glance">
      <div class="yygs-panel__head"><h2>${esc(zh ? '学生体验概览' : 'Student Experience at a Glance')}</h2><span>${esc(zh ? '基于 48 份示例评价' : 'Based on 48 sample reviews')}</span></div>
      <div class="yygs-glance__grid">
        <div><strong>4.6 <small>/ 5</small></strong><span>${esc(zh ? '整体体验' : 'Overall experience')}</span></div>
        <div><strong>92%</strong><span>${esc(zh ? '认为时间和花费值得' : 'Said it was worth the time and money')}</span></div>
        <div><h3>${esc(zh ? '最常见的描述' : 'Commonly described as')}</h3><p>${(zh ? ['鼓舞人心','紧张充实','合作','国际化','有趣'] : ['Inspiring','Intense','Collaborative','Global','Fun']).map(item => `<i>${esc(item)}</i>`).join('')}</p></div>
      </div>
    </section>
    ${yygsOfficialInfoHTML(lang, programId)}
    ${yygsStories(zh ? '学生故事' : 'Student Stories', prompts, zh ? '模拟联合国是整个项目的亮点。我和来自五个国家的学生一起修改决议，直到凌晨两点。那既累人，也是我最兴奋、最有合作感的一次经历。' : 'The Model UN simulation was definitely the highlight. I was grouped with students from five different countries, and we ended up staying up until 2 a.m. revising our resolution. It was exhausting but also one of the most exciting and collaborative experiences I’ve had.', zh ? '2025 年参与者' : '2025 Participant', lang)}
    <div class="yygs-category-grid">
      ${[
        ['academics', zh ? '学术' : 'Academics', zh ? '课程、教师、学习量等' : 'Courses, instructors, workload and more'],
        ['students', zh ? '学生生活' : 'Student Life', zh ? '社交、活动与社区' : 'Social life, activities, and community'],
        ['campus', zh ? '校园生活' : 'Campus Life', zh ? '住宿、餐饮、设施、安全与周边' : 'Housing, food, facilities, safety and nearby areas'],
        ['outcomes', zh ? '项目收获' : 'Outcomes', zh ? '学生从项目中带走了什么' : 'What students took away from the program']
      ].map(item => `<a href="#/program/${esc(programId)}/${item[0]}"><span>${programSummaryIcon(item[0])}</span><h3>${esc(item[1])}</h3><p>${esc(item[2])}</p><b>→</b></a>`).join('')}
    </div>
    <section class="yygs-overview-cta">
      <div><h2>${esc(zh ? '参加过 YYGS 吗？' : 'Have experience with YYGS?')}</h2><p>${esc(zh ? '你的真实经历可以帮助下一位学生做决定。' : 'Your experience can help the next student decide.')}</p></div>
      <div><a class="yygs-overview-cta__review" href="#/survey/${esc(programId)}">${esc(zh ? '写评价' : 'Write a review')}</a><a class="yygs-overview-cta__back" href="#/pick">← ${esc(zh ? '返回搜索项目' : 'Back to programs')}</a></div>
    </section>
  </div>`;
}

function yygsAcademicsHTML(lang) {
  const zh = lang === 'zh';
  return `<div class="yygs-page-body">
    <div class="yygs-preview-note">${esc(yygsPreviewCopy(lang))}</div>
    <div class="yygs-section-head"><h2>${esc(zh ? '学术' : 'Academics')}</h2><span>${esc(zh ? '基于 48 份示例评价' : 'Based on 48 sample reviews')}</span></div>
    <div class="yygs-top-grid yygs-top-grid--academics">
      <section class="yygs-panel yygs-rating-card"><h2>${esc(zh ? '学术体验' : 'Academic Experience')}</h2><strong>4.5 <small>/ 5</small></strong><p>${esc(zh ? '整体评分' : 'Overall rating')}</p></section>
      <section class="yygs-panel"><h2>${esc(zh ? '学术工作量' : 'Academic Workload')}</h2><div class="yygs-donut-layout">${yygsDonut([12,28,41,14,5], zh ? '48\n份评价' : '48\nreviews', 'Academic workload sample distribution')}${yygsLegend(zh ? ['非常重','比较重','适中','比较轻','非常轻'] : ['Very heavy','Somewhat heavy','Moderate','Fairly light','Very light'], [12,28,41,14,5])}</div></section>
    </div>
    <section class="yygs-panel"><h2>${esc(zh ? '教师评分' : 'Instructor Ratings')}</h2>${yygsBars((zh ? ['讲解清晰度','投入与热情','鼓励课堂讨论','课外亲和力与帮助'] : ['Teaching clarity','Engagement and enthusiasm','Encouragement of class discussion','Approachability and helpfulness outside class']).map((label,index) => [label,[92,94,88,94][index]]))}</section>
    ${yygsStories(zh ? '难忘的学术瞬间' : 'Memorable Academic Moments', [zh ? '哪一堂课、教授或学术瞬间给你留下了深刻印象？' : 'What’s one class, professor, or academic moment that left an impression on you?'], zh ? '全球卫生政策研讨会对我影响很大。教授鼓励我们讨论现实世界的取舍，和来自世界各地的同学深夜讨论，是项目里最有智力刺激的时刻之一。' : 'The seminar on global health policy was a standout for me. The professor encouraged us to debate real-world tradeoffs, and the late-night group discussions with classmates from around the world were some of the most intellectually energizing moments of the program.', zh ? '2025 年参与者' : '2025 Participant', lang)}
  </div>`;
}

function yygsStudentLifeHTML(lang) {
  const zh = lang === 'zh';
  return `<div class="yygs-page-body">
    <div class="yygs-preview-note">${esc(yygsPreviewCopy(lang))}</div>
    <div class="yygs-section-head"><h2>${esc(zh ? '学生生活' : 'Student Life')}</h2><span>${esc(zh ? '基于 48 份示例评价' : 'Based on 48 sample reviews')}</span></div>
    <div class="yygs-top-grid yygs-top-grid--student">
      <section class="yygs-panel yygs-satisfaction"><h2>${esc(zh ? '学生生活满意度' : 'Student Life Satisfaction')}</h2><div><strong>4.5 <small>/ 5</small></strong><i></i><p><b>78%</b><span>${esc(zh ? '的学生感到满意（评分 4 或 5）' : 'of students were satisfied (rated 4 or 5)')}</span></p></div><div class="yygs-stars" aria-label="4.5 out of 5">★★★★<span class="yygs-half-star">★</span></div></section>
      <section class="yygs-panel"><h2>${esc(zh ? '交朋友与融入有多容易？' : 'How easy was it to make friends and feel included?')}</h2><p class="yygs-subcopy">${esc(zh ? '学生回答的示例分布。' : 'Distribution of student responses about making friends and feeling included.')}</p><div class="yygs-donut-layout">${yygsDonut([41,30,18,7,4], '48\nreviews', 'Student inclusion sample distribution')}${yygsLegend(zh ? ['非常容易','比较容易','感受混合','比较困难','非常困难'] : ['Very easy','Somewhat easy','Mixed experience','Somewhat difficult','Very difficult'], [41,30,18,7,4])}</div></section>
    </div>
    <section class="yygs-panel"><h2>${esc(zh ? '课余活动' : 'Free-time Activities')}</h2><p class="yygs-subcopy">${esc(zh ? '学生通常在课余时间做什么？可多选。' : 'What did students usually do in their free time? Select all that apply.')}</p>${yygsBars((zh ? ['周末出行或短途旅行','白天活动（零食、手工等）','晚间活动（电影、游戏等）','社团或兴趣小组','运动或户外活动','表演或才艺之夜','活动不多，我们自己找乐子'] : ['Weekend trips or excursions','Daytime activities (e.g., snacks, crafts)','Evening events (e.g., movie nights, games)','Clubs or interest groups','Sports or outdoor recreation','Showcases or talent nights','Not much; we made our own fun']).map((label,index) => [label,[46,52,68,40,27,19,6][index]]))}</section>
    ${yygsStories(zh ? '学生生活故事' : 'Student Life Stories', zh ? ['课后或周末的典型下午是什么样？','回头看，你希望自己做过什么不同的事？','和项目中认识的人有关的一段特别记忆？'] : ['What did a typical afternoon look like after class ended (or a typical weekend)?','Looking back, is there anything you wish you’d done differently during the program?','What’s one special memory involving the people you met at the program?'], zh ? '下课后，我通常和新朋友在餐厅吃晚饭，然后参加晚间活动。周末我和同组同学去附近的小镇一日游，那让我们更了解彼此。' : 'After class, I’d usually grab dinner with new friends at the dining hall, then we’d head to an evening event. On the weekend, I went on a day trip with my cohort to a nearby town, which was a great chance to explore and get to know people even better.', zh ? '示例参与者' : 'Sample Participant', lang)}
  </div>`;
}

function yygsCampusHTML(lang) {
  const zh = lang === 'zh';
  return `<div class="yygs-page-body">
    <div class="yygs-preview-note">${esc(yygsPreviewCopy(lang))}</div>
    <div class="yygs-section-head"><h2>${esc(zh ? '校园生活' : 'Campus Life')}</h2><span>${esc(zh ? '基于 48 份示例评价' : 'Based on 48 sample reviews')}</span></div>
    <section class="yygs-panel"><h2>${esc(zh ? '各方面评分' : 'Ratings by Aspect')}</h2><div class="yygs-aspect-grid">${(zh ? [['餐饮','4.3'],['宿舍／住宿','4.6'],['教室与学习空间','4.5'],['娱乐设施与公共空间','4.4']] : [['Food','4.3'],['Dorms / Accommodation','4.6'],['Classrooms & study spaces','4.5'],['Recreation facilities & common areas','4.4']]).map(item => `<article><h3>${esc(item[0])}</h3><strong>${item[1]} <small>/ 5</small></strong></article>`).join('')}</div></section>
    <div class="yygs-split-ratings"><section class="yygs-panel"><h2>${esc(zh ? '安全感' : 'Safety')}</h2><p>${esc(zh ? '学生在校园感到多安全' : 'How safe students felt on campus')}</p><strong>4.8 <small>/ 5</small></strong></section><section class="yygs-panel"><h2>${esc(zh ? '校园出行' : 'Getting Around Campus')}</h2><p>${esc(zh ? '在校园内导航和出行有多方便' : 'How easy it was to navigate and get around campus')}</p><strong>4.6 <small>/ 5</small></strong></section></div>
    <section class="yygs-panel"><h2>${esc(zh ? '周边便利度' : 'Nearby Access')}</h2><p class="yygs-subcopy">${esc(zh ? '认为各选项在项目附近容易到达的学生比例。' : '% of students who said each option was easy to access near the program.')}</p><div class="yygs-access-grid">${yygsBars((zh ? ['优质餐饮','杂货店','公共交通','购物'] : ['Good food','Grocery shopping','Public transportation','Shopping']).map((label,index) => [label,[92,75,83,67][index]]))}${yygsBars((zh ? ['娱乐','自然空间','医疗与药店','文化与历史地标'] : ['Entertainment','Natural spaces','Healthcare and pharmacies','Cultural and historical landmarks']).map((label,index) => [label,[65,88,56,85][index]]))}</div></section>
    ${yygsStories(zh ? '学生推荐的地点' : 'Places Students Recommend', zh ? ['你最推荐未来学生去校园里的哪个地方？','校外有什么地方值得去看看？'] : ['Do you have a favorite spot on campus you’d recommend to future students?','Are there any places outside campus you’d recommend checking out?'], zh ? '贝内克珍本与手稿图书馆非常值得去，里面很震撼，也很安静。我也很喜欢耶鲁美术馆，离得很近，藏品很丰富。' : 'The Beinecke Rare Book & Manuscript Library is a must-see. It’s stunning inside, super peaceful, and a great place to explore Yale’s history and unique collections. I also loved the Yale Art Gallery—it’s close by and has an amazing range of art.', zh ? '2025 年参与者' : '2025 Participant', lang)}
  </div>`;
}

function yygsOutcomesHTML(lang) {
  const zh = lang === 'zh';
  return `<div class="yygs-page-body">
    <div class="yygs-preview-note">${esc(yygsPreviewCopy(lang))}</div>
    <div class="yygs-section-head"><h2>${esc(zh ? '项目收获' : 'Outcomes')}</h2><span>${esc(zh ? '基于 48 份示例评价' : 'Based on 48 sample reviews')}</span></div>
    <section class="yygs-panel"><h2>${esc(zh ? '学生带走了什么' : 'What Students Took Away')}</h2>${yygsBars((zh ? ['新友谊或人脉','学术知识或技能','大学生活体验','更强的信心或独立性','更清楚的学术兴趣','证书或推荐信','其他'] : ['New friendships or connections','Academic knowledge or skills','A taste of college life','Greater confidence or independence','A clearer sense of academic interests','Certificate or recommendation letter','Other']).map((label,index) => [label,[83,67,56,52,40,23,8][index]]))}</section>
    <section class="yygs-panel yygs-takeaway-chips"><h2>${esc(zh ? '最常见的收获' : 'Most Common Takeaways')}</h2><p>${(zh ? ['友谊','清晰度','信心','技能','大学生活'] : ['Friendships','Clarity','Confidence','Skills','College life']).map(item => `<i>${esc(item)}</i>`).join('')}</p></section>
    ${yygsStories(zh ? '学生收获' : 'Student Takeaways', [zh ? '告诉我们你参加项目后带走了什么，可以是具体的，也可以是无形的。' : 'Tell us anything you walked away with after attending the program. It can be tangible or intangible.'], zh ? '我带走了来自世界各地的终身友谊、对自己热爱的全球议题更深的理解，以及在分享观点和参与有意义讨论时更强的信心。' : 'I walked away with lifelong friends from around the world, a deeper understanding of global issues I’m passionate about, and a lot more confidence in sharing my ideas and engaging in meaningful discussions.', zh ? '2025 年参与者' : '2025 Participant', lang)}
  </div>`;
}

function yygsEmptyStoryPanel(title, prompts, programId, lang) {
  const zh = lang === 'zh';
  return `<section class="yygs-panel yygs-stories yygs-stories--empty">
    <div class="yygs-stories__head"><h2>${esc(title)}</h2><span class="yygs-awaiting">${esc(zh ? '等待已验证学生评价' : 'Awaiting verified student reviews')}</span></div>
    <div class="yygs-stories__body">
      <div class="yygs-stories__prompts">${prompts.map((prompt, index) => `<button class="${index === 0 ? 'is-active' : ''}" type="button" disabled>${esc(prompt)}</button>`).join('')}</div>
      <div class="yygs-story-empty"><p>${esc(zh ? '首批已验证学生回答将在这里按问题呈现。' : 'Verified student responses will appear here, organized by prompt.')}</p><a href="#/survey/${esc(programId)}">${esc(zh ? '分享你的体验' : 'Share your experience')}</a></div>
    </div>
  </section>`;
}

function yygsGenericPage(active, lang, programId) {
  const zh = lang === 'zh';
  const program = programById(programId);
  const labels = {
    overview: zh ? '学生体验概览' : 'Student Experience at a Glance',
    academics: zh ? '学术' : 'Academics',
    students: zh ? '学生生活' : 'Student Life',
    campus: zh ? '校园生活' : 'Campus Life',
    outcomes: zh ? '项目收获' : 'Outcomes'
  };
  const prompts = {
    overview: zh ? ['分享你对项目最难忘的故事。','你最喜欢与最不喜欢项目的什么？','如果朋友考虑参加，你最想告诉他们什么？'] : ['Share your most memorable story about your program experience.','What did you like and dislike the most about the program?','If a friend were thinking about attending, what would you want them to know?'],
    academics: zh ? ['哪节课、哪位老师或哪个学术时刻让你印象最深？'] : ['What class, professor, or academic moment left an impression on you?'],
    students: zh ? ['课后或周末的典型下午是什么样？','和项目中认识的人有关的一段特别记忆？'] : ['What did a typical afternoon or weekend look like?','What is one special memory involving people you met?'],
    campus: zh ? ['你最推荐未来学生去校园里的哪个地方？','校外有什么地方值得去看看？'] : ['Do you have a favorite spot on campus you would recommend?','Are there places outside campus worth checking out?'],
    outcomes: zh ? ['参加项目后，你带走了什么？'] : ['What did you walk away with after attending the program?']
  };
  const overview = active === 'overview';
  const metricTitle = overview ? labels.overview : (zh ? `${labels[active]}体验` : `${labels[active]} Experience`);
  const summaryTitle = overview ? (zh ? '真实学生视角' : 'Student perspectives') : (zh ? '等待第一批回答' : 'Awaiting the first responses');
  const summaryCopy = zh ? '在收到已验证学生评价前，我们不会显示或推测评分。' : 'We do not show or infer scores until verified student reviews arrive.';
  if (overview) {
    const categoryCards = [
      ['academics', zh ? '学术' : 'Academics', zh ? '课程、老师、学习负荷与更多内容' : 'Courses, instructors, workload, and more'],
      ['students', zh ? '学生生活' : 'Student Life', zh ? '社交、活动与社区' : 'Social life, activities, and community'],
      ['campus', zh ? '校园生活' : 'Campus Life', zh ? '住宿、餐饮、安全与周边环境' : 'Housing, food, safety, and nearby areas'],
      ['outcomes', zh ? '项目收获' : 'Outcomes', zh ? '学生从项目中带走的收获' : 'What students took away from the program']
    ];
    const programName = pickL(program?.name || { en:'this program', zh:'这个项目' });
    return `<div class="yygs-page-body yygs-page-body--overview">
      <section class="yygs-panel yygs-glance yygs-glance--awaiting">
        <div class="yygs-panel__head"><h2>${esc(labels.overview)}</h2><span>${esc(zh ? '等待已验证学生评价' : 'Awaiting verified student reviews')}</span></div>
        <div class="yygs-glance__grid">
          <div><strong>—</strong><span>${esc(zh ? '整体体验' : 'Overall experience')}</span></div>
          <div><strong>—</strong><span>${esc(zh ? '评分将在收到评价后显示' : 'Ratings appear after verified reviews')}</span></div>
          <div><h3>${esc(zh ? '学生如何描述它' : 'How students describe it')}</h3><p><i>${esc(zh ? '等待学生评价' : 'Awaiting student reviews')}</i></p></div>
        </div>
      </section>
      ${yygsOfficialInfoHTML(lang, programId)}
      ${yygsEmptyStoryPanel(zh ? '学生故事' : 'Student Stories', prompts.overview, programId, lang)}
      <div class="yygs-category-grid">${categoryCards.map(item => `<a href="#/program/${esc(programId)}/${item[0]}"><span>${programSummaryIcon(item[0] === 'students' ? 'students' : item[0])}</span><h3>${esc(item[1])}</h3><p>${esc(item[2])}</p><b>→</b></a>`).join('')}</div>
      <section class="yygs-overview-cta">
        <div><h2>${esc(zh ? `参加过 ${programName} 吗？` : `Have experience with ${programName}?`)}</h2><p>${esc(zh ? '你的真实经历可以帮助下一位学生做决定。' : 'Your experience can help the next student decide.')}</p></div>
        <div><a class="yygs-overview-cta__review" href="#/survey/${esc(programId)}">${esc(zh ? '写评价' : 'Write a review')}</a><a class="yygs-overview-cta__back" href="#/pick">← ${esc(zh ? '返回搜索项目' : 'Back to programs')}</a></div>
      </section>
    </div>`;
  }
  return `<div class="yygs-page-body yygs-page-body--generic">
    <div class="yygs-section-head"><h2>${esc(labels[active] || labels.overview)}</h2><span>${esc(zh ? '等待已验证学生评价' : 'Awaiting verified student reviews')}</span></div>
    <div class="yygs-top-grid yygs-top-grid--empty">
      <section class="yygs-panel yygs-empty-metric"><h2>${esc(metricTitle)}</h2><strong>—</strong><p>${esc(zh ? '评分将在有足够已验证回答后显示。' : 'A rating will appear once enough verified responses are available.')}</p></section>
      <section class="yygs-panel yygs-empty-summary"><h2>${esc(summaryTitle)}</h2><p>${esc(summaryCopy)}</p><span>${esc(zh ? '暂无学生数据' : 'No student data yet')}</span></section>
    </div>
    ${yygsEmptyStoryPanel(overview ? (zh ? '学生故事' : 'Student Stories') : (zh ? `${labels[active]}故事` : `${labels[active]} Stories`), prompts[active] || prompts.overview, programId, lang)}
  </div>`;
}

function renderYYGSProgramPage(active, programId = 'yygs') {
  const lang = L();
  const content = yygsGenericPage(active, lang, programId);
  $('#app').innerHTML = `${renderHeader('home')}<main class="yygs-review-page">${yygsPageHeader(active, lang, programId)}${content}</main>${renderFooter()}`;
  bindHeaderEvents();
  bindYYGSStoryCarousels();
  window.scrollTo({ top:0, left:0, behavior:'auto' });
}

function renderProgram(id) {
  const lang = L();
  const p = programById(id);
  if (!p) { location.hash = '#/pick'; return; }
  renderYYGSProgramPage('overview', id); return;
  const d = programDisplayDetails(p, (PROGRAM_DETAILS && PROGRAM_DETAILS[id]) || {}, lang);
  const reviews = window.SSDB.getReviews(id);
  const user = window.SSDB.currentUser();
  const myAnswers = (State.survey && State.survey.programId === id) ? State.survey.answers : null;
  const isProvisionalListing = p.catalogStatus === 'spreadsheet-provisional';
  const isPausedListing = p.catalogStatus === 'paused';
  const isDiscoveryListing = ['official-source-listed', 'spreadsheet-provisional', 'paused'].includes(p.catalogStatus);
  const hasOfficialProgramSource = !!(p.source && p.source.officialUrl);
  const verifiedFacts = officialProgramFacts(id, lang);
  const listingLabel = isPausedListing
    ? (lang === 'zh' ? '2027 年暂停' : 'Paused for 2027')
    : isProvisionalListing
      ? (lang === 'zh' ? '待官网核实' : 'Needs official verification')
      : t('pickerNew', lang);
  const listingTitle = isPausedListing
    ? (lang === 'zh' ? '2027 年暂无暑期项目' : 'No 2027 summer session')
    : isProvisionalListing
      ? (lang === 'zh' ? '等待官网信息核实' : 'Awaiting official verification')
      : (lang === 'zh' ? '等待首条学生评价' : 'Awaiting the first student review');
  const listingBody = isPausedListing
    ? (lang === 'zh' ? '你提供的目录注明该项目 2027 年暂停，申请前请向主办方再次确认。' : 'The supplied directory marks this program as paused for 2027. Confirm with the organizer before applying.')
    : isProvisionalListing
      ? (lang === 'zh' ? '该条目来自你提供的目录；日期、费用、地点和当前开设状态仍需官网核实。' : 'This entry comes from the supplied directory; dates, price, location, and current availability still need official verification.')
      : verifiedFacts
        ? (lang === 'zh' ? '下方仅显示可由所链接官方项目页面直接支持的字段。' : 'Only fields directly supported by the linked official program pages are shown below.')
        : (lang === 'zh' ? '项目名称、主办方和官网链接已经过目录核对。' : 'Program name, host, and official-site link have been checked for this listing.');
  const listingLinkLabel = hasOfficialProgramSource
    ? (lang === 'zh' ? '查看项目官网' : 'View official program page')
    : (lang === 'zh' ? '查看学校官网' : 'View school website');
  const previewOverall = Number(p.overall || 0);
  const previewReviewCount = reviews.length;

  // very simple topical bucketing of reviews (keyword match)
  const academicsReviews  = reviews.filter(r => /professor|instructor|class |academ|lecture|study|course|课程|课堂|老师|学术/i.test(r.text || ''));
  const lifeReviews       = reviews.filter(r => /life|friend|social|community|cohort|classmate|peer|belong|roommate|event|club|hang|同学|社群|社交|学生生活/i.test(r.text || ''));
  const gotOutReviews     = reviews.filter(r => /learn|skill|growth|experience|value|recommend|impact|change|future|career|confiden|help|benefit|takeaway|outcome|what you got|项目结束|项目收获|更清楚|信心/i.test(r.text || ''));
  const campusReviews     = reviews.filter(r => /campus|dorm|housing|food|facilit|safe|facility|room|resident|dining|cafeteria|laundry|校园|教室|学习空间|宿舍/i.test(r.text || ''));

  const reviewCard = (r) => `
    <div class="review-card">
      <div class="avatar">${esc((r.author || '?').slice(0,2).toUpperCase())}</div>
      <div>
        <div class="row row--between">
          <div><strong>${esc(r.author || (lang==='zh'?'匿名':'Anonymous'))}</strong> <span class="muted">· ${esc(r.who || '')}</span></div>
          <div class="mini-stars">${'★'.repeat(r.stars||0)}${'☆'.repeat(5-(r.stars||0))}</div>
        </div>
        <p>${esc(r.text || '')}</p>
        ${user ? `<div style="margin-top:6px"><button class="btn btn--ghost" data-del-review="${esc(r.id)}">${lang==='zh'?'删除':'Delete'}</button></div>` : ''}
      </div>
    </div>`;

  // outcomes summary from the signed-in user's own survey for this program
  let outcomesHTML = '';
  if (myAnswers) {
    const r1 = myAnswers.r1 || {};
    const overall    = r1.overall;
    const recommend  = r1.recommend;
    const valueForMoney = r1.value_for_money;
    const review     = r1.review;
    const three      = Array.isArray(r1.three_words) ? r1.three_words : (r1.three_words_words || []);
    const activities = (myAnswers.r2 || {}).activities;
    const valueForMoneyOption = ((QUESTIONNAIRE[0].questions.find(q => q.key === 'value_for_money') || {}).options || [])
      .find(o => o.value === valueForMoney);
    outcomesHTML = `
      <div class="outcomes-grid">
        ${overall   ? `<div class="fact"><div class="label">${esc(lang==='zh'?'整体评分':'Overall')}</div><div class="value">${'★'.repeat(overall)}${'☆'.repeat(5-overall)}</div></div>` : ''}
        ${recommend ? `<div class="fact"><div class="label">${esc(lang==='zh'?'推荐意愿':'Would recommend')}</div><div class="value">${recommend>=4?(lang==='zh'?'会推荐':'Yes'):(recommend<=2?(lang==='zh'?'不会':'No'):(lang==='zh'?'一般':'Maybe'))}</div></div>` : ''}
        ${valueForMoneyOption ? `<div class="fact"><div class="label">${esc(lang==='zh'?'是否值得':'Worth it')}</div><div class="value">${esc(pickL(valueForMoneyOption))}</div></div>` : ''}
      </div>
      ${review ? `<div style="margin-top:14px"><strong>${esc(lang==='zh'?'你的点评':'Your review')}:</strong><p class="muted" style="margin:6px 0 0">${esc((review || '').slice(0,280))}${(review||'').length>280?'…':''}</p></div>` : ''}
      ${three.length ? `<div style="margin-top:14px"><strong>${esc(lang==='zh'?'三个词':'Three words')}:</strong> ${three.map(w => `<span class="subject-chip">${esc(w)}</span>`).join(' ')}</div>` : ''}
      ${activities && activities.length ? `<div style="margin-top:14px"><strong>${esc(lang==='zh'?'学术活动':'Academic activities')}:</strong> ${activities.map(w => `<span class="subject-chip">${esc(w)}</span>`).join(' ')}</div>` : ''}
    `;
  }

  const facts = `
    <div class="fact"><div class="label">${esc(t('profileDeadline', lang))}</div><div class="value">${esc(pickL(p.deadline))}</div></div>
    <div class="fact"><div class="label">${esc(t('profileDuration', lang))}</div><div class="value">${esc(pickL(p.duration))}</div></div>
    <div class="fact"><div class="label">${esc(t('profileTuition', lang))}</div><div class="value">${esc(pickL(p.tuition))}</div></div>
    <div class="fact"><div class="label">${esc(t('profileAcceptance', lang))}</div><div class="value">${esc(p.acceptance)}</div></div>
  `;

  const reviewsSub = (title, list) => list.length
    ? `<h3 class="subhead">${esc(title)}</h3><div class="reviews-list">${list.slice(0, 4).map(reviewCard).join('')}</div>`
    : '';

  const cleanSummaryValue = value => {
    const raw = String(value || '').replace(/^[\s•·-]+/, '').trim();
    return raw.split(/\n/).map(line => line.replace(/^[\s•·-]+/, '').trim()).filter(Boolean)[0] || (lang === 'zh' ? '请查看项目官网' : 'See official program page');
  };
  const formatValue = p.officialInfo && p.officialInfo.participationFormat
    ? officialText(cleanSummaryValue(p.officialInfo.participationFormat), lang)
    : (lang === 'zh' ? '参与形式见官网' : 'See participation format');
  const profileAverage = reviews.length
    ? reviews.reduce((sum, review) => sum + Number(review.stars || 0), 0) / reviews.length
    : 0;
  const isHarvardPreCollegeExemplar = id === 'catalog-001-harvard-pre-college-program';
  const exemplarReview = isHarvardPreCollegeExemplar ? {
    average:4.6,
    worthIt:92,
    count:37,
    vibe:['Inspiring','Rigorous','Welcoming','Social','Structured'],
    stories:[
      {
        author:lang === 'zh' ? '2026 年住宿学生' : '2026 residential participant',
        who:lang === 'zh' ? '最难忘的故事' : 'Most memorable story',
        stars:5,
        text:lang === 'zh'
          ? '第一周我还不确定自己能不能跟上。后来一次晚课结束后，我们在宿舍公共区继续聊课堂上的问题。那一刻我第一次觉得，大学生活可能真的就是这样——有挑战，也有让人兴奋的同伴。'
          : 'During the first week I was not sure I could keep up. After one evening class, a few of us kept discussing the day’s ideas in the common room. It was the first time college felt real—challenging, exciting, and surprisingly welcoming.'
      },
      {
        author:lang === 'zh' ? '2026 年住宿学生' : '2026 residential participant',
        who:lang === 'zh' ? '喜欢与不喜欢' : 'Liked and disliked',
        stars:4,
        text:lang === 'zh'
          ? '我最喜欢的是讨论课和认识来自不同地方的朋友。作业量比我预期的大，但老师很愿意在课后解释。餐饮选择有点重复，不过整体体验仍然很值得。'
          : 'I loved the seminar discussions and meeting people from different places. The workload was heavier than I expected, but the instructors were generous with help after class. Dining became repetitive, though the overall experience still felt worth it.'
      },
      {
        author:lang === 'zh' ? '2025 年住宿学生' : '2025 residential participant',
        who:lang === 'zh' ? '给朋友的建议' : 'Advice to a friend',
        stars:5,
        text:lang === 'zh'
          ? '不要只看课程名称。真正决定体验的是你愿不愿意主动提问、参加活动，以及和同学一起探索校园和城市。给自己留一点休息时间。'
          : 'Do not choose only by the course title. Your experience depends on asking questions, joining activities, and making time to explore campus and the city with friends. Leave yourself a little time to rest, too.'
      }
    ],
    categories:{
      academics:{
        stat:lang === 'zh' ? '4.6 / 5 学术体验' : '4.6 / 5 academic experience',
        details:lang === 'zh' ? ['学习量：偏重但可控','教师：清晰 4.7 · 热情 4.8 · 讨论 4.6 · 课外帮助 4.5'] : ['Workload: somewhat heavy but manageable','Instructors: clarity 4.7 · enthusiasm 4.8 · discussion 4.6 · outside help 4.5'],
        quote:lang === 'zh' ? '“课堂真的有挑战，但老师会认真对待我们的想法。”' : '“The classes were challenging in a good way, and the instructors took our ideas seriously.”'
      },
      students:{
        stat:lang === 'zh' ? '4.5 / 5 学生生活' : '4.5 / 5 student life',
        details:lang === 'zh' ? ['交朋友与融入：比较容易','课外活动：周末出行 · 晚间活动 · 运动 · 兴趣小组'] : ['Making friends and feeling included: somewhat easy','Free time: weekend trips · evening events · sports · interest groups'],
        quote:lang === 'zh' ? '“我最怀念的是认识了兴趣相近的人，以及我们深夜的聊天。”' : '“I most remember meeting people with similar interests and our late-night conversations.”'
      },
      campus:{
        stat:lang === 'zh' ? '4.4 / 5 校园生活' : '4.4 / 5 campus life',
        details:lang === 'zh' ? ['餐饮 3.8 · 住宿 4.2 · 教室 4.7 · 公共空间 4.3','安全感 4.7 · 校园出行 4.5 · 周边交通和餐饮方便'] : ['Food 3.8 · dorms 4.2 · classrooms 4.7 · common spaces 4.3','Safety 4.7 · getting around 4.5 · easy access to transit and food'],
        quote:lang === 'zh' ? '“我最喜欢傍晚去河边散步，再和朋友一起回宿舍。”' : '“My favorite routine was walking by the river at sunset before heading back to the dorm with friends.”'
      },
      outcomes:{
        stat:lang === 'zh' ? '学生带走的收获' : 'What students walked away with',
        details:lang === 'zh' ? ['更清楚自己的学术兴趣 · 更有信心参与大学课堂','友谊 · 大学生活体验 · 结业证明'] : ['Clearer academic interests · more confidence in college-level classes','Friendships · a taste of college life · certificate of completion'],
        quote:lang === 'zh' ? '“项目让我知道自己想继续探索什么，也让我对大学申请更有信心。”' : '“The program helped me see what I want to keep exploring and made college feel less intimidating.”'
      }
    }
  } : null;
  const heroPhoto = campusPhotoFor(p, { id:'program-summary' });
  const logo = programLogoUrl(p) || p.image || '';
  const displayedStories = exemplarReview ? exemplarReview.stories : reviews;
  const firstStory = displayedStories[0] || null;
  const summaryCategories = [
    {
      key:'academics',
      icon:'academics',
      title:lang === 'zh' ? '学术体验' : 'Academics',
      body:lang === 'zh' ? '课程、教学、学术强度与学习方式。' : 'Coursework, teaching, academic intensity, and how students learn.',
      reviews:academicsReviews,
      href:`#/program/${id}/academics`
    },
    {
      key:'students',
      icon:'students',
      title:lang === 'zh' ? '学生生活' : 'Student Life',
      body:lang === 'zh' ? '同伴、归属感、社交氛围与日常节奏。' : 'Peers, belonging, social atmosphere, and the rhythm of daily life.',
      reviews:lifeReviews,
      href:`#/program/${id}/students`
    },
    {
      key:'campus',
      icon:'campus',
      title:lang === 'zh' ? '校园生活' : 'Campus Life',
      body:lang === 'zh' ? '住宿、餐饮、安全、设施与周边环境。' : 'Housing, food, safety, facilities, and the surrounding area.',
      reviews:campusReviews,
      href:`#/program/${id}/campus`
    },
    {
      key:'outcomes',
      icon:'outcomes',
      title:lang === 'zh' ? '项目收获' : 'Outcomes',
      body:lang === 'zh' ? '技能、成长、方向感与项目结束后的影响。' : 'Skills, growth, direction, and what lasted after the program.',
      reviews:gotOutReviews,
      href:`#/program/${id}/outcomes`
    }
  ];
  const summaryCategoryHTML = summaryCategories.map(category => {
    const exemplarCategory = exemplarReview && exemplarReview.categories[category.key];
    const quote = category.reviews[0];
    return `<a class="program-summary-card ${exemplarCategory ? 'program-summary-card--complete' : ''}" href="${esc(category.href)}">
      <span class="program-summary-card__icon">${programSummaryIcon(category.icon)}</span>
      <span class="program-summary-card__copy">
        <span class="program-summary-card__title">${esc(category.title)}</span>
        <span class="program-summary-card__body">${esc(category.body)}</span>
        ${exemplarCategory ? `<span class="program-summary-card__stat">${esc(exemplarCategory.stat)}</span><span class="program-summary-card__details">${exemplarCategory.details.map(detail => `<i>${esc(detail)}</i>`).join('')}</span><span class="program-summary-card__quote">${esc(exemplarCategory.quote)}</span>` : `<span class="program-summary-card__quote ${quote ? '' : 'is-empty'}">${quote ? `“${esc((quote.text || '').slice(0, 180))}${(quote.text || '').length > 180 ? '…' : ''}”` : esc(lang === 'zh' ? '等待已验证的学生反馈' : 'Awaiting verified student feedback')}</span>`}
      </span>
      <span class="program-summary-card__arrow" aria-hidden="true">›</span>
    </a>`;
  }).join('');

  const html = `
    ${renderHeader('home')}
    <main class="program-summary-page ${isHarvardPreCollegeExemplar ? 'program-summary-page--exemplar' : ''}">
      <section class="program-summary-hero">
        <div class="program-summary-hero__photo" style="background-image:url('${esc(heroPhoto)}')"></div>
        <div class="program-summary-hero__veil"></div>
        <div class="program-summary-hero__inner">
          <div class="program-summary-hero__copy">
            <p class="program-summary-eyebrow">${esc(lang === 'zh' ? '美国大学预科暑期项目' : 'PRE-COLLEGE SUMMER PROGRAM')}</p>
            <h1>${esc(pickL(p.name))}</h1>
            <p class="program-summary-hero__tagline">${esc(pickL(p.tagline) || (lang === 'zh' ? `由 ${pickL(p.host)} 主办的暑期项目。` : `A summer program hosted by ${pickL(p.host)}.`))}</p>
            <div class="program-summary-meta">
              <span>${programSummaryIcon('location')}<strong>${esc(cleanSummaryValue(pickL(p.location)))}</strong></span>
              <span>${programSummaryIcon('calendar')}<strong>${esc(cleanSummaryValue(pickL(p.duration)))}</strong></span>
              <span>${programSummaryIcon('format')}<strong>${esc(formatValue)}</strong></span>
              <span>${programSummaryIcon('host')}<strong>${esc(pickL(p.host))}</strong></span>
            </div>
          </div>
          ${logo ? `<div class="program-summary-hero__mark"><img src="${esc(logo)}" alt="${esc(pickL(p.host))} logo"></div>` : ''}
        </div>
      </section>

      <section class="program-summary-dashboard" aria-label="${esc(lang === 'zh' ? '项目概览' : 'Program overview')}">
        <div class="program-stories">
          <div class="program-summary-section-head">
            <div><p class="program-summary-eyebrow">${esc(lang === 'zh' ? '学生真实讲述' : 'STUDENT PERSPECTIVES')}</p><h2>${esc(lang === 'zh' ? '学生故事' : 'Student Stories')}</h2></div>
            <p>${esc(exemplarReview ? (lang === 'zh' ? '示例预览 · 非已发布评价' : 'Exemplar preview · not published reviews') : (lang === 'zh' ? '来自参加过该项目的学生。' : 'Real experiences from past participants.'))}</p>
          </div>
          ${exemplarReview ? `<div class="program-story-tabs" aria-label="${esc(lang === 'zh' ? '故事类型' : 'Story types')}"><span class="is-active">${esc(lang === 'zh' ? '难忘故事' : 'Memories')}</span><span>${esc(lang === 'zh' ? '真实感受' : 'Honest opinions')}</span><span>${esc(lang === 'zh' ? '给朋友的建议' : 'Advice')}</span></div>` : ''}
          ${firstStory ? `
            <article class="program-story-feature">
              <div class="program-story-feature__copy">
                <span class="program-story-feature__quote">“</span>
                <blockquote>${esc(firstStory.text || '')}</blockquote>
                <p>— ${esc(firstStory.author || (lang === 'zh' ? '匿名学生' : 'Anonymous student'))}${firstStory.who ? ` · ${esc(firstStory.who)}` : ''}</p>
              </div>
              <div class="program-story-feature__photo" style="background-image:url('${esc(heroPhoto)}')" role="img" aria-label="${esc(lang === 'zh' ? '校园生活示意图' : 'Illustrative campus scene')}"></div>
            </article>
          ` : `
            <div class="program-story-empty">
              <div class="program-story-empty__mark">“</div>
              <div><h3>${esc(lang === 'zh' ? '等待第一位学生分享' : 'Be the first to share this summer')}</h3><p>${esc(lang === 'zh' ? '经过验证的学生评价会显示在这里。' : 'Verified student stories will appear here once they are submitted.')}</p></div>
              <a class="btn--solid" href="#/survey/${esc(id)}">${esc(lang === 'zh' ? '写下你的故事' : 'Write a review')}</a>
            </div>
          `}
        </div>

        <aside class="program-glance">
          <p class="program-summary-eyebrow">${esc(lang === 'zh' ? '快速了解' : 'AT A GLANCE')}</p>
          <h2>${esc(lang === 'zh' ? '项目一览' : 'At a Glance')}</h2>
          <div class="program-glance__scores">
            <div><span>${esc(lang === 'zh' ? '综合评分' : 'Overall rating')}</span><strong>${exemplarReview ? exemplarReview.average.toFixed(1) : (reviews.length ? profileAverage.toFixed(1) : '—')}${exemplarReview || reviews.length ? '<small>/5</small>' : ''}</strong></div>
            <div><span>${esc(exemplarReview ? (lang === 'zh' ? '认为值得' : 'Worth it') : (lang === 'zh' ? '学生评价' : 'Student reviews'))}</span><strong>${exemplarReview ? exemplarReview.worthIt + '<small>%</small>' : (reviews.length || '—')}</strong></div>
          </div>
          <div class="program-glance__focus">
            <span>${esc(exemplarReview ? (lang === 'zh' ? '学生眼中的氛围' : 'Student-described vibe') : (lang === 'zh' ? '项目特色' : 'Program focus'))}</span>
            <div>${exemplarReview ? exemplarReview.vibe.map(value => `<b>${esc(value)}</b>`).join('') : (((p.discovery && [...(p.discovery.subjects || []), ...(p.discovery.methods || [])]) || []).slice(0,5).map(value => `<b>${esc(lang === 'zh' && window.SS_PROGRAM_DISCOVERY ? window.SS_PROGRAM_DISCOVERY.translations[value] || value : value)}</b>`).join('') || `<em>${esc(lang === 'zh' ? '查看官方项目详情' : 'See official program details')}</em>`)}</div>
          </div>
          <a class="program-glance__primary" href="#/program/${esc(id)}/students">${esc(lang === 'zh' ? '阅读学生故事' : 'Read student stories')} <span>→</span></a>
          <button type="button" class="program-glance__save" id="profile-save-program" aria-pressed="${window.SSDB.inList(id)}">${esc(window.SSDB.inList(id) ? (lang === 'zh' ? '已收藏 ✓' : 'Saved ✓') : (lang === 'zh' ? '收藏项目' : 'Save program'))}</button>
          <a class="program-glance__official" href="${esc(p.website)}" target="_blank" rel="noopener">${esc(lang === 'zh' ? '访问项目官网' : 'Official program website')} ↗</a>
        </aside>
      </section>

      <section class="program-summary-grid">${summaryCategoryHTML}</section>

      <!-- Overview -->
      <section class="profile-section profile-section--narrow">
        <div class="profile-section__inner">
          <h2>${esc(t('profileOverview', lang))}</h2>
          ${programOverviewFactsHTML(p, lang)}
        </div>
      </section>

      <!-- Admissions -->
      <section class="profile-section profile-section--narrow" style="background:var(--bg-soft)">
        <div class="profile-section__inner">
          ${programAdmissionsHTML(p, lang, d.admissions)}
        </div>
      </section>

      ${isHarvardPreCollegeExemplar ? `<div class="program-summary-back"><a class="profile-back-to-programs" href="#/pick">${esc(lang === 'zh' ? '← 返回项目列表' : '← Back to programs')}</a></div>` : `<section class="profile-section profile-section--narrow" id="program-reviews"><div class="profile-section__inner"><h2>${esc(t('profileAllReviews', lang))}</h2>${reviews.length ? reviews.map(reviewCard).join('') : ''}<div class="write-review-card"><div><p class="experience-eyebrow">${esc(lang === 'zh' ? '分享真实体验' : 'STUDENT PERSPECTIVE')}</p><h3>${esc(lang === 'zh' ? '参加过这个项目？' : 'Attended this program?')}</h3><p>${esc(lang === 'zh' ? '填写问卷，帮助其他学生了解实际体验。' : 'Share what it was really like and help the next student decide.')}</p></div><a class="application-portal-button" href="#/survey/${esc(id)}">${esc(lang === 'zh' ? '填写问卷' : 'Write a review')} →</a></div><a class="profile-back-to-programs" href="#/pick">${esc(lang === 'zh' ? '← 返回项目列表' : '← Back to programs')}</a></div></section>`}
    </main>
    ${renderFooter()}
  `;
  $('#app').innerHTML = html;
  bindHeaderEvents();
  $('#profile-save-program')?.addEventListener('click', e => {
    const saved = window.SSDB.toggleList(id);
    e.currentTarget.setAttribute('aria-pressed', String(saved));
    e.currentTarget.textContent = saved ? (lang === 'zh' ? '已收藏 ✓' : 'Saved ✓') : (lang === 'zh' ? '收藏项目' : 'Save program');
  });
  $$('[data-del-review]', document).forEach(btn => {
    btn.addEventListener('click', () => {
      const rid = btn.getAttribute('data-del-review');
      window.SSDB.deleteReview(rid);
      renderProgram(id);
    });
  });
}

function subscoreHTML(key, label, value) {
  return `
    <div class="subscore" data-key="${esc(key)}">
      <div class="subscore__label">${esc(label)}</div>
      <div class="subscore__bar"><i style="width:${(value/5)*100}%"></i></div>
      <div class="subscore__score">${value.toFixed(1)}</div>
    </div>
  `;
}

/* ============================ SURVEY RESULT HELPERS ================== */

function infoItem(label, valueHTML, wide) {
  return `<div class="info-item ${wide ? 'info-item--wide' : ''}">
      <div class="info-item__label">${label}</div>
      <div class="info-item__value">${valueHTML}</div>
    </div>`;
}
function shortProgramName(program) {
  const name = pickL(program.name) || pickL(program.host) || 'this program';
  return name.replace(/\s*\([^)]*\)\s*$/, '').replace(/\b(programs?|summer school|summer program)\b/ig, '').trim() || name;
}
function programDisplayDetails(program, details, lang) {
  const existingAdmissions = details.admissions || {};
  const verifiedAgeRange = details.ageRange && details.ageRangeSource && details.ageRangeSource.url;
  const verifiedDiversity = details.diversity && details.diversitySource && details.diversitySource.url;
  return Object.assign({}, details, {
    ageRange:verifiedAgeRange ? details.ageRange : null,
    ageRangeLabel:verifiedAgeRange ? (details.ageRangeLabel || { en:'Eligibility', zh:'申请资格' }) : null,
    ageRangeSource:verifiedAgeRange ? details.ageRangeSource : null,
    diversity:verifiedDiversity ? details.diversity : null,
    diversitySource:verifiedDiversity ? details.diversitySource : null,
    admissions:Object.assign({}, existingAdmissions, {
      portalUrl:existingAdmissions.portalUrl || (program.applicationUrl && program.applicationUrl !== 'Unknown' ? program.applicationUrl : program.website && program.website !== 'Unknown' ? program.website : '#')
    })
  });
}
function officialText(value, lang) {
  return lang === 'zh' && window.SSOfficialZh ? window.SSOfficialZh.translate(value) : value;
}
function officialProgramFacts(id, lang) {
  const isZh = lang === 'zh';
  const catalogProgram = programById(id);
  const catalogInfo = catalogProgram && catalogProgram.officialInfo;
  if (catalogInfo) {
    const sourceUrl = catalogInfo.sourceUrl && catalogInfo.sourceUrl !== 'Unknown' ? catalogInfo.sourceUrl : catalogInfo.programUrl && catalogInfo.programUrl !== 'Unknown' ? catalogInfo.programUrl : '#';
    const applicationUrl = catalogInfo.applicationUrl && catalogInfo.applicationUrl !== 'Unknown' ? catalogInfo.applicationUrl : sourceUrl;
    const cycleYear = String(catalogInfo.dataCycle || '').match(/20\d{2}/);
    const valueOrUnknown = value => value && value !== 'Unknown' ? value : (isZh ? '未知' : 'Unknown');
    const programDates = valueOrUnknown(catalogInfo.programDates);
    return {
      deadlines:formatOfficialDeadlineRows(valueOrUnknown(catalogInfo.applicationDeadline), sourceUrl, isZh),
      duration:{ value:valueOrUnknown(catalogInfo.sessionLength), url:sourceUrl },
      cost:{
        tuition:valueOrUnknown(catalogInfo.tuition),
        tuitionUrl:sourceUrl,
        applicationFees:[{ label:isZh ? '申请费' : 'Application fee', value:valueOrUnknown(catalogInfo.applicationFee), url:applicationUrl }],
        financialAid:{ value:valueOrUnknown(catalogInfo.financialAid), url:sourceUrl }
      },
      sessions:{
        heading:isZh ? `${cycleYear ? cycleYear[0] : ''} 项目日期` : `${cycleYear ? cycleYear[0] + ' ' : ''}program dates`,
        sourceLabel:isZh ? '官方项目日期来源' : 'Official program dates source',
        url:sourceUrl,
        items:formatOfficialSessionRows(programDates, valueOrUnknown(catalogInfo.participationFormat), isZh)
      },
      research:{ url:sourceUrl, checkedOn:valueOrUnknown(catalogInfo.dataCycle), verified:true }
    };
  }
  const facts = {
    yygs: {
      deadlines: [
        { label:isZh ? '早申' : 'Early Action', value:isZh ? '2026 年 10 月 15 日' : 'October 15, 2026', url:'https://globalscholars.yale.edu/application-deadlines' },
        { label:isZh ? '常规申请' : 'Regular Decision', value:isZh ? '2027 年 1 月 6 日' : 'January 6, 2027', url:'https://globalscholars.yale.edu/application-deadlines' }
      ],
      duration:{ value:isZh ? '一段两周的住宿式课程' : 'One residential, two-week session', url:'https://globalscholars.yale.edu/how-apply/session-offerings' },
      cost:{ tuition:'$7,500', tuitionUrl:'https://globalscholars.yale.edu/tuition', applicationFees:[{ label:isZh ? '申请费' : 'Application fee', value:isZh ? '早申 $85 · 常规申请 $100' : '$85 Early Action · $100 Regular Decision', url:'https://globalscholars.yale.edu/required-components' }] },
      acceptance:{ value:'≈14%', url:'https://globalscholars.yale.edu/news/yale-young-global-scholars-opens-application-summer-2027', note:isZh ? '估算：近 2,000 个名额 ÷ 14,000+ 份申请；YYGS 未公布正式录取率。' : 'Calculated from nearly 2,000 places and 14,000+ applications; YYGS does not publish a formal rate.' },
      sessions:{ heading:isZh ? '2027 项目日期' : '2027 session dates', sourceLabel:isZh ? 'YYGS 官方日程' : 'Official YYGS schedule', url:'https://globalscholars.yale.edu/how-apply/session-offerings', items:isZh ? [
        { label:'第一期', value:'2027 年 6 月 20 日–7 月 2 日' }, { label:'第二期', value:'2027 年 7 月 4 日–7 月 16 日' }, { label:'第三期', value:'2027 年 7 月 18 日–7 月 30 日' }
      ] : [
        { label:'Session I', value:'June 20–July 2, 2027' }, { label:'Session II', value:'July 4–July 16, 2027' }, { label:'Session III', value:'July 18–July 30, 2027' }
      ] }
    },
    rise: {
      deadlines:[{ label:isZh ? '申请截止' : 'Application deadline', value:isZh ? '2027 年 2 月 3 日 23:59（美国东部时间）' : 'February 3, 2027 at 11:59 p.m. ET', url:'https://www.bu.edu/summer/high-school-programs/rise-internship-practicum/how-to-apply/rise-admissions-timeline/' }],
      duration:{ value:isZh ? '六周' : 'Six weeks', url:'https://www.bu.edu/summer/high-school-programs/rise-internship-practicum/' },
      cost:{ tuition:isZh ? '学费 $5,930 + 服务费 $485（2026）' : '$5,930 tuition + $485 service fee (2026)', tuitionUrl:'https://www.bu.edu/summer/high-school-programs/rise-internship-practicum/tuition-aid-payment/', applicationFees:[{ label:isZh ? '申请费（2026）' : 'Application fee (2026)', value:'$75', url:'https://www.bu.edu/summer/high-school-programs/rise-internship-practicum/tuition-aid-payment/' }] },
      sessions:{ heading:isZh ? '2027 项目日期' : '2027 program dates', sourceLabel:isZh ? 'BU 官方 RISE 日历' : 'Official BU RISE calendar', url:'https://www.bu.edu/summer/high-school-programs/rise-internship-practicum/', note:isZh ? '官网标注：日期尚待批准，可能调整。' : 'The official page says these dates are pending approval and subject to change.', items:isZh ? [
        { label:'住宿学生', value:'2027 年 6 月 27 日–8 月 6 日' }, { label:'通勤学生', value:'2027 年 6 月 28 日–8 月 6 日' }
      ] : [
        { label:'Residential', value:'June 27–August 6, 2027' }, { label:'Commuter', value:'June 28–August 6, 2027' }
      ] }
    },
    'harvard-ssp': {
      deadlines:[
        { label:isZh ? '优先申请／优先助学金' : 'Early application / priority aid', value:isZh ? '2027 年 1 月 13 日' : 'January 13, 2027', url:'https://summer.harvard.edu/high-school/admissions/' },
        { label:isZh ? '常规申请／助学金' : 'Regular application / aid', value:isZh ? '2027 年 2 月 10 日' : 'February 10, 2027', url:'https://summer.harvard.edu/high-school/admissions/' },
        { label:isZh ? '国际学生截止' : 'International student deadline', value:isZh ? '2027 年 2 月 10 日' : 'February 10, 2027', url:'https://summer.harvard.edu/high-school/admissions/' },
        { label:isZh ? '补充申请' : 'Late application', value:isZh ? '2027 年 3 月 31 日（或候补名单满额时提前截止）' : 'March 31, 2027, or earlier if waitlists fill', url:'https://summer.harvard.edu/high-school/admissions/' }
      ],
      duration:{ value:isZh ? '4 周或 7 周' : '4 or 7 weeks', url:'https://summer.harvard.edu/high-school-programs/secondary-school-program/' },
      cost:{ tuition:isZh ? '$4,180–$15,980（2027，按学分和参与形式不同）' : '$4,180–$15,980 (2027; varies by credits and format)', tuitionUrl:'https://summer.harvard.edu/high-school-programs/secondary-school-program/', applicationFees:[{ label:isZh ? '申请费' : 'Application fee', value:'$75', url:'https://summer.harvard.edu/high-school-programs/secondary-school-program/' }] },
      sessions:{ heading:isZh ? '2027 项目日期' : '2027 program dates', sourceLabel:isZh ? '哈佛官方 Secondary School Program 页面' : 'Official Harvard Secondary School Program page', url:'https://summer.harvard.edu/high-school-programs/secondary-school-program/', items:isZh ? [
        { label:'4 周 Session I', value:'2027 年 6 月 14 日–7 月 8 日' }, { label:'4 周 Session II', value:'2027 年 7 月 12 日–8 月 5 日' }, { label:'7 周', value:'2027 年 6 月 21 日–8 月 6 日' }
      ] : [
        { label:'4-Week Session I', value:'June 14–July 8, 2027' }, { label:'4-Week Session II', value:'July 12–August 5, 2027' }, { label:'7-Week', value:'June 21–August 6, 2027' }
      ] }
    },
    'ucsb-pre': {
      deadlines:[
        { label:isZh ? '申请开放' : 'Applications open', value:isZh ? '2026 年 12 月 15 日' : 'December 15, 2026', url:'https://summer.ucsb.edu/programs/summer-research-academies/admissions' },
        { label:isZh ? '申请截止' : 'Application deadline', value:isZh ? '2027 年 3 月 22 日（滚动录取）' : 'March 22, 2027 (rolling admission)', url:'https://summer.ucsb.edu/programs/summer-research-academies/admissions' }
      ],
      duration:{ value:isZh ? '约一个月' : 'Approximately one month', url:'https://summer.ucsb.edu/programs/summer-research-academies/overview' },
      cost:{
        tuition:isZh ? '$3,400 学费与项目费（2026；住宿选项另收 $6,399 住宿与餐食费）' : '$3,400 tuition and program fees (2026; residential option adds $6,399 housing and meals)',
        tuitionUrl:'https://summer.ucsb.edu/programs/summer-research-academies/cost-of-attendance',
        applicationFees:[{ label:isZh ? '申请费（2026）' : 'Application fee (2026)', value:'$75', url:'https://summer.ucsb.edu/programs/summer-research-academies/cost-of-attendance' }],
        note:isZh ? '2027 费用尚未在该官方费用页公布。' : 'The official cost page has not yet published 2027 pricing.'
      },
      sessions:{
        heading:isZh ? '2027 项目日期' : '2027 program dates',
        sourceLabel:isZh ? 'UCSB SRA 官方项目概览' : 'Official UCSB SRA overview',
        url:'https://summer.ucsb.edu/programs/summer-research-academies/overview',
        items:isZh ? [{ label:'Summer Research Academies', value:'2027 年 6 月 25 日–7 月 24 日' }] : [{ label:'Summer Research Academies', value:'June 25–July 24, 2027' }]
      }
    },
    'duke-pre': {
      duration:{ value:isZh ? '三期；2027 具体日期将于 2026 年 10 月公布' : 'Three sessions; exact 2027 dates announced in October 2026', url:'https://provost.duke.edu/duke-pre-college-programs/' },
      cost:{ tuition:isZh ? '2027 费用待公布' : '2027 fees: TBD', tuitionUrl:'https://provost.duke.edu/duke-pre-college-programs/', applicationFees:[], note:isZh ? '官网尚未公布具体金额。' : 'The official program page has not published an amount yet.' }
    },
    'jhu-cty': {
      duration:{ value:isZh ? '三周住宿课程' : 'Three-week residential course', url:'https://cty.jhu.edu/cty-experience/residential' },
      sessions:{ heading:isZh ? '2027 暂定核心日期' : 'Tentative 2027 core dates', sourceLabel:isZh ? 'CTY 官方住宿课程页面' : 'Official CTY residential page', url:'https://cty.jhu.edu/cty-experience/residential', note:isZh ? '官网将这些日期标为暂定。' : 'The official page labels these dates tentative.', items:isZh ? [
        { label:'Summer A', value:'2027 年 6 月 27 日–7 月 16 日' }, { label:'Summer B', value:'2027 年 7 月 18 日–8 月 6 日' }
      ] : [
        { label:'Summer A', value:'June 27–July 16, 2027' }, { label:'Summer B', value:'July 18–August 6, 2027' }
      ] }
    },
    'northwestern-pre': {
      duration:{ value:isZh ? '依课程类型为 2–10 周（2026）' : '2–10 weeks, depending on program type (2026)', url:'https://sps.northwestern.edu/college-preparation/tuition.html' },
      cost:{ tuition:isZh ? '线上 $1,895/门；IN FOCUS $3,625–$5,235；学分课程费用另计（2026）' : 'Online $1,895/course; IN FOCUS $3,625–$5,235; credit-program cost varies (2026)', tuitionUrl:'https://sps.northwestern.edu/college-preparation/tuition.html', applicationFees:[], note:isZh ? '官网按线上、通勤、住宿及学分课程分别列价。' : 'The official page lists separate online, commuter, residential, and credit-course prices.' }
    },
    'vanderbilt-pre': {
      duration:{ value:isZh ? '两周住宿课程' : 'Two-week residential program', url:'https://pty.vanderbilt.edu/vsi/vsi_tuition-financial-assistance/' },
      cost:{ tuition:isZh ? '$5,950（2027，两周课程）' : '$5,950 (2027 two-week program)', tuitionUrl:'https://pty.vanderbilt.edu/vsi/vsi_tuition-financial-assistance/', applicationFees:[{ label:isZh ? '申请费' : 'Application fee', value:isZh ? '美国申请人 $50 · 国际申请人 $100' : '$50 domestic · $100 international', url:'https://pty.vanderbilt.edu/vsi/vsi_tuition-financial-assistance/' }] },
      sessions:{ heading:isZh ? '2027 项目日期' : '2027 program dates', sourceLabel:isZh ? 'VSI 官方费用与日期页面' : 'Official VSI tuition and dates page', url:'https://pty.vanderbilt.edu/vsi/vsi_tuition-financial-assistance/', note:isZh ? '官网注明日期可能调整。' : 'The official page says dates are subject to change.', items:isZh ? [
        { label:'两周课程', value:'2027 年 6 月 13–25 日' }, { label:'两周课程', value:'2027 年 6 月 20 日–7 月 2 日' }, { label:'两周课程', value:'2027 年 7 月 11–23 日' }
      ] : [
        { label:'Two-week program', value:'June 13–25, 2027' }, { label:'Two-week program', value:'June 20–July 2, 2027' }, { label:'Two-week program', value:'July 11–23, 2027' }
      ] }
    }
  };
  if (facts[id]) return facts[id];

  // Spreadsheet-backed listings already contain a reviewed official source
  // and field values. Render those supported fields instead of requiring a
  // second, hard-coded entry for every program ID.
  const program = programById(id);
  const source = program && program.source && program.source.verified
    ? program.source
    : program && program.spreadsheetSource && program.spreadsheetSource.verified
      ? program.spreadsheetSource
      : null;
  if (!program) return null;
  const officialUrl = source && source.officialUrl ? source.officialUrl : (program.website || '#');
  const checkedOn = source && source.checked ? source.checked : '2026-10-18';
  const value = function (field) { return field && (field[lang] || field.en || field.zh || field); };
  const useful = function (field) {
    const text = String(value(field) || '').trim();
    return text && !/^(check official source|see official program|summer \(exact|待官网核实|请查看官网)/i.test(text);
  };
  const derived = {};
  if (source && useful(program.duration)) {
    derived.duration = { value:String(value(program.duration)), url:officialUrl };
  }
  if (source && useful(program.tuition)) {
    derived.cost = {
      tuition:String(value(program.tuition)),
      tuitionUrl:officialUrl,
      applicationFees:[],
      note:source && source.feeYear ? (isZh ? `官网所列年份：${source.feeYear}` : `Officially listed year: ${source.feeYear}`) : ''
    };
  }
  derived.research = {
    url:officialUrl,
    checkedOn:checkedOn,
    verified:!!(source && source.verified)
  };
  return derived;
}
function officialBulletLines(value) {
  const rawLines = String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const hasBullets = rawLines.some(line => /^[•·▪‣–—-]\s*/.test(line) || /\s[•▪‣]\s/.test(line));
  const lines = rawLines.flatMap(line => line.split(/\s*[•▪‣]\s*/).map(part => part.trim()).filter(Boolean));
  const seen = new Set();
  const uniqueLines = lines.map(line => line.replace(/^[•·▪‣–—-]\s*/, '').replace(/\s*[↗↘↖↙]+\s*$/g, '').trim()).filter(line => {
    const key = line.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    hasBullets,
    lines:uniqueLines
  };
}
function formatOfficialSessionRows(raw, format, isZh) {
  const value = String(raw || '').trim();
  const fallback = isZh ? '日期' : 'Dates';
  if (!value || value === 'Unknown' || value === '未知') return [{ label:fallback, value:value || (isZh ? '未知' : 'Unknown') }];
  const modePattern = /(hybrid\s*\/\s*online|on[- ]campus|in[- ]person|residential|commuter|online|virtual|hybrid)/i;
  const dateLike = part => /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b/i.test(part)
    || /\b\d{1,2}\s*[-–]\s*\d{1,2}\s*,?\s*20\d{2}\b/.test(part);
  const prettyMode = token => {
    const clean = token.replace(/[- ]/g, ' ').replace(/\s*\/\s*/g, ' / ');
    return clean.replace(/\b\w/g, character => character.toUpperCase());
  };
  const sourceLines = officialBulletLines(value);
  const chunks = (sourceLines.hasBullets ? sourceLines.lines : value.split(/\s*;\s*/))
    .map(part => part.replace(/[.]$/, '').trim()).filter(Boolean);
  const rows = [];
  chunks.forEach(part => {
    const durationOnly = /^(?:summer\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*[-–]\s*|\s+)?weeks?(?:\s+(?:total|sessions?|per\s+course))?$/i.test(part);
    const hasStandaloneLength = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*[-–]\s*|\s+)?weeks?\b/i.test(part);
    if (durationOnly || (!dateLike(part) && hasStandaloneLength && !/\b(?:dates?\s+(?:vary|varied|pending|not\s+(?:yet\s+)?published|not\s+listed)|not\s+(?:yet\s+)?published|pending)\b/i.test(part))) return;
    if (!dateLike(part)) {
      if (/\b(?:dates?\s+(?:vary|varied|pending|not\s+(?:yet\s+)?published|not\s+listed)|not\s+(?:yet\s+)?published|pending|canceled|cancelled|course[- ]dependent)\b/i.test(part)) {
        rows.push({ label:isZh ? '日期状态' : 'Date status', value:part });
      } else if (rows.length) {
        rows[rows.length - 1].value += `; ${part}`;
      } else {
        rows.push({ label:isZh ? '日期状态' : 'Date status', value:part });
      }
      return;
    }
    const sessionMatch = part.match(/\b(session\s+(?:[A-Z0-9]+|one|two|three)|final presentations?)\b/i);
    const modeMatch = part.match(modePattern);
    const match = [sessionMatch, modeMatch].filter(Boolean).sort((left, right) => left.index - right.index)[0];
    if (!match) {
      rows.push({ label:fallback, value:part });
      return;
    }
    const sessionLabel = sessionMatch ? sessionMatch[1].replace(/\b\w/g, character => character.toUpperCase()) : '';
    const modeLabel = modeMatch ? prettyMode(modeMatch[1]) : '';
    const label = sessionLabel && modeLabel ? `${modeLabel} · ${sessionLabel}` : sessionLabel || modeLabel;
    const before = part.slice(0, match.index).replace(/^\s*(?:summer\s+)?20\d{2}\s*(?:dates?)?\s*:?\s*/i, '').trim();
    const after = part.slice(match.index + match[0].length).replace(/^\s*(?:program|options?|component|dates?)?\s*:?\s*/i, '').trim();
    const rowValue = after || before || part;
    rows.push({ label, value:rowValue });
  });
  const hasModeRow = rows.some(row => row.label !== fallback && !/^Session\b/i.test(row.label) && !/^Final\b/i.test(row.label));
  if (hasModeRow && rows.length > 1 && rows[0].label === fallback && /\b(residential|commuter|on[- ]campus|in[- ]person)\b/i.test(String(format || ''))) {
    rows[0].label = isZh ? '线下／校园' : 'On Campus';
  }
  if (rows.length > 1 && rows.every(row => row.label === fallback)) return [{ label:fallback, value }];
  return rows;
}
function officialLabel(value, lang) {
  const rules = [
    [/hybrid\s*\/\s*online/i, 'Hybrid / Online', '混合／线上'],
    [/on[- ]campus/i, 'On Campus', '校园内'],
    [/in[- ]person/i, 'In Person', '线下'],
    [/residential/i, 'Residential', '住宿'],
    [/commuter/i, 'Commuter', '通勤'],
    [/online/i, 'Online', '线上'],
    [/virtual/i, 'Virtual', '线上'],
    [/hybrid/i, 'Hybrid', '混合'],
    [/early\s*action/i, 'Early Action', '早申'],
    [/regular\s*decision/i, 'Regular Decision', '常规申请'],
    [/early\s*\/\s*priority|priority/i, 'Priority', '优先轮次'],
    [/regular/i, 'Regular', '常规轮次'],
    [/late/i, 'Late', '补充轮次'],
    [/international/i, 'International', '国际学生'],
    [/domestic/i, 'Domestic', '美国学生'],
    [/housing\s*(?:and|&|\/)\s*(?:meals?|dining)|room\s*\/\s*board/i, 'Housing & Meals', '住宿与餐饮'],
    [/application\s*fee/i, 'Application Fee', '申请费'],
    [/registration\s*fee/i, 'Registration Fee', '注册费'],
    [/program\s*fee/i, 'Program Fee', '项目费'],
    [/service\s*fee|\bservice\b/i, 'Service Fee', '服务费'],
    [/activities?\s*fee/i, 'Activities Fee', '活动费'],
    [/document\s*fee/i, 'Document Fee', '文件费'],
    [/course\s*fee/i, 'Course Fee', '课程费'],
    [/\btuition\b/i, 'Tuition', '学费'],
    [/\bhousing\b|room\s*and\s*board/i, 'Housing', '住宿'],
    [/\bmeals?\b|\bdining\b/i, 'Meals', '餐饮']
  ];
  for (const rule of rules) {
    const match = String(value || '').match(rule[0]);
    if (match) return { match, label:lang === 'zh' ? rule[2] : rule[1] };
  }
  return null;
}
function officialValueRows(value, lang) {
  const raw = String(value || '').trim();
  if (!raw || /^(Unknown|未知)$/i.test(raw)) return null;
  const metric = part => /\$\s*[\d,]+|\b\d+(?:[–-]\d+)?\s*(?:weeks?|days?|credits?|courses?)\b/i.test(part);
  const bulletLines = officialBulletLines(raw);
  if (bulletLines.hasBullets) {
    return bulletLines.lines.map(part => {
      const colon = part.match(/^([^:]{2,38}):\s*(.+)$/);
      if (colon) {
        const sourceLabel = colon[1].trim();
        const remainder = colon[2].trim();
        const modePrice = remainder.match(/^(\$\s*[\d,]+(?:\s*(?:–|-|to)\s*\$?\s*[\d,]+)?)(?:\s+(residential|commuter|online))?$/i);
        if (/^summer at hopkins(?:\s+20\d{2})?$/i.test(sourceLabel)) {
          if (modePrice && modePrice[2]) return { label:modePrice[2], value:modePrice[1] };
          return { label:'', value:remainder };
        }
        if (/^(?:tuition|application fee|financial aid)$/i.test(sourceLabel)) return { label:'', value:remainder };
        return { label:sourceLabel, value:remainder };
      }
      const identified = officialLabel(part, lang);
      if (identified && identified.match.index === 0) {
        const remainder = part.slice(identified.match[0].length).replace(/^\s*[:·–-]\s*/, '').trim();
        if (remainder) return { label:identified.label, value:remainder };
      }
      return { label:'', value:part };
    });
  }
  let pieces = raw.split(/\s*;\s*/).map(part => part.replace(/[.]$/, '').trim()).filter(Boolean);
  pieces = pieces.flatMap(part => {
    for (const divider of [/\s+\/\s+/, /\s+or\s+/i]) {
      const halves = part.split(divider).map(value => value.trim()).filter(Boolean);
      if (halves.length === 2 && halves.every(metric) && halves.every(value => officialLabel(value, lang))) return halves;
    }
    return [part];
  });
  const labeled = pieces.map(part => {
    const identified = officialLabel(part, lang);
    if (!identified) return { label:'', value:part };
    const text = part.replace(identified.match[0], '').replace(/^\s*[:·–-]\s*|\s*[:·–-]\s*$/g, '').replace(/\s+/g, ' ').trim();
    return { label:identified.label, value:text || part };
  });
  if (!pieces.some(metric)) return null;
  if (!labeled.some(row => row.label)) return null;
  return labeled.map((row, index) => row.label ? row : { label:lang === 'zh' ? `其他信息 ${index + 1}` : `Additional detail ${index + 1}`, value:row.value });
}
function formatOfficialDeadlineRows(raw, url, isZh) {
  const value = String(raw || '').trim();
  const sourceLines = officialBulletLines(value);
  const pieces = (sourceLines.hasBullets ? sourceLines.lines : value.split(/\s*;\s*/))
    .map(part => part.replace(/[.]$/, '').trim()).filter(Boolean);
  if (pieces.length < 2) return [{ label:isZh ? '申请轮次' : 'Application rounds', value, url }];
  return pieces.map((part, index) => {
    const colon = part.match(/^([^:]{2,38}):\s*(.+)$/);
    if (colon) return { label:colon[1], value:colon[2], url };
    const identified = officialLabel(part, isZh ? 'zh' : 'en');
    if (identified && /action|decision|priority|regular|late|residential|commuter|online|international|domestic/i.test(identified.match[0])) {
      return { label:identified.label, value:part.replace(identified.match[0], '').replace(/^\s*[:·–-]\s*|\s*[:·–-]\s*$/g, '').trim(), url };
    }
    return { label:isZh ? `申请信息 ${index + 1}` : `Application detail ${index + 1}`, value:part, url };
  });
}
function programOverviewFactsHTML(program, lang) {
  const facts = officialProgramFacts(program.id, lang);
  const research = facts && facts.research ? facts.research : { url:program.website || '#', checkedOn:'2026-10-18', verified:false };
  const pending = function (field) {
    return {
      value:lang === 'zh' ? `正在核对${field}的官方来源` : `Official ${field} source under review`,
      url:research.url
    };
  };
  const deadlineRows = facts && facts.deadlines && facts.deadlines.length ? facts.deadlines : [{
    label:lang === 'zh' ? '状态' : 'Status',
    value:lang === 'zh' ? '正在核对各申请轮次' : 'Each application round is being verified',
    url:research.url
  }];
  const duration = facts && facts.duration ? facts.duration : pending(lang === 'zh' ? '项目时长' : 'program-length');
  const tuition = facts && facts.cost ? { value:facts.cost.tuition, url:facts.cost.tuitionUrl, note:facts.cost.note } : pending(lang === 'zh' ? '学费' : 'tuition');
  const financialAid = facts && facts.cost && facts.cost.financialAid
    ? facts.cost.financialAid
    : pending(lang === 'zh' ? '助学金' : 'financial-aid');
  const feeRows = facts && facts.cost && facts.cost.applicationFees && facts.cost.applicationFees.length ? facts.cost.applicationFees : [{
    label:lang === 'zh' ? '申请费' : 'Application fee',
    value:lang === 'zh' ? '正在核对官方申请费' : 'Official application fee under review',
    url:research.url
  }];
  const sessions = facts && facts.sessions && facts.sessions.items && facts.sessions.items.length ? facts.sessions : {
    heading:lang === 'zh' ? '2027 项目日期' : '2027 program dates',
    sourceLabel:lang === 'zh' ? '官方项目页面' : 'Official program page',
    url:research.url,
    items:[{ label:lang === 'zh' ? '状态' : 'Status', value:lang === 'zh' ? '正在核对 2027 年官方日期' : 'Official 2027 dates are being verified' }]
  };
  const tuitionRows = officialValueRows(tuition.value, lang);
  const tuitionMarkup = tuitionRows ? `<ul class="official-value-list">${tuitionRows.map(row => `<li>${row.label && !/^tuition$/i.test(row.label) ? `<span>${esc(officialText(row.label, lang))}</span>` : ''}<strong><a href="${esc(tuition.url)}" target="_blank" rel="noopener">${esc(officialText(row.value, lang))}</a></strong></li>`).join('')}</ul>` : `<h3><a href="${esc(tuition.url)}" target="_blank" rel="noopener">${esc(officialText(tuition.value, lang))}</a></h3>`;
  const durationWords = { one:'1', two:'2', three:'3', four:'4', five:'5', six:'6', seven:'7', eight:'8', nine:'9', ten:'10' };
  const durationLines = officialBulletLines(duration.value);
  const durationUnitPattern = '(days?|weeks?|months?)';
  const durationAmountPattern = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)';
  const durationRange = String(duration.value).match(new RegExp(`^\\s*${durationAmountPattern}\\s*(?:or|to|[-–])\\s*${durationAmountPattern}\\s+${durationUnitPattern}\\s*$`, 'i'));
  const durationParts = String(duration.value).match(new RegExp(`^\\s*${durationAmountPattern}\\s+${durationUnitPattern}\\s*$`, 'i'));
  const durationNumber = value => durationWords[String(value).toLowerCase()] || value;
  const durationAlternatives = String(duration.value).split(/\s*;\s*|\s+or\s+/i).map(part => {
    const match = part.match(new RegExp(`${durationAmountPattern}\\s*(?:-\\s*)?${durationUnitPattern}`, 'i'));
    if (!match) return null;
    const category = part.match(/\b(?:on\s+campus|online|residential|commuter|in[- ]person|virtual|hybrid)\b/i);
    return { amount:durationNumber(match[1]), unit:match[2], category:category ? category[0].replace(/\b\w/g, character => character.toUpperCase()) : '' };
  });
  const useDurationAlternatives = !durationParts && !durationRange && durationAlternatives.length > 1 && durationAlternatives.every(Boolean);
  const durationMarkup = durationLines.hasBullets
    ? `<ul class="official-value-list official-duration-list">${durationLines.lines.map(line => `<li><strong><a href="${esc(duration.url)}" target="_blank" rel="noopener">${esc(officialText(line, lang))}</a></strong></li>`).join('')}</ul>`
    : durationParts
    ? `<h3 class="official-duration-value"><a href="${esc(duration.url)}" target="_blank" rel="noopener"><span class="official-duration-number">${esc(durationNumber(durationParts[1]))}</span><span class="official-duration-unit">${esc(officialText(durationParts[2], lang))}</span></a></h3>`
    : durationRange
    ? `<h3 class="official-duration-value"><a href="${esc(duration.url)}" target="_blank" rel="noopener"><span class="official-duration-number">${esc(durationNumber(durationRange[1]))}–${esc(durationNumber(durationRange[2]))}</span><span class="official-duration-unit">${esc(officialText(durationRange[3], lang))}</span></a></h3>`
    : useDurationAlternatives
    ? `<div class="official-duration-options">${durationAlternatives.map((option, index) => `<a class="official-duration-option" href="${esc(duration.url)}" target="_blank" rel="noopener"><span class="official-duration-number">${esc(option.amount)}</span><span class="official-duration-unit">${esc(officialText(option.unit, lang))}</span><small>${esc(officialText(option.category || (lang === 'zh' ? `选项 ${index + 1}` : `Option ${index + 1}`), lang))}</small></a>`).join('')}</div>`
    : `<h3 class="official-duration-value official-duration-value--text"><a href="${esc(duration.url)}" target="_blank" rel="noopener"><span class="official-duration-copy">${esc(officialText(duration.value, lang))}</span></a></h3>`;
  const feeMarkup = feeRows.map(function (fee) {
    const rows = officialValueRows(fee.value, lang);
    return rows
      ? `<ul class="official-value-list">${rows.map(row => `<li>${row.label && !/^application fee$/i.test(row.label) ? `<span>${esc(officialText(row.label, lang))}</span>` : ''}<strong><a href="${esc(fee.url)}" target="_blank" rel="noopener">${esc(officialText(row.value, lang))}</a></strong></li>`).join('')}</ul>`
      : `<div class="official-application-fees">${feeRows.length > 1 ? `<span>${esc(officialText(fee.label, lang))}</span>` : ''}<a href="${esc(fee.url)}" target="_blank" rel="noopener">${esc(officialText(fee.value, lang))}</a></div>`;
  }).join('');
  const cards = [];
  cards.push(`<article class="academic-snapshot-card"><p>${esc(lang === 'zh' ? '申请截止日期' : 'Application deadlines')}</p><ul class="academic-snapshot-card__links">${deadlineRows.map(function (item) { return `<li><a href="${esc(item.url)}" target="_blank" rel="noopener"><span>${esc(officialText(item.label, lang))}</span><strong>${esc(officialText(item.value, lang))}</strong></a></li>`; }).join('')}</ul></article>`);
  cards.push(`<article class="academic-snapshot-card"><p>${esc(lang === 'zh' ? '项目时长' : 'Program length')}</p>${durationMarkup}</article>`);
  cards.push(`<article class="academic-snapshot-card official-cost-card official-cost-card--combined"><div class="official-cost-sections"><div class="official-cost-section"><span class="official-cost-subheading">${esc(lang === 'zh' ? '学费' : 'Tuition')}</span>${tuitionMarkup}${tuition.note ? `<small class="official-fact-disclaimer">${esc(officialText(tuition.note, lang))}</small>` : ''}</div><div class="official-cost-section"><span class="official-cost-subheading">${esc(lang === 'zh' ? '申请费' : 'Application fee')}</span>${feeMarkup}</div></div></article>`);
  const financialAidRows = officialValueRows(financialAid.value, lang);
  const financialAidMarkup = financialAidRows
    ? `<ul class="official-value-list">${financialAidRows.map(row => `<li>${row.label && !/^financial aid$/i.test(row.label) ? `<span>${esc(officialText(row.label, lang))}</span>` : ''}<strong><a href="${esc(financialAid.url)}" target="_blank" rel="noopener">${esc(officialText(row.value, lang))}</a></strong></li>`).join('')}</ul>`
    : `<h3><a href="${esc(financialAid.url)}" target="_blank" rel="noopener">${esc(officialText(financialAid.value, lang))}</a></h3>`;
  cards.push(`<article class="academic-snapshot-card official-financial-aid-card"><p>${esc(lang === 'zh' ? '助学金' : 'Financial aid')}</p>${financialAidMarkup}</article>`);
  const sessionGroups = new Map();
  sessions.items.forEach(item => {
    const label = String(item.label || '');
    const lower = label.toLowerCase();
    const mode = /online|virtual/.test(lower) ? 'Online'
      : /commuter/.test(lower) ? 'Commuter'
      : /residential/.test(lower) ? 'Residential'
      : /on campus|campus|in person/.test(lower) ? 'On Campus'
      : /hybrid/.test(lower) ? 'Hybrid'
      : '';
    const key = mode || 'Dates';
    if (!sessionGroups.has(key)) sessionGroups.set(key, []);
    sessionGroups.get(key).push(item);
  });
  sessionGroups.forEach((items, mode) => {
    const heading = mode === 'Dates' ? sessions.heading : `${sessions.heading} · ${mode}`;
    const sessionItems = items.map(item => `<li>${item.label && item.label !== mode ? `<span>${esc(officialText(item.label, lang))}</span>` : ''}<strong>${esc(officialText(item.value, lang))}</strong></li>`).join('');
    cards.push(`<article class="academic-snapshot-card official-session-card"><p>${esc(officialText(heading, lang))}</p><ul class="official-session-items">${sessionItems}</ul>${sessions.note ? `<small class="official-fact-disclaimer">${esc(officialText(sessions.note, lang))}</small>` : ''}</article>`);
  });
  cards.push(`<article class="academic-snapshot-card official-review-card"><div class="official-review-card__copy"><p>${esc(lang === 'zh' ? '学生视角' : 'Student perspective')}</p><h3>${esc(lang === 'zh' ? '参加过这个项目？' : 'Attended this program?')}</h3><p class="official-review-card__description">${esc(lang === 'zh' ? '分享真实体验，帮助下一位学生做决定。' : 'Share what it was really like and help the next student decide.')}</p></div><a class="application-portal-button" href="#/survey/${esc(program.id)}">${esc(lang === 'zh' ? '写下评价' : 'Write a review')} →</a></article>`);
  return `<div class="academic-snapshot-grid program-official-facts">${cards.join('')}</div>`;
}
function programAdmissionsHTML(program, lang, admissions) {
  const officialUrl = admissions.portalUrl || program.website || '#';
  return `<div class="academic-snapshot-grid admissions-official-grid">
    <article class="academic-snapshot-card application-portal-card"><div><h3>${esc(lang === 'zh' ? `准备好申请 ${pickL(program.name)}？` : `Ready to apply to ${pickL(program.name)}?`)}</h3></div><a class="application-portal-button application-portal-button--primary" href="${esc(officialUrl)}" target="_blank" rel="noopener">${esc(lang === 'zh' ? '开始或继续申请' : 'Start or continue an application')}</a></article>
  </div>`;
}
function subjectChips(v) {
  const arr = Array.isArray(v) ? v : [v];
  return arr.filter(Boolean).map(x => `<span class="subject-chip">${esc(x)}</span>`).join(' ');
}

/* Official program facts and verified alumni feedback intentionally live in
   separate modules. This lets an applicant distinguish "the program says it
   offers this" from "participants say this is how it felt." */
function academicProfileFor(id) {
  const d = (PROGRAM_DETAILS && PROGRAM_DETAILS[id]) || {};
  return d.academicProfile || null;
}
function academicCopy(lang) {
  return lang === 'zh' ? {
    official: '官方项目结构',
    source: '信息来源',
    overviewTitle: '选择前先了解这个项目的学习方式',
    overviewBody: '先看 YYGS 官方公布的课程结构，再结合经过验证的往届学生反馈做判断。',
    learnTitle: '学术概览',
    fitTitle: '适配度提醒',
    feedback: '学术体验',
    feedbackWaiting: '等待首批 YYGS 学术反馈',
    feedbackWaitingBody: '学生完成第二轮学术问卷后，这里会自动显示平均评分、老师体验、学习量，以及课程内容与项目介绍的符合度，而不会使用编造的数据。',
    feedbackReady: '份已验证学术反馈',
    share: '分享你的学术体验',
    explore: '查看完整学术详情',
    formatTitle: '学术活动地图',
    formatBody: '这里展示课程提供的学术活动多样性。不同具体方向可能有所不同；标记为包含的活动来自学生在问卷中的反馈。',
    feedbackByFormat: '往届学生如何描述这些活动',
    feedbackByFormatBody: '以下比例来自选择该活动的已验证学生；它代表反馈覆盖度，不代表活动质量或在课程中的比重。',
    report: '学生提及',
    responses: '份回应',
    noFormatResponses: '目前还没有经过验证的学生问卷来确认具体包含哪些学术活动。',
    activitiesSource: '学生问卷总结',
    experienceIntro: '根据学术问卷，对老师、师生互动、学习量，以及课程内容与项目介绍的符合度进行快速总结。',
    experienceWaiting: '等待已验证反馈',
    overallRating: '整体学术评分',
    instructorExperience: '老师体验',
    instructorAccess: '师生互动',
    workload: '学习量',
    contentMatch: '课程内容与项目介绍的符合度',
    courseExperience: '课程体验',
    positive: '正向评价',
    viewRelatedReviews: '查看相关学生评价',
    relatedReviewsTitle: '学术相关学生评价',
    relatedReviewsIntro: '这里只展示学生真实提交、并提到课程、老师、学习量、课程内容或其他学术体验的评价。',
    noRelatedReviews: '目前还没有与学术体验相关的学生文字评价。',
    verifiedOfficially: '已由官网核实',
    officialLink: '查看官方课程介绍'
  } : {
    official: 'Official program structure',
    source: 'Source',
    overviewTitle: 'Know how the program teaches before you decide',
    overviewBody: 'Start with YYGS’s published curriculum, then use verified alumni feedback to decide whether that experience fits you.',
    learnTitle: 'Academic Overview',
    fitTitle: 'Fit check',
    feedback: 'Academic Experience',
    feedbackWaiting: 'Waiting for the first YYGS academic reports',
    feedbackWaitingBody: 'Average ratings, instructor experience, workload, and whether course content matched the program description will populate here as YYGS alumni complete Round 2. We do not fill this space with invented statistics.',
    feedbackReady: 'verified academic responses',
    share: 'Share your academic experience',
    explore: 'See full academic breakdown',
    formatTitle: 'Academic Activities Map',
    formatBody: 'This shows the variety of academic activities the courses offer. Each specific track may differ; the ones marked as included are those mentioned by students in their questionnaires.',
    feedbackByFormat: 'How alumni describe these formats',
    feedbackByFormatBody: 'Percentages below come from verified respondents who selected each format. They indicate reporting coverage, not quality or curriculum weight.',
    report: 'reported it',
    responses: 'responses',
    noFormatResponses: 'There are not yet verified student questionnaires confirming which academic activities were included.',
    activitiesSource: 'Student questionnaire summary',
    experienceIntro: 'A concise summary of the academic survey: instructors, access, workload, and how closely the course content matched the program description.',
    experienceWaiting: 'Awaiting verified feedback',
    overallRating: 'Overall academic rating',
    instructorExperience: 'Instructor experience',
    instructorAccess: 'Instructor access',
    workload: 'Workload',
    contentMatch: 'Content matched the description',
    courseExperience: 'Course Experience',
    positive: 'positive responses',
    viewRelatedReviews: 'View related student reviews',
    relatedReviewsTitle: 'Academic Student Reviews',
    relatedReviewsIntro: 'These are real student reviews that mention courses, instructors, workload, course content, or another part of the academic experience.',
    noRelatedReviews: 'There are no student reviews about the academic experience yet.',
    verifiedOfficially: 'Verified on the official site',
    officialLink: 'View official curriculum'
  };
}
function academicActivityLabel(key, lang) {
  const q = qByKey('activities');
  const option = q && q.options && q.options.find(function (item) { return item.value === key; });
  return option ? (lang === 'zh' ? option.zh : option.en) : key;
}
function academicFeedbackCount(id) {
  const agg = window.SSDB.getAggregate(id);
  return (agg.academic_rating && agg.academic_rating.n) || 0;
}
function academicFeedbackStateHTML(id, lang, compact) {
  const copy = academicCopy(lang);
  const n = academicFeedbackCount(id);
  const user = window.SSDB.currentUser();
  if (n) {
    return `<div class="academic-feedback-state academic-feedback-state--ready">
      <span class="academic-feedback-state__eyebrow">${esc(copy.feedback)}</span>
      <strong>${n}</strong><span>${esc(copy.feedbackReady)}</span>
    </div>`;
  }
  return `<div class="academic-feedback-state ${compact ? 'academic-feedback-state--compact' : ''}">
    <span class="academic-feedback-state__eyebrow">${esc(copy.feedback)}</span>
    <h3>${esc(copy.feedbackWaiting)}</h3>
    ${compact ? '' : `<p>${esc(copy.feedbackWaitingBody)}</p>`}
    <a class="academic-feedback-state__link" href="#/survey/${esc(id)}">${esc(copy.share)} →</a>
  </div>`;
}
function academicExperienceSummaryHTML(id, lang, agg) {
  const copy = academicCopy(lang);
  const user = window.SSDB.currentUser();
  const ar = agg.academic_rating;
  const instructorItems = (agg.instructors_likert && agg.instructors_likert.items) || [];
  let instructorAgree = 0;
  let instructorAnswers = 0;
  instructorItems.forEach(function (item) {
    if (!item.n) return;
    instructorAgree += (item.dist[3] || 0) + (item.dist[4] || 0);
    instructorAnswers += item.n;
  });
  const instructorPct = instructorAnswers ? Math.round(instructorAgree / instructorAnswers * 100) : null;

  function optionCard(label, result) {
    const top = topVotedOption(result);
    const hasData = !!(result && result.total && top && top.count);
    return {
      label: label,
      value: hasData ? pct(top.count, result.total) + '%' : '—',
      summary: hasData ? pickL(top) : copy.experienceWaiting,
      responses: hasData ? result.total : 0
    };
  }

  const cards = [
    {
      label: copy.overallRating,
      value: ar && ar.n ? ar.avg.toFixed(1) + ' / 5' : '—',
      summary: ar && ar.n ? ar.n + ' ' + (lang === 'zh' ? '份回应' : 'responses') : copy.experienceWaiting,
      responses: ar && ar.n ? ar.n : 0
    },
    {
      label: copy.instructorExperience,
      value: instructorPct == null ? '—' : instructorPct + '%',
      summary: instructorPct == null ? copy.experienceWaiting : copy.positive,
      responses: instructorItems.reduce(function (max, item) { return Math.max(max, item.n || 0); }, 0)
    },
    optionCard(copy.instructorAccess, agg.interaction),
    optionCard(copy.workload, agg.workload),
    optionCard(copy.contentMatch, agg.academic_content_match)
  ];
  const hasAnyData = cards.some(function (card) { return card.responses > 0; });

  return `<section class="academic-experience scalar-section">
    <div class="academic-experience__head">
      <div><h3 class="scalar-section__title">${esc(copy.feedback)}</h3><p>${esc(copy.experienceIntro)}</p></div>
      ${hasAnyData ? `<span>${academicFeedbackCount(id)} ${esc(copy.feedbackReady)}</span>` : ''}
    </div>
    <div class="academic-experience__grid">
      ${cards.map(function (card) { return `<article class="academic-experience-card${card.responses ? ' has-data' : ''}"><p>${esc(card.label)}</p><strong>${esc(card.value)}</strong><span>${esc(card.summary)}</span></article>`; }).join('')}
    </div>
    ${hasAnyData ? '' : `<div class="academic-experience__empty"><p>${esc(copy.feedbackWaitingBody)}</p><a href="#/survey/${esc(id)}">${esc(copy.share)} →</a></div><a class="academic-related-reviews academic-experience__related-reviews" href="#/program/${esc(id)}/reviews">${esc(copy.viewRelatedReviews)}</a>`}
  </section>`;
}
function programOverviewDecisionHTML(id, lang) {
  const profile = academicProfileFor(id);
  if (!profile) return '';
  const copy = academicCopy(lang);
  const snapshot = profile.snapshot || [];
  const fit = profile.fit || [];
  return `<div class="overview-academic-brief">
    <div class="overview-academic-brief__head">
      <div>
        <p class="overview-academic-brief__eyebrow">${esc(copy.official)}</p>
        <h3>${esc(copy.overviewTitle)}</h3>
        <p>${esc(copy.overviewBody)}</p>
      </div>
      <a class="overview-academic-brief__source" href="${esc(profile.sourceUrl)}" target="_blank" rel="noopener">${esc(copy.officialLink)}</a>
    </div>
    <div class="overview-academic-brief__facts">
      ${snapshot.slice(0, 3).map(function (item) { return `<div><span>${esc(pickL(item.label))}</span><strong>${esc(pickL(item.value))}</strong></div>`; }).join('')}
    </div>
    <div class="overview-academic-brief__bottom">
      <div class="overview-academic-brief__fit">
        <h4>${esc(copy.fitTitle)}</h4>
        ${fit.map(function (item) { return `<p><strong>${esc(pickL(item.title))}</strong>${esc(pickL(item.body))}</p>`; }).join('')}
      </div>
      ${academicFeedbackStateHTML(id, lang, true)}
    </div>
    <a class="overview-academic-brief__cta" href="#/program/${esc(id)}/academics">${esc(copy.explore)} <span>›</span></a>
  </div>`;
}
function academicOfficialProfileHTML(id, lang) {
  const profile = academicProfileFor(id);
  if (!profile) return '';
  const copy = academicCopy(lang);
  const snapshot = profile.snapshot || [];
  const fit = profile.fit || [];
  return `<section class="academic-official-profile">
    <div class="academic-official-profile__head">
      <div>
        <p class="academic-official-profile__eyebrow">${esc(copy.official)}</p>
        <h2>${esc(copy.learnTitle)}</h2>
        <p>${esc(pickL(profile.sourceNote))}</p>
      </div>
      <a class="academic-official-profile__source" href="${esc(profile.sourceUrl)}" target="_blank" rel="noopener">${esc(copy.officialLink)}</a>
    </div>
    <div class="academic-snapshot-grid">
      ${snapshot.map(function (item) {
        const linkedList = item.links && item.links.length
          ? `<ul class="academic-snapshot-card__links">${item.links.map(function (link) { return `<li><a href="${esc(link.url)}" target="_blank" rel="noopener">${link.label ? `<span>${esc(pickL(link.label))}</span>` : ''}<strong>${esc(pickL(link.value))}</strong></a></li>`; }).join('')}</ul>`
          : `<h3>${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(pickL(item.value))}</a>` : esc(pickL(item.value))}</h3>`;
        return `<article class="academic-snapshot-card"><p>${esc(pickL(item.label))}</p>${linkedList}</article>`;
      }).join('')}
    </div>
    <div class="academic-fit-grid">
      ${fit.map(function (item) { return `<article><h3>${esc(pickL(item.title))}</h3><p>${esc(pickL(item.body))}</p></article>`; }).join('')}
    </div>
  </section>`;
}
function academicFormatMapHTML(id, lang, actRes) {
  const profile = academicProfileFor(id);
  if (!profile || !profile.formats) return '';
  const copy = academicCopy(lang);
  const responseTotal = actRes ? actRes.total : 0;
  const groups = [];
  profile.formats.forEach(function (item) {
    const groupName = pickL(item.group);
    let group = groups.find(function (candidate) { return candidate.name === groupName; });
    if (!group) { group = { name: groupName, items: [] }; groups.push(group); }
    group.items.push(item);
  });
  return `<section class="academic-format-map scalar-section">
    <div class="academic-format-map__head">
      <div>
        <p class="academic-official-profile__eyebrow">${esc(copy.activitiesSource)}</p>
        <h3 class="scalar-section__title">${esc(copy.formatTitle)}</h3>
        <p>${esc(copy.formatBody)}</p>
      </div>
    </div>
    <div class="academic-format-map__groups">
      ${groups.map(function (group) { return `<section class="academic-format-group"><h4>${esc(group.name)}</h4><ul>${group.items.map(function (item) {
        const response = actRes && actRes.options ? actRes.options.find(function (option) { return option.value === item.key; }) : null;
        const count = response ? response.count || 0 : 0;
        const reported = responseTotal ? Math.round((count / responseTotal) * 100) : null;
        const included = count > 0;
        return `<li class="academic-format-item ${included ? 'is-included' : 'is-unconfirmed'}">
          <div class="academic-format-item__main"><span class="academic-format-item__marker">${included ? '✓' : '·'}</span><div><strong>${esc(academicActivityLabel(item.key, lang))}</strong><p>${esc(pickL(item.detail))}</p></div></div>
          ${reported === null ? '' : `<span class="academic-format-item__reported">${reported}% ${esc(copy.report)}</span>`}
        </li>`;
      }).join('')}</ul></section>`; }).join('')}
    </div>
    <div class="academic-format-map__feedback">
      <h4>${esc(copy.feedbackByFormat)}</h4>
      <p>${esc(responseTotal ? copy.feedbackByFormatBody : copy.noFormatResponses)}${responseTotal ? ' ' + responseTotal + ' ' + esc(copy.responses) + '.' : ''}</p>
      <a class="academic-related-reviews" href="#/program/${esc(id)}/reviews">${esc(copy.viewRelatedReviews)}</a>
    </div>
  </section>`;
}
function qByKey(key) {
  for (const round of QUESTIONNAIRE) {
    for (const q of round.questions) if (q.key === key) return q;
  }
  return null;
}
/* Bar chart of how many users picked each option (pills-single / pills-multi).
   Each row = label + bar + percentage (one line, Niche-style). */
function barsHTML(res, lang) {
  if (!res) return '';
  const total = (res.options || []).reduce((s, o) => s + (o.count || 0), 0) || 1;
  return `<div class="bars">` + res.options.map(o => {
    const c = o.count || 0;
    const pct = Math.round(c / total * 100);
    return `<div class="bar" style="--choice-width:${pct}%">
        <span class="bar__fill" aria-hidden="true"></span>
        <div class="bar__label">${esc(pickL(o))}</div>
        <div class="bar__pct">${pct}%</div>
      </div>`;
  }).join('') + `</div>`;
}
/* Visually obvious instructor-agreement display: one row per statement,
   a green bar showing % who Agree or Strongly agree, plus the avg /5. */
function likertHTML(res, lang) {
  if (!res) return '';
  return `<div class="likert-bars">` + res.items.map(it => {
    const n = it.n || 1;
    const agree = it.dist[3] + it.dist[4];
    const pct = Math.round(agree / n * 100);
    const avg = (it.sum / n).toFixed(1);
    return `<div class="likert-row">
        <div class="likert-row__top">
          <span class="likert-row__stmt">${esc(pickL(it.label))}</span>
          <span class="likert-row__pct">${pct}% · ${avg}/5</span>
        </div>
        <div class="likert-row__track"><div class="likert-row__fill" style="width:${pct}%"></div></div>
      </div>`;
  }).join('') + `</div>`;
}
/* Word cloud: font size scales with vote count (legacy — kept for the
   activities r2 question and other long-list pills-multi displays). */
function wordCloudHTML(res, lang) {
  if (!res) return '';
  const counts = res.options.map(o => o.count);
  const min = Math.min.apply(null, counts), max = Math.max.apply(null, counts);
  return `<div class="wordcloud">` + res.options.map(o => {
    const c = o.count;
    const intensity = max === min ? 0.6 : (c - min) / (max - min);
    const fs = Math.round(15 + intensity * 21); // 15–36px
    const color = `rgba(13,90,60,${0.45 + 0.55 * intensity})`;
    return `<span style="font-size:${fs}px;color:${color};font-weight:${intensity > 0.6 ? 700 : 600}">${esc(pickL(o))}<sub style="font-size:11px;color:var(--muted);font-weight:400"> ${c}</sub></span>`;
  }).join('') + `</div>`;
}

/* Word bubble: centred, rounded card with each option sized by popularity.
   Used for short multi-option pills-multi questions (dorm_atmosphere,
   free_time, area_words) where the previous wordcloud looked loose. */
function wordBubbleHTML(res, lang) {
  if (!res) return '';
  const list = res.words ? res.words : res.options;
  if (!list || !list.length) return '';
  const counts = list.map(o => o.count || 0);
  const max = Math.max.apply(null, counts);
  const min = Math.min.apply(null, counts);
  return `<div class="word-bubble">` + list.map(o => {
    const c = o.count || 0;
    const intensity = max === min ? 0.6 : (c - min) / (max - min);
    const fs = Math.round(15 + intensity * 8); // 15–23px — enough contrast, not shouty
    const isTop = intensity > 0.55;
    return `<span class="word-bubble__item ${isTop ? 'is-top' : ''}" style="font-size:${fs}px"><strong>${esc(pickL(o))}</strong><sub>${c}</sub></span>`;
  }).join('') + `</div>`;
}

/* ============================ GENERIC RESULT RENDERERS ============= *
 * Shared by every module (Academics, Student life, Campus life, Outcomes)
 * so each big category displays its aggregated survey results the same way. */
function respCount(res) { return (res && res.n != null) ? res.n : (res ? res.total : 0); }

/* Word / tag cloud: handles both word-pick (`res.words`) and pills-multi
   (`res.options`). Font size scales with vote count. */
function cloudHTML(res, lang) {
  if (!res) return '';
  const list = res.words ? res.words : res.options;
  if (!list || !list.length) return '';
  const counts = list.map(o => o.count);
  const min = Math.min.apply(null, counts), max = Math.max.apply(null, counts);
  return `<div class="wordcloud">` + list.map(o => {
    const c = o.count;
    const intensity = max === min ? 0.6 : (c - min) / (max - min);
    const fs = Math.round(15 + intensity * 21); // 15–36px
    const color = `rgba(13,90,60,${0.45 + 0.55 * intensity})`;
    return `<span style="font-size:${fs}px;color:${color};font-weight:${intensity > 0.6 ? 700 : 600}">${esc(pickL(o))}<sub style="font-size:11px;color:var(--muted);font-weight:400"> ${c}</sub></span>`;
  }).join('') + `</div>`;
}

/* Star-rating question: big average + a 5-bar distribution (1★…5★).
   The big average uses a fractional star fill (3.8 = 3 full + 80% of 4th). */
function starsChart(res, lang) {
  if (!res || res.type !== 'stars') return '';
  const avg = res.avg;
  const pct = Math.max(0, Math.min(100, (avg / 5) * 100));
  const max = Math.max.apply(null, res.dist) || 1;
  const bars = res.dist.map((c, i) => {
    const ppct = Math.round(c / max * 100);
    return `<div class="sbar"><span class="sbar__star">${(i + 1)}★</span><span class="sbar__track"><i style="width:${ppct}%"></i></span><span class="sbar__count">${c}</span></div>`;
  }).join('');
  return `<div class="stars-chart">
      <div class="stars-chart__avg">${avg.toFixed(1)} <span class="stars-precise" style="--pct:${pct}%;font-size:20px" aria-label="${avg.toFixed(1)} of 5"></span></div>
      ${bars}
    </div>`;
}

/* Category-grid question: each facet scored 1–5, shown as a labelled bar. */
function catBarsHTML(res, lang) {
  if (!res || res.type !== 'category-grid') return '';
  return `<div class="cat-bars">` + res.items.map(it => {
    const avg = it.sum / it.n;
    const pct = Math.round(avg / 5 * 100);
    return `<div class="cat-row"><span class="cat-row__label">${esc(pickL(it.label))}</span><span class="cat-row__track"><i style="width:${pct}%"></i></span><span class="cat-row__score">${avg.toFixed(1)}</span></div>`;
  }).join('') + `</div>`;
}

/* One survey question rendered as an aggregated block.
   The heading is a 2-3-word summary (not the full prompt) and the
   chart is rendered directly underneath — no separate caption. */
function blockHTML(agg, key, lang, mode) {
  const res = agg[key];
  if (!res) return '';
  const q = qByKey(key);
  if (!q || q.type === 'open') return '';
  const summary = summaryLabel(key, lang);
  let body = '';
  if (mode === 'stars')       body = starsChart(res, lang);
  else if (mode === 'cloud')  body = wordBubbleHTML(res, lang);
  else if (mode === 'cat')    body = catBarsHTML(res, lang);
  else if (mode === 'likert') body = likertHTML(res, lang);
  else                        body = barsHTML(res, lang);
  return `<div class="survey-block"><h4 class="survey-block__q">${esc(summary)}</h4>${body}</div>`;
}

/* Module header: big score (out of 5, accurate to 1 decimal) + a small meta line.
   The section's own <h2> above already labels the module, so no duplicate
   subtitle is rendered here — we only show the score and the response meta. */
function modHeadHTML(score, n, meta, lang) {
  const hasData = n > 0 && score > 0;
  const pct = Math.max(0, Math.min(100, (score / 5) * 100));
  const stars = hasData
    ? `<span class="stars-precise" style="--pct:${pct}%;font-size:22px" aria-label="${score.toFixed(1)} out of 5"></span>`
    : '';
  return `<div class="mod-head">
      <div class="mod-score">${hasData ? score.toFixed(1) : '—'}${stars}</div>
      <div class="mod-score__meta">${hasData ? n + ' ' + esc(meta) : esc(lang === 'zh' ? '等待真实学生反馈' : 'Awaiting verified student feedback')}</div>
    </div>`;
}

/* ---- Student Life module -------------------------------------------
   Mirrors the revised Community & Student Life questionnaire. Housing,
   campus, local area, and outcomes deliberately live in other modules. */
function studentLifeCopy(lang, id) {
  return lang === 'zh' ? {
    intro: '课堂之外的真实体验：同伴文化、归属感、课余活动与日常节奏。',
    overview: '学生生活概览', overall: '整体学生生活', belonging: '社区归属感',
    socializing: '觉得社交不难', positive: '正向评价',
    cultureTitle: '同伴文化', cultureQuestion: '学生如何描述这里的同伴文化？',
    cultureNote: '数字代表选择每个词的学生人数。每位学生最多可选择三个词。',
    socialTitle: '归属感', socialBody: '学生对社区归属感的反馈。',
    activitiesTitle: '课余活动', activitiesBody: '这些是学生实际反馈项目在课余时间提供的活动；不同年份、批次和参与形式可能不同。',
    belongingDetail: '归属感', socializingDifficulty: '社交和交朋友的难度',
    awaiting: '等待真实学生反馈', responses: '份已验证回答', reported: '的学生提及',
    selections: '次选择', noActivities: '目前还没有经过验证的课余活动反馈。',
    glance: '学生生活概览', decisionEyebrow: '学生决策地图', decisionTitle: '我能想象自己在这里学习吗？',
    socialEase: '觉得交朋友比较容易', activitiesQuestion: '项目在课余时间提供了什么？',
    belongingQuestion: '学生的归属感有多强？', multipleChoice: '学生可多选，因此比例不会合计为 100%。',
    rhythmTitle: '日常节奏', rhythmQuestion: '一个普通工作日和夜晚是什么样的？',
    eveningQuestion: '以下哪一项最符合项目中的典型晚间安排？',
    weekdayQuestion: '除必修课程和项目活动外，典型工作日有多少自由时间？',
    typicalEvening: '典型晚间安排', weekdayFreeTime: '工作日自由时间',
    cohortPreview: '同伴文化印象', weekdayPreview: '典型日常', topResponse: '最常见回答',
    context: '数据会按参加年份、课程方向和 Residential / Commuter / Online / Hybrid 形式区分，避免混合不同体验。'
  } : {
    intro: 'What life felt like outside class: cohort culture, belonging, activities, and the daily rhythm.',
    overview: 'Student Life Overview', overall: 'Overall student life', belonging: 'Sense of belonging',
    socializing: 'Found socializing manageable', positive: 'positive responses',
    cultureTitle: 'Cohort Culture', cultureQuestion: 'How did students describe the cohort culture?',
    cultureNote: 'The numbers show how many students chose each word. Each student could choose up to three words.',
    socialTitle: 'Belonging', socialBody: 'How included students felt in the student community.',
    activitiesTitle: 'Free-time Activities', activitiesBody: 'Activities students reported the program offered outside class. Offerings may differ by year, session, track, and participation format.',
    belongingDetail: 'Sense of belonging', socializingDifficulty: 'Difficulty of socializing',
    awaiting: 'Awaiting verified feedback', responses: 'verified responses', reported: 'of students mentioned this',
    selections: 'selections', noActivities: 'There are not yet verified responses confirming free-time activities.',
    glance: 'Student Life at a glance', decisionEyebrow: 'A STUDENT DECISION MAP', decisionTitle: 'Can I picture myself studying here?',
    socialEase: 'Found it easy to socialize', activitiesQuestion: 'What did the program offer in students’ free time?',
    belongingQuestion: 'How strong was students’ sense of belonging?', multipleChoice: 'Students could select more than one activity, so percentages do not add to 100%.',
    rhythmTitle: 'Daily Rhythm', rhythmQuestion: 'What did an ordinary weekday and evening feel like?',
    eveningQuestion: 'Which best describes a typical evening at this program?',
    weekdayQuestion: 'Outside required classes and program activities, how much free time did students have on a typical weekday?',
    typicalEvening: 'Typical evening', weekdayFreeTime: 'Weekday free time',
    cohortPreview: 'Cohort culture', weekdayPreview: 'A typical day', topResponse: 'Most common response',
    context: 'Results will be separated by year, track, and Residential / Commuter / Online / Hybrid format so unlike experiences are not blended together.'
  };
}
function optionShare(res, acceptedValues) {
  if (!res || !res.options || !res.total) return { pct:null, n:0 };
  const accepted = res.options.reduce(function (sum, option) {
    return sum + (acceptedValues.indexOf(option.value) !== -1 ? (option.count || 0) : 0);
  }, 0);
  return { pct:Math.round(accepted / res.total * 100), n:res.total };
}
function lowStarShare(res, inclusiveMaximum) {
  if (!res || res.type !== 'stars' || !res.n) return { pct:null, n:0 };
  const accepted = res.dist.slice(0, inclusiveMaximum).reduce(function (sum, count) { return sum + (count || 0); }, 0);
  return { pct:Math.round(accepted / res.n * 100), n:res.n };
}
function isDiscoveryProgram(id) {
  const program = programById(id);
  return !!(program && ['official-source-listed', 'spreadsheet-provisional', 'paused'].includes(program.catalogStatus));
}
function studentLifeData(id) {
  const agg = window.SSDB.getAggregate(id);
  return {
    agg: agg,
    rating: agg.life_rating,
    belonging: agg.belonging,
    belongingIncluded: optionShare(agg.belonging, ['fully_included', 'mostly_included']),
    socializingDifficulty: agg.socializing_difficulty,
    socializingEase: lowStarShare(agg.socializing_difficulty, 2),
    activities: agg.free_time,
    culture: agg.cohort_culture,
    typicalEvening: agg.typical_evening,
    weekdayFreeTime: agg.weekday_free_time
  };
}
function studentLifeIntroHTML(id, lang, d) {
  const program = programById(id) || {};
  const officialInfo = program.officialInfo || {};
  const catalogSourceUrl = officialInfo.sourceUrl && officialInfo.sourceUrl !== 'Unknown' ? officialInfo.sourceUrl : officialInfo.programUrl && officialInfo.programUrl !== 'Unknown' ? officialInfo.programUrl : null;
  const programSourceUrl = program.website && program.website !== 'Unknown' ? program.website : null;
  const exactProgramUrl = program.source && program.source.verified && program.source.officialUrl && program.source.officialUrl !== 'Unknown'
    ? program.source.officialUrl
    : (programSourceUrl || '#');
  const sourcedValue = (value, source) => {
    const text = String(pickL(value) || '').trim();
    const sourceUrl = source && source.url && source.url !== 'Unknown' && source.url !== '#' ? source.url : '';
    const parsed = officialBulletLines(text);
    if (parsed.hasBullets && parsed.lines.length) {
      return `<ul class="student-life-official-list">${parsed.lines.map(line => `<li>${sourceUrl ? `<a class="student-life-fact-source" href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(line)}</a>` : esc(line)}</li>`).join('')}</ul>`;
    }
    return sourceUrl
      ? `<a class="student-life-fact-source" href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(text.replace(/\s*[↗↘↖↙]+\s*$/g, ''))}</a>`
      : esc(text.replace(/\s*[↗↘↖↙]+\s*$/g, ''));
  };
  const pendingValue = function (label) {
    return `<a class="student-life-fact-source" href="${esc(exactProgramUrl)}" target="_blank" rel="noopener noreferrer">${esc(lang === 'zh' ? `正在核对官方${label}` : `Official ${label} under review`)}</a>`;
  };
  const catalogEligibility = officialInfo.eligibility && officialInfo.eligibility !== 'Unknown'
    ? { value:{ en:officialInfo.eligibility, zh:window.SSStructuredOfficial && window.SSStructuredOfficial.value(program, 'eligibility', 'zh') || officialText(officialInfo.eligibility, 'zh') }, source:{ url:catalogSourceUrl } }
    : null;
  const catalogParticipation = officialInfo.participationFormat && officialInfo.participationFormat !== 'Unknown'
    ? { value:{ en:officialInfo.participationFormat, zh:window.SSStructuredOfficial && window.SSStructuredOfficial.value(program, 'participationFormat', 'zh') || officialText(officialInfo.participationFormat, 'zh') }, source:{ url:catalogSourceUrl } }
    : null;
  const participation = catalogParticipation || (id === 'yygs'
    ? { value:{ en:'Residential', zh:'住宿式' }, source:{ url:'https://globalscholars.yale.edu/how-apply/session-offerings' } }
    : id === 'rise'
      ? { value:{ en:'Residential or commuter', zh:'住宿式或通勤式' }, source:{ url:'https://www.bu.edu/summer/high-school-programs/rise-internship-practicum/' } }
      : id === 'harvard-ssp'
        ? { value:{ en:'Residential, commuter, or online (availability varies by 4- or 7-week option)', zh:'住宿、通勤或线上（具体取决于 4 周或 7 周选项）' }, source:{ url:'https://summer.harvard.edu/high-school-programs/secondary-school-program/' } }
        : id === 'ucsb-pre'
          ? { value:{ en:'Residential or commuter', zh:'住宿式或通勤式' }, source:{ url:'https://summer.ucsb.edu/programs/summer-research-academies/student-life' } }
      : null);
  const facts = [
    catalogEligibility
      ? infoItem(esc(lang === 'zh' ? '申请资格' : 'Eligibility'), sourcedValue(catalogEligibility.value, catalogEligibility.source))
      : officialInfo.eligibility === 'Unknown'
      ? infoItem(esc(lang === 'zh' ? '申请资格' : 'Eligibility'), sourcedValue({ en:'Unknown', zh:'未知' }, { url:catalogSourceUrl }))
      : d.ageRange
      ? infoItem(esc(d.ageRangeLabel ? pickL(d.ageRangeLabel) : (lang === 'zh' ? '申请资格' : 'Eligibility')), sourcedValue(d.ageRange, d.ageRangeSource))
      : infoItem(esc(lang === 'zh' ? '申请资格' : 'Eligibility'), pendingValue(lang === 'zh' ? '申请资格' : 'eligibility')),
    infoItem(esc(lang === 'zh' ? '参与形式' : 'Participation format'), participation ? sourcedValue(participation.value, participation.source) : officialInfo.participationFormat === 'Unknown' ? sourcedValue({ en:'Unknown', zh:'未知' }, { url:catalogSourceUrl }) : pendingValue(lang === 'zh' ? '参与形式' : 'participation format')),
    d.diversity ? infoItem(esc(t('profileDiversity', lang)), sourcedValue(d.diversity, d.diversitySource)) : ''
  ].filter(Boolean);
  const layoutClass = facts.length === 0 ? ' student-life-intro--report-only' : facts.length === 1 ? ' student-life-intro--single-fact' : '';
  return `<div class="student-life-intro${layoutClass}">
    ${facts.length ? `<div class="student-life-intro__facts">${facts.join('')}</div>` : ''}
    ${studentLifeOverviewGlanceHTML(id, lang)}
  </div>`;
}
function studentLifeMetricCard(label, value, n, copy, rating) {
  return `<article class="student-life-metric${n ? ' has-data' : ''}"><p>${esc(label)}</p><strong>${esc(value)}</strong>${rating && n ? '<small>/ 5</small>' : ''}<span>${esc(n ? n + ' ' + copy.responses : copy.awaiting)}</span></article>`;
}
function studentLifeOverviewGlanceHTML(id, lang) {
  const copy = studentLifeCopy(lang, id);
  const data = studentLifeData(id);
  const ratingN = data.rating && data.rating.avg > 0 ? data.rating.n : 0;
  const glanceMetric = function (label, value, n, rating) {
    return `<article><p>${esc(label)}</p><div><strong>${esc(value)}</strong>${rating && n ? '<small>/ 5</small>' : ''}</div><span>${esc(n ? n + ' ' + copy.responses : copy.awaiting)}</span></article>`;
  };
  return `<aside class="student-life-overview-glance">
    <h3>${esc(copy.glance)}</h3>
    <div class="student-life-overview-glance__metrics">
      ${glanceMetric(copy.overall, ratingN ? data.rating.avg.toFixed(1) : '—', ratingN, true)}
      ${glanceMetric(copy.belonging, data.belongingIncluded.n ? data.belongingIncluded.pct + '%' : '—', data.belongingIncluded.n, false)}
    </div>
  </aside>`;
}
function studentLifeOverviewCardsHTML(id, lang) {
  const copy = studentLifeCopy(lang, id);
  const data = studentLifeData(id);
  const cultureItems = ((data.culture && data.culture.words) || []).slice().sort(function (a, b) { return (b.count || 0) - (a.count || 0); }).slice(0, 3);
  const topChoice = function (res) {
    if (!res || !res.total || !res.options) return null;
    const option = res.options.slice().sort(function (a, b) { return (b.count || 0) - (a.count || 0); })[0];
    return option ? { label:lang === 'zh' ? option.zh : option.en, pct:Math.round(option.count / res.total * 100) } : null;
  };
  const evening = topChoice(data.typicalEvening);
  const weekday = topChoice(data.weekdayFreeTime);
  return `<div class="student-life-overview-insights">
    <article class="student-life-preview-card student-life-preview-card--culture">
      <p class="student-life-preview-card__eyebrow">${esc(copy.cohortPreview)}</p>
      ${cultureItems.length && data.culture.total ? `<div class="student-life-culture-chips">${cultureItems.map(function (item) {
        return `<span><strong>${esc(lang === 'zh' ? item.zh : item.en)}</strong><small>${esc(item.count + ' ' + copy.selections)}</small></span>`;
      }).join('')}</div>` : `<div class="student-life-preview-empty">${esc(copy.awaiting)}</div>`}
    </article>
    <article class="student-life-preview-card student-life-preview-card--rhythm">
      <p class="student-life-preview-card__eyebrow">${esc(copy.weekdayPreview)}</p>
      <div class="student-life-rhythm-preview">
        <div><span>${esc(copy.typicalEvening)}</span><strong>${esc(evening ? evening.label : copy.awaiting)}</strong>${evening ? `<b>${evening.pct}%</b>` : ''}</div>
        <div><span>${esc(copy.weekdayFreeTime)}</span><strong>${esc(weekday ? weekday.label : copy.awaiting)}</strong>${weekday ? `<b>${weekday.pct}%</b>` : ''}</div>
      </div>
    </article>
  </div>`;
}
function studentLifeDistributionHTML(res, lang, emptyText) {
  if (!res || !(res.total || res.n)) return `<div class="student-life-empty">${esc(emptyText)}</div>`;
  if (res.type === 'stars') return starsChart(res, lang);
  return barsHTML(res, lang);
}
function studentLifeBelongingHTML(res, lang) {
  const q = qByKey('belonging');
  const options = (q && q.options) || [];
  const available = (res && res.options) || [];
  const total = res ? (res.total || 0) : 0;
  return `<div class="student-life-option-map student-life-option-map--single">${options.map(function (option) {
    const match = available.find(function (item) { return item.value === option.value; });
    const count = match ? match.count || 0 : 0;
    const share = total ? Math.round(count / total * 100) : 0;
    return `<div class="student-life-option-row"><div><strong>${esc(lang === 'zh' ? option.zh : option.en)}</strong><span>${total ? count + ' / ' + total : (lang === 'zh' ? '等待已验证回答' : 'Awaiting verified responses')}</span></div><div class="student-life-option-track"><i style="width:${share}%"></i></div><b>${total ? share + '%' : '—'}</b></div>`;
  }).join('')}</div>`;
}
function studentLifeOptionMapHTML(res, options, lang, emptyText, singleColumn) {
  const total = res ? (res.total || res.n || 0) : 0;
  if (!total) return `<div class="student-life-empty">${esc(emptyText)}</div>`;
  const available = (res.options || res.words || []);
  return `<div class="student-life-option-map${singleColumn ? ' student-life-option-map--single' : ''}">${options.map(function (option) {
    const match = available.find(function (item) { return item.value === option.value || pickL(item) === option.en; });
    const count = match ? match.count || 0 : 0;
    const share = Math.round(count / total * 100);
    return `<div class="student-life-option-row"><div><strong>${esc(lang === 'zh' ? option.zh : option.en)}</strong><span>${count} / ${total}</span></div><div class="student-life-option-track"><i style="width:${share}%"></i></div><b>${share}%</b></div>`;
  }).join('')}</div>`;
}
function studentLifeCountMapHTML(res, words, lang, emptyText, copy) {
  const total = res ? (res.total || 0) : 0;
  if (!total) return `<div class="student-life-empty">${esc(emptyText)}</div>`;
  const available = res.words || [];
  const maximum = available.reduce(function (max, item) { return Math.max(max, item.count || 0); }, 0) || 1;
  return `<div class="student-life-option-map student-life-option-map--counts">${words.map(function (word) {
    const match = available.find(function (item) { return item.en === word.en; });
    const count = match ? match.count || 0 : 0;
    const relativeWidth = Math.round(count / maximum * 100);
    return `<div class="student-life-option-row"><div><strong>${esc(lang === 'zh' ? word.zh : word.en)}</strong><span>${esc(total + ' ' + copy.responses)}</span></div><div class="student-life-option-track"><i style="width:${relativeWidth}%"></i></div><b>${esc(count + ' ' + copy.selections)}</b></div>`;
  }).join('')}</div>`;
}
function studentLifeSortedEntries(res, definitions, lang, words) {
  const available = (res && (words ? res.words : res.options)) || [];
  return (definitions || []).map(function (definition) {
    const match = available.find(function (item) {
      return words ? item.en === definition.en : item.value === definition.value;
    });
    return {
      label: lang === 'zh' ? definition.zh : definition.en,
      count: match ? match.count || 0 : 0
    };
  }).sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); });
}
function studentLifeFilledActivitiesHTML(res, definitions, lang, emptyText) {
  const total = res ? (res.total || 0) : 0;
  if (!total) return `<div class="student-life-empty">${esc(emptyText)}</div>`;
  const entries = studentLifeSortedEntries(res, definitions, lang, false);
  const row = function (entry) {
    const percent = Math.round(entry.count / total * 100);
    return `<li style="--student-fill:${percent}%"><span class="student-life-filled-bar" aria-hidden="true"></span><strong>${esc(entry.label)}</strong><b>${esc(percent + '%')}</b></li>`;
  };
  const visible = entries.slice(0, 4).map(row).join('');
  const remaining = entries.slice(4).map(function (entry, index) { return row(entry, index + 4); }).join('');
  return `<ol class="student-life-filled-list">${visible}</ol>${remaining ? `<details class="student-life-show-more"><summary><span>${esc(lang === 'zh' ? '显示更多' : 'Show more')}</span><span>${esc(lang === 'zh' ? '收起' : 'Show less')}</span><i aria-hidden="true">⌄</i></summary><ol class="student-life-filled-list student-life-filled-list--more">${remaining}</ol></details>` : ''}`;
}
function studentLifeHighlightsHTML(res, definitions, lang, emptyText, copy) {
  const total = res ? (res.total || 0) : 0;
  if (!total) return `<div class="student-life-empty">${esc(emptyText)}</div>`;
  const entries = studentLifeSortedEntries(res, definitions, lang, true);
  return `<div class="student-life-highlight-grid">${entries.slice(0, 3).map(function (entry, index) {
    return `<article><span>#${index + 1}</span><strong>${esc(entry.count)}</strong><h3>${esc(entry.label)}</h3><small>${esc(copy.selections)}</small></article>`;
  }).join('')}</div><ol class="student-life-compact-ranking">${entries.slice(3, 5).map(function (entry, index) {
    return `<li><span>${index + 4}</span><strong>${esc(entry.label)}</strong><b>${esc(entry.count)}</b></li>`;
  }).join('')}</ol>${entries.length > 5 ? `<details class="student-life-show-more student-life-show-more--compact"><summary><span>${esc(lang === 'zh' ? '显示更多' : 'Show more')}</span><span>${esc(lang === 'zh' ? '收起' : 'Show less')}</span><i aria-hidden="true">⌄</i></summary><ol class="student-life-compact-ranking student-life-compact-ranking--more">${entries.slice(5).map(function (entry, index) {
    return `<li><span>${index + 6}</span><strong>${esc(entry.label)}</strong><b>${esc(entry.count)}</b></li>`;
  }).join('')}</ol></details>` : ''}`;
}
function studentLifeDonutHTML(res, definitions, lang, emptyText, copy, words, countsOnly) {
  const totalRespondents = res ? (res.total || 0) : 0;
  if (!totalRespondents) return `<div class="student-life-empty">${esc(emptyText)}</div>`;
  const entries = studentLifeSortedEntries(res, definitions, lang, words);
  const total = entries.reduce(function (sum, entry) { return sum + entry.count; }, 0) || 1;
  const colors = [
    'var(--student-tone)',
    'color-mix(in srgb,var(--student-tone) 82%,white)',
    'color-mix(in srgb,var(--student-tone) 66%,white)',
    'color-mix(in srgb,var(--student-tone) 50%,white)',
    'color-mix(in srgb,var(--student-tone) 36%,white)',
    'color-mix(in srgb,var(--student-tone) 24%,white)'
  ];
  const chartEntries = entries.slice(0, 5);
  const otherCount = entries.slice(5).reduce(function (sum, entry) { return sum + entry.count; }, 0);
  if (otherCount) chartEntries.push({ label:lang === 'zh' ? '其他' : 'Other', count:otherCount });
  let cursor = 0;
  const stops = chartEntries.map(function (entry, index) {
    const start = cursor;
    cursor += entry.count / total * 100;
    return colors[index % colors.length] + ' ' + start.toFixed(2) + '% ' + cursor.toFixed(2) + '%';
  }).join(',');
  return `<div class="student-life-donut-layout">
    <div class="student-life-donut" style="background:conic-gradient(${stops})"><div><strong>${esc(total)}</strong><span>${esc(countsOnly ? copy.selections : (lang === 'zh' ? '份回答' : 'responses'))}</span></div></div>
    <ol class="student-life-donut-legend">${entries.map(function (entry, index) {
      const value = countsOnly ? entry.count : Math.round(entry.count / totalRespondents * 100) + '%';
      return `<li><i style="background:${colors[index < 5 ? index : 5]}"></i><span>${esc(entry.label)}</span><b>${esc(value)}</b></li>`;
    }).join('')}</ol>
  </div>`;
}
function studentLifeChoiceSpotlightHTML(res, definitions, lang, emptyText) {
  const total = res ? (res.total || 0) : 0;
  if (!total) return `<div class="student-life-empty">${esc(emptyText)}</div>`;
  const entries = studentLifeSortedEntries(res, definitions, lang, false);
  const top = entries[0];
  return `<div class="student-life-choice-spotlight"><article><p>${esc(lang === 'zh' ? '最常见回答' : 'MOST COMMON RESPONSE')}</p><strong>${esc(Math.round(top.count / total * 100) + '%')}</strong><h4>${esc(top.label)}</h4></article><ol>${entries.slice(1).map(function (entry) {
    return `<li><span>${esc(entry.label)}</span><b>${esc(Math.round(entry.count / total * 100) + '%')}</b></li>`;
  }).join('')}</ol></div>`;
}
function studentLifeReviewsHTML(id, lang) {
  const stored = window.SSDB.getReviews(id);
  let reviews = stored.filter(review => /life|friend|social|community|cohort|classmate|peer|belong|roommate|event|club|hang|free.time|evening|同学|社群|社交|学生生活|课余|朋友/i.test(review.text || ''));
  const cards = reviews.slice(0, 3).map(function (review) {
    const author = review.author || (lang === 'zh' ? '匿名' : 'Anonymous');
    const stars = Math.max(0, Math.min(5, Number(review.stars) || 0));
    return `<article class="review-card"><div class="avatar">${esc(author.slice(0, 2).toUpperCase())}</div><div><div class="row row--between"><div><strong>${esc(author)}</strong> <span class="muted">· ${esc(review.who || '')}</span></div><div class="mini-stars">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</div></div><p>${esc(review.text || '')}</p></div></article>`;
  }).join('');
  return `<section class="experience-reviews experience-reviews--students"><header class="experience-reviews__head"><p>${esc(lang === 'zh' ? '学生亲述' : 'IN THEIR OWN WORDS')}</p><h2>${esc(lang === 'zh' ? '学生生活评价' : 'Student Life Reviews')}</h2></header><div class="experience-reviews__grid">${cards || `<div class="experience-reviews__empty"><p>${esc(lang === 'zh' ? '暂时还没有学生生活评价。' : 'No student life reviews yet.')}</p><a href="#/survey/${esc(id)}">${esc(lang === 'zh' ? '写下第一条评价' : 'Write the first review')} →</a></div>`}</div></section>`;
}
function studentLifeDetailHTML(id, lang) {
  const copy = studentLifeCopy(lang, id);
  const data = studentLifeData(id);
  const activityOptions = (qByKey('free_time') || {}).options || [];
  const cultureWords = (qByKey('cohort_culture') || {}).words || [];
  const eveningOptions = (qByKey('typical_evening') || {}).options || [];
  const weekdayOptions = (qByKey('weekday_free_time') || {}).options || [];
  const ratingN = data.rating && data.rating.avg > 0 ? data.rating.n : 0;
  const overallValue = ratingN ? data.rating.avg.toFixed(1) : '—';
  const metric = function (label, value, n, suffix) {
    return `<div><span>${esc(label)}</span><strong>${esc(value)}${suffix || ''}</strong><small>${esc(n ? n + ' ' + copy.responses : copy.awaiting)}</small></div>`;
  };
  return `<div class="student-life-detail student-life-decision-map student-life-detail--highlights">
    <aside class="student-decision-rail">
      <h2>${esc(copy.glance)}</h2>
      <div class="student-decision-rail__metrics student-decision-rail__metrics--single">
        ${metric(copy.overall, overallValue, ratingN, ratingN ? '<em>/ 5</em>' : '')}
      </div>
    </aside>
    <div class="student-decision-main">
      <header class="student-decision-intro"><p>${esc(copy.decisionEyebrow)}</p><h2>${esc(copy.decisionTitle)}</h2></header>
      <section class="student-decision-card student-decision-card--blue">
        <div class="student-decision-card__head"><span>01</span><div><p>${esc(copy.cultureTitle)}</p><h2>${esc(copy.cultureQuestion)}</h2></div></div>
        ${studentLifeHighlightsHTML(data.culture, cultureWords, lang, copy.awaiting, copy)}
        <p class="student-decision-card__note">${esc(copy.cultureNote)}</p>
      </section>
      <section class="student-decision-card student-decision-card--coral">
        <div class="student-decision-card__head"><span>02</span><div><p>${esc(copy.activitiesTitle)}</p><h2>${esc(copy.activitiesQuestion)}</h2></div></div>
        <p class="student-decision-card__description">${esc(copy.activitiesBody)}</p>
        <div class="student-life-activity-visual student-life-activity-visual--filled">
          ${studentLifeFilledActivitiesHTML(data.activities, activityOptions, lang, copy.noActivities)}
        </div>
        <p class="student-decision-card__note">${esc(copy.multipleChoice)}</p>
      </section>
      <section class="student-decision-card student-decision-card--mint">
        <div class="student-decision-card__head"><span>03</span><div><p>${esc(copy.socialTitle)}</p><h2>${esc(copy.belongingQuestion)}</h2></div></div>
        ${studentLifeDonutHTML(data.belonging, (qByKey('belonging') || {}).options || [], lang, copy.awaiting, copy, false, false)}
      </section>
      <section class="student-decision-card student-decision-card--yellow">
        <div class="student-decision-card__head"><span>04</span><div><p>${esc(copy.rhythmTitle)}</p><h2>${esc(copy.rhythmQuestion)}</h2></div></div>
        <div class="student-decision-subquestion">
          <h3>${esc(copy.eveningQuestion)}</h3>
          ${studentLifeChoiceSpotlightHTML(data.typicalEvening, eveningOptions, lang, copy.awaiting)}
        </div>
        <div class="student-decision-subquestion">
          <h3>${esc(copy.weekdayQuestion)}</h3>
          ${studentLifeChoiceSpotlightHTML(data.weekdayFreeTime, weekdayOptions, lang, copy.awaiting)}
        </div>
      </section>
    </div>
    ${studentLifeReviewsHTML(id, lang)}
    <div class="experience-contribute"><div><h3>${esc(lang === 'zh' ? '分享你的体验' : 'Add your experience')}</h3><p>${esc(lang === 'zh' ? '你的回答会帮助下一位学生了解真实的学生生活。' : 'Your response helps the next student understand what student life actually felt like.')}</p></div><a class="application-portal-button" href="#/survey/${esc(id)}">${esc(lang === 'zh' ? '写一篇评价' : 'Write a review')} →</a></div>
  </div>`;
}
function studentLifeHeadHTML(id, lang) {
  const agg = window.SSDB.getAggregate(id);
  const lr = agg.life_rating;
  const score = lr ? lr.avg : 0;
  const n = lr ? lr.n : 0;
  const meta = lang === 'zh' ? '条学生生活评分' : 'student-life ratings';
  return modHeadHTML(score, n, meta, lang);
}
function studentLifeBlocksHTML(id, lang, full) {
  return full ? studentLifeDetailHTML(id, lang) : studentLifeOverviewCardsHTML(id, lang);
}
function studentLifeModuleHTML(id, lang, full) {
  return full ? studentLifeDetailHTML(id, lang) : studentLifeHeadHTML(id, lang) + studentLifeBlocksHTML(id, lang, false);
}

/* ---- Campus Life module (Round 3) ----
   Score is split out so the program page can place it directly under
   the section title — above the Dorm info cards. */
function campusHeadHTML(id, lang) {
  const agg = window.SSDB.getAggregate(id);
  const keys = ['housing_rating', 'campus_convenient', 'campus_safe', 'campus_food', 'local_area_rating'];
  let wsum = 0, nsum = 0;
  keys.forEach(k => { const r = agg[k]; if (r) { wsum += r.avg * r.n; nsum += r.n; } });
  const score = nsum ? wsum / nsum : 0;
  const meta = lang === 'zh' ? '条校园评分' : 'campus ratings';
  return modHeadHTML(score, nsum, meta, lang);
}
function campusBlocksHTML(id, lang, full) {
  const agg = window.SSDB.getAggregate(id);
  if (full) {
    return `<div class="survey-grid">
        ${blockHTML(agg, 'housing_rating', lang, 'stars')}
        ${blockHTML(agg, 'campus_food', lang, 'stars')}
        ${blockHTML(agg, 'campus_safe', lang, 'stars')}
        ${blockHTML(agg, 'campus_convenient', lang, 'stars')}
        ${blockHTML(agg, 'local_area_rating', lang, 'stars')}
        ${blockHTML(agg, 'campus_facilities', lang, 'bars')}
        ${blockHTML(agg, 'area_words', lang, 'cloud')}
        ${blockHTML(agg, 'area_convenience', lang, 'bars')}
      </div>`;
  }
  return `<div class="survey-grid">
      ${blockHTML(agg, 'campus_food', lang, 'stars')}
      ${blockHTML(agg, 'area_words', lang, 'cloud')}
    </div>`;
}
function campusModuleHTML(id, lang, full) {
  return window.SSExperience.campus(id, lang, full);
}

/* ---- Outcomes module (Round 4: skills / outcomes / direction / connections) ---- */
function outcomesModuleHTML(id, lang, full) {
  return window.SSExperience.outcomes(id, lang, full);
}

function academicPreviewRatingsHTML(agg, lang) {
  const instructorItems = (agg.instructors_likert && agg.instructors_likert.items) || [];
  const instructorTotal = instructorItems.reduce(function (sum, item) { return sum + (item.n || 0); }, 0);
  const instructorSum = instructorItems.reduce(function (sum, item) { return sum + (item.sum || 0); }, 0);
  const instructorResponses = instructorItems.reduce(function (max, item) { return Math.max(max, item.n || 0); }, 0);
  const contentMatch = agg.academic_content_match;
  const contentMatchTotal = contentMatch ? (contentMatch.total || 0) : 0;
  const contentMatchSum = contentMatch && contentMatch.options
    ? contentMatch.options.reduce(function (sum, option) { return sum + (Number(option.value) || 0) * (option.count || 0); }, 0)
    : 0;
  const overall = agg.academic_rating;
  const ratings = [
    { label: lang === 'zh' ? '整体学术体验' : 'Overall academics', value: overall && overall.n ? overall.avg.toFixed(1) : '—', n: overall ? overall.n : 0 },
    { label: lang === 'zh' ? '老师体验' : 'Instructor experience', value: instructorTotal ? (instructorSum / instructorTotal).toFixed(1) : '—', n: instructorResponses },
    { label: lang === 'zh' ? '课程内容符合度' : 'Content match', value: contentMatchTotal ? (contentMatchSum / contentMatchTotal).toFixed(1) : '—', n: contentMatchTotal }
  ];
  return `<div class="academic-module-preview__ratings">
    ${ratings.map(function (rating) { return `<div><span>${esc(rating.label)}</span><strong>${esc(rating.value)}${rating.n ? '<small> / 5</small>' : ''}</strong><em>${esc(rating.n ? rating.n + (lang === 'zh' ? ' 份评分' : ' ratings') : (lang === 'zh' ? '等待真实评分' : 'Awaiting verified ratings'))}</em></div>`; }).join('')}
  </div>`;
}

/* The Academics module: big score + every survey question as an aggregate.
   `full` adds the category sub-scores and class-info (used on the detail page).
   Teaser on the program page is a 2-column grid of the two most-asked
   questions, full on the detail page is a single column. */
function academicModuleHTML(id, lang, full) {
  if (window.SSExperience && window.SSExperience.academics) {
    return window.SSExperience.academics(id, lang, full);
  }
  const agg = window.SSDB.getAggregate(id);
  const p = programById(id);
  const d = (PROGRAM_DETAILS && PROGRAM_DETAILS[id]) || {};
  const academicProfile = academicProfileFor(id);
  const ar = agg.academic_rating;
  const score = ar && ar.n ? ar.avg : 0;
  const scoreTotal = ar ? ar.n : 0;
  const meta = lang === 'zh' ? '条学术评分' : 'academic ratings';

  const head = modHeadHTML(score, scoreTotal, meta, lang);

  // Program page: two-column teaser (workload + fit with the description).
  const teaser = `<div class="survey-grid">${blockHTML(agg, 'workload', lang, 'bars')}${blockHTML(agg, 'academic_content_match', lang, 'bars')}</div>`;

  let detail = '';
  if (full) {
    /* Niche-style detail page: four stacked scalar sections. */
    detail = academicDetailHTML(id, lang);
    if (!academicProfile && (d.classSize || d.subjects)) {
      detail += `<div class="survey-block survey-block--plain">
          <h4 class="survey-block__q">${esc(t('profileAboutClasses', lang))}</h4>
          <div class="info-grid">
            ${d.classSize ? infoItem(esc(t('profileClassSize', lang)), esc(pickL(d.classSize))) : ''}
            ${d.subjects  ? infoItem(esc(t('profileSubjects', lang)), subjectChips(pickL(d.subjects)), true) : ''}
          </div>
        </div>`;
    }
  }

  if (!full && academicProfile) {
    return `<div class="academic-module-preview">
      ${academicFeedbackStateHTML(id, lang, false)}
      ${academicPreviewRatingsHTML(agg, lang)}
    </div>`;
  }

  // The detail route is a complete report. Repeating the profile score and
  // teaser above it made the page feel like stacked, unrelated modules.
  return full ? detail : head + teaser;
}

/* ============================================================ */
/* Academics detail page — Niche-style "scalar" layout            */
/* Four stacked sections: General rating · Instructors ·          */
/* Academic activities · Types of activities.                    */
/* ============================================================ */

/* Bucket a 0-5 score into a letter grade using the user-defined
   bands: [4,5] A+, [3,4) A, [2,3) B, [1,2) C. Each band has a colour
   drawn from Niche's red→orange→yellow→green grade scale. */
function gradeFromScore(s) {
  if (!s || s < 1.0) return { letter: '—', color: '#718078', bandKey: 'academicBandNoData' };
  if (s >= 4.0) return { letter: 'A+', color: '#116011', bandKey: 'academicBandExceptional' };
  if (s >= 3.0) return { letter: 'A',  color: '#5e9919', bandKey: 'academicBandStrong' };
  if (s >= 2.0) return { letter: 'B',  color: '#eca413', bandKey: 'academicBandSolid' };
  return                { letter: 'C',  color: '#c92c12', bandKey: 'academicBandLimited' };
}
function gradeBadgeHTML(letter, color) {
  return `<span class="grade-badge" style="background:${color}" aria-label="Grade ${esc(letter)}">${esc(letter)}</span>`;
}
function pct(num, total) { return total > 0 ? Math.round((num / total) * 100) : 0; }
function topVotedOption(res) {
  if (!res || !res.options || !res.options.length) return null;
  return res.options.slice().sort((a,b) => (b.count || 0) - (a.count || 0))[0];
}
function likertPctAgree(it) {
  const n = it.n || 1;
  return Math.round(((it.dist[3] || 0) + (it.dist[4] || 0)) / n * 100);
}

function academicDetailHTML(id, lang) {
  const agg = window.SSDB.getAggregate(id);
  const copy = academicCopy(lang);
  const p = programById(id);
  const academicProfile = academicProfileFor(id);
  const ar = agg.academic_rating;
  const score = ar && ar.n ? ar.avg : 0;
  const n = ar ? ar.n : 0;
  const meta = lang === 'zh' ? '条学术评分' : 'academic ratings';
  const grade = gradeFromScore(score);
  const scorePct = Math.max(0, Math.min(100, (score / 5) * 100));

  /* ----- 1. General rating card ---------------------------------- */
  const generalCard = `
    <section class="scalar-card scalar-card--rating">
      <div class="scalar-card__grade">${gradeBadgeHTML(grade.letter, grade.color)}</div>
      <div class="scalar-card__content">
        <p class="scalar-card__eyebrow">${esc(t('academicGeneralTitle', lang))}</p>
        <div class="scalar-card__bigline">
          <span class="scalar-card__num">${score > 0 ? score.toFixed(1) : '—'}</span>
          <span class="scalar-card__unit">${lang === 'zh' ? ' / 5 分' : ' / 5'}</span>
          <span class="scalar-card__band">${esc(t(grade.bandKey, lang))}</span>
        </div>
        <p class="scalar-card__meta">${n} ${esc(meta)} · ${esc(t('academicGradeHelp', lang))}</p>
        <div class="scalar-card__scale" aria-hidden="true"><div class="scalar-card__scale-bar"></div><div class="scalar-card__scale-tick" style="left:${scorePct}%"></div></div>
        <div class="scalar-card__scale-labels"><span>1–2 C</span><span>2–3 B</span><span>3–4 A</span><span>4–5 A+</span></div>
      </div>
    </section>`;

  /* ----- 2. What students say about instructors ------------------ */
  const instLikert = agg.instructors_likert;
  const passionate = instLikert && instLikert.items
    ? instLikert.items.find(x => x.key === 'inst_passionate') : null;
  const engPct = passionate ? likertPctAgree(passionate) : 0;
  const engN = passionate ? passionate.n : 0;

  const interactionRes = agg.interaction;
  const interactionTop = topVotedOption(interactionRes);
  const intPct = interactionTop ? pct(interactionTop.count, interactionRes.total) : 0;
  const intN = interactionRes ? interactionRes.total : 0;

  const sayEnPart = lang === 'zh' ? '' : t('academicOfStudentsSaid', lang);
  const instructorsBlock = `
    <div class="scalar-section">
      <h3 class="scalar-section__title">${esc(t('academicInstructorsTitle', lang))}</h3>
      <ul class="say-list">
        <li class="say-item">
          <div class="say-item__label">${esc(t('academicEngagementLabel', lang))}</div>
          <p class="say-item__body">
            <span class="say-item__pct">${engPct}%</span>${esc(sayEnPart)}
            <strong>${esc((passionate && pickL(passionate.label)) || '—')}</strong><span class="say-item__meta"> · ${engN} ${esc(t('academicResponses', lang))}</span>
          </p>
        </li>
        <li class="say-item">
          <div class="say-item__label">${esc(t('academicInteractionLabel', lang))}</div>
          <p class="say-item__body">
            <span class="say-item__pct">${intPct}%</span>${esc(sayEnPart)}
            <strong>${esc(interactionTop ? pickL(interactionTop) : '—')}</strong><span class="say-item__meta"> · ${intN} ${esc(t('academicResponses', lang))}</span>
          </p>
        </li>
      </ul>
    </div>`;

  /* ----- 3. What students say about the course experience ------- */
  const workloadTop = topVotedOption(agg.workload);
  const wlPct = workloadTop ? pct(workloadTop.count, agg.workload.total) : 0;
  const wlN = agg.workload ? agg.workload.total : 0;

  const contentMatchTop = topVotedOption(agg.academic_content_match);
  const contentMatchPct = contentMatchTop ? pct(contentMatchTop.count, agg.academic_content_match.total) : 0;
  const contentMatchN = agg.academic_content_match ? agg.academic_content_match.total : 0;

  const activitiesBlock = `
    <div class="scalar-section">
      <h3 class="scalar-section__title">${esc(copy.courseExperience)}</h3>
      <ul class="say-list">
        <li class="say-item">
          <div class="say-item__label">${esc(copy.workload)}</div>
          <p class="say-item__body">
            <span class="say-item__pct">${wlPct}%</span>${esc(sayEnPart)}
            <strong>${esc(workloadTop ? pickL(workloadTop) : '—')}</strong><span class="say-item__meta"> · ${wlN} ${esc(t('academicResponses', lang))}</span>
          </p>
        </li>
        <li class="say-item">
          <div class="say-item__label">${esc(copy.contentMatch)}</div>
          <p class="say-item__body">
            <span class="say-item__pct">${contentMatchPct}%</span>${esc(sayEnPart)}
            <strong>${esc(contentMatchTop ? pickL(contentMatchTop) : '—')}</strong><span class="say-item__meta"> · ${contentMatchN} ${esc(t('academicResponses', lang))}</span>
          </p>
        </li>
      </ul>
    </div>`;

  /* ----- 4. Types of academic activities included --------------- */
  const actRes = agg.activities;
  // The aggregate always contains every questionnaire option, including 0%
  // choices. Sort only to make the visual comparison easier to scan.
  const actItems = (actRes && actRes.options)
    ? actRes.options.slice().sort((a, b) => (b.count || 0) - (a.count || 0)) : [];
  const actTotal = actRes ? actRes.total : 0;
  const coveredFormats = actItems.filter(function (o) { return (o.count || 0) > 0; }).length;

  const legacyTypesBlock = `
    <div class="scalar-section">
      <h3 class="scalar-section__title">${esc(t('academicActivitiesTypesTitle', lang))}</h3>
      <div class="activity-coverage">
        <div><span class="activity-coverage__number">${coveredFormats}<small>/ ${actItems.length}</small></span><span class="activity-coverage__label">${esc(t('academicFormatsReported', lang))}</span></div>
        <p>${esc(t('academicFormatsHelp', lang))}</p>
      </div>
      <ul class="activities-list">
        ${actItems.map(o => {
          const c = o.count || 0;
          const pctVal = actTotal > 0 ? Math.round(c / actTotal * 100) : 0;
          return `<li class="activities-row${pctVal === 0 ? ' is-zero' : ''}">
            <span class="activities-row__label"><i aria-hidden="true">${pctVal > 0 ? '✓' : '·'}</i>${esc(pickL(o))}</span>
            <div class="activities-row__track"><div class="activities-row__fill" style="width:${pctVal}%"></div></div>
            <span class="activities-row__pct">${actTotal ? pctVal + '%' : '—'}</span>
          </li>`;
        }).join('')}
      </ul>
      <p class="activities-note">${actTotal ? actTotal + ' ' + esc(t('academicResponses', lang)) + ' · ' + esc(t('academicFormatsNote', lang)) : esc(t('academicNoResponses', lang))}</p>
    </div>`;

  const hasVerifiedAcademicFeedback = n > 0 || engN > 0 || wlN > 0 || contentMatchN > 0;
  const feedbackBlock = academicProfile
    ? academicExperienceSummaryHTML(id, lang, agg)
    : (hasVerifiedAcademicFeedback
      ? `${generalCard}${instructorsBlock}${activitiesBlock}`
      : `<section class="academic-feedback-section scalar-section">
          <h3 class="scalar-section__title">${esc(academicCopy(lang).feedback)}</h3>
          ${academicFeedbackStateHTML(id, lang, false)}
        </section>`);
  const formatBlock = academicProfile
    ? academicFormatMapHTML(id, lang, actRes)
    : legacyTypesBlock;

  return `<div class="academics-detail">${academicOfficialProfileHTML(id, lang)}${feedbackBlock}${formatBlock}</div>`;
}

function harvardPreCollegeExemplarDetail(section, lang) {
  const isZh = lang === 'zh';
  const previewLabel = `<p class="exemplar-detail__notice">${esc(isZh ? '示例预览 · 以下内容用于确认完整学生评价的呈现方式，并非已发布数据。' : 'Exemplar preview · The responses below demonstrate the full-review layout and are not published data.')}</p>`;
  const rating = (label, value) => `<div class="exemplar-detail__rating"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  const chips = values => `<div class="exemplar-detail__chips">${values.map(value => `<span>${esc(value)}</span>`).join('')}</div>`;
  const response = (label, text) => `<article class="exemplar-detail__response"><p>${esc(label)}</p><blockquote>“${esc(text)}”</blockquote></article>`;
  const sections = {
    academics: `${previewLabel}<div class="exemplar-detail__grid">
      <section class="exemplar-detail__panel"><h2>${esc(isZh ? '整体学术体验' : 'Overall academic experience')}</h2>${rating(isZh ? '学生评分' : 'Student rating','4.6 / 5')}</section>
      <section class="exemplar-detail__panel"><h2>${esc(isZh ? '学术工作量' : 'Academic workload')}</h2><p class="exemplar-detail__answer">${esc(isZh ? '偏重，但可以应付' : 'Somewhat heavy, but manageable')}</p></section>
      <section class="exemplar-detail__panel exemplar-detail__panel--wide"><h2>${esc(isZh ? '教师评价' : 'Instructor ratings')}</h2><div class="exemplar-detail__ratings">${rating(isZh ? '讲解清晰度' : 'Teaching clarity','4.7')}${rating(isZh ? '投入与热情' : 'Engagement and enthusiasm','4.8')}${rating(isZh ? '鼓励课堂讨论' : 'Encouragement of discussion','4.6')}${rating(isZh ? '课外帮助' : 'Helpfulness outside class','4.5')}</div></section>
      <section class="exemplar-detail__panel exemplar-detail__panel--wide">${response(isZh ? '一个留下印象的课堂、教授或学术瞬间' : 'One class, professor, or academic moment that left an impression',isZh ? '有一次讨论课，老师没有急着给出答案，而是让每个人继续追问。那是我第一次觉得自己的观点真的被当作大学课堂的一部分。' : 'In one seminar, the instructor did not rush to give us an answer and kept asking us to push the idea further. It was the first time my perspective felt like a real part of a college classroom.')}</section>
    </div>`,
    students: `${previewLabel}<div class="exemplar-detail__grid">
      <section class="exemplar-detail__panel"><h2>${esc(isZh ? '整体学生生活' : 'Overall student life')}</h2>${rating(isZh ? '学生评分' : 'Student rating','4.5 / 5')}<p class="exemplar-detail__micro">${esc(isZh ? '89% 的示例学生选择 4 或 5 分' : '89% of preview respondents selected 4 or 5')}</p></section>
      <section class="exemplar-detail__panel"><h2>${esc(isZh ? '交朋友与融入' : 'Making friends and feeling included')}</h2><p class="exemplar-detail__answer">${esc(isZh ? '比较容易' : 'Somewhat easy')}</p></section>
      <section class="exemplar-detail__panel exemplar-detail__panel--wide"><h2>${esc(isZh ? '项目提供的课余活动' : 'Free-time activities offered')}</h2>${chips(isZh ? ['周末出行','白天活动','晚间活动','兴趣小组','运动与户外活动'] : ['Weekend trips','Daytime activities','Evening events','Interest groups','Sports and outdoor recreation'])}</section>
      <section class="exemplar-detail__panel exemplar-detail__panel--wide">${response(isZh ? '一个关于学生生活的回忆' : 'One student-life reflection',isZh ? '最特别的是我们那群人在课后一起吃东西、聊天。有些友谊不是活动安排出来的，而是在那些空白时间里自然形成的。' : 'The most special part was grabbing food and talking after class. Some friendships did not come from a scheduled activity; they formed naturally in the unplanned time between things.')}</section>
    </div>`,
    campus: `${previewLabel}<div class="exemplar-detail__grid">
      <section class="exemplar-detail__panel exemplar-detail__panel--wide"><h2>${esc(isZh ? '校园设施评分' : 'Campus setting ratings')}</h2><div class="exemplar-detail__ratings">${rating(isZh ? '餐饮' : 'Food','3.8')}${rating(isZh ? '宿舍／住宿' : 'Dorms / accommodation','4.2')}${rating(isZh ? '教室与学习空间' : 'Classrooms and study spaces','4.7')}${rating(isZh ? '娱乐设施与公共空间' : 'Recreation and common areas','4.3')}</div></section>
      <section class="exemplar-detail__panel"><h2>${esc(isZh ? '校园安全感' : 'Feeling safe on campus')}</h2>${rating(isZh ? '安全' : 'Safety','4.7 / 5')}</section>
      <section class="exemplar-detail__panel"><h2>${esc(isZh ? '校园出行便利度' : 'Getting around campus')}</h2>${rating(isZh ? '便利度' : 'Convenience','4.5 / 5')}</section>
      <section class="exemplar-detail__panel exemplar-detail__panel--wide"><h2>${esc(isZh ? '项目周边容易到达的地点' : 'Easy to access near the program')}</h2>${chips(isZh ? ['餐饮','公共交通','购物','自然空间','文化与历史地标'] : ['Food','Public transportation','Shopping','Natural spaces','Cultural and historical landmarks'])}</section>
      <section class="exemplar-detail__panel exemplar-detail__panel--wide">${response(isZh ? '一个推荐给未来学生的地方' : 'One place to recommend to future students',isZh ? '傍晚可以沿着河边散步，再从校园慢慢走回宿舍。那段路很适合和朋友聊天，也是我最能感受到城市氛围的时候。' : 'Walk by the river near sunset and take the long way back to the dorm. It was the best time to talk with friends and the moment when the city felt most memorable.')}</section>
    </div>`,
    outcomes: `${previewLabel}<div class="exemplar-detail__grid exemplar-detail__grid--single"><section class="exemplar-detail__panel exemplar-detail__panel--wide"><h2>${esc(isZh ? '参加项目后，你带走了什么？' : 'What did you walk away with after the program?')}</h2>${chips(isZh ? ['更清楚的学术兴趣','参与大学课堂的信心','来自不同地方的友谊','大学生活体验','结业证明'] : ['Clearer academic interests','Confidence in college-level classes','Friendships from different places','A taste of college life','Certificate of completion'])}${response(isZh ? '学生的回答' : 'Student response',isZh ? '我离开时不只是多了一张证书。我更确定自己喜欢怎样的课堂，也更敢在不熟悉的环境里主动认识别人和表达观点。' : 'I left with more than a certificate. I understood what kind of classroom I enjoy, and I felt more confident introducing myself, asking questions, and speaking up in unfamiliar settings.')}</section></div>`
  };
  return `<div class="exemplar-detail">${sections[section] || ''}</div>`;
}

function renderProgramAcademics(id) {
  const lang = L();
  const p = programById(id);
  if (!p) { location.hash = '#/'; return; }
  renderYYGSProgramPage('academics', id);
}

function renderProgramAcademicReviews(id) {
  const lang = L();
  const p = programById(id);
  if (!p) { location.hash = '#/'; return; }
  const copy = academicCopy(lang);
  const reviews = window.SSDB.getReviews(id).filter(function (review) {
    return /professor|instructor|teacher|class|academ|lecture|seminar|study|course|workload|difficulty|assignment|project|research|lab/i.test(review.text || '');
  });
  const cards = reviews.map(function (review) {
    return `<article class="review-card"><div class="avatar">${esc((review.author || '?').slice(0,2).toUpperCase())}</div><div><div class="row row--between"><div><strong>${esc(review.author || (lang === 'zh' ? '匿名' : 'Anonymous'))}</strong> <span class="muted">· ${esc(review.who || '')}</span></div><div class="mini-stars">${'★'.repeat(review.stars || 0)}${'☆'.repeat(5 - (review.stars || 0))}</div></div><p>${esc(review.text || '')}</p></div></article>`;
  }).join('');
  const body = `<section class="academic-related-review-page"><p class="academic-related-review-page__intro">${esc(copy.relatedReviewsIntro)}</p>${cards || `<div class="academic-related-review-page__empty"><p>${esc(copy.noRelatedReviews)}</p><a href="#/survey/${esc(id)}">${esc(copy.share)} →</a></div>`}<a class="see-more-link" href="#/program/${esc(id)}/academics">‹ ${esc(lang === 'zh' ? '返回学术页面' : 'Back to Academics')}</a></section>`;
  renderProgramReport(id, 'academic-reviews', copy.relatedReviewsTitle, body);
}

function reportNavigation(id, active, lang) {
  const items = [
    ['academics', t('profileAcademics', lang)], ['students', t('profileStudents', lang)],
    ['campus', t('profileCampus', lang)], ['outcomes', t('profileWhatYouGot', lang)]
  ];
  return `<aside class="report-nav"><p>${esc(lang === 'zh' ? '项目体验' : 'Program experience')}</p>${items.map(function (item) {
    return `<a class="${item[0] === active ? 'is-active' : ''}" href="#/program/${esc(id)}/${item[0]}">${esc(item[1])}</a>`;
  }).join('')}</aside>`;
}

/* Shared report shell for every content detail page. It establishes one
 * predictable reading rhythm: program context → category → evidence. */
function renderProgramReport(id, active, title, body) {
  const lang = L();
  const p = programById(id);
  if (!p) { location.hash = '#/'; return; }
  const singleColumn = ['academics', 'academic-reviews', 'students', 'campus', 'outcomes'].includes(active);
  $('#app').innerHTML = `
    ${renderHeader('home')}
    <main>
      <section class="report-hero"><div class="report-hero__inner">
        <p class="report-hero__program">${esc(pickL(p.name))} · ${esc(pickL(p.host))}</p>
        <h1>${esc(title)}</h1>
      </div></section>
      <section class="report-page"><div class="report-page__inner ${singleColumn ? 'report-page__inner--single' : ''}">
        ${singleColumn ? '' : reportNavigation(id, active, lang)}
        <div class="report-body">${body}<a class="back-link report-body__back" href="#/program/${esc(id)}">‹ ${esc(t('backToProgram', lang))}</a></div>
      </div></section>
    </main>
    ${renderFooter()}`;
  bindHeaderEvents();
}

/* ---- Student life / Campus life / Outcomes detail pages ---- */
function renderProgramStudents(id) {
  const lang = L();
  const p = programById(id);
  if (!p) { location.hash = '#/'; return; }
  renderYYGSProgramPage('students', id);
}
function renderProgramCampus(id) {
  const lang = L();
  const p = programById(id);
  if (!p) { location.hash = '#/'; return; }
  renderYYGSProgramPage('campus', id);
}
function renderProgramOutcomes(id) {
  const lang = L();
  const p = programById(id);
  if (!p) { location.hash = '#/'; return; }
  renderYYGSProgramPage('outcomes', id);
}

/* ============================ RANKINGS ============================== *
 * The "Best Summer Programs" page — a long, Niche-style list of every
 * program in the database, ranked by overall score and paginated 10/page.
 *
 * Every card is a single program "name card":
 *   #N BEST SUMMER PROGRAM IN AMERICA   (eyebrow)
 *   Program name                         (serif title)
 *   School · City · Duration · ★★★★★ N reviews   (meta)
 *   <Author>: review text …              Read N reviews  (review excerpt)
 *   Academics 4.5 · Social Life 4.6 · Student Life 4.5 · Local Area 4.0   (scores)
 *   Program details | Compare            ♡ Save program  (actions)
 */

/* ============================ SUMMARY LABELS ========================== *
 * Each survey question has a 2-3 word summary (shown instead of the full
 * question text) and an optional eyebrow override (used by Niche-style
 * "Word Bubble" displays). Short labels keep the program page focused. */

const SUMMARY_LABELS = {
  /* Academics (r2) */
  workload:           { en: 'Academic Workload', zh: '学习量' },
  academic_content_match: { en: 'Content Match',  zh: '课程内容符合度' },
  instructors_likert: { en: 'Instructors',       zh: '授课老师' },
  interaction:        { en: 'Interaction',       zh: '师生互动' },
  activities:         { en: 'Activities',        zh: '学术活动' },
  /* Student life (r2) */
  life_rating:        { en: 'Overall Student Life',  zh: '整体学生生活' },
  belonging:          { en: 'Sense of Belonging',    zh: '归属感' },
  socializing_difficulty: { en: 'Socializing Difficulty', zh: '社交难度' },
  free_time:          { en: 'Free-time Activities',  zh: '课余活动' },
  housing_organized:  { en: 'Housing Organization',          zh: '住宿安排' },
  housing_diversity:  { en: 'Roommate Diversity',    zh: '住宿多元化' },
  housing_experience: { en: 'Housing Experience',    zh: '住宿体验' },
  dorm_staff:         { en: 'Dorm Staff',            zh: '宿管老师' },
  dorm_atmosphere:    { en: 'Dorm Atmosphere',       zh: '宿舍氛围' },
  /* Campus life (r3) */
  housing_rating:     { en: 'Housing Experience',    zh: '住宿体验' },
  campus_convenient:  { en: 'Campus Convenience',    zh: '校园便利' },
  campus_facilities:  { en: 'Campus Facilities',     zh: '校园设施' },
  campus_safe:        { en: 'Campus Safety',         zh: '校园安全' },
  campus_food:        { en: 'Campus Food',           zh: '校园餐饮' },
  local_area_rating:  { en: 'Local Area',            zh: '周边环境' },
  area_words:         { en: 'Description of Local Area', zh: '周边环境描述' },
  city_life:          { en: 'City Life',             zh: '城市生活' },
  area_convenience:   { en: 'Area Convenience',      zh: '周边便利' },
  leaving_campus:     { en: 'Off Campus',            zh: '出校体验' },
  transport_safe:     { en: 'Transport Safety',      zh: '交通体验' },
  /* Outcomes (r4) */
  skills:             { en: 'Skills',                zh: '能力提升' },
  outcomes:           { en: 'Tangible Outcomes',     zh: '实际收获' },
  academic_direction: { en: 'Academic Direction',    zh: '学术方向' },
  lasting_connection: { en: 'Lasting Connection',    zh: '持续联系' },
  value_for_money:    { en: 'Worth It',              zh: '是否值得' },
};
function summaryLabel(qKey, lang) {
  const m = SUMMARY_LABELS[qKey];
  return m ? (m[lang] || m.en) : qKey;
}

/* ============================ RANK CATEGORIES ======================== *
 * Four categories, each ordered by its corresponding student rating. */

function aggregateCount(result) {
  return Number(result && (result.n != null ? result.n : result.total)) || 0;
}
function starsRankingMetric(result) {
  const n = aggregateCount(result);
  if (!n) return null;
  const sum = Number.isFinite(result.sum)
    ? result.sum
    : (result.dist || []).reduce((total, count, index) => total + (Number(count) || 0) * (index + 1), 0);
  return { value: sum / n, n };
}
function optionRankingMetric(result, weights) {
  const n = aggregateCount(result);
  if (!n || !result || !Array.isArray(result.options)) return null;
  let sum = 0;
  let scored = 0;
  result.options.forEach(option => {
    const weight = weights ? weights[String(option.value)] : Number(option.value);
    if (!Number.isFinite(weight)) return;
    const count = Number(option.count) || 0;
    sum += weight * count;
    scored += count;
  });
  return scored ? { value: sum / scored, n: scored } : null;
}
function selectionRankingMetric(result, value) {
  const n = aggregateCount(result);
  if (!n || !result || !Array.isArray(result.options)) return null;
  const option = result.options.find(item => String(item.value) === String(value));
  return { value: ((Number(option && option.count) || 0) / n) * 5, n };
}
function combineRankingMetrics(metrics) {
  const available = metrics.filter(metric => metric && Number.isFinite(metric.value) && metric.n > 0);
  if (!available.length) return null;
  return {
    value: available.reduce((sum, metric) => sum + metric.value, 0) / available.length,
    // Use the smallest component sample as the conservative evidence count.
    n: Math.min.apply(null, available.map(metric => metric.n)),
  };
}
function actualRankingMetrics(program) {
  const agg = window.SSDB.getAggregate(program.id);
  const overall = optionRankingMetric(agg.overall);
  const academics = starsRankingMetric(agg.academic_rating);
  const studentLife = starsRankingMetric(agg.life_rating);
  const localArea = starsRankingMetric(agg.local_area_rating);
  const campusLife = combineRankingMetrics([
    starsRankingMetric(agg.housing_rating),
    starsRankingMetric(agg.campus_safe),
    starsRankingMetric(agg.campus_convenient),
    starsRankingMetric(agg.campus_food),
    localArea,
  ]);
  const research = combineRankingMetrics([
    academics,
    selectionRankingMetric(agg.activities, 'research'),
    selectionRankingMetric(agg.outcomes, 'research'),
  ]);
  const socialEase = starsRankingMetric(agg.socializing_difficulty);
  const networking = combineRankingMetrics([
    studentLife,
    optionRankingMetric(agg.belonging, {
      fully_included: 5, mostly_included: 4, mixed: 3, outsider: 2, little_connection: 1,
    }),
    socialEase ? { value: 6 - socialEase.value, n: socialEase.n } : null,
    selectionRankingMetric(agg.skills, 'networking'),
    optionRankingMetric(agg.lasting_connection, {
      close_friends: 5, peer_community: 5, mentor: 5, collaborator: 5, no_connection: 1,
    }),
  ]);
  const value = optionRankingMetric(agg.value_for_money, { yes: 5, unsure: 3, no: 1 });
  const rigorous = optionRankingMetric(agg.workload, { 1: 5, 2: 4, 3: 2, 4: 1 });
  const exploration = optionRankingMetric(agg.academic_direction, {
    new_interest: 5, confirmed_interest: 4.5, ruled_out_interest: 4.5,
    useful_exposure: 3.5, no_effect: 1,
  });
  const responseVolume = overall ? { value: overall.n, n: overall.n } : null;
  return { overall, academics, studentLife, campusLife, localArea, research, networking, value, rigorous, exploration, responseVolume };
}

const RANK_CATEGORIES = [
  { id: 'overall',     metric: 'overall',        label: { en: 'Best Overall',                zh: '综合最佳' },       eyebrow: { en: '#%d BEST SUMMER PROGRAM BY STUDENT RATING',                           zh: '#%d 学生综合评分最高的夏校' } },
  { id: 'academics',   metric: 'academics',      label: { en: 'Best Academics',              zh: '学术体验最佳' },   eyebrow: { en: '#%d BEST ACADEMICS BY STUDENT RATING',                                 zh: '#%d 学生学术体验评分最高的夏校' } },
  { id: 'student-life',metric: 'studentLife',    label: { en: 'Best Student Life',           zh: '学生生活最佳' },   eyebrow: { en: '#%d BEST STUDENT LIFE BY STUDENT RATING',                              zh: '#%d 学生生活评分最高的夏校' } },
  { id: 'campus-life', metric: 'campusLife',     label: { en: 'Best Campus Life',            zh: '校园生活最佳' },   eyebrow: { en: '#%d BEST CAMPUS LIFE BY STUDENT RATING',                               zh: '#%d 校园生活评分最高的夏校' } },
];
const RANK_BY_ID = {};
RANK_CATEGORIES.forEach(c => { RANK_BY_ID[c.id] = c; });

const BEST_PAGE_SIZE = 10;

function paginationList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  pages.push(1);
  let start, end;
  if (current <= 3)        { start = 2;           end = Math.min(5, total - 1); }
  else if (current >= total - 2) { start = Math.max(2, total - 4); end = total - 1; }
  else                     { start = current - 1; end = current + 1; }
  if (start > 2) pages.push('...');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('...');
  pages.push(total);
  return pages;
}

function bestCardHTML(p, metrics, rank, cat, lang) {
  const reviews = window.SSDB.getReviews(p.id);
  const r0 = reviews[0];
  const rankedMetric = metrics[cat.metric];

  const eyebrowTpl = (cat.eyebrow[lang] || cat.eyebrow.en).replace('%d', rank);
  const metaParts = [
    pickL(p.host),
    pickL(p.location),
    pickL(p.duration),
  ];
  const meta = metaParts.map((m, i) => `<span>${esc(m)}</span>${i < metaParts.length - 1 ? '<span class="bc-dot">·</span>' : ''}`).join('');

  const reviewHTML = r0
    ? `<strong>${esc(r0.author || (lang === 'zh' ? '学生' : 'Student'))}:</strong> ${esc((r0.text || '').slice(0, 220))}${(r0.text || '').length > 220 ? '…' : ''}`
    : `<em>${esc(t('rankNoReview', lang))}</em>`;

  const scoreCells = [
    { key:'overall',     l: lang === 'zh' ? '综合' : 'Overall',         m: metrics.overall },
    { key:'academics',   l: lang === 'zh' ? '学术' : 'Academics',       m: metrics.academics },
    { key:'studentLife', l: lang === 'zh' ? '学生生活' : 'Student life', m: metrics.studentLife },
    { key:'campusLife',  l: lang === 'zh' ? '校园生活' : 'Campus life',   m: metrics.campusLife },
  ].map(s => `<span class="best-card__score ${s.key === cat.metric ? 'is-active' : ''}"><span class="best-card__score-label">${esc(s.l)}</span><span class="best-card__score-value"><strong>${s.m ? s.m.value.toFixed(1) : '—'}</strong>${s.m ? '<small>/ 5</small>' : ''}</span></span>`).join('');
  const inList = window.SSDB.inList(p.id);
  const photo = campusPhotoFor(p, cat);

  return `
    <article class="best-card">
      <div class="best-card__body">
        <div class="best-card__eyebrow">${eyebrowTpl}</div>
        <h2 class="best-card__title"><a href="#/program/${esc(p.id)}">${esc(pickL(p.name))}</a></h2>
        <div class="best-card__meta">${meta}</div>
        <p class="best-card__review">${reviewHTML}</p>
        <div class="best-card__scores">${scoreCells}</div>
        <div class="best-card__actions">
          <a class="best-card__action" href="#/program/${esc(p.id)}">${esc(t('rankActionDetails', lang))}</a>
          <button class="best-card__add ${inList ? 'is-in' : ''}" data-add="${esc(p.id)}" type="button">
            ${inList ? '✓' : '♡'} <span>${esc(inList ? t('rankActionAdded', lang) : t('rankActionAdd', lang))}</span>
          </button>
        </div>
      </div>
      <div class="best-card__photo" role="img" aria-label="${esc(t('rankIllustrativePhoto', lang))}"
           style="background-image:url('${esc(photo)}')"></div>
    </article>`;
}

/* Royalty-free campus-life photo for a program. Picked deterministically
 * from a curated pool of Unsplash photos (no logos, no mascots, no
 * identifiable buildings with branding) — chosen so each program gets a
 * stable but distinct scene across refreshes. */
const CAMPUS_PHOTO_POOL = [
  'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1607237138185-eedd9c632b0b?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1571260899304-425eee4c7efc?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1606761568499-6d2451b23c66?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1562774053-701939374585?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1498243691581-1454c5cf1e0b?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=600&h=420&fit=crop&q=70',
  'https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=600&h=420&fit=crop&q=70',
];
function campusPhotoFor(p, cat) {
  const key = (p.id || '') + '|' + (cat && cat.id || '');
  let h = 0;
  for (let i = 0; i < key.length; i++) { h = ((h << 5) - h) + key.charCodeAt(i); h |= 0; }
  const idx = Math.abs(h) % CAMPUS_PHOTO_POOL.length;
  return CAMPUS_PHOTO_POOL[idx];
}

function rankTabsHTML(activeCat, lang, page) {
  return `<nav class="rank-tabs" role="tablist" aria-label="${esc(t('rankCategory', lang) || 'Rankings')}">
    ${RANK_CATEGORIES.map(c => {
      const lbl = c.label[lang] || c.label.en;
      const on  = c.id === activeCat;
      return `<a class="rank-tab ${on ? 'is-on' : ''}" href="#/rankings/${c.id}/${page}" role="tab" aria-selected="${on}">${esc(lbl)}</a>`;
    }).join('')}
  </nav>`;
}

function renderRankings(catId, page) {
  const lang = L();
  const cat = RANK_BY_ID[catId || 'overall'] || RANK_CATEGORIES[0];
  const programs = window.SSDB.getPrograms();
  const studentEntries = programs.map(program => ({ program, metrics: actualRankingMetrics(program) }))
    .filter(entry => {
      const metric = entry.metrics[cat.metric];
      return metric && metric.n > 0 && Number.isFinite(metric.value);
    });
  const all = studentEntries;
  all.sort((a, b) => {
    const am = a.metrics[cat.metric], bm = b.metrics[cat.metric];
    return (bm.value - am.value) || (bm.n - am.n) || String(a.program.id).localeCompare(String(b.program.id));
  });

  const totalPages = Math.max(1, Math.ceil(all.length / BEST_PAGE_SIZE));
  let p = parseInt(page, 10);
  if (isNaN(p) || p < 1) p = 1;
  if (p > totalPages) p = totalPages;
  const start = (p - 1) * BEST_PAGE_SIZE;
  const slice = all.slice(start, start + BEST_PAGE_SIZE);

  const pages = paginationList(p, totalPages);
  const pagHTML = pages.map(it => {
    if (it === '...') return '<span class="pagination__ellipsis">…</span>';
    return `<a class="pagination__item ${it === p ? 'is-active' : ''}" href="#/rankings/${cat.id}/${it}">${it}</a>`;
  }).join('');

  const html = `
    ${renderHeader('rankings')}
    <main class="rankings-page" data-ranking-mode="student">
      <section class="best-hero">
        <h1>${esc(t('rankTitle', lang))}</h1>
        <div class="rankings-disclaimer" role="note" aria-label="${esc(t('rankDisclaimerLabel', lang))}">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>
          <div class="rankings-disclaimer__copy">
            <p>${esc(t('rankDisclaimer', lang))}</p>
            <p>${esc(t('rankSub', lang))}</p>
          </div>
        </div>
      </section>
      ${rankTabsHTML(cat.id, lang, 1)}
      <div class="rankings-preview-banner" role="note"><div><p>${esc(t('rankStudentMode', lang))}</p></div></div>
      <section class="best-list">
        ${slice.length
          ? slice.map((entry, i) => bestCardHTML(entry.program, entry.metrics, start + i + 1, cat, lang)).join('')
          : `<div class="best-empty"><h2>${esc(lang === 'zh' ? '暂无学生评分' : 'No student ratings yet')}</h2><p>${esc(lang === 'zh' ? '学生提交相关问卷回答后，该榜单才会显示排名。' : 'Programs will appear here only after students submit answers relevant to this ranking.')}</p></div>`}
      </section>
      ${totalPages > 1 ? `<nav class="pagination">
        ${p > 1
          ? `<a class="pagination__arrow" href="#/rankings/${cat.id}/${p - 1}" aria-label="${esc(t('rankPagePrev', lang))}">‹</a>`
          : `<span class="pagination__arrow is-disabled" aria-label="${esc(t('rankPagePrev', lang))}">‹</span>`}
        ${pagHTML}
        ${p < totalPages
          ? `<a class="pagination__arrow" href="#/rankings/${cat.id}/${p + 1}" aria-label="${esc(t('rankPageNext', lang))}">›</a>`
          : `<span class="pagination__arrow is-disabled" aria-label="${esc(t('rankPageNext', lang))}">›</span>`}
      </nav>` : ''}
    </main>
    ${renderFooter()}
  `;
  $('#app').innerHTML = html;
  bindHeaderEvents();
  $$('.best-card__add', document).forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-add');
      window.SSDB.toggleList(id);
      renderRankings(cat.id, p);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

/* ============================ MATCHMAKER ============================ */

function renderMatchmaker() {
  window.SSMatchmakerUI.render({
    root:$('#app'),
    lang:L(),
    programs:window.SSDB.getPrograms(),
    headerHTML:renderHeader('match'),
    footerHTML:renderFooter(),
    bindHeaderEvents,
    initialSubjects:[...State.guided.subjects],
    initialMethods:[...State.guided.methods],
    legacyProfile:State.matchmaker,
    db:window.SSDB,
  });
}
function renderMatchmakerResults() { renderMatchmaker(); }

/* ============================ AUTH ==================================== */

function renderAuthPrompt() {
  const lang = L();
  const html = `
    ${renderHeader('home')}
    <main>
      <section class="hero" style="padding-bottom:10px">
        <h1>${esc(t('authPromptTitle', lang))}</h1>
        <p>${esc(t('authPromptSub', lang))}</p>
        <div class="profile-hero__actions" style="justify-content:center;margin-top:18px">
          <a class="btn--solid" href="#/register">${esc(t('authRegister', lang))} ›</a>
          <a class="btn--pill" href="#/login">${esc(t('authSignIn', lang))}</a>
        </div>
      </section>
    </main>
    ${renderFooter()}
  `;
  $('#app').innerHTML = html;
  bindHeaderEvents();
}

/* After a successful login/register, return to the exact gated survey point.
 * The review gate resumes the written-review question; the older Round 1 save
 * gate remains a defensive fallback for legacy drafts. */
function afterAuthSuccess() {
  // Conversational-review drafts are written locally before authentication.
  // On sign-in, return to the final confirmation screen without discarding
  // anything the student has already written.
  if (State.reviewDraft && State.reviewDraft.awaitingAuth) {
    State.reviewDraft.awaitingAuth = false;
    State.reviewDraft.ownerId = window.SSDB.currentUser()?.id || null;
    save();
    location.hash = '#/survey/' + State.reviewDraft.programId;
    render();
    return;
  }
  if (State.survey && !State.survey.ownerId) {
    State.survey.ownerId = window.SSDB.currentUser()?.id || null;
    save();
  }
  if (State.surveyReturnTo) {
    const target = State.surveyReturnTo;
    delete State.surveyReturnTo;
    const surveyGate = State.surveyGate;
    if (surveyGate?.type === 'review' && State.survey) {
      delete State.surveyGate;
      State.survey.currentRound = boundedSurveyIndex(
        surveyGate.ri,
        0,
        Math.max(0, QUESTIONNAIRE.length - 1)
      );
      const round = QUESTIONNAIRE[State.survey.currentRound];
      State.survey.qIndex = boundedSurveyIndex(
        surveyGate.qi,
        0,
        Math.max(0, (round?.questions || []).length - 1)
      );
      save();
      location.hash = target;
      render();
      return;
    }
    const gated = State.surveyGatedRound;
    if (gated !== undefined && State.survey) {
      delete State.surveyGatedRound;
      State.survey.doneRounds[gated] = true;
      try { window.SSDB.recordRound(State.survey.programId, 'r' + (gated + 1), roundAnswersForSubmission(gated)); } catch (e) {}
      publishReviewFromRound(gated);
      State.survey.currentRound = gated + 1;
      State.survey.qIndex = 0;
    }
    save();
    location.hash = target;
    render();
  } else {
    location.hash = State.accountReturnTo ? '#/account' : '#/';
    delete State.accountReturnTo;
    render();
  }
}

function renderLoginLegacy() {
  const lang = L();
  const html = `
    ${renderHeader('home')}
    <main>
      <section class="section">
        <div class="auth-card">
          <h1 style="font-family:var(--serif);font-size:34px;margin:0 0 6px">${esc(t('authSignIn', lang))}</h1>
          <p class="muted" style="margin:0 0 22px">${esc(t('authPromptSub', lang))}</p>
          <form id="login-form" class="auth-form">
            <label>${esc(t('authEmail', lang))} / ${esc(t('authPhone', lang))}</label>
            <input name="contact" type="text" required autocomplete="username">
            <label>${esc(t('authPassword', lang))}</label>
            <input name="password" type="password" required autocomplete="current-password">
            <div data-err></div>
            <button type="submit" class="btn--solid" style="margin-top:14px">${esc(t('authSubmitLogin', lang))} ›</button>
          </form>
          <p class="muted" style="margin-top:18px">${esc(t('authNoAccount', lang))} <a href="#/register">${esc(t('authRegisterHere', lang))}</a></p>
        </div>
      </section>
    </main>
    ${renderFooter()}
  `;
  $('#app').innerHTML = html;
  bindHeaderEvents();
  const form = $('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const res = await window.SSDB.loginRemote(fd.get('contact'), fd.get('password'));
    const err = $('[data-err]', form);
    if (res.ok) { afterAuthSuccess(); }
    else if (err) err.innerHTML = '<div class="notice">⚠ '+esc(t('authInvalid', lang))+'</div>';
  });
}

function renderRegisterLegacy() {
  const lang = L();
  const html = `
    ${renderHeader('home')}
    <main>
      <section class="section">
        <div class="auth-card">
          <h1 style="font-family:var(--serif);font-size:34px;margin:0 0 6px">${esc(t('authRegister', lang))}</h1>
          <p class="muted" style="margin:0 0 22px">${esc(t('authPromptSub', lang))}</p>
          <form id="reg-form" class="auth-form">
            <label>${esc(t('authName', lang))}</label>
            <input name="name" type="text" required>
            <label>${esc(t('authEmail', lang))}</label>
            <input name="email" type="email">
            <label>${esc(t('authPhone', lang))}</label>
            <input name="phone" type="tel">
            <label>${esc(t('authPassword', lang))}</label>
            <input name="password" type="password" required minlength="8" autocomplete="new-password">
            <label>${esc(t('authGrade', lang))}</label>
            <select name="grade">
              <option value="">—</option>
              ${['9','10','11','12'].map(g => '<option value="'+g+'">'+(lang==='zh'?g+' 年级':'Grade '+g)+'</option>').join('')}
            </select>
            <label>${esc(t('authSchool', lang))}</label>
            <input name="school" type="text">
            <div data-err></div>
            <button type="submit" class="btn--solid" style="margin-top:14px">${esc(t('authSubmitRegister', lang))} ›</button>
          </form>
          <p class="muted" style="margin-top:18px">${esc(t('authHaveAccount', lang))} <a href="#/login">${esc(t('authSignInHere', lang))}</a></p>
        </div>
      </section>
    </main>
    ${renderFooter()}
  `;
  $('#app').innerHTML = html;
  bindHeaderEvents();
  const form = $('#reg-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const input = {
      name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone'),
      password: fd.get('password'), grade: fd.get('grade'), school: fd.get('school'),
    };
    if (!input.email && !input.phone) {
      const err = $('[data-err]', form);
      if (err) err.innerHTML = '<div class="notice">⚠ '+esc(lang==='zh'?'请填写邮箱或手机号':'Please enter email or phone')+'</div>';
      return;
    }
    const res = await window.SSDB.registerRemote(input);
    const err = $('[data-err]', form);
    if (res.ok) { afterAuthSuccess(); }
    else if (err) err.innerHTML = '<div class="notice">⚠ '+esc(t('authExists', lang))+'</div>';
  });
}

function authCopy(lang) {
  return lang === 'zh' ? {
    eyebrow:'欢迎回来', signTitle:'继续探索适合你的夏校', createTitle:'创建你的学生档案',
    sub:'保存项目、提交真实体验，并让每一次选择更有依据。', google:'使用 Google 继续', divider:'或使用密码继续', email:'邮箱', phone:'手机号', password:'密码', name:'姓名', grade:'年级', school:'学校（可选）', emailPlaceholder:'name@example.com', phonePlaceholder:'请输入手机号', googleNote:'Google 登录将在完成 OAuth 配置后启用。', footSign:'还没有账号？', footCreate:'已有账号？', create:'创建账号', sign:'登录', forgot:'忘记密码？'
  } : {
    eyebrow:'Welcome', signTitle:'Find the summer program that fits.', createTitle:'Create your student profile',
    sub:'Save programs, share real experiences, and make every choice more informed.', google:'Continue with Google', divider:'or continue with password', email:'Email', phone:'Phone', password:'Password', name:'Your name', grade:'Grade', school:'School (optional)', emailPlaceholder:'name@example.com', phonePlaceholder:'Enter your phone number', googleNote:'Google sign-in will be available once OAuth is configured.', footSign:'New to RateMySummerSchool?', footCreate:'Already have an account?', create:'Create an account', sign:'Sign in', forgot:'Forgot password?'
  };
}
function authMethodControl(copy) {
  return `<div class="auth-method" role="tablist" aria-label="Authentication method"><button type="button" class="is-active" data-auth-method="email">${esc(copy.email)}</button><button type="button" data-auth-method="phone">${esc(copy.phone)}</button></div>`;
}
function localOwnerAccessMarkup(lang) {
  const availableHere = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!availableHere || typeof window.SSDB.localOwnerAccessRemote !== 'function') return '';
  const label = lang === 'zh' ? '以本机测试账号继续' : 'Continue as local test user';
  const note = location.protocol === 'file:'
    ? (lang === 'zh' ? '点击后将在本地服务器中打开' : 'Opens the working local-server version')
    : (lang === 'zh' ? '仅限此电脑的本地开发环境' : 'Available only on this computer');
  return `<div class="auth-local-access"><span>${esc(note)}</span><button type="button" class="auth-google" data-local-owner>${esc(label)} <span>→</span></button></div>`;
}
function bindLocalOwnerAccess(form, lang) {
  const button = $('[data-local-owner]');
  if (!button) return;
  button.addEventListener('click', async () => {
    if (location.protocol === 'file:') {
      location.href = 'http://127.0.0.1:4173/#/login';
      return;
    }
    button.disabled = true;
    const res = await window.SSDB.localOwnerAccessRemote();
    if (res.ok) { afterAuthSuccess(); return; }
    button.disabled = false;
    const err = $('[data-err]', form);
    if (err) err.innerHTML = '<div class="notice">⚠ '+esc(lang === 'zh' ? '本机测试账号暂时不可用，请重启本地服务器后再试。' : 'Local test access is unavailable. Restart the local server, then try again.')+'</div>';
  });
}
function bindAuthChoice(form, copy) {
  const input = $('#auth-contact', form), label = $('#contact-label', form);
  $$('[data-auth-method]', form).forEach(btn => btn.addEventListener('click', () => {
    const phone = btn.dataset.authMethod === 'phone';
    $$('[data-auth-method]', form).forEach(x => x.classList.toggle('is-active', x === btn));
    input.type = phone ? 'tel' : 'email'; input.placeholder = phone ? copy.phonePlaceholder : copy.emailPlaceholder;
    label.textContent = phone ? copy.phone : copy.email; input.value = ''; input.focus();
  }));
}
function authShell(lang, mode, formHTML) {
  const c = authCopy(lang), isRegister = mode === 'register';
  const title = isRegister ? c.createTitle : c.signTitle;
  const footer = isRegister ? `${esc(c.footCreate)} <a href="#/login">${esc(c.sign)} →</a>` : `${esc(c.footSign)} <a href="#/register">${esc(c.create)} →</a>`;
  return `${renderHeader('home')}<main class="auth-page"><section class="auth-shell">
    <aside class="auth-aside"><div class="auth-aside__mark">S</div><p class="auth-aside__eyebrow">RateMySummerSchool</p><h2>${esc(lang==='zh'?'每一段体验，都让下一个选择更明智。':'Every experience makes the next choice smarter.')}</h2><p>${esc(lang==='zh'?'来自真实参与者的反馈，让你在申请前看见项目的真实样貌。':'Real student perspectives help you see what a program is really like before applying.')}</p><div class="auth-aside__quote">“${esc(lang==='zh'?'让真实体验成为选择的一部分。':'Make real experience part of the decision.') }”</div></aside>
    <section class="auth-panel"><p class="auth-eyebrow">${esc(c.eyebrow)}</p><h1>${esc(title)}</h1><p class="auth-lede">${esc(c.sub)}</p><button class="auth-google" type="button" data-google-auth><span class="auth-google__g">G</span>${esc(c.google)}</button><div class="auth-divider"><span>${esc(c.divider)}</span></div>${formHTML}<p class="auth-foot">${footer}</p></section>
  </section></main>${renderFooter()}`;
}
function renderLogin() {
  const lang = L(), c = authCopy(lang);
  const formHTML = `<form id="login-form" class="auth-form auth-form--new">${authMethodControl(c)}<label id="contact-label">${esc(c.email)}</label><input id="auth-contact" name="contact" type="email" required autocomplete="username" placeholder="${esc(c.emailPlaceholder)}"><div class="auth-label-row"><label>${esc(c.password)}</label><a href="#" data-forgot>${esc(c.forgot)}</a></div><input name="password" type="password" required autocomplete="current-password" minlength="8"><div data-err></div><button type="submit" class="auth-submit">${esc(c.sign)} <span>→</span></button></form>${localOwnerAccessMarkup(lang)}`;
  $('#app').innerHTML = authShell(lang, 'login', formHTML); bindHeaderEvents();
  const form = $('#login-form'); bindAuthChoice(form, c);
  form.addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(form); const res = await window.SSDB.loginRemote(fd.get('contact'), fd.get('password')); const err = $('[data-err]', form); if (res.ok) afterAuthSuccess(); else if (err) err.innerHTML = '<div class="notice">⚠ '+esc(t('authInvalid', lang))+'</div>'; });
  $('[data-google-auth]')?.addEventListener('click', () => { const err = $('[data-err]', form); if (err) err.innerHTML = '<div class="notice">'+esc(c.googleNote)+'</div>'; });
  bindLocalOwnerAccess(form, lang);
}
function renderRegister() {
  const lang = L(), c = authCopy(lang);
  const formHTML = `<form id="reg-form" class="auth-form auth-form--new"><label>${esc(c.name)}</label><input name="name" required autocomplete="name" placeholder="${esc(lang==='zh'?'你的名字':'Your name')}">${authMethodControl(c)}<label id="contact-label">${esc(c.email)}</label><input id="auth-contact" name="contact" type="email" required autocomplete="username" placeholder="${esc(c.emailPlaceholder)}"><label>${esc(c.password)}</label><input name="password" type="password" required minlength="8" autocomplete="new-password"><div class="auth-split"><label>${esc(c.grade)}<select name="grade"><option value="">—</option>${['9','10','11','12'].map(g => '<option value="'+g+'">'+(lang==='zh'?g+' 年级':'Grade '+g)+'</option>').join('')}</select></label><label>${esc(c.school)}<input name="school" autocomplete="organization"></label></div><div data-err></div><button type="submit" class="auth-submit">${esc(c.create)} <span>→</span></button></form>${localOwnerAccessMarkup(lang)}`;
  $('#app').innerHTML = authShell(lang, 'register', formHTML); bindHeaderEvents();
  const form = $('#reg-form'); bindAuthChoice(form, c);
  form.addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(form), contact = String(fd.get('contact') || ''); const byPhone = $('#auth-contact', form).type === 'tel'; const input = { name:fd.get('name'), email:byPhone ? '' : contact, phone:byPhone ? contact : '', password:fd.get('password'), grade:fd.get('grade'), school:fd.get('school') }; const res = await window.SSDB.registerRemote(input); const err = $('[data-err]', form); if (res.ok) afterAuthSuccess(); else if (err) err.innerHTML = '<div class="notice">⚠ '+esc(res.error === 'Account already exists' ? t('authExists', lang) : (lang==='zh'?'请检查信息后重试':'Please check your details and try again.'))+'</div>'; });
  $('[data-google-auth]')?.addEventListener('click', () => { const err = $('[data-err]', form); if (err) err.innerHTML = '<div class="notice">'+esc(c.googleNote)+'</div>'; });
  bindLocalOwnerAccess(form, lang);
}

function renderAccount(refresh = true) {
  const lang = L(), zh = lang === 'zh', db = window.SSDB;
  const u = db.currentUser();
  if (!u) {
    $('#app').innerHTML = renderHeader('account') + '<main class="account-page"><p class="account-loading">' + (zh ? '正在打开你的账户…' : 'Opening your account…') + '</p></main>' + renderFooter();
    bindHeaderEvents();
    db.hydrateRemote().then(() => {
      if (location.hash !== '#/account') return;
      if (db.currentUser()) renderAccount(false);
      else {
        State.accountReturnTo = true;
        location.hash = '#/login';
      }
    });
    return;
  }
  const account = db.getAccountSnapshot() || { user:u, savedPrograms:[], matchmaker:null, reviews:[] };
  // Keep the current browser list in the view as well as the account
  // snapshot, so a just-saved program is visible immediately.
  const savedIds = [...new Set([...(account.savedPrograms || []), ...db.getList()])];
  // Rankings saves IDs from the live catalogue. Resolve them through the
  // same catalogue here rather than the legacy static PROGRAMS array, so
  // every saved ranking entry has a corresponding Account card.
  const saved = savedIds.map(id => db.getProgram(id)).filter(Boolean);
  const myReviews = account.reviews || [];
  const profile = account.matchmaker?.profile;
  const translateTag = value => zh ? (window.SS_PROGRAM_DISCOVERY?.translations?.[value] || value) : value;
  const tagList = values => values?.length ? values.map(v => '<span class="account-tag">' + esc(translateTag(v)) + '</span>').join('') : '<span class="account-muted">' + (zh ? '未选择' : 'Not selected') + '</span>';
  const draft = State.survey?.ownerId === u.id && !State.survey?.doneRounds?.every(Boolean) ? State.survey : null;
  const reviewProgram = id => db.getProgram(id);
  const html = `
    ${renderHeader('account')}
    <main class="account-page">
      <header class="account-hero">
        <div><p class="account-eyebrow">${zh?'个人中心':'YOUR SPACE'}</p><h1>${zh?'你好，':'Hi, '}${esc(u.name)}</h1><p>${zh?'在这里继续探索项目，并管理你保存的信息。':'Pick up where you left off and manage what you have saved.'}</p></div>
        <a class="account-primary" href="#/pick">${zh?'探索夏校':'Explore programs'} <span aria-hidden="true">→</span></a>
      </header>
      <div class="account-section-grid">
        <section class="account-panel" id="saved-programs"><div class="account-panel__heading"><div><p class="account-eyebrow">${zh?'你的清单':'YOUR SHORTLIST'}</p><h2>${zh?'已收藏的项目':'Saved programs'}</h2></div><span class="account-count">${saved.length}</span></div>
          ${saved.length ? '<div class="account-saved-list">' + saved.map(p => `<article class="account-saved-item"><div><h3><a href="#/program/${esc(p.id)}">${esc(pickL(p.name))}</a></h3><p>${esc(pickL(p.university || p.host || {en:'',zh:''}))}</p></div><button type="button" class="account-text-button" data-remove-saved="${esc(p.id)}">${zh?'移出清单':'Remove'}</button></article>`).join('') + '</div>' : `<p class="account-empty">${zh?'还没有收藏项目。看到感兴趣的夏校时，点击收藏即可在这里找到。':'No saved programs yet. Save a program while browsing to find it here.'}</p>`}
          <a class="account-inline-link" href="#/pick">${zh?'浏览项目':'Browse programs'} →</a>
        </section>
        <section class="account-panel" id="saved-matchmaker"><div class="account-panel__heading"><div><p class="account-eyebrow">${zh?'你的偏好':'YOUR PREFERENCES'}</p><h2>AI Matchmaker</h2></div></div>
          ${profile ? `<div class="account-preference"><strong>${zh?'学什么':'What you study'}</strong><div class="account-tags">${tagList(profile.subjects)}</div></div><div class="account-preference"><strong>${zh?'怎么学':'How you learn'}</strong><div class="account-tags">${tagList(profile.methods)}</div></div><div class="account-preference account-preference--meta"><span>${zh?'暑期年份':'Summer year'}: ${esc(profile.year || '—')}</span><span>${zh?'预算':'Budget'}: ${profile.budget == null ? (zh?'未设置':'Not set') : '$' + esc(Number(profile.budget).toLocaleString())}</span></div><a class="account-inline-link" href="#/matchmaker/review">${zh?'查看或修改偏好':'Review or edit preferences'} →</a>` : `<p class="account-empty">${zh?'还没有保存匹配偏好。完成问卷后，你可以在这里继续。':'No Matchmaker preferences saved yet. Your answers will appear here after you start.'}</p><a class="account-inline-link" href="#/matchmaker">${zh?'开始匹配':'Start Matchmaker'} →</a>`}
          <p class="account-private-note">${zh?'仅登录你的账户后可查看这些偏好。':'These preferences are visible only in your signed-in account.'}</p>
        </section>
      </div>
      <section class="account-panel account-panel--reviews" id="my-reviews"><div class="account-panel__heading"><div><p class="account-eyebrow">${zh?'你的声音':'YOUR VOICE'}</p><h2>${zh?'我的点评':'My reviews'}</h2></div><span class="account-count">${myReviews.length}</span></div>
        ${draft ? `<div class="account-draft"><div><strong>${zh?'未完成的问卷':'Unfinished questionnaire'}</strong><p>${esc(pickL(reviewProgram(draft.programId)?.name || {en:draft.programId,zh:draft.programId}))}</p></div><a class="account-inline-link" href="#/survey/${esc(draft.programId)}">${zh?'继续填写':'Continue'} →</a></div>` : ''}
        ${myReviews.length ? '<div class="account-review-list">' + myReviews.map(r => { const p = reviewProgram(r.programId); return `<article class="account-review"><div class="account-review__top"><div><h3><a href="#/program/${esc(r.programId)}">${esc(p ? pickL(p.name) : r.programId)}</a></h3><span class="account-status">${zh?'已发布':'Published'}</span></div><span class="account-stars" aria-label="${esc(r.stars)} out of 5 stars">${'★'.repeat(Math.min(5,Math.max(0,Number(r.stars)||0)))}${'☆'.repeat(5-Math.min(5,Math.max(0,Number(r.stars)||0)))}</span></div><p>${esc(r.text || '')}</p><div class="account-review__bottom"><span>${esc(r.who || '')}</span><button type="button" class="account-text-button" data-del-review="${esc(r.id)}">${zh?'删除点评':'Delete review'}</button></div></article>`; }).join('') + '</div>' : `<p class="account-empty">${zh?'还没有发布点评。你参加过的项目，可能正是其他学生想了解的。':'No published reviews yet. Your experience could help the next student decide.'}</p>`}
        <a class="account-inline-link" href="#/pick">${zh?'选择项目并写点评':'Choose a program to review'} →</a>
      </section>
      <section class="account-panel account-panel--privacy" id="account-privacy"><div class="account-panel__heading"><div><p class="account-eyebrow">${zh?'设置与控制':'SETTINGS & CONTROLS'}</p><h2>${zh?'账户与隐私':'Account & privacy'}</h2></div></div>
        <div class="account-privacy-grid"><div class="account-visibility account-visibility--public"><h3>${zh?'点评中公开显示':'Public with your review'}</h3><p>${zh?'显示名称、评分、点评正文，以及你在点评中填写的身份或参加信息。请勿在点评正文中写入不想公开的个人信息。':'Your display name, rating, review text, and any attendance details you write in a review. Avoid including personal details in review text that you do not want public.'}</p></div><div class="account-visibility"><h3>${zh?'仅你的账户可见':'Private to your account'}</h3><p>${zh?'登录邮箱或手机号、年级、学校、收藏清单和 Matchmaker 偏好。':'Your sign-in email or phone, grade, school, saved programs, and Matchmaker preferences.'}</p></div></div>
        <form id="account-details-form" class="account-details-form"><h3>${zh?'个人资料':'Profile details'}</h3><div class="account-fields"><label>${zh?'显示名称（用于点评）':'Display name (shown on reviews)'}<input name="name" value="${esc(u.name)}" required maxlength="80" autocomplete="name"></label><label>${zh?'登录邮箱或手机号（仅你可见）':'Sign-in email or phone (private)'}<input value="${esc(u.email || u.phone || '')}" disabled></label><label>${zh?'年级（仅你可见）':'Grade (private)'}<input name="grade" value="${esc(u.grade || '')}" maxlength="20"></label><label>${zh?'学校（仅你可见）':'School (private)'}<input name="school" value="${esc(u.school || '')}" maxlength="120" autocomplete="organization"></label></div><div class="account-form-actions"><button type="submit" class="account-primary">${zh?'保存资料':'Save details'}</button><span id="account-details-status" role="status"></span></div></form>
        <div class="account-control"><div><h3>${zh?'退出登录':'Sign out'}</h3><p>${zh?'在共享设备上使用后，建议退出登录。':'Sign out when you finish on a shared device.'}</p></div><button type="button" class="account-secondary" id="logout">${zh?'退出登录':'Sign out'}</button></div>
        <details class="account-danger"><summary>${zh?'删除账户和我提交的内容':'Delete account and my contributions'}</summary><p>${zh?'这会永久删除账户、点评、问卷回答、收藏和 Matchmaker 偏好。此操作无法撤销。请输入 DELETE 以确认。':'This permanently deletes your account, reviews, questionnaire responses, saved programs, and Matchmaker preferences. It cannot be undone. Type DELETE to confirm.'}</p><label>${zh?'确认文字':'Confirmation'}<input id="account-delete-confirm" autocomplete="off" placeholder="DELETE"></label><button type="button" id="account-delete" class="account-delete-button" disabled>${zh?'永久删除账户':'Permanently delete account'}</button><p id="account-delete-status" role="status"></p></details>
      </section>
    </main>${renderFooter()}`;
  $('#app').innerHTML = html;
  bindHeaderEvents();
  const status = (selector, message) => { const el = $(selector); if (el) el.textContent = message; };
  $('#account-details-form')?.addEventListener('submit', async e => {
    e.preventDefault(); const form = e.currentTarget, fd = new FormData(form);
    const result = await db.updateAccount({ name:String(fd.get('name')||'').trim(), grade:String(fd.get('grade')||'').trim(), school:String(fd.get('school')||'').trim() });
    if (result.ok) { renderAccount(false); status('#account-details-status', zh?'已保存':'Saved'); }
    else status('#account-details-status', zh?'保存失败，请重试。':'Could not save. Please try again.');
  });
  $$('[data-remove-saved]').forEach(button => button.addEventListener('click', () => { db.removeFromList(button.dataset.removeSaved); renderAccount(false); }));
  $$('[data-del-review]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm(zh?'确定永久删除这条点评吗？':'Permanently delete this review?')) return;
    const result = await db.deleteOwnedReview(button.dataset.delReview);
    if (result.ok) renderAccount(false); else alert(zh?'删除失败，请重试。':'Could not delete the review. Please try again.');
  }));
  $('#logout')?.addEventListener('click', async () => { await db.logoutRemote(); location.hash = '#/'; render(); });
  $('#account-delete-confirm')?.addEventListener('input', e => { $('#account-delete').disabled = e.target.value !== 'DELETE'; });
  $('#account-delete')?.addEventListener('click', async () => {
    if ($('#account-delete-confirm').value !== 'DELETE') return;
    if (!confirm(zh?'最后确认：永久删除账户和你提交的所有内容？':'Final confirmation: permanently delete your account and all your contributions?')) return;
    const result = await db.deleteAccountRemote();
    if (result.ok) {
      window.SSMatchmakerUI?.clearForUser(u.id);
      if (State.survey?.ownerId === u.id) { State.survey = null; save(); }
      location.hash = '#/'; render();
    } else status('#account-delete-status', zh?'删除失败，请重试。':'Could not delete the account. Please try again.');
  });
  if (refresh) db.refreshAccount().then(result => { if (result.ok && location.hash === '#/account' && db.currentUser()?.id === u.id) renderAccount(false); });
}

/* ============================ ROUTER ================================= */

function parseHash() {
  const h = (location.hash || '#/').slice(1);
  const parts = h.split('/').filter(Boolean);
  if (parts.length === 0) return { name:'home' };
  if (parts[0] === 'pick')    return { name:'pick',    filter: parts[1] || 'all' };
  if (parts[0] === 'program' && parts[1] && parts[2] === 'academics') return { name:'program-academics', id: parts[1] };
  if (parts[0] === 'program' && parts[1] && parts[2] === 'reviews') return { name:'program-academic-reviews', id: parts[1] };
  if (parts[0] === 'program' && parts[1] && parts[2] === 'students')  return { name:'program-students',  id: parts[1] };
  if (parts[0] === 'program' && parts[1] && parts[2] === 'campus')    return { name:'program-campus',    id: parts[1] };
  if (parts[0] === 'program' && parts[1] && parts[2] === 'outcomes')  return { name:'program-outcomes',  id: parts[1] };
  if (parts[0] === 'program' && parts[1]) return { name:'program', id: parts[1] };
  if (parts[0] === 'survey') return { name:'survey', id: parts[1] || null };
  if (parts[0] === 'rankings') return { name:'rankings', cat: parts[1] || 'overall', page: parseInt(parts[2], 10) || 1 };
  if (parts[0] === 'matchmaker' && parts[1] === 'results') return { name:'matchmaker-results' };
  if (parts[0] === 'matchmaker') return { name:'matchmaker' };
  if (parts[0] === 'login')    return { name:'login' };
  if (parts[0] === 'register') return { name:'register' };
  if (parts[0] === 'account')  return { name:'account' };
  if (parts[0] === 'contributors') return { name:'contributors' };
  return { name:'home' };
}

function render() {
  const r = parseHash();
  State.route = r;
  /* Anyone may browse and start a review. Sign-in is only requested after
     Round 1 (see submitRound → renderSaveGate) so we don't block first. */
  if (r.name === 'home')       return renderLanding();
  if (r.name === 'pick')       return renderPicker(r.filter);
  if (r.name === 'program')    return renderProgram(r.id);
  if (r.name === 'program-academics') return renderProgramAcademics(r.id);
  if (r.name === 'program-academic-reviews') return renderProgramAcademicReviews(r.id);
  if (r.name === 'program-students')  return renderProgramStudents(r.id);
  if (r.name === 'program-campus')    return renderProgramCampus(r.id);
  if (r.name === 'program-outcomes')  return renderProgramOutcomes(r.id);
  if (r.name === 'survey')     return renderSurvey(r.id);
  if (r.name === 'rankings')   return renderRankings(r.cat, r.page);
  if (r.name === 'matchmaker') return renderMatchmaker();
  if (r.name === 'matchmaker-results') return renderMatchmakerResults();
  if (r.name === 'login')      return renderLogin();
  if (r.name === 'register')   return renderRegister();
  if (r.name === 'account')    return renderAccount();
  if (r.name === 'contributors') return renderContributors();
}

const PROGRAM_DETAIL_ROUTES = new Set([
  'program', 'program-academics', 'program-academic-reviews', 'program-students',
  'program-campus', 'program-outcomes'
]);

function renderNavigation() {
  render();
  if (State.route?.name === 'account') {
    window.scrollTo(0, 0);
    requestAnimationFrame(() => window.scrollTo(0, 0));
    return;
  }
  if (!State.route || !PROGRAM_DETAIL_ROUTES.has(State.route.name)) return;
  const navigatedHash = location.hash;
  window.scrollTo(0, 0);
  requestAnimationFrame(() => {
    if (location.hash === navigatedHash) window.scrollTo(0, 0);
  });
}

window.addEventListener('hashchange', renderNavigation);

/* ============================ BOOT =================================== */
document.documentElement.lang = (L() === 'zh') ? 'zh' : 'en';
renderNavigation();
// When the site runs through server.js, replace the empty local cache with
// the shared SQLite records and redraw the current route. File previews keep
// working offline, but never fabricate survey results.
if (window.SSDB && window.SSDB.hydrateRemote) {
  window.SSDB.hydrateRemote().then(function (loaded) { if (loaded) render(); });
}

})();
