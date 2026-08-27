-- Clue Me persistent state (PostgreSQL / Neon)
-- The server creates this table automatically; this file is supplied for reference.

CREATE TABLE IF NOT EXISTS clue_me_state (
  state_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clue_me_state_updated_at_idx
  ON clue_me_state (updated_at DESC);
