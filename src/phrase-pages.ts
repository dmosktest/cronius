import { parseCron } from "./cron";
import { describeText } from "./describe-text";
import { t } from "./i18n";
import { SITE_ORIGIN, type Locale } from "./site-config";

export type PhraseDef = {
  slug: string;
  expr: string;
};

export const PHRASES: readonly PhraseDef[] = [
  { slug: "every-minute", expr: "* * * * *" },
  { slug: "every-2-minutes", expr: "*/2 * * * *" },
  { slug: "every-5-minutes", expr: "*/5 * * * *" },
  { slug: "every-10-minutes", expr: "*/10 * * * *" },
  { slug: "every-15-minutes", expr: "*/15 * * * *" },
  { slug: "every-30-minutes", expr: "*/30 * * * *" },
  { slug: "every-hour", expr: "0 * * * *" },
  { slug: "every-2-hours", expr: "0 */2 * * *" },
  { slug: "every-6-hours", expr: "0 */6 * * *" },
  { slug: "every-12-hours", expr: "0 */12 * * *" },
  { slug: "daily-at-midnight", expr: "0 0 * * *" },
  { slug: "daily-at-noon", expr: "0 12 * * *" },
  { slug: "daily-at-3am", expr: "0 3 * * *" },
  { slug: "weekdays-at-9", expr: "0 9 * * 1-5" },
  { slug: "every-monday-at-9", expr: "0 9 * * 1" },
  { slug: "every-sunday", expr: "0 0 * * 0" },
  { slug: "every-weekend", expr: "0 0 * * 6,0" },
  { slug: "monthly-on-the-1st", expr: "0 0 1 * *" },
  { slug: "yearly-on-january-1", expr: "0 0 1 1 *" },
];

export function findPhrase(slug: string): PhraseDef | undefined {
  return PHRASES.find((phrase) => phrase.slug === slug);
}

export function phrasePath(locale: Locale, slug: string): string {
  return `/${locale}/${slug}/`;
}

export function phraseUrl(locale: Locale, slug: string): string {
  return `${SITE_ORIGIN}${phrasePath(locale, slug)}`;
}

export function phraseText(locale: Locale, phrase: PhraseDef): string {
  const parsed = parseCron(phrase.expr);
  if (!parsed.ok) throw new Error(`Invalid phrase expression: ${phrase.expr}`);
  return describeText(parsed, locale);
}

export type PhraseCopy = {
  title: string;
  description: string;
  heading: string;
};

export function phraseCopy(locale: Locale, phrase: PhraseDef): PhraseCopy {
  const text = phraseText(locale, phrase);
  return {
    title: `${text}: cron ${phrase.expr} | cronius`,
    description: t(locale, "phraseDesc")
      .replace("{expr}", phrase.expr)
      .replace("{phrase}", text),
    heading: text,
  };
}
