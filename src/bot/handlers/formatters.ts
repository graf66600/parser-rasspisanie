import { Lesson } from '../../types/schedule.js';
import { CurriculumService } from '../../services/curriculumService.js';
import { JournalService } from '../../services/journalService.js';

const curriculum = CurriculumService.getInstance();
const journal = JournalService.getInstance();

export function formatDaySchedule(dayName: string, lessons: Lesson[]): string {
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

export function formatGroupJournal(group: string): string {
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
