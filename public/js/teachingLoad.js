// Transcribed from the two teacher-load photos supplied on 2026-11-09.
// Hours are academic hours. Multipliers denote repeated teaching to subgroups.
// The sheet is a workload allocation, NOT a numbered thematic lesson plan.
const rows = [
  ['21ф', 2, 12, 26, 2], ['22ф', 2, 12, 26, 2], ['23ф', 2, 12, 26, 2],
  ['31фм', 1, 6, 24, 2],
  ['11мс', 1, 0, 38, 1], ['11мс', 2, 0, 30, 1],
  ['11ф', 1, 0, 54, 1], ['11ф', 2, 0, 50, 1],
  ['11фм', 1, 0, 54, 1], ['11фм', 2, 0, 50, 1],
  ['41ф', 2, 14, 32, 2], ['42ф', 2, 14, 32, 2],
  ['43ф', 2, 0, 32, 2], ['21фм', 2, 6, 26, 2],
  ['51ф', 1, 20, 16, 2],
];

export const teachingLoads = rows.map(([group, semester, theoryHours, practiceHours, practiceMultiplier]) => ({
  group, semester, theoryHours, practiceHours, practiceMultiplier,
  teacherHours: theoryHours + practiceHours * practiceMultiplier,
}));

const groupKey = value => String(value || '').toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф').replace(/m/g, 'м').replace(/c/g, 'с');
export function teacherLoad(teacher, group, semester) {
  if (String(teacher || '').trim().toLowerCase().split(/\s+/)[0] !== 'трипольский') return null;
  const key = groupKey(group) === '11м' ? '11мс' : groupKey(group);
  const rows = teachingLoads.filter(row => row.group === key);
  return rows.find(row => row.semester === semester) || (rows.length ? { group: key, semester, theoryHours: 0, practiceHours: 0, practiceMultiplier: rows[0].practiceMultiplier, teacherHours: 0 } : null);
}

export function semesterForDate(date) {
  return Number(String(date).slice(5, 7)) >= 9 ? 1 : 2;
}

export function annualTypePairs(teacher, group, type) {
  const loads = [1, 2].map(s => teacherLoad(teacher, group, s)).filter(Boolean);
  if (!loads.length) return null;
  return loads.reduce((sum, row) => sum + (type === 'theory' ? row.theoryHours : type === 'practice' ? row.practiceHours : 0), 0) / 2;
}
