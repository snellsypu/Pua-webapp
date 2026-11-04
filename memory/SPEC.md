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

## Seed / demo data (`backend/seed.py`, idempotent, skips if habits exist)
Home = New York; 4 habits (Read 20 pages 📚, Morning run 🏃 streaks; Meditate 🧘; Gym 🏋️
monthly target 12) with completions in the past days; appointments today (Team standup
09:30, Dentist 14:00), tomorrow (Project review 10:00, Dinner with Maya 19:00), +3d train;
meals today + tomorrow; reminders (Call the plumber today 16:00, Pack gym bag tomorrow,
Book train tickets +2d); 5 shopping items (1 bought).

## Auth
None — single-user local app, no login, no credentials (see memory/test_credentials.md).
