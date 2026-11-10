import type { Locale } from "./site-config";
import { seo as seo_ru } from "./locales/ru";
import { seo as seo_en } from "./locales/en";
import { seo as seo_zh } from "./locales/zh";
import { seo as seo_es } from "./locales/es";
import { seo as seo_hi } from "./locales/hi";
import { seo as seo_ar } from "./locales/ar";
import { seo as seo_bn } from "./locales/bn";
import { seo as seo_pt } from "./locales/pt";
import { seo as seo_fr } from "./locales/fr";
import { seo as seo_de } from "./locales/de";
import { seo as seo_ja } from "./locales/ja";
import { seo as seo_id } from "./locales/id";
import { seo as seo_pa } from "./locales/pa";
import { seo as seo_jv } from "./locales/jv";
import { seo as seo_te } from "./locales/te";
import { seo as seo_tr } from "./locales/tr";
import { seo as seo_ko } from "./locales/ko";
import { seo as seo_mr } from "./locales/mr";
import { seo as seo_vi } from "./locales/vi";
import { seo as seo_ta } from "./locales/ta";
import { seo as seo_it } from "./locales/it";
import { seo as seo_fa } from "./locales/fa";
import { seo as seo_tlh } from "./locales/tlh";

export type SeoFaq = {
  q: string;
  a: string;
};

export type SeoCopy = {
  title: string;
  description: string;
  heading: string;
  leadHtml: string;
  benefitsTitle: string;
  benefits: string[];
  howTitle: string;
  howSteps: string[];
  strongTitle: string;
  strongLead: string;
  strongTips: string[];
  usesTitle: string;
  uses: string[];
  faqTitle: string;
  faq: SeoFaq[];
  appName: string;
  tipsLabel: string;
};

export const SEO_COPY: Record<Locale, SeoCopy> = {
  ru: seo_ru,
  en: seo_en,
  zh: seo_zh,
  es: seo_es,
  hi: seo_hi,
  ar: seo_ar,
  bn: seo_bn,
  pt: seo_pt,
  fr: seo_fr,
  de: seo_de,
  ja: seo_ja,
  id: seo_id,
  pa: seo_pa,
  jv: seo_jv,
  te: seo_te,
  tr: seo_tr,
  ko: seo_ko,
  mr: seo_mr,
  vi: seo_vi,
  ta: seo_ta,
  it: seo_it,
  fa: seo_fa,
  tlh: seo_tlh,
};
