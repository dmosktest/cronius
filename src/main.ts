import "./style.css";
import {
  FIELD_KINDS,
  FIELD_LIMITS,
  QUARTZ_CORE_KINDS,
  QUARTZ_FIELD_KINDS,
  analyzeWarnings,
  browserTimeZone,
  classicLastDayLines,
  convertExprToDialect,
  cronParts,
  fieldsForDialect,
  isValidTimeZone,
  nextRuns,
  parseCron,
  parseCrontab,
  runsBetween,
  toGithubWorkflow,
  toGitlabCi,
  toIcs,
  toK8sCronJob,
  toStandardCron,
  toSystemdService,
  toSystemdTimer,
  zoneHourStart,
  type CronDialect,
  type CronError,
  type CrontabLine,
  type FieldKind,
  type ParsedCron,
  type WarningCode,
} from "./cron";
import { describeSegments, describeText, intlTag } from "./describe-text";
import { detectLocale, t, type MessageKey } from "./i18n";
import {
  matchNaturalPhrase,
  nlPlaceholderExample,
  suggestSavedName,
} from "./nl";
import { registerServiceWorker } from "./register-sw";
import type { Locale } from "./site-config";

type FieldMode = "every" | "specific" | "range" | "step";

type ViewMode = "single" | "crontab";

type BuilderRow = {
  kind: FieldKind;
  mode: HTMLSelectElement;
  specific: HTMLInputElement;
  range: HTMLElement;
  from: HTMLInputElement;
  to: HTMLInputElement;
  step: HTMLElement;
  n: HTMLInputElement;
};

const DEFAULT_EXPR = "0 9 * * 1-5";
const DEFAULT_COUNT = 10;
const COUNTS = [5, 10, 20];
const HISTORY_KEY = "cronius:history";
const SAVED_KEY = "cronius:saved";
const CRONTAB_KEY = "cronius:crontab";
const DIALECT_KEY = "cronius:dialect";
const HISTORY_MAX = 12;
const SAVED_MAX = 20;
const HISTORY_DELAY_MS = 1500;
const BATCH_DELAY_MS = 200;
const SHARE_TEXT_MAX = 600;
const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;
const APP_VERSION = "1.2.0";
const DEFAULT_QUARTZ_EXPR = "0 0 9 ? * MON-FRI";

type SavedItem = { name: string; expr: string };
const STRIP_MAX_JOBS = 50;
const STRIP_HOURS = 24;

const FIELD_LABEL_KEY: Record<FieldKind, MessageKey> = {
  second: "fieldSecond",
  minute: "fieldMinute",
  hour: "fieldHour",
  dom: "fieldDom",
  month: "fieldMonth",
  dow: "fieldDow",
  year: "fieldYear",
};

const WARNING_KEY: Record<WarningCode, MessageKey> = {
  domDowOr: "warnDomDowOr",
  impossibleDom: "warnImpossibleDom",
  shortMonths: "warnShortMonths",
  unevenStep: "warnUnevenStep",
  midnightLoad: "warnMidnightLoad",
  midnightOffset: "warnMidnightOffset",
  everyMinute: "warnEveryMinute",
  dstRisk: "warnDstRisk",
  lastDayL: "warnLastDayL",
  sundayAlias: "warnSundayAlias",
  quartzExport: "warnQuartzExport",
};

const DEFAULT_STEP: Record<FieldKind, string> = {
  second: "5",
  minute: "5",
  hour: "2",
  dom: "2",
  month: "2",
  dow: "2",
  year: "1",
};

let locale: Locale = "ru";
let rows: BuilderRow[] = [];
let viewMode: ViewMode = "single";
let dialect: CronDialect = "classic";
let lastIcs = "";
let historyTimer = 0;
let batchTimer = 0;
let exportValid = false;
let calMonth = new Date().getUTCFullYear() * 12 + new Date().getUTCMonth();

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""));
}

function clearStatuses(): void {
  const main = byId<HTMLElement>("status");
  main.textContent = "";
  main.classList.remove("is-error");
  for (const el of document.querySelectorAll<HTMLElement>(".row-status")) {
    el.textContent = "";
    el.classList.remove("is-error");
  }
}

function setStatus(message: string, isError: boolean, target: HTMLElement): void {
  clearStatuses();
  target.textContent = message;
  target.classList.toggle("is-error", isError);
}

async function copyText(
  text: string,
  okKey: "copied" | "shareCopied",
  statusEl: HTMLElement,
): Promise<void> {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus(t(locale, okKey), false, statusEl);
  } catch {
    setStatus(t(locale, "copyError"), true, statusEl);
  }
}

function bindLangMenu(): void {
  const langRoot = document.querySelector<HTMLDetailsElement>(".lang");
  if (!langRoot) return;
  document.addEventListener("click", (event) => {
    if (!langRoot.open) return;
    const target = event.target;
    if (target instanceof Node && !langRoot.contains(target)) {
      langRoot.open = false;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && langRoot.open) langRoot.open = false;
  });
}

function currentZone(): { zone: string; exportZone: string | undefined } {
  const value = byId<HTMLSelectElement>("tz").value;
  if (value === "browser") return { zone: browserTimeZone(), exportZone: undefined };
  return { zone: value, exportZone: value };
}

function currentCount(): number {
  const n = Number(byId<HTMLSelectElement>("count").value);
  return COUNTS.includes(n) ? n : DEFAULT_COUNT;
}

function crontabText(): string {
  return byId<HTMLTextAreaElement>("crontab").value;
}

function syncUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const tz = byId<HTMLSelectElement>("tz").value;
  if (tz !== "browser") params.set("tz", tz);
  else params.delete("tz");
  if (dialect === "quartz") params.set("dialect", "quartz");
  else params.delete("dialect");
  if (viewMode === "crontab") {
    params.set("mode", "crontab");
    params.delete("expr");
    params.delete("n");
    const text = crontabText().trim();
    if (text && text.length <= SHARE_TEXT_MAX) params.set("text", text);
    else params.delete("text");
  } else {
    params.delete("mode");
    params.delete("text");
    const exprInput = byId<HTMLInputElement>("expr");
    const expr = exprInput.value.trim();
    const fallback = dialect === "quartz" ? DEFAULT_QUARTZ_EXPR : DEFAULT_EXPR;
    if (expr && expr !== fallback) params.set("expr", expr);
    else params.delete("expr");
    const count = currentCount();
    if (count !== DEFAULT_COUNT) params.set("n", String(count));
    else params.delete("n");
  }
  const qs = params.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", next);
}

function parseOpts(): { dialect: CronDialect } {
  return { dialect };
}

function activeKinds(): readonly FieldKind[] {
  return fieldsForDialect(dialect);
}

function activeRows(): BuilderRow[] {
  return rows.filter((row) => activeKinds().includes(row.kind));
}

function setDialect(next: CronDialect, convertExpr: boolean): void {
  if (next === dialect && !convertExpr) {
    syncDialectUi();
    return;
  }
  const prev = dialect;
  const input = byId<HTMLInputElement>("expr");
  if (convertExpr && prev !== next) {
    input.value = convertExprToDialect(input.value, next, prev);
  }
  dialect = next;
  window.localStorage.setItem(DIALECT_KEY, next);
  syncDialectUi();
  update(true, true);
}

function syncDialectUi(): void {
  const quartz = dialect === "quartz";
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".dialect-btn")) {
    const active = btn.dataset.dialect === dialect;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  }
  byId<HTMLElement>("builder").classList.toggle("is-quartz", quartz);
  for (const kind of ["second", "year"] as const) {
    const el = document.querySelector<HTMLElement>(`.cron-field[data-field="${kind}"]`);
    if (el) el.hidden = !quartz;
  }
  const expr = byId<HTMLInputElement>("expr");
  expr.placeholder = quartz ? "0 */15 * * * ?" : "*/15 * * * *";
}

function detectMode(raw: string): {
  mode: FieldMode;
  from?: string;
  to?: string;
  n?: string;
} {
  if (raw === "*") return { mode: "every" };
  const step = /^\*\/(\d+)$/.exec(raw);
  if (step) return { mode: "step", n: step[1] };
  const range = /^(\d+)-(\d+)$/.exec(raw);
  if (range) return { mode: "range", from: range[1], to: range[2] };
  return { mode: "specific" };
}

function showMode(row: BuilderRow): void {
  const mode = row.mode.value as FieldMode;
  row.specific.hidden = mode !== "specific";
  row.range.hidden = mode !== "range";
  row.step.hidden = mode !== "step";
}

function applyRow(row: BuilderRow, raw: string): void {
  const detected = detectMode(raw);
  row.mode.value = detected.mode;
  row.specific.value = detected.mode === "specific" ? raw : "";
  row.from.value = detected.from ?? "";
  row.to.value = detected.to ?? "";
  row.n.value = detected.n ?? "";
  showMode(row);
}

function rowToken(row: BuilderRow): string {
  const { min, max } = FIELD_LIMITS[row.kind];
  switch (row.mode.value as FieldMode) {
    case "specific":
      return row.specific.value.replace(/\s+/g, "") || "*";
    case "range":
      return `${row.from.value || min}-${row.to.value || max}`;
    case "step":
      return `*/${row.n.value || DEFAULT_STEP[row.kind]}`;
    default:
      return "*";
  }
}

function syncBuilder(): void {
  const raw = byId<HTMLInputElement>("expr").value;
  const parsed = parseCron(raw, parseOpts());
  let tokens: string[] | null = null;
  if (parsed.ok) {
    tokens = parsed.expr.split(" ");
  } else {
    const parts = raw.trim().split(/\s+/);
    const kinds = activeKinds();
    if (parts.length === kinds.length && !parts[0].startsWith("@")) tokens = parts;
  }
  if (!tokens) return;
  const kinds =
    dialect === "quartz"
      ? tokens.length === 7
        ? QUARTZ_FIELD_KINDS
        : QUARTZ_CORE_KINDS
      : FIELD_KINDS;
  tokens.forEach((token, i) => {
    const row = rows.find((item) => item.kind === kinds[i]);
    if (row) applyRow(row, token);
  });
  if (dialect === "quartz" && tokens.length === 6) {
    const yearRow = rows.find((item) => item.kind === "year");
    if (yearRow) applyRow(yearRow, "*");
  }
}

function hideRecipeTip(): void {
  byId<HTMLElement>("recipe-tip").hidden = true;
}

function onBuilderChange(): void {
  const tokens = activeRows().map(rowToken);
  if (
    dialect === "quartz" &&
    tokens.length === 7 &&
    tokens[6] === "*"
  ) {
    tokens.pop();
  }
  byId<HTMLInputElement>("expr").value = tokens.join(" ");
  hideRecipeTip();
  update(false, true);
}

function onModeChange(row: BuilderRow): void {
  const { min, max } = FIELD_LIMITS[row.kind];
  const mode = row.mode.value as FieldMode;
  if (mode === "specific" && !row.specific.value) {
    row.specific.value = String(row.kind === "dow" ? 1 : min);
  }
  if (mode === "range") {
    row.from.value ||= String(min);
    row.to.value ||= String(row.kind === "dow" ? 6 : max);
  }
  if (mode === "step") row.n.value ||= DEFAULT_STEP[row.kind];
  showMode(row);
  onBuilderChange();
}

function errorMessage(error: CronError): string {
  switch (error.errorCode) {
    case "fieldCount":
      return t(locale, dialect === "quartz" ? "errFieldCountQuartz" : "errFieldCount");
    case "syntax":
      return format(t(locale, "errSyntax"), {
        field: error.field ? t(locale, FIELD_LABEL_KEY[error.field]) : "",
      });
    case "range":
      return format(t(locale, "errRange"), {
        field: error.field ? t(locale, FIELD_LABEL_KEY[error.field]) : "",
        min: error.min ?? "",
        max: error.max ?? "",
      });
    case "reboot":
      return t(locale, "errReboot");
    case "macro":
      return t(locale, "errMacro");
    case "quartzDay":
      return t(locale, "errQuartzDay");
    default:
      return "";
  }
}

function renderDescription(parsed: ParsedCron): void {
  const target = byId<HTMLElement>("description");
  target.replaceChildren();
  for (const part of describeSegments(parsed, locale)) {
    if (!part.fields.length) {
      target.append(part.text);
      continue;
    }
    const span = document.createElement("span");
    span.className = "d-part";
    span.dataset.field = part.fields.join(" ");
    span.textContent = part.text;
    target.append(span);
  }
}

function renderTokens(parsed: ParsedCron): void {
  const box = byId<HTMLElement>("expr-tokens");
  box.replaceChildren();
  const tokens = parsed.expr.split(" ");
  const kinds =
    parsed.dialect === "quartz"
      ? tokens.length === 7
        ? QUARTZ_FIELD_KINDS
        : QUARTZ_CORE_KINDS
      : FIELD_KINDS;
  tokens.forEach((token, i) => {
    const kind = kinds[i];
    if (!kind) return;
    const item = document.createElement("span");
    item.className = "tok";
    item.tabIndex = 0;
    item.dataset.field = kind;
    const code = document.createElement("code");
    code.textContent = token;
    const name = document.createElement("small");
    name.textContent = t(locale, FIELD_LABEL_KEY[kind]);
    item.append(code, name);
    box.append(item);
  });
  box.hidden = false;
}

function highlightFields(kinds: string[]): void {
  const targets = document.querySelectorAll<HTMLElement>(
    "#expr-tokens .tok, #description .d-part",
  );
  for (const el of targets) {
    const own = (el.dataset.field ?? "").split(" ");
    el.classList.toggle("is-hl", own.some((kind) => kinds.includes(kind)));
  }
}

function bindHighlight(rootId: string, selector: string): void {
  const root = byId<HTMLElement>(rootId);
  const kindsOf = (target: EventTarget | null): string[] => {
    const el = target instanceof Element ? target.closest<HTMLElement>(selector) : null;
    return el?.dataset.field ? el.dataset.field.split(" ") : [];
  };
  for (const [enter, leave] of [
    ["mouseover", "mouseout"],
    ["focusin", "focusout"],
  ] as const) {
    root.addEventListener(enter, (event) => {
      const kinds = kindsOf(event.target);
      if (kinds.length) highlightFields(kinds);
    });
    root.addEventListener(leave, () => highlightFields([]));
  }
}

function renderWarnings(parsed: ParsedCron, zone: string): void {
  const list = byId<HTMLElement>("warnings");
  list.replaceChildren();
  for (const warning of analyzeWarnings(parsed, zone)) {
    if (warning.code === "lastDayL") continue;
    const li = document.createElement("li");
    li.className = `warning is-${warning.severity}`;
    li.textContent = format(t(locale, WARNING_KEY[warning.code]), warning.params ?? {});
    list.append(li);
  }
  list.hidden = list.childElementCount === 0;
}

function renderFormAlerts(parsed: ParsedCron): void {
  const box = byId<HTMLElement>("form-alerts");
  box.replaceChildren();
  const { dom } = cronParts(parsed);
  if (!dom.lastDay || parsed.dialect === "quartz") {
    box.hidden = true;
    return;
  }
  const lines = classicLastDayLines(parsed);
  const alert = document.createElement("div");
  alert.className = "form-alert";
  alert.setAttribute("role", "alert");
  const body = document.createElement("div");
  body.innerHTML = t(locale, "formLastDayHtml");
  alert.append(body);
  if (lines.length) {
    const pre = document.createElement("pre");
    pre.textContent = lines.join("\n");
    alert.append(pre);
    const actions = document.createElement("div");
    actions.className = "form-alert-actions";
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "btn btn-small";
    applyBtn.textContent = t(locale, "formLastDayApply");
    applyBtn.addEventListener("click", () => {
      const area = byId<HTMLTextAreaElement>("crontab");
      const block = lines.join("\n");
      area.value = area.value.trim()
        ? `${area.value.trim()}\n${block}`
        : block;
      persistCrontab();
      setViewMode("crontab");
      setStatus(t(locale, "formLastDayCopied"), false, byId("status"));
    });
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn btn-small";
    copyBtn.textContent = t(locale, "copy");
    copyBtn.addEventListener("click", () => {
      void copyText(lines.join("\n"), "copied", byId("status"));
    });
    actions.append(applyBtn, copyBtn);
    alert.append(actions);
  }
  box.append(alert);
  box.hidden = false;
}

function cell(text: string): HTMLTableCellElement {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function runFormatter(zone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(intlTag(locale), {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: dialect === "quartz" ? "2-digit" : undefined,
    timeZone: zone,
    timeZoneName: "short",
  });
}

function renderRuns(runs: Date[], zone: string): void {
  const fmt = runFormatter(zone);
  const body = byId<HTMLElement>("runs-body");
  body.replaceChildren();
  runs.forEach((date, i) => {
    const tr = document.createElement("tr");
    const utc = `${date.toISOString().slice(0, 16).replace("T", " ")}Z`;
    tr.append(cell(String(i + 1)), cell(fmt.format(date)), cell(utc));
    body.append(tr);
  });
  byId<HTMLElement>("no-runs").hidden = runs.length > 0;
  byId<HTMLElement>("runs-wrap").hidden = runs.length === 0;
}

function hourFormatter(zone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: zone,
  });
}

function addTick(axis: HTMLElement, percent: number, text: string): void {
  const tick = document.createElement("span");
  tick.className = "tl-tick";
  tick.style.left = `${percent}%`;
  tick.textContent = text;
  axis.append(tick);
}

function renderTimeline(parsed: ParsedCron, runs: Date[], zone: string): void {
  const box = byId<HTMLElement>("timeline");
  const label = byId<HTMLElement>("timeline-label");
  const track = byId<HTMLElement>("tl-track");
  const axis = byId<HTMLElement>("tl-axis");
  track.replaceChildren();
  axis.replaceChildren();
  if (!runs.length) {
    box.hidden = true;
    return;
  }
  const start = Date.now();
  const daily = runs[runs.length - 1].getTime() <= start + DAY_MS;
  const span = daily ? DAY_MS : 7 * DAY_MS;
  const marks = runsBetween(parsed, new Date(start), new Date(start + span), zone);
  box.hidden = false;
  track.hidden = marks.length === 0;
  axis.hidden = marks.length === 0;
  if (!marks.length) {
    label.textContent = t(locale, "timelineNone");
    return;
  }
  label.textContent = `${t(locale, daily ? "timeline24h" : "timeline7d")} · ${zone}`;
  for (const mark of marks) {
    const el = document.createElement("span");
    el.className = "tl-mark";
    el.style.left = `${((mark.getTime() - start) / span) * 100}%`;
    track.append(el);
  }
  const hours = hourFormatter(zone);
  const dayNames = new Intl.DateTimeFormat(intlTag(locale), {
    weekday: "short",
    timeZone: zone,
  });
  const first = zoneHourStart(start, zone);
  for (let ts = first + HOUR_MS; ts < start + span; ts += HOUR_MS) {
    const hour = Number(hours.format(new Date(ts)));
    const percent = ((ts - start) / span) * 100;
    if (daily && hour % 3 === 0) addTick(axis, percent, String(hour).padStart(2, "0"));
    if (!daily && hour === 0) addTick(axis, percent, dayNames.format(new Date(ts)));
  }
}

function wallParts(date: Date, zone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day") };
}

function renderCalendar(parsed: ParsedCron, zone: string): void {
  const box = byId<HTMLElement>("cal-heat");
  const grid = byId<HTMLElement>("cal-grid");
  const title = byId<HTMLElement>("cal-title");
  grid.replaceChildren();
  const year = Math.floor(calMonth / 12);
  const month = calMonth % 12;
  const monthName = new Intl.DateTimeFormat(intlTag(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, 1)));
  title.textContent = `${t(locale, "calTitle")} · ${monthName}`;
  const from = new Date(Date.UTC(year, month, 1) - DAY_MS);
  const to = new Date(Date.UTC(year, month + 1, 1));
  const marks = runsBetween(parsed, from, to, zone);
  const counts = new Map<number, number>();
  for (const mark of marks) {
    const wall = wallParts(mark, zone);
    if (wall.y !== year || wall.m !== month + 1) continue;
    counts.set(wall.d, (counts.get(wall.d) ?? 0) + 1);
  }
  const dowFmt = new Intl.DateTimeFormat(intlTag(locale), {
    weekday: "narrow",
    timeZone: "UTC",
  });
  for (let i = 0; i < 7; i++) {
    const head = document.createElement("span");
    head.className = "cal-dow";
    head.textContent = dowFmt.format(new Date(Date.UTC(2023, 0, 1 + i)));
    grid.append(head);
  }
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const dim = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let i = 0; i < firstDow; i++) {
    const empty = document.createElement("span");
    empty.className = "cal-cell is-empty";
    empty.setAttribute("aria-hidden", "true");
    grid.append(empty);
  }
  for (let day = 1; day <= dim; day++) {
    const cellEl = document.createElement("span");
    const n = counts.get(day) ?? 0;
    cellEl.className = n ? "cal-cell is-run" : "cal-cell";
    cellEl.setAttribute("role", "gridcell");
    const dayLabel = document.createElement("span");
    dayLabel.textContent = String(day);
    cellEl.append(dayLabel);
    if (n) {
      const count = document.createElement("span");
      count.className = "cal-count";
      count.textContent = format(t(locale, "calRuns"), { n });
      cellEl.title = format(t(locale, "calRuns"), { n });
      cellEl.append(count);
    }
    grid.append(cellEl);
  }
  box.hidden = false;
}

function readSaved(): SavedItem[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SavedItem =>
          !!item &&
          typeof item === "object" &&
          typeof (item as SavedItem).name === "string" &&
          typeof (item as SavedItem).expr === "string",
      )
      .slice(0, SAVED_MAX);
  } catch {
    return [];
  }
}

function writeSaved(list: SavedItem[]): void {
  if (list.length) window.localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, SAVED_MAX)));
  else window.localStorage.removeItem(SAVED_KEY);
}

function renderSaved(): void {
  const list = readSaved();
  const chips = byId<HTMLElement>("saved-chips");
  chips.replaceChildren();
  for (const item of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-small chip is-saved";
    btn.dataset.expr = item.expr;
    btn.textContent = item.name;
    btn.title = item.expr;
    chips.append(btn);
  }
  byId<HTMLElement>("saved").hidden = false;
}

function saveCurrentExpr(): void {
  const expr = byId<HTMLInputElement>("expr").value.trim();
  const parsed = parseCron(expr, parseOpts());
  if (!parsed.ok) return;
  const name =
    window.prompt(t(locale, "savedNamePrompt"), suggestSavedName(parsed.expr))?.trim() ||
    suggestSavedName(parsed.expr);
  const list = readSaved().filter((item) => item.expr !== parsed.expr);
  list.unshift({ name, expr: parsed.expr });
  writeSaved(list);
  renderSaved();
}

function applyNaturalLanguage(): void {
  const input = byId<HTMLInputElement>("nl");
  const error = byId<HTMLElement>("nl-error");
  const match = matchNaturalPhrase(input.value);
  if (!match) {
    error.textContent = t(locale, "nlNoMatch");
    error.hidden = false;
    return;
  }
  error.hidden = true;
  byId<HTMLInputElement>("expr").value =
    dialect === "quartz" ? convertExprToDialect(match.expr, "quartz", "classic") : match.expr;
  hideRecipeTip();
  update(true, true);
}

function persistCrontab(): void {
  const text = byId<HTMLTextAreaElement>("crontab").value;
  if (text.trim()) window.localStorage.setItem(CRONTAB_KEY, text);
  else window.localStorage.removeItem(CRONTAB_KEY);
}

function restoreCrontab(): void {
  const stored = window.localStorage.getItem(CRONTAB_KEY);
  const area = byId<HTMLTextAreaElement>("crontab");
  if (!area.value && stored) area.value = stored;
}

function renderOverlap(lines: CrontabLine[], zone: string): void {
  const box = byId<HTMLElement>("overlap");
  const strip = byId<HTMLElement>("strip");
  strip.replaceChildren();
  const jobs = lines
    .filter((line) => line.result.ok)
    .slice(0, STRIP_MAX_JOBS);
  box.hidden = jobs.length === 0;
  if (!jobs.length) return;
  const now = new Date();
  const start = zoneHourStart(now.getTime(), zone);
  const end = new Date(start + STRIP_HOURS * HOUR_MS);
  const hours = hourFormatter(zone);
  const hourLabels = Array.from({ length: STRIP_HOURS }, (_, i) =>
    hours.format(new Date(start + i * HOUR_MS)),
  );
  const counts = jobs.map((line) => {
    const row = new Array<number>(STRIP_HOURS).fill(0);
    if (!line.result.ok) return row;
    for (const run of runsBetween(line.result, now, end, line.timeZone ?? zone)) {
      const index = Math.floor((run.getTime() - start) / HOUR_MS);
      if (index >= 0 && index < STRIP_HOURS) row[index] += 1;
    }
    return row;
  });
  const clash = hourLabels.map(
    (_, i) => counts.filter((row) => row[i] > 0).length >= 2,
  );

  const head = document.createElement("span");
  head.className = "strip-name";
  strip.append(head);
  hourLabels.forEach((text, i) => {
    const el = document.createElement("span");
    el.className = `strip-hour${clash[i] ? " is-overlap" : ""}`;
    el.textContent = text;
    strip.append(el);
  });
  jobs.forEach((line, row) => {
    const name = document.createElement("span");
    name.className = "strip-name";
    name.textContent = `${line.line}: ${line.expr}`;
    name.title = line.command || line.expr;
    strip.append(name);
    counts[row].forEach((count, i) => {
      const cellEl = document.createElement("span");
      cellEl.className = `strip-cell${count ? " is-on" : ""}${clash[i] ? " is-overlap" : ""}`;
      if (count) cellEl.title = `${hourLabels[i]}:00 · ${count}`;
      strip.append(cellEl);
    });
  });

  const clashHours = hourLabels
    .filter((_, i) => clash[i])
    .map((text) => `${text}:00`);
  byId<HTMLElement>("overlap-note").textContent = clashHours.length
    ? format(t(locale, "overlapFound"), { hours: clashHours.join(", ") })
    : t(locale, "overlapNone");
}

function renderExports(parsed: ParsedCron, runs: Date[], exportZone: string | undefined): void {
  const note = t(locale, "exportNote");
  byId<HTMLElement>("systemd-out").textContent = toSystemdTimer(parsed, {
    timeZone: exportZone,
    note,
  });
  byId<HTMLElement>("service-out").textContent = toSystemdService(parsed, { note });
  byId<HTMLElement>("k8s-out").textContent = toK8sCronJob(parsed, {
    timeZone: exportZone,
    note,
  });
  byId<HTMLElement>("github-out").textContent = toGithubWorkflow(parsed, {
    note: t(locale, "exportNoteGithub"),
  });
  byId<HTMLElement>("gitlab-out").textContent = toGitlabCi(parsed, {
    note: format(t(locale, "exportNoteGitlab"), { cron: toStandardCron(parsed) }),
  });
  lastIcs = toIcs(runs, { summary: `cron: ${parsed.expr}` });
  byId<HTMLElement>("ics-out").textContent = lastIcs.replaceAll("\r\n", "\n");
  byId<HTMLElement>("ics-block").hidden = runs.length === 0;
}

function readHistory(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && item !== "")
      .slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

function writeHistory(list: string[]): void {
  try {
    if (list.length) window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    else window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    return;
  }
}

function renderHistory(): void {
  const list = readHistory();
  const chips = byId<HTMLElement>("history-chips");
  chips.replaceChildren();
  for (const expr of list) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-small example-btn chip";
    button.textContent = expr;
    button.dataset.expr = expr;
    chips.append(button);
  }
  byId<HTMLElement>("history").hidden = list.length === 0;
}

function rememberExpr(): void {
  window.clearTimeout(historyTimer);
  if (viewMode !== "single") return;
  const value = byId<HTMLInputElement>("expr").value.trim().replace(/\s+/g, " ");
  if (!parseCron(value, parseOpts()).ok) return;
  writeHistory([value, ...readHistory().filter((item) => item !== value)].slice(0, HISTORY_MAX));
  renderHistory();
}

function scheduleRemember(): void {
  window.clearTimeout(historyTimer);
  historyTimer = window.setTimeout(rememberExpr, HISTORY_DELAY_MS);
}

function syncExportPanel(): void {
  byId<HTMLElement>("export-panel").hidden = viewMode !== "single" || !exportValid;
}

function setExportValid(valid: boolean): void {
  exportValid = valid;
  syncExportPanel();
}

function update(syncFromText: boolean, remember = false): void {
  if (syncFromText) syncBuilder();
  clearStatuses();
  const input = byId<HTMLInputElement>("expr");
  const errorEl = byId<HTMLElement>("expr-error");
  const results = byId<HTMLElement>("results");
  const parsed = parseCron(input.value, parseOpts());
  if (!parsed.ok) {
    results.hidden = true;
    byId<HTMLElement>("expr-tokens").hidden = true;
    byId<HTMLElement>("cal-heat").hidden = true;
    byId<HTMLElement>("form-alerts").hidden = true;
    const message = errorMessage(parsed);
    errorEl.textContent = message;
    errorEl.hidden = !message;
    setExportValid(false);
    syncUrl();
    return;
  }
  errorEl.hidden = true;
  const { zone, exportZone } = currentZone();
  const runs = nextRuns(parsed, { count: currentCount(), timeZone: zone });
  renderTokens(parsed);
  renderDescription(parsed);
  renderFormAlerts(parsed);
  renderWarnings(parsed, zone);
  renderRuns(runs, zone);
  renderTimeline(parsed, runs, zone);
  renderCalendar(parsed, zone);
  renderExports(parsed, runs, exportZone);
  results.hidden = false;
  setExportValid(true);
  syncUrl();
  if (remember) scheduleRemember();
}

function batchRow(line: CrontabLine, zone: string): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.className = "batch-row";
  tr.tabIndex = 0;
  tr.dataset.expr = line.expr;
  if (line.timeZone) tr.dataset.tz = line.timeZone;
  const lineZone = line.timeZone ?? zone;
  const exprCell = cell(line.expr);
  if (line.command) {
    const command = document.createElement("span");
    command.className = "batch-command";
    command.textContent = line.command;
    command.title = line.command;
    exprCell.append(command);
  }
  let meaning: HTMLTableCellElement;
  let next = "—";
  if (line.result.ok) {
    meaning = cell(describeText(line.result, locale));
    const [first] = nextRuns(line.result, { count: 1, timeZone: lineZone });
    if (first) next = runFormatter(lineZone).format(first);
  } else {
    meaning = cell(errorMessage(line.result));
    meaning.className = "batch-error";
  }
  const nextCell = cell(next);
  if (line.timeZone && line.timeZone !== zone) {
    const badge = document.createElement("span");
    badge.className = "tz-badge";
    badge.textContent = line.timeZone;
    badge.title = "CRON_TZ";
    nextCell.append(badge);
  }
  tr.append(cell(String(line.line)), exprCell, meaning, nextCell);
  return tr;
}

function renderBatch(): void {
  const text = crontabText();
  const panel = byId<HTMLElement>("batch-results");
  const lines = parseCrontab(text);
  const { zone } = currentZone();
  const body = byId<HTMLElement>("batch-body");
  body.replaceChildren();
  for (const line of lines) body.append(batchRow(line, zone));
  renderOverlap(lines, zone);
  const summary = byId<HTMLElement>("batch-summary");
  const ok = lines.filter((line) => line.result.ok).length;
  summary.textContent = format(t(locale, "batchSummary"), {
    total: lines.length,
    ok,
    bad: lines.length - ok,
  });
  summary.hidden = lines.length === 0;
  byId<HTMLElement>("batch-wrap").hidden = lines.length === 0;
  byId<HTMLElement>("batch-empty").hidden = lines.length > 0;
  panel.hidden = text.trim() === "";
  syncUrl();
}

function scheduleBatch(): void {
  window.clearTimeout(batchTimer);
  batchTimer = window.setTimeout(renderBatch, BATCH_DELAY_MS);
}

function setViewMode(next: ViewMode): void {
  viewMode = next;
  const single = next === "single";
  byId<HTMLElement>("single-view").hidden = !single;
  byId<HTMLElement>("batch-view").hidden = single;
  byId<HTMLElement>("count-setting").hidden = !single;
  for (const [id, active] of [
    ["tab-single", single],
    ["tab-crontab", !single],
  ] as const) {
    const tab = byId<HTMLButtonElement>(id);
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  syncExportPanel();
  if (single) {
    byId<HTMLElement>("batch-results").hidden = true;
    update(true);
  } else {
    byId<HTMLElement>("results").hidden = true;
    clearStatuses();
    renderBatch();
  }
}

function openInSingle(expr: string, zone?: string): void {
  byId<HTMLInputElement>("expr").value = expr;
  if (zone) setZone(zone);
  hideRecipeTip();
  setViewMode("single");
  update(true, true);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setZone(value: string): void {
  const tz = byId<HTMLSelectElement>("tz");
  if (value !== "browser" && isValidTimeZone(value)) {
    if (![...tz.options].some((o) => o.value === value)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      tz.append(option);
    }
    tz.value = value;
  } else {
    tz.value = "browser";
  }
}

function loadDialectPreference(): CronDialect {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("dialect");
  if (fromUrl === "quartz" || fromUrl === "classic") return fromUrl;
  const stored = window.localStorage.getItem(DIALECT_KEY);
  return stored === "quartz" ? "quartz" : "classic";
}

function loadFromUrl(): ViewMode {
  const params = new URLSearchParams(window.location.search);
  dialect = loadDialectPreference();
  syncDialectUi();
  const exprInput = byId<HTMLInputElement>("expr");
  const fallback = dialect === "quartz" ? DEFAULT_QUARTZ_EXPR : DEFAULT_EXPR;
  exprInput.value = params.get("expr") ?? (exprInput.defaultValue || fallback);
  const text = params.get("text");
  byId<HTMLTextAreaElement>("crontab").value = text ?? "";
  if (!text) restoreCrontab();
  setZone(params.get("tz") ?? "browser");
  const n = Number(params.get("n"));
  byId<HTMLSelectElement>("count").value = String(COUNTS.includes(n) ? n : DEFAULT_COUNT);
  return params.get("mode") === "crontab" ? "crontab" : "single";
}

function collectRows(): BuilderRow[] {
  return fieldsForDialect("quartz").map((kind) => {
    const root = document.querySelector<HTMLElement>(`.cron-field[data-field="${kind}"]`)!;
    return {
      kind,
      mode: root.querySelector<HTMLSelectElement>(".mode-select")!,
      specific: root.querySelector<HTMLInputElement>(".in-specific")!,
      range: root.querySelector<HTMLElement>(".in-range")!,
      from: root.querySelector<HTMLInputElement>(".in-from")!,
      to: root.querySelector<HTMLInputElement>(".in-to")!,
      step: root.querySelector<HTMLElement>(".in-step")!,
      n: root.querySelector<HTMLInputElement>(".in-n")!,
    };
  });
}

function bindCopy(buttonId: string, getText: () => string, statusId: string): void {
  byId<HTMLButtonElement>(buttonId).addEventListener("click", () => {
    void copyText(getText(), "copied", byId(statusId));
  });
}

function bindCopyFromPre(name: string): void {
  bindCopy(
    `copy-${name}`,
    () => byId<HTMLElement>(`${name}-out`).textContent ?? "",
    `copy-${name}-status`,
  );
}

function downloadIcs(): void {
  if (!lastIcs) return;
  const url = URL.createObjectURL(new Blob([lastIcs], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "cronius.ics";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function bindBatchRows(): void {
  const body = byId<HTMLElement>("batch-body");
  const open = (target: EventTarget | null): void => {
    const tr = target instanceof Element ? target.closest<HTMLElement>("tr.batch-row") : null;
    if (tr?.dataset.expr) openInSingle(tr.dataset.expr, tr.dataset.tz);
  };
  body.addEventListener("click", (event) => open(event.target));
  body.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open(event.target);
  });
}

function onShare(): void {
  syncUrl();
  if (viewMode === "crontab" && crontabText().trim().length > SHARE_TEXT_MAX) {
    setStatus(t(locale, "shareTooLong"), true, byId("status"));
    return;
  }
  void copyText(window.location.href, "shareCopied", byId("status"));
}

function init(): void {
  locale = detectLocale();
  bindLangMenu();
  rows = collectRows();
  byId<HTMLSelectElement>("tz").options[0].text =
    `${t(locale, "tzBrowser")} (${browserTimeZone()})`;
  const initialMode = loadFromUrl();

  const expr = byId<HTMLInputElement>("expr");
  expr.addEventListener("input", () => {
    hideRecipeTip();
    update(true, true);
  });
  expr.addEventListener("change", rememberExpr);

  const applyExampleExpr = (raw: string): void => {
    expr.value =
      dialect === "quartz" ? convertExprToDialect(raw, "quartz", "classic") : raw;
  };

  for (const button of document.querySelectorAll<HTMLButtonElement>("#presets [data-expr]")) {
    button.addEventListener("click", () => {
      applyExampleExpr(button.dataset.expr ?? "");
      hideRecipeTip();
      update(true, true);
    });
  }

  const tip = byId<HTMLElement>("recipe-tip");
  for (const button of document.querySelectorAll<HTMLButtonElement>("#recipes [data-expr]")) {
    button.addEventListener("click", () => {
      applyExampleExpr(button.dataset.expr ?? "");
      update(true, true);
      tip.textContent = t(locale, button.dataset.tip as MessageKey);
      tip.hidden = false;
    });
  }

  byId<HTMLElement>("history-chips").addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.dataset.expr) return;
    expr.value = target.dataset.expr;
    hideRecipeTip();
    update(true, true);
  });
  byId<HTMLButtonElement>("history-clear").addEventListener("click", () => {
    window.clearTimeout(historyTimer);
    writeHistory([]);
    renderHistory();
  });

  for (const row of rows) {
    row.mode.addEventListener("change", () => onModeChange(row));
    for (const input of [row.specific, row.from, row.to, row.n]) {
      input.addEventListener("input", onBuilderChange);
    }
  }

  byId<HTMLButtonElement>("tab-single").addEventListener("click", () => setViewMode("single"));
  byId<HTMLButtonElement>("tab-crontab").addEventListener("click", () => setViewMode("crontab"));
  byId<HTMLTextAreaElement>("crontab").addEventListener("input", () => {
    persistCrontab();
    scheduleBatch();
  });
  bindBatchRows();
  bindHighlight("expr-tokens", ".tok");
  bindHighlight("description", ".d-part");

  byId<HTMLSelectElement>("tz").addEventListener("change", () => {
    if (viewMode === "crontab") renderBatch();
    else update(false);
  });
  byId<HTMLSelectElement>("count").addEventListener("change", () => update(false));

  for (const name of ["systemd", "service", "k8s", "github", "gitlab"]) bindCopyFromPre(name);
  bindCopy("copy-ics", () => lastIcs.replaceAll("\r\n", "\n"), "copy-ics-status");
  byId<HTMLButtonElement>("download-ics").addEventListener("click", downloadIcs);
  byId<HTMLButtonElement>("share").addEventListener("click", onShare);

  const nl = byId<HTMLInputElement>("nl");
  nl.placeholder = nlPlaceholderExample(locale);
  byId<HTMLButtonElement>("nl-apply").addEventListener("click", applyNaturalLanguage);
  nl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyNaturalLanguage();
    }
  });

  byId<HTMLButtonElement>("saved-add").addEventListener("click", saveCurrentExpr);
  byId<HTMLButtonElement>("saved-clear").addEventListener("click", () => {
    writeSaved([]);
    renderSaved();
  });
  byId<HTMLElement>("saved-chips").addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.dataset.expr) return;
    byId<HTMLInputElement>("expr").value = target.dataset.expr;
    hideRecipeTip();
    update(true, true);
  });

  byId<HTMLButtonElement>("cal-prev").addEventListener("click", () => {
    calMonth -= 1;
    const parsed = parseCron(byId<HTMLInputElement>("expr").value, parseOpts());
    if (parsed.ok) renderCalendar(parsed, currentZone().zone);
  });
  byId<HTMLButtonElement>("cal-next").addEventListener("click", () => {
    calMonth += 1;
    const parsed = parseCron(byId<HTMLInputElement>("expr").value, parseOpts());
    if (parsed.ok) renderCalendar(parsed, currentZone().zone);
  });

  for (const btn of document.querySelectorAll<HTMLButtonElement>(".dialect-btn")) {
    btn.addEventListener("click", () => {
      const next = btn.dataset.dialect === "quartz" ? "quartz" : "classic";
      setDialect(next, true);
    });
  }

  byId<HTMLElement>("app-version").textContent = APP_VERSION;

  renderHistory();
  renderSaved();
  setViewMode(initialMode);
  registerServiceWorker();
}

init();
