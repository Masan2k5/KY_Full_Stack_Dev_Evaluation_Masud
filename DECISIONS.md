This document records implementation assumptions and decisions that affect how the app behaves.

## Development authentication

- **Decision:** API requests identify the current user with the `X-User-Id` header.
- **Reason:** This supports the brief's lightweight login stub and lets the API enforce user roles and ownership.
- **Trade-off / limitation:** This is not authentication. A client can claim another user's ID, so this must be replaced with real authentication before production use.

## Category deadlines

- **Decision:** Interpret `deadlineLocal` as Singapore local time (UTC+08:00), accept the `YYYY-MM-DDTHH:mm` format, and convert it to UTC when storing/returning the deadline.
- **Reason:** The API contract is understood to provide deadlines in Singapore local time, while timestamps are stored and returned consistently in UTC.
- **Trade-off / limitation:** The timezone and input format are fixed rather than user-configurable. Confirm this interpretation against the supplied brief before submission.

## Submission cutoff

- **Decision:** A draft may be submitted only while its category deadline is strictly later than the database's current time (`deadline > NOW()`).
- **Reason:** The database performs the eligibility check at the time of the state change, avoiding a stale application-side time check.
- **Trade-off / limitation:** A request at the exact deadline is rejected. This boundary interpretation should be checked against the brief if it specifies inclusive cutoff behavior.

## Judge scoring

- **Decision:** Accept only JSON integer scores from 1 through 10, and use `(entry_id, judge_id)` as the unique score key. Repeated saves update that score while judging remains open.
- **Reason:** A judge has one current score per entry; database uniqueness and an upsert make retries and concurrent updates safe from duplicate rows.
- **Trade-off / limitation:** Score history is not retained; only the latest score is stored. The range and integer-only rule reflect the contract as understood and should be confirmed against the brief.

## Leaderboard

- **Decision:** Include submitted entries with at least one score; calculate average and score count in PostgreSQL; round averages to two decimal places; sort by average descending and entry ID ascending; paginate at 20 entries per page.
- **Reason:** Database aggregation and pagination avoid loading the full result set into the application, and the entry-ID tie-breaker makes ordering deterministic.
- **Trade-off / limitation:** Page size and tie-breaker are fixed. Malformed page numbers return `400 invalid_page`; valid pages beyond the last result return an empty `items` array. Confirm these unspecified details against the brief.

## Database reset

- **Decision:** `npm run db:reset` drops and recreates the PostgreSQL `public` schema, then seeds the required development users and organisations.
- **Reason:** Provides a predictable local dataset for development and API testing.
- **Trade-off / limitation:** This deletes all data in that schema. Do not use it against a database containing data that needs to be retained.