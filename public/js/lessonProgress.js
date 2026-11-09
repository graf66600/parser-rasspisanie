import { teacherLoad, semesterForDate, annualTypePairs } from './teachingLoad.js';
// Pure accounting: a course stream is teacher + subject + group + type + subgroup.
export const normalizeGroup = value => String(value || '').toLowerCase()
  .replace(/^группа\s*/i, '').replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
export const normalizeTeacher = value => String(value || '').trim().toLowerCase();
export const normalizeSubgroup = value => value && value !== 'all' ? String(value) : '';
export const normalizeSubject = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function findProgram(programs, group) {
  const key = normalizeGroup(group);
  return key ? (programs || []).find(p => (p.groups || []).some(g => normalizeGroup(g) === key)) || null : null;
}

export function programMatchesSubject(program, subject) {
  const name = normalizeSubject(subject);
  return Boolean(name && program && (normalizeSubject(program.title) === name
    || (name.includes('информ') && normalizeSubject(program.title).includes('информ'))));
}

export function lessonType(entry, program) {
  if (entry.type) return entry.type;
  const match = program?.lessons?.find(l => (l.text || l.topic) === entry.topic);
  if (match) return match.type;
  if (/практик|практическ/i.test(entry.topic || '')) return 'practice';
  if (/лекци|теори/i.test(entry.topic || '')) return 'theory';
  return null;
}

export function scopedEntries(state, group, subject) {
  const teacher = normalizeTeacher(state.currentTeacher || state.schedule?.teacher);
  return (state.journalEntries || []).filter(e => normalizeGroup(e.group) === normalizeGroup(group)
    && teacher && normalizeTeacher(e.teacher) === teacher
    && (!subject || normalizeSubject(e.subject) === normalizeSubject(subject)));
}

export function uniqueEntries(entries) {
  return [...new Map(entries.map(e => [
    [e.date, Number(e.lessonNumber), normalizeTeacher(e.teacher), normalizeSubject(e.subject),
      normalizeGroup(e.group), normalizeSubgroup(e.subgroup)].join('|'), e,
  ])).values()];
}

// Confirmed by the teacher: practice 8 on Nov 9, subgroup 2. This is a
// checkpoint, not an extra seven lessons added to an already populated journal.
export function confirmedCheckpoint(teacher, group, subgroup, type, subject) {
  if (normalizeTeacher(teacher).split(/\s+/)[0] === 'трипольский'
    && normalizeGroup(group) === '11фм' && normalizeSubgroup(subgroup) === '2'
    && type === 'practice' && normalizeSubject(subject) === 'информатика') {
    return { date: '2026-11-09', lessonNumber: 3, number: 8 };
  }
  return null;
}

export function scheduleOnDate(state, date) {
  const schedule = state.schedule;
  // A timetable is valid only for its actual week, never for an arbitrary date.
  if (!schedule?.weekStart || date < schedule.weekStart || date > (schedule.weekEnd || schedule.weekStart)) return [];
  const day = new Date(`${date}T12:00:00`).getDay() || 7;
  return (schedule.lessons || []).filter(l => {
    if (Number(l.dayOfWeek) !== day) return false;
    const key = `${l.group || ''}_${l.lessonNumber}_${l.dayOfWeek}_${l.subgroup || ''}`;
    const override = state.scheduleOverrides?.[key];
    const changed = override?.updatedAt?.slice(0, 10);
    if (changed && changed >= schedule.weekStart && changed <= (schedule.weekEnd || schedule.weekStart)) {
      if (override.type === 'cancelled') return false;
      if (override.type === 'replaced' && normalizeTeacher(override.teacher) !== normalizeTeacher(l.teacher || schedule.teacher)) return false;
    }
    return true;
  });
}

const position = entry => `${entry.date}_${String(Number(entry.lessonNumber)).padStart(2, '0')}`;

export function recommendLesson(state, group, bell, date, context = {}) {
  const program = findProgram(state.curriculumPrograms, group);
  if (!program?.lessons?.length) return null;
  const teacher = context.teacher || state.currentTeacher || state.schedule?.teacher;
  const candidates = scheduleOnDate(state, date).filter(l => normalizeGroup(l.group) === normalizeGroup(group)
    && Number(l.lessonNumber) === Number(bell)
    && normalizeTeacher(l.teacher || state.schedule?.teacher) === normalizeTeacher(teacher)
    && (context.subgroup === undefined || normalizeSubgroup(l.subgroup) === normalizeSubgroup(context.subgroup))
    && (!context.subject || normalizeSubject(l.subject) === normalizeSubject(context.subject)));
  const current = candidates.length === 1 ? candidates[0] : null;
  const subject = context.subject || current?.subject;
  if (!teacher || !programMatchesSubject(program, subject)) return null;
  const subgroup = normalizeSubgroup(context.subgroup ?? current?.subgroup);
  if (normalizeTeacher(teacher).split(/\s+/)[0] === 'трипольский' && normalizeGroup(group) === '11фм' && subgroup !== '2') return null;
  const entries = uniqueEntries(scopedEntries({ ...state, currentTeacher: teacher }, group, subject));
  const existing = entries.find(e => e.date === date && Number(e.lessonNumber) === Number(bell)
    && normalizeSubgroup(e.subgroup) === subgroup);
  if (existing?.topic) return { text: existing.topic, number: existing.courseLessonNumber || null,
    type: lessonType(existing, program), homework: existing.notes || '', subject, subgroup };
  if (!current) return null;
  const types = [...new Set(program.lessons.map(l => l.type))];
  const load = teacherLoad(teacher, group, semesterForDate(date));
  const type = context.type || current?.type || (load?.theoryHours === 0 ? 'practice' : subgroup ? 'practice' : load?.theoryHours > 0 ? 'theory' : types.length === 1 ? types[0] : null);
  // No date-based guesses about when lectures end and practices begin.
  if (!type) return null;
  const stream = entries.filter(e => lessonType(e, program) === type
    && normalizeSubgroup(e.subgroup) === subgroup);
  const target = position({ date, lessonNumber: bell });
  const checkpoint = confirmedCheckpoint(teacher, group, subgroup, type, subject);
  const anchors = stream.filter(e => Number(e.courseLessonNumber) > 0 && position(e) < target)
    .map(e => ({ ...e, number: Number(e.courseLessonNumber) }));
  if (checkpoint && position(checkpoint) <= target) {
    // Older automatically calculated numbers must not override the confirmed correction.
    anchors.splice(0, anchors.length, ...anchors.filter(e => position(e) > position(checkpoint)));
    anchors.push(checkpoint);
  }
  anchors.sort((a, b) => position(a).localeCompare(position(b)));
  const anchor = anchors.at(-1);
  const events = new Map(stream.map(e => [position(e), e]));
  if (state.schedule?.weekStart) {
    for (let offset = 0; offset < 7; offset++) {
      const day = new Date(`${state.schedule.weekStart}T12:00:00Z`);
      day.setUTCDate(day.getUTCDate() + offset);
      const dayDate = day.toISOString().slice(0, 10);
      for (const l of scheduleOnDate(state, dayDate)) {
        if (normalizeGroup(l.group) !== normalizeGroup(group)
          || normalizeTeacher(l.teacher || state.schedule.teacher) !== normalizeTeacher(teacher)
          || normalizeSubject(l.subject) !== normalizeSubject(subject)
          || normalizeSubgroup(l.subgroup) !== subgroup
          || (l.type || (load?.theoryHours === 0 ? 'practice' : l.subgroup ? 'practice' : load?.theoryHours > 0 ? 'theory' : types.length === 1 ? types[0] : null)) !== type) continue;
        const event = { ...l, date: dayDate };
        if (!events.has(position(event))) events.set(position(event), event);
      }
    }
  }
  const afterAnchor = [...events.keys()].filter(key => key < target && (!anchor || key > position(anchor))).length;
  const number = anchor ? anchor.number + afterAnchor + (position(anchor) === target ? 0 : 1) : afterAnchor + 1;
  const planned = annualTypePairs(teacher, group, type);
  const lesson = planned !== null && number > planned ? null : program.lessons.filter(l => l.type === type)[number - 1];
  if (!lesson) return { text: '', number, type, completed: planned !== null && number > planned, missingTopic: true, subject, subgroup };
  return { text: lesson.text || lesson.topic, number, type, lessonObj: lesson,
    homework: lesson.homework || '', subject, subgroup, estimated: !anchor, topicUnverified: Boolean(load) && !program.topicsVerified };
}
