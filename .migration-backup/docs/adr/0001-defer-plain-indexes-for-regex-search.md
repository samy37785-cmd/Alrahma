# ADR 0001: Defer plain B-tree indexes on free-text search fields; use a text-index redesign instead

## Status
Accepted — 2026-07-06

## Context
A production engineering audit flagged `User.name`, `User.specialization`, `User.bio`,
`Course.title`, `Course.description`, `Blog.title`, and `Blog.excerpt` as
"missing indexes" on fields queried by `backend/controllers/searchController.js`
(`globalSearch`, `searchCourses`, `searchTeachers`). The proposed fix (T1) was
to add a plain single-field index on each of these seven fields.

Before implementing, we checked what these fields are actually queried with.
All three search functions build the same shape of filter:

```js
const regex = new RegExp(escaped, 'i');   // unanchored, case-insensitive
Course.find({ $or: [{ title: regex }, { description: regex }] });
```

This is a **substring, case-insensitive** match, not a prefix match. A
standard MongoDB B-tree index can only bound a regex scan when the pattern is
anchored at the start (`^prefix`) *and* case-sensitive — because only then do
matching values occupy a contiguous range in the index's sort order.

No other code path in the backend queries these seven fields at all (no
`.sort()`, no `.findOne()` exact-match/uniqueness check) — search is the sole
justification for indexing them.

## Evidence
We verified this empirically rather than relying on the general rule alone,
using the project's existing in-memory MongoDB replica-set test
infrastructure (`mongodb-memory-server`). 500 `Course` documents were seeded
and the exact query shape from `searchController.js` was run through
`explain('executionStats')`, before and after adding a plain `{ title: 1 }`
index:

| Scenario | Winning stage | Docs examined | Keys examined |
|---|---|---|---|
| No index | `COLLSCAN` | 500 / 500 | 0 |
| With `title: 1` index, same unanchored `/i` regex | `IXSCAN` | 500 / 500 | 500 |
| With `title: 1` index, anchored case-sensitive regex (`^Course 1 `) — for contrast | `IXSCAN` | 1 / 500 | 2 |

With the index present, the planner does switch to `IXSCAN` — but it still
walks every index entry and fetches every document
(`keysExamined === totalDocsExamined === collection size`), the same
asymptotic cost as no index at all. The bottom row proves the index
mechanism itself works correctly for a query shape that *can* use it
(anchored, case-sensitive) — it is specifically the substring +
case-insensitive shape used by production search that cannot benefit.

Per MongoDB's own documented query-planning behavior, a full index scan
followed by a full-document fetch per match can be **slower** in practice
than a plain collection scan, since it adds B-tree traversal and
random-access document reads on top of work a sequential heap scan already
does more cheaply.

## Decision
**Do not add plain single-field indexes** on `User.name`, `User.specialization`,
`User.bio`, `Course.title`, `Course.description`, `Blog.title`, or
`Blog.excerpt` for the purpose of accelerating the current search
implementation. They would add permanent write-time cost (every insert/update
to these frequently-edited free-text fields maintains an additional B-tree
entry) with no corresponding, measured read benefit.

The correct fix for this query pattern is a MongoDB **text index** (`$text`)
paired with a rewrite of `searchController.js` to use `$text`/`$search`
matching instead of `$or`-ed regexes. This is scoped as a separate task
(**T7 — Search optimization**) because it is a materially different and
higher-risk change than adding an index:
- it changes match semantics (tokenized/stemmed word matching vs. arbitrary
  substring matching — e.g. a $text index would not match "raj" inside
  "Tajweed" the way the current substring regex does),
- it changes relevance ranking (results are ordered by `$meta: 'textScore'`,
  not insertion/whatever order `$or` regex currently returns),
- only one text index is allowed per collection, and it must be designed
  deliberately (field weights, language settings) rather than added
  incidentally,
- it requires a controller rewrite, not just a schema annotation.

Bundling that redesign into what was scoped as a "just add indexes" task
would have violated the plan's own minimal-diff, one-task-at-a-time
constraint.

## Trade-offs considered
1. **Add the indexes anyway as a placeholder.** Rejected — pure write-cost
   with zero measured query benefit; does not fix the reported problem and
   risks being mistaken for a completed performance fix.
2. **Collation-based case-insensitive index.** Considered and rejected —
   collation affects value comparison/sort order (equality, sorting), not
   regex pattern evaluation; it would not change the `explain()` result for
   this query shape.
3. **Defer real indexing work to the $text redesign (T7).** Accepted — the
   index and the query rewrite that can actually use it land together, so
   the change is verifiable end-to-end (an index with no query designed
   around it, or a query rewrite with no supporting index, are each
   individually useless).

## Consequences
- T1 is closed with no schema or runtime changes.
- Search performance work is fully deferred to T7, which now owns both the
  index design and the controller rewrite.
- If a future, independent need arises for one of these fields (e.g., an
  admin screen sorting courses alphabetically by title), that would justify
  its own index on its own merits — none was found in current code.
