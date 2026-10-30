/* created the database tables for organisations, users, programmes, 
categories, entries, judge assignments, and scores. 
The score table allows only one score per judge per entry, 
which helps ensure retries don’t create duplicate scores. */

CREATE TABLE organisations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('organiser', 'judge', 'applicant')),
  organisation_id INTEGER NOT NULL REFERENCES organisations(id)
);

CREATE TABLE programmes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  organiser_id INTEGER NOT NULL REFERENCES users(id),
  judging_closed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  programme_id BIGINT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  deadline TIMESTAMPTZ NOT NULL
);

CREATE TABLE entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES categories(id),
  applicant_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted')),
  submitted_at TIMESTAMPTZ
);

CREATE TABLE judge_assignments (
  entry_id BIGINT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  judge_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (entry_id, judge_id)
);

CREATE TABLE scores (
  entry_id BIGINT NOT NULL,
  judge_id INTEGER NOT NULL,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 10),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entry_id, judge_id),
  FOREIGN KEY (entry_id, judge_id)
    REFERENCES judge_assignments(entry_id, judge_id) ON DELETE CASCADE
);

CREATE INDEX entries_category_status_idx ON entries(category_id, status);
CREATE INDEX judge_assignments_judge_entry_idx ON judge_assignments(judge_id, entry_id);
