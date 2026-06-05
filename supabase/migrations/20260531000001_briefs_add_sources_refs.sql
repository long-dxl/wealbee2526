-- Add sources (list of source objects) and refs (numbered ref registry) to briefs
-- so that deep-research outputs retain their citation data in the inbox.

ALTER TABLE briefs
  ADD COLUMN IF NOT EXISTS sources JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS refs    JSONB DEFAULT '[]'::jsonb;
