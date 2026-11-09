// ==========================================================================
// BELLS PRESETS & SCHEDULE REPLACEMENTS / OVERRIDES
// ==========================================================================
import { state } from './state.js';

export const BELLS_PRESETS = {
  standard: {
    id: 'standard',
    name: '🔔 Обычный (1ч 20м)',
    bells: [
      { lessonNumber: 1, startTime: '08:00', endTime: '09:20' },
      { lessonNumber: 2, startTime: '09:30', endTime: '10:50' },
      { lessonNumber: 3, startTime: '11:00', endTime: '12:20' },
      { lessonNumber: 4, startTime: '13:00', endTime: '14:20' },
      { lessonNumber: 5, startTime: '14:30', endTime: '15:50' },
      { lessonNumber: 6, startTime: '16:00', endTime: '17:20' },
      { lessonNumber: 7, startTime: '17:30', endTime: '18:50' },
    ],
  },
  shortened: {
    id: 'shortened',
    name: '⚡ Сокращённый (45-50м)',
    bells: [
      { lessonNumber: 1, startTime: '08:00', endTime: '08:50' },
      { lessonNumber: 2, startTime: '09:00', endTime: '09:50' },
      { lessonNumber: 3, startTime: '10:00', endTime: '10:50' },
      { lessonNumber: 4, startTime: '11:10', endTime: '12:00' },
      { lessonNumber: 5, startTime: '12:10', endTime: '13:00' },
      { lessonNumber: 6, startTime: '13:10', endTime: '14:00' },
      { lessonNumber: 7, startTime: '14:10', endTime: '15:00' },
    ],
  },
  saturday: {
    id: 'saturday',
    name: '📅 Субботний (1ч 10м)',
    bells: [
      { lessonNumber: 1, startTime: '08:30', endTime: '09:40' },
      { lessonNumber: 2, startTime: '09:50', endTime: '11:00' },
      { lessonNumber: 3, startTime: '11:10', endTime: '12:20' },
      { lessonNumber: 4, startTime: '12:40', endTime: '13:50' },
      { lessonNumber: 5, startTime: '14:00', endTime: '15:10' },
    ],
  },
};

const OVERRIDES_STORAGE_KEY = 'pwa_schedule_overrides';
const PRESET_STORAGE_KEY = 'pwa_active_bells_preset';

export function getActiveBellsPresetId() {
  try {
    return localStorage.getItem(PRESET_STORAGE_KEY) || 'standard';
  } catch (e) {
    return 'standard';
  }
}

export function setActiveBellsPreset(presetId) {
  const preset = BELLS_PRESETS[presetId] || BELLS_PRESETS.standard;
  state.bells = preset.bells;
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, presetId);
  } catch (e) {}
  return preset;
}

export function initBellsPreset() {
  const activeId = getActiveBellsPresetId();
  if (activeId !== 'standard' && BELLS_PRESETS[activeId]) {
    state.bells = BELLS_PRESETS[activeId].bells;
  }
}

export function getScheduleOverrides() {
  try {
    const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function getLessonOverride(lessonKey) {
  const overrides = getScheduleOverrides();
  return overrides[lessonKey] || null;
}

export function setLessonOverride(lessonKey, overrideData) {
  const overrides = getScheduleOverrides();
  if (!overrideData) {
    delete overrides[lessonKey];
  } else {
    overrides[lessonKey] = {
      ...overrideData,
      updatedAt: new Date().toISOString(),
    };
  }
  try {
    localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  } catch (e) {}
  return overrides[lessonKey] || null;
}

export function renderBellsPresetSelector(containerId = 'bellsPresetContainer', onPresetChanged) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const currentId = getActiveBellsPresetId();
  container.innerHTML = `
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
      <span class="text-slate-400 text-[11px] whitespace-nowrap">Звонки:</span>
      ${Object.values(BELLS_PRESETS).map((p) => `
        <button type="button" class="preset-btn px-2.5 py-1 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${p.id === currentId ? 'bg-blue-600 text-white border-blue-500 shadow-sm' : 'bg-slate-900/80 text-slate-300 border-slate-700/80 hover:bg-slate-800'}" data-preset="${p.id}">
          ${p.name}
        </button>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pid = btn.getAttribute('data-preset');
      setActiveBellsPreset(pid);
      renderBellsPresetSelector(containerId, onPresetChanged);
      if (typeof onPresetChanged === 'function') onPresetChanged();
    });
  });
}
