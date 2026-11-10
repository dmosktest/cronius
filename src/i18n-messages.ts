import type { MessageKey } from "./i18n-keys";
import type { Locale } from "./site-config";
import { ui as ui_ru } from "./locales/ru";
import { ui as ui_en } from "./locales/en";
import { ui as ui_zh } from "./locales/zh";
import { ui as ui_es } from "./locales/es";
import { ui as ui_hi } from "./locales/hi";
import { ui as ui_ar } from "./locales/ar";
import { ui as ui_bn } from "./locales/bn";
import { ui as ui_pt } from "./locales/pt";
import { ui as ui_fr } from "./locales/fr";
import { ui as ui_de } from "./locales/de";
import { ui as ui_ja } from "./locales/ja";
import { ui as ui_id } from "./locales/id";
import { ui as ui_pa } from "./locales/pa";
import { ui as ui_jv } from "./locales/jv";
import { ui as ui_te } from "./locales/te";
import { ui as ui_tr } from "./locales/tr";
import { ui as ui_ko } from "./locales/ko";
import { ui as ui_mr } from "./locales/mr";
import { ui as ui_vi } from "./locales/vi";
import { ui as ui_ta } from "./locales/ta";
import { ui as ui_it } from "./locales/it";
import { ui as ui_fa } from "./locales/fa";
import { ui as ui_tlh } from "./locales/tlh";

export const UI_MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  ru: ui_ru,
  en: ui_en,
  zh: ui_zh,
  es: ui_es,
  hi: ui_hi,
  ar: ui_ar,
  bn: ui_bn,
  pt: ui_pt,
  fr: ui_fr,
  de: ui_de,
  ja: ui_ja,
  id: ui_id,
  pa: ui_pa,
  jv: ui_jv,
  te: ui_te,
  tr: ui_tr,
  ko: ui_ko,
  mr: ui_mr,
  vi: ui_vi,
  ta: ui_ta,
  it: ui_it,
  fa: ui_fa,
  tlh: ui_tlh,
};
