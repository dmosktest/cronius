# cronius

Browser-only builder and decoder for classic 5-field cron and Quartz 6-field expressions (and macros like `@daily`). Everything is open on one screen, no accordions: a Classic/Quartz dialect switcher, an expression field with recent and saved chips, a short “in words” phrase box, examples and recipes with tips, a field builder (six fields in Quartz, including seconds), and a time zone, run count and share toolbar. Read a plain-language description in your UI language with interactive field highlighting, check warnings for common pitfalls (including concrete DST transition stamps and Sunday 0≡7), and see the next runs, a timeline and a monthly run calendar in the chosen time zone. The Crontab tab reviews up to 500 lines at once (with `CRON_TZ` / `TZ`, local persistence and a 24-hour overlap strip). Export to a systemd timer and service, Kubernetes CronJob, GitHub Actions, GitLab CI or ICS (from Quartz: best-effort 5-field snippets), plus a compatibility note and a cron→Kubernetes checklist. Popular schedules also get their own static pages at `/{lang}/{slug}/`. UI in 23 languages; MIT; version in the footer. Jenkins and AWS EventBridge are not separate modes; there is no API or CLI. Expressions never leave the browser.

**Version:** 1.2.0

## Features

- Single mode, everything open (no accordions): Classic/Quartz switcher (`?dialect=quartz`, `localStorage` `cronius:dialect`), expression input with example and recipe rows, recent chips and field tokens; field builder panel; time zone, run count and share toolbar; results (description, warnings, timeline, next runs); export panel shown for a valid expression
- Interactive highlight: the expression is shown as field tokens for the active dialect; hovering or focusing a token highlights the matching part of the description and vice versa (`describeParts()` returns structured segments)
- Text field plus a builder (five classic fields, or six Quartz fields with seconds) with every / specific / range / step modes, synced both ways; switching dialect converts the expression best-effort
- Classic syntax: `*`, `N`, `A-B`, `*/N`, `A-B/N`, lists; weekday `0–7` (0 and 7 are Sunday); `JAN–DEC` and `SUN–SAT`; macros `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`, `@midnight`, `@hourly`. Quartz: 6 fields with seconds plus an optional 7th year (1970–2099), `L` / `W` / `#` / `?`, weekday `1–7` (Sunday = 1; classic `0`/`7` convert to `1`); one of day-of-month / day-of-week must be `?`
- Human-readable description localized to the UI language
- Lightweight CSS timeline (24 hours, or 7 days when the next runs span more) above the table of the next 5 / 10 / 20 runs with an explicit time zone: browser local (default), UTC or a common IANA zone
- Expression warnings (heuristics, not a verdict): day-of-month OR day-of-week (classic), impossible or skipped days (29–31), uneven `*/N` steps, midnight load, a concrete shift suggestion for exact-midnight schedules (`midnightOffset`), every-minute jobs, DST gap/overlap hours, classic `L` warning, `quartzExport` note for 5-field exports
- Crontab mode: paste a whole crontab (up to 500 lines); comments, blank lines and `NAME=value` lines are skipped; `CRON_TZ=…` / `TZ=…` lines set the zone for the jobs below them; a 24-hour strip highlights hours where two or more jobs start; click a row to open it in single mode
- Export with copy buttons: systemd timer + companion `.service`, Kubernetes `CronJob`, GitHub Actions workflow, GitLab CI job, and ICS events for the next runs
- Recipes, local history (`cronius:history`), saved schedules (`cronius:saved`), shareable links `?expr=&tz=` / `?dialect=quartz`
- Build-time pages for popular schedules at `/{lang}/{slug}/` in every locale
- 23 UI languages, PWA

## Scope

A practical helper, not a guarantee of identical behaviour. Cron, systemd, Kubernetes, GitHub Actions and GitLab differ in time zones, DST handling, day-of-month vs weekday rules and missed runs; the exported snippets are a best-effort starting point. Quartz mode is a first-class dialect switcher; exports from Quartz stay best-effort 5-field. Jenkins and AWS EventBridge dialects remain on the backlog.

## Develop

```bash
npm install
npm run dev
```

```bash
npm run build
```

## License

MIT
