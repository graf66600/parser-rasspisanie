import pdf from 'pdf-parse';
import { PdfTextItem, PdfColumnGroup, PdfLessonRow } from './pdfTypes.js';
import { DAYS_OF_WEEK } from '../../config/config.js';

/**
 * Извлекает все текстовые элементы с координатами из буфера PDF
 */
export async function extractAllPdfItems(buffer: Buffer): Promise<PdfTextItem[]> {
  const allItems: PdfTextItem[] = [];

  await (pdf as any)(buffer, {
    pagerender: (pageData: any) => {
      const pageIdx = pageData.pageIndex;
      return pageData.getTextContent().then((tc: any) => {
        tc.items.forEach((it: any) => {
          const str = (it.str || '').trim();
          if (str) {
            allItems.push({
              page: pageIdx,
              str,
              x: Math.round(it.transform[4]),
              y: Math.round(it.transform[5]),
              w: Math.round(it.width || 0),
              h: Math.round(it.height || 0),
            });
          }
        });
        return '';
      });
    },
  });

  return allItems;
}

/**
 * Автоматическое обнаружение строк уроков и дней недели
 */
export function detectLessonRows(items: PdfTextItem[]): PdfLessonRow[] {
  const p0Items = items.filter((i) => i.page === 0);

  // Ищем маркеры номеров пар в левой части страницы
  const leftLessonMarkers = p0Items
    .filter((i) => i.x < 70 && /^[1-7]$/.test(i.str))
    .sort((a, b) => b.y - a.y);

  if (leftLessonMarkers.length === 0) {
    return [];
  }

  let currentDay = 0;
  const rows: PdfLessonRow[] = [];

  for (let i = 0; i < leftLessonMarkers.length; i++) {
    const marker = leftLessonMarkers[i];
    const num = parseInt(marker.str, 10);

    // Новая пара 1 или первое занятие — начало нового дня недели
    if (num === 1 || currentDay === 0) {
      currentDay++;
    }

    // Поиск времени вблизи номера пары
    const timeItem = p0Items.find(
      (it) => it.x < 70 && Math.abs(it.y - marker.y) <= 2 && /\d{1,2}[\.:]\d{2}/.test(it.str)
    );

    let startTime = '';
    let endTime = '';

    if (timeItem) {
      const tm = timeItem.str.match(/(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})/);
      if (tm) {
        startTime = `${tm[1].padStart(2, '0')}:${tm[2]}`;
        endTime = `${tm[3].padStart(2, '0')}:${tm[4]}`;
      }
    }

    rows.push({
      dayOfWeek: currentDay,
      dayName: DAYS_OF_WEEK[currentDay] || 'Понедельник',
      lessonNumber: num,
      y: marker.y,
      startTime,
      endTime,
    });
  }

  return rows;
}

/**
 * Обнаружение колонок учебных групп для указанной страницы с точными границами
 */
export function detectColumnGroups(items: PdfTextItem[], pageIndex: number): PdfColumnGroup[] {
  const pageItems = items.filter((i) => i.page === pageIndex);

  // Группы находятся в верхней части страницы (y > 450)
  const rawGroups = pageItems
    .filter((i) => i.y > 450 && /^[1-5]\d[а-яА-Яa-zA-Z]{1,4}$/.test(i.str))
    .sort((a, b) => a.x - b.x);

  // Дедупликация близких заголовков
  const groups: PdfTextItem[] = [];
  for (const g of rawGroups) {
    const exists = groups.some(
      (existing) =>
        existing.str.toLowerCase() === g.str.toLowerCase() && Math.abs(existing.x - g.x) < 20
    );
    if (!exists) {
      groups.push(g);
    }
  }

  if (groups.length === 0) {
    return [];
  }

  // Маркеры правых границ подколонок ('Noпары')
  const pairMarkers = pageItems
    .filter((i) => i.y > 450 && /Noпары/i.test(i.str))
    .sort((a, b) => a.x - b.x);

  let prevRight = groups[0].x - 35;
  const result: PdfColumnGroup[] = [];

  for (let idx = 0; idx < groups.length; idx++) {
    const g = groups[idx];
    let xMax: number;

    const rightMarker = pairMarkers.find((p) => p.x > g.x - 10 && p.x > prevRight);
    if (rightMarker) {
      xMax = rightMarker.x + 1;
    } else if (idx < groups.length - 1) {
      xMax = Math.round((g.x + groups[idx + 1].x) / 2);
    } else {
      xMax = g.x + 45;
    }

    const xMin = prevRight;
    prevRight = xMax;

    result.push({
      group: g.str,
      x: g.x,
      xMin,
      xMax,
      page: pageIndex,
    });
  }

  return result;
}
