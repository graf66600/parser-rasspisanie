import { createBot } from './bot/bot.js';
import { SchedulerService } from './services/schedulerService.js';
import { CONFIG } from './config/config.js';
import { WebAppServer } from './server.js';

async function bootstrap() {
  console.log('🚀 Инициализация системы расписания...');

  // 1. Запуск PWA Веб-сервера
  const port = Number(process.env.PORT) || 3000;
  const webAppServer = new WebAppServer();
  await webAppServer.start(port);
  console.log(`📱 PWA приложение доступно по ссылке: http://localhost:${port}`);

  // 2. Запуск Telegram-бота (если задан BOT_TOKEN)
  let bot: any = null;
  let scheduler: SchedulerService | null = null;

  if (CONFIG.BOT_TOKEN) {
    try {
      console.log('🤖 Подключение Telegram-бота...');
      bot = createBot();
      scheduler = new SchedulerService(bot);
      scheduler.start();

      bot.launch(() => {
        console.log('🤖 Telegram-бот успешно запущен в фоновом режиме!');
      }).catch((err: any) => {
        console.warn('⚠️ Не удалось подключиться к серверам Telegram (возможно, блокировка или тайм-аут сети):', err.message || err);
        console.log('💡 PWA веб-приложение продолжает полноценно работать на http://localhost:' + port);
      });
    } catch (botErr) {
      console.warn('⚠️ Ошибка инициализации Telegram бота:', botErr);
    }
  } else {
    console.log('ℹ️ BOT_TOKEN не задан — система работает в режиме автономного PWA.');
  }

  // Graceful shutdown
  const stopHandler = (signal: string) => {
    console.log(`\n🛑 Получен сигнал ${signal}. Завершение работы...`);
    webAppServer.stop();
    if (scheduler) scheduler.stop();
    if (bot) bot.stop(signal);
    process.exit(0);
  };

  process.once('SIGINT', () => stopHandler('SIGINT'));
  process.once('SIGTERM', () => stopHandler('SIGTERM'));
}

bootstrap();
