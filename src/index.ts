import { createBot } from './bot/bot.js';
import { SchedulerService } from './services/schedulerService.js';
import { CONFIG } from './config/config.js';

async function bootstrap() {
  console.log('🚀 Инициализация бота расписания...');

  if (!CONFIG.BOT_TOKEN) {
    console.error('❌ ОШИБКА: BOT_TOKEN не найден в переменных окружения.');
    console.error('📝 Создайте файл .env и добавьте: BOT_TOKEN=ваш_токен');
    process.exit(1);
  }

  try {
    const bot = createBot();
    const scheduler = new SchedulerService(bot);

    // Запуск планировщика напоминаний
    scheduler.start();

    // Запуск Telegram-бота (long polling)
    await bot.launch(() => {
      console.log('🤖 Telegram-бот успешно запущен и готов к приёму файлов расписания!');
    });

    // Graceful shutdown
    const stopHandler = (signal: string) => {
      console.log(`\n🛑 Получен сигнал ${signal}. Завершение работы...`);
      scheduler.stop();
      bot.stop(signal);
      process.exit(0);
    };

    process.once('SIGINT', () => stopHandler('SIGINT'));
    process.once('SIGTERM', () => stopHandler('SIGTERM'));
  } catch (err) {
    console.error('Критическая ошибка запуска приложения:', err);
    process.exit(1);
  }
}

bootstrap();
