import { Context, Markup } from 'telegraf';
import { StorageService } from '../../services/storageService.js';
import { CurriculumService } from '../../services/curriculumService.js';
import { DAYS_OF_WEEK } from '../../config/config.js';
import { formatDaySchedule } from './formatters.js';

const storage = StorageService.getInstance();
const curriculum = CurriculumService.getInstance();

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
