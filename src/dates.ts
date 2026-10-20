import { TIMEZONE } from "./constants.js";

export function amsterdamYmd(instant: Date | string): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${String(instant)}`);
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function tomorrowAmsterdam(now = new Date()): string {
  const today = amsterdamYmd(now);
  return addDaysYmd(today, 1);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = parseYmd(ymd);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return [
    utc.getUTCFullYear(),
    String(utc.getUTCMonth() + 1).padStart(2, "0"),
    String(utc.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function parseYmd(ymd: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) {
    throw new Error(`Expected YYYY-MM-DD, got ${ymd}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isoWeekParts(ymd: string): { year: number; week: number } {
  const [year, month, day] = parseYmd(ymd);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { year: isoYear, week };
}

export function jaarWeek(ymd: string): string {
  const { year, week } = isoWeekParts(ymd);
  return `${year}~${week}`;
}

export function sameAmsterdamDate(instant: string, ymd: string): boolean {
  return amsterdamYmd(instant) === ymd;
}

export function dateInInclusiveRange(
  ymd: string,
  start?: string,
  end?: string,
): boolean {
  if (!start || !end) {
    return false;
  }
  const startDay = start.includes("T")
    ? amsterdamYmd(start)
    : start.slice(0, 10);
  const endDay = end.includes("T") ? amsterdamYmd(end) : end.slice(0, 10);
  return ymd >= startDay && ymd <= endDay;
}
