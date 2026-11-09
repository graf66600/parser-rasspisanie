// src/scripts/generateGroupSummary.cjs
// Генерация сводной таблицы расписания и нагрузки для указанной группы
const fs = require('node:fs');
const path = require('node:path');
const xlsx = require('xlsx');

const root = path.resolve(__dirname, '../..');
const targetGroup = process.argv[2] || '11фм';
const schedulesAllPath = path.join(root, 'data/schedules_all.json');
const scheduleSourcePath = path.join(root, 'data/schedule-source.json');

if (!fs.existsSync(schedulesAllPath)) {
  console.error('Файл schedules_all.json не найден!');
  process.exit(1);
}

const schedulesAll = JSON.parse(fs.readFileSync(schedulesAllPath, 'utf8'));
const meta = fs.existsSync(scheduleSourcePath) ? JSON.parse(fs.readFileSync(scheduleSourcePath, 'utf8')) : {};

const weekDays = [
  { dayOfWeek: 1, name: 'Понедельник', date: '09.11.2026' },
  { dayOfWeek: 2, name: 'Вторник', date: '10.11.2026' },
  { dayOfWeek: 3, name: 'Среда', date: '11.11.2026' },
  { dayOfWeek: 4, name: 'Четверг', date: '12.11.2026' },
  { dayOfWeek: 5, name: 'Пятница', date: '13.11.2026' },
  { dayOfWeek: 6, name: 'Суббота', date: '14.11.2026' },
];

const lessons = [];
Object.entries(schedulesAll).forEach(([teacher, teacherLessons]) => {
  if (Array.isArray(teacherLessons)) {
    teacherLessons.forEach((l) => {
      if (l.group && l.group.toLowerCase() === targetGroup.toLowerCase()) {
        lessons.push({ ...l, teacher: l.teacher || teacher });
      }
    });
  }
});

lessons.sort((a, b) => (
  (a.dayOfWeek - b.dayOfWeek) ||
  (a.lessonNumber - b.lessonNumber) ||
  ((a.subgroup || '').localeCompare(b.subgroup || ''))
));

console.log(`Найдено ${lessons.length} занятий для группы ${targetGroup}.`);

// 1. Сетка расписания (Matrix)
const gridData = [
  ['№ пары', 'Время', ...weekDays.map((d) => `${d.name} (${d.date})`)],
];

const bellTimes = {
  1: '08:00 - 09:20',
  2: '09:30 - 10:50',
  3: '11:00 - 12:20',
  4: '13:00 - 14:20',
  5: '14:30 - 15:50',
  6: '16:00 - 17:20',
  7: '17:30 - 18:50',
};

for (let num = 1; num <= 4; num++) {
  const row = [`Пара ${num}`, bellTimes[num] || ''];
  weekDays.forEach((d) => {
    const dayLessons = lessons.filter((l) => l.dayOfWeek === d.dayOfWeek && l.lessonNumber === num);
    if (dayLessons.length === 0) {
      row.push('—');
    } else if (dayLessons.length === 1 && !dayLessons[0].subgroup) {
      const l = dayLessons[0];
      row.push(`${l.subject}\nПреп: ${l.teacher}\nАуд: ${l.classroom || '—'}`);
    } else {
      const parts = dayLessons.map((l) => (
        `[${l.subgroup || 'все'} п/г] ${l.subject} (${l.teacher}, ${l.classroom || '—'})`
      ));
      row.push(parts.join('\n'));
    }
  });
  gridData.push(row);
}

// 2. Реестр всех пар подробно
const detailHeaders = [
  '№', 'День недели', 'Дата', '№ пары', 'Время', 'Дисциплина', 'Преподаватель', 'Аудитория', 'Подгруппа'
];
const detailRows = lessons.map((l, idx) => {
  const d = weekDays.find((wd) => wd.dayOfWeek === l.dayOfWeek);
  return [
    idx + 1,
    l.dayName || d?.name || `День ${l.dayOfWeek}`,
    d?.date || '',
    l.lessonNumber,
    `${l.startTime || ''} - ${l.endTime || ''}`.trim(),
    l.subject,
    l.teacher,
    l.classroom || 'Не указана',
    l.subgroup ? `${l.subgroup}-я подгруппа` : 'Вся группа'
  ];
});
const detailData = [detailHeaders, ...detailRows];

// 3. Сводка по дисциплинам
const subjectMap = new Map();
lessons.forEach((l) => {
  const key = l.subject;
  if (!subjectMap.has(key)) {
    subjectMap.set(key, {
      subject: key,
      teachers: new Set(),
      classrooms: new Set(),
      days: new Set(),
      uniqueSlots: new Set(),
      subgroupEntries: 0
    });
  }
  const item = subjectMap.get(key);
  item.teachers.add(l.teacher);
  if (l.classroom) item.classrooms.add(l.classroom);
  item.days.add(l.dayName);
  item.uniqueSlots.add(`${l.dayOfWeek}_${l.lessonNumber}`);
  if (l.subgroup) item.subgroupEntries++;
});

const subjectHeaders = [
  '№', 'Дисциплина', 'Преподаватель(и)', 'Кол-во пар', 'Академических часов', 'Аудитории', 'Дни недели'
];
let subjIdx = 1;
const subjectRows = [];
let totalStudentPairs = 0;

Array.from(subjectMap.values())
  .sort((a, b) => b.uniqueSlots.size - a.uniqueSlots.size || a.subject.localeCompare(b.subject, 'ru'))
  .forEach((item) => {
    const pairs = item.uniqueSlots.size;
    const hours = pairs * 2;
    totalStudentPairs += pairs;
    subjectRows.push([
      subjIdx++,
      item.subject,
      Array.from(item.teachers).join(', '),
      pairs,
      hours,
      Array.from(item.classrooms).join('; ') || '—',
      Array.from(item.days).join(', ')
    ]);
  });

subjectRows.push([
  'ИТОГО', 'Всего дисциплин: ' + subjectMap.size, '—',
  totalStudentPairs, totalStudentPairs * 2, '—', 'Пн-Пт'
]);
const subjectData = [subjectHeaders, ...subjectRows];

// 4. Сводка по преподавателям
const teacherMap = new Map();
lessons.forEach((l) => {
  const key = l.teacher;
  if (!teacherMap.has(key)) {
    teacherMap.set(key, {
      teacher: key,
      subjects: new Set(),
      classrooms: new Set(),
      days: new Set(),
      pairsCount: 0,
      subgroups: new Set()
    });
  }
  const item = teacherMap.get(key);
  item.subjects.add(l.subject);
  if (l.classroom) item.classrooms.add(l.classroom);
  item.days.add(l.dayName);
  item.pairsCount++;
  if (l.subgroup) item.subgroups.add(l.subgroup);
});

const teacherHeaders = [
  '№', 'Преподаватель', 'Дисциплины', 'Пар у группы', 'Акад. часов', 'Подгруппа', 'Аудитории', 'Дни занятий'
];
let tIdx = 1;
const teacherRows = [];
Array.from(teacherMap.values())
  .sort((a, b) => b.pairsCount - a.pairsCount || a.teacher.localeCompare(b.teacher, 'ru'))
  .forEach((item) => {
    teacherRows.push([
      tIdx++,
      item.teacher,
      Array.from(item.subjects).join(', '),
      item.pairsCount,
      item.pairsCount * 2,
      item.subgroups.size > 0 ? Array.from(item.subgroups).map((s) => s + ' п/г').join(', ') : 'Вся группа',
      Array.from(item.classrooms).join('; ') || '—',
      Array.from(item.days).join(', ')
    ]);
  });
const teacherData = [teacherHeaders, ...teacherRows];

// 5. Распределение нагрузки по дням недели
const dayHeaders = ['День недели', 'Дата', 'Количество пар', 'Академических часов', 'Время занятий', 'Дисциплины'];
const dayRows = weekDays.map((d) => {
  const dLessons = lessons.filter((l) => l.dayOfWeek === d.dayOfWeek);
  const uniqueNums = new Set(dLessons.map((l) => l.lessonNumber));
  const count = uniqueNums.size;
  const hours = count * 2;
  const time = count > 0 ? `08:00 - 14:20 (${count} пары)` : 'Выходной';
  const subjectsStr = Array.from(new Set(dLessons.map((l) => l.subject))).join(', ') || '—';
  return [d.name, d.date, count, hours, time, subjectsStr];
});
dayRows.push([
  'ИТОГО ЗА НЕДЕЛЮ', '09.11-14.11', totalStudentPairs, totalStudentPairs * 2, '5 учебных дней', '—'
]);
const dayData = [dayHeaders, ...dayRows];

// Создание книги Excel
const wb = xlsx.utils.book_new();

const wsGrid = xlsx.utils.aoa_to_sheet(gridData);
wsGrid['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 15 }];
xlsx.utils.book_append_sheet(wb, wsGrid, 'Сетка расписания 11ФМ');

const wsDetails = xlsx.utils.aoa_to_sheet(detailData);
wsDetails['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 32 }, { wch: 20 }, { wch: 16 }, { wch: 16 }];
xlsx.utils.book_append_sheet(wb, wsDetails, 'Все пары подробно');

const wsSubjects = xlsx.utils.aoa_to_sheet(subjectData);
wsSubjects['!cols'] = [{ wch: 5 }, { wch: 36 }, { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 24 }];
xlsx.utils.book_append_sheet(wb, wsSubjects, 'Сводка по дисциплинам');

const wsTeachers = xlsx.utils.aoa_to_sheet(teacherData);
wsTeachers['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 24 }];
xlsx.utils.book_append_sheet(wb, wsTeachers, 'Сводка по преподавателям');

const wsDays = xlsx.utils.aoa_to_sheet(dayData);
wsDays['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 24 }, { wch: 45 }];
xlsx.utils.book_append_sheet(wb, wsDays, 'Нагрузка по дням');

const outFileName = `сводная_таблица_${targetGroup}_09.11-14.11.xlsx`;
const outFilePath = path.join(root, outFileName);
xlsx.writeFile(wb, outFilePath);
console.log(`Успешно сохранен файл Excel: ${outFilePath}`);
