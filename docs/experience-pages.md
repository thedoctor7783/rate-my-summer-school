# Campus Life and Program Takeaways

The presentation follows the revised questionnaire supplied on September 21, 2026.
`assets/js/experience.js` contains the question definitions and bilingual labels.
It reads submitted survey responses through `SSDB.getSurveyResponses(programId)`.
No example responses or ratings are added to the website or database.

## Current form compatibility

The existing survey form still uses the older four-round question schema. This
page update does not migrate that form or rewrite stored answers. Exactly
compatible legacy fields are accepted: campus_safe, campus_convenient,
campus_food, transport_safe, skills, and recommend (in their original rounds).
Other new topics remain awaiting responses until the revised form records them.
Legacy outcomes, future_interest, relationships, expectations, dorm_staff,
and leaving_campus must not be relabelled as the revised questions.

## Revised field contract

The `questions` export is the canonical definition of field keys, option values,
and types for these pages. Revised keys are intentionally separate from changed
legacy questions. New matrix fields are `housing_ratings` (cleanliness,
roommates, privacy, safety, location, facilities) and `administration_experience`
(communication, orientation, response, logistics).

Each residential response must carry `answers.participation_context.format`
equal to `residential` (case-insensitive), or equivalent response-level
`participationContext.format`. The form should copy the participation context
collected once onto each round submission. Records with no explicit residential
context cannot contribute to housing or residential staff results. Do not infer
residency from the program name or join unidentified records across respondents.

Numeric scale answers are 1–5. `na`, `not_applicable`, `substantial_aid`,
`rarely_interacted`, and `rarely_left` are counted separately from valid scales.
`too_soon` is a visible response for lasting_connections. Multi-select counts
each option once per answer and uses answered submissions as its denominator.
Counts are labelled responses, not unique people: the current public API does
not provide a stable respondent identifier for deduplication across submissions.

## Official facts

YYGS housing, dining and facilities were checked on September 22, 2026 at
https://globalscholars.yale.edu/residential-life and link directly there.
The new modules do not use the older unsourced housing or local-area descriptions.
For other programs, official cards remain absent until their sources are checked.

## Verification

Run `node experience.test.js` for aggregation and rendering behavior, then the
existing `node smoketest.js` route checks. Test responses exist only in memory.
