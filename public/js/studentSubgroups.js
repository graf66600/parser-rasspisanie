// ==========================================================================
// STUDENT SUBGROUPS MANAGEMENT & CLOUD SYNC
// ==========================================================================
import { state } from './state.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseSync.js';

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
    if (groupMap[studentName] === 1 || groupMap[studentName] === 2) {
      return groupMap[studentName];
    }
    const lowerName = String(studentName || '').toLowerCase();
    for (const [key, sub] of Object.entries(groupMap)) {
      const lowerKey = key.toLowerCase();
      if ((lowerName.includes(lowerKey) || lowerKey.includes(lowerName)) && (sub === 1 || sub === 2)) {
        return sub;
      }
    }
  }

  if (cleanGroup === '31фм' && String(studentName || '').toLowerCase().includes('кипарис')) {
    return 2;
  }

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
  saveSubgroupsLocally();
  pushSubgroupsToCloud().catch(() => {});

  return subNum;
}

export function splitGroupSubgroupsEqually(group, studentsList = []) {
  initStudentSubgroups();
  const cleanGroup = normalizeGroupName(group);
  let targetKey = Object.keys(state.studentSubgroups).find(
    (k) => normalizeGroupName(k) === cleanGroup
  ) || group;

  if (!state.studentSubgroups[targetKey]) {
    state.studentSubgroups[targetKey] = {};
  }

  const mid = Math.ceil(studentsList.length / 2);
  studentsList.forEach((s, idx) => {
    let sub = idx < mid ? 1 : 2;
    if (cleanGroup === '31фм' && String(s || '').toLowerCase().includes('кипарис')) {
      sub = 2;
    }
    state.studentSubgroups[targetKey][s] = sub;
  });

  saveSubgroupsLocally();
  pushSubgroupsToCloud().catch(() => {});
}

export function setAllToSubgroup(group, studentsList = [], subNum = 1) {
  initStudentSubgroups();
  const cleanGroup = normalizeGroupName(group);
  let targetKey = Object.keys(state.studentSubgroups).find(
    (k) => normalizeGroupName(k) === cleanGroup
  ) || group;

  if (!state.studentSubgroups[targetKey]) {
    state.studentSubgroups[targetKey] = {};
  }

  studentsList.forEach((s) => {
    state.studentSubgroups[targetKey][s] = Number(subNum) === 2 ? 2 : 1;
  });

  saveSubgroupsLocally();
  pushSubgroupsToCloud().catch(() => {});
}

export function invertGroupSubgroups(group, studentsList = []) {
  initStudentSubgroups();
  const cleanGroup = normalizeGroupName(group);
  let targetKey = Object.keys(state.studentSubgroups).find(
    (k) => normalizeGroupName(k) === cleanGroup
  ) || group;

  if (!state.studentSubgroups[targetKey]) {
    state.studentSubgroups[targetKey] = {};
  }

  studentsList.forEach((s, idx) => {
    const current = getStudentSubgroup(group, s, idx, studentsList.length);
    state.studentSubgroups[targetKey][s] = current === 1 ? 2 : 1;
  });

  saveSubgroupsLocally();
  pushSubgroupsToCloud().catch(() => {});
}

function saveSubgroupsLocally() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.studentSubgroups));
  } catch (e) {}
}

export async function pushSubgroupsToCloud() {
  if (typeof window === 'undefined' || !navigator.onLine) return;
  try {
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    };

    await fetch(`${SUPABASE_URL}/rest/v1/app_metadata?on_conflict=key`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        key: 'student_subgroups',
        data: state.studentSubgroups,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (e) {}
}

export async function fetchRemoteSubgroups() {
  if (typeof window === 'undefined' || !navigator.onLine) return null;
  try {
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_metadata?key=eq.student_subgroups&select=data`, { headers });
    if (!res.ok) return null;
    const rows = await res.json();
    if (Array.isArray(rows) && rows[0]?.data) {
      const remote = rows[0].data;
      initStudentSubgroups();
      // Мержим удаленные настройки с локальными
      Object.keys(remote).forEach((g) => {
        if (!state.studentSubgroups[g]) state.studentSubgroups[g] = {};
        Object.assign(state.studentSubgroups[g], remote[g]);
      });
      saveSubgroupsLocally();
      return state.studentSubgroups;
    }
  } catch (e) {}
  return null;
}
