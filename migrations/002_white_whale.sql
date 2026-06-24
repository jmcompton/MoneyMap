-- The white whale: the big account a rep is chasing but hasn't closed, the one
-- sitting right under the 80%. It isn't in the commission data (you don't sell
-- them yet), so it has to be flagged on purpose, then surfaced on the homepage
-- so the rep sees it every day instead of forgetting it behind the easy wins.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_target BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS target_value NUMERIC NOT NULL DEFAULT 0;
