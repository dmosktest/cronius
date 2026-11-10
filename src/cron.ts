export type FieldKind = "minute" | "hour" | "dom" | "month" | "dow";

export const FIELD_KINDS: readonly FieldKind[] = [
  "minute",
  "hour",
  "dom",
  "month",
  "dow",
];

export type CronErrorCode =
  | "empty"
  | "fieldCount"
  | "syntax"
  | "range"
  | "reboot"
  | "macro";

export type FieldItem = {
  from: number;
  to: number;
  step: number;
  wildcard: boolean;
};

export type ParsedField = {
  kind: FieldKind;
  raw: string;
  star: boolean;
  any: boolean;
  items: FieldItem[];
  values: number[];
  lastDay?: boolean;
};

export type ParsedCron = {
  ok: true;
  expr: string;
  macro?: string;
  fields: ParsedField[];
  dayMode: "and" | "or";
};

export type CronError = {
  ok: false;
  errorCode: CronErrorCode;
  field?: FieldKind;
  min?: number;
  max?: number;
};

export type CronParseResult = ParsedCron | CronError;

export const FIELD_LIMITS: Record<FieldKind, { min: number; max: number }> = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dom: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dow: { min: 0, max: 7 },
};

const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

const DOW_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const ITEM_RE = /^(\*|([0-9A-Za-z]+)(?:-([0-9A-Za-z]+))?)(?:\/(\d+))?$/;

function resolveToken(kind: FieldKind, token: string): number | null {
  if (/^\d+$/.test(token)) return Number(token);
  const upper = token.toUpperCase();
  if (kind === "month") {
    const idx = MONTH_NAMES.indexOf(upper);
    return idx < 0 ? null : idx + 1;
  }
  if (kind === "dow") {
    const idx = DOW_NAMES.indexOf(upper);
    return idx < 0 ? null : idx;
  }
  return null;
}

function parseField(kind: FieldKind, raw: string): ParsedField | CronError {
  if (kind === "dom" && raw.toUpperCase() === "L") {
    return {
      kind,
      raw: "L",
      star: false,
      any: false,
      items: [],
      values: [],
      lastDay: true,
    };
  }
  const { min, max } = FIELD_LIMITS[kind];
  const top = kind === "dow" ? 6 : max;
  const items: FieldItem[] = [];
  for (const part of raw.split(",")) {
    const match = ITEM_RE.exec(part);
    if (!match) return { ok: false, errorCode: "syntax", field: kind };
    const [, body, fromTok, toTok, stepTok] = match;
    const step = stepTok === undefined ? 1 : Number(stepTok);
    if (step < 1) {
      return { ok: false, errorCode: "range", field: kind, min: 1, max: top };
    }
    if (body === "*") {
      items.push({ from: min, to: top, step, wildcard: true });
      continue;
    }
    const from = resolveToken(kind, fromTok);
    if (from === null) return { ok: false, errorCode: "syntax", field: kind };
    let to = from;
    if (toTok !== undefined) {
      const resolved = resolveToken(kind, toTok);
      if (resolved === null) {
        return { ok: false, errorCode: "syntax", field: kind };
      }
      to = resolved;
    } else if (stepTok !== undefined) {
      to = top;
    }
    if (from < min || from > max || to < min || to > max || from > to) {
      return { ok: false, errorCode: "range", field: kind, min, max };
    }
    items.push({ from, to, step, wildcard: false });
  }
  const set = new Set<number>();
  for (const item of items) {
    for (let v = item.from; v <= item.to; v += item.step) {
      set.add(kind === "dow" && v === 7 ? 0 : v);
    }
  }
  const values = [...set].sort((a, b) => a - b);
  const total = kind === "dow" ? 7 : max - min + 1;
  return {
    kind,
    raw,
    star: raw.startsWith("*"),
    any: values.length === total,
    items,
    values,
  };
}

export function parseCron(input: string): CronParseResult {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text) return { ok: false, errorCode: "empty" };
  let macro: string | undefined;
  let parts: string[];
  if (text.startsWith("@")) {
    const key = text.toLowerCase();
    if (key === "@reboot") return { ok: false, errorCode: "reboot" };
    const expanded = MACROS[key];
    if (!expanded) return { ok: false, errorCode: "macro" };
    macro = key;
    parts = expanded.split(" ");
  } else {
    parts = text.split(" ");
  }
  if (parts.length !== FIELD_KINDS.length) {
    return { ok: false, errorCode: "fieldCount" };
  }
  const fields: ParsedField[] = [];
  for (let i = 0; i < FIELD_KINDS.length; i++) {
    const parsed = parseField(FIELD_KINDS[i], parts[i]);
    if ("ok" in parsed) return parsed;
    fields.push(parsed);
  }
  const dayMode = !fields[2].star && !fields[4].star ? "or" : "and";
  return { ok: true, expr: parts.join(" "), macro, fields, dayMode };
}

export type NextRunsOptions = {
  from?: Date;
  count?: number;
  timeZone?: string;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

function wallMs(ts: number, timeZone: string): number {
  const parts: Record<string, number> = {};
  for (const p of wallFormatter(timeZone).formatToParts(new Date(ts))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour % 24,
    parts.minute,
  );
}

function offsetAt(ts: number, timeZone: string): number {
  return wallMs(ts, timeZone) - Math.floor(ts / 60000) * 60000;
}

function wallToInstant(naive: number, timeZone: string): number | null {
  const first = naive - offsetAt(naive, timeZone);
  const second = naive - offsetAt(first, timeZone);
  const third = naive - offsetAt(second, timeZone);
  const valid = [first, second, third].filter(
    (ts) => wallMs(ts, timeZone) === naive,
  );
  return valid.length ? Math.min(...valid) : null;
}

type MatchSets = {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  dayMode: "and" | "or";
  domLastDay: boolean;
};

function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

function matchSets(parsed: ParsedCron): MatchSets {
  const [minute, hour, dom, month, dow] = parsed.fields.map(
    (f) => new Set(f.values),
  );
  return {
    minute,
    hour,
    dom,
    month,
    dow,
    dayMode: parsed.dayMode,
    domLastDay: Boolean(parsed.fields[2].lastDay),
  };
}

function dayMatches(sets: MatchSets, y: number, mo: number, d: number): boolean {
  const domOk = sets.domLastDay
    ? d === daysInMonth(y, mo)
    : sets.dom.has(d);
  const dowOk = sets.dow.has(new Date(Date.UTC(y, mo - 1, d)).getUTCDay());
  return sets.dayMode === "or" ? domOk || dowOk : domOk && dowOk;
}

function nextWall(sets: MatchSets, fromNaive: number): number | null {
  const limitYear = new Date(fromNaive).getUTCFullYear() + 8;
  let cur = fromNaive;
  for (;;) {
    const dt = new Date(cur);
    const y = dt.getUTCFullYear();
    if (y > limitYear) return null;
    const mo = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    const h = dt.getUTCHours();
    const mi = dt.getUTCMinutes();
    if (!sets.month.has(mo)) {
      cur = Date.UTC(y, mo, 1);
    } else if (!dayMatches(sets, y, mo, d)) {
      cur = Date.UTC(y, mo - 1, d + 1);
    } else if (!sets.hour.has(h)) {
      cur = Date.UTC(y, mo - 1, d, h + 1);
    } else if (!sets.minute.has(mi)) {
      cur = Date.UTC(y, mo - 1, d, h, mi + 1);
    } else {
      return cur;
    }
  }
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function nextRuns(
  expr: string | ParsedCron,
  options: NextRunsOptions = {},
): Date[] {
  const parsed = typeof expr === "string" ? parseCron(expr) : expr;
  if (!parsed.ok) return [];
  const timeZone = options.timeZone ?? browserTimeZone();
  const count = Math.min(Math.max(options.count ?? 10, 1), 100);
  const startTs = Math.floor((options.from ?? new Date()).getTime() / 60000) * 60000 + 60000;
  const sets = matchSets(parsed);
  const runs: Date[] = [];
  let cursor = wallMs(startTs, timeZone);
  for (let guard = 0; guard < count * 8 && runs.length < count; guard++) {
    const naive = nextWall(sets, cursor);
    if (naive === null) break;
    cursor = naive + 60000;
    const instant = wallToInstant(naive, timeZone);
    if (instant === null || instant < startTs) continue;
    runs.push(new Date(instant));
  }
  return runs;
}

export function zoneHourStart(ts: number, timeZone: string): number {
  return Math.floor(ts / 60000) * 60000 - (wallMs(ts, timeZone) % 3600000);
}

export function runsBetween(
  expr: string | ParsedCron,
  from: Date,
  to: Date,
  timeZone: string,
): Date[] {
  const parsed = typeof expr === "string" ? parseCron(expr) : expr;
  if (!parsed.ok) return [];
  const out: Date[] = [];
  let cursor = new Date(from.getTime() - 60000);
  for (;;) {
    const batch = nextRuns(parsed, { from: cursor, count: 100, timeZone });
    for (const run of batch) {
      if (run.getTime() >= to.getTime()) return out;
      out.push(run);
    }
    if (batch.length < 100) return out;
    cursor = batch[batch.length - 1];
  }
}

export type DescribeTemplates = {
  sep: string;
  everyMinute: string;
  everyNMinutes: string;
  atMinute: string;
  atMinuteEveryHour: string;
  atTime: string;
  everyNHours: string;
  duringHour: string;
  dom: string;
  domStep: string;
  domLast: string;
  month: string;
  dow: string;
  orNote: string;
};

export type DescribeNames = {
  month: (n: number) => string;
  weekday: (n: number) => string;
};

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function wildcardStep(field: ParsedField): number | null {
  if (field.items.length !== 1) return null;
  const [item] = field.items;
  return item.wildcard && item.step > 1 ? item.step : null;
}

function formatRuns(
  values: number[],
  label: (n: number) => string,
  sep: string,
): string {
  const out: string[] = [];
  let i = 0;
  while (i < values.length) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[j] + 1) j++;
    if (j - i >= 2) {
      out.push(`${label(values[i])}–${label(values[j])}`);
    } else {
      for (let k = i; k <= j; k++) out.push(label(values[k]));
    }
    i = j + 1;
  }
  return out.join(sep);
}

export type DescribePart = {
  fields: FieldKind[];
  text: string;
};

function describeTime(
  minute: ParsedField,
  hour: ParsedField,
  tpl: DescribeTemplates,
): DescribePart[] {
  const minuteStep = wildcardStep(minute);
  const hourStep = wildcardStep(hour);
  const plain = (n: number): string => String(n);
  if (
    !minute.any &&
    !hour.any &&
    !minuteStep &&
    !hourStep &&
    minute.values.length * hour.values.length <= 8
  ) {
    const times: string[] = [];
    for (const h of hour.values) {
      for (const m of minute.values) times.push(`${pad2(h)}:${pad2(m)}`);
    }
    return [
      {
        fields: ["minute", "hour"],
        text: fill(tpl.atTime, { list: times.join(tpl.sep) }),
      },
    ];
  }
  if (minute.any && hour.any) {
    return [{ fields: ["minute", "hour"], text: tpl.everyMinute }];
  }
  let minutePhrase: string;
  if (minute.any) {
    minutePhrase = tpl.everyMinute;
  } else if (minuteStep) {
    minutePhrase = fill(tpl.everyNMinutes, { n: minuteStep });
  } else {
    const list = formatRuns(minute.values, plain, tpl.sep);
    minutePhrase = fill(hour.any ? tpl.atMinuteEveryHour : tpl.atMinute, { list });
  }
  const minutePart: DescribePart = { fields: ["minute"], text: minutePhrase };
  if (hour.any) return [minutePart];
  const hourPhrase = hourStep
    ? fill(tpl.everyNHours, { n: hourStep })
    : fill(tpl.duringHour, { list: formatRuns(hour.values, plain, tpl.sep) });
  return [
    minutePart,
    { fields: [], text: tpl.sep },
    { fields: ["hour"], text: hourPhrase },
  ];
}

function weekdayOrder(values: number[]): number[] {
  return values.map((v) => (v === 0 ? 7 : v)).sort((a, b) => a - b);
}

export function describeParts(
  parsed: ParsedCron,
  tpl: DescribeTemplates,
  names: DescribeNames,
): DescribePart[] {
  const [minute, hour, dom, month, dow] = parsed.fields;
  const parts = describeTime(minute, hour, tpl);
  const add = (field: FieldKind, text: string): void => {
    parts.push({ fields: [], text: tpl.sep }, { fields: [field], text });
  };
  if (!dom.any) {
    if (dom.lastDay) {
      add("dom", tpl.domLast);
    } else {
      const step = wildcardStep(dom);
      add(
        "dom",
        step
          ? fill(tpl.domStep, { n: step })
          : fill(tpl.dom, {
              list: formatRuns(dom.values, (n) => String(n), tpl.sep),
            }),
      );
    }
  }
  if (!month.any) {
    add(
      "month",
      fill(tpl.month, { list: formatRuns(month.values, names.month, tpl.sep) }),
    );
  }
  if (!dow.any) {
    add(
      "dow",
      fill(tpl.dow, {
        list: formatRuns(weekdayOrder(dow.values), (n) => names.weekday(n % 7), tpl.sep),
      }),
    );
  }
  if (parsed.dayMode === "or" && !dom.any && !dow.any) {
    parts.push({ fields: [], text: `. ${tpl.orNote}` });
  }
  return parts;
}

export function describe(
  parsed: ParsedCron,
  tpl: DescribeTemplates,
  names: DescribeNames,
): string {
  return describeParts(parsed, tpl, names)
    .map((part) => part.text)
    .join("");
}

const SYSTEMD_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function systemdNumbers(field: ParsedField): string {
  if (field.any) return "*";
  const { min, max } = FIELD_LIMITS[field.kind];
  const parts: string[] = [];
  for (const item of field.items) {
    if (item.wildcard) {
      parts.push(`${pad2(min)}/${item.step}`);
    } else if (item.step === 1) {
      parts.push(
        item.from === item.to
          ? pad2(item.from)
          : `${pad2(item.from)}..${pad2(item.to)}`,
      );
    } else if (item.to === max) {
      parts.push(`${pad2(item.from)}/${item.step}`);
    } else {
      for (let v = item.from; v <= item.to; v += item.step) parts.push(pad2(v));
    }
  }
  return parts.join(",");
}

function systemdWeekdays(field: ParsedField): string {
  if (field.any) return "";
  const values = weekdayOrder(field.values);
  const out: string[] = [];
  let i = 0;
  while (i < values.length) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[j] + 1) j++;
    if (j - i >= 2) {
      out.push(`${SYSTEMD_DOW[values[i] % 7]}..${SYSTEMD_DOW[values[j] % 7]}`);
    } else {
      for (let k = i; k <= j; k++) out.push(SYSTEMD_DOW[values[k] % 7]);
    }
    i = j + 1;
  }
  return out.join(",");
}

export type ExportOptions = {
  timeZone?: string;
  note?: string;
};

export function toSystemdTimer(
  expr: string | ParsedCron,
  options: ExportOptions = {},
): string {
  const parsed = typeof expr === "string" ? parseCron(expr) : expr;
  if (!parsed.ok) return "";
  const [minute, hour, dom, month, dow] = parsed.fields;
  const time = `${systemdNumbers(hour)}:${systemdNumbers(minute)}:00`;
  const monthPart = systemdNumbers(month);
  const domPart = dom.lastDay ? "~01" : systemdNumbers(dom);
  const dowPart = systemdWeekdays(dow);
  const zone = options.timeZone ? ` ${options.timeZone}` : "";
  const datePart = dom.lastDay
    ? `*-${monthPart}${domPart}`
    : `*-${monthPart}-${domPart}`;
  const lines: string[] = [];
  if (parsed.dayMode === "or" && dowPart && !dom.any) {
    lines.push(`${dowPart} *-${monthPart}-* ${time}${zone}`);
    lines.push(`${datePart} ${time}${zone}`);
  } else {
    const prefix = dowPart ? `${dowPart} ` : "";
    lines.push(`${prefix}${datePart} ${time}${zone}`);
  }
  const out: string[] = [];
  if (options.note) out.push(`# ${options.note}`, "");
  out.push(
    "[Unit]",
    `Description=Cron schedule: ${parsed.expr}`,
    "",
    "[Timer]",
    ...lines.map((line) => `OnCalendar=${line}`),
    "Persistent=true",
    "",
    "[Install]",
    "WantedBy=timers.target",
  );
  return `${out.join("\n")}\n`;
}

export function toSystemdService(
  expr: string | ParsedCron,
  options: ExportOptions = {},
): string {
  const parsed = typeof expr === "string" ? parseCron(expr) : expr;
  if (!parsed.ok) return "";
  const out: string[] = [];
  if (options.note) out.push(`# ${options.note}`, "");
  out.push(
    "[Unit]",
    `Description=Job for cron schedule: ${parsed.expr}`,
    "",
    "[Service]",
    "Type=oneshot",
    "ExecStart=/usr/bin/true",
  );
  return `${out.join("\n")}\n`;
}

function k8sField(field: ParsedField): string {
  if (field.lastDay) return "L";
  if (field.kind === "dow" && !field.star) {
    const values = weekdayOrder(field.values).map((v) => v % 7).sort((a, b) => a - b);
    return formatRuns(values, (n) => String(n), ",").replaceAll("–", "-");
  }
  return field.items
    .map((item) => {
      if (item.wildcard) return item.step > 1 ? `*/${item.step}` : "*";
      if (item.from === item.to && item.step === 1) return String(item.from);
      return `${item.from}-${item.to}${item.step > 1 ? `/${item.step}` : ""}`;
    })
    .join(",");
}

export function toStandardCron(expr: string | ParsedCron): string {
  const parsed = typeof expr === "string" ? parseCron(expr) : expr;
  if (!parsed.ok) return "";
  return parsed.fields.map(k8sField).join(" ");
}

export function classicLastDayLines(expr: string | ParsedCron): string[] {
  const parsed = typeof expr === "string" ? parseCron(expr) : expr;
  if (!parsed.ok || !parsed.fields[2].lastDay) return [];
  const [minute, hour, , month, dow] = parsed.fields;
  if (!month.any || !dow.any) return [];
  const m = k8sField(minute);
  const h = k8sField(hour);
  return [
    `${m} ${h} 31 1,3,5,7,8,10,12 *`,
    `${m} ${h} 30 4,6,9,11 *`,
    `${m} ${h} 28,29 2 *`,
  ];
}

export function toK8sCronJob(
  expr: string | ParsedCron,
  options: ExportOptions = {},
): string {
  const parsed = typeof expr === "string" ? parseCron(expr) : expr;
  if (!parsed.ok) return "";
  const schedule = toStandardCron(parsed);
  const out: string[] = [];
  if (options.note) out.push(`# ${options.note}`);
  out.push(
    "apiVersion: batch/v1",
    "kind: CronJob",
    "metadata:",
    "  name: example",
    "spec:",
    `  schedule: "${schedule}"`,
  );
  if (options.timeZone) out.push(`  timeZone: "${options.timeZone}"`);
  out.push(
    "  concurrencyPolicy: Forbid",
    "  startingDeadlineSeconds: 60",
    "  successfulJobsHistoryLimit: 3",
    "  failedJobsHistoryLimit: 1",
    "  jobTemplate:",
    "    spec:",
    "      template:",
    "        spec:",
    "          restartPolicy: OnFailure",
    "          containers:",
    "            - name: job",
    "              image: busybox:1.37",
    '              command: ["sh", "-c", "date"]',
  );
  return `${out.join("\n")}\n`;
}

export function toGithubWorkflow(
  expr: string | ParsedCron,
  options: ExportOptions = {},
): string {
  const parsed = typeof expr === "string" ? parseCron(expr) : expr;
  if (!parsed.ok) return "";
  const out: string[] = [];
  if (options.note) out.push(`# ${options.note}`);
  out.push(
    "name: scheduled",
    "on:",
    "  schedule:",
    `    - cron: "${toStandardCron(parsed)}"`,
    "  workflow_dispatch:",
    "jobs:",
    "  run:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: date",
  );
  return `${out.join("\n")}\n`;
}

export function toGitlabCi(
  expr: string | ParsedCron,
  options: ExportOptions = {},
): string {
  const parsed = typeof expr === "string" ? parseCron(expr) : expr;
  if (!parsed.ok) return "";
  const out: string[] = [];
  if (options.note) out.push(`# ${options.note}`);
  out.push(
    "scheduled-job:",
    "  rules:",
    '    - if: $CI_PIPELINE_SOURCE == "schedule"',
    "  script:",
    "    - date",
  );
  return `${out.join("\n")}\n`;
}

export type IcsOptions = {
  summary: string;
  now?: Date;
};

const ICS_DOMAIN = "cronius.dmosk.net";

function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsFold(line: string): string {
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    chunks.push(rest.slice(0, 73));
    rest = rest.slice(73);
  }
  chunks.push(rest);
  return chunks.join("\r\n ");
}

export function toIcs(runs: Date[], options: IcsOptions): string {
  if (!runs.length) return "";
  const stamp = icsStamp(options.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//dmosk//cronius//EN",
    "CALSCALE:GREGORIAN",
  ];
  runs.forEach((date, i) => {
    const start = icsStamp(date);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${start}-${i + 1}@${ICS_DOMAIN}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      "DURATION:PT1M",
      icsFold(`SUMMARY:${icsEscape(options.summary)}`),
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export type WarningCode =
  | "domDowOr"
  | "impossibleDom"
  | "shortMonths"
  | "unevenStep"
  | "midnightLoad"
  | "midnightOffset"
  | "everyMinute"
  | "dstRisk"
  | "lastDayL"
  | "sundayAlias";

export type WarningSeverity = "warn" | "info";

export type CronWarning = {
  code: WarningCode;
  severity: WarningSeverity;
  params?: Record<string, string>;
};

const WARNING_SEVERITY: Record<WarningCode, WarningSeverity> = {
  domDowOr: "warn",
  impossibleDom: "warn",
  shortMonths: "info",
  unevenStep: "info",
  midnightLoad: "info",
  midnightOffset: "info",
  everyMinute: "warn",
  dstRisk: "info",
  lastDayL: "warn",
  sundayAlias: "info",
};

const MONTH_DAYS_MAX = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_DAYS_MIN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

type DstTransition = {
  month: number;
  hours: Set<number>;
  when: number;
};

const transitionCache = new Map<string, DstTransition[]>();

function describeTransition(
  instant: number,
  before: number,
  after: number,
): DstTransition {
  const from = instant + Math.min(before, after);
  const to = instant + Math.max(before, after);
  const hours = new Set<number>();
  for (let h = Math.floor(from / 3600000); h < Math.ceil(to / 3600000); h++) {
    hours.add(((h % 24) + 24) % 24);
  }
  return { month: new Date(from).getUTCMonth() + 1, hours, when: instant };
}

function formatWallStamp(ts: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ts));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function dstTransitions(timeZone: string, now: Date): DstTransition[] {
  const day = Math.floor(now.getTime() / 86400000);
  const key = `${timeZone}|${day}`;
  const cached = transitionCache.get(key);
  if (cached) return cached;
  const result: DstTransition[] = [];
  let prevTs = day * 86400000;
  let prevOffset = offsetAt(prevTs, timeZone);
  for (let i = 0; i < 730; i++) {
    const ts = prevTs + 86400000;
    const offset = offsetAt(ts, timeZone);
    if (offset !== prevOffset) {
      let lo = prevTs;
      let hi = ts;
      while (hi - lo > 60000) {
        const mid = lo + Math.floor((hi - lo) / 120000) * 60000;
        if (offsetAt(mid, timeZone) === prevOffset) lo = mid;
        else hi = mid;
      }
      result.push(describeTransition(hi, prevOffset, offset));
    }
    prevTs = ts;
    prevOffset = offset;
  }
  transitionCache.set(key, result);
  return result;
}

function hasUnevenStep(field: ParsedField): boolean {
  const { min, max } = FIELD_LIMITS[field.kind];
  const span = field.kind === "dow" ? 7 : max - min + 1;
  return field.items.some(
    (item) => item.wildcard && item.step > 1 && span % item.step !== 0,
  );
}

export function analyzeWarnings(
  parsed: ParsedCron,
  timeZone: string,
  now: Date = new Date(),
): CronWarning[] {
  const [minute, hour, dom, month, dow] = parsed.fields;
  const codes: WarningCode[] = [];

  if (parsed.dayMode === "or") codes.push("domDowOr");

  if (dom.lastDay) codes.push("lastDayL");

  if (parsed.dayMode === "and" && !dom.any && !dom.lastDay) {
    const fits = (limits: number[]): boolean =>
      month.values.some((m) =>
        dom.values.some((d) => d <= limits[m - 1]),
      );
    if (!fits(MONTH_DAYS_MAX)) {
      codes.push("impossibleDom");
    } else if (
      month.values.some((m) =>
        dom.values.some((d) => d > MONTH_DAYS_MIN[m - 1]),
      )
    ) {
      codes.push("shortMonths");
    }
  }

  if (parsed.fields.some(hasUnevenStep)) codes.push("unevenStep");

  if (
    !minute.any &&
    !hour.any &&
    minute.values.includes(0) &&
    hour.values.includes(0) &&
    dom.any &&
    dow.any
  ) {
    codes.push("midnightLoad");
  }

  const midnightHit =
    !minute.any &&
    !hour.any &&
    minute.values.includes(0) &&
    hour.values.includes(0);
  if (midnightHit) codes.push("midnightOffset");

  if (minute.any && hour.any) codes.push("everyMinute");

  if (!dow.any && (dow.values.includes(0) || dow.values.includes(7))) {
    codes.push("sundayAlias");
  }

  let dstDates = "";
  if (!hour.any) {
    const hits = dstTransitions(timeZone, now).filter(
      (tr) =>
        month.values.includes(tr.month) &&
        hour.values.some((h) => tr.hours.has(h)),
    );
    if (hits.length) {
      codes.push("dstRisk");
      dstDates = hits
        .slice(0, 4)
        .map((tr) => formatWallStamp(tr.when, timeZone))
        .join("; ");
    }
  }

  return codes.map((code) => {
    const warning: CronWarning = { code, severity: WARNING_SEVERITY[code] };
    if (code === "midnightOffset") {
      warning.params = { time: `00:${pad2(offsetMinute(parsed.expr))}` };
    }
    if (code === "dstRisk" && dstDates) {
      warning.params = { dates: dstDates };
    }
    return warning;
  });
}

function offsetMinute(expr: string): number {
  let sum = 0;
  for (let i = 0; i < expr.length; i++) sum += expr.charCodeAt(i) * (i + 1);
  return 1 + (sum % 14);
}

export type CrontabLine = {
  line: number;
  expr: string;
  command: string;
  result: CronParseResult;
  timeZone?: string;
};

export const CRONTAB_MAX_LINES = 500;

const ENV_LINE_RE = /^[A-Za-z_][A-Za-z0-9_]*\s*=/;
const TZ_LINE_RE = /^(?:CRON_TZ|TZ)\s*=\s*(.*)$/;

function zoneAssignment(trimmed: string): string | undefined | null {
  const match = TZ_LINE_RE.exec(trimmed);
  if (!match) return null;
  const value = match[1].trim().replace(/^(["'])(.*)\1$/, "$2");
  return value && isValidTimeZone(value) ? value : undefined;
}

export function parseCrontab(text: string): CrontabLine[] {
  const out: CrontabLine[] = [];
  const lines = text.split(/\r?\n/);
  let zone: string | undefined;
  for (let i = 0; i < lines.length && out.length < CRONTAB_MAX_LINES; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const assigned = zoneAssignment(trimmed);
    if (assigned !== null) {
      zone = assigned;
      continue;
    }
    if (ENV_LINE_RE.test(trimmed)) continue;
    const tokens = trimmed.split(/\s+/);
    const count = tokens[0].startsWith("@") ? 1 : FIELD_KINDS.length;
    const expr = tokens.slice(0, count).join(" ");
    const line: CrontabLine = {
      line: i + 1,
      expr,
      command: tokens.slice(count).join(" "),
      result: parseCron(expr),
    };
    if (zone) line.timeZone = zone;
    out.push(line);
  }
  return out;
}