import * as xlsx from 'xlsx';
import { Lesson, LessonTime } from '../types/schedule.js';
import { DAYS_OF_WEEK, DAY_NAME_TO_NUMBER, DEFAULT_BELLS } from '../config/config.js';

export interface ParseResult {
  lessons: Lesson[];
  sheetsParsed: string[];
  totalFound: number;
}

export class ExcelParser {
  /**
   * Парсинг расписания из буфера Excel файла
   */
  public static parseBuffer(
    buffer: Buffer,
    bells: LessonTime[] = DEFAULT_BELLS,
    teacherFilter: string = 'Трипольский',
    subjectFilter: string = 'Информатика'
  ): ParseResult {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const lessons: Lesson[] = [];
    const sheetsParsed: string[] = [];

    const teacherLower = teacherFilter.toLowerCase().trim();
    const subjectLower = subjectFilter.toLowerCase().trim();

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      sheetsParsed.push(sheetName);

      // Конвертируем лист в двумерный массив строк/значений
      const matrix: any[][] = xlsx.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
      });

      if (!matrix || matrix.length === 0) continue;

      // Способ 0: Многоколоночное расписание учебных групп колледжа (группы в столбцах, подколонки пар)
      const collegeLessons = this.parseAsMultiGroupSchedule(
        matrix,
        teacherLower,
        subjectLower,
        bells,
        sheetName
      );
      if (collegeLessons.length > 0) {
        lessons.push(...collegeLessons);
        continue;
      }

      // Способ 1: Прямой поиск в табличном виде (колонки: День, Пара/Время, Предмет, Преподаватель...)
      const listLessons = this.parseAsListTable(matrix, teacherLower, bells, sheetName);
      if (listLessons.length > 0) {
        lessons.push(...listLessons);
        continue;
      }

      // Способ 2: Классическая сетка (колонки групп или дней, строки пар)
      const matrixLessons = this.parseAsGridMatrix(
        matrix,
        teacherLower,
        subjectLower,
        bells,
        sheetName
      );
      lessons.push(...matrixLessons);
    }

    // Удаляем дубликаты уроков
    const uniqueLessons = this.deduplicateLessons(lessons);

    // Сортируем: по дню недели (1..7), затем по номеру пары (1..10)
    uniqueLessons.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) {
        return a.dayOfWeek - b.dayOfWeek;
      }
      return a.lessonNumber - b.lessonNumber;
    });

    return {
      lessons: uniqueLessons,
      sheetsParsed,
      totalFound: uniqueLessons.length,
    };
  }

  /**
   * Способ 0: Многоколоночное расписание учебных групп
   * Структура:
   *  - Строка 0: группы (11МС, 11ф, 21мс ...)
   *  - Строка 1: подколонки групп (№пары, Предмет, Преподаватель, корпус, аудитория)
   *  - Колонки 0..3: день недели, номер пары, время (8.00-9.20)
   */
  private static parseAsMultiGroupSchedule(
    matrix: any[][],
    teacherFilter: string,
    subjectFilter: string,
    bells: LessonTime[],
    sheetName: string
  ): Lesson[] {
    if (matrix.length < 3) return [];

    // Ищем строку с подзаголовками групп (где неоднократно встречаются 'предмет' или 'преподаватель')
    let subHeaderRowIdx = -1;
    let groupHeaderRowIdx = -1;

    for (let r = 0; r < Math.min(matrix.length, 5); r++) {
      const row = matrix[r].map((cell) => String(cell || '').toLowerCase().trim());
      const subjectCount = row.filter((c) => c.includes('предмет') || c.includes('дисциплин')).length;
      const teacherCount = row.filter((c) => c.includes('преподавател') || c.includes('учител') || c.includes('фио')).length;

      // В многоколоночном расписании подколонки групп повторяются минимум для 2 групп
      if (subjectCount >= 2 || teacherCount >= 2) {
        subHeaderRowIdx = r;
        groupHeaderRowIdx = r > 0 ? r - 1 : 0;
        break;
      }
    }

    if (subHeaderRowIdx === -1) {
      return [];
    }

    const groupRow = matrix[groupHeaderRowIdx] || [];
    const subHeaderRow = matrix[subHeaderRowIdx] || [];

    // Определяем группы и их колонки
    interface GroupColumns {
      name: string;
      lessonNumCol?: number;
      subjectCol?: number;
      teacherCol?: number;
      buildingCol?: number;
      roomCol?: number;
    }

    // Определяем начальную колонку, с которой начинаются группы (обычно со столбца 4)
    let startGroupCol = -1;
    for (let c = 0; c < Math.max(groupRow.length, subHeaderRow.length); c++) {
      const sub = String(subHeaderRow[c] || '').toLowerCase().trim();
      if (sub.includes('предмет') || sub.includes('преподавател') || sub.includes('№пары')) {
        startGroupCol = c;
        break;
      }
    }

    if (startGroupCol === -1) return [];

    const groups: GroupColumns[] = [];
    let currentGroup: GroupColumns | null = null;

    for (let c = startGroupCol; c < Math.max(groupRow.length, subHeaderRow.length); c++) {
      const gName = groupRow[c] !== undefined && groupRow[c] !== null ? String(groupRow[c]).trim() : '';
      if (gName) {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { name: gName };
      }
      if (!currentGroup) continue;

      const sub = String(subHeaderRow[c] || '').toLowerCase().trim();
      if (sub.includes('№пары') || sub.includes('пара') || sub.includes('урок')) {
        currentGroup.lessonNumCol = c;
      } else if (sub.includes('предмет') || sub.includes('дисциплин')) {
        if (currentGroup.subjectCol === undefined) currentGroup.subjectCol = c;
      } else if (sub.includes('преподавател') || sub.includes('учител') || sub.includes('фио')) {
        currentGroup.teacherCol = c;
      } else if (sub.includes('корпус')) {
        currentGroup.buildingCol = c;
      } else if (sub.includes('аудитор') || sub.includes('каб')) {
        currentGroup.roomCol = c;
      }
    }
    if (currentGroup) groups.push(currentGroup);

    if (groups.length === 0) return [];

    // Служебные колонки слева от групп (день, номер пары, время)
    let dayCol = -1;
    let commonLessonNumCol = -1;
    let commonTimeCol = -1;

    for (let c = 0; c < startGroupCol; c++) {
      for (let r = subHeaderRowIdx + 1; r < Math.min(matrix.length, subHeaderRowIdx + 15); r++) {
        const val = String(matrix[r]?.[c] || '').trim();
        if (!val) continue;
        if (this.extractDayFromText(val) !== null && dayCol === -1) {
          dayCol = c;
        }
        if (this.parseTimeRange(val) !== null && commonTimeCol === -1) {
          commonTimeCol = c;
        }
        const num = this.extractLessonNumber(val);
        if (num !== null && num >= 1 && num <= 10 && commonLessonNumCol === -1 && dayCol !== c && commonTimeCol !== c) {
          commonLessonNumCol = c;
        }
      }
    }

    if (dayCol === -1 && startGroupCol > 1) dayCol = 1;
    if (commonLessonNumCol === -1 && startGroupCol > 2) commonLessonNumCol = 2;
    if (commonTimeCol === -1 && startGroupCol > 3) commonTimeCol = 3;

    let currentDayNumber = this.extractDayFromText(sheetName) || 1;
    let currentDayName = DAYS_OF_WEEK[currentDayNumber] || 'Понедельник';

    const lessons: Lesson[] = [];

    for (let r = subHeaderRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.length === 0) continue;

      // Проверяем день недели
      if (dayCol !== -1 && row[dayCol]) {
        const foundDay = this.extractDayFromText(String(row[dayCol]));
        if (foundDay) {
          currentDayNumber = foundDay;
          currentDayName = DAYS_OF_WEEK[foundDay] || 'Понедельник';
        }
      }

      // Общий номер пары и время из левой части
      let commonLessonNum = 1;
      if (commonLessonNumCol !== -1 && row[commonLessonNumCol]) {
        const num = this.extractLessonNumber(String(row[commonLessonNumCol]));
        if (num) commonLessonNum = num;
      }

      const commonTimeStr = commonTimeCol !== -1 ? String(row[commonTimeCol] || '').trim() : '';

      // Проходим по группам
      for (const g of groups) {
        const teacherVal = g.teacherCol !== undefined ? String(row[g.teacherCol] || '').trim() : '';
        const subjectVal = g.subjectCol !== undefined ? String(row[g.subjectCol] || '').trim() : '';

        if (!teacherVal && !subjectVal) continue;

        const teacherLower = teacherVal.toLowerCase();
        const subjectLower = subjectVal.toLowerCase();

        // Проверяем фильтрацию
        const matchesTeacher = teacherFilter ? teacherLower.includes(teacherFilter) : true;
        const matchesSubjectOnly = !matchesTeacher && subjectFilter && subjectLower.includes(subjectFilter);

        // Если совпал только предмет, но указан чужой преподаватель — пропускаем
        if (matchesSubjectOnly && teacherVal) {
          if (!teacherLower.includes(teacherFilter)) {
            continue;
          }
        }

        if (!matchesTeacher && !matchesSubjectOnly) {
          continue;
        }

        // Номер пары для группы (индивидуальный или общий)
        let lessonNum = commonLessonNum;
        if (g.lessonNumCol !== undefined && row[g.lessonNumCol]) {
          const num = this.extractLessonNumber(String(row[g.lessonNumCol]));
          if (num) lessonNum = num;
        }

        // Время пары
        let times: { startTime: string; endTime: string };
        const parsedTime = this.parseTimeRange(commonTimeStr);
        if (parsedTime) {
          times = parsedTime;
        } else {
          times = this.getLessonTimes(lessonNum, bells);
        }

        // Корпус и аудитория
        const building = g.buildingCol !== undefined ? String(row[g.buildingCol] || '').trim() : '';
        const room = g.roomCol !== undefined ? String(row[g.roomCol] || '').trim() : '';

        let classroom = '';
        if (building && room) {
          classroom = `${building}, ауд. ${room}`;
        } else if (room) {
          classroom = `ауд. ${room}`;
        } else if (building) {
          classroom = `корп. ${building}`;
        }

        const subjectName = subjectVal || 'Информатика';
        const teacherName = teacherVal || teacherFilter || 'Трипольский';

        lessons.push({
          id: `${currentDayNumber}_${lessonNum}_${g.name}_${subjectName}`,
          dayOfWeek: currentDayNumber,
          dayName: currentDayName,
          lessonNumber: lessonNum,
          startTime: times.startTime,
          endTime: times.endTime,
          subject: subjectName,
          group: g.name,
          classroom,
          teacher: teacherName,
          weekType: 'all',
        });
      }
    }

    return lessons;
  }

  /**
   * Разбор диапазона времени (например, "8.00-9.20" или "09:30-10:50")
   */
  private static parseTimeRange(text: string): { startTime: string; endTime: string } | null {
    if (!text) return null;
    const match = text.match(/(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})/);
    if (!match) return null;
    const startH = match[1].padStart(2, '0');
    const startM = match[2];
    const endH = match[3].padStart(2, '0');
    const endM = match[4];
    return {
      startTime: `${startH}:${startM}`,
      endTime: `${endH}:${endM}`,
    };
  }

  /**
   * Способ 1: Поиск в явной табличной структуре с заголовками
   */
  private static parseAsListTable(
    matrix: any[][],
    teacherFilter: string,
    bells: LessonTime[],
    sheetName: string
  ): Lesson[] {
    const lessons: Lesson[] = [];
    let headerRowIdx = -1;
    let colMap: {
      day?: number;
      lesson?: number;
      subject?: number;
      teacher?: number;
      group?: number;
      room?: number;
    } = {};

    for (let r = 0; r < Math.min(matrix.length, 10); r++) {
      const row = matrix[r].map((cell) => String(cell).toLowerCase().trim());
      const dayIdx = row.findIndex((c) => c.includes('день') || c.includes('дата'));
      const lessonIdx = row.findIndex((c) => c.includes('пара') || c.includes('урок') || c.includes('время'));
      const subjIdx = row.findIndex((c) => c.includes('предмет') || c.includes('дисциплина'));
      const teacherIdx = row.findIndex((c) => c.includes('преподаватель') || c.includes('фио') || c.includes('учитель'));

      if ((dayIdx !== -1 || lessonIdx !== -1) && (subjIdx !== -1 || teacherIdx !== -1)) {
        headerRowIdx = r;
        colMap = {
          day: dayIdx !== -1 ? dayIdx : undefined,
          lesson: lessonIdx !== -1 ? lessonIdx : undefined,
          subject: subjIdx !== -1 ? subjIdx : undefined,
          teacher: teacherIdx !== -1 ? teacherIdx : undefined,
          group: row.findIndex((c) => c.includes('группа')),
          room: row.findIndex((c) => c.includes('каб') || c.includes('ауд')),
        };
        break;
      }
    }

    if (headerRowIdx === -1 || colMap.teacher === undefined) {
      return [];
    }

    let currentDayNumber = this.extractDayFromText(sheetName) || 1;

    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.length === 0) continue;

      const teacherVal = colMap.teacher !== undefined ? String(row[colMap.teacher] || '') : '';
      if (!teacherVal.toLowerCase().includes(teacherFilter)) continue;

      if (colMap.day !== undefined && row[colMap.day]) {
        const foundDay = this.extractDayFromText(String(row[colMap.day]));
        if (foundDay) currentDayNumber = foundDay;
      }

      const extractedLessonNum = colMap.lesson !== undefined ? this.extractLessonNumber(String(row[colMap.lesson])) : null;
      const lessonNum = extractedLessonNum || 1;
      const times = this.getLessonTimes(lessonNum, bells);
      const subject = colMap.subject !== undefined ? String(row[colMap.subject] || 'Информатика').trim() : 'Информатика';
      const group = colMap.group !== undefined && colMap.group !== -1 ? String(row[colMap.group] || '').trim() : '';
      const classroom = colMap.room !== undefined && colMap.room !== -1 ? String(row[colMap.room] || '').trim() : '';

      lessons.push({
        id: `${currentDayNumber}_${lessonNum}_${group}_${subject}`,
        dayOfWeek: currentDayNumber,
        dayName: DAYS_OF_WEEK[currentDayNumber] || 'Понедельник',
        lessonNumber: lessonNum,
        startTime: times.startTime,
        endTime: times.endTime,
        subject: subject || 'Информатика',
        group,
        classroom,
        teacher: teacherVal || 'Трипольский',
        weekType: 'all',
      });
    }

    return lessons;
  }

  /**
   * Способ 2: Поиск в сеточной матрице
   */
  private static parseAsGridMatrix(
    matrix: any[][],
    teacherFilter: string,
    subjectFilter: string,
    bells: LessonTime[],
    sheetName: string
  ): Lesson[] {
    const lessons: Lesson[] = [];

    // Определяем день из названия листа (например, если листы называются "Понедельник", "Вторник"...)
    const sheetDay = this.extractDayFromText(sheetName);

    // Ищем дни недели в строках заголовков (первые 5 строк)
    const colToDay: Record<number, number> = {};
    for (let r = 0; r < Math.min(matrix.length, 5); r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        const text = String(matrix[r][c] || '').toLowerCase().trim();
        const day = this.extractDayFromText(text);
        if (day) {
          colToDay[c] = day;
        }
      }
    }

    // Ищем дни недели в первых 3 столбцах (для вертикального расписания)
    const rowToDay: Record<number, number> = {};
    let lastFoundRowDay = sheetDay || 1;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < Math.min(matrix[r].length, 3); c++) {
        const text = String(matrix[r][c] || '').toLowerCase().trim();
        const day = this.extractDayFromText(text);
        if (day) {
          lastFoundRowDay = day;
          break;
        }
      }
      rowToDay[r] = lastFoundRowDay;
    }

    // Проходим по всем ячейкам
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        const cellValue = String(matrix[r][c] || '').trim();
        if (!cellValue) continue;

        const cellLower = cellValue.toLowerCase();

        // Проверяем, содержит ли ячейка имя преподавателя или предмет
        const matchesTeacher = cellLower.includes(teacherFilter);
        const matchesSubjectOnly = !matchesTeacher && cellLower.includes(subjectFilter);

        // Если совпал только предмет, проверим, нет ли в ячейке фамилии другого преподавателя
        if (matchesSubjectOnly) {
          // Если есть явная другая фамилия с инициалами (например "Иванов И.И."), пропускаем
          const otherTeacherMatch = cellValue.match(/[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s*[А-ЯЁ]\./);
          if (otherTeacherMatch && !otherTeacherMatch[0].toLowerCase().includes(teacherFilter)) {
            continue;
          }
        }

        if (matchesTeacher || matchesSubjectOnly) {
          // Определяем день недели:
          // 1) Из колонки colToDay
          // 2) Из строки rowToDay
          // 3) Из названия листа
          const dayOfWeek = colToDay[c] || rowToDay[r] || sheetDay || 1;

          // Определяем номер пары
          const lessonNumber = this.findLessonNumberNearCell(matrix, r, c);
          const times = this.getLessonTimes(lessonNumber, bells);

          // Извлекаем аудиторию и группу
          const classroom = this.extractClassroom(cellValue) || this.findClassroomNearCell(matrix, r, c);
          const group = this.findGroupNearCell(matrix, r, c) || '';

          // Извлекаем название предмета
          const subject = this.cleanSubjectName(cellValue, teacherFilter) || 'Информатика';

          lessons.push({
            id: `${dayOfWeek}_${lessonNumber}_${group}_${subject}`,
            dayOfWeek,
            dayName: DAYS_OF_WEEK[dayOfWeek] || 'Понедельник',
            lessonNumber,
            startTime: times.startTime,
            endTime: times.endTime,
            subject,
            group,
            classroom,
            teacher: 'Трипольский',
            weekType: 'all',
          });
        }
      }
    }

    return lessons;
  }

  /**
   * Определение номера пары по соседним ячейкам строки/столбца
   */
  private static findLessonNumberNearCell(matrix: any[][], r: number, c: number): number {
    // 1. Проверяем текущую строку слева (колонки 0..3)
    for (let col = Math.min(c, 3); col >= 0; col--) {
      const val = String(matrix[r][col] || '').trim();
      const num = this.extractLessonNumber(val);
      if (num) return num;
    }

    // 2. Проверяем строку заголовка сверху в этой же колонке
    for (let row = 0; row < Math.min(r, 4); row++) {
      const val = String(matrix[row][c] || '').trim();
      const num = this.extractLessonNumber(val);
      if (num) return num;
    }

    // 3. Проверяем содержимое самой ячейки (бывает "1 пара: Информатика")
    const cellVal = String(matrix[r][c] || '').trim();
    const cellNum = this.extractLessonNumber(cellVal);
    if (cellNum) return cellNum;

    return 1;
  }

  /**
   * Поиск группы (обычно в шапке столбца или рядом)
   */
  private static findGroupNearCell(matrix: any[][], r: number, c: number): string {
    // Ищем в шапке столбца (строки 0..3)
    for (let row = 0; row < Math.min(r, 4); row++) {
      const val = String(matrix[row][c] || '').trim();
      if (this.looksLikeGroupName(val)) {
        return val;
      }
    }

    // Проверяем строку самой ячейки
    const cellVal = String(matrix[r][c] || '').trim();
    const groupInCell = cellVal.match(/\b([1-4]\s?[А-ЯЁA-Z]{2,6}[а-яё]?|[А-ЯЁA-Z]{2,4}-\d{2,3})\b/u);
    if (groupInCell) {
      return groupInCell[1].trim();
    }

    return '';
  }

  /**
   * Извлечение кабинета/аудитории
   */
  private static extractClassroom(text: string): string {
    const match = text.match(/(?:каб\.?|ауд\.?|к\.)\s*([0-9а-яА-ЯёЁ\/-]+)/i);
    if (match) {
      return match[1].trim();
    }
    // Просто 3 цифры в конце или отдельно (например: 305, 204-а)
    const roomMatch = text.match(/\b([1-9]\d{2}[а-яА-Я]?)\b/);
    if (roomMatch) {
      return roomMatch[1].trim();
    }
    return '';
  }

  private static findClassroomNearCell(matrix: any[][], r: number, c: number): string {
    // Проверим ячейку справа или снизу
    if (c + 1 < (matrix[r]?.length || 0)) {
      const right = this.extractClassroom(String(matrix[r][c + 1] || ''));
      if (right) return right;
    }
    if (r + 1 < matrix.length) {
      const below = this.extractClassroom(String(matrix[r + 1][c] || ''));
      if (below) return below;
    }
    return '';
  }

  private static looksLikeGroupName(text: string): boolean {
    if (!text || text.length > 20) return false;
    const lower = text.toLowerCase();
    if (lower.includes('день') || lower.includes('пара') || lower.includes('урок') || lower.includes('время')) {
      return false;
    }
    // Примеры групп: 1КСК, 2зПИм, ИС-21, ТО-101
    return /[0-4]\s?[а-яёa-z]{2,5}|[а-яёa-z]{2,4}-\d{2}/i.test(text);
  }

  private static extractDayFromText(text: string): number | null {
    if (!text) return null;
    const clean = text.toLowerCase().trim();
    for (const [key, val] of Object.entries(DAY_NAME_TO_NUMBER)) {
      if (clean.includes(key)) {
        return val;
      }
    }
    return null;
  }

  private static extractLessonNumber(text: string): number | null {
    if (!text) return null;
    const match = text.match(/([1-9])\s*(?:пара|урок)?/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num >= 1 && num <= 10) return num;
    }
    return null;
  }

  private static getLessonTimes(num: number, bells: LessonTime[]): { startTime: string; endTime: string } {
    const found = bells.find((b) => b.lessonNumber === num);
    if (found) {
      return { startTime: found.startTime, endTime: found.endTime };
    }
    return { startTime: '08:30', endTime: '10:00' };
  }

  private static cleanSubjectName(cellValue: string, teacherFilter: string): string {
    // Удаляем из текста ячейки упоминание преподавателя и кабинета
    let cleaned = cellValue
      .replace(new RegExp(`.*${teacherFilter}[^\\n]*`, 'gi'), '')
      .replace(/(?:каб\.?|ауд\.?|к\.)\s*[0-9а-яА-ЯёЁ\/-]+/gi, '')
      .replace(/\b[1-9]\d{2}[а-яА-Я]?\b/g, '')
      .trim();

    // Если есть переносы строк, берем первую непустую строку
    const lines = cleaned.split(/[\r\n]+/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length > 0) {
      return lines[0];
    }
    return 'Информатика';
  }

  private static deduplicateLessons(lessons: Lesson[]): Lesson[] {
    const seen = new Set<string>();
    const result: Lesson[] = [];

    for (const l of lessons) {
      const key = `${l.dayOfWeek}_${l.lessonNumber}_${l.subject.toLowerCase()}_${l.group.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(l);
      }
    }

    return result;
  }
}
