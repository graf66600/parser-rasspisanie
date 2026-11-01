// node src/scripts/photoSchedule/build.cjs
// Проверенная вручную расшифровка 11 уникальных фотографий, 02–07.11.2026.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const subjects = require('./subjects.cjs');
const { LessonSchema } = require('../../../dist/types/schedule.js');
const root = path.resolve(__dirname, '../../..');
const previous = JSON.parse(fs.readFileSync(path.join(root, 'data/schedule.json'), 'utf8'));
const bells = previous.bells;
const days = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const byTeacher = {};
const seen = new Set();
const groups = new Set();
const lessons = [];
for (const file of ['junior', 'senior', 'practice']) {
  let group;
  for (const line of require(`./${file}.cjs`).trim().split('\n')) {
    if (line.startsWith('@')) { group = line.slice(1); groups.add(group); continue; }
    const [day, numbers, key, rawTeacher, room = '', subgroup] = line.split('|');
    const teacher = rawTeacher || 'Без преподавателя';
    const [building, audience] = room.split(':');
    const classroom = [building, audience ? `ауд. ${audience}` : ''].filter(Boolean).join(', ');
    const [first, last = first] = numbers.split('-').map(Number);
    assert(subjects[key], `Неизвестный предмет: ${line}`);
    for (let number = first; number <= last; number++) {
      const time = bells.find(b => b.lessonNumber === number);
      assert(time, `Нет звонка: ${line}`);
      const id = `photo_20261102_${group}_${day}_${number}_${subgroup || 'all'}`;
      assert(!seen.has(id), `Повтор ячейки: ${id}`);
      seen.add(id);
      const lesson = {
        id, dayOfWeek: Number(day), dayName: days[day], lessonNumber: number,
        startTime: time.startTime, endTime: time.endTime, subject: subjects[key],
        group, ...(subgroup ? { subgroup } : {}), teacher, classroom, weekType: 'all',
      };
      LessonSchema.parse(lesson);
      (byTeacher[teacher] ||= []).push(lesson);
      lessons.push(lesson);
    }
  }
}
const teachers = Object.keys(byTeacher).sort((a, b) =>
  a === 'Трипольский' ? -1 : b === 'Трипольский' ? 1 : a.localeCompare(b, 'ru'));
for (const items of Object.values(byTeacher)) items.sort((a, b) =>
  a.dayOfWeek - b.dayOfWeek || a.lessonNumber - b.lessonNumber || a.group.localeCompare(b.group, 'ru'));
const trip = byTeacher['Трипольский'];
assert.equal(groups.size, 26);
assert.equal(trip.length, 8);
assert.equal(lessons.filter(l => l.dayOfWeek === 3 && l.subject !== subjects.пп).length, 0);
assert.deepEqual(trip.map(l => `${l.dayOfWeek}/${l.lessonNumber}/${l.group}/${l.subgroup}`), [
  '1/1/31фм/2', '1/2/31фм/1', '1/4/11ф/2', '2/3/31фм/1',
  '2/4/11фм/2', '4/5/31фм/1', '5/4/11МС/2', '5/5/31фм/2',
]);
const updatedAt = new Date().toISOString();
const schedule = { ...previous, lessons: trip, updatedAt, weekStart: '2026-11-02', weekEnd: '2026-11-07' };
const users = JSON.parse(fs.readFileSync(path.join(root, 'data/schedules.json'), 'utf8'));
for (const user of users) {
  const teacher = user.settings.teacherFilter || 'Трипольский';
  user.lessons = byTeacher[teacher] || [];
  user.updatedAt = updatedAt;
}
const metadata = {
  weekStart: schedule.weekStart, weekEnd: schedule.weekEnd, updatedAt,
  source: 'Фотографии пользователя: 13 файлов, 11 уникальных листов',
  groups: [...groups], lessons: lessons.length, teachers: teachers.filter(t => t !== 'Без преподавателя').length,
  notes: [
    'Пустые ячейки не перенесены из предыдущей недели. 04.11: только производственная практика.',
    'Производственная практика развернута по строкам пар; преподаватель и аудитория не указаны.',
    '31фм, вторник, пара 1, подгруппа 2: Информатика — Крупенко, именно так напечатано.',
    '32ф, четверг: повторяющиеся номера 1,2,3 на листе прочитаны по позиции строк как пары 3,4,5.',
    '33ф, вторник: преподаватели двух параллельных блоков определены по подписям Пижук/Одинец и обмену подгруппами.',
    'Галич без инициалов на Здоровом человеке нормализован как Галич Т.И.; Сницарь — по листу заочного отделения.',
    'Общий корпус/аудитория сохранены для обеих подгрупп; пустые значения не дополнены из старого расписания.',
  ],
  events: [{ date: '2026-11-02', startTime: '12:20', subject: 'Разговоры о важном', classroom: 'Актовый зал', groups: ['11МС', '11ф'] }],
};
const outputs = { 'schedule.json': schedule, 'schedules.json': users, 'schedules_all.json': byTeacher,
  'teachers.json': teachers, 'schedule-source.json': metadata };
for (const [name, data] of Object.entries(outputs)) {
  const text = JSON.stringify(data, null, 2) + '\n';
  for (const directory of ['data', 'public/data']) fs.writeFileSync(path.join(root, directory, name), text);
}
console.log(JSON.stringify({ groups: groups.size, lessons: lessons.length, teachers: metadata.teachers, trip: trip.length }, null, 2));
