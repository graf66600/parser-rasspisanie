import fs from 'fs';
import path from 'path';
import { PdfParser } from './services/pdfParser.js';
import { DEFAULT_BELLS } from './config/config.js';
import {
  parseScheduleBuffer,
  parseScheduleBufferAllTeachers,
  isPdfBuffer,
} from './services/scheduleFileHelper.js';

console.log('🧪 Запуск тестов PDF-парсера расписания...\n');

async function runTests() {
  const fileCh2 = path.resolve(process.cwd(), 'на стенд 12.10-17.10 ЧИСТ Ч2.pdf');
  const fileCh1 = path.resolve(process.cwd(), 'на стенд 12.10-17.10 ЧИСТ Ч1.pdf');
  const filePart = path.resolve(process.cwd(), 'на стенд 12.10-17.10 очн-заочн.pdf');

  if (!fs.existsSync(fileCh2)) {
    console.error('❌ Тестовый файл не найден:', fileCh2);
    process.exit(1);
  }

  const bufCh2 = fs.readFileSync(fileCh2);

  // Тест 1: Проверка детектора PDF
  console.log('1. Проверка сигнатуры PDF:');
  const isPdf = isPdfBuffer(bufCh2);
  console.log(`   isPdfBuffer: ${isPdf}`);
  if (!isPdf) {
    console.error('❌ Ошибка: файл не определен как PDF.');
    process.exit(1);
  }
  console.log('   ✅ Сигнатура PDF успешно определена!\n');

  // Тест 2: Извлечение расписания Трипольского из Ч2
  console.log('2. Тестирование парсинга пар преподавателя Трипольского (Ч2):');
  const resTripolsky = await PdfParser.parseBuffer(bufCh2, DEFAULT_BELLS, 'Трипольский', 'Информатика');
  console.log(`   Найдено пар: ${resTripolsky.totalFound}`);
  for (const l of resTripolsky.lessons) {
    console.log(
      `   • [${l.dayName}] #${l.lessonNumber} (${l.startTime}-${l.endTime}) "${l.subject}" | Группа: ${l.group} (подгр. ${l.subgroup || '—'}) | Кабинет: ${l.classroom}`
    );
  }

  if (resTripolsky.totalFound < 6) {
    console.error(`❌ Ошибка: ожидалось не менее 6 пар, найдено ${resTripolsky.totalFound}`);
    process.exit(1);
  }
  console.log('   ✅ Все пары Трипольского из PDF успешно найдены и структурированы!\n');

  // Тест 3: Мульти-парсинг всех преподавателей из Ч2
  console.log('3. Тестирование мульти-парсинга всех преподавателей из Ч2:');
  const multiCh2 = await PdfParser.parseAllTeachers(bufCh2, DEFAULT_BELLS);
  console.log(`   Найдено преподавателей: ${multiCh2.teachers.length}`);
  console.log(`   Всего извлечено пар: ${multiCh2.allLessons.length}`);
  if (multiCh2.teachers.length < 5 || multiCh2.allLessons.length < 50) {
    console.error('❌ Ошибка: слишком мало преподавателей или пар в Ч2');
    process.exit(1);
  }
  console.log('   ✅ Мульти-парсинг Ч2 выполнен успешно!\n');

  // Тест 4: Проверка файла Ч1
  if (fs.existsSync(fileCh1)) {
    console.log('4. Тестирование мульти-парсинга Ч1 (старшие курсы):');
    const bufCh1 = fs.readFileSync(fileCh1);
    const multiCh1 = await parseScheduleBufferAllTeachers(bufCh1, DEFAULT_BELLS);
    console.log(`   Преподавателей в Ч1: ${multiCh1.teachers.length}`);
    console.log(`   Пар в Ч1: ${multiCh1.allLessons.length}`);
    const odinetz = multiCh1.lessonsByTeacher['Одинец'] || [];
    console.log(`   Пар преподавателя Одинец: ${odinetz.length}`);
    if (multiCh1.allLessons.length < 50) {
      console.error('❌ Ошибка: слишком мало пар в Ч1');
      process.exit(1);
    }
    console.log('   ✅ Ч1 успешно распарсен!\n');
  }

  // Тест 5: Проверка файла очно-заочного отделения
  if (fs.existsSync(filePart)) {
    console.log('5. Тестирование очно-заочного расписания (альбомная ориентация):');
    const bufPart = fs.readFileSync(filePart);
    const multiPart = await parseScheduleBufferAllTeachers(bufPart, DEFAULT_BELLS);
    console.log(`   Преподавателей в очн-заочн: ${multiPart.teachers.length}`);
    console.log(`   Пар в очн-заочн: ${multiPart.allLessons.length}`);
    if (multiPart.allLessons.length < 20) {
      console.error('❌ Ошибка: слишком мало пар в очн-заочн');
      process.exit(1);
    }
    console.log('   ✅ Очно-заочное расписание успешно обработано!\n');
  }

  // Тест 6: Универсальный фасад parseScheduleBuffer
  console.log('6. Тестирование универсального фасада parseScheduleBuffer:');
  const unifiedRes = await parseScheduleBuffer(bufCh2, DEFAULT_BELLS, 'Трипольский', 'Информатика');
  console.log(`   Универсальный фасад вернул пар: ${unifiedRes.totalFound}`);
  if (unifiedRes.totalFound !== resTripolsky.totalFound) {
    console.error('❌ Ошибка: расхождение между PdfParser и универсальным фасадом');
    process.exit(1);
  }
  console.log('   ✅ Универсальный фасад работает идентично!\n');

  console.log('🎉 ВСЕ ТЕСТЫ PDF-ПАРСЕРА ПРОЙДЕНЫ НА 100% УСПЕШНО!\n');
}

runTests().catch((err) => {
  console.error('Необработанная ошибка в тестах:', err);
  process.exit(1);
});
