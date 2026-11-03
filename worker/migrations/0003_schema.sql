-- Generated from src/db/schema.ts; edit there.
ALTER TABLE titles ADD COLUMN air_info TEXT;
  ALTER TABLE titles ADD COLUMN air_checked_at TEXT;
  ALTER TABLE titles ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
