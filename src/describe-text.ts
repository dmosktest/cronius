import {
  describe,
  describeParts,
  type DescribePart,
  type DescribeTemplates,
  type ParsedCron,
} from "./cron";
import { t } from "./i18n";
import type { Locale } from "./site-config";

export function intlTag(locale: Locale): string {
  if (locale === "tlh") return "en";
  return Intl.DateTimeFormat.supportedLocalesOf([locale]).length ? locale : "en";
}

function describeTemplates(locale: Locale): DescribeTemplates {
  return {
    sep: t(locale, "dSep"),
    everySecond: t(locale, "dEverySecond"),
    everyNSeconds: t(locale, "dEveryNSeconds"),
    atSecond: t(locale, "dAtSecond"),
    everyMinute: t(locale, "dEveryMinute"),
    everyNMinutes: t(locale, "dEveryNMinutes"),
    atMinute: t(locale, "dAtMinute"),
    atMinuteEveryHour: t(locale, "dAtMinuteEveryHour"),
    atTime: t(locale, "dAtTime"),
    everyNHours: t(locale, "dEveryNHours"),
    duringHour: t(locale, "dDuringHour"),
    dom: t(locale, "dDom"),
    domStep: t(locale, "dDomStep"),
    domLast: t(locale, "dDomLast"),
    domNearest: t(locale, "dDomNearest"),
    month: t(locale, "dMonth"),
    dow: t(locale, "dDow"),
    dowLast: t(locale, "dDowLast"),
    dowNth: t(locale, "dDowNth"),
    year: t(locale, "dYear"),
    orNote: t(locale, "dOrNote"),
    andNote: t(locale, "dAndNote"),
  };
}

function describeNames(locale: Locale): {
  month: (n: number) => string;
  weekday: (n: number) => string;
} {
  const tag = intlTag(locale);
  const monthFmt = new Intl.DateTimeFormat(tag, { month: "long", timeZone: "UTC" });
  const dayFmt = new Intl.DateTimeFormat(tag, { weekday: "long", timeZone: "UTC" });
  return {
    month: (n) => monthFmt.format(new Date(Date.UTC(2023, n - 1, 1))),
    weekday: (n) => dayFmt.format(new Date(Date.UTC(2023, 0, 1 + n))),
  };
}

export function describeText(parsed: ParsedCron, locale: Locale): string {
  return describe(parsed, describeTemplates(locale), describeNames(locale));
}

export function describeSegments(parsed: ParsedCron, locale: Locale): DescribePart[] {
  return describeParts(parsed, describeTemplates(locale), describeNames(locale));
}
