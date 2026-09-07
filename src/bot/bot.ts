import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { CONFIG } from '../config/config.js';
import {
  handleStart,
  handleToday,
  handleTomorrow,
  handleWeek,
  handleBells,
  handleSettings,
  handleSettingsCallback,
  handleTopic,
  handleJournal,
  handleHelp,
} from './handlers/commands.js';
import { handleDocument } from './handlers/document.js';

export function createBot(): Telegraf {
  if (!CONFIG.BOT_TOKEN) {
    throw new Error(
      'BOT_TOKEN не задан! Создайте файл .env на основе .env.example и укажите токен от @BotFather'
    );
  }

  const bot = new Telegraf(CONFIG.BOT_TOKEN);

  // Глобальная обработка ошибок по best practices
  bot.catch((err: any, ctx: any) => {
    console.error(`Ошибка в Telegram update ${ctx?.update?.update_id}:`, err);
    if (ctx && ctx.reply) {
      ctx
        .reply('⚠️ Произошла внутренняя ошибка. Попробуйте ещё раз позже.')
        .catch((e: any) => console.error('Не удалось отправить сообщение об ошибке:', e));
    }
  });

  // Команды
  bot.command('start', handleStart);
  bot.command('today', handleToday);
  bot.command('tomorrow', handleTomorrow);
  bot.command('week', handleWeek);
  bot.command('topic', handleTopic);
  bot.command('journal', handleJournal);
  bot.command('bells', handleBells);
  bot.command('settings', handleSettings);
  bot.command('help', handleHelp);

  // Текстовые кнопки экранной клавиатуры
  bot.hears('📅 Сегодня', handleToday);
  bot.hears('🌅 Завтра', handleTomorrow);
  bot.hears('📆 Вся неделя', handleWeek);
  bot.hears('📖 Темы пар', handleTopic);
  bot.hears('📊 Журнал пар', handleJournal);
  bot.hears('⏰ Звонки', handleBells);
  bot.hears('⚙️ Настройки', handleSettings);

  // Инлайн-кнопки настроек
  bot.on('callback_query', handleSettingsCallback);

  // Загрузка документов (Excel)
  bot.on(message('document'), handleDocument);

  return bot;
}
