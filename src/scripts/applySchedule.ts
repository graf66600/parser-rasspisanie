import fs from 'fs';
import path from 'path';
import { ExcelParser } from '../services/excelParser.js';
import { SupabaseService } from '../services/supabaseService.js';
import { StorageService } from '../services/storageService.js';
import { DEFAULT_BELLS, CONFIG } from '../config/config.js';
import { findLatestScheduleFile } from '../services/scheduleFileHelper.js';

export async function applySchedule(filePath?: string) {
  const targetFile = filePath || findLatestScheduleFile();
  if (!targetFile || !fs.existsSync(targetFile)) {
    console.error('❌ Не найден файл расписания Excel для обработки.');
    return false;
  }

  console.log(`📄 Чтение и парсинг файла расписания: ${path.basename(targetFile)}...`);
  const buffer = fs.readFileSync(targetFile);

  // 1. Парсинг для Трипольского (основной преподаватель с КТП)
  const tripolskyResult = ExcelParser.parseBuffer(buffer, DEFAULT_BELLS, 'Трипольский', 'Информатика');
  console.log(`✅ Найдено пар Трипольского: ${tripolskyResult.totalFound}`);

  // 2. Парсинг для всех преподавателей
  const multiResult = ExcelParser.parseAllTeachers(buffer, DEFAULT_BELLS);
  console.log(`✅ Найдено преподавателей: ${multiResult.teachers.length}, всего пар: ${multiResult.allLessons.length}`);

  // 3. Формирование структур данных
  const scheduleData = {
    success: true,
    teacher: 'Трипольский',
    subject: 'Информатика',
    lessons: tripolskyResult.lessons,
    bells: DEFAULT_BELLS,
    updatedAt: new Date().toISOString(),
  };

  const multiSchedule = [{
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
    lessons: tripolskyResult.lessons,
  }];

  // 4. Запись в папки data/ и public/data/
  const filesToSave: Array<{ subPath: string; content: string }> = [
    { subPath: 'schedule.json', content: JSON.stringify(scheduleData, null, 2) },
    { subPath: 'schedules.json', content: JSON.stringify(multiSchedule, null, 2) },
    { subPath: 'schedules_all.json', content: JSON.stringify(multiResult.lessonsByTeacher, null, 2) },
    { subPath: 'teachers.json', content: JSON.stringify(multiResult.teachers, null, 2) },
  ];

  for (const item of filesToSave) {
    const p1 = path.resolve(CONFIG.DATA_DIR, item.subPath);
    const p2 = path.resolve(process.cwd(), 'public', 'data', item.subPath);
    fs.mkdirSync(path.dirname(p1), { recursive: true });
    fs.mkdirSync(path.dirname(p2), { recursive: true });
    fs.writeFileSync(p1, item.content, 'utf8');
    fs.writeFileSync(p2, item.content, 'utf8');
  }

  // Сохраняем копию как latest_schedule.xlsx
  try {
    fs.writeFileSync(path.resolve(CONFIG.DATA_DIR, 'latest_schedule.xlsx'), buffer);
    fs.writeFileSync(path.resolve(process.cwd(), 'public', 'data', 'latest_schedule.xlsx'), buffer);
  } catch (e) {}

  // 5. Сохранение в StorageService
  const storage = StorageService.getInstance();
  storage.saveUserSchedule(1, 1, tripolskyResult.lessons);

  // 6. Синхронизация с Supabase
  try {
    const supabase = SupabaseService.getInstance();
    console.log('☁️ Синхронизация преподавателей и пар с Supabase...');
    await supabase.saveTeachers(multiResult.teachers);
    for (const [tName, tLessons] of Object.entries(multiResult.lessonsByTeacher)) {
      await supabase.saveLessons(tName, tLessons);
    }
    console.log('✅ Данные успешно синхронизированы с облаком Supabase!');
  } catch (err) {
    console.warn('⚠️ Ошибка синхронизации с Supabase:', err);
  }

  console.log('🎉 Расписание успешно применено во все файлы системы!');
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const argFile = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  applySchedule(argFile).then(() => process.exit(0)).catch((e) => {
    console.error('Ошибка выполнения:', e);
    process.exit(1);
  });
}
