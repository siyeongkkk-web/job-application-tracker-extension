function parseDateInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

export function dateInputValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function replaceLocalDate(value, dateInput) {
  const parts = parseDateInput(dateInput);
  if (!parts) return value;
  if (dateInputValue(value) === dateInput) return value;

  const current = new Date(value);
  const next = Number.isNaN(current.getTime()) ? new Date() : new Date(current);
  if (Number.isNaN(current.getTime())) next.setHours(0, 0, 0, 0);
  next.setFullYear(parts.year, parts.month, parts.day);

  if (next.getFullYear() !== parts.year || next.getMonth() !== parts.month || next.getDate() !== parts.day) return value;
  return next.toISOString();
}
