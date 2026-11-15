const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/Users/yafei.wu/.workbuddy-ai/binaries/node/workspace/node_modules/jsdom');

const root = '/Users/yafei.wu/WorkBuddy AI/2026-08-29-19-51-47/summer-school-platform';
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'http://127.0.0.1:8765/',
  pretendToBeVisual: true,
  storageQuota: 10000000,
});
const { window } = dom;
window.onerror = (msg, src, line, col, err) => errors.push('onerror: ' + msg + ' @ ' + line + ':' + col + ' ' + (err && err.message || ''));

const files = ['assets/js/i18n.js', 'assets/js/data.js', 'assets/js/db.js', 'assets/js/experience.js', 'assets/js/app.js'];
for (const f of files) {
  const code = fs.readFileSync(path.join(root, f), 'utf8');
  try { window.eval(code); }
  catch (e) { errors.push('THROW in ' + f + ': ' + (e && e.stack || e)); }
}

// Need a registered user so /survey won't redirect to /login
window.SSDB.registerUser({ name:'Smoke', email:'s@e.com', password:'pw', grade:'11', school:'X' });

const routes = ['#/', '#/pick', '#/pick/pre', '#/pick/all',
  '#/program/yygs', '#/program/yygs/academics', '#/program/yygs/reviews', '#/program/yygs/students',
  '#/program/yygs/campus', '#/program/yygs/outcomes',
  '#/survey/yygs', '#/rankings', '#/rankings/overall', '#/rankings/research', '#/rankings/value', '#/rankings/local', '#/rankings/rising/1', '#/rankings/rising/2', '#/rankings/99', '#/matchmaker', '#/compare', '#/login', '#/register', '#/account'];
for (const r of routes) {
  try {
    window.location.hash = r;
    window.dispatchEvent(new window.Event('hashchange'));
    const appHtml = window.document.getElementById('app').innerHTML;
    console.log('route', r, '-> app length =', appHtml.length);
  } catch (e) {
    errors.push('RENDER FAIL ' + r + ': ' + (e && e.stack || e));
  }
}

// Verify the "Best Summer Programs" list renders 10 cards/page with correct ranks + pagination
function go(hash) { window.location.hash = hash; window.dispatchEvent(new window.Event('hashchange')); return window.document; }
function checkRankings(hash, expectCount, expectFirstEyebrow) {
  const doc = go(hash);
  const cards = doc.querySelectorAll('.best-card');
  const eyebrow = doc.querySelector('.best-card__eyebrow');
  const tabs = doc.querySelectorAll('.rank-tab');
  const activeTab = doc.querySelector('.rank-tab.is-on');
  const okCount = cards.length === expectCount;
  const okEyebrow = !expectFirstEyebrow || (eyebrow && eyebrow.textContent.trim().indexOf(expectFirstEyebrow) === 0);
  console.log(hash + ': cards=' + cards.length + '/' + expectCount + ' ' + (okCount ? 'OK' : 'FAIL')
    + ' | tabs=' + tabs.length + ' | active=' + (activeTab ? activeTab.textContent.trim() : 'none')
    + ' | eyebrow=' + (eyebrow ? JSON.stringify(eyebrow.textContent.trim()) : 'none')
    + (okEyebrow ? ' OK' : ' FAIL'));
  if (!okCount || !okEyebrow || tabs.length !== 8) errors.push('RANKINGS CHECK FAIL ' + hash);
}
checkRankings('#/rankings', 10, '#1 BEST SUMMER PROGRAM IN AMERICA');
checkRankings('#/rankings/overall/2', 10, '#11 BEST SUMMER PROGRAM IN AMERICA');
checkRankings('#/rankings/research', 10, '#1 BEST SUMMER PROGRAM IN AMERICA FOR RESEARCH');
checkRankings('#/rankings/value', 10, '#1 BEST VALUE SUMMER PROGRAM IN AMERICA');
checkRankings('#/rankings/local', 10, '#1 BEST SUMMER PROGRAM IN AMERICA FOR LOCAL AREA');
checkRankings('#/rankings/rising/1', 10, '#1 RISING SUMMER PROGRAM IN AMERICA');
checkRankings('#/rankings/rising/2', 10, '#11 RISING SUMMER PROGRAM IN AMERICA');
checkRankings('#/rankings/overall/99', 10, '#91');   // out-of-range clamps to last page
const total = window.SSDB.getPrograms().length;
console.log('total programs =', total, '-> pages =', Math.ceil(total / 10));

// Verify program overview: old modules still render and the new decision brief
// keeps official curriculum separate from verified-feedback status.
go('#/program/yygs');
const pDoc = window.document;
const narrow = pDoc.querySelectorAll('.profile-section--narrow').length;
const grids  = pDoc.querySelectorAll('.survey-grid').length;
const experiencePreviews = pDoc.querySelectorAll('.experience-preview');
const subs   = pDoc.querySelectorAll('.mod-subtitle').length; // should be 0 — duplicate removed
const wb     = pDoc.querySelectorAll('.word-bubble').length;
const stars  = pDoc.querySelectorAll('.stars-precise').length;
const overviewBrief = pDoc.querySelector('.overview-academic-brief');
const overviewFacts = pDoc.querySelectorAll('.overview-academic-brief__facts > div');
const feedbackState = pDoc.querySelector('.academic-feedback-state');
const officialOverviewCards = pDoc.querySelectorAll('.program-official-facts .academic-snapshot-card');
const officialOverviewLinks = pDoc.querySelectorAll('.program-official-facts a[href^="https://globalscholars.yale.edu"]');
const officialAdmissionsCards = pDoc.querySelectorAll('.admissions-official-grid .academic-snapshot-card');
const officialAdmissionsLinks = pDoc.querySelectorAll('.admissions-official-grid a[href^="https://"]');
const academicPreviewRatings = pDoc.querySelectorAll('.academic-module-preview__ratings > div');
const acceptanceDisclaimer = pDoc.querySelector('.official-fact-disclaimer');
const writeReviewLink = pDoc.querySelector('.write-review-card a[href="#/survey/yygs"]');
const studentIntroFacts = pDoc.querySelectorAll('.student-life-intro__facts .info-item');
const studentReportCard = pDoc.querySelector('.student-life-report');
console.log('program/yygs: narrow-sections=' + narrow + ' (expect ≥4) ' + (narrow >= 4 ? 'OK' : 'FAIL')
  + ' | experience-previews=' + experiencePreviews.length + ' (expect 2)'
  + ' | no-dup-subtitle=' + (subs === 0 ? 'OK' : 'FAIL ('+subs+')')
  + ' | removed-academic-brief=' + (!overviewBrief ? 'OK' : 'FAIL')
  + ' | feedback-state=' + (feedbackState ? 'OK' : 'FAIL')
  + ' | official-overview=' + officialOverviewCards.length + ' cards/' + officialOverviewLinks.length + ' links'
  + ' | official-admissions=' + officialAdmissionsCards.length + ' cards/' + officialAdmissionsLinks.length + ' links'
  + ' | academic-preview-ratings=' + academicPreviewRatings.length + ' (expect 3)'
  + ' | student-life-intro=' + studentIntroFacts.length + ' facts/' + (studentReportCard ? 'report card' : 'MISSING')
  + ' | legacy-word-bubbles=' + wb + ' (expect 0)'
  + ' | precise-stars=' + stars + ' (expect ≥2)');
if (narrow < 4 || experiencePreviews.length !== 2 || subs !== 0 || overviewBrief || overviewFacts.length !== 0 || !feedbackState
    || officialOverviewCards.length !== 4 || officialOverviewLinks.length !== 5
    || officialAdmissionsCards.length !== 2 || officialAdmissionsLinks.length !== 7
    || academicPreviewRatings.length !== 3 || studentIntroFacts.length !== 2 || !studentReportCard
    || !/YYGS student life reports/.test(studentReportCard.textContent)
    || !acceptanceDisclaimer || !writeReviewLink) errors.push('PROGRAM PAGE LAYOUT FAIL');

// Verify questionnaire multi-select (activities question)
const Q = window.SSDATA.QUESTIONNAIRE;
// expose State from app.js — we can't because it's inside an IIFE.
// Instead, navigate to activities q via real flow: walk the survey by clicking next after each answer
// (simpler: just directly trigger renderQuestionBody via renderSurvey)
window.location.hash = '#/survey/yygs';
window.dispatchEvent(new window.Event('hashchange'));
const card = window.document.querySelector('.survey__card');
console.log('first card qkey=', card ? card.dataset.qkey : '(no card)');

// Verify the matchmaker results page renders the loader + skeletons
go('#/matchmaker/results');
const mr = window.document;
const overlay = mr.querySelector('.mm-overlay');
const loaderMsg = mr.querySelector('.mm-loader__msg');
const loaderFact = mr.querySelector('.mm-loader__fact');
const narrative = mr.querySelector('.mm-narrative');
const recsCount = mr.querySelectorAll('.mm-rec').length;
const mmOk = !!(overlay && loaderMsg && loaderFact && narrative);
console.log('matchmaker results: overlay=' + (overlay ? 'OK' : 'FAIL')
  + ' | loader-msg=' + (loaderMsg ? loaderMsg.textContent.trim().slice(0, 40) : 'FAIL')
  + ' | narrative-skeleton=' + (narrative ? 'OK' : 'FAIL')
  + ' | rec-cards=' + recsCount + ' (still 0, stream hasn\'t started in test)');
if (!mmOk) errors.push('MATCHMAKER RESULTS SKELETON FAIL');

// Verify best-card: no star-precise element + has photo + has 2-col layout
go('#/rankings/overall');
const rc = window.document;
const starsInCard = rc.querySelectorAll('.best-card .stars-precise').length;
const photosInCard = rc.querySelectorAll('.best-card__photo').length;
const cardsCount = rc.querySelectorAll('.best-card').length;
console.log('rankings: cards=' + cardsCount + ' | stars-in-card=' + starsInCard + ' (expect 0) '
  + (starsInCard === 0 ? 'OK' : 'FAIL')
  + ' | photos=' + photosInCard + ' (expect ' + cardsCount + ') '
  + (photosInCard === cardsCount ? 'OK' : 'FAIL'));
if (starsInCard !== 0 || photosInCard !== cardsCount) errors.push('BEST CARD FAIL');

// Verify the new header CSS fixes the layout in EN + the picker title in ZH.
// (JSDOM doesn't load stylesheets, so we check the rules in the CSS source.)
const css = fs.readFileSync(path.join(root, 'assets/css/styles.css'), 'utf8');
const headerChecks = {
  brandNameNowrap: /\.brand__name\s*\{[^}]*white-space:\s*nowrap/.test(css),
  authAreaNowrap: /\.auth-area\s*\{[^}]*white-space:\s*nowrap/.test(css),
  langPills:      rc.querySelectorAll('.lang-switch button').length,
  brandFlex0:     /\.brand\s*\{[^}]*flex:\s*0 0 auto/.test(css),
};
const zhPick = window.SSI18N && window.SSI18N.STRINGS && window.SSI18N.STRINGS.zh
  && window.SSI18N.STRINGS.zh.pickerTitle;
console.log('header: brand-name nowrap=' + (headerChecks.brandNameNowrap ? 'OK' : 'FAIL')
  + ' | auth-area nowrap=' + (headerChecks.authAreaNowrap ? 'OK' : 'FAIL')
  + ' | lang-buttons=' + headerChecks.langPills + ' (expect 2) '
  + (headerChecks.langPills === 2 ? 'OK' : 'FAIL')
  + ' | brand-flex-0-0-auto=' + (headerChecks.brandFlex0 ? 'OK' : 'FAIL'));
console.log('zh pickerTitle =', JSON.stringify(zhPick), zhPick === '找到最适合你的项目' ? 'OK' : 'FAIL');
if (!headerChecks.brandNameNowrap || !headerChecks.authAreaNowrap
  || headerChecks.langPills !== 2 || !headerChecks.brandFlex0) errors.push('HEADER LAYOUT FAIL');
if (zhPick !== '找到最适合你的项目') errors.push('ZH PICKER TITLE FAIL');

// Verify the matchmaker loader has NO Skip button and the narrative has
// NO blinking caret.
go('#/matchmaker/results');
const mr2 = window.document;
const overlay2 = mr2.querySelector('.mm-overlay');
const skipBtn = overlay2 && overlay2.querySelector('.mm-loader__skip, [id="mm-skip"]');
const caretRule = /\.mm-caret\s*\{[^}]*animation:\s*mm-blink/.test(css);
const caretDom = mr2.querySelector('.mm-caret');
console.log('matchmaker: no-skip-btn=' + (!skipBtn ? 'OK' : 'FAIL')
  + ' | no-caret-blink-css=' + (!caretRule ? 'OK' : 'FAIL')
  + ' | no-caret-dom=' + (!caretDom ? 'OK' : 'FAIL'));
if (skipBtn || caretRule || caretDom) errors.push('MATCHMAKER ANIM FIX FAIL');

// ---- YYGS Academics: official curriculum map plus honest no-data state ----
const adoc = go('#/program/yygs/academics');
const officialProfile = adoc.querySelector('.academic-official-profile');
const snapshotCards = adoc.querySelectorAll('.academic-snapshot-card');
const snapshotNotes = adoc.querySelectorAll('.academic-snapshot-card > span');
const experienceCards = adoc.querySelectorAll('.academic-experience-card');
const formatGroups = adoc.querySelectorAll('.academic-format-group');
const formatItems = adoc.querySelectorAll('.academic-format-item');
const formatTitle = adoc.querySelector('.academic-format-map .scalar-section__title');
const formatCount = adoc.querySelector('.academic-format-map__count');
const formatStatuses = adoc.querySelectorAll('.academic-format-item__status');
const sourceLink = adoc.querySelector('.academic-official-profile__source');
const singleColumn = adoc.querySelector('.report-page__inner--single');
const detailNav = adoc.querySelector('.report-page__inner--single .report-nav');
const fakePercentages = Array.from(adoc.querySelectorAll('.say-item__pct')).some(node => node.textContent.trim() === '0%');
const relatedReviewLinks = adoc.querySelectorAll('a[href="#/program/yygs/reviews"]');
const snapshotTrackLinks = adoc.querySelectorAll('.academic-snapshot-card__links a');
const verifiedAssessment = adoc.querySelector('.academic-snapshot-card__verified');
console.log('academics: official-profile=' + (officialProfile ? 'OK' : 'MISSING')
  + ' | snapshot-cards=' + snapshotCards.length + ' (expect 4)'
  + ' | snapshot-notes=' + snapshotNotes.length + ' (expect 0)'
  + ' | experience-cards=' + experienceCards.length + ' (expect 6)'
  + ' | format-groups=' + formatGroups.length + ' (expect 3)'
  + ' | format-items=' + formatItems.length + ' (expect 10)'
  + ' | format-title=' + (formatTitle ? formatTitle.textContent.trim() : 'MISSING')
  + ' | no-count=' + (!formatCount ? 'OK' : 'FAIL')
  + ' | no-status-column=' + (formatStatuses.length === 0 ? 'OK' : 'FAIL')
  + ' | single-column=' + (singleColumn && !detailNav ? 'OK' : 'FAIL')
  + ' | official-source=' + (sourceLink ? 'OK' : 'FAIL')
  + ' | related-review-links=' + relatedReviewLinks.length + ' (expect 2)'
  + ' | linked-deadlines-and-tracks=' + snapshotTrackLinks.length + ' (expect 5)'
  + ' | no-extra-verification-label=' + (!verifiedAssessment ? 'OK' : 'FAIL')
  + ' | fake-0%-claims=' + (fakePercentages ? 'FAIL' : 'OK'));
if (!officialProfile || snapshotCards.length !== 4 || snapshotNotes.length !== 0
    || experienceCards.length !== 6 || formatGroups.length !== 3 || formatItems.length !== 10
    || !formatTitle || formatTitle.textContent.trim() !== 'Academic Activities Map'
    || formatCount || formatStatuses.length || !singleColumn || detailNav || !sourceLink
    || relatedReviewLinks.length !== 2 || snapshotTrackLinks.length !== 5 || verifiedAssessment || fakePercentages) {
  errors.push('ACADEMICS DETAIL REDESIGN FAIL');
}

const reviewsDoc = go('#/program/yygs/reviews');
if (!reviewsDoc.querySelector('.academic-related-review-page') || !reviewsDoc.querySelector('.report-page__inner--single')) {
  errors.push('ACADEMIC RELATED REVIEWS ROUTE FAIL');
}

// ---- Student Life: revised community-questionnaire presentation ----
const studentDoc = go('#/program/yygs/students');
const studentSections = studentDoc.querySelectorAll('.student-life-section');
const studentHeadings = Array.from(studentDoc.querySelectorAll('.student-life-section__head h2')).map(node => node.textContent.trim());
const studentMetrics = studentDoc.querySelectorAll('.student-life-overview .student-life-metric');
const studentEmptyStates = studentDoc.querySelectorAll('.student-life-empty');
const studentSingleColumn = studentDoc.querySelector('.report-page__inner--single');
const mixedHousingBlocks = studentDoc.querySelectorAll('[data-qkey="housing_experience"], [data-qkey="dorm_staff"]');
console.log('student-life: sections=' + studentSections.length + ' (expect 4)'
  + ' | metrics=' + studentMetrics.length + ' (expect 4)'
  + ' | honest-empty-states=' + studentEmptyStates.length
  + ' | single-column=' + (studentSingleColumn ? 'OK' : 'FAIL')
  + ' | no-housing-mix=' + (mixedHousingBlocks.length === 0 ? 'OK' : 'FAIL'));
if (studentSections.length !== 4 || studentMetrics.length !== 4 || !studentSingleColumn || mixedHousingBlocks.length
    || studentHeadings[0] !== 'Student Life Overview' || studentHeadings[2] !== 'Activities'
    || studentHeadings[3] !== 'Free Time & Social Activities') {
  errors.push('STUDENT LIFE REDESIGN FAIL');
}

// Regression: survey drafts saved before the database upgrade may store a
// word-pick answer as a raw array. It must not break an entire profile.
try {
  window.SSDB.recordRound('brown-pre', 'r1', { three_words: ['Rigorous', 'Hands-on', 'Fast-paced'] });
  go('#/program/brown-pre');
  console.log('legacy word-pick aggregate: OK');
} catch (e) {
  errors.push('LEGACY WORD-PICK AGGREGATE FAIL: ' + (e && e.message || e));
}

// ---- Compare page: seed two programs, verify derived rows + AI block ----
const cmpProgs = window.SSDB.getPrograms().slice(0, 2).map(p => p.id);
window.localStorage.setItem('ss.compare.ids.v1', JSON.stringify(cmpProgs));
const cdoc = go('#/compare');
const cmpCols = cdoc.querySelectorAll('.cmp-col');
const cmpRows = cdoc.querySelectorAll('.cmp-table tbody tr');
const cmpBody = cdoc.querySelector('#cmp-ai-body');
const cmpChips = cdoc.querySelectorAll('.cmp-chip');
const cmpPicker = cdoc.querySelector('#cmp-q');
const firstRowLabel = cdoc.querySelector('.cmp-table tbody th');
const rowLabels = Array.from(cdoc.querySelectorAll('.cmp-table tbody th')).map(th => th.textContent.trim());
console.log('compare: cols=' + cmpCols.length + ' (expect 2) | rows=' + cmpRows.length + ' (expect 7)'
  + ' | chips=' + cmpChips.length + ' | picker=' + (cmpPicker ? 'OK' : 'MISSING')
  + ' | ai-body=' + (cmpBody ? 'OK' : 'MISSING'));
console.log('compare row labels:', rowLabels.join(' / '));
if (cmpCols.length !== 2 || cmpRows.length !== 7 || !cmpBody || !cmpPicker || cmpChips.length !== 2) {
  errors.push('COMPARE REDESIGN FAIL');
}
// acceptance / early / regular rows must not be all em-dashes
const accCell = cdoc.querySelectorAll('.cmp-table tbody tr')[0].querySelectorAll('td')[0];
if (!accCell || accCell.textContent.trim() === '—') errors.push('COMPARE ACCEPTANCE ROW EMPTY');

console.log('\n=== ERRORS (' + errors.length + ') ===');
errors.forEach(e => console.log(e));
