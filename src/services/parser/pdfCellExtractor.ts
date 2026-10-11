import { Lesson, LessonTime } from '../../types/schedule.js';
import { PdfTextItem, PdfColumnGroup, PdfLessonRow } from './pdfTypes.js';
import { isLikelyTeacherName, normalizeTeacherName } from './teacherExtractor.js';
import { getLessonTimes } from './parserUtils.js';

const KNOWN_SUBJECTS_REGEX = /^(Информатика|Биология|Химия|Физика|Математика|История|Литература|ОБЗР|География|Обществознание|Физра|Анатомия|Фармакология|Микробиология|Латин|Здоровый|Сестринский|Клиническая|Бережливое|Производствен|Учебная)/i;

/**
 * Извлекает занятия из набора текстовых элементов конкретной ячейки
 */
export function extractLessonsFromCell(
  cellItems: PdfTextItem[],
  col: PdfColumnGroup,
  row: PdfLessonRow,
  bells: LessonTime[]
): Lesson[] {
  if (cellItems.length === 0) return [];

  const defaultTimes = getLessonTimes(row.lessonNumber, bells);
  const startTime = row.startTime || defaultTimes.startTime;
  const endTime = row.endTime || defaultTimes.endTime;

  // 1. Поиск предмета
  const subjectItem = cellItems.find((i) => KNOWN_SUBJECTS_REGEX.test(i.str));
  let subject = subjectItem ? subjectItem.str : '';

  if (!subject) {
    const genericItem = cellItems.find(
      (i) =>
        i.str.length > 3 &&
        !i.str.includes('/') &&
        !isLikelyTeacherName(i.str) &&
        !/^(Предмет|Преподаватель|Noпары|корпус|аудитория|\d+)$/i.test(i.str)
    );
    subject = genericItem ? genericItem.str : 'Занятие';
  }

  // Очистка склеенных названий предметов (например, "ИнформатикаИнформатика")
  if (/^([А-Яа-яёЁ]+)\1$/i.test(subject)) {
    subject = subject.slice(0, subject.length / 2);
  }

  // 2. Случай подгрупп с косой чертой (например "Гапчиева/ Трипольский")
  const teacherSlashItem = cellItems.find(
    (i) =>
      i.str.includes('/') &&
      i.str.length > 5 &&
      !/^\d+\s*\/\s*\d+$/.test(i.str) &&
      !/^[А-Яа-яёЁ]{1,3}\s*\/\s*[А-Яа-яёЁ]*$/.test(i.str)
  );

  if (teacherSlashItem) {
    const tParts = teacherSlashItem.str.split('/').map((s) => s.trim());
    if (tParts.length === 2) {
      let r1 = '';
      let r2 = '';
      const roomSlashItem = cellItems.find((i) => /\d+\s*\/\s*\d+/.test(i.str));
      if (roomSlashItem) {
        const rParts = roomSlashItem.str.split('/').map((r) => r.trim());
        r1 = rParts[0] || '';
        r2 = rParts[1] || '';
      } else {
        // Случай когда номер с косой чертой разбит: "6/" и "230"
        const trailingSlash = cellItems.find((i) => /^\d+\s*\/$/.test(i.str));
        if (trailingSlash) {
          r1 = trailingSlash.str.replace('/', '').trim();
          const nextNum = cellItems.find(
            (i) => /^\d{2,3}$/.test(i.str) && i !== trailingSlash && i.x >= trailingSlash.x
          );
          if (nextNum) r2 = nextNum.str.trim();
        }
      }

      // Корпуса со слэшем (например "ГЛ/ О" или "ГЛ/" и "О")
      let b1 = '';
      let b2 = '';
      const bSlashItem = cellItems.find(
        (i) =>
          i !== teacherSlashItem &&
          /^[А-Яа-яёЁ]{1,3}\s*\/\s*[А-Яа-яёЁ]*/.test(i.str) &&
          !/\d/.test(i.str)
      );
      if (bSlashItem) {
        const bParts = bSlashItem.str.split('/').map((b) => b.trim());
        b1 = bParts[0] || '';
        b2 = bParts[1] || '';
        if (!b2) {
          const secondBuilding = cellItems.find(
            (i) => i !== bSlashItem && /^[А-Яа-яёЁ]{1,2}$/.test(i.str) && i.x >= bSlashItem.x
          );
          if (secondBuilding) b2 = secondBuilding.str.trim();
        }
      }

      const classroom1 = [b1, r1].filter(Boolean).join(', ауд. ') || (r1 ? `ауд. ${r1}` : '');
      const classroom2 = [b2, r2].filter(Boolean).join(', ауд. ') || (r2 ? `ауд. ${r2}` : '');

      return [
        {
          id: `pdf_${col.group}_${row.dayOfWeek}_${row.lessonNumber}_sub1`,
          dayOfWeek: row.dayOfWeek,
          dayName: row.dayName,
          lessonNumber: row.lessonNumber,
          startTime,
          endTime,
          subject,
          group: col.group,
          subgroup: '1',
          teacher: normalizeTeacherName(tParts[0]),
          classroom: classroom1,
          weekType: 'all',
        },
        {
          id: `pdf_${col.group}_${row.dayOfWeek}_${row.lessonNumber}_sub2`,
          dayOfWeek: row.dayOfWeek,
          dayName: row.dayName,
          lessonNumber: row.lessonNumber,
          startTime,
          endTime,
          subject,
          group: col.group,
          subgroup: '2',
          teacher: normalizeTeacherName(tParts[1]),
          classroom: classroom2,
          weekType: 'all',
        },
      ];
    }
  }

  // 3. Одиночный урок
  const teacherCandidates = cellItems.filter(
    (i) =>
      isLikelyTeacherName(i.str) &&
      !/^(Предмет|Преподаватель|Noпары|корпус|аудитория)$/i.test(i.str)
  );
  const teacher = teacherCandidates.length > 0 ? normalizeTeacherName(teacherCandidates[0].str) : '';

  // Поиск кабинета и корпуса
  const buildingItem = cellItems.find((i) => /^(ГЛ|О|мм|с\/з|спортзал)$/i.test(i.str));
  const roomNumItem = cellItems.find(
    (i) => /^\d{1,3}[а-яА-Я]?$/.test(i.str) && i.str !== String(row.lessonNumber)
  );

  let classroom = '';
  if (buildingItem && roomNumItem) {
    classroom = `${buildingItem.str}, ауд. ${roomNumItem.str}`;
  } else if (roomNumItem) {
    classroom = `ауд. ${roomNumItem.str}`;
  } else if (buildingItem) {
    classroom = buildingItem.str;
  }

  if (teacher || (subject && subject !== 'Занятие')) {
    return [
      {
        id: `pdf_${col.group}_${row.dayOfWeek}_${row.lessonNumber}`,
        dayOfWeek: row.dayOfWeek,
        dayName: row.dayName,
        lessonNumber: row.lessonNumber,
        startTime,
        endTime,
        subject,
        group: col.group,
        teacher: teacher || '',
        classroom,
        weekType: 'all',
      },
    ];
  }

  return [];
}
