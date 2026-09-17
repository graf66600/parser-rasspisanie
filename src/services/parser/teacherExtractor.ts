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
]);

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

  // Форматы: "Иванов", "Иванов И.И.", "Иванов И. И.", "Галич О.В.", "Трипольский Б.А."
  const teacherRegex = /^[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ]\.\s*[А-ЯЁ]\.?)?$/u;
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
  const clean = text.trim();
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

  // 1. Если известны колонки преподавателей, сначала сканируем их
  if (teacherColIndices.length > 0) {
    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row) continue;
      for (const colIdx of teacherColIndices) {
        const val = String(row[colIdx] || '').trim();
        if (isLikelyTeacherName(val)) {
          teachers.add(normalizeTeacherName(val));
        }
      }
    }
  }

  // 2. Сканируем всю матрицу для гарантии полноты
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').trim();
      if (isLikelyTeacherName(val)) {
        teachers.add(normalizeTeacherName(val));
      }
    }
  }

  return Array.from(teachers).sort((a, b) => a.localeCompare(b, 'ru'));
}
