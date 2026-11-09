// ==========================================================================
// STUDENT SUBGROUPS MANAGEMENT
// ==========================================================================
import { state } from './state.js';

const STORAGE_KEY = 'pwa_student_subgroups';

function normalizeGroupName(group) {
  return String(group || '').trim().toLowerCase().replace(/[^0-9а-яёa-z]/gi, '');
}

export function initStudentSubgroups() {
  if (!state.studentSubgroups) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      state.studentSubgroups = stored ? JSON.parse(stored) : {};
    } catch (e) {
      state.studentSubgroups = {};
    }
  }

  // Значение по умолчанию: Кипарис в 31фм относится ко 2-й подгруппе
  const g31 = Object.keys(state.studentSubgroups).find(
    (k) => normalizeGroupName(k) === '31фм'
  );
  const targetKey = g31 || '31фм';
  if (!state.studentSubgroups[targetKey]) {
    state.studentSubgroups[targetKey] = {};
  }
  if (!state.studentSubgroups[targetKey]['Кипарис']) {
    state.studentSubgroups[targetKey]['Кипарис'] = 2;
  }

  return state.studentSubgroups;
}

export function getStudentSubgroup(group, studentName, originalIndex = 0, totalStudents = 1) {
  initStudentSubgroups();
  const cleanGroup = normalizeGroupName(group);
  const matchedKey = Object.keys(state.studentSubgroups).find(
    (k) => normalizeGroupName(k) === cleanGroup
  );

  const groupMap = matchedKey ? state.studentSubgroups[matchedKey] : null;
  if (groupMap) {
    // 1. Точное совпадение
    if (groupMap[studentName] === 1 || groupMap[studentName] === 2) {
      return groupMap[studentName];
    }
    // 2. Частичное совпадение (например, по фамилии)
    const lowerName = String(studentName || '').toLowerCase();
    for (const [key, sub] of Object.entries(groupMap)) {
      const lowerKey = key.toLowerCase();
      if ((lowerName.includes(lowerKey) || lowerKey.includes(lowerName)) && (sub === 1 || sub === 2)) {
        return sub;
      }
    }
  }

  // Специальное правило по умолчанию для Кипарис в 31фм
  if (cleanGroup === '31фм' && String(studentName || '').toLowerCase().includes('кипарис')) {
    return 2;
  }

  // Распределение по умолчанию (первая половина — 1 п/г, вторая — 2 п/г)
  const mid = Math.ceil(Math.max(totalStudents, 1) / 2);
  return originalIndex < mid ? 1 : 2;
}

export function setStudentSubgroup(group, studentName, subgroup) {
  initStudentSubgroups();
  const subNum = Number(subgroup) === 1 ? 1 : 2;
  const cleanGroup = normalizeGroupName(group);
  let targetKey = Object.keys(state.studentSubgroups).find(
    (k) => normalizeGroupName(k) === cleanGroup
  ) || group;

  if (!state.studentSubgroups[targetKey]) {
    state.studentSubgroups[targetKey] = {};
  }

  state.studentSubgroups[targetKey][studentName] = subNum;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.studentSubgroups));
  } catch (e) {}

  return subNum;
}
