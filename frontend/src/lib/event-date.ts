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

// "Saturday 14 March", with the year only when it isn't this year
export function formatEventDate(value: string) {
  const date = parseDay(value);
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

// "Today", "Tomorrow", "In 12 days"; nothing for past dates or ones far enough away
// that the date alone says enough
export function relativeEventDate(value: string) {
  const days = daysUntil(value);
  if (days < 0 || days > 60) return undefined;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

// "Saturday 14 March · In 12 days"
export function describeEventDate(value: string) {
  return [formatEventDate(value), relativeEventDate(value)]
    .filter(Boolean)
    .join(" · ");
}
