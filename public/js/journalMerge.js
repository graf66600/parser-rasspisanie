// Pure, loss-averse reconciliation. Missing fields never mean "erase".
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

export function mergeJournalEntry(local, remote, baseline, preferLocal = false) {
  if (!local) return { entry: remote, fields: [] };
  if (!remote) return { entry: local, fields: [] };
  const fields = [];
  const paths = [];
  function mergeValue(a, b, base, path, segments = []) {
    if (same(a, b) || b === undefined) return a;
    if (a === undefined) return b;
    if (object(a) && object(b)) {
      const result = { ...b, ...a };
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        result[key] = mergeValue(a[key], b[key], base?.[key], `${path}.${key}`, [...segments, key]);
      }
      return result;
    }
    if (base !== undefined) {
      if (same(a, base)) return b;
      if (same(b, base)) return a;
    }
    // Without a verified baseline we cannot infer whether an empty mark is a deletion.
    // Keep the device's value visible, archive both, and request an explicit choice.
    fields.push(path);
    paths.push(segments);
    return a;
  }
  const entry = preferLocal ? { ...remote, ...local } : { ...local, ...remote };
  if (own(local, 'attendance') || own(remote, 'attendance')) {
    entry.attendance = mergeValue(local.attendance || {}, remote.attendance || {}, baseline?.attendance, 'attendance', ['attendance']);
  }
  // Preserve comments, notes and topics if an older payload simply omits them.
  for (const key of Object.keys(local)) {
    if (!own(remote, key)) entry[key] = local[key];
  }
  return { entry, fields, paths };
}

export function mergeJournalLists(local, remote, { baseline = {}, pending = new Set(), removed = new Set(), changed = new Set() } = {}) {
  const byId = new Map(local.filter(entry => !removed.has(entry.id)).map(entry => [entry.id, entry]));
  const conflicts = [];
  for (const incoming of remote) {
    if (!incoming?.id || removed.has(incoming.id)) continue;
    const previous = byId.get(incoming.id);
    const result = mergeJournalEntry(previous, incoming, baseline[incoming.id], pending.has(incoming.id) || changed.has(incoming.id));
    if (result.fields.length) conflicts.push({ id: incoming.id, local: previous, remote: incoming, fields: result.fields, paths: result.paths });
    byId.set(incoming.id, result.entry);
  }
  return { entries: [...byId.values()], conflicts };
}
