/** 로컬 시간 기준 YYYY-MM-DD */
export function toISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD 문자열을 로컬 자정 Date 로 */
export function parseISODate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 오늘부터 해당 날짜까지 남은 일수 (오늘=0, 지난 날짜=음수) */
export function daysUntil(value: string, today = new Date()) {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((parseISODate(value).getTime() - base.getTime()) / DAY_MS);
}

export function formatDday(days: number) {
  if (days === 0) return "D-DAY";
  return days > 0 ? `D-${days}` : `D+${-days}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function formatDateKo(value: string) {
  const date = parseISODate(value);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
}

export function formatRangeKo(start: string, end: string | null) {
  if (!end || end === start) return formatDateKo(start);
  return `${formatDateKo(start)} ~ ${formatDateKo(end)}`;
}

export function formatTimestamp(value: string) {
  const date = new Date(value);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${date.getMonth() + 1}.${date.getDate()} ${hh}:${mm}`;
}

export function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** YYYY-MM-DD 에 일수를 더한 날짜 */
export function shiftISODate(value: string, days: number) {
  const date = parseISODate(value);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}
