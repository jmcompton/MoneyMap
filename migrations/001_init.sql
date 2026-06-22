-- MoneyMap foundation schema (multi-tenant).
-- Every row is scoped to an organization. Built multi-tenant from day one
-- even though there is one tenant now, because retrofitting it later is brutal.

CREATE TABLE IF NOT EXISTS organizations (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  org_id         INTEGER NOT NULL REFERENCES organizations(id),
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'rep',
  created_at     TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manufacturers (
  id          SERIAL PRIMARY KEY,
  org_id      INTEGER NOT NULL REFERENCES organizations(id),
  name        TEXT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id                SERIAL PRIMARY KEY,
  org_id            INTEGER NOT NULL REFERENCES organizations(id),
  name              TEXT NOT NULL,
  account_type      TEXT NOT NULL DEFAULT 'other',
  city              TEXT,
  state             TEXT,
  zip               TEXT,
  assigned_user_id  INTEGER REFERENCES users(id),
  last_contact_at   TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id          SERIAL PRIMARY KEY,
  account_id  INTEGER NOT NULL REFERENCES accounts(id),
  name        TEXT,
  email       TEXT,
  phone       TEXT,
  title       TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- The moat. Maps a raw name off a commission report (normalized) to the
-- canonical account, per manufacturer. Captures Debbie's tribal knowledge
-- ("Celltech" = "NCS" = the same account) as data, once, forever.
CREATE TABLE IF NOT EXISTS account_aliases (
  id               SERIAL PRIMARY KEY,
  org_id           INTEGER NOT NULL REFERENCES organizations(id),
  manufacturer_id  INTEGER NOT NULL REFERENCES manufacturers(id),
  raw_name         TEXT NOT NULL,
  account_id       INTEGER NOT NULL REFERENCES accounts(id),
  created_at       TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (org_id, manufacturer_id, raw_name)
);

CREATE TABLE IF NOT EXISTS commission_imports (
  id               SERIAL PRIMARY KEY,
  org_id           INTEGER NOT NULL REFERENCES organizations(id),
  manufacturer_id  INTEGER NOT NULL REFERENCES manufacturers(id),
  uploaded_by      INTEGER REFERENCES users(id),
  period_label     TEXT NOT NULL,
  source_filename  TEXT,
  row_count        INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'processed',
  created_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commission_line_items (
  id                   SERIAL PRIMARY KEY,
  import_id            INTEGER NOT NULL REFERENCES commission_imports(id),
  org_id               INTEGER NOT NULL REFERENCES organizations(id),
  manufacturer_id      INTEGER NOT NULL REFERENCES manufacturers(id),
  raw_account_name     TEXT NOT NULL,
  amount               NUMERIC NOT NULL DEFAULT 0,
  period_label         TEXT,
  resolved_account_id  INTEGER REFERENCES accounts(id),
  match_status         TEXT NOT NULL DEFAULT 'unmatched',
  created_at           TIMESTAMP NOT NULL DEFAULT now()
);

-- Pipeline: deals the rep is working, with value and close date.
CREATE TABLE IF NOT EXISTS deals (
  id          SERIAL PRIMARY KEY,
  org_id      INTEGER NOT NULL REFERENCES organizations(id),
  account_id  INTEGER REFERENCES accounts(id),
  name        TEXT NOT NULL,
  manufacturer TEXT,
  value       NUMERIC NOT NULL DEFAULT 0,
  stage       TEXT NOT NULL DEFAULT 'open',
  close_date  DATE,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- AI-surfaced leads near the rep's route.
CREATE TABLE IF NOT EXISTS leads (
  id           SERIAL PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES organizations(id),
  name         TEXT NOT NULL,
  city         TEXT,
  reason       TEXT,
  est_value    NUMERIC DEFAULT 0,
  distance_mi  NUMERIC,
  created_at   TIMESTAMP NOT NULL DEFAULT now()
);

-- Today's planned stops (the route). The full planner comes later; this is
-- the homepage surface it feeds.
CREATE TABLE IF NOT EXISTS route_stops (
  id            SERIAL PRIMARY KEY,
  org_id        INTEGER NOT NULL REFERENCES organizations(id),
  user_id       INTEGER REFERENCES users(id),
  account_id    INTEGER REFERENCES accounts(id),
  label         TEXT NOT NULL,
  city          TEXT,
  arrival_time  TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'planned',
  stop_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMP NOT NULL DEFAULT now()
);

-- Follow-ups / tasks.
CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  org_id      INTEGER NOT NULL REFERENCES organizations(id),
  user_id     INTEGER REFERENCES users(id),
  account_id  INTEGER REFERENCES accounts(id),
  title       TEXT NOT NULL,
  due_date    DATE,
  done        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);
