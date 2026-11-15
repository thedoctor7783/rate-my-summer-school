const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let submitted = [];
const window = { SSDB: { getSurveyResponses: id => submitted.filter(r => r.programId === id), currentUser: () => null } };
vm.runInNewContext(fs.readFileSync(__dirname + '/assets/js/experience.js', 'utf8'), {window});
const {aggregate, questions, campus, outcomes} = window.SSExperience;
const record = (answers, roundKey='r3') => ({programId:'yygs', roundKey, answers});
let result = aggregate([record({program_food:5}),record({program_food:3}),record({program_food:'na'}),record({program_food:0}),record({program_food:6})], questions.food);
assert.equal(result.n,2);
assert.equal(result.avg,4);
assert.equal(result.skipped,1);
result = aggregate([record({skills_improved:['teamwork','teamwork','confidence']}),record({skills_improved:['teamwork']})], questions.skills);
assert.equal(result.n,2);
assert.equal(result.options.find(o=>o.value==='teamwork').count,2);
assert.equal(result.options.find(o=>o.value==='confidence').count,1);
assert.equal(aggregate([record({relationships:5})],questions.connections).n,0);
assert.equal(aggregate([record({outcomes:['rec_letter']})],questions.outcomes).n,0);
assert.equal(aggregate([record({future_interest:5})],questions.direction).n,0);
assert.equal(aggregate([record({expectations:3},'r1')],questions.expectations).n,0);
assert.equal(aggregate([record({skills:['teamwork']})],questions.skills).n,1);
assert.equal(aggregate([record({campus_food:4},'r4')],questions.food).avg,4);
result = aggregate([
  record({housing_ratings:{cleanliness:5},participation_context:{format:'residential'}}),
  record({housing_ratings:{cleanliness:1},participation_context:{format:'commuter'}}),
  record({housing_ratings:{cleanliness:2}}),
  record({housing_ratings:{cleanliness:'na'},participation_context:{format:'residential'}})
],questions.housing_cleanliness);
assert.equal(result.n,1);
assert.equal(result.avg,5);
assert.equal(result.skipped,1);
assert.equal(result.unknownContext,2);
result = aggregate([record({administration_experience:{response:4,logistics:'na'}})],questions.admin_response);
assert.equal(result.n,1);
assert.equal(result.avg,4);
assert.equal(aggregate([record({lasting_connections:'too_soon'})],questions.connections).options.find(o=>o.value==='too_soon').count,1);
assert.equal(aggregate([record({value_for_money:'substantial_aid'},'r1')],questions.value).n,0);
const empty = campus('yygs','en',true) + outcomes('yygs','en',true);
assert.ok(empty.includes('No responses yet'));
assert.ok(!empty.includes('>0%<'));
assert.ok(!empty.includes('>0.0<'));
assert.ok(!empty.includes('singles & doubles'));
assert.ok(!empty.includes('Program dormitory —'));
assert.ok(!empty.includes('Strongly disagree —'));
assert.ok(empty.includes('https://globalscholars.yale.edu/residential-life'));
submitted = [record({program_food:5, skills_improved:['teamwork'], lasting_connections:'too_soon'}), {programId:'other',answers:{program_food:1}}];
assert.ok(campus('yygs','en',false).includes('5.0<small> / 5'));
assert.ok(outcomes('yygs','en',true).includes('100%'));
assert.ok(outcomes('yygs','zh',true).includes('目前还太早，无法判断'));
assert.ok(!campus('other','en',true).includes('Benjamin Franklin'));
console.log('PASS: response counts, averages, N/A, residential eligibility, legacy isolation, program isolation, empty and populated renderers.');
