-- ==========================================================================
-- MIGRATION: STUDENT SUBGROUPS, APP METADATA & REPLACEMENTS
-- ==========================================================================

-- 1. Добавление подгруппы в таблицу студентов
ALTER TABLE IF EXISTS public.students ADD COLUMN IF NOT EXISTS subgroup INT DEFAULT 1;

-- 2. Метаданные приложения (подгруппы, расписание звонков, статус очередей)
CREATE TABLE IF NOT EXISTS public.app_metadata (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Замены занятий и переносы
CREATE TABLE IF NOT EXISTS public.lesson_overrides (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  lesson_number INT NOT NULL,
  group_name TEXT NOT NULL,
  teacher_name TEXT NOT NULL,
  override_type TEXT NOT NULL CHECK (override_type IN ('replaced', 'cancelled', 'moved', 'custom')),
  notes TEXT,
  new_classroom TEXT,
  new_teacher TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_overrides_date_group ON public.lesson_overrides(date, group_name);

-- RLS Политики
ALTER TABLE public.app_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_app_metadata') THEN
    CREATE POLICY allow_all_app_metadata ON public.app_metadata FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_lesson_overrides') THEN
    CREATE POLICY allow_all_lesson_overrides ON public.lesson_overrides FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
