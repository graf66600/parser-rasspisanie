// tests/test-11fm-topic.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { SourceTextModule, SyntheticModule, createContext } = require('node:vm');

test('topicHelper: recommended lesson for 11fm (subgroup 2, Tripolsky)', async () => {
  const curriculum = JSON.parse(readFileSync('data/curriculum.json', 'utf8'));
  const schedule = JSON.parse(readFileSync('data/schedule.json', 'utf8'));
  const state = {
    schedule,
    curriculumPrograms: curriculum,
    journalEntries: [],
  };

  const context = createContext({
    console,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ appendChild: () => {}, setAttribute: () => {} }),
      body: { appendChild: () => {} },
    },
    localStorage: { getItem: () => null, setItem: () => {} },
  });

  const stateModule = new SyntheticModule(['state', 'formatLocalDate'], function() {
    this.setExport('state', state);
    this.setExport('formatLocalDate', () => '2026-11-09');
  }, { context });
  await stateModule.link(() => {});
  await stateModule.evaluate();

  const code = readFileSync('js/topicHelper.js', 'utf8');
  const mod = new SourceTextModule(code, { context });
  const deps = new Map();
  await mod.link((specifier) => {
    if (specifier === './state.js') return stateModule;
    if (!deps.has(specifier)) deps.set(specifier, new SourceTextModule(readFileSync('js/' + specifier.slice(2), 'utf8'), { context }));
    return deps.get(specifier);
  });
  await mod.evaluate();

  // 1. Понедельник 09.11.2026, пара 3
  const mon = mod.namespace.getRecommendedLesson('11фм', 3, '2026-11-09');
  console.log('Monday 09.11 pair 3:', mon);
  assert.equal(mon.number, 8, 'Понедельник 09.11 должен быть Практикой №8');
  assert.equal(mon.type, 'practice', 'Должен быть тип practice');
  assert.match(mon.text, /Настройка параметров страницы/, 'Тема должна быть Практикой №8');

  // 2. Пятница 13.11.2026, пара 4
  const fri = mod.namespace.getRecommendedLesson('11фм', 4, '2026-11-13');
  console.log('Friday 13.11 pair 4:', fri);
  assert.equal(fri.number, 9, 'Пятница 13.11 должна быть Практикой №9');
  assert.equal(fri.type, 'practice', 'Должен быть тип practice');
  assert.match(fri.text, /Оформление списков/, 'Тема должна быть Практикой №9');

  console.log('✅ ВСЕ ТЕСТЫ ДЛЯ 11ФМ УСПЕШНО ПРОЙДЕНЫ!');
});
