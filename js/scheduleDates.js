const moscowCalendar = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' });

export function shiftScheduleDate(date, offset) {
  const calendarDay = new Date(date + 'T00:00:00Z');
  calendarDay.setUTCDate(calendarDay.getUTCDate() + offset);
  return calendarDay.toISOString().slice(0, 10);
}

export function scheduleDate(offset = 0, now = new Date()) {
  return shiftScheduleDate(moscowCalendar.format(now), offset);
}

export function scheduleWeekday(date) {
  return new Date(date + 'T00:00:00Z').getUTCDay() || 7;
}

export function scheduleCoversDate(schedule, date) {
  return !schedule.weekStart || (date >= schedule.weekStart
    && date <= (schedule.weekEnd || shiftScheduleDate(schedule.weekStart, 6)));
}
