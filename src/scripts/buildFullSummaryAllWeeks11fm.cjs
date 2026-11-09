// src/scripts/buildFullSummaryAllWeeks11fm.cjs
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const root = path.resolve(__dirname, '../..');

// Функция нормализации предмета
function normalizeSubject(s) {
  const str = String(s || '').trim();
  const lower = str.toLowerCase();
  if (lower.includes('информ')) return 'Информатика';
  if (lower.includes('матем')) return 'Математика';
  if (lower.includes('биол')) return 'Биология';
  if (lower.includes('хим')) return 'Химия';
  if (lower.includes('физр') || lower.includes('физкульт')) return 'Физкультура';
  if (lower.includes('физик')) return 'Физика';
  if (lower.includes('русск')) return 'Русский язык';
  if (lower.includes('литерат')) return 'Литература';
  if (lower.includes('истор')) return 'История';
  if (lower.includes('обществ')) return 'Обществознание';
  if (lower.includes('обзр')) return 'Основы безопасности и защиты Родины';
  if (lower.includes('геогр')) return 'География';
  if (lower.includes('иностр')) return 'Иностранный язык';
  if (lower.includes('воспит')) return 'Воспитательный час';
  if (lower.includes('разговор')) return 'Разговоры о важном';
  return str;
}

function parseXlsxWeekAll(file, sheet, startDateStr, colIdx, pairOffset, subjOffset, teacherOffset, bldOffset, roomOffset) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) return [];
  const wb = xlsx.readFile(filePath);
  const data = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { header: 1 });
  const start = new Date(startDateStr);
  const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const res = [];
  let currentDayIdx = 0;
  for (let r = 3; r < data.length; r++) {
    const row = data[r] || [];
    const c0 = String(row[0] || '').trim();
    const c1 = String(row[1] || '').trim();
    const combined = `${c0} ${c1}`.toLowerCase();
    const foundIdx = days.findIndex((d) => combined.includes(d.toLowerCase()));
    if (foundIdx !== -1) currentDayIdx = foundIdx;

    const pair = row[colIdx + pairOffset];
    const subj = String(row[colIdx + subjOffset] || '').trim();
    const teacher = String(row[colIdx + teacherOffset] || '').trim();
    const bld = row[colIdx + bldOffset];
    const room = row[colIdx + roomOffset];
    if (subj && subj !== '—') {
      const d = new Date(start);
      d.setDate(start.getDate() + currentDayIdx);
      res.push({
        date: d.toISOString().split('T')[0],
        day: days[currentDayIdx],
        pair: Number(pair) || 1,
        subject: normalizeSubject(subj),
        rawSubject: subj,
        teacher,
        classroom: [bld, room ? 'ауд. ' + room : ''].filter(Boolean).join(', ')
      });
    }
  }
  return res;
}

const w1 = parseXlsxWeekAll('на стенд2_1нед — копия.xlsx', '1 неделя стационар', '2026-09-07', 13, 0, 1, 2, 3, 4);
const w3 = parseXlsxWeekAll('на стенд 14_09__19_09 с изменениями.xlsx', '3 неделя стационар', '2026-09-14', 13, 0, 1, 2, 3, 4);
const w4 = parseXlsxWeekAll('на стенд 21.09-26.09.xlsx', '4 неделя стационар', '2026-09-21', 13, 0, 1, 2, 3, 4);
const w7 = parseXlsxWeekAll('на стенд 12.10-17.10 ЧИСТ Ч2.xlsx', '7 неделя стационар', '2026-10-12', 15, 0, 1, 3, -2, -1);
const w8 = parseXlsxWeekAll('на стенд 19.10-24.10 с правками.xlsx', '8 неделя стационар', '2026-10-19', 15, 0, 1, 3, -2, -1);

function getJsonWeekAll(buf, weekStart) {
  const data = JSON.parse(buf.toString('utf8'));
  const res = [];
  const days = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const start = new Date(weekStart);
  Object.values(data).forEach((arr) => arr.forEach((l) => {
    if (l.group === '11фм' || l.group === '11ФМ') {
      const d = new Date(start);
      d.setDate(start.getDate() + (l.dayOfWeek - 1));
      res.push({
        date: d.toISOString().split('T')[0],
        day: days[l.dayOfWeek],
        pair: l.lessonNumber,
        subject: normalizeSubject(l.subject),
        rawSubject: l.subject,
        teacher: l.teacher,
        classroom: l.classroom,
        subgroup: l.subgroup
      });
    }
  }));
  res.sort((a, b) => a.date.localeCompare(b.date) || a.pair - b.pair || ((a.subgroup || '').localeCompare(b.subgroup || '')));
  return res;
}

const buf9 = execSync('git show 8a3467c:data/schedules_all.json', { maxBuffer: 100 * 1024 * 1024 });
const w9 = getJsonWeekAll(buf9, '2026-10-26');

const buf10 = execSync('git show 59e80b2:data/schedules_all.json', { maxBuffer: 100 * 1024 * 1024 });
const w10 = getJsonWeekAll(buf10, '2026-11-02');

const buf11 = fs.readFileSync(path.join(root, 'data/schedules_all.json'));
const w11 = getJsonWeekAll(buf11, '2026-11-09');

const weeks = [
  { name: 'Неделя 1', dates: '07.09–12.09.2026', lessons: w1 },
  { name: 'Неделя 3', dates: '14.09–19.09.2026', lessons: w3 },
  { name: 'Неделя 4', dates: '21.09–26.09.2026', lessons: w4 },
  { name: 'Неделя 7', dates: '12.10–17.10.2026', lessons: w7 },
  { name: 'Неделя 8', dates: '19.10–24.10.2026', lessons: w8 },
  { name: 'Неделя 9', dates: '26.10–31.10.2026', lessons: w9 },
  { name: 'Неделя 10', dates: '02.11–07.11.2026', lessons: w10 },
  { name: 'Неделя 11', dates: '09.11–14.11.2026', lessons: w11 },
];

console.log('=== СВОДКА ПО НЕДЕЛЯМ ДЛЯ 11ФМ ===');
weeks.forEach((w) => {
  // уникальные слоты (дата + пара)
  const slots = new Set(w.lessons.map((l) => `${l.date}_${l.pair}`));
  console.log(`${w.name} (${w.dates}): ${slots.size} пар (всего записей с подгруппами: ${w.lessons.length})`);
});
