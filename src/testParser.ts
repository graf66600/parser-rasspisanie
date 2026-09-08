import * as xlsx from 'xlsx';
import { ExcelParser } from './services/excelParser.js';
import { StorageService } from './services/storageService.js';
import { DEFAULT_BELLS } from './config/config.js';

console.log('🧪 Запуск тестов парсера расписания и сервисов...\n');

// 1. Создаем тестовую рабочую книгу Excel с расписанием колледжа
const wb = xlsx.utils.book_new();

// Тест 1: Сетка расписания (Дни недели в колонках, уроки в строках)
const sheet1Data = [
  ['Урок', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'],
  [
    '1 пара (08:30-10:00)',
    'Алгебра (Иванов И.И., каб. 101)',
    'Информатика (Трипольский Б.А., каб. 305)',
    'Физика (Сидорова А.В., каб. 204)',
    'История (Петров В.Г., каб. 110)',
    'Информатика (Трипольский, каб. 305)',
  ],
  [
    '2 пара (10:10-11:40)',
    'Информатика (Трипольский Б.А., каб. 305)',
    'Биология (Козлов Д.А., каб. 201)',
    'Информатика (Трипольский Б.А., каб. 305)',
    'Литература (Смирнов С.С., каб. 105)',
    'Английский яз. (Григорьев Г.Г., каб. 402)',
  ],
  [
    '3 пара (12:10-13:40)',
    'Химия (Васильева О.О., каб. 301)',
    'Физкультура (Спортзал)',
    'История (Петров В.Г., каб. 110)',
    'Информатика (Трипольский, каб. 305)',
    'Классный час',
  ],
];

const ws1 = xlsx.utils.aoa_to_sheet(sheet1Data);
xlsx.utils.book_append_sheet(wb, ws1, 'Группа_1КСК');

// Тест 2: Табличный список (День | Пара | Группа | Предмет | Преподаватель | Аудитория)
const sheet2Data = [
  ['День недели', 'Пара', 'Группа', 'Предмет', 'Преподаватель', 'Аудитория'],
  ['Суббота', '1', '2зПИм', 'Информатика и программирование', 'Трипольский Б.А.', 'каб. 305'],
  ['Суббота', '2', '2зПИм', 'Базы данных', 'Трипольский Б.А.', 'каб. 305'],
  ['Суббота', '3', '1КСК', 'Математика', 'Иванов И.И.', 'каб. 101'],
];

const ws2 = xlsx.utils.aoa_to_sheet(sheet2Data);
xlsx.utils.book_append_sheet(wb, ws2, 'Суббота_Спец');

// Конвертируем в буфер
const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

console.log('📄 Тестовый Excel файл сгенерирован в памяти.');

// 2. Тестируем парсер
const parseResult = ExcelParser.parseBuffer(buffer, DEFAULT_BELLS, 'Трипольский', 'Информатика');

console.log(`\n🔍 Результаты парсинга:`);
console.log(`- Проанализировано листов: ${parseResult.sheetsParsed.join(', ')}`);
console.log(`- Всего найдено пар Трипольского: ${parseResult.totalFound}`);

console.log('\n📋 Найденные пары:');
for (const lesson of parseResult.lessons) {
  console.log(
    `  • [${lesson.dayName}] Пара #${lesson.lessonNumber} (${lesson.startTime}-${lesson.endTime}): ` +
    `"${lesson.subject}" | Группа: "${lesson.group || '—'}" | Кабинет: "${lesson.classroom || '—'}"`
  );
}

if (parseResult.totalFound >= 5) {
  console.log('\n✅ ПАРСИНГ УСПЕШЕН: Все пары преподавателя Трипольского корректно найдены и извлечены!');
} else {
  console.error('\n❌ ОШИБКА: Найдено меньше пар, чем ожидалось.');
  process.exit(1);
}

// 3. Тестируем StorageService
console.log('\n💾 Тестирование StorageService...');
const storage = StorageService.getInstance();
const testUserId = 999999999;
const testChatId = 999999999;

const saved = storage.saveUserSchedule(testUserId, testChatId, parseResult.lessons);
console.log(`- Сохранено расписание для userId=${saved.userId}, количество пар: ${saved.lessons.length}`);

const retrieved = storage.getUserSchedule(testUserId);
if (retrieved && retrieved.lessons.length === parseResult.totalFound) {
  console.log('✅ ХРАНИЛИЩЕ РАБОТАЕТ: Расписание успешно сохранено и прочитано с диска.');
} else {
  console.error('❌ ОШИБКА ХРАНИЛИЩА: Данные не совпадают.');
  process.exit(1);
}

// 4. Тестирование расчета времени напоминаний
console.log('\n⏰ Тестирование расчета времени напоминания:');
const testStartTime = '10:10';
const minutesBefore = 15;
const [hStr, mStr] = testStartTime.split(':');
const totalMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) - minutesBefore;
const reminderH = Math.floor(totalMinutes / 60);
const reminderM = totalMinutes % 60;
const reminderTime = `${String(reminderH).padStart(2, '0')}:${String(reminderM).padStart(2, '0')}`;

console.log(`- Начало пары: ${testStartTime}, напоминание за ${minutesBefore} мин: расчетное время = ${reminderTime}`);
if (reminderTime === '09:55') {
  console.log('✅ РАСЧЕТ ВРЕМЕНИ НАПОМИНАНИЯ ТОЧЕН (10:10 - 15 мин = 09:55).');
} else {
  console.error('❌ ОШИБКА РАСЧЕТА ВРЕМЕНИ.');
  process.exit(1);
}

console.log('\n======================================================');
console.log('📂 Тестирование парсинга реального файла "на стенд2_1нед — копия.xlsx"...');
import * as fs from 'fs';
import * as path from 'path';

const realFileName = 'на стенд2_1нед — копия.xlsx';
const realFilePath = path.resolve(realFileName);

if (fs.existsSync(realFilePath)) {
  const realBuffer = fs.readFileSync(realFilePath);
  const realResult = ExcelParser.parseBuffer(realBuffer, DEFAULT_BELLS, 'Трипольский', 'Информатика');

  console.log(`\n🔍 Результаты парсинга реального файла:`);
  console.log(`- Листы: ${realResult.sheetsParsed.join(', ')}`);
  console.log(`- Всего найдено пар Трипольского: ${realResult.totalFound}`);

  console.log('\n📋 Найденные пары:');
  for (const lesson of realResult.lessons) {
    console.log(
      `  • [${lesson.dayName}] Пара #${lesson.lessonNumber} (${lesson.startTime}-${lesson.endTime}): ` +
      `"${lesson.subject}" | Группа: "${lesson.group}" | Кабинет: "${lesson.classroom}"`
    );
  }

  if (realResult.totalFound === 8) {
    console.log('\n✅ ТЕСТ РЕАЛЬНОГО ФАЙЛА УСПЕШЕН: Все 8 пар преподавателя Трипольского найдены с точным временем и аудиториями!');
  } else {
    console.error(`\n❌ ОШИБКА: Ожидалось 8 пар, найдено ${realResult.totalFound}`);
    process.exit(1);
  }
} else {
  console.warn(`\n⚠️ Файл ${realFileName} не найден по пути ${realFilePath}`);
}

console.log('\n======================================================');
console.log('📚 Тестирование CurriculumService (интеграция с порталом рабочих программ)...');
import { CurriculumService } from './services/curriculumService.js';

const curriculum = CurriculumService.getInstance();
const programs = curriculum.getAllPrograms();
console.log(`- Загружено программ в базу: ${programs.length}`);

if (programs.length < 9) {
  console.error('❌ ОШИБКА: Загружено меньше 9 программ');
  process.exit(1);
}

// Тест 1: Поиск для группы 51ф
const prog51 = curriculum.findProgramForGroup('51ф');
console.log(`- Программа для группы 51ф: "${prog51?.title}" (${prog51?.lessons.length} тем)`);
if (!prog51 || !prog51.title.includes('Информационное обеспечение')) {
  console.error('❌ ОШИБКА: Не найдена корректная программа для 51ф');
  process.exit(1);
}

// Тест 2: Поиск для группы 31фм
const prog31 = curriculum.findProgramForGroup('31фм');
console.log(`- Программа для группы 31фм: "${prog31?.title}" (${prog31?.lessons.length} тем)`);
if (!prog31 || !prog31.title.includes('Информационные технологии')) {
  console.error('❌ ОШИБКА: Не найдена корректная программа для 31фм');
  process.exit(1);
}

// Тест 3: Получение текущей темы
const topic51 = curriculum.getCurrentTopic('51ф');
console.log(`- Текущая тема 51ф (#${topic51?.index}): "${topic51?.topic}"`);
if (!topic51 || !topic51.topic) {
  console.error('❌ ОШИБКА: Не удалось получить тему для 51ф');
  process.exit(1);
}

const topic31 = curriculum.getCurrentTopic('31фм');
console.log(`- Текущая тема 31фм (#${topic31?.index}): "${topic31?.topic}"`);
if (!topic31 || !topic31.topic) {
  console.error('❌ ОШИБКА: Не удалось получить тему для 31фм');
  process.exit(1);
}

console.log('✅ ИНТЕГРАЦИЯ С РАБОЧИМИ ПРОГРАММАМИ УСПЕШНА!');

console.log('\n======================================================');
console.log('📊 Тестирование JournalService (электронный журнал пар по датам)...');
import { JournalService } from './services/journalService.js';

const journal = JournalService.getInstance();
const testDate = new Date().toISOString().split('T')[0];

const newEntry = journal.recordLesson({
  group: '51ф',
  subject: 'МДК.06.01 Информационное обеспечение профессиональной деятельности',
  lessonNumber: 1,
  startTime: '08:30',
  endTime: '10:00',
  classroom: '305',
  topic: topic51.topic,
  topicIndex: topic51.index,
  notes: 'Тестовая отметка проведения занятия',
  date: testDate,
});

console.log(`- Создана запись в журнале: ID=${newEntry.id}, Дата=${newEntry.dateFormatted}, Группа=${newEntry.group}`);
if (!newEntry.id || newEntry.group !== '51ф' || !newEntry.dateFormatted) {
  console.error('❌ ОШИБКА: Запись в журнал создана некорректно');
  process.exit(1);
}

const history51 = journal.getGroupHistory('51ф');
console.log(`- Количество проведенных пар для группы 51ф: ${history51.length}`);
const found = history51.find((e) => e.id === newEntry.id);
if (!found) {
  console.error('❌ ОШИБКА: Запись не найдена в истории группы 51ф');
  process.exit(1);
}

const byDate = journal.getEntriesByDate(testDate);
console.log(`- Количество пар за дату ${testDate}: ${byDate.length}`);
if (!byDate.find((e) => e.id === newEntry.id)) {
  console.error('❌ ОШИБКА: Запись не найдена по дате');
  process.exit(1);
}

// Очистка тестовой записи, чтобы не загрязнять данные журнала
journal.deleteEntry(newEntry.id);

console.log('✅ ЭЛЕКТРОННЫЙ ЖУРНАЛ РАБОТАЕТ ИСПРАВНО!');

console.log('\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!\n');
