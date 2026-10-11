import { Context } from 'telegraf';
import { StorageService } from '../../services/storageService.js';
import { DAYS_OF_WEEK } from '../../config/config.js';
import { deduplicateLessons } from '../../services/parser/parserUtils.js';
import { parseScheduleBuffer, parseScheduleBufferAllTeachers } from '../../services/scheduleFileHelper.js';

const storage = StorageService.getInstance();

export async function handleDocument(ctx: Context) {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const message = ctx.message as any;

  if (!userId || !chatId || !message || !message.document) {
    return;
  }

  const doc = message.document;
  const fileName = doc.file_name || 'файл';
  const fileExt = fileName.split('.').pop()?.toLowerCase();

  if (fileExt !== 'xlsx' && fileExt !== 'xls' && fileExt !== 'pdf') {
    return ctx.reply(
      '⚠️ Пожалуйста, отправьте файл расписания в формате Excel (`.xlsx`, `.xls`) или PDF (`.pdf`).',
      { parse_mode: 'Markdown' }
    );
  }

  const formatName = fileExt === 'pdf' ? 'PDF' : 'Excel';
  const statusMsg = await ctx.reply(`⏳ Скачиваю и анализирую ${formatName} файл расписания...`);

  try {
    // Получаем ссылку на скачивание файла из Telegram
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const response = await fetch(fileLink.href);

    if (!response.ok) {
      throw new Error(`Ошибка загрузки файла: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Получаем текущие настройки пользователя (или дефолтные)
    const currentSchedule = storage.getUserSchedule(userId);
    const teacherFilter = currentSchedule?.settings.teacherFilter || 'Трипольский';
    const subjectFilter = currentSchedule?.settings.subjectFilter || 'Информатика';
    const bells = currentSchedule?.settings.bellsSchedule;

    // Универсальный парсинг расписания (Excel или PDF)
    const parseResult = await parseScheduleBuffer(buffer, bells, teacherFilter, subjectFilter);

    if (parseResult.totalFound === 0) {
      const multiResult = await parseScheduleBufferAllTeachers(buffer, bells);
      let hint = `❌ В файле *${fileName}* не удалось найти пары по преподавателю *${teacherFilter}*.`;
      if (multiResult.teachers.length > 0) {
        hint = `ℹ️ В файле *${fileName}* найдены другие группы и *${multiResult.teachers.length}* преподавателей, но пар для *${teacherFilter}* здесь нет.\n\n` +
               `💡 Если расписание колледжа разбито на несколько файлов (например, *ЧИСТ Ч1* — старшие курсы, а *ЧИСТ Ч2* — младшие), просто отправьте следующую часть! Бот автоматически объединит все ваши пары.`;
      }
      return ctx.telegram.editMessageText(chatId, statusMsg.message_id, undefined, hint, {
        parse_mode: 'Markdown',
      });
    }

    // Объединяем с уже имеющимися парами (для поддержки загрузки по частям)
    const existingLessons = currentSchedule?.lessons || [];
    const mergedLessons = deduplicateLessons([...existingLessons, ...parseResult.lessons]);
    mergedLessons.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.lessonNumber - b.lessonNumber;
    });

    // Сохраняем объединенное расписание
    storage.saveUserSchedule(userId, chatId, mergedLessons);

    // Формируем краткий отчет
    let report = `✅ *Расписание успешно обновлено из ${formatName}!*\n\n` +
      `📁 Файл: \`${fileName}\`\n` +
      `👨‍🏫 Преподаватель: *${teacherFilter}*\n` +
      `➕ Найдено в этом файле: *${parseResult.totalFound}* пар\n` +
      `📊 Всего пар в расписании: *${mergedLessons.length}*\n\n` +
      `🗓 *Распределение по дням:*\n`;

    for (let day = 1; day <= 6; day++) {
      const dayLessons = mergedLessons.filter((l) => l.dayOfWeek === day);
      if (dayLessons.length > 0) {
        report += `• *${DAYS_OF_WEEK[day]}:* ${dayLessons.length} пар\n`;
      }
    }

    report += `\n🔔 Напоминания перед парами активированы!\n` +
              `💡 Если есть другие части расписания (Ч1, Ч2, заочники), отправьте их следом — они объединятся без дубликатов!`;

    await ctx.telegram.editMessageText(chatId, statusMsg.message_id, undefined, report, {
      parse_mode: 'Markdown',
    });
  } catch (err: any) {
    console.error(`Ошибка при обработке файла ${formatName}:`, err);
    await ctx.telegram.editMessageText(
      chatId,
      statusMsg.message_id,
      undefined,
      `❌ Произошла ошибка при обработке файла: ${err.message || 'неизвестная ошибка'}`
    );
  }
}
