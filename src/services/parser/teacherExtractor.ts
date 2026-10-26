// ==========================================================================
// TEACHER EXTRACTOR: модуль распознавания преподавателей из Excel
// ==========================================================================
const EXCLUDED_WORDS = new Set([
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
  'воскресенье',
  'день',
  'пара',
  'урок',
  'время',
  'предмет',
  'дисциплина',
  'преподаватель',
  'учитель',
  'фио',
  'корпус',
  'аудитория',
  'кабинет',
  'группа',
  'неделя',
  'расписание',
  'информатика',
  'математика',
  'физика',
  'химия',
  'биология',
  'история',
  'литература',
  'русский',
  'английский',
  'иностранный',
  'физкультура',
  'бжд',
  'астрономия',
  'география',
  'обществознание',
  'ботаника',
  'фармакология',
  'терапия',
  'хирургия',
  'педиатрия',
  'гигиена',
  'анатомия',
  'генетика',
  'микробиология',
  'экономика',
  'право',
  'латинский',
  'психология',
  'история россии',
  'физра',
  'практика',
  'производственная практика',
  'учебная практика',
  'тестирование',
  'воспитательный час',
  'классный час',
  'консультация',
  'экзамен',
  'зачет',
]);

const TEACHER_CORRECTIONS: Record<string, string> = {
  'бондарекно': 'Бондаренко',
  'шупрудькл': 'Шупрудько',
  'полтавец вв': 'Полтавец В.В.',
  'полтавец рн': 'Полтавец Р.Н.',
  'галич ти': 'Галич Т.И.',
  'галич о.в.': 'Галич О.В.',
  'галич': 'Галич О.В.',
};

/**
 * Проверка, является ли строка именем / фамилией преподавателя
 */
export function isLikelyTeacherName(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  if (clean.length < 3 || clean.length > 35) return false;

  const lower = clean.toLowerCase();
  if (EXCLUDED_WORDS.has(lower)) return false;

  // Не должно содержать явных маркеров кабинетов или времени
  if (/^(каб|ауд|корп|\d+[\.:]\d+)/i.test(clean)) return false;
  if (/^\d+$/.test(clean)) return false;

  // Проверка составных фамилий через слэш (Гапчиева/ Трипольский)
  if (clean.includes('/')) {
    const parts = clean.split('/').map(p => p.trim());
    return parts.every(p => isLikelyTeacherName(p));
  }

  // Форматы: "Иванов", "Бондарь-Засядько", "Галич О.В.", "Полтавец ВВ", "Трипольский Б.А."
  const teacherRegex = /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ]\.?\s*[А-ЯЁ]\.?)?$/u;
  if (teacherRegex.test(clean)) {
    return true;
  }

  // Два слова (Фамилия Имя / Фамилия И.О.)
  const twoWordsRegex = /^[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+$/u;
  if (twoWordsRegex.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Нормализация имени преподавателя (например "Галич О.В." -> "Галич О.В.", "трипольский" -> "Трипольский")
 */
export function normalizeTeacherName(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  const lower = clean.toLowerCase();
  if (TEACHER_CORRECTIONS[lower]) {
    return TEACHER_CORRECTIONS[lower];
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Извлечение списка всех уникальных преподавателей из матрицы листа Excel
 */
export function extractTeachersFromMatrix(
  matrix: any[][],
  teacherColIndices: number[] = []
): string[] {
  const teachers = new Set<string>();

  const addTeacherOrParts = (val: string) => {
    if (!val) return;
    if (val.includes('/')) {
      const parts = val.split('/').map((p) => p.trim());
      for (const p of parts) {
        if (isLikelyTeacherName(p)) {
          teachers.add(normalizeTeacherName(p));
        }
      }
    } else if (isLikelyTeacherName(val)) {
      teachers.add(normalizeTeacherName(val));
    }
  };

  // 1. Если известны колонки преподавателей, сначала сканируем их
  if (teacherColIndices.length > 0) {
    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row) continue;
      for (const colIdx of teacherColIndices) {
        addTeacherOrParts(String(row[colIdx] || '').trim());
      }
    }
  }

  // 2. Сканируем всю матрицу для гарантии полноты
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      addTeacherOrParts(String(row[c] || '').trim());
    }
  }

  return Array.from(teachers).sort((a, b) => a.localeCompare(b, 'ru'));
}
