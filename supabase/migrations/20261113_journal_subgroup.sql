-- Compatibility only: does not change Auth/RLS or assign any roles.
-- Prepared for manual application after a database backup; not applied by the app.
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS subgroup INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'journal_entries_subgroup_check'
      AND conrelid = 'public.journal_entries'::regclass
  ) THEN
    ALTER TABLE public.journal_entries
      ADD CONSTRAINT journal_entries_subgroup_check CHECK (subgroup IN (1, 2));
  END IF;
END $$;
