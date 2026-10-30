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

## AI mistakes, gaps, and how I checked
- The initial setup guidance described the project structure before the backend files existed. I checked the directory and package files, then had the backend starter files added.
- The initial tests cover only the health endpoint and rejection of `/api/me` without a user header. I reviewed the test file and confirmed they do not cover the main award workflows.
- The setup was tested in my current environment, not on a completely clean machine. I should not claim clean-machine verification until I perform it.
- At the last steps of completing S1, AI suggested me to still implement the close-judging route and GET/api/categories while it was not mentioned in the previous steps AI suggested, AI still done it anyway when I implemented them step-by-step.

## Suggestions I rejected
- None so far.