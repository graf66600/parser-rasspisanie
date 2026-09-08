import { Context, Markup } from 'telegraf';
import { StorageService } from '../../services/storageService.js';
import { CurriculumService } from '../../services/curriculumService.js';

const storage = StorageService.getInstance();
const curriculum = CurriculumService.getInstance();

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
