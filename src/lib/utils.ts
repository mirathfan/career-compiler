export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function parseCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function unique<T>(items: T[]) {
  return [...new Set(items)];
}

export function titleCase(value: string) {
  return value.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

export function formatDateRange(startDate: string, endDate: string, isCurrent: boolean) {
  if (!startDate && !endDate && !isCurrent) {
    return "";
  }
  const end = isCurrent ? "Present" : endDate;
  if (!startDate) {
    return end;
  }
  if (!end) {
    return startDate;
  }
  return `${startDate} - ${end}`;
}

export function compactError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
