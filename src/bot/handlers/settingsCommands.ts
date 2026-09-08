import { Context, Markup } from 'telegraf';
import { StorageService } from '../../services/storageService.js';
import { CurriculumService } from '../../services/curriculumService.js';
import { JournalService } from '../../services/journalService.js';
import { formatGroupJournal } from './formatters.js';

const storage = StorageService.getInstance();
const curriculum = CurriculumService.getInstance();
const journal = JournalService.getInstance();

export async function handleSettings(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const scheduleData = storage.getUserSchedule(userId);
  const minutesBefore = scheduleData?.settings.remindMinutesBefore || 15;
  const digestEnabled = scheduleData?.settings.morningDigestEnabled ?? true;

  const text =
    `⚙️ *Настройки напоминаний*\n\n` +
    `🔔 *Напоминать перед парой за:* ${minutesBefore} мин.\n` +
    `☀️ *Утренний дайджест (в 08:00):* ${digestEnabled ? 'Включен ✅' : 'Выключен ❌'}\n\n` +
    `Выберите время напоминания до начала пары:`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('5 мин', 'set_remind_5'),
      Markup.button.callback('10 мин', 'set_remind_10'),
      Markup.button.callback('15 мин', 'set_remind_15'),
      Markup.button.callback('30 мин', 'set_remind_30'),
    ],
    [
      Markup.button.callback(
        digestEnabled ? '🔕 Выключить утренний дайджест' : '🔔 Включить утренний дайджест',
        'toggle_digest'
      ),
    ],
  ]);

  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
}

export async function handleSettingsCallback(ctx: any) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const data = ctx.callbackQuery?.data;

  if (data?.startsWith('set_remind_')) {
    const minutes = parseInt(data.replace('set_remind_', ''), 10);
    storage.updateUserSettings(userId, { remindMinutesBefore: minutes });
    await ctx.answerCbQuery(`Напоминание установлено: за ${minutes} минут до пары`);
    await ctx.editMessageText(
      `✅ Время напоминания успешно изменено: *за ${minutes} минут* до начала пары.`,
      { parse_mode: 'Markdown' }
    );
  } else if (data === 'toggle_digest') {
    const current = storage.getUserSchedule(userId);
    const newState = !(current?.settings.morningDigestEnabled ?? true);
    storage.updateUserSettings(userId, { morningDigestEnabled: newState });
    await ctx.answerCbQuery(newState ? 'Утренний дайджест включен' : 'Утренний дайджест выключен');
    await ctx.editMessageText(
      `✅ Утренний дайджест: ${newState ? 'включен (в 08:00)' : 'выключен'}.`,
      { parse_mode: 'Markdown' }
    );
  } else if (data?.startsWith('next_topic_')) {
    const group = data.replace('next_topic_', '');
    curriculum.advanceTopic(group);
    const updated = curriculum.getCurrentTopic(group);
    await ctx.answerCbQuery(`Тема для группы ${group} переключена`);
    if (updated) {
      await ctx.reply(
        `✅ *Группа ${group}:* переключено на тему №${updated.index} из ${updated.total}:\n\n` +
        `📝 _${updated.topic}_`,
        { parse_mode: 'Markdown' }
      );
    }
  } else if (data?.startsWith('list_topics_')) {
    const group = data.replace('list_topics_', '');
    const prog = curriculum.findProgramForGroup(group);
    await ctx.answerCbQuery();
    if (prog) {
      let listText = `📋 *Все темы занятий: Группа ${group}*\n` +
                     `Дисциплина: _${prog.title}_\n\n`;
      prog.lessons.forEach((l, idx) => {
        listText += `${idx + 1}. ${l.text}\n`;
      });
      await ctx.reply(listText, { parse_mode: 'Markdown' });
    }
  } else if (data?.startsWith('mark_done_')) {
    const parts = data.replace('mark_done_', '').split('_');
    const group = parts[0];
    const lessonNum = parseInt(parts[1] || '1', 10);

    const scheduleData = storage.getUserSchedule(userId);
    const jsDay = new Date().getDay();
    const currentDayOfWeek = jsDay === 0 ? 7 : jsDay;
    const lesson = scheduleData?.lessons.find(
      (l) => l.dayOfWeek === currentDayOfWeek && l.lessonNumber === lessonNum && l.group === group
    ) || scheduleData?.lessons.find((l) => l.lessonNumber === lessonNum && l.group === group);

    const topicInfo = curriculum.getCurrentTopic(group);

    const entry = journal.recordLesson({
      group,
      subject: lesson?.subject || (group === '51ф' ? 'МДК.06.01' : 'Информатика'),
      lessonNumber: lessonNum,
      startTime: lesson?.startTime || '08:30',
      endTime: lesson?.endTime || '10:00',
      classroom: lesson?.classroom,
      topic: topicInfo?.topic || 'Тема занятия',
      topicIndex: topicInfo?.index,
      notes: 'Отмечено через напоминание в Telegram',
    });

    curriculum.advanceTopic(group);

    await ctx.answerCbQuery('Пара отмечена проведенной! ✅');

    const nextTopic = curriculum.getCurrentTopic(group);
    const nextText = nextTopic ? `\nСледующая тема: _${nextTopic.topic}_` : '';

    await ctx.reply(
      `✅ *Пара отмечена как проведенная!*\n\n` +
      `🗓 *Дата:* ${entry.dateFormatted} (${entry.date})\n` +
      `👥 *Группа:* ${group} | *${lessonNum} пара* (${entry.startTime}–${entry.endTime})\n` +
      `📚 *Предмет:* ${entry.subject}${entry.classroom ? ` [ауд. ${entry.classroom}]` : ''}\n` +
      `📝 *Тема:* _${entry.topic}_` +
      nextText +
      `\n\nЗапись сохранена в журнал. Просмотреть: /journal`,
      { parse_mode: 'Markdown' }
    );
  } else if (data?.startsWith('show_journal_')) {
    const group = data.replace('show_journal_', '');
    await ctx.answerCbQuery();
    if (group === 'all') {
      const all = journal.getAllEntries();
      if (all.length === 0) {
        await ctx.reply('📊 В электронном журнале пока нет записей о проведенных парах.');
      } else {
        let text = `📊 *Последние проведенные занятия (всего: ${all.length})*\n\n`;
        const recent = all.slice(-10);
        for (const e of recent) {
          text += `🗓 *${e.dateFormatted}* (${e.date}) — Группа *${e.group}*\n` +
                  `   • *${e.lessonNumber} пара* (${e.startTime}–${e.endTime}): ${e.subject}${e.classroom ? ` [${e.classroom}]` : ''}\n` +
                  `   • 📝 _${e.topic || 'Без темы'}_\n\n`;
        }
        await ctx.reply(text, { parse_mode: 'Markdown' });
      }
    } else {
      const historyText = formatGroupJournal(group);
      await ctx.reply(historyText, { parse_mode: 'Markdown' });
    }
  }
}

export async function handleHelp(ctx: Context) {
  const text =
    `ℹ️ *Справка по боту расписания*\n\n` +
    `1. *Загрузка расписания:*\n` +
    `Отправьте в чат файл Excel (.xlsx или .xls).\n` +
    `Бот найдет все пары преподавателя *Трипольский*, определит время звонков, дни недели, аудитории и группы.\n\n` +
    `2. *Рабочие программы и темы пар:*\n` +
    `Бот интегрирован с [методическим порталом](https://edu-programs-portal.vercel.app/) и автоматически подтягивает темы к каждой паре для групп *51ф*, *31фм* и др.\n\n` +
    `3. *Электронный журнал занятий:*\n` +
    `Бот запоминает даты проведения всех занятий по каждой группе. В напоминании о паре нажмите кнопку «✅ Отметить пару проведенной», и она запишется в журнал с датой и темой.\n\n` +
    `4. *Напоминания:*\n` +
    `Бот присылает уведомление за 15 минут до каждой пары с темой занятия, а также утренний дайджест в 08:00.\n\n` +
    `5. *Команды:*\n` +
    `• /today — расписание на сегодня с темами\n` +
    `• /tomorrow — расписание на завтра с темами\n` +
    `• /week — расписание на неделю\n` +
    `• /topic — темы пар и рабочие программы\n` +
    `• /journal — электронный журнал проведенных пар\n` +
    `• /settings — интервал напоминаний\n` +
    `• /bells — расписание звонков`;

  await ctx.reply(text, { parse_mode: 'Markdown' });
}
