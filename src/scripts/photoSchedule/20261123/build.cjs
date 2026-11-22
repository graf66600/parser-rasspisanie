const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { LessonSchema } = require('../../../types/schedule.ts');
const subjects = {
  ...require('../20261116/subjects.cjs'),
  береж: 'Основы бережливого производства',
  маспед: 'Массаж в педиатрической практике',
  оргАптек: 'Организация деятельности аптек',
};

const root = path.resolve(__dirname, '../../../..');
const readData = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'));
const previous = readData('schedule.json');
const weekStart = '2026-11-23';
const weekEnd = '2026-11-28';
const updatedAt = new Date().toISOString();
const dayNames = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const groups = new Set();
const occupied = new Set();
const byTeacher = Object.create(null);
let lessonCount = 0;

for (const file of ['first-year', 'second-year', 'senior', 'extramural', 'practice']) {
  let group;
  for (const line of require(`./${file}.cjs`).trim().split('\n')) {
    if (line.startsWith('@')) {
      group = line.slice(1);
      assert(group && !groups.has(group), `Повтор группы: ${group}`);
      groups.add(group);
      continue;
    }

    const [day, numbers, key, teacher = 'Без преподавателя', room = '', subgroup] = line.split('|');
    const [building, audience] = room.split(':');
    const classroom = [building, audience ? `ауд. ${audience}` : ''].filter(Boolean).join(', ');
    const [first, last = first] = numbers.split('-').map(Number);
    assert(group && dayNames[day] && Object.hasOwn(subjects, key), `Ошибка в строке: ${line}`);
    assert(Number.isInteger(first) && Number.isInteger(last) && first <= last, `Номер пары: ${line}`);
    assert(!subgroup || subgroup === '1' || subgroup === '2', `Подгруппа: ${line}`);

    for (let number = first; number <= last; number++) {
      const time = previous.bells.find(bell => bell.lessonNumber === number);
      const cell = `photo_20261123_${group}_${day}_${number}`;
      const id = `${cell}_${subgroup || 'all'}`;
      const conflictingIds = subgroup ? [id, `${cell}_all`] : [id, `${cell}_1`, `${cell}_2`];
      assert(time && conflictingIds.every(candidate => !occupied.has(candidate)), `Ошибка ячейки: ${id}`);
      occupied.add(id);

      const lesson = LessonSchema.parse({
        id, dayOfWeek: Number(day), dayName: dayNames[day], lessonNumber: number,
        startTime: time.startTime, endTime: time.endTime, subject: subjects[key],
        group, ...(subgroup ? { subgroup } : {}), teacher: teacher || 'Без преподавателя', classroom,
        weekType: 'all',
      });
      (byTeacher[lesson.teacher] ||= []).push(lesson);
      lessonCount++;
    }
  }
}

assert.equal(groups.size, 26);
const teachers = Object.keys(byTeacher).sort((a, b) =>
  a === 'Трипольский' ? -1 : b === 'Трипольский' ? 1 : a.localeCompare(b, 'ru'));
const sortedSchedules = Object.fromEntries(teachers.map(teacher => [
  teacher,
  byTeacher[teacher].sort((a, b) =>
    a.dayOfWeek - b.dayOfWeek || a.lessonNumber - b.lessonNumber || a.group.localeCompare(b.group, 'ru')),
]));
const lessons = sortedSchedules[previous.teacher] || [];
assert.equal(lessons.length, 6);

const publication = { weekStart, weekEnd, updatedAt };
const users = readData('schedules.json').map(user => ({
  ...user, ...publication, lessons: sortedSchedules[user.settings.teacherFilter || previous.teacher] || [],
}));
const metadata = {
  ...publication,
  source: 'Фотографии пользователя (папка 23.11): 12 файлов, 11 разных листов расписания',
  groups: [...groups],
  lessons: lessonCount,
  teachers: teachers.filter(teacher => teacher !== 'Без преподавателя').length,
  notes: [
    'Объединённые блоки производственной практики развёрнуты по строкам дневной сетки.',
    'В среду у 11фм обществознание стоит во второй строке с повторяющимся напечатанным номером 4.',
    'В строках информатики первых курсов обрезанные номера аудиторий восстановлены по читаемым ячейкам той же недели (6 и 230).',
    'У 21мс на пятой паре понедельника преподаватель анатомии не указан.',
  ],
  events: [{ date: weekStart, startTime: '12:20', subject: 'Разговоры о важном', classroom: 'Актовый зал', groups: ['11МС', '11ф'] }],
};
const outputs = {
  'schedule.json': { ...previous, ...publication, lessons },
  'schedules.json': users,
  'schedules_all.json': sortedSchedules,
  'teachers.json': teachers,
  'schedule-source.json': metadata,
};

for (const [name, data] of Object.entries(outputs)) {
  const json = JSON.stringify(data, null, 2) + '\n';
  for (const directory of ['data', 'public/data']) fs.writeFileSync(path.join(root, directory, name), json);
}

console.log(JSON.stringify({ groups: groups.size, lessons: lessonCount, teachers: metadata.teachers, trip: lessons.length }));
