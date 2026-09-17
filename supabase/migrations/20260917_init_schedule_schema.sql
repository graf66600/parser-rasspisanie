-- 1. Преподаватели
CREATE TABLE IF NOT EXISTS public.teachers (
  name TEXT PRIMARY KEY,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Занятия / Расписание
CREATE TABLE IF NOT EXISTS public.lessons (
  id TEXT PRIMARY KEY,
  teacher_name TEXT NOT NULL REFERENCES public.teachers(name) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  day_name TEXT NOT NULL,
  lesson_number INT NOT NULL CHECK (lesson_number BETWEEN 1 AND 10),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  subject TEXT NOT NULL,
  group_name TEXT NOT NULL,
  subgroup TEXT,
  classroom TEXT,
  week_type TEXT DEFAULT 'all',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lessons_teacher_day ON public.lessons(teacher_name, day_of_week);

-- 3. Студенты
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_student_group_name UNIQUE (group_name, full_name)
);

CREATE INDEX IF NOT EXISTS idx_students_group ON public.students(group_name);

-- 4. Журнал занятий
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  date_formatted TEXT,
  group_name TEXT NOT NULL,
  teacher_name TEXT NOT NULL DEFAULT 'Трипольский',
  lesson_number INT NOT NULL,
  subject TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  classroom TEXT,
  topic TEXT,
  topic_index INT,
  course_lesson_number INT,
  type TEXT DEFAULT 'theory',
  notes TEXT,
  attendance JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_group_date ON public.journal_entries(group_name, date);
CREATE INDEX IF NOT EXISTS idx_journal_teacher_date ON public.journal_entries(teacher_name, date);

-- Включение RLS и политик доступа
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_teachers') THEN
    CREATE POLICY allow_all_teachers ON public.teachers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_lessons') THEN
    CREATE POLICY allow_all_lessons ON public.lessons FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_students') THEN
    CREATE POLICY allow_all_students ON public.students FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_journal') THEN
    CREATE POLICY allow_all_journal ON public.journal_entries FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
