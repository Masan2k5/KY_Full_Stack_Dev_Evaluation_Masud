# AI Log

## Main prompts
- Asked AI how to start the project based on Candidate brief (1).pdf.
- Asked AI how to create the React/Node/PostgreSQL project setup.
- Asked AI to add the server structure, database schema/reset script, starter API, and tests.
- Asked AI to explain the setup and help troubleshoot Docker and npm workspace commands.
- Asked AI to add S1 programme creation and organiser-only programme listing, guided by API tests.
- Asked AI to implement S1 category creation with Singapore-to-UTC deadline validation and tests.
- Asked AI to implement S1 judging closure with organiser ownership checks and tests.
- Asked AI to complete S1 route test coverage and implement the authenticated categories listing endpoint.
- Asked AI to add S2 tests for applicant draft-entry creation, validation, missing categories, and role permissions.
- Asked AI to implement the applicant-only `POST /api/entries` draft creation route.
- Asked AI to add and implement tests for editing draft entries, owner checks, invalid fields, and submitted-entry conflicts.
- Asked AI to add and implement submission tests for deadline enforcement, duplicate submissions, and applicant ownership.
- Asked AI to add S3 judge-assignment tests for owner access, idempotent repeats, invalid judges, draft entries, and organiser ownership.
- Asked AI to implement `POST /api/entries/:id/assignments` with database-side ownership and submission checks.
- Asked AI to test and implement the judge-only assigned entries list, including assigned-entry visibility and role restrictions.
- Asked AI to test and implement individual entry access for applicants, owning organisers, assigned judges, and unauthorized users.
- Asked AI to add S4 scoring tests for saves, updates, retries, score validation, assignment, role, and closed-judging behavior.
- Asked AI to implement `PUT /api/entries/:id/score` with assignment and open-judging checks plus an idempotent score upsert.
- Asked AI to add a concurrent score-update test confirming one score row remains with one of the submitted values.
- Asked AI to add S5 leaderboard tests for eligibility, average rounding, tie ordering, pagination, and organiser ownership.
- Asked AI to implement the S5 leaderboard API with database-side aggregation, stable ordering, pagination, and positive-page validation.
- Asked AI to replace the Vite starter screen with a judge workspace that lists assigned entries and lets judges select an entry.
- Asked AI to implement judge score saving with the required API request, success state, updated displayed score, and visible failure messages.
- Asked AI to map the API test suite against the endpoint contract and add tests only for identified coverage gaps (S7).
- Asked AI to verify S7 tests use isolated API-created fixtures, scoped assertions, and dependency-safe cleanup.
- Asked AI to verify Singapore deadline conversion, submission boundary behavior, and existing assignment/score retry and concurrency guarantees.
- Asked AI to verify leaderboard eligibility, aggregation, ordering, page validation, and populated-page boundaries (S7).

## AI mistakes, gaps, and how I checked
- The initial setup guidance described the project structure before the backend files existed. I checked the directory and package files, then had the backend starter files added.
- The initial tests cover only the health endpoint and rejection of `/api/me` without a user header. I reviewed the test file and confirmed they do not cover the main award workflows.
- The setup was tested in my current environment, not on a completely clean machine. I should not claim clean-machine verification until I perform it.
- At the last steps of completing S1, AI suggested me to still implement the close-judging route and GET/api/categories while it was not mentioned in the previous steps AI suggested, AI still done it anyway when I implemented them step-by-step.
- The first judge-visibility test assumed the database contained no assignments from earlier test runs. Its failure exposed that assumption; I changed it to assert visibility and exclusion for entries created by that test, independent of unrelated existing rows.
- During S7 coverage work, AI initially used a direct database update to mark a draft entry submitted in a test. The isolation review caught it; I replaced it with the submission API. Direct SQL remains only for controlled deadline-boundary setup, row assertions, and fixture cleanup.
- AI initially left the S6 judge score-saving prompt at the end of the AI log after adding later S7 prompts, making the prompt history out of order. I caught and moved it back into chronological order during final diff review.

## Suggestions I rejected
- AI initially showed the Step 3 commit message as: "S3: add judge assignments and entry access". I rejected that and instead changed the commit message to "S3 (Step 3): Add judge assignments and entry access" as that explains the S3 naming even better.