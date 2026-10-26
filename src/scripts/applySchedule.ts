import fs from 'fs';
import path from 'path';
import { SupabaseService } from '../services/supabaseService.js';
import { StorageService } from '../services/storageService.js';
import { DEFAULT_BELLS, CONFIG } from '../config/config.js';
import { Lesson } from '../types/schedule.js';
import { deduplicateLessons } from '../services/parser/parserUtils.js';
import {
  findLatestScheduleFile,
  parseScheduleBuffer,
  parseScheduleBufferAllTeachers,
  isPdfBuffer,
} from '../services/scheduleFileHelper.js';

function parseDateScore(name: string): number {
  const match = name.match(/(\d{1,2})[._](\d{1,2})/);
  if (!match) return 0;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  return month * 100 + day;
}

export async function applySchedule(inputFiles?: string | string[]) {
  let targets: string[] = [];

  if (inputFiles) {
    const list = Array.isArray(inputFiles) ? inputFiles : [inputFiles];
    targets = list.map((f) => path.resolve(process.cwd(), f));
  } else {
    const rootFiles = fs.readdirSync(process.cwd());
    const validScheduleFiles = rootFiles
      .filter((f) => {
        const lower = f.toLowerCase();
        if (f.startsWith('~$') || lower.includes('кп_') || lower.includes('стол')) return false;
        if (lower.startsWith('latest_schedule') || lower.includes('преподавателей_')) return false;
        const isSupported = lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.pdf');
        if (!isSupported) return false;
        return (
          lower.includes('чист') ||
          lower.includes('стенд') ||
          lower.includes('заочн') ||
          lower.includes('расписани') ||
          lower.includes('стационар') ||
          lower.includes('неделя') ||
          lower.includes('правк')
        );
      })
      .map((f) => ({
        name: f,
        path: path.resolve(process.cwd(), f),
        stat: fs.statSync(path.resolve(process.cwd(), f)),
      }));

    if (validScheduleFiles.length > 0) {
      // Сортировка по календарной дате в имени файла (например, 26.10 > 12.10)
      validScheduleFiles.sort((a, b) => {
        const scoreA = parseDateScore(a.name);
        const scoreB = parseDateScore(b.name);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return b.stat.mtimeMs - a.stat.mtimeMs;
      });

      const newest = validScheduleFiles[0];
      const dateMatch = newest.name.match(/(\d{1,2}[._]\d{1,2})[-_]+(\d{1,2}[._]\d{1,2})/);

      if (dateMatch) {
        const dateTag = dateMatch[0];
        targets = validScheduleFiles
          .filter((item) => item.name.includes(dateTag))
          .map((item) => item.path)
          .sort();
      } else {
        const threshold = newest.stat.mtimeMs - 24 * 60 * 60 * 1000;
        targets = validScheduleFiles
          .filter((item) => item.stat.mtimeMs >= threshold)
          .map((item) => item.path)
          .sort();
      }
    } else {
      const latest = findLatestScheduleFile();
      if (latest) targets = [latest];
    }
  }

  if (targets.length === 0) {
    console.error('❌ Не найден файл расписания (Excel или PDF) для обработки.');
    return false;
  }

  console.log(`📄 Обработка файлов расписания (${targets.length}):`);
  targets.forEach((t) => console.log(`   • ${path.basename(t)}`));

  const allTeachersSet = new Set<string>();
  const lessonsByTeacher: Record<string, Lesson[]> = {};
  let tripolskyLessons: Lesson[] = [];

  for (const file of targets) {
    const buffer = fs.readFileSync(file);
    const multi = await parseScheduleBufferAllTeachers(buffer, DEFAULT_BELLS);
    multi.teachers.forEach((t) => allTeachersSet.add(t));
    for (const [t, lessons] of Object.entries(multi.lessonsByTeacher)) {
      if (!lessonsByTeacher[t]) lessonsByTeacher[t] = [];
      lessonsByTeacher[t].push(...lessons);
    }

    const trip = await parseScheduleBuffer(buffer, DEFAULT_BELLS, 'Трипольский', 'Информатика');
    if (trip.lessons.length > 0) {
      tripolskyLessons.push(...trip.lessons);
    }
  }

  tripolskyLessons = deduplicateLessons(tripolskyLessons);
  tripolskyLessons.sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.lessonNumber - b.lessonNumber;
  });

  for (const t of Object.keys(lessonsByTeacher)) {
    lessonsByTeacher[t] = deduplicateLessons(lessonsByTeacher[t]);
    lessonsByTeacher[t].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.lessonNumber - b.lessonNumber;
    });
  }

  // Гарантируем, что для Трипольского записаны выверенные пары
  lessonsByTeacher['Трипольский'] = tripolskyLessons;
  allTeachersSet.add('Трипольский');

  const sortedTeachers = Array.from(allTeachersSet).sort((a, b) => {
    if (a === 'Трипольский') return -1;
    if (b === 'Трипольский') return 1;
    return a.localeCompare(b, 'ru');
  });

  console.log(`✅ Найдено пар Трипольского: ${tripolskyLessons.length}`);
  console.log(`✅ Найдено уникальных преподавателей: ${sortedTeachers.length}`);

  // Формирование структур данных
  const scheduleData = {
    success: true,
    teacher: 'Трипольский',
    subject: 'Информатика',
    lessons: tripolskyLessons,
    bells: DEFAULT_BELLS,
    updatedAt: new Date().toISOString(),
  };

  const multiSchedule = [
    {
      userId: 1,
      chatId: 1,
      updatedAt: new Date().toISOString(),
      settings: {
        remindMinutesBefore: 15,
        morningDigestEnabled: true,
        morningDigestTime: '08:00',
        bellsSchedule: DEFAULT_BELLS,
        teacherFilter: 'Трипольский',
        subjectFilter: 'Информатика',
      },
      lessons: tripolskyLessons,
    },
  ];

  // Запись в папки data/ и public/data/
  const filesToSave: Array<{ subPath: string; content: string }> = [
    { subPath: 'schedule.json', content: JSON.stringify(scheduleData, null, 2) },
    { subPath: 'schedules.json', content: JSON.stringify(multiSchedule, null, 2) },
    { subPath: 'schedules_all.json', content: JSON.stringify(lessonsByTeacher, null, 2) },
    { subPath: 'teachers.json', content: JSON.stringify(sortedTeachers, null, 2) },
  ];

  for (const item of filesToSave) {
    const p1 = path.resolve(CONFIG.DATA_DIR, item.subPath);
    const p2 = path.resolve(process.cwd(), 'public', 'data', item.subPath);
    fs.mkdirSync(path.dirname(p1), { recursive: true });
    fs.mkdirSync(path.dirname(p2), { recursive: true });
    fs.writeFileSync(p1, item.content, 'utf8');
    fs.writeFileSync(p2, item.content, 'utf8');
  }

  // Сохраняем копию расписания
  try {
    const mainTarget =
      targets.find((t) => {
        const l = t.toLowerCase();
        return l.includes('стационар1') || l.includes('правк') || l.includes('стационар');
      }) ||
      targets.find((t) => !t.toLowerCase().includes('заочн')) ||
      targets[0];
    const buffer = fs.readFileSync(mainTarget);
    const filename = isPdfBuffer(buffer) ? 'latest_schedule.pdf' : 'latest_schedule.xlsx';
    fs.writeFileSync(path.resolve(CONFIG.DATA_DIR, filename), buffer);
    fs.writeFileSync(path.resolve(process.cwd(), 'public', 'data', filename), buffer);
  } catch (e) {}

  // Сохранение в StorageService
  const storage = StorageService.getInstance();
  storage.saveUserSchedule(1, 1, tripolskyLessons);

  // Синхронизируем schedules.json в public/data
  const schedP1 = path.resolve(CONFIG.DATA_DIR, 'schedules.json');
  const schedP2 = path.resolve(process.cwd(), 'public', 'data', 'schedules.json');
  if (fs.existsSync(schedP1)) {
    fs.copyFileSync(schedP1, schedP2);
  }

  // Синхронизация с Supabase
  try {
    const supabase = SupabaseService.getInstance();
    console.log('☁️ Синхронизация преподавателей и пар с Supabase...');
    const syncPromise = (async () => {
      await supabase.saveTeachers(sortedTeachers);
      for (const [tName, tLessons] of Object.entries(lessonsByTeacher)) {
        await supabase.saveLessons(tName, tLessons);
      }
    })();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Supabase sync timeout (5s)')), 5000)
    );
    await Promise.race([syncPromise, timeoutPromise]);
    console.log('✅ Данные успешно синхронизированы с облаком Supabase!');
  } catch (err) {
    console.warn('⚠️ Пропуск синхронизации с Supabase (таймаут или оффлайн):', (err as Error)?.message || err);
  }

  console.log('🎉 Расписание успешно применено во все файлы системы!');
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const argFiles = process.argv.slice(2).filter(Boolean);
  applySchedule(argFiles.length > 0 ? argFiles : undefined)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Ошибка выполнения:', e);
      process.exit(1);
    });
}
