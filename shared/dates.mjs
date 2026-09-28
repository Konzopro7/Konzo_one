// A civil date is a calendar day, without a time zone or time of day.
export function isCivilDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function displayDate(value) {
  if (!value) return null;
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !isCivilDate(value)
  )
    return null;
  const date = isCivilDate(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
