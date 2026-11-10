export type NlMatch = {
  expr: string;
};

function parseClock(raw: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(raw.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

const DOW: Record<string, string> = {
  sunday: "0",
  sun: "0",
  воскресенье: "0",
  вс: "0",
  monday: "1",
  mon: "1",
  понедельник: "1",
  пн: "1",
  tuesday: "2",
  tue: "2",
  вторник: "2",
  вт: "2",
  wednesday: "3",
  wed: "3",
  среда: "3",
  ср: "3",
  thursday: "4",
  thu: "4",
  четверг: "4",
  чт: "4",
  friday: "5",
  fri: "5",
  пятница: "5",
  пт: "5",
  saturday: "6",
  sat: "6",
  суббота: "6",
  сб: "6",
};

export function matchNaturalPhrase(input: string): NlMatch | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;

  if (
    /^(every minute|каждую минуту|\* \* \* \* \*)$/.test(text) ||
    text === "каждую минуту"
  ) {
    return { expr: "* * * * *" };
  }
  if (/^(every hour|каждый час|hourly)$/.test(text)) {
    return { expr: "0 * * * *" };
  }
  if (
    /^(every day at midnight|daily at midnight|ежедневно в полночь|каждый день в полночь)$/.test(
      text,
    )
  ) {
    return { expr: "0 0 * * *" };
  }
  if (
    /^(last day of (each |the |every )?month|последний день (каждого )?месяца)$/.test(
      text,
    )
  ) {
    return { expr: "0 0 L * *" };
  }
  if (
    /^(weekdays at 9(:00)?|по будням в 9(:00)?|будни в 9(:00)?)$/.test(text)
  ) {
    return { expr: "0 9 * * 1-5" };
  }

  const everyN =
    /^(?:every|каждые)\s+(\d+)\s+(?:minutes?|мин(?:ут[уыа]?)?)$/.exec(text);
  if (everyN) {
    const n = Number(everyN[1]);
    if (n >= 1 && n <= 59) return { expr: `*/${n} * * * *` };
  }

  const everyNHours =
    /^(?:every|каждые)\s+(\d+)\s+(?:hours?|час(?:а|ов)?)$/.exec(text);
  if (everyNHours) {
    const n = Number(everyNHours[1]);
    if (n >= 1 && n <= 23) return { expr: `0 */${n} * * *` };
  }

  const dailyAt =
    /^(?:daily|every day|ежедневно|каждый день)\s+(?:at|в)\s+(\d{1,2}(?::\d{2})?)$/.exec(
      text,
    );
  if (dailyAt) {
    const clock = parseClock(dailyAt[1]);
    if (clock) return { expr: `${clock.minute} ${clock.hour} * * *` };
  }

  const weekdaysAt =
    /^(?:weekdays|будни|по будням)(?:\s+(?:at|в))?\s+(\d{1,2}(?::\d{2})?)$/.exec(
      text,
    );
  if (weekdaysAt) {
    const clock = parseClock(weekdaysAt[1]);
    if (clock) return { expr: `${clock.minute} ${clock.hour} * * 1-5` };
  }

  const weekendsAt =
    /^(?:weekends|выходные|по выходным)(?:\s+(?:at|в))?\s+(\d{1,2}(?::\d{2})?)$/.exec(
      text,
    );
  if (weekendsAt) {
    const clock = parseClock(weekendsAt[1]);
    if (clock) return { expr: `${clock.minute} ${clock.hour} * * 0,6` };
  }

  const dowAt =
    /^(?:every|каждый|каждое|каждую)?\s*([a-zа-яё]+)\s+(?:at|в)\s+(\d{1,2}(?::\d{2})?)$/u.exec(
      text,
    );
  if (dowAt) {
    const dow = DOW[dowAt[1]];
    const clock = parseClock(dowAt[2]);
    if (dow && clock) {
      return { expr: `${clock.minute} ${clock.hour} * * ${dow}` };
    }
  }

  const monthly =
    /^(?:monthly on the|каждое|каждого)?\s*(\d{1,2})(?:-?(?:st|nd|rd|th)|-?го)?\s*(?:of (?:each |every |the )?month|числа(?: каждого месяца)?)$/u.exec(
      text,
    );
  if (monthly) {
    const day = Number(monthly[1]);
    if (day >= 1 && day <= 31) return { expr: `0 0 ${day} * *` };
  }

  if (/^\d{1,2} \d{1,2} (\*|\d+) (\*|\d+) (\*|\d+(?:-\d+)?)$/.test(text)) {
    return { expr: text };
  }

  return null;
}

export function nlPlaceholderExample(locale: string): string {
  return locale === "ru" ? "по выходным 00:00" : "weekends at 00:00";
}

export function suggestSavedName(expr: string): string {
  return expr.slice(0, 32);
}
