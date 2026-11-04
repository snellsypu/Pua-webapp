# Daily Loop — App Spec

A calendar app that tracks **habits** and **appointments** alongside **reminders**, with
**morning overviews** (weather + today's plan) and **evening reviews** (today's recap +
tomorrow's preview). Public URL: https://daily-loop-8--68ipsq2d.preview.emergentagent.com

## Stack & conventions
- FastAPI + motor/Mongo (backend/, port 8001), Vite + React 19 + TS strict + Tailwind v4 +
  shadcn base-nova (frontend/, port 3000). All routes on `api_router` under `/api`; frontend
  uses `apiGet/apiPost/...` from `src/lib/api.ts` via relative paths.
- Pydantic models: `backend/models/planner.py` + `backend/models/weather.py`; TS mirrors:
  `frontend/src/lib/types.ts` (camelCase field names on both sides — keep in sync).
- "Today" is **server-anchored**: `lib/dates.today_iso()` (UTC). The frontend reads the date
  back from `GET /api/overview?offset=0` — never computes today itself.

## Data model (Mongo, string uuid4 ids)
- `settings` (singleton id="app"): `home` {name, latitude, longitude, country?}, `units`
  (celsius|fahrenheit).
- `appointments`: title, date, startTime, endTime?, location, notes.
- `habits` + `habit_completions` (habitId+date unique): mode `streak` (consecutive-day
  streak, survives "not yet done today" if yesterday done) or `monthly` (count vs
  monthlyTarget this month). Stats (streak/bestStreak/monthCount/doneToday) computed
  server-side in `GET /api/habits`.
- `meals`: one per (date, slot) — breakfast|lunch|dinner|snack; POST upserts the slot.
- `shopping_items`: name, checked; `POST /shopping/clear-checked` bulk-clears bought items.
- `reminders`: title, date, time, done.

## Weather (Open-Meteo, no API key)
- `GET /api/weather?lat&lon&units` → bundle: now + 8 location-local hourly points + 3 daily
  entries (timezone=auto). In-memory cache 15 min (`backend/lib/weather.py`).
- `GET /api/geocode?q=` (Open-Meteo geocoding) and `/api/geocode/reverse?lat&lon`
  (Nominatim, throttled 1 s, UA-set, cached 10 min).
- Frontend resolution: home city from settings by default; the locate button on any weather
  card uses browser geolocation + reverse geocode for "away" mode (session-only).
- **Match weather days by date, not index** — the location's local date can lag the
  server-UTC date (days[0] may be "yesterday" in the location's tz).

## Key flows
- Home `/` — "My Day" widget dashboard (weather, up next, agenda, habit check-offs, meals,
  reminders, shopping peek) + localStorage-persisted compact **widget view** toggle.
- `/calendar` — month grid (dots: appt count, habit x/y, meals); day → sheet with
  per-date habit toggling, editable meals, reminders, add/edit/delete appointments.
- `/habits` — create/edit/delete (name, emoji, mode, monthly target), today check-off,
  28-day heat strip per habit.
- `/planner` — day navigation + date picker; 4 meal slots with inline edit; meal → shopping
  list button; full shopping list management.
- `/morning` — amber briefing: hero weather + hourly, umbrella tip when precip ≥ 40 %,
  schedule, habit intentions, reminders (quick add), meals.
- `/evening` — violet review: scorecard badges, today recap, tomorrow preview (weather,
  appointments, meals, reminders + quick add for tomorrow).
- `/settings` — home city search/detect, light/dark/system theme (next-themes), units.
- **Create FAB** (`components/CreateFab.tsx`, mounted in AppShell on every page) — bottom-right
  "+" opens a menu: Reminder / Habit / Appointment, each opening its dialog with the date
  pre-filled from the server's today. Toaster is offset upward (bottom 96px) so toasts never
  cover it. Habit dialog is shared (`components/HabitDialog.tsx`) with the Habits page.
- `/health` — **Samsung Health import**. Samsung has NO public web/REST API (its data SDK is
  Android-native only), so integration = user-initiated export: Samsung Health → Settings →
  Download personal data → upload ZIP. `POST /api/health/import` (multipart, `apiUpload` in
  lib/api.ts) parses CSV/JSON/XLSX entries by filename fragment (food_intake/nutrition,
  exercise, sleep_combined/sleep), skips the "com.samsung…" metadata line above CSV headers,
  converts ms durations to minutes, upserts by deterministic sha256 `eventId` (re-import =
  no duplicates). Limits: 50 MB upload, 150 MB uncompressed, 200 files; non-ZIP → 400; no
  matching records → 400. `GET /api/health/events?from&to` (by display `date`; sleep uses
  the wake-up day), `DELETE /api/health/events` clears all imported data. Page shows the
  last 14 days grouped by day with kcal-eaten totals.

- **Running distance** — habits with `tracksDistance` (Habit dialog checkbox; seed: "Morning
  run"). Checking one off (not yet done) opens a "How far?" prompt → `POST /api/habits/{id}/log`
  {distanceKm, date?} (upserts the completion; "Just mark done" = distanceKm null). Totals in
  `GET /api/habits`: todayKm/weekKm (Mon→today)/monthKm/totalKm, always km on the wire. Per day,
  a typed distance wins; otherwise Samsung Health exercise events whose title matches /run/i
  with distanceKm (parser: `distance` column metres→km; numeric exercise_type codes mapped,
  1002=Running) fill in — no double counting. Toggle-off deletes the completion + its km.
  UI converts with `lib/units.ts` per `settings.distanceUnit` (km|mi, Settings page).
- **Routines** (`/api/routines`) — exactly two: `morning` (default 07:00) and `bedtime` (22:00),
  each with editable steps (ids preserved on edit so today's ticks survive), daily-reset checks in
  `routine_checks` (kind+date, doneStepIds, complete), and a completion streak (days where every
  step was ticked; reuses habits `_streaks`). `POST /routines/{kind}/steps/{stepId}/toggle`,
  `PUT /routines/{kind}` {time?, notify?, steps?}. Cards: Today (both), /morning, /evening.
- **Push notifications (Web Push/VAPID, pywebpush 2.5.0)** — `public/sw.js` shows pushes +
  focuses/opens the app on tap. Settings → Routine notifications: enable (permission from a
  click → subscribe → `POST /api/push/subscribe`; also saves the browser timezone to
  settings.timezone and turns both routines' notify on), send test (`POST /api/push/test`), turn
  off, per-routine toggles. Cron `.emergent/crons.yml` `routine-reminders` every 15 min →
  `POST /api/cron/routines` (Bearer WEBHOOK_CRON_SECRET, constant-time compare, 401/400,
  idempotent on X-Webhook-Id via `cron_runs` TTL 7d, acks 202 then background). Sends a
  routine's push when its local time passed within the last 60 min, once per local day
  (`lastNotifiedDate` claimed atomically), skipped if the routine is already complete. 404/410
  subscriptions are deleted. Env: VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT,
  WEBHOOK_CRON_SECRET (app-generated, in backend/.env). iOS needs the installed home-screen app.
- Settings PUT is now **partial** (only sent fields change; explicit home:null clears).

## Health data model
- `health_events`: eventId (unique), type (nutrition|exercise|sleep), date, start, end,
  title, durationMin, distanceKm, calories, proteinG, carbsG, fatG, stage, score, sourceFile.

## Seed / demo data (`backend/seed.py`, idempotent, skips if habits exist)
Home = New York; 4 habits (Read 20 pages 📚, Morning run 🏃 streaks; Meditate 🧘; Gym 🏋️
monthly target 12) with completions in the past days; appointments today (Team standup
09:30, Dentist 14:00), tomorrow (Project review 10:00, Dinner with Maya 19:00), +3d train;
meals today + tomorrow; reminders (Call the plumber today 16:00, Pack gym bag tomorrow,
Book train tickets +2d); 5 shopping items (1 bought). Health (`seed_health()`, own guard,
runs even on an already-seeded DB): last night's sleep (7h35m, score 88), yesterday's
Running 37 min/320 kcal, yesterday's Oatmeal 420 kcal + Chicken salad 560 kcal.

## Auth
None — single-user local app, no login, no credentials (see memory/test_credentials.md).
