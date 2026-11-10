# cronius

Browser-only builder and decoder for classic 5-field cron expressions (and macros like `@daily`). Everything is open on one screen, no accordions: an expression field with recent and saved chips, a short “in words” phrase box, examples and recipes with tips, a five-field builder, and a time zone, run count and share toolbar. Read a plain-language description in your UI language with interactive field highlighting, check warnings for common pitfalls (including concrete DST transition stamps and Sunday 0≡7), and see the next runs, a timeline and a monthly run calendar in the chosen time zone. The Crontab tab reviews up to 500 lines at once (with `CRON_TZ` / `TZ`, local persistence and a 24-hour overlap strip). Export to a systemd timer and service, Kubernetes CronJob, GitHub Actions, GitLab CI or ICS, plus a compatibility note and a cron→Kubernetes checklist. Popular schedules also get their own static pages at `/{lang}/{slug}/`. UI in 23 languages; MIT; version in the footer. `L` in the day-of-month field is decoded as the last day of the month (with a warning); full Quartz, Jenkins and AWS dialects, API and CLI are not supported. Expressions never leave the browser.

**Version:** 1.0.0

## Features

- Single mode, everything open (no accordions): expression input with example and recipe rows, recent chips and field tokens; field builder panel; time zone, run count and share toolbar; results (description, warnings, timeline, next runs); export panel shown for a valid expression
- Interactive highlight: the expression is shown as five field tokens; hovering or focusing a token highlights the matching part of the description and vice versa (`describeParts()` returns structured segments)
- Text field plus a five-field builder (minute, hour, day of month, month, day of week) with every / specific / range / step modes, synced both ways
- Syntax: `*`, `N`, `A-B`, `*/N`, `A-B/N`, lists; weekday `0–7` (0 and 7 are Sunday); `JAN–DEC` and `SUN–SAT` names in any case; macros `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`, `@midnight`, `@hourly` (`@reboot` has no schedule and is rejected)
- Human-readable description localized to the UI language
- Lightweight CSS timeline (24 hours, or 7 days when the next runs span more) above the table of the next 5 / 10 / 20 runs with an explicit time zone: browser local (default), UTC or a common IANA zone
- Expression warnings (heuristics, not a verdict): day-of-month OR day-of-week, impossible or skipped days (29–31), uneven `*/N` steps, midnight load, a concrete shift suggestion for exact-midnight schedules (`midnightOffset`), every-minute jobs, DST gap/overlap hours for the selected time zone
- Crontab mode: paste a whole crontab (up to 500 lines); comments, blank lines and `NAME=value` lines are skipped, the first 5 fields (or a macro) are the schedule and the rest is kept as the command; a table shows meaning or error and the next run per line; `CRON_TZ=…` / `TZ=…` lines set the zone for the jobs below them (a badge marks lines whose zone differs from the selected one), a 24-hour strip highlights hours where two or more jobs start (first 50 valid jobs), click a row to open it in single mode
- Export with copy buttons: systemd timer + companion `.service`, Kubernetes `CronJob` (`concurrencyPolicy: Forbid`, `startingDeadlineSeconds: 60`, history limits), GitHub Actions workflow (`on.schedule.cron`, UTC only), GitLab CI job with a `schedule` rule, and ICS events for the next runs (copy or download)
- Recipes: nightly backup, certbot renew, weekly logrotate, health check every 5 minutes, weekday morning report
- Local history of the last 12 expressions in `localStorage` (`cronius:history`), nothing sent anywhere
- Shareable links: `?expr=&tz=` (plus `n=` for a non-default run count); short crontabs via `?mode=crontab&text=&tz=` (up to 600 characters)
- Build-time pages for popular schedules at `/{lang}/{slug}/` in every locale (English slugs: `every-minute`, `every-2-minutes`, `every-5-minutes`, `every-10-minutes`, `every-15-minutes`, `every-30-minutes`, `every-hour`, `every-2-hours`, `every-6-hours`, `every-12-hours`, `daily-at-midnight`, `daily-at-noon`, `daily-at-3am`, `weekdays-at-9`, `every-monday-at-9`, `every-sunday`, `every-weekend`, `monthly-on-the-1st`, `yearly-on-january-1`), each with its own title, description, heading, canonical, hreflang and sitemap entry; see `src/phrase-pages.ts`
- 23 UI languages, PWA

## Scope

A practical helper, not a guarantee of identical behaviour. Cron, systemd, Kubernetes, GitHub Actions and GitLab differ in time zones, DST handling, day-of-month vs weekday rules and missed runs; the exported snippets are a best-effort starting point. Day-of-month `L` (last day) is decoded for preview and maps to systemd `~01`; other Quartz tokens (`W`, `#`, `?`) and 6-field expressions are not supported. Full Quartz, Jenkins and AWS EventBridge dialects remain on the backlog.

## Develop

```bash
npm install
npm run dev
```

```bash
npm run build
```

## License

MIT © dmosk
