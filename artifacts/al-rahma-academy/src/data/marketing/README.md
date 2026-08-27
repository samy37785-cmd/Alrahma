# Editorial / marketing data — NEVER wire to backend systems

Everything in this directory is **static editorial content** with no backing
records in the database:

- `teachers.js` — the public teacher directory. These are editorial profiles,
  **not** real teacher `User` accounts. Never connect them to the real
  review/user/messaging systems (this exact class of bug — fabricated
  ratings/reviews attached to editorial profiles — has been removed from the
  codebase repeatedly; see the honest-data rule in CLAUDE.md).
- `courses.js` — the marketing course catalog for the public site. It
  name-shadows the real `Course` model served by the API; enrollment and
  progress must always use the API, never this file.
- `blogPosts.js` — editorial blog content.
- `socialProof.js` — illustrative activity-ticker copy.

If a feature needs any of these nouns as *live data*, it talks to the API.
