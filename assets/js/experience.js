/* Campus Life and Program Takeaways.
 * Verified facts and student survey results remain visually distinct. No
 * fallback percentages are shown before real responses exist.
 */
(function () {
  'use strict';
  const text = (en, zh) => ({ en, zh });
  const local = (value, lang) => typeof value === 'string' ? value : (value && (value[lang] || value.en)) || '';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy = (lang, en, zh) => lang === 'zh' ? zh : en;
  const colors = ['#a8bdf6', '#74dfbd', '#f4a5e5', '#ff9172', '#a8d6c5', '#ffd28a'];
  const calmColors = ['#365f55', '#5f877b', '#84a79b', '#a9c4ba', '#c9d9d3', '#e3ebe7'];

  function previewMode() {
    try { return new URLSearchParams(window.location.search).get('previewData') === '1'; }
    catch (e) { return false; }
  }
  const HARVARD_SSP_SAMPLE_ID = 'catalog-002-harvard-secondary-school-program';
  function harvardSspDemo(id, keys) {
    if (id !== HARVARD_SSP_SAMPLE_ID || !window.SSDB.getDemoAggregate) return false;
    const live = window.SSDB.getAggregate(id);
    return keys.every(key => {
      const result = live[key];
      return !result || (!(result.n || result.total) && !(result.items || []).some(item => item.n));
    });
  }
  function campusPreviewMode() {
    try {
      // Campus Life stays in an explicitly labelled design-preview state.
      // Add previewData=0 to inspect stored student responses instead.
      return new URLSearchParams(window.location.search).get('previewData') !== '0';
    } catch (e) { return true; }
  }
  function isDiscoveryListing(id) {
    const programs = (window.SSDATA && window.SSDATA.PROGRAMS) || [];
    const program = programs.find(item => item.id === id);
    return !!(program && ['official-source-listed', 'spreadsheet-provisional', 'paused'].includes(program.catalogStatus));
  }
  function programFor(id) {
    const programs = (window.SSDATA && window.SSDATA.PROGRAMS) || [];
    return programs.find(item => item.id === id) || {};
  }
  function designVariant() {
    try {
      const value = new URLSearchParams(window.location.search).get('design');
      return ['editorial', 'compact', 'accent'].includes(value) ? value : 'editorial';
    } catch (e) { return 'editorial'; }
  }
  function outcomeDesignVariant() {
    try {
      return new URLSearchParams(window.location.search).get('outcomeDesign') === 'pathways' ? 'pathways' : 'mixed';
    } catch (e) { return 'mixed'; }
  }
  function outcomeTypeVariant() {
    try {
      const value = new URLSearchParams(window.location.search).get('typeScale');
      return ['compact', 'balanced', 'large'].includes(value) ? value : 'balanced';
    } catch (e) { return 'balanced'; }
  }
  function campusStatsVariant() {
    try {
      return new URLSearchParams(window.location.search).get('stats') === 'split' ? 'split' : 'single';
    } catch (e) { return 'single'; }
  }
  function aggregate(programId, useDemo) {
    return useDemo && window.SSDB.getDemoAggregate
      ? window.SSDB.getDemoAggregate(programId)
      : window.SSDB.getAggregate(programId);
  }
  function previewNotice(lang, useDemo, compact) {
    if (!useDemo) return '';
    const message = compact
      ? copy(lang, 'Fictional results shown for layout only.', '仅用虚构结果预览排版。')
      : copy(lang, 'Sample data only — these are not official or real student results.', '仅使用示例数据，不代表官方信息或真实学生调查结果。');
    return `<aside class="demo-data-notice${compact ? ' demo-data-notice--compact' : ''}"><strong>${esc(copy(lang, compact ? 'SAMPLE PREVIEW' : 'DESIGN PREVIEW', compact ? '示例预览' : '设计预览'))}</strong><span>${esc(message)}</span></aside>`;
  }

  function countOf(result) {
    if (!result) return 0;
    return Number(result.n != null ? result.n : result.total) || 0;
  }
  function countNote(result, lang) {
    const n = countOf(result);
    return n ? (result && result.demo
      ? copy(lang, `Based on ${n} sample responses`, `基于 ${n} 份示例回答`)
      : copy(lang, `Based on ${n} verified responses`, `基于 ${n} 份已验证回答`))
      : copy(lang, 'Awaiting verified student feedback', '等待已验证学生反馈');
  }
  function positiveFromStars(result, reverse) {
    if (!result || !result.n) return null;
    const positive = (reverse ? [0, 1] : [3, 4]).reduce((sum, i) => sum + (result.dist[i] || 0), 0);
    return Math.round(positive / result.n * 100);
  }
  function pollMark(lang) {
    return `<span class="insight-label"><i aria-hidden="true"><b></b><b></b><b></b><b></b></i>${esc(copy(lang, 'STUDENT SNAPSHOT', '学生反馈'))}</span>`;
  }
  function percentInsight(label, result, lang, sentence, reverse) {
    const pct = positiveFromStars(result, reverse);
    const detail = pct == null
      ? copy(lang, 'The percentage will appear after verified responses are received.', '收到已验证回答后显示百分比。')
      : local(sentence, lang);
    return `<article class="insight-stat">${pollMark(lang)}<p class="insight-stat__label">${esc(local(label, lang))}</p><div class="insight-stat__value">${pct == null ? '—' : pct + '%'}</div><p class="insight-stat__sentence">${esc(detail)}</p><span class="insight-stat__count">${esc(countNote(result, lang))}</span></article>`;
  }
  function overallCard(title, result, lang) {
    const score = result && result.avg ? result.avg : 0;
    const n = countOf(result);
    return `<section class="overall-score"><div><p class="experience-eyebrow">${esc(copy(lang, 'OVERALL RATING', '整体评分'))}</p><h2>${esc(local(title, lang))}</h2></div><div class="overall-score__number"><strong>${n ? score.toFixed(1) : '—'}</strong>${n ? '<span>/ 5</span>' : ''}<small>${esc(countNote(result, lang))}</small></div></section>`;
  }
  function optionList(result) { return result ? (result.words || result.options || []) : []; }
  function rowsHTML(result, lang, limit) {
    const items = optionList(result), total = countOf(result), visible = items.slice(0, limit), hidden = items.slice(limit);
    const row = (item, index) => {
      const pct = total ? Math.round((item.count || 0) / total * 100) : null;
      return `<li class="insight-row" style="--bar-color:${colors[index % colors.length]};--bar-width:${pct == null ? 0 : pct}%"><span class="insight-row__fill" aria-hidden="true"></span><span class="insight-row__label">${esc(local(item, lang))}</span><strong>${pct == null ? '—' : pct + '%'}</strong></li>`;
    };
    return `<ul class="insight-rows">${visible.map(row).join('')}</ul>${hidden.length ? `<details class="insight-more"><summary>${esc(copy(lang, 'More', '更多'))}<span aria-hidden="true">⌄</span></summary><ul class="insight-rows">${hidden.map((item, index) => row(item, index + limit)).join('')}</ul></details>` : ''}`;
  }
  function distribution(title, prompt, result, lang, limit=4) {
    return `<article class="insight-panel">${pollMark(lang)}<h3>${esc(local(title, lang))}</h3><p class="experience-count">${esc(countNote(result, lang))}</p>${rowsHTML(result, lang, limit)}</article>`;
  }
  function categoryGrid(title, prompt, result, lang, limit=4) {
    const total = result && result.items ? Math.max(0, ...result.items.map(item => item.n || 0)) : 0;
    const mapped = { total, options:result && result.items ? result.items.map(item => ({ en:local(item.label, 'en'), zh:local(item.label, 'zh'), count:item.n ? (item.dist[3] || 0) + (item.dist[4] || 0) : 0 })) : [] };
    return distribution(title, prompt, mapped, lang, limit);
  }
  function fact(label, value, url, source, lang, note) {
    return `<article class="evidence-fact"><p class="experience-eyebrow">${esc(local(label, lang))}</p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(local(value, lang))}</a>${source || note ? `<small>${source ? esc(local(source, lang)) : ''}${source && note ? ' · ' : ''}${note ? esc(local(note, lang)) : ''}</small>` : ''}</article>`;
  }
  function officialFacts(id, lang, compact) {
    // Campus detail pages focus on student-reported experience. Official location
    // and housing facts are removed here because course locations and formats vary.
    return '';
  }
  function surveyRatingFact(label, result, lang) {
    const n = countOf(result), score = n && result.avg ? result.avg.toFixed(1) : '—';
    return `<article class="evidence-fact evidence-fact--rating"><p class="experience-eyebrow">${esc(local(label, lang))}</p><div><strong>${score}</strong>${n ? '<span>/ 5</span>' : ''}</div><small>${esc(countNote(result, lang))}</small></article>`;
  }
  function surveyRatingFacts(agg, lang) {
    return `<div class="evidence-facts evidence-facts--ratings">${surveyRatingFact(text('Safety', '安全'), categoryOverall(agg, 'cat_safety'), lang)}${surveyRatingFact(text('Housing', '住宿'), categoryOverall(agg, 'cat_housing'), lang)}${surveyRatingFact(text('Food', '餐饮'), categoryOverall(agg, 'cat_food'), lang)}</div>`;
  }
  function section(number, title, description, body, lang) {
    return `<section class="experience-section"><div class="experience-section__head"><span class="experience-section__number">${number}</span><div><h2>${esc(local(title, lang))}</h2></div></div>${body}</section>`;
  }
  function outcomeMiniSection(number, title, body, lang) {
    return `<section class="outcome-mini-section"><div class="experience-section__head"><span class="experience-section__number">${number}</span><div><h2>${esc(local(title, lang))}</h2></div></div>${body}</section>`;
  }
  function footer(id, lang, context) {
    const message = context === 'outcomes'
      ? copy(lang, 'Share what you carried forward so the next student can judge the program’s lasting value.', '分享你从项目中带走的收获，帮助下一位学生判断它的长期价值。')
      : context === 'academics'
        ? copy(lang, 'Share how the teaching, workload, and course activities actually felt.', '分享真实的教学、学习量和课程活动体验。')
      : copy(lang, 'Your response helps the next student understand what daily life actually felt like.', '你的回答会帮助下一位学生了解真实的项目体验。');
    return `<div class="experience-contribute"><div><h3>${esc(copy(lang, 'Add your experience', '分享你的体验'))}</h3><p>${esc(message)}</p></div><a class="application-portal-button" href="${window.SSDB.currentUser() ? '#/survey/' + esc(id) : '#/login'}">${esc(copy(lang, 'Write a review', '填写问卷'))} →</a></div>`;
  }
  function categoryOverall(agg, key) {
    const item = agg.category_ratings && agg.category_ratings.items ? agg.category_ratings.items.find(row => row.key === key) : null;
    return item ? { avg:item.n ? item.sum / item.n : 0, n:item.n } : { avg:0, n:0 };
  }
  function reviewCard(review, lang, sample) {
    const author = review.author || copy(lang, 'Anonymous', '匿名');
    return `<article class="review-card"><div class="avatar">${esc(author.slice(0, 2).toUpperCase())}</div><div><div class="row row--between"><div><strong>${esc(author)}</strong> <span class="muted">· ${esc(review.who || '')}</span></div><div class="mini-stars">${'★'.repeat(review.stars || 0)}${'☆'.repeat(5 - (review.stars || 0))}</div></div>${sample ? `<span class="sample-review-label">${esc(copy(lang, 'SAMPLE REVIEW', '示例评价'))}</span>` : ''}<p>${esc(local(review.text, lang))}</p></div></article>`;
  }
  function campusReviews(id, lang, useDemo) {
    const stored = window.SSDB.getReviews(id);
    let reviews = stored.filter(review => /campus|dorm|housing|food|facilit|safe|room|resident|dining|cafeteria|laundry|transport|area|校园|宿舍|餐饮|交通/i.test(review.text || ''));
    let sample = false;
    if (!stored.length && useDemo) {
      sample = true;
      reviews = id === HARVARD_SSP_SAMPLE_ID ? [
        { author:copy(lang, 'Sample student', '示例学生'), who:copy(lang, 'Fictional residential example', '虚构住宿示例'), stars:4, text:text('During a residential session, I could get from my room to class without much trouble. Quiet study space mattered most after a full day.', '在住宿形式的示例体验中，从宿舍到教室很方便；忙碌一天后，安静的学习空间对我最重要。') },
        { author:copy(lang, 'Sample student', '示例学生'), who:copy(lang, 'Fictional residential example', '虚构住宿示例'), stars:4, text:text('Sharing meals gave me a chance to see classmates outside class, though I sometimes wanted more time to explore the surrounding area.', '一起用餐让我有机会在课堂之外认识同学，不过我偶尔也希望有更多时间探索周边。') }
      ] : [
        { author:'Maya', who:'2025 residential student', stars:4, text:text('The residential colleges felt social and easy to navigate. I especially liked having common spaces where people from different tracks could meet.', '住宿学院很有社交氛围，校园内也容易找到方向。我尤其喜欢公共空间，不同方向的同学可以在那里认识彼此。') },
        { author:'Leo', who:'2025 residential student', stars:4, text:text('The campus felt safe during the program. Dining was convenient, although the choices started to feel repetitive near the end of the session.', '项目期间校园整体让我感觉安全。用餐很方便，不过到了后半段会觉得选择有些重复。') }
      ];
    }
    const cards = reviews.slice(0, 3).map(review => reviewCard(review, lang, sample)).join('');
    return `<section class="experience-reviews"><header class="experience-reviews__head"><p>${esc(copy(lang, 'IN THEIR OWN WORDS', '学生亲述'))}</p><h2>${esc(copy(lang, 'Campus Life Reviews', '校园生活评价'))}</h2></header><div class="experience-reviews__grid">${cards || `<div class="experience-reviews__empty"><p>${esc(copy(lang, 'No campus life reviews yet.', '暂时还没有校园生活评价。'))}</p><a href="${window.SSDB.currentUser() ? '#/survey/' + esc(id) : '#/login'}">${esc(copy(lang, 'Write the first review', '写下第一条评价'))} →</a></div>`}</div></section>`;
  }
  function academicReviews(id, lang, useDemo) {
    const stored = window.SSDB.getReviews(id);
    let reviews = stored.filter(review => /professor|instructor|teacher|class|academ|lecture|seminar|study|course|workload|assignment|project|research|lab|课程|课堂|老师|学术/i.test(review.text || ''));
    const sample = !stored.length && useDemo && id === HARVARD_SSP_SAMPLE_ID;
    if (sample) reviews = [
      { author:copy(lang, 'Sample student', '示例学生'), who:copy(lang, 'Fictional example', '虚构示例'), stars:5, text:text('Class discussions encouraged me to ask more questions, and instructor feedback gave me a clearer way to approach the coursework.', '课堂讨论鼓励我提出更多问题，老师的反馈也让我更清楚该怎样完成课程作业。') },
      { author:copy(lang, 'Sample student', '示例学生'), who:copy(lang, 'Fictional example', '虚构示例'), stars:4, text:text('The workload required planning ahead, but working through difficult material with classmates made the experience rewarding.', '课程任务需要提前安排时间，但和同学一起攻克难题让我觉得很有收获。') }
    ];
    if (!reviews.length) return '';
    return `<section class="experience-reviews experience-reviews--academics"><header class="experience-reviews__head"><p>${esc(copy(lang, 'IN THEIR OWN WORDS', '学生亲述'))}</p><h2>${esc(copy(lang, 'Academics Reviews', '学术体验评价'))}</h2></header><div class="experience-reviews__grid">${reviews.slice(0, 3).map(review => reviewCard(review, lang, sample)).join('')}</div></section>`;
  }
  function outcomeReviews(id, lang, useDemo) {
    const stored = window.SSDB.getReviews(id);
    let reviews = stored.filter(review => /outcome|skill|learn|growth|direction|future|career|mentor|connection|research|portfolio|recommendation|confidence|worth|value|收获|能力|成长|未来|信心/i.test(review.text || ''));
    let sample = false;
    if (!stored.length && useDemo) {
      sample = true;
      reviews = id === HARVARD_SSP_SAMPLE_ID ? [
        { author:copy(lang, 'Sample student', '示例学生'), who:copy(lang, 'Fictional example', '虚构示例'), stars:5, text:text('The experience helped me understand which subjects I want to explore further and made college-level coursework feel less unfamiliar.', '这段示例体验让我更清楚想继续探索哪些学科，也不再觉得大学课程那么陌生。') },
        { author:copy(lang, 'Sample student', '示例学生'), who:copy(lang, 'Fictional example', '虚构示例'), stars:4, text:text('I became more comfortable asking for feedback and planning my work independently—habits I would carry into my next course.', '我更习惯主动寻求反馈、独立安排学习；这些习惯是我希望带进下一门课的收获。') }
      ] : [
        { author:'Alex', who:'2026 student', stars:5, text:text('I left with a completed project, clearer academic direction, and friends I still talk with.', '我带走了一个完整项目、更清晰的学术方向，以及至今仍保持联系的朋友。') },
        { author:'Jordan', who:'2026 residential student', stars:4, text:text('The program helped me become more independent and more confident presenting my work.', '这个项目让我更独立，也让我在展示自己的成果时更有信心。') }
      ];
    }
    const cards = reviews.slice(0, 3).map(review => reviewCard(review, lang, sample)).join('');
    return `<section class="experience-reviews experience-reviews--outcomes"><header class="experience-reviews__head"><p>${esc(copy(lang, 'WHAT LASTED', '持续的影响'))}</p><h2>${esc(copy(lang, 'Reviews on Outcomes', '关于项目收获的评价'))}</h2></header><div class="experience-reviews__grid">${cards || `<div class="experience-reviews__empty"><p>${esc(copy(lang, 'No outcome-focused reviews yet. Be the first to explain what stayed useful after the program ended.', '暂时还没有关于项目收获的评价。你可以率先分享项目结束后仍然有用的收获。'))}</p><a href="${window.SSDB.currentUser() ? '#/survey/' + esc(id) : '#/login'}">${esc(copy(lang, 'Write about your outcomes', '分享你的收获'))} →</a></div>`}</div></section>`;
  }

  function decisionTiles(items, lang, limit=4) {
    const visible = items.slice(0, limit), hidden = items.slice(limit);
    const row = item => {
      const value = item.pct == null ? 0 : Math.max(0, Math.min(100, item.pct));
      return `<li class="decision-result"><div class="decision-result__label"><span>${esc(local(item.label, lang))}</span><strong>${item.pct == null ? '—' : item.pct + '%'}</strong></div><div class="decision-result__bar" aria-hidden="true"><i style="--decision-value:${value}%"></i></div></li>`;
    };
    return `<ul class="decision-result-list">${visible.map(row).join('')}</ul>${hidden.length ? `<details class="decision-more"><summary><span class="decision-more__open">${esc(copy(lang, 'Show all', '查看全部'))}</span><span class="decision-more__close">${esc(copy(lang, 'Show less', '收起'))}</span><span class="decision-more__arrow" aria-hidden="true">⌄</span></summary><ul class="decision-result-list">${hidden.map((item, index) => row(item, index + visible.length)).join('')}</ul></details>` : ''}`;
  }
  function optionDecisionItems(result) {
    const source = optionList(result).map((item, index) => ({
      label:item,
      count:Math.max(0, Number(item.count) || 0),
      index
    }));
    const totalSelections = source.reduce((sum, item) => sum + item.count, 0);
    if (!totalSelections) return source.map(item => ({ label:item.label, pct:null }));

    const normalized = source.map(item => {
      const exact = item.count / totalSelections * 100;
      return { ...item, pct:Math.floor(exact), remainder:exact - Math.floor(exact) };
    });
    let pointsLeft = 100 - normalized.reduce((sum, item) => sum + item.pct, 0);
    normalized.slice().sort((a, b) => b.remainder - a.remainder || b.count - a.count || a.index - b.index).forEach(item => {
      if (pointsLeft > 0) { item.pct += 1; pointsLeft -= 1; }
    });
    return normalized.sort((a, b) => b.pct - a.pct || b.count - a.count || a.index - b.index).map(item => ({ label:item.label, pct:item.pct }));
  }
  function categoryDecisionItems(result) {
    return result && result.items ? result.items.map(item => ({
      label:item.label,
      pct:item.n ? Math.round(((item.dist[3] || 0) + (item.dist[4] || 0)) / item.n * 100) : null
    })) : [];
  }
  function decisionEvidence(title, result, items, lang, limit=4) {
    return `<div class="decision-evidence"><div class="decision-evidence__head"><h3>${esc(local(title, lang))}</h3><small>${esc(countNote(result, lang))}</small></div>${decisionTiles(items, lang, limit)}</div>`;
  }
  function decisionPercent(result, sentence, lang) {
    const pct = positiveFromStars(result);
    return `<article class="decision-percent"><div class="decision-percent__statement"><strong>${pct == null ? '—' : pct + '%'}</strong><p>${pct == null ? esc(copy(lang, 'Awaiting responses', '等待回答')) : esc(local(sentence, lang))}</p></div><small>${esc(countNote(result, lang))}</small></article>`;
  }
  function decisionRailMetric(label, result, format, lang) {
    const n = countOf(result);
    // Aggregates built from stored survey answers keep a running sum. Demo
    // aggregates also include `avg`, but real submissions must derive their
    // value from the sum so the at-a-glance card never falls back to 0.0.
    const average = n
      ? (Number.isFinite(result && result.sum) ? result.sum / n : Number(result && result.avg))
      : null;
    const value = average == null || !Number.isFinite(average) ? '—' : average.toFixed(1);
    return `<div><span>${esc(local(label, lang))}</span><strong>${value}${n ? '<small>/ 5</small>' : ''}</strong></div>`;
  }
  function decisionSection(number, tone, title, body, lang) {
    return `<section class="decision-section decision-section--${tone}"><div class="decision-section__head"><span>${number}</span><h2>${esc(local(title, lang))}</h2></div>${body}</section>`;
  }
  function academicDecisionSection(number, tone, title, body, lang) {
    return `<section class="academic-section academic-section--${tone}"><div class="decision-section__head"><span>${number}</span><h2>${esc(local(title, lang))}</h2></div>${body}</section>`;
  }
  function averageResult(results) {
    let sum = 0, n = 0, demo = false;
    results.filter(Boolean).forEach(result => {
      const count = countOf(result);
      if (!count) return;
      const average = Number.isFinite(result.sum) ? result.sum / count : Number(result.avg);
      if (!Number.isFinite(average)) return;
      sum += average * count;
      n += count;
      demo = demo || !!result.demo;
    });
    return { avg:n ? sum / n : 0, n, demo };
  }
  function campusPreviewOverall(agg, lang) {
    const result = averageResult([agg.housing_rating, agg.campus_safe, agg.campus_convenient, agg.campus_food, agg.local_area_rating]);
    const metric = (label, value) => {
      const n = countOf(value);
      const average = n ? (Number.isFinite(value && value.sum) ? value.sum / n : Number(value && value.avg)) : null;
      return `<li><span>${esc(local(label, lang))}</span><strong>${Number.isFinite(average) ? average.toFixed(1) : '—'}${Number.isFinite(average) ? '<small>/5</small>' : ''}</strong></li>`;
    };
    const metrics = [
      [text('Housing', '住宿'), agg.housing_rating],
      [text('Safety', '安全'), agg.campus_safe],
      [text('Transportation', '交通'), agg.campus_convenient],
      [text('Food', '餐饮'), agg.campus_food],
      [text('Local area', '周边环境'), agg.local_area_rating]
    ];
    return `<article class="campus-preview-overall"><p>${esc(copy(lang, 'CAMPUS LIFE AT A GLANCE', '校园生活概览'))}</p><div class="campus-preview-overall__score"><strong>${result.n ? result.avg.toFixed(1) : '—'}</strong>${result.n ? '<span>/ 5 overall</span>' : ''}</div><ul>${metrics.map(item => metric(item[0], item[1])).join('')}</ul><small>${esc(result.n ? copy(lang, 'Five category scores from student reports', '来自学生反馈的五项分类评分') : copy(lang, 'Awaiting verified feedback', '等待已验证反馈'))}</small></article>`;
  }

  function academicOfficialFacts(id, lang) {
    const program = programFor(id);
    const details = window.SSDATA.PROGRAM_DETAILS[id] || {};
    const catalogInfo = program.officialInfo || {};
    const sourceUrl = catalogInfo.sourceUrl && catalogInfo.sourceUrl !== 'Unknown' ? catalogInfo.sourceUrl : program.website && program.website !== 'Unknown' ? program.website : '#';
    const unknown = value => !value || value === 'Unknown';
    const officialLines = value => {
      const seen = new Set();
      const values = Array.isArray(value) ? value : [value];
      return values.flatMap(item => String(item || '').split(/[\r\n;]+|\s+•\s*/)).map(line => line.replace(/^\s*[•·▪‣–—-]\s*/, '').replace(/\s*[↗↘↖↙]+\s*$/g, '').trim()).filter(line => {
        const key = line.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    const official = Object.assign({}, details.officialAcademics || {});
    if (catalogInfo.academicCredit) {
      official.courseCredit = { value:{ en:catalogInfo.academicCredit, zh:window.SSStructuredOfficial && window.SSStructuredOfficial.value(program, 'academicCredit', 'zh') || (window.SSOfficialZh ? window.SSOfficialZh.translate(catalogInfo.academicCredit) : catalogInfo.academicCredit) }, sourceUrl:unknown(catalogInfo.academicCredit) ? '' : sourceUrl };
    }
    if (!unknown(catalogInfo.tracksFocus)) {
      const tracks = officialLines(catalogInfo.tracksFocus);
      const structuredTracks = program.officialStructured && program.officialStructured.fields.tracksFocus.items.map(item => item.text.zh);
      official.programTracks = { year:(String(catalogInfo.dataCycle || '').match(/20\d{2}/) || [])[0], items:{ en:tracks, zh:structuredTracks && structuredTracks.length === tracks.length ? structuredTracks : window.SSOfficialZh ? tracks.map(window.SSOfficialZh.translate) : tracks }, sourceUrl };
    }
    const cards = [];
    if (official.courseCredit && official.courseCredit.sourceUrl) {
      const creditLines = officialLines(local(official.courseCredit.value, lang)).map(line => {
        if (/no grades or course credit/i.test(line)) return copy(lang, 'No formal university credit', '不授予正式大学学分');
        return line.split(/\s*[;.]\s*(?=(?:certificate|completion|grades?\b))/i)[0].trim();
      }).filter(Boolean);
      const creditMarkup = creditLines.length > 1 ? `<ul class="official-track-list">${creditLines.map(line => `<li>${esc(line)}</li>`).join('')}</ul>` : esc(creditLines[0] || local(official.courseCredit.value, lang));
      cards.push(`<article class="evidence-fact"><p class="experience-eyebrow">${esc(copy(lang, 'COURSE CREDIT', '课程学分'))}</p><a href="${esc(official.courseCredit.sourceUrl)}" target="_blank" rel="noopener noreferrer">${creditMarkup}</a></article>`);
    } else if (!catalogInfo.academicCredit || unknown(catalogInfo.academicCredit)) {
      cards.push(`<article class="evidence-fact"><p class="experience-eyebrow">${esc(copy(lang, 'COURSE CREDIT', '课程学分'))}</p><a href="${esc(program.website || '#')}" target="_blank" rel="noopener noreferrer">${esc(copy(lang, 'Official credit policy under review', '正在核对官方学分政策'))}</a></article>`);
    }
    if (official.grades && official.grades.sourceUrl) {
      cards.push(`<article class="evidence-fact"><p class="experience-eyebrow">${esc(copy(lang, 'GRADES', '成绩'))}</p><a href="${esc(official.grades.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(local(official.grades.value, lang))}</a></article>`);
    }
    const learningModel = official.programTracks || official.subjectsCourses || official.academicFormat;
    if (learningModel && learningModel.sourceUrl && local(learningModel.items, lang).length) {
      const isTracks = !!official.programTracks;
      const isSubjects = !!official.subjectsCourses;
      const year = learningModel.year ? ` · ${esc(learningModel.year)}` : '';
      const label = isTracks ? copy(lang, 'PROGRAM TRACKS', '项目方向') : isSubjects ? copy(lang, 'SUBJECTS / COURSES', '科目／课程') : copy(lang, 'ACADEMIC FORMAT', '教学形式');
      const items = local(learningModel.items, lang);
      cards.push(`<article class="evidence-fact evidence-fact--official-tracks"><p class="experience-eyebrow">${esc(label)}${year}</p><a href="${esc(learningModel.sourceUrl)}" target="_blank" rel="noopener noreferrer"><ul class="official-track-list">${officialLines(items).map(item => `<li>${esc(item)}</li>`).join('')}</ul></a></article>`);
    }
    return cards.length ? `<div class="academic-preview-official${cards.length === 1 ? ' academic-preview-official--single' : ''}">${cards.join('')}</div>` : '';
  }

  function academicPreviewOverall(agg, lang) {
    const overall = agg.academic_rating || { avg:0, n:0 };
    const instructor = instructorAverage(agg.instructors_likert);
    const content = weightedOptionAverage(agg.academic_content_match);
    const metric = (label, result) => {
      const n = countOf(result);
      const average = n ? (Number.isFinite(result && result.sum) ? result.sum / n : Number(result && result.avg)) : null;
      return `<li><span>${esc(local(label, lang))}</span><strong>${Number.isFinite(average) ? average.toFixed(1) : '—'}${Number.isFinite(average) ? '<small>/5</small>' : ''}</strong></li>`;
    };
    return `<article class="campus-preview-overall academic-preview-overall"><p>${esc(copy(lang, 'ACADEMICS AT A GLANCE', '学术体验概览'))}</p><div class="campus-preview-overall__score"><strong>${countOf(overall) ? Number(overall.avg).toFixed(1) : '—'}</strong>${countOf(overall) ? '<span>/ 5 overall</span>' : ''}</div><ul>${metric(text('Overall academics', '整体学术体验'), overall)}${metric(text('Instructor experience', '老师体验'), instructor)}${metric(text('Content match', '课程内容符合度'), content)}</ul><small>${esc(countOf(overall) || instructor.n || content.n ? copy(lang, 'Scores from student reports', '评分来自学生反馈') : copy(lang, 'Awaiting verified feedback', '等待已验证反馈'))}</small></article>`;
  }

  function academicInstructorSnapshot(result, lang) {
    const items = categoryDecisionItems(result).sort((a, b) => (b.pct || 0) - (a.pct || 0));
    const top = items[0];
    const meta = likertMeta(result);
    return `<article class="insight-stat academic-preview-snapshot">${pollMark(lang)}<p class="insight-stat__label">${esc(copy(lang, 'Instructor engagement', '老师投入度'))}</p><div class="insight-stat__value">${top && top.pct != null ? top.pct + '%' : '—'}</div><p class="insight-stat__sentence">${top ? esc(local(top.label, lang)) : esc(copy(lang, 'Results will appear after verified responses are received.', '收到已验证回答后将显示结果。'))}</p><span class="insight-stat__count">${esc(countNote(meta, lang))}</span></article>`;
  }
  function campusDecisionMap(id, lang, agg, useDemo) {
    const housing = decisionEvidence(text('How students described the dorm atmosphere', '学生如何描述宿舍氛围'), agg.dorm_atmosphere, optionDecisionItems(agg.dorm_atmosphere), lang, 4);
    const safety = `<div class="decision-percent-grid">${decisionPercent(agg.campus_safe, text('of students said they felt safe or very safe on campus.', '的学生表示他们在校园内感到安全或非常安全。'), lang)}${decisionPercent(agg.campus_convenient, text('of students said getting around campus was convenient or very convenient.', '的学生表示在校园内出行方便或非常方便。'), lang)}</div>`;
    const food = `<div class="decision-percent-grid decision-percent-grid--single">${decisionPercent(agg.campus_food, text('of students rated the food provided by the program 4 or 5 out of 5.', '的学生为项目提供的餐饮打出 4 分或 5 分。'), lang)}</div>${decisionEvidence(text('Facilities students could rely on', '学生可以依赖的校园设施'), agg.campus_facilities, optionDecisionItems(agg.campus_facilities), lang, 4)}`;
    const localArea = `${decisionEvidence(text('How students described the area', '学生如何描述周边环境'), agg.area_words, optionDecisionItems(agg.area_words), lang, 4)}${decisionEvidence(text('What was easy to access nearby', '周边容易到达的资源'), agg.area_convenience, optionDecisionItems(agg.area_convenience), lang, 4)}`;
    const rail = `<aside class="decision-map__rail"><h2>${esc(copy(lang, 'Campus Life at a glance', '校园生活概览'))}</h2><div class="decision-map__rail-metrics">${decisionRailMetric(text('Housing', '住宿'), agg.housing_rating, 'average', lang)}${decisionRailMetric(text('Safety', '安全'), agg.campus_safe, 'average', lang)}${decisionRailMetric(text('Transportation convenience', '交通便利度'), agg.campus_convenient, 'average', lang)}${decisionRailMetric(text('Food', '餐饮'), agg.campus_food, 'average', lang)}${decisionRailMetric(text('Local area', '周边环境'), agg.local_area_rating, 'average', lang)}</div></aside>`;
    const main = `<div class="decision-map__main"><header class="decision-map__intro"><p>${esc(copy(lang, 'A STUDENT DECISION MAP', '学生决策地图'))}</p><h2>${esc(copy(lang, 'Can I picture myself living here?', '我能想象自己在这里生活吗？'))}</h2></header>${decisionSection('01', 'blue', text('Housing', '住宿'), housing, lang)}${decisionSection('02', 'mint', text('Safety & Transportation Convenience', '安全与交通便利度'), safety, lang)}${decisionSection('03', 'yellow', text('Food & Facilities', '餐饮与设施'), food, lang)}${decisionSection('04', 'coral', text('Local Area', '周边环境'), localArea, lang)}</div>`;
    return `<div class="experience-detail experience-campus campus-decision-map campus-stats-${campusStatsVariant()} campus-bars-columns">${previewNotice(lang, useDemo)}<div class="decision-map">${rail}${main}</div>${footer(id, lang)}${campusReviews(id, lang, useDemo)}</div>`;
  }

  function campus(id, lang, full) {
    const useDemo = id === HARVARD_SSP_SAMPLE_ID
      ? (previewMode() || harvardSspDemo(id, ['housing_rating', 'campus_safe', 'campus_convenient', 'campus_food', 'local_area_rating', 'category_ratings', 'dorm_atmosphere', 'campus_facilities', 'area_words', 'area_convenience']))
      : campusPreviewMode();
    const agg = aggregate(id, useDemo);
    const intro = '';
    const snapshots = `<div class="insight-stat-grid campus-snapshot-grid campus-snapshot-grid--two">${percentInsight(text('Campus safety', '校园安全感'), agg.campus_safe, lang, text('of students felt safe or very safe on campus.', '的学生在校园内感到安全或非常安全。'))}${percentInsight(text('Getting around', '校内出行'), agg.campus_convenient, lang, text('of students found it convenient or very convenient to get around.', '的学生认为校内出行方便或非常方便。'))}</div>`;
    const lead = `<div class="campus-preview-dashboard"><div class="campus-preview-dashboard__left">${snapshots}</div>${campusPreviewOverall(agg, lang)}</div>`;
    const areaPoll = `<article class="campus-preview-poll"><div class="campus-preview-poll__head"><div><p>${esc(copy(lang, 'STUDENT POLL', '学生投票'))}</p><h3>${esc(copy(lang, 'How students described the area', '学生如何描述周边环境'))}</h3></div><small>${esc(countNote(agg.area_words, lang))}</small></div>${decisionTiles(optionDecisionItems(agg.area_words), lang, 4)}</article>`;
    if (!full) return `<div class="experience-preview experience-preview--campus">${previewNotice(lang, useDemo, true)}${intro}${lead}${areaPoll}</div>`;
    return campusDecisionMap(id, lang, agg, useDemo);
  }

  function weightedOptionAverage(result) {
    const total = countOf(result);
    if (!total) return { avg:0, n:0, demo:!!(result && result.demo) };
    const sum = optionList(result).reduce((value, item) => value + (Number(item.value) || 0) * (Number(item.count) || 0), 0);
    return { avg:sum / total, n:total, demo:!!result.demo };
  }
  function instructorAverage(result) {
    const items = result && result.items ? result.items : [];
    const sum = items.reduce((value, item) => value + (Number(item.sum) || 0), 0);
    const n = items.reduce((value, item) => value + (Number(item.n) || 0), 0);
    return { avg:n ? sum / n : 0, n, demo:!!(result && result.demo) };
  }
  function likertMeta(result) {
    const items = result && result.items ? result.items : [];
    return { n:items.reduce((max, item) => Math.max(max, Number(item.n) || 0), 0), demo:!!(result && result.demo) };
  }
  function multiSelectDecisionItems(result) {
    const total = countOf(result);
    return optionList(result).map(item => ({
      label:item,
      pct:total ? Math.round((Number(item.count) || 0) / total * 100) : null
    })).sort((a, b) => (b.pct == null ? -1 : b.pct) - (a.pct == null ? -1 : a.pct));
  }
  function academicInstructorVariant() {
    try {
      const value = new URLSearchParams(window.location.search).get('academicInstructors');
      return ['spotlight', 'cards', 'bars'].includes(value) ? value : 'spotlight';
    } catch (e) { return 'spotlight'; }
  }
  function instructorEvidence(result, lang) {
    const items = categoryDecisionItems(result).sort((a, b) => (b.pct || 0) - (a.pct || 0));
    const meta = likertMeta(result);
    const variant = academicInstructorVariant();
    const title = text('How engaging were the instructors?', '授课老师的投入程度如何？');
    if (variant === 'bars') return decisionEvidence(title, meta, items, lang, 6);
    if (variant === 'cards') {
      const cards = items.map(item => `<li style="--academic-accent:#a8bdf6"><strong>${item.pct == null ? '—' : item.pct + '%'}</strong><span>${esc(local(item.label, lang))}</span></li>`).join('');
      return `<div class="decision-evidence academic-instructor-cards"><div class="decision-evidence__head"><h3>${esc(local(title, lang))}</h3><small>${esc(countNote(meta, lang))}</small></div><ul>${cards}</ul></div>`;
    }
    const top = items[0] || { label:text('Awaiting responses', '等待回答'), pct:null };
    const evidence = items.map(item => `<li style="--academic-accent:#a8bdf6"><i aria-hidden="true"></i><span>${esc(local(item.label, lang))}</span><strong>${item.pct == null ? '—' : item.pct + '%'}</strong></li>`).join('');
    return `<div class="decision-evidence academic-instructor-spotlight"><div class="decision-evidence__head"><h3>${esc(local(title, lang))}</h3><small>${esc(countNote(meta, lang))}</small></div><div class="academic-instructor-spotlight__feature"><strong>${top.pct == null ? '—' : top.pct + '%'}</strong><div><p>${esc(copy(lang, 'STRONGEST REPORTED QUALITY', '最突出的老师特点'))}</p><span>${esc(local(top.label, lang))}</span></div></div><ul>${evidence}</ul></div>`;
  }
  function academicActivityLedger(result, lang) {
    const total = countOf(result);
    const items = multiSelectDecisionItems(result), visible = items.slice(0, 4), hidden = items.slice(4);
    const row = (item, index) => `<li><span class="outcome-ledger__number">${String(index + 1).padStart(2, '0')}</span><span class="outcome-ledger__label">${esc(local(item.label, lang))}</span><strong>${item.pct == null ? '—' : item.pct + '%'}</strong></li>`;
    if (!total) return decisionEvidence(text('What types of academic activities did the program include?', '项目包含哪些学术活动？'), result, optionDecisionItems(result), lang, 4);
    return `<article class="outcome-board outcome-board--ledger academic-activity-ledger"><div class="outcome-board__head"><div><h3>${esc(copy(lang, 'What types of academic activities did the program include?', '项目包含哪些学术活动？'))}</h3></div><small>${esc(countNote(result, lang))}</small></div><ol class="outcome-ledger">${visible.map(row).join('')}</ol>${hidden.length ? `<details class="outcome-disclosure outcome-disclosure--ledger"><summary>${outcomeDisclosureSummary(lang, 'Show all activities', '查看全部活动')}</summary><ol class="outcome-ledger">${hidden.map((item, index) => row(item, index + visible.length)).join('')}</ol></details>` : ''}<p class="outcome-board__note">${esc(copy(lang, 'Students could select more than one activity, so percentages do not add to 100%.', '学生可多选，因此比例不会合计为 100%。'))}</p></article>`;
  }
  function academics(id, lang, full) {
    const useDemo = previewMode() || id === 'ucsb-pre' || harvardSspDemo(id, ['academic_rating', 'instructors_likert', 'interaction', 'workload', 'academic_content_match', 'activities']);
    const agg = aggregate(id, useDemo);
    if (!full) {
      const dashboard = `<div class="academic-preview-dashboard">${academicOfficialFacts(id, lang)}<div class="academic-preview-dashboard__lower">${academicInstructorSnapshot(agg.instructors_likert, lang)}${academicPreviewOverall(agg, lang)}</div></div>`;
      const workload = `<article class="campus-preview-poll academic-preview-poll"><div class="campus-preview-poll__head"><div><p>${esc(copy(lang, 'STUDENT POLL', '学生投票'))}</p><h3>${esc(copy(lang, 'How heavy was the academic workload?', '学业负担有多重？'))}</h3></div><small>${esc(countNote(agg.workload, lang))}</small></div>${decisionTiles(optionDecisionItems(agg.workload), lang, 4)}</article>`;
      return `<div class="experience-preview experience-preview--academics">${previewNotice(lang, useDemo, true)}${dashboard}${workload}</div>`;
    }
    const instructorScore = instructorAverage(agg.instructors_likert);
    const contentScore = weightedOptionAverage(agg.academic_content_match);
    const rail = `<aside class="decision-map__rail decision-map__rail--academic"><h2>${esc(copy(lang, 'Academics at a glance', '学术体验概览'))}</h2><div class="decision-map__rail-metrics">${decisionRailMetric(text('Overall academics', '整体学术体验'), agg.academic_rating, 'average', lang)}${decisionRailMetric(text('Instructor experience', '老师体验'), instructorScore, 'average', lang)}${decisionRailMetric(text('Content match', '课程内容符合度'), contentScore, 'average', lang)}</div></aside>`;
    const instructorStatements = `<div class="academic-question-block">${instructorEvidence(agg.instructors_likert, lang)}<p class="academic-decision-note">${esc(copy(lang, 'Percentages represent the amount of students that chose "agree" or "strongly agree" to each of these statements', '比例表示每条陈述中选择“同意”或“非常同意”的学生数量。'))}</p></div>`;
    const interaction = `<div class="academic-question-block">${decisionEvidence(text('How much interaction did students have with instructors?', '学生和授课老师有多少互动？'), agg.interaction, optionDecisionItems(agg.interaction), lang, 4)}</div>`;
    const workload = `<div class="academic-question-block">${decisionEvidence(text('How heavy was the academic workload?', '学业负担有多重？'), agg.workload, optionDecisionItems(agg.workload), lang, 4)}</div>`;
    const contentMatchPalette = ['#74dfbd','#8be3c6','#a4e9d3','#bceee0','#d4f4ec'];
    const contentMatchTitle = text('Did the academic content match what the program promised?', '学术内容是否符合项目介绍中的承诺？');
    const contentMatchBody = countOf(agg.academic_content_match)
      ? outcomeRing(contentMatchTitle, agg.academic_content_match, lang, contentMatchPalette, 5)
      : decisionEvidence(contentMatchTitle, agg.academic_content_match, optionDecisionItems(agg.academic_content_match), lang, 4);
    const contentMatch = `<div class="academic-question-block academic-question-block--ring"><div class="academics-content-ring">${contentMatchBody}</div></div>`;
    const activities = `<div class="academic-question-block">${academicActivityLedger(agg.activities, lang)}</div>`;
    const main = `<div class="decision-map__main"><header class="decision-map__intro"><p>${esc(copy(lang, 'A STUDENT DECISION MAP', '学生决策地图'))}</p><h2>${esc(copy(lang, 'Can I picture myself learning here?', '我能想象自己在这里学习吗？'))}</h2></header>${academicDecisionSection('01', 'blue', text('Instructors', '授课老师'), `<div class="academic-question-stack">${instructorStatements}${interaction}</div>`, lang)}${academicDecisionSection('02', 'mint', text('Academic Content', '学术内容'), `<div class="academic-question-stack">${workload}${contentMatch}</div>`, lang)}${academicDecisionSection('03', 'yellow', text('Academic Activities', '学术活动'), activities, lang)}</div>`;
    return `<div class="experience-detail academics-decision-map campus-decision-map campus-stats-single campus-bars-columns">${previewNotice(lang, useDemo)}<div class="decision-map">${rail}${main}</div>${academicReviews(id, lang, useDemo)}${footer(id, lang, 'academics')}</div>`;
  }

  // These two Outcome questions are single-choice categories, rather than a
  // five-point agreement scale. Keep every answer visible and rank it by the
  // share of respondents, so a student can see the actual mix of outcomes.
  function rankedOptions(result) {
    if (!result || !result.options) return result;
    return {
      ...result,
      options: result.options.slice().sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0))
    };
  }
  function outcomeItems(result) {
    const total = countOf(result);
    return optionList(result)
      .map((item, index) => ({
        item,
        index,
        count: Number(item.count) || 0,
        pct: total ? Math.round((Number(item.count) || 0) / total * 100) : null,
      }))
      .filter(entry => !total || entry.count > 0)
      .sort((a, b) => b.count - a.count || a.index - b.index);
  }
  function outcomePreviewSummary(agg, lang) {
    const skill = outcomeItems(agg.skills)[0];
    const takeaway = outcomeItems(agg.outcomes)[0];
    const connectionItems = outcomeItems(agg.lasting_connection);
    const noConnection = connectionItems.find(entry => /no connection|没有.*联系|没有联系/i.test(local(entry.item, 'en')) || /没有.*联系|没有联系/i.test(local(entry.item, 'zh')));
    const connectedPct = noConnection && noConnection.pct != null ? Math.max(0, 100 - noConnection.pct) : null;
    const metric = (label, value, description, result) => `<section><p>${esc(local(label, lang))}</p><strong>${value}</strong><span>${esc(description)}</span><small>${esc(countNote(result, lang))}</small></section>`;
    return `<article class="outcome-preview-profile"><header><p>${esc(copy(lang, 'OUTCOME PROFILE', '收获概览'))}</p><h3>${esc(copy(lang, 'What students carried forward', '学生从项目中带走了什么'))}</h3><span>${esc(copy(lang, 'Three decision signals — not a combined score', '三个决策信号，并非综合评分'))}</span></header><div>${metric(text('Skill growth', '能力成长'), skill && skill.pct != null ? skill.pct + '%' : '—', skill ? local(skill.item, lang) : copy(lang, 'Awaiting feedback', '等待反馈'), agg.skills)}${metric(text('Tangible takeaway', '具体成果'), takeaway && takeaway.pct != null ? takeaway.pct + '%' : '—', takeaway ? local(takeaway.item, lang) : copy(lang, 'Awaiting feedback', '等待反馈'), agg.outcomes)}${metric(text('Continuing connections', '持续联系'), connectedPct == null ? '—' : connectedPct + '%', connectedPct == null ? copy(lang, 'Awaiting feedback', '等待反馈') : copy(lang, 'reported at least one connection that continued', '表示至少有一段联系延续至今'), agg.lasting_connection)}</div></article>`;
  }
  function outcomeEmptyPoll(title, result, lang) {
    return `<article class="campus-preview-poll outcome-empty-poll"><div class="campus-preview-poll__head"><div><p>${esc(copy(lang, 'STUDENT POLL', '学生投票'))}</p><h3>${esc(local(title, lang))}</h3></div><small>${esc(countNote(result, lang))}</small></div>${decisionTiles(optionDecisionItems(result), lang, 4)}</article>`;
  }
  function outcomeDisclosureSummary(lang, showEn, showZh) {
    return `<span class="outcome-disclosure__open">${esc(copy(lang, showEn, showZh))}</span><span class="outcome-disclosure__close">${esc(copy(lang, 'Show less', '收起'))}</span><span class="outcome-disclosure__arrow" aria-hidden="true">⌄</span>`;
  }
  function outcomeDemoSwitcher(id, lang, current, currentType) {
    const route = `#/program/${encodeURIComponent(id)}/outcomes`;
    const href = (layout, type) => `?previewData=1&outcomeDesign=${layout}&typeScale=${type}${route}`;
    const layoutLink = (key, label) => `<a class="${current === key ? 'is-active' : ''}" href="${href(key, currentType)}">${esc(label)}</a>`;
    const typeLink = (key, label) => `<a class="${currentType === key ? 'is-active' : ''}" href="${href(current, key)}">${esc(label)}</a>`;
    return `<nav class="outcome-demo-switcher" aria-label="${esc(copy(lang, 'Outcome design demos', '项目收获页面设计示例'))}"><div class="outcome-demo-switcher__group"><span>${esc(copy(lang, 'LAYOUT', '布局'))}</span><div>${layoutLink('mixed', copy(lang, 'Clean data', '清晰数据'))}${layoutLink('pathways', copy(lang, 'Impact cards', '影响卡片'))}</div></div><div class="outcome-demo-switcher__group"><span>${esc(copy(lang, 'TYPE SIZE', '字号'))}</span><div>${typeLink('compact', copy(lang, 'Compact', '紧凑'))}${typeLink('balanced', copy(lang, 'Balanced', '平衡'))}${typeLink('large', copy(lang, 'Large', '大号'))}</div></div></nav>`;
  }
  function outcomeBars(title, result, lang, eyebrow, note, palette=colors) {
    const total = countOf(result);
    if (!total) return outcomeEmptyPoll(title, result, lang);
    const items = outcomeItems(result), visible = items.slice(0, 4), hidden = items.slice(4);
    const rows = entries => entries.map(entry => `<li style="--outcome-bar:${entry.pct}%;--outcome-accent:${palette[0]}"><div><span>${esc(local(entry.item, lang))}</span><strong>${entry.pct}%</strong></div><div class="outcome-bar-track" aria-hidden="true"></div></li>`).join('');
    return `<article class="outcome-board outcome-board--bars"><div class="outcome-board__head"><div><p>${esc(local(eyebrow, lang))}</p><h3>${esc(local(title, lang))}</h3></div><small>${esc(countNote(result, lang))}</small></div><ul class="outcome-bar-list">${rows(visible)}</ul>${hidden.length ? `<details class="outcome-disclosure outcome-disclosure--bars"><summary>${outcomeDisclosureSummary(lang, 'Show every response', '查看全部回答')}</summary><ul class="outcome-bar-list">${rows(hidden, visible.length)}</ul></details>` : ''}${note ? `<p class="outcome-board__note">${esc(local(note, lang))}</p>` : ''}</article>`;
  }
  function outcomeTiles(title, result, lang) {
    const total = countOf(result);
    if (!total) return outcomeEmptyPoll(title, result, lang);
    const items = outcomeItems(result);
    const tile = (entry, index) => `<li class="outcome-skill" style="--outcome-accent:${colors[index % colors.length]}"><strong>${entry.pct}%</strong><span>${esc(local(entry.item, lang))}</span></li>`;
    const visible = items.slice(0, 6), hidden = items.slice(6);
    return `<article class="outcome-board outcome-board--skills"><div class="outcome-board__head"><div><p>${esc(copy(lang, 'REPORTED GROWTH', '学生反馈的成长'))}</p><h3>${esc(local(title, lang))}</h3></div><small>${esc(countNote(result, lang))}</small></div><ul class="outcome-skill-grid">${visible.map(tile).join('')}</ul>${hidden.length ? `<details class="outcome-disclosure"><summary>${outcomeDisclosureSummary(lang, 'Show every skill', '查看全部能力')}</summary><ul class="outcome-skill-grid">${hidden.map((entry, index) => tile(entry, index + visible.length)).join('')}</ul></details>` : ''}<p class="outcome-board__note">${esc(copy(lang, 'Students could select more than one skill, so percentages do not add to 100%.', '学生可多选，因此各项比例不会合计为 100%。'))}</p></article>`;
  }
  function outcomeLedger(title, result, lang) {
    const total = countOf(result);
    if (!total) return outcomeEmptyPoll(title, result, lang);
    const items = outcomeItems(result), visible = items.slice(0, 4), hidden = items.slice(4);
    const row = (entry, index) => `<li><span class="outcome-ledger__number">${String(index + 1).padStart(2, '0')}</span><span class="outcome-ledger__label">${esc(local(entry.item, lang))}</span><strong>${entry.pct}%</strong></li>`;
    return `<article class="outcome-board outcome-board--ledger"><div class="outcome-board__head"><div><p>${esc(copy(lang, 'WHAT STUDENTS LEFT WITH', '学生带走的收获'))}</p><h3>${esc(local(title, lang))}</h3></div><small>${esc(countNote(result, lang))}</small></div><ol class="outcome-ledger">${visible.map(row).join('')}</ol>${hidden.length ? `<details class="outcome-disclosure outcome-disclosure--ledger"><summary>${outcomeDisclosureSummary(lang, 'Show all takeaways', '查看全部收获')}</summary><ol class="outcome-ledger">${hidden.map((entry, index) => row(entry, index + visible.length)).join('')}</ol></details>` : ''}<p class="outcome-board__note">${esc(copy(lang, 'Students could report more than one tangible outcome.', '学生可以报告多项具体收获。'))}</p></article>`;
  }
  function outcomeRing(title, result, lang, palette=colors, visibleCount=4) {
    const total = countOf(result);
    if (!total) return outcomeEmptyPoll(title, result, lang);
    const items = outcomeItems(result);
    let cursor = 0;
    const stops = items.map((entry, index) => {
      const start = cursor;
      cursor += total ? (entry.count / total) * 100 : 0;
      return `${palette[index % palette.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    }).join(',');
    const top = items[0];
    const visible = items.slice(0, visibleCount), hidden = items.slice(visibleCount);
    const legend = (entries, offset=0) => entries.map((entry, index) => `<li><i style="--legend-color:${palette[(index + offset) % palette.length]}"></i><span>${esc(local(entry.item, lang))}</span><strong>${entry.pct}%</strong></li>`).join('');
    return `<article class="outcome-ring-card"><div class="outcome-ring-card__head"><h3>${esc(local(title, lang))}</h3><small>${esc(countNote(result, lang))}</small></div><div class="outcome-ring-card__body"><div class="outcome-ring" style="--ring:${stops}" role="img" aria-label="${esc(local(title, lang))}"><div><strong>${top.pct}%</strong><span>${esc(copy(lang, 'Top response', '最高比例'))}</span></div></div><div class="outcome-ring-legend-wrap"><ul class="outcome-ring-legend">${legend(visible)}</ul>${hidden.length ? `<details class="outcome-disclosure outcome-disclosure--legend"><summary>${outcomeDisclosureSummary(lang, 'Show all', '查看全部')}</summary><ul class="outcome-ring-legend">${legend(hidden, visible.length)}</ul></details>` : ''}</div></div></article>`;
  }
  function outcomePathway(title, result, lang, palette=colors) {
    const total = countOf(result);
    if (!total) return outcomeEmptyPoll(title, result, lang);
    const items = outcomeItems(result);
    const visible = items.slice(0, 4), hidden = items.slice(4);
    const rows = entries => entries.map(entry => `<li style="--legend-color:${palette[0]};--outcome-bar:${entry.pct}%"><span>${esc(local(entry.item, lang))}</span><strong>${entry.pct}%</strong></li>`).join('');
    return `<article class="outcome-path-card"><div class="outcome-ring-card__head"><h3>${esc(local(title, lang))}</h3><small>${esc(countNote(result, lang))}</small></div><ol class="outcome-path-list">${rows(visible)}</ol>${hidden.length ? `<details class="outcome-disclosure outcome-disclosure--path"><summary>${outcomeDisclosureSummary(lang, 'Show all', '查看全部')}</summary><ol class="outcome-path-list">${rows(hidden, visible.length)}</ol></details>` : ''}</article>`;
  }
  function outcomes(id, lang, full) {
    const useDemo = previewMode() || id === 'ucsb-pre' || harvardSspDemo(id, ['skills', 'outcomes', 'academic_direction', 'lasting_connection']);
    const agg = aggregate(id, useDemo);
    const variant = 'mixed';
    const typeVariant = 'balanced';
    const directionResult = rankedOptions(agg.academic_direction);
    const connectionResult = rankedOptions(agg.lasting_connection);
    const directionTitle = text('Academic direction after the program', '项目后的学术方向');
    const connectionTitle = text('Connections that lasted', '持续至今的联系');
    const directionAndConnections = variant === 'pathways'
      ? `<div class="outcome-path-grid">${outcomePathway(directionTitle, directionResult, lang)}${outcomePathway(connectionTitle, connectionResult, lang)}</div>`
      : `<div class="outcome-mixed-grid">${outcomePathway(directionTitle, directionResult, lang, colors)}${outcomeRing(connectionTitle, connectionResult, lang, colors)}</div>`;
    const intro = `<p class="experience-intro">${esc(copy(lang, 'Student report what outcomes they gained after attending the program.', '学生报告参加项目后获得了哪些成果。'))}</p>`;
    if (!full) return `<div class="experience-preview experience-preview--outcomes">${previewNotice(lang, useDemo, true)}${outcomePreviewSummary(agg, lang)}</div>`;
    const skills = variant === 'pathways'
      ? outcomeTiles(text('Skills students said they improved', '学生表示有所提升的能力'), agg.skills, lang)
      : outcomeBars(text('Skills students said they improved', '学生表示有所提升的能力'), agg.skills, lang, text('REPORTED GROWTH', '学生反馈的成长'), text('Students could select more than one skill, so percentages do not add to 100%.', '学生可多选，因此各项比例不会合计为 100%。'), colors);
    const takeaways = outcomeLedger(text('Concrete outcomes students left with', '学生带走的具体成果'), agg.outcomes, lang);
    const growth = variant === 'mixed'
      ? `<div class="outcome-growth-grid">${outcomeMiniSection('01', text('Skills gained', '提升的技能'), skills, lang)}${outcomeMiniSection('02', text('Concrete takeaways', '具体收获'), takeaways, lang)}</div>`
      : `${section('01', text('Skills Students Gained', '学生提升的技能'), text('', ''), skills, lang)}${section('02', text('Concrete Takeaways', '具体收获'), text('', ''), takeaways, lang)}`;
    return `<div class="experience-detail experience-outcomes outcome-design-${variant} outcome-type-${typeVariant} design-${designVariant()}">${previewNotice(lang, useDemo, true)}${intro}${growth}${section('03', text('Direction & Connections', '方向与联系'), text('', ''), directionAndConnections, lang)}${outcomeReviews(id, lang, useDemo)}${footer(id, lang, 'outcomes')}</div>`;
  }
  window.SSExperience = { academics, campus, outcomes };
})();
