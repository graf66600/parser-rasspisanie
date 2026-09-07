import { Context, Markup } from 'telegraf';
import { StorageService } from '../../services/storageService.js';
import { CurriculumService } from '../../services/curriculumService.js';
import { JournalService } from '../../services/journalService.js';
import { DAYS_OF_WEEK } from '../../config/config.js';
import { Lesson } from '../../types/schedule.js';

const storage = StorageService.getInstance();
const curriculum = CurriculumService.getInstance();
const journal = JournalService.getInstance();

export async function handleStart(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const scheduleData = storage.getUserSchedule(userId);
  const hasSchedule = scheduleData && scheduleData.lessons.length > 0;

  const statusEmoji = hasSchedule ? '✅' : '⚠️';
  const statusText = hasSchedule
    ? `Расписание загружено (${scheduleData.lessons.length} занятий в неделю).`
    : `Расписание ещё не загружено. Отправьте мне Excel файл (.xlsx или .xls) с расписанием!`;

  const text =
    `👋 *Здравствуйте, ${ctx.from?.first_name || 'преподаватель'}!*\n\n` +
    `Я бот-помощник по расписанию для преподавателя информатики (*Трипольский*).\n\n` +
    `📌 *Статус:* ${statusEmoji} ${statusText}\n\n` +
    `⚡️ *Быстрые команды:*\n` +
    `📅 /today — Пары на сегодня\n` +
    `🌅 /tomorrow — Пары на завтра\n` +
    `📆 /week — Расписание на всю неделю\n` +
    `📖 /topic — Темы занятий по рабочим программам\n` +
    `📊 /journal — Электронный журнал проведенных пар по датам\n` +
    `⏰ /bells — Расписание звонков пар\n` +
    `⚙️ /settings — Настройки напоминаний\n` +
    `❓ /help — Инструкция\n\n` +
    `📎 *Как обновить расписание:* просто пришлите мне документ Excel (.xlsx или .xls) в этот диалог.`;

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Markup.keyboard([
      ['📅 Сегодня', '🌅 Завтра'],
      ['📆 Вся неделя', '📖 Темы пар'],
      ['📊 Журнал пар', '⏰ Звонки'],
      ['⚙️ Настройки'],
    ]).resize(),
  });
}

export async function handleToday(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const scheduleData = storage.getUserSchedule(userId);
  if (!scheduleData || scheduleData.lessons.length === 0) {
    return ctx.reply('⚠️ Расписание не найдено. Отправьте файл Excel для загрузки расписания.');
  }

  const jsDay = new Date().getDay();
  const currentDayOfWeek = jsDay === 0 ? 7 : jsDay;
  const dayName = DAYS_OF_WEEK[currentDayOfWeek] || 'Сегодня';

  const todayLessons = scheduleData.lessons.filter((l) => l.dayOfWeek === currentDayOfWeek);
  const text = formatDaySchedule(dayName, todayLessons);

  await ctx.reply(text, { parse_mode: 'Markdown' });
}

export async function handleTomorrow(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const scheduleData = storage.getUserSchedule(userId);
  if (!scheduleData || scheduleData.lessons.length === 0) {
    return ctx.reply('⚠️ Расписание не найдено. Отправьте файл Excel для загрузки расписания.');
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const jsDay = tomorrow.getDay();
  const tomorrowDayOfWeek = jsDay === 0 ? 7 : jsDay;
  const dayName = DAYS_OF_WEEK[tomorrowDayOfWeek] || 'Завтра';

  const tomorrowLessons = scheduleData.lessons.filter((l) => l.dayOfWeek === tomorrowDayOfWeek);
  const text = formatDaySchedule(dayName, tomorrowLessons);

  await ctx.reply(text, { parse_mode: 'Markdown' });
}

export async function handleWeek(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const scheduleData = storage.getUserSchedule(userId);
  if (!scheduleData || scheduleData.lessons.length === 0) {
    return ctx.reply('⚠️ Расписание не найдено. Отправьте файл Excel для загрузки расписания.');
  }

  let text = `📆 *Расписание занятий на неделю*\n` +
             `👨‍🏫 Преподаватель: *${scheduleData.settings.teacherFilter}*\n\n`;

  for (let day = 1; day <= 6; day++) {
    const dayName = DAYS_OF_WEEK[day];
    const dayLessons = scheduleData.lessons.filter((l) => l.dayOfWeek === day);

    if (dayLessons.length > 0) {
      text += `📌 *${dayName}:*\n`;
      for (const l of dayLessons) {
        const group = l.group ? ` [${l.group}]` : '';
        const room = l.classroom ? ` (${l.classroom})` : '';
        const topicInfo = l.group ? curriculum.getCurrentTopic(l.group) : null;
        const topic = topicInfo ? `\n    └ 📝 _${topicInfo.topic}_` : '';
        text += `  • *${l.lessonNumber} пара* (${l.startTime}–${l.endTime}): ${l.subject}${group}${room}${topic}\n`;
      }
      text += '\n';
    } else {
      text += `📌 *${dayName}:* выходной / пар нет\n\n`;
    }
  }

  await ctx.reply(text, { parse_mode: 'Markdown' });
}

export async function handleTopic(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const scheduleData = storage.getUserSchedule(userId);
  const groups = Array.from(
    new Set(scheduleData?.lessons.map((l) => l.group).filter(Boolean) || ['51ф', '31фм'])
  );

  let text = `📖 *Рабочие программы и темы занятий*\n` +
             `🌐 Источник: [Методический портал](https://edu-programs-portal.vercel.app/)\n\n`;

  const buttons: any[] = [];

  for (const g of groups) {
    const topicInfo = curriculum.getCurrentTopic(g);
    const prog = curriculum.findProgramForGroup(g);

    if (topicInfo && prog) {
      text += `👥 *Группа ${g}* — _${prog.title}_\n` +
              `📌 *Текущая тема (#${topicInfo.index} из ${topicInfo.total}):*\n` +
              `📝 _${topicInfo.topic}_\n\n`;

      buttons.push([
        Markup.button.callback(`➡️ След. тема [${g}]`, `next_topic_${g}`),
        Markup.button.callback(`📋 Все темы [${g}]`, `list_topics_${g}`),
      ]);
    } else {
      text += `👥 *Группа ${g}:* программа не найдена на портале.\n\n`;
    }
  }

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons),
  });
}

export async function handleBells(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const scheduleData = storage.getUserSchedule(userId);
  const bells = scheduleData?.settings.bellsSchedule || [];

  let text = `⏰ *Расписание звонков пар:*\n\n`;
  for (const b of bells) {
    text += `🔔 *${b.lessonNumber} пара:* ${b.startTime} — ${b.endTime}\n`;
  }

  await ctx.reply(text, { parse_mode: 'Markdown' });
}

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
    // Формат mark_done_${group}_${lessonNumber}
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

    // Автоматически продвигаем тему рабочей программы на следующую
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

export async function handleJournal(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const scheduleData = storage.getUserSchedule(userId);
  const groups = Array.from(
    new Set(scheduleData?.lessons.map((l) => l.group).filter(Boolean) || ['51ф', '31фм'])
  );

  let text =
    `📊 *Электронный журнал проведения занятий*\n\n` +
    `Здесь автоматически фиксируются даты, номера пар и темы проведенных уроков по каждой группе.\n\n` +
    `Выберите группу для просмотра истории занятий:`;

  const buttons = groups.map((g) => [
    Markup.button.callback(`👥 Группа ${g}`, `show_journal_${g}`),
  ]);
  buttons.push([Markup.button.callback('📋 Все последние пары', 'show_journal_all')]);

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons),
  });
}

function formatGroupJournal(group: string): string {
  const entries = journal.getGroupHistory(group);
  if (entries.length === 0) {
    return `👥 *Группа ${group}*\n\nВ журнале пока нет записей о проведенных занятиях для этой группы.\n` +
           `Когда вы отмечаете пары через напоминания бота, они автоматически появляются здесь!`;
  }

  let text = `📊 *Журнал занятий — Группа ${group}*\n` +
             `Всего проведено занятий: *${entries.length}*\n\n`;

  for (const e of entries) {
    text += `🗓 *${e.dateFormatted}* (${e.date})\n` +
            `   • *${e.lessonNumber} пара* (${e.startTime}–${e.endTime}) | 🚪 ауд. ${e.classroom || '—'}\n` +
            `   • 📚 ${e.subject}\n` +
            `   • 📝 _${e.topic || 'Без темы'}_\n\n`;
  }

  return text;
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

function formatDaySchedule(dayName: string, lessons: Lesson[]): string {
  if (lessons.length === 0) {
    return `📌 *${dayName}*\n\nВ этот день у вас нет пар! 🎉`;
  }

  let text = `📌 *${dayName}* (всего пар: ${lessons.length})\n\n`;
  for (const l of lessons) {
    const group = l.group ? `\n   👥 Группа: *${l.group}*` : '';
    const room = l.classroom ? `\n   🚪 Аудитория: *${l.classroom}*` : '';
    const topicInfo = l.group ? curriculum.getCurrentTopic(l.group) : null;
    const topic = topicInfo ? `\n   📝 *Тема:* _${topicInfo.topic}_` : '';

    text += `🔹 *${l.lessonNumber} пара* (${l.startTime} – ${l.endTime})\n` +
            `   📚 Предмет: *${l.subject}*${group}${room}${topic}\n\n`;
  }

  return text;
}
