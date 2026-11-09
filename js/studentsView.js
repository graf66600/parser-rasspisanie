// ==========================================================================
// STUDENTS MANAGEMENT VIEW
// ==========================================================================
import { state } from './state.js';
import { pushStudentToCloud, deleteStudentFromCloud, pushBulkStudentsToCloud } from './supabaseSync.js';
import {
  getStudentSubgroup,
  setStudentSubgroup,
  splitGroupSubgroupsEqually,
  setAllToSubgroup,
  invertGroupSubgroups,
} from './studentSubgroups.js';

async function ensureXLSX() {
  if (window.XLSX) return window.XLSX;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error('Не удалось загрузить библиотеку обработки Excel'));
    document.head.appendChild(script);
  });
}

export function renderManageStudents(onStudentsChanged) {
  const groupSel = document.getElementById('manageGroupSelect');
  if (!groupSel) return;
  const group = groupSel.value;
  const listEl = document.getElementById('manageStudentsList');
  if (!listEl) return;

  const students = state.studentsByGroup[group] || [];
  if (students.length === 0) {
    listEl.innerHTML = `<div style="text-align: center; color: #64748b; font-size: 12px; padding: 12px;">В этой группе пока нет студентов</div>`;
    return;
  }

  listEl.innerHTML = '';

  const sub1Count = students.filter((s, i) => getStudentSubgroup(group, s, i, students.length) === 1).length;
  const sub2Count = students.length - sub1Count;

  const summary = document.createElement('div');
  summary.className = 'flex items-center justify-between text-xs text-slate-400 bg-slate-950/40 border border-slate-800/80 rounded-xl px-3 py-2 mb-2';
  summary.innerHTML = `
    <span>Всего: <b class="text-white">${students.length}</b></span>
    <span class="text-blue-400">1-я п/г: <b class="text-white">${sub1Count}</b></span>
    <span class="text-purple-400">2-я п/г: <b class="text-white">${sub2Count}</b></span>
  `;
  listEl.appendChild(summary);

  const massActions = document.createElement('div');
  massActions.className = 'subgroup-mass-actions mb-3';
  massActions.innerHTML = `
    <button type="button" class="mass-action-btn" id="massSplitHalfBtn" title="Разделить студентов группы поровну (1 и 2 п/г)">⚖️ Пополам (1 и 2)</button>
    <button type="button" class="mass-action-btn" id="massAllSub1Btn" title="Назначить всех студентов в 1-ю подгруппу">1️⃣ Все в 1 п/г</button>
    <button type="button" class="mass-action-btn" id="massInvertBtn" title="Поменять подгруппы местами">🔄 Инвертировать (1 ⇄ 2)</button>
  `;
  listEl.appendChild(massActions);

  massActions.querySelector('#massSplitHalfBtn')?.addEventListener('click', () => {
    splitGroupSubgroupsEqually(group, students);
    renderManageStudents(onStudentsChanged);
    if (typeof onStudentsChanged === 'function') onStudentsChanged();
  });

  massActions.querySelector('#massAllSub1Btn')?.addEventListener('click', () => {
    setAllToSubgroup(group, students, 1);
    renderManageStudents(onStudentsChanged);
    if (typeof onStudentsChanged === 'function') onStudentsChanged();
  });

  massActions.querySelector('#massInvertBtn')?.addEventListener('click', () => {
    invertGroupSubgroups(group, students);
    renderManageStudents(onStudentsChanged);
    if (typeof onStudentsChanged === 'function') onStudentsChanged();
  });

  students.forEach((student, idx) => {
    const sub = getStudentSubgroup(group, student, idx, students.length);
    const item = document.createElement('div');
    item.className = 'student-manage-item';
    item.innerHTML = `
      <span class="student-manage-name"><b style="color: #64748b; margin-right: 6px;">${idx + 1}.</b>${student}</span>
      <div class="student-subgroup-controls">
        <button type="button" class="subgroup-pill-btn ${sub === 1 ? 'active-sub1' : ''}" data-sub="1" title="Назначить в 1-ю подгруппу">1 п/г</button>
        <button type="button" class="subgroup-pill-btn ${sub === 2 ? 'active-sub2' : ''}" data-sub="2" title="Назначить во 2-ю подгруппу">2 п/г</button>
      </div>
      <button class="student-del-btn" title="Удалить студента">✕</button>
    `;

    item.querySelectorAll('.subgroup-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetSub = Number(btn.getAttribute('data-sub'));
        setStudentSubgroup(group, student, targetSub);
        renderManageStudents(onStudentsChanged);
        if (typeof onStudentsChanged === 'function') onStudentsChanged();
      });
    });

    item.querySelector('.student-del-btn')?.addEventListener('click', () => {
      if (confirm(`Удалить студента ${student}?`)) {
        state.studentsByGroup[group] = state.studentsByGroup[group].filter((s) => s !== student);
        localStorage.setItem('pwa_custom_students', JSON.stringify(state.studentsByGroup));
        deleteStudentFromCloud(group, student);
        renderManageStudents(onStudentsChanged);
        if (typeof onStudentsChanged === 'function') onStudentsChanged();
      }
    });

    listEl.appendChild(item);
  });
}

export function setupStudentsListeners(onStudentsChanged) {
  document.getElementById('manageGroupSelect')?.addEventListener('change', () => {
    renderManageStudents(onStudentsChanged);
  });

  document.getElementById('addStudentBtn')?.addEventListener('click', () => {
    const input = document.getElementById('newStudentNameInput');
    const group = document.getElementById('manageGroupSelect')?.value;
    const name = input?.value.trim();
    if (!name || !group) return;

    if (!state.studentsByGroup[group]) state.studentsByGroup[group] = [];
    if (!state.studentsByGroup[group].includes(name)) {
      state.studentsByGroup[group].push(name);
      state.studentsByGroup[group].sort((a, b) => a.localeCompare(b, 'ru'));
      localStorage.setItem('pwa_custom_students', JSON.stringify(state.studentsByGroup));
      pushStudentToCloud(group, name);
    }

    input.value = '';
    renderManageStudents(onStudentsChanged);
    if (typeof onStudentsChanged === 'function') onStudentsChanged();
  });

  document.getElementById('saveBulkStudentsBtn')?.addEventListener('click', () => {
    const textarea = document.getElementById('bulkStudentsText');
    const group = document.getElementById('manageGroupSelect')?.value;
    const text = textarea?.value.trim();
    if (!text || !group) return;

    const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/^[\d\s\.\,\-\)\(\]]+/, '').trim()).filter((l) => l.length > 0);
    state.studentsByGroup[group] = Array.from(new Set(lines));
    localStorage.setItem('pwa_custom_students', JSON.stringify(state.studentsByGroup));
    pushBulkStudentsToCloud(group, state.studentsByGroup[group]);

    textarea.value = '';
    alert(`✅ Список студентов группы ${group} сохранен!`);
    renderManageStudents(onStudentsChanged);
    if (typeof onStudentsChanged === 'function') onStudentsChanged();
  });

  document.getElementById('studentsDropZone')?.addEventListener('click', () => {
    document.getElementById('studentsFileInput')?.click();
  });

  document.getElementById('studentsFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    const group = document.getElementById('manageGroupSelect')?.value;
    if (!file || !group) return;

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      try {
        await ensureXLSX();
      } catch (e) {
        alert('Не удалось загрузить библиотеку для чтения Excel');
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const data = evt.target.result;
        let names = [];
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          if (window.XLSX) {
            const wb = window.XLSX.read(data, { type: 'binary' });
            const firstSheet = wb.Sheets[wb.SheetNames[0]];
            const rows = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
            for (const r of rows) {
              for (const c of (r || [])) {
                const val = String(c || '').trim();
                if (val && !val.match(/^(№|п\/п|фио|студент|список)/i)) {
                  const cleaned = val.replace(/^[\d\s\.\,\-\)\(\]]+/, '').trim();
                  if (cleaned.length >= 3 && cleaned.includes(' ')) names.push(cleaned);
                }
              }
            }
          }
        } else {
          const text = new TextDecoder('utf-8').decode(data);
          names = text.split(/\r?\n/).map((l) => l.trim().replace(/^[\d\s\.\,\-\)\(\]]+/, '').trim()).filter((l) => l.length > 2);
        }

        if (names.length > 0) {
          state.studentsByGroup[group] = Array.from(new Set(names));
          localStorage.setItem('pwa_custom_students', JSON.stringify(state.studentsByGroup));
          pushBulkStudentsToCloud(group, state.studentsByGroup[group]);
          alert(`✅ Загружено ${names.length} студентов для группы ${group}!`);
          renderManageStudents(onStudentsChanged);
          if (typeof onStudentsChanged === 'function') onStudentsChanged();
        } else {
          alert('В файле не найдено ФИО студентов');
        }
      } catch (err) {
        alert('Ошибка парсинга файла со студентами');
      }
    };

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}
