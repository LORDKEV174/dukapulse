const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayDateKey(): string {
  return formatDateKey(new Date());
}

export function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function formatShortDate(date: Date): string {
  const dayName = DAYS_SHORT[date.getDay()];
  const dd = String(date.getDate()).padStart(2, '0');
  const mmm = MONTHS_SHORT[date.getMonth()];
  return `${dayName} ${dd} ${mmm}`;
}

export function formatDayDate(dateKey: string): string {
  const d = parseDateKey(dateKey);
  return `${DAYS_SHORT[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export interface CalendarWeekInfo {
  weekKey: string; // e.g. "2026-W47"
  weekNumber: number;
  year: number;
  startDate: string; // YYYY-MM-DD (Monday)
  endDate: string; // YYYY-MM-DD (Sunday)
  label: string; // "Week X: Mon DD MMM – Sun DD MMM YYYY"
}

/**
 * Computes ISO calendar week (Monday to Sunday) for a YYYY-MM-DD date key.
 */
export function getCalendarWeekInfo(dateKey: string): CalendarWeekInfo {
  const date = parseDateKey(dateKey);
  // Find Monday of this week
  const dayOfWeek = date.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);
  monday.setHours(12, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(12, 0, 0, 0);

  // ISO week number using Thursday of the week
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const isoYear = thursday.getFullYear();
  const jan4 = new Date(isoYear, 0, 4, 12, 0, 0, 0);
  const jan4Day = jan4.getDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setDate(jan4.getDate() - (jan4Day - 1));

  const diffDays = Math.round((monday.getTime() - firstMonday.getTime()) / 86400000);
  const weekNumber = Math.floor(diffDays / 7) + 1;
  const weekKey = `${isoYear}-W${String(weekNumber).padStart(2, '0')}`;

  const label = `Week ${weekNumber}: ${formatShortDate(monday)} – ${formatShortDate(sunday)} ${sunday.getFullYear()}`;

  return {
    weekKey,
    weekNumber,
    year: isoYear,
    startDate: formatDateKey(monday),
    endDate: formatDateKey(sunday),
    label,
  };
}

export function formatKES(amount: number, showDecimals = false): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = Math.abs(safe).toLocaleString('en-KE', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 2,
  });
  return safe < 0 ? `-KES ${formatted}` : `KES ${formatted}`;
}

export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-KE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) {
    return digits.slice(1);
  }
  if (digits.startsWith('254')) {
    return digits;
  }
  if (digits.startsWith('0') && digits.length >= 9) {
    return `254${digits.slice(1)}`;
  }
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) {
    return `254${digits}`;
  }
  return digits;
}
