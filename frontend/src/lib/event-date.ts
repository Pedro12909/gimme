// List dates are calendar days ("2026-12-25") with no time zone, so they're read and compared
// as local days: a birthday on the 14th is "today" all of the 14th, wherever the viewer is.

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Whole days from today: 0 is today, negative is past
export function daysUntil(value: string) {
  return Math.round(
    (parseDay(value).getTime() - startOfToday().getTime()) / DAY_MS,
  );
}

export const isUpcoming = (value: string | undefined) =>
  value !== undefined && daysUntil(value) >= 0;

// "25 December", with the year only when it isn't this year
export function formatEventDate(value: string) {
  const date = parseDay(value);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

// "today", "tomorrow", "in 62 days"; nothing for past dates
export function relativeEventDate(value: string) {
  const days = daysUntil(value);
  if (days < 0) return undefined;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
