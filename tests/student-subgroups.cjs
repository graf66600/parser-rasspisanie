// Run: node --experimental-vm-modules --test tests/student-subgroups.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { SourceTextModule, SyntheticModule, createContext } = require('node:vm');

async function loadSubgroupsModule() {
  const storage = new Map();
  const context = createContext({
    console,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  });

  const stateModule = {
    state: { studentSubgroups: {} },
  };

  const code = readFileSync('js/studentSubgroups.js', 'utf8');
  const module = new SourceTextModule(code, { context });

  await module.link((specifier) => {
    if (specifier === './state.js') {
      return new SyntheticModule(['state'], function () {
        this.setExport('state', stateModule.state);
      }, { context });
    }
    if (specifier === './supabaseSync.js') {
      return new SyntheticModule(['SUPABASE_URL', 'SUPABASE_ANON_KEY'], function () {
        this.setExport('SUPABASE_URL', 'https://example.supabase.co');
        this.setExport('SUPABASE_ANON_KEY', 'anon-key');
      }, { context });
    }
    throw new Error(`Unexpected specifier: ${specifier}`);
  });

  await module.evaluate();
  return { ...module.namespace, state: stateModule.state };
}

test('Кипарис in 31фм defaults to subgroup 2', async () => {
  const { getStudentSubgroup } = await loadSubgroupsModule();
  const sub = getStudentSubgroup('31фм', 'Кипарис', 0, 10);
  assert.equal(sub, 2, 'Кипарис should be in subgroup 2');

  const subFullName = getStudentSubgroup('31фм', 'Кипарис Анастасия Сергеевна', 0, 10);
  assert.equal(subFullName, 2, 'Full name containing Кипарис should also be in subgroup 2');
});

test('Student subgroup can be changed and persisted', async () => {
  const { getStudentSubgroup, setStudentSubgroup } = await loadSubgroupsModule();
  setStudentSubgroup('31фм', 'Иванов Иван', 2);
  const sub = getStudentSubgroup('31фм', 'Иванов Иван', 0, 10);
  assert.equal(sub, 2, 'Иванов Иван should now be in subgroup 2');

  setStudentSubgroup('31фм', 'Кипарис', 1);
  const subAfterChange = getStudentSubgroup('31фм', 'Кипарис', 0, 10);
  assert.equal(subAfterChange, 1, 'Manual override should allow moving Кипарис to 1');
});

test('Mass actions: split equally, invert and set all', async () => {
  const {
    getStudentSubgroup,
    splitGroupSubgroupsEqually,
    setAllToSubgroup,
    invertGroupSubgroups,
  } = await loadSubgroupsModule();

  const students = ['Алексеев', 'Борисов', 'Васильев', 'Григорьев'];
  splitGroupSubgroupsEqually('тест1', students);
  assert.equal(getStudentSubgroup('тест1', 'Алексеев', 0, 4), 1);
  assert.equal(getStudentSubgroup('тест1', 'Григорьев', 3, 4), 2);

  invertGroupSubgroups('тест1', students);
  assert.equal(getStudentSubgroup('тест1', 'Алексеев', 0, 4), 2);
  assert.equal(getStudentSubgroup('тест1', 'Григорьев', 3, 4), 1);

  setAllToSubgroup('тест1', students, 1);
  assert.equal(getStudentSubgroup('тест1', 'Григорьев', 3, 4), 1);
});
