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
  const progStats = curriculum.getProgramStats(group);

  let header = `📊 *Журнал занятий — Группа ${group}*\n`;
  if (progStats) {
    const theoryDone = entries.filter((e) => e.type === 'theory' || (e.topic && e.topic.toLowerCase().includes('лекци'))).length;
    const practiceDone = entries.length - theoryDone;
    const theoryLeft = Math.max(0, progStats.theoryTotal - theoryDone);
    const practiceLeft = Math.max(0, progStats.practiceTotal - practiceDone);
    const percent = Math.round((entries.length / progStats.totalLessons) * 100);

    header += `📚 _${progStats.title}_\n` +
              `📈 *Прогресс по программе:* ${entries.length} из ${progStats.totalLessons} пар (${percent}%)\n` +
              `📖 *Лекции:* проведено *${theoryDone}* из ${progStats.theoryTotal} (осталось: *${theoryLeft}*)\n` +
              `💻 *Практики:* проведено *${practiceDone}* из ${progStats.practiceTotal} (осталось: *${practiceLeft}*)\n\n`;
  } else {
    header += `Всего проведено занятий: *${entries.length}*\n\n`;
  }

  if (entries.length === 0) {
    return header +
           `В журнале пока нет записей о проведенных занятиях для этой группы.\n` +
           `Когда вы отмечаете пары через напоминания бота или веб-приложение, они автоматически появляются здесь!`;
  }

  let list = '';
  entries.forEach((e, idx) => {
    const courseNum = e.courseLessonNumber || (idx + 1);
    const typeLabel = e.type === 'theory' ? 'Лекция' : 'Практика';
    list += `🗓 *${e.dateFormatted}* (${e.date})\n` +
            `   • 🏷 *Пара №${courseNum} по счёту* [${typeLabel}]\n` +
            `   • ⏰ ${e.lessonNumber} пара звонков (${e.startTime}–${e.endTime}) | 🚪 ауд. ${e.classroom || '—'}\n` +
            `   • 📚 ${e.subject}\n` +
            `   • 📝 _${e.topic || 'Без темы'}_\n\n`;
  });

  return header + list;
}
