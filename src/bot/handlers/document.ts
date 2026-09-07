import { Context } from 'telegraf';
import { ExcelParser } from '../../services/excelParser.js';
import { StorageService } from '../../services/storageService.js';
import { DAYS_OF_WEEK } from '../../config/config.js';

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

  if (fileExt !== 'xlsx' && fileExt !== 'xls') {
    return ctx.reply(
      '⚠️ Пожалуйста, отправьте файл в формате Excel (`.xlsx` или `.xls`).',
      { parse_mode: 'Markdown' }
    );
  }

  const statusMsg = await ctx.reply('⏳ Скачиваю и анализирую файл расписания...');

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

    // Парсим расписание
    const parseResult = ExcelParser.parseBuffer(buffer, bells, teacherFilter, subjectFilter);

    if (parseResult.totalFound === 0) {
      return ctx.telegram.editMessageText(
        chatId,
        statusMsg.message_id,
        undefined,
        `❌ В файле *${fileName}* не удалось найти пары по преподавателю *${teacherFilter}*.\n\n` +
        `🔍 Проверено листов: ${parseResult.sheetsParsed.join(', ')}.\n` +
        `Убедитесь, что в файле есть фамилия "${teacherFilter}" или предмет "${subjectFilter}".`,
        { parse_mode: 'Markdown' }
      );
    }

    // Сохраняем расписание
    storage.saveUserSchedule(userId, chatId, parseResult.lessons);

    // Формируем краткий отчет
    let report = `✅ *Расписание успешно загружено!*\n\n` +
      `📁 Файл: \`${fileName}\`\n` +
      `👨‍🏫 Преподаватель: *${teacherFilter}*\n` +
      `📊 Найдено пар: *${parseResult.totalFound}*\n\n` +
      `🗓 *Распределение по дням:*\n`;

    for (let day = 1; day <= 6; day++) {
      const dayLessons = parseResult.lessons.filter((l) => l.dayOfWeek === day);
      if (dayLessons.length > 0) {
        report += `• *${DAYS_OF_WEEK[day]}:* ${dayLessons.length} пар\n`;
      }
    }

    report += `\n🔔 Напоминания перед парами активированы!\n` +
              `Команда /today — посмотреть расписание на сегодня.`;

    await ctx.telegram.editMessageText(chatId, statusMsg.message_id, undefined, report, {
      parse_mode: 'Markdown',
    });
  } catch (err: any) {
    console.error('Ошибка при обработке файла Excel:', err);
    await ctx.telegram.editMessageText(
      chatId,
      statusMsg.message_id,
      undefined,
      `❌ Произошла ошибка при обработке файла: ${err.message || 'неизвестная ошибка'}`
    );
  }
}
