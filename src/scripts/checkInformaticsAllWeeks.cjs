// src/scripts/checkInformaticsAllWeeks.cjs
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const root = path.resolve(__dirname, '../..');

function parseXlsxInformatics(file, sheet, startDateStr, colIdx, pairOffset, subjOffset, teacherOffset, bldOffset, roomOffset) {
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
    if (subj.toLowerCase().includes('информ')) {
      const d = new Date(start);
      d.setDate(start.getDate() + currentDayIdx);
      res.push({
        date: d.toISOString().split('T')[0],
        day: days[currentDayIdx],
        pair: Number(pair) || 1,
        subject: subj,
        teacher,
        classroom: [bld, room ? 'ауд. ' + room : ''].filter(Boolean).join(', ')
      });
    }
  }
  return res;
}

const w1 = parseXlsxInformatics('на стенд2_1нед — копия.xlsx', '1 неделя стационар', '2026-09-07', 13, 0, 1, 2, 3, 4);
const w3 = parseXlsxInformatics('на стенд 14_09__19_09 с изменениями.xlsx', '3 неделя стационар', '2026-09-14', 13, 0, 1, 2, 3, 4);
const w4 = parseXlsxInformatics('на стенд 21.09-26.09.xlsx', '4 неделя стационар', '2026-09-21', 13, 0, 1, 2, 3, 4);
const w7 = parseXlsxInformatics('на стенд 12.10-17.10 ЧИСТ Ч2.xlsx', '7 неделя стационар', '2026-10-12', 15, 0, 1, 3, -2, -1);
const w8 = parseXlsxInformatics('на стенд 19.10-24.10 с правками.xlsx', '8 неделя стационар', '2026-10-19', 15, 0, 1, 3, -2, -1);

function getJsonInformatics(buf, weekStart) {
  const data = JSON.parse(buf.toString('utf8'));
  const res = [];
  const days = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const start = new Date(weekStart);
  Object.values(data).forEach((arr) => arr.forEach((l) => {
    if ((l.group === '11фм' || l.group === '11ФМ') && l.subject.toLowerCase().includes('информ')) {
      const d = new Date(start);
      d.setDate(start.getDate() + (l.dayOfWeek - 1));
      res.push({
        date: d.toISOString().split('T')[0],
        day: days[l.dayOfWeek],
        pair: l.lessonNumber,
        subject: l.subject,
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
const w9 = getJsonInformatics(buf9, '2026-10-26');

const buf10 = execSync('git show 59e80b2:data/schedules_all.json', { maxBuffer: 100 * 1024 * 1024 });
const w10 = getJsonInformatics(buf10, '2026-11-02');

const buf11 = fs.readFileSync(path.join(root, 'data/schedules_all.json'));
const w11 = getJsonInformatics(buf11, '2026-11-09');

const allInf = [
  ...w1.map((x) => ({ ...x, week: 'Неделя 1 (07.09–12.09)' })),
  ...w3.map((x) => ({ ...x, week: 'Неделя 3 (14.09–19.09)' })),
  ...w4.map((x) => ({ ...x, week: 'Неделя 4 (21.09–26.09)' })),
  ...w7.map((x) => ({ ...x, week: 'Неделя 7 (12.10–17.10)' })),
  ...w8.map((x) => ({ ...x, week: 'Неделя 8 (19.10–24.10)' })),
  ...w9.map((x) => ({ ...x, week: 'Неделя 9 (26.10–31.10)' })),
  ...w10.map((x) => ({ ...x, week: 'Неделя 10 (02.11–07.11)' })),
  ...w11.map((x) => ({ ...x, week: 'Неделя 11 (09.11–14.11)' })),
];

console.log('Total Informatics pairs found across all weeks:', allInf.length);
allInf.forEach((x, i) => {
  console.log(`${i + 1}. [${x.week}] ${x.date} (${x.day}) пара ${x.pair} | ${x.subject} | ${x.teacher} | ${x.classroom} ${x.subgroup ? '| п/г ' + x.subgroup : ''}`);
});
