import cron from 'node-cron';
import { Telegraf, Markup } from 'telegraf';
import { StorageService } from './storageService.js';
import { CurriculumService } from './curriculumService.js';
import { Lesson } from '../types/schedule.js';

export class SchedulerService {
  private bot: Telegraf;
  private storage: StorageService;
  private curriculum: CurriculumService;
  private cronJob: cron.ScheduledTask | null = null;
  private sentNotifications: Set<string> = new Set();

  constructor(bot: Telegraf) {
    this.bot = bot;
    this.storage = StorageService.getInstance();
    this.curriculum = CurriculumService.getInstance();
  }

  public start(): void {
    if (this.cronJob) return;

    // Запуск проверки каждую минуту
    this.cronJob = cron.schedule('* * * * *', async () => {
      try {
        await this.checkReminders();
      } catch (err) {
        console.error('Ошибка в планировщике напоминаний:', err);
      }
    });

    console.log('⏰ Планировщик напоминаний успешно запущен');
  }

  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('Планировщик напоминаний остановлен');
    }
  }

  private async checkReminders(): Promise<void> {
    const now = new Date();
    // JavaScript getDay(): 0 = Вс, 1 = Пн, 2 = Вт ... 6 = Сб
    const jsDay = now.getDay();
    const currentDayOfWeek = jsDay === 0 ? 7 : jsDay;

    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMinutes}`;
    const todayDateStr = now.toISOString().slice(0, 10);

    const users = this.storage.getAllUsers();

    for (const user of users) {
      const { settings, lessons, chatId, userId } = user;

      // 1. Проверка утреннего дайджеста
      if (settings.morningDigestEnabled && currentTimeStr === settings.morningDigestTime) {
        const digestKey = `digest_${userId}_${todayDateStr}`;
        if (!this.sentNotifications.has(digestKey)) {
          this.sentNotifications.add(digestKey);
          await this.sendMorningDigest(chatId, lessons, currentDayOfWeek);
        }
      }

      // 2. Проверка напоминаний перед парами
      const todayLessons = lessons.filter((l) => l.dayOfWeek === currentDayOfWeek);

      for (const lesson of todayLessons) {
        const targetReminderTime = this.calculateReminderTime(
          lesson.startTime,
          settings.remindMinutesBefore
        );

        if (currentTimeStr === targetReminderTime) {
          const reminderKey = `lesson_${userId}_${lesson.id}_${todayDateStr}_${lesson.startTime}`;
          if (!this.sentNotifications.has(reminderKey)) {
            this.sentNotifications.add(reminderKey);
            await this.sendLessonReminder(chatId, lesson, settings.remindMinutesBefore, lessons);
          }
        }
      }
    }

    // Очищаем старые ключи уведомлений (оставляем только за сегодня)
    if (this.sentNotifications.size > 1000) {
      this.sentNotifications.clear();
    }
  }

  private calculateReminderTime(startTime: string, minutesBefore: number): string {
    const [hStr, mStr] = startTime.split(':');
    const totalMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) - minutesBefore;
    const adjustedMinutes = (totalMinutes + 24 * 60) % (24 * 60);

    const hours = Math.floor(adjustedMinutes / 60);
    const minutes = adjustedMinutes % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  private async sendLessonReminder(
    chatId: number,
    lesson: Lesson,
    minutesBefore: number,
    allLessons: Lesson[] = []
  ): Promise<void> {
    const groupText = lesson.group ? `\n👥 *Группа:* ${lesson.group}` : '';
    const roomText = lesson.classroom ? `\n🚪 *Аудитория:* ${lesson.classroom}` : '';

    // Получаем тему к этой паре из рабочей программы группы с учетом хронологии расписания
    const topicInfo = lesson.group
      ? this.curriculum.getTopicForScheduledLesson(lesson.group, lesson.lessonNumber, lesson.dayOfWeek, allLessons)
      : null;
    const topicText = topicInfo ? `\n📝 *Тема #${topicInfo.index}:* _${topicInfo.topic}_` : '';

    const text =
      `🔔 *Напоминание о предстоящей паре!*\n\n` +
      `⏳ До начала пары: *${minutesBefore} мин* (начало в *${lesson.startTime}*)\n` +
      `📖 *Пара №${lesson.lessonNumber}:* ${lesson.subject}${groupText}${roomText}${topicText}\n` +
      `⏰ *Время занятия:* ${lesson.startTime} – ${lesson.endTime}`;

    const keyboard = lesson.group
      ? Markup.inlineKeyboard([
          [Markup.button.callback('✅ Отметить пару проведенной', `mark_done_${lesson.group}_${lesson.lessonNumber}`)],
        ])
      : undefined;

    try {
      await this.bot.telegram.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        ...(keyboard ? keyboard : {}),
      });
    } catch (err) {
      console.error(`Ошибка отправки напоминания пользователю ${chatId}:`, err);
    }
  }

  private async sendMorningDigest(
    chatId: number,
    allLessons: Lesson[],
    currentDayOfWeek: number
  ): Promise<void> {
    const todayLessons = allLessons
      .filter((l) => l.dayOfWeek === currentDayOfWeek)
      .sort((a, b) => a.lessonNumber - b.lessonNumber);

    if (todayLessons.length === 0) {
      const text = `☀️ *Доброе утро!*\n\nСегодня по расписанию пар нет. Отличного дня! 😊`;
      try {
        await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error(`Ошибка отправки утреннего дайджеста пользователю ${chatId}:`, err);
      }
      return;
    }

    let text = `☀️ *Доброе утро!*\n\n📋 *Расписание на сегодня:*\n\n`;
    for (const l of todayLessons) {
      const groupText = l.group ? ` | Группа: ${l.group}` : '';
      const roomText = l.classroom ? ` | Каб: ${l.classroom}` : '';
      const topicInfo = l.group
        ? this.curriculum.getTopicForScheduledLesson(l.group, l.lessonNumber, l.dayOfWeek, allLessons)
        : null;
      const topicText = topicInfo ? `\n   📝 _Тема #${topicInfo.index}: ${topicInfo.topic}_` : '';

      text += `🔹 *${l.lessonNumber} пара* (${l.startTime} – ${l.endTime})\n`;
      text += `   ${l.subject}${groupText}${roomText}${topicText}\n\n`;
    }

    try {
      await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error(`Ошибка отправки утреннего дайджеста пользователю ${chatId}:`, err);
    }
  }
}
