// Run: node --experimental-vm-modules --test tests/schedule-startup.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { SourceTextModule, SyntheticModule, createContext } = require('node:vm');

async function loadView(file, state, document, stored = []) {
  const storage = new Map([['pwa_journal', JSON.stringify(stored)]]);
  const context = createContext({
    console, document,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  });
  const noop = () => {};
  const dependencies = {
    './state.js': {
      state, PWA_VERSION: 'test', isStaticHost: true,
      DAY_NAMES: { 1: 'Понедельник' },
      formatLocalDate: () => '2026-10-26',
    },
    './topicHelper.js': { getRecommendedLesson: () => null },
    './journalStats.js': { renderJournalStats: noop },
    './journalView.js': { autoFillTopicForGroup: noop, loadEntryToForm: noop },
    './journalCard.js': { createHistoryCardElement: noop },
    './supabaseSync.js': {
      fetchRemoteJournal: async () => null, deleteJournalEntryFromCloud: noop,
    },
  };
  const module = new SourceTextModule(readFileSync(file, 'utf8'), { context });
  await module.link(name => {
    const values = dependencies[name];
    assert.ok(values, `Unexpected dependency: ${name}`);
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}

for (const root of ['', 'public/']) {
  for (const teacher of ['Трипольский', 'Иванова']) {
    test(`${root}schedule renders lessons for ${teacher}`, async () => {
      const cards = [];
      const container = { innerHTML: '', appendChild: card => cards.push(card) };
      const document = {
        getElementById: id => id === 'scheduleLessonsList' ? container : null,
        createElement: () => ({}), querySelectorAll: () => [],
      };
      const state = {
        currentTeacher: teacher, activeDay: 'all',
        schedule: { lessons: [{ dayOfWeek: 1, lessonNumber: 2,
          subject: 'Информатика', group: '11ф', startTime: '09:30', endTime: '10:50' }] },
      };
      const view = await loadView(`${root}js/scheduleView.js`, state, document);
      view.renderSchedule();
      assert.equal(cards.length, 1);
      assert.match(cards[0].innerHTML, /Информатика/);
      assert.match(cards[0].innerHTML, /open-journal-btn/);
    });

    test(`${root}journal startup completes for ${teacher}`, async () => {
      const state = { currentTeacher: teacher };
      const entry = { id: 'existing', teacher, date: '2026-09-10', type: 'practice' };
      const view = await loadView(`${root}js/journalHistory.js`, state,
        { getElementById: () => null }, [entry]);
      await view.loadJournalHistory();
      assert.equal(state.journalEntries.length, 1);
      assert.equal(state.journalEntries[0].type,
        teacher === 'Трипольский' ? 'theory' : 'practice');
    });
  }
}
