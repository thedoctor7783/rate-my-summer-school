# How the Matchmaker works

## What the visitor sees

Introduction → four questionnaire pages → preference review → five program suggestions → follow-up conversation, saved programs and comparison.

Each question has its own card. The first three pages have an expanded optional notes card. The fourth page has one additional-context field. Visitors can skip preferences, edit earlier answers and see which criteria are applied.

## 1. Receive the data

The current catalogue contains 69 programs. The existing Excel import supplies official information; structured records retain original wording, years, links, dates and prices alongside subject and learning-method tags. Student ratings and submitted reviews remain separate from official facts.

The visitor supplies subject interests, learning methods, goals, participation formats, summer year, completed grade, budget, aid needs and available dates. Preferences and unfinished progress are saved in the current browser. Text notes are saved; recognized preferences in questionnaire notes are proposed for confirmation.

## 2. Normalize without filling gaps

Dates, amounts, formats and tags are normalized into comparable fields. A fee is usable only when its year and participation format can be associated reliably. Per-credit fees, travel components and ambiguous cross-format amounts are not converted into invented program totals. Older dates are not moved into a new year. Unknown information remains unknown.

## 3. Check hard constraints

Exclude a program only for a known conflict with the visitor's stated conditions: an incompatible participation format, an explicit grade requirement, a confirmed fee above a strict budget, or known current-year sessions outside a strict availability window. Age, citizenship and prerequisites still require confirmation where the questionnaire or catalogue cannot establish them. Financial aid is never subtracted as an assumed award.

Programs with missing information may remain as candidates, accompanied by a visible check. A candidate is not a guarantee of eligibility or affordability.

## 4. Order the candidates

The preference model uses three groups:

- Subject interests: 45%.
- Learning methods: 30%.
- Summer goals: 25%.

Within each group, calculate the proportion of selected preferences matched by a program. If a group has no selections, remove it from the calculation and rescale the remaining weights. These weights are product design choices, not validated scientific measurements.

For example, if a visitor chooses one subject and one learning method, with no goals, the active weights become 60% subject and 40% method. A program matching both sorts above one matching only the subject, after known hard conflicts have been removed.

Ties use completeness of the six relevant evidence fields, then program name. If subjects and methods are both open, the first five suggestions include varied subjects and experiences. A request for cheaper choices uses confirmed current-year starting fees, with unknown fees placed last.

University prestige, acceptance rates, and student ratings do not determine personal-fit order. The site's Best Summer Programs rankings are a separate feature based on student ratings.

## 5. Present the evidence

Show up to five real catalogue programs with reasons, matched tags, cost, dates, participation format, eligibility, official links and outstanding checks. No admissions probability or artificial match percentage is displayed. Visitors can edit preferences, save a program, compare programs or open its details. If no candidate satisfies known constraints, explain the conflicts and let the visitor choose what to relax.

## 6. Refine through conversation

Local mode recognizes supported requests such as “only online”, “research”, “budget $5,000” and date ranges, applies explicit changes and reruns the same engine. More nuanced text remains a note rather than a fabricated answer.

The optional AI adapter can explain and propose refinements from the supplied catalogue and available submitted feedback. Its proposed preference changes require Apply. It cannot replace official records or secretly alter the ranking model.

## Optional connected AI

The file preview works with the local matching engine. Connected chat requires running the Node server with `OPENAI_API_KEY` set in its server environment. `OPENAI_MATCHMAKER_MODEL` can override the configured model. Never put a key in frontend JavaScript or a committed file.

`GET /api/matchmaker/status` reports whether the server has a key. `POST /api/matchmaker/chat` sends bounded messages and catalogue context to the provider using structured output. Only the user's confirmed patch changes the preference profile. On service failure, existing results and messages stay available.

The provider connection was tested with mocked responses; no live paid API call was performed. Browser visual verification was unavailable in this session; interaction checks use the full site's scripts in a DOM environment.
