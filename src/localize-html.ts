import { t, type MessageKey } from "./i18n";
import { NOT_FOUND_COPY } from "./notfound-messages";
import {
  PHRASES,
  phraseCopy,
  phrasePath,
  phraseText,
  phraseUrl,
  type PhraseDef,
} from "./phrase-pages";
import {
  buildAppJsonLd,
  buildFaqJsonLd,
  getSeoCopy,
  renderSeoHtml,
} from "./seo-content";
import {
  ALLOW_INDEX,
  LOCALES,
  localeFlagHtml,
  LOCALE_NATIVE_NAME,
  ROBOTS_META,
  SITE_ORIGIN,
  X_DEFAULT_LOCALE,
  type Locale,
  isRtlLocale,
  localePath,
  localeUrl,
  ogLocale,
  ogLocaleAlternates,
} from "./site-config";

function replaceTagContent(
  html: string,
  tag: string,
  id: string | null,
  content: string,
): string {
  const idAttr = id ? `[^>]*\\bid=["']${id}["'][^>]*` : "";
  const re = new RegExp(`(<${tag}${idAttr}>)([\\s\\S]*?)(</${tag}>)`, "i");
  return html.replace(re, `$1${content}$3`);
}

function replaceMetaByName(html: string, name: string, content: string): string {
  const re = new RegExp(
    `(<meta\\s+[^>]*name=["']${name}["'][^>]*content=)(["'])(.*?)\\2`,
    "i",
  );
  if (re.test(html)) return html.replace(re, `$1$2${content}$2`);
  const re2 = new RegExp(
    `(<meta\\s+[^>]*content=)(["'])(.*?)\\2([^>]*name=["']${name}["'])`,
    "i",
  );
  return html.replace(re2, `$1$2${content}$2$4`);
}

function replaceMetaByProperty(
  html: string,
  property: string,
  content: string,
): string {
  const re = new RegExp(
    `(<meta\\s+[^>]*property=["']${property}["'][^>]*content=)(["'])(.*?)\\2`,
    "i",
  );
  if (re.test(html)) return html.replace(re, `$1$2${content}$2`);
  const re2 = new RegExp(
    `(<meta\\s+[^>]*content=)(["'])(.*?)\\2([^>]*property=["']${property}["'])`,
    "i",
  );
  return html.replace(re2, `$1$2${content}$2$4`);
}

function pageHref(loc: Locale, phrase?: PhraseDef): string {
  return phrase ? phrasePath(loc, phrase.slug) : localePath(loc);
}

function pageUrl(loc: Locale, phrase?: PhraseDef): string {
  return phrase ? phraseUrl(loc, phrase.slug) : localeUrl(loc);
}

function hreflangBlock(phrase?: PhraseDef): string {
  const links = LOCALES.map(
    (loc) =>
      `    <link rel="alternate" hreflang="${loc}" href="${pageUrl(loc, phrase)}" />`,
  );
  links.push(
    `    <link rel="alternate" hreflang="x-default" href="${pageUrl(X_DEFAULT_LOCALE, phrase)}" />`,
  );
  return links.join("\n");
}

function langOptionHtml(loc: Locale, current: Locale, phrase?: PhraseDef): string {
  const active = loc === current ? " active" : "";
  const aria =
    loc === current ? ' aria-current="page"' : ' aria-current="false"';
  return `<a href="${pageHref(loc, phrase)}" class="lang-option${active}" id="lang-${loc}" data-locale="${loc}" hreflang="${loc}" lang="${loc}"${aria}>${localeFlagHtml(loc)}<span class="lang-name">${LOCALE_NATIVE_NAME[loc]}</span></a>`;
}

function phraseNavHtml(locale: Locale, current?: PhraseDef): string {
  const items = PHRASES.map((phrase) => {
    const label = phraseText(locale, phrase);
    const state =
      phrase.slug === current?.slug ? ' aria-current="page"' : "";
    return `<li><a href="${phrasePath(locale, phrase.slug)}"${state}><code>${phrase.expr}</code> ${label}</a></li>`;
  });
  return `
        <h2 id="phrase-nav-title">${t(locale, "phrasesTitle")}</h2>
        <ul>${items.join("")}</ul>
      `;
}

function langSwitcherHtml(
  current: Locale,
  ariaLabel: string,
  phrase?: PhraseDef,
): string {
  const options = LOCALES.map((loc) => langOptionHtml(loc, current, phrase)).join(
    "\n            ",
  );
  return `<details class="lang">
          <summary class="lang-summary" aria-label="${ariaLabel}">
            ${localeFlagHtml(current)}
            <span class="lang-current-name">${LOCALE_NATIVE_NAME[current]}</span>
          </summary>
          <div class="lang-menu" role="list">
            ${options}
          </div>
        </details>`;
}

function applyDataI18n(html: string, locale: Locale): string {
  return html
    .replace(
      /<(\w+)(\s[^>]*?\bdata-i18n="(\w+)"[^>]*)>[\s\S]*?<\/\1>/g,
      (_m, tag: string, attrs: string, key: string) =>
        `<${tag}${attrs}>${t(locale, key as MessageKey)}</${tag}>`,
    )
    .replace(
      /<(\w+)(\s[^>]*?\bdata-i18n-html="(\w+)"[^>]*)>[\s\S]*?<\/\1>/g,
      (_m, tag: string, attrs: string, key: string) =>
        `<${tag}${attrs}>${t(locale, key as MessageKey)}</${tag}>`,
    )
    .replace(
      /<(\w+)(\s[^>]*?\bdata-i18n-aria="(\w+)"[^>]*)>/g,
      (_m, tag: string, attrs: string, key: string) =>
        `<${tag}${attrs.replace(/aria-label="[^"]*"/, `aria-label="${t(locale, key as MessageKey)}"`)}>`,
    );
}

function applyHtmlLangDir(html: string, locale: Locale): string {
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, `<html lang="${locale}" dir="${dir}">`);
  }
  return html;
}

export function localizeIndexHtml(
  html: string,
  locale: Locale,
  phrase?: PhraseDef,
): string {
  const seoCopy = getSeoCopy(locale);
  const copy = phrase ? { ...seoCopy, ...phraseCopy(locale, phrase) } : seoCopy;
  const url = pageUrl(locale, phrase);
  let out = applyHtmlLangDir(html, locale);

  out = replaceTagContent(out, "title", null, copy.title);
  out = out.replace(
    /<link\s+rel=["']manifest["'][^>]*>/i,
    `<link rel="manifest" href="${localePath(locale)}manifest.webmanifest" />`,
  );
  out = replaceMetaByName(out, "robots", ROBOTS_META);
  out = replaceMetaByName(out, "description", copy.description);
  out = out.replace(/\s*<meta\s+[^>]*name=["']keywords["'][^>]*>/i, "");
  out = out.replace(
    /<link\s+rel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${url}" />`,
  );
  out = out.replace(
    /(?:\s*<link\s+rel=["']alternate["']\s+hreflang=["'][^"']+["'][^>]*>)+/i,
    `\n${hreflangBlock(phrase)}`,
  );
  out = replaceMetaByProperty(out, "og:url", url);
  out = replaceMetaByProperty(out, "og:title", copy.title);
  out = replaceMetaByProperty(out, "og:description", copy.description);
  out = replaceMetaByProperty(out, "og:locale", ogLocale(locale));
  out = out.replace(
    /(?:\s*<meta\s+property=["']og:locale:alternate["'][^>]*>)+/i,
    ogLocaleAlternates(locale)
      .map(
        (alt) =>
          `\n    <meta property="og:locale:alternate" content="${alt}" />`,
      )
      .join(""),
  );

  out = replaceTagContent(out, "h1", "heading", copy.heading);
  out = replaceTagContent(
    out,
    "p",
    "lead",
    phrase ? copy.description : t(locale, "heroLead"),
  );
  if (phrase) {
    out = out.replace(
      /(<input\b[^>]*\bid=["']expr["'])/i,
      `$1 value="${phrase.expr}"`,
    );
  }
  out = out.replace(
    /(<p class=["']noscript["'][^>]*>)([\s\S]*?)(<\/p>)/i,
    `$1${t(locale, "noscript")}$3`,
  );

  out = replaceTagContent(out, "article", "seo-root", renderSeoHtml(locale));
  out = replaceTagContent(out, "nav", "phrase-nav", phraseNavHtml(locale, phrase));
  out = applyDataI18n(out, locale);

  out = out.replace(
    /<details[^>]*class=["']lang["'][^>]*>[\s\S]*?<\/details>/i,
    langSwitcherHtml(locale, t(locale, "langSwitch"), phrase),
  );

  out = out.replace(
    /<script type=["']application\/ld\+json["'] id=["']ld-app["']>[\s\S]*?<\/script>/i,
    `<script type="application/ld+json" id="ld-app">${JSON.stringify(buildAppJsonLd(locale, url, phrase ? copy.description : undefined))}</script>`,
  );
  out = out.replace(
    /<script type=["']application\/ld\+json["'] id=["']ld-faq["']>[\s\S]*?<\/script>/i,
    `<script type="application/ld+json" id="ld-faq">${JSON.stringify(buildFaqJsonLd(locale))}</script>`,
  );

  return out;
}

export function renderNotFoundHtml(locale: Locale): string {
  const copy = NOT_FOUND_COPY[locale] ?? NOT_FOUND_COPY.en;
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>${copy.title}</title>
    <meta name="robots" content="noindex, nofollow" />
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: "Segoe UI", sans-serif;
        background: #17110c;
        color: #f6eee6;
      }
      main {
        text-align: center;
        padding: 2rem;
      }
      a {
        color: #f0852a;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>404</h1>
      <p>${copy.message}</p>
      <p><a href="${localePath(locale)}">${copy.home}</a></p>
    </main>
  </body>
</html>
`;
}

function sitemapEntries(phrase?: PhraseDef): string[] {
  const alts = [
    ...LOCALES.map(
      (loc) =>
        `    <xhtml:link rel="alternate" hreflang="${loc}" href="${pageUrl(loc, phrase)}"/>`,
    ),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(X_DEFAULT_LOCALE, phrase)}"/>`,
  ].join("\n");

  return LOCALES.map(
    (loc) => `  <url>
    <loc>${pageUrl(loc, phrase)}</loc>
${alts}
  </url>`,
  );
}

export function renderSitemapXml(): string {
  const urls = [
    ...sitemapEntries(),
    ...PHRASES.flatMap((phrase) => sitemapEntries(phrase)),
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

export function renderRobotsTxt(): string {
  const disallow = ALLOW_INDEX ? "" : "Disallow: /";
  return `User-agent: *
${disallow}
Sitemap: ${SITE_ORIGIN}/sitemap.xml
`.replace(/\n{3,}/g, "\n\n");
}
