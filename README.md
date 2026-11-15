# RateMySummerSchool

Run the app through the local server so surveys and reviews are stored in the shared SQLite database instead of browser-only storage:

```bash
npm start
```

Then open `http://localhost:4173`.

## Data model

`data/ratemysummerschool.sqlite` is created automatically and is excluded from Git. It stores users, salted password hashes, signed-in sessions, reviews, and survey-round submissions in separate tables. Login creates an HTTP-only session cookie; reviews and surveys are attached to the authenticated user ID on the server. The front end loads these records from `/api/bootstrap` and recomputes every displayed percentage and score from them. With no submissions, it intentionally shows an em dash and “Awaiting verified student feedback” rather than generated statistics.

Program names, tuition, dates, and other catalogue facts remain in `assets/js/data.js`; they are editorial source data, not student-review data.
