# PUA (Personal Uplink Assistant) — App Spec

App name: **PUA — Personal Uplink Assistant** (renamed from Daily Loop; title, logo, manifest, push titles).

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
- `/overview` (pages/Overview.tsx) — ONE overview that follows the clock: `GET /api/daypart`
  → {part morning|evening, localTime, date, reviewTime} in settings.timezone; part = evening
  once localTime ≥ `settings.reviewTime` (default 18:00, editable in Settings → Overview &
  wake-up; refetched every minute). Tabs "Today's briefing" / "Tomorrow's review";
  `?view=today|tomorrow` pins a view. `/morning` and `/evening` redirect to the pinned views.
  Header nav icon + Home/widget link swap sunrise/moon by daypart.
  - Today view (pages/Morning.tsx): amber briefing: hero weather + hourly, umbrella tip when
    precip ≥ 40 %, schedule, morning routine, habit intentions, reminders (quick add), meals.
  - Tomorrow view (pages/Evening.tsx): violet review: scorecard badges, bedtime routine, today
    recap, tomorrow preview (weather, appointments, meals, reminders + quick add).
- **Wake-up read** (`/overview?wake=1`, components/WakeBanner.tsx): `GET /api/voice/wake` →
  {text} = "Good morning! <home weather>. First/Next step of your morning routine: <first open
  step>." Shown in a banner and read aloud via speechSynthesis; if the browser blocks un-tapped
  speech, a "Tap to hear your morning" button. Three triggers, once per day (localStorage
  `pua:last-wake`):
  1. Wake link (Settings shows/copies it) for phone automations.
  2. "Read on first open" (device-local `pua:wake-first-open`): the first app open within 3 h
     after `settings.wakeTime` redirects to ?wake=1 — for Samsung Modes & Routines
     "Selected alarm dismissed → Open an app → PUA" (PWA on home screen).
  3. Wake-up push: `settings.wakeNotify` + `wakeTime` (default 07:00, off); sent by the same
     cron (now every 5 min) via `_maybe_wake`, claimed per day with
     `settings.lastWakeNotifiedDate`; tap opens /overview?wake=1. Routine pushes now open
     /overview?view=today|tomorrow.
- **Weekend wake**: `settings.weekendWakeTime` (null = same as weekdays) — `lib/dates.wake_time_for`
  picks it on Sat/Sun for the wake push and the first-open window (`DayPart.wakeTime`).
- **Bedtime read-out** (`/overview?bedtime=1`, WakeBanner kind="bedtime", `GET /api/voice/bedtime`):
  tomorrow's weather, first appointment (+N more) with commute from home, meals, "Sleep well!".
  Triggers: the bedtime routine push (now opens /overview?bedtime=1) and the optional device-local
  "read on first open" (`pua:bedtime-first-open`, within 3 h after the bedtime routine time,
  `DayPart.bedtimeTime`; once per night via `pua:last-bedtime`).
- **Commute** (`lib/travel.py`, OSM Nominatim search + FOSSGIS OSRM routed-car/foot/bike, no key,
  identifying UA, app-wide 1 req/s lock, Mongo caches `geocode_cache` / `route_cache`): the wake
  read-out adds the next appointment today (startTime ≥ now) and "It's about N minutes by car
  from home — leave by HH:MM" (start − travel − 10 min buffer; "leave now" if past). Start point:
  `settings.homeAddress` (Settings → Commute times, `GET /api/address/search?q=`, explicit
  submit only); no address → hint to add one; unfindable place → says so. Mode:
  `settings.travelMode` (car|foot|bike, default car). **Premium** (`premiumVoice` switch, now
  labelled "Premium"): per-appointment `Appointment.travelMode` (dialog select, null = default;
  ignored server-side without Premium) and `settings.liveLocation` (wake read-out sends the
  phone's lat/lon → `/voice/wake?lat&lon`). OSM attribution shown on banner + settings card.
  Seeded locations ("Office", "Dr. Lee, Maple St") are not geocodable — real addresses are.
- **Address picking** (AppointmentDialog): Location field + "Find" (explicit submit / Enter —
  Nominatim forbids autocomplete) → `GET /api/address/search` → pick a result → location text =
  first 3 parts of the name and `Appointment.locationLat/locationLon` saved; a pin icon shows it.
  Typing again clears the coords (sent as null). `travel.commute` uses the coords when present.
- **Rain-aware travel** (`briefing.plan_commute` / `rain_likely`): when the mode is foot/bike and
  heavy rain is likely (that hour's precip ≥ 60 % if within the 8-hour hourly window, else the
  day's ≥ 70 % with a heavy-rain code 63/65/66/67/81/82/95/96/99, at the home city), the
  read-outs add "you might drive instead: about N minutes, leave by …".
- **Leave-now alerts** (`settings.leaveAlerts`, needs `homeAddress`; Settings → Commute times):
  the 5-min cron (`push._leave_alerts`) checks today's appointments with a location starting in
  the next 4 h and pushes "Time to leave" ~5 min before the leave-by time (from home; rain
  advice included), once per appointment per day (`appointments.leaveAlertDate`).
- **Public transport** (`travelMode` "transit", Google Routes API computeRoutes, TRANSIT with
  arrivalTime = appointment start in settings.timezone → UTC, field mask routes.duration, key
  `GOOGLE_MAPS_API_KEY` in backend/.env, cached per 15-min slot in route_cache). Offered in the
  mode selects only when `AppSettings.transitAvailable` (read-only, key present); without a key a
  stored "transit" falls back to car. No route → "I couldn't find a public transport route".
- **Leave countdown** (Today, components/LeaveCountdown.tsx): `GET /api/commute/next[?lat&lon]`
  → `CommuteNext` for the next appointment today within 6 h that has a travel time (null
  otherwise); client ticks `leaveInMin` down every second (mm:ss under 10 min, rose ≤ 5 min,
  "Leave now"), refetch every 5 min; rain → driving alternative line.
- **Pin appointment places** (Settings → Commute times, components/PinLocations.tsx):
  "Find matches" → `GET /api/commute/unpinned` → upcoming 60-day appointments with text-only
  locations + best Nominatim match near home (≤ 80 km, ≤ 8 distinct places per tap) → "Pin"
  saves locationLat/Lon; no match → "Edit" opens the appointment dialog (Find there).
- **Run weather** (components/RunWeather.tsx, on distance-tracking habits not done today):
  max precip of this + next hour and wind/gusts (Open-Meteo `wind_speed_10m`/`wind_gusts_10m`,
  km/h; shown in mph when distance unit is mi) → verdict chip (rain ≥ 60 % / wind ≥ 35 or
  gusts ≥ 55 → warn; rain ≥ 30 % → showers; else "Good time for a run").
- **Run time planner** (`lib/runplan.py`, `GET /api/run-plan` → `RunPlan | null`): first
  tracksDistance habit not done today; full hourly forecast for the home city
  (`weather.get_hourly_days`); slots from max(now+10 min, today's wake time) to bedtime routine
  − 1 h − 45 min, skipping 45-min runs that overlap appointments (30 min before / 15 after,
  default 60-min length); score = rain%·1.2 + (wind−15)·1.5 + |temp−12 °C|·0.8 + dark 25 +
  lateness. Shown under RunWeather ("Best time today: 12:15 PM · dry, light wind, free before
  your 2 PM Dentist · 9°") with a "Remind me" toggle → `settings.runReminders`; the cron
  (`push._run_reminder`) pushes once a day between remindAt (time − 15 min) and the start,
  claimed via `settings.lastRunReminderDate`. Null if no home city / no free slot / done.
- **Pin on create (voice)**: after a voice appointment with a location saves, the dialog moves
  to phase "pin": `/address/search` top 3 matches, spoken "Shall I pin X on the map? Say yes, or
  skip." — "yes"/"pin" pins match 1 (PUT locationLat/Lon), "skip"/"no" closes; tap any match or
  Skip. No match → message + Done; search unavailable (Nominatim 429/502) → "map search is
  busy — pin it later from Settings" (`voice-pin-busy`).
- **Hands-free routine** (components/HandsFreeRoutine.tsx): "Hands-free" button on routine cards
  (when not complete) and on the read-out banners. Speaks each open step, listens (browser
  recognition) for done/next → toggles the step; skip; repeat; stop. Ends with the streak.
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
  `PUT /routines/{kind}` {time?, notify?, steps?}. Cards: Today (both), overview today view (morning), tomorrow view (bedtime).
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

- **Voice** (`components/VoiceAssistant.tsx`, mic button left of the + FAB, on every page).
  Flow: listen → `POST /api/voice/parse` {text, mode} → editable preview (nothing saved yet) →
  say "yes" (save/ok/confirm…) or "go back" (no/cancel… → listens again), or use the buttons.
  Saving goes through the normal POST /appointments | /reminders | /habits endpoints.
  - Free mode: browser SpeechRecognition (Chrome/Edge/Safari/Samsung Internet) + rule parser
    `lib/voice_simple.py` (patterns: "appointment|meeting|event …", "remind me to …",
    "[monthly] habit … [N times a month] [track distance]"; dates today/tonight/tomorrow/day
    after tomorrow/[next] weekday/in N days/month D; times 3pm, 3:30 p.m., 15:00, at 3 (1–6 →
    pm), morning 09:00/afternoon 14:00/evening 18:00/tonight 20:00).
  - **Premium voice** = `settings.premiumVoice` (Settings → Voice; enforced server-side, 403
    when off): silence-stopping MediaRecorder clip → `POST /api/voice/transcribe` (Whisper
    `whisper-1`, ≤10 MB, webm/mp4/mp3/wav/m4a, 415 otherwise) and parse mode "ai" → Claude
    Sonnet 5.5 (`anthropic`/`claude-sonnet-5-5`, fresh session per command, JSON-only, validated
    by `VoiceDraft`; falls back to the rule parser on failure). EMERGENT_LLM_KEY in backend/.env.
  - **"Hey PUA" wake word**: per-device toggle (localStorage `pua:wake`), continuous browser
    recognition only while the voice dialog is closed and the app is open; fuzzy-matches
    pua/poo-ah/puma etc.; "Hey PUA, <command>" parses the rest directly. Green dot on the mic
    when active. Confirmation "yes"/"go back" always uses browser recognition (buttons fallback).
  - **Extra intents** (`lib/voice_intents.py`, checked before create-parsing; Premium AI also
    returns kinds shopping/checkoff/briefing):
    - Shopping: "add milk and eggs to the shopping list", "shopping list: …", "buy …" → draft
      kind `shopping` with `items[]` (editable/removable rows) → one POST /shopping per item.
    - Check-off: "I ran 5k / 3 miles", "done brushing teeth", "X is done" → resolved server-side
      by token match against habits + today's routine steps (run/jog/distance → tracksDistance
      habit) → draft kind `checkoff` {targetType habit|routine, targetId, routineKind,
      distanceKm}. Already-ticked targets return a message, no draft. Save: routine → step
      toggle; habit with distance → POST /habits/{id}/log; else toggle.
    - Briefing: "what's my day?", "brief me", "how's my day" → `VoiceParseOut.briefing` text
      (`lib/briefing.py`: greeting by settings.timezone, home weather, today's appointments,
      open reminders, routine progress, habits left). Shown in the dialog and read aloud.
  - **Spoken replies**: per-device toggle (localStorage `pua:speak`, default on) — speech
    synthesis reads the preview summary, then listens for yes/go back; reads the briefing
    (Stop / Read aloud buttons); says "Saved." after saving.
- No payments: "premium" is a switch billed to the Emergent AI key, not a paid plan.

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

## Auth, private planners & sharing
Emergent-managed Google sign-in (lib/auth.py, routers/auth.py, frontend lib/auth.tsx).
- **Any Google account** signs in; sessions effectively never expire (10-year DB expiry; the
  httpOnly cookie, max 400 days, is re-set on every `/auth/me`) — signed in until Sign out.
- **Per-user data**: `lib/db.db` is a ScopedDB — every planner collection in `SCOPED`
  (settings, appointments, habits, habit_completions, meals, shopping_items, reminders,
  health_events, routines, routine_checks, push_subscriptions) auto-adds
  `ownerId = current_owner` (ContextVar) to filters/inserts; no owner → RuntimeError.
  `require_user` (api_router dependency) sets it; the cron loops over onboarded users setting
  it per user; `raw_db` is unscoped (users, user_sessions, shares, caches). Unique indexes
  are per owner. Startup migration dropped old global indexes + ownerless legacy data.
- **First sign-in**: `AuthUser.onboarded=false` → Onboarding page: Sample planner
  (seed.run_all under the user's scope), Starter packs, or Clear planner (routines with no
  steps) → POST `/api/auth/onboard {sample, packs?}`.
- **Bouquets (groups; view-only)**: replaced the single friend code (old `shares` + user
  friendCode/shareCategories were removed by migration). `bouquets` {id, ownerId, name, code
  (8 chars, no 0/O/1/I, shown ABCD-2345), categories ⊆ appointments, reminders, habits,
  routines, meals, shopping, shoppingEdit}; `bouquet_members` {bouquetId, ownerId, viewerId}.
  A viewer's access to a planner = union of categories of every bouquet of that owner they
  joined; joining another bouquet never removes them from one. Max 12 bouquets per user.
  `/api/sharing`: GET → {bouquets[{…, members}], joined[{person, categories, shoppingEdit,
  bouquets: names}]}; POST /bouquets {name}; PUT /bouquets/{id} {name?, categories?,
  shoppingEdit?}; DELETE /bouquets/{id}; POST /bouquets/{id}/code (new code, members stay);
  DELETE /bouquets/{id}/members/{viewerId}; POST /join {code} (404 unknown, 400 own);
  DELETE /joined/{ownerId} (leave all their bouquets); GET /planner/{ownerId} snapshot (404
  without membership): appointments/reminders today+13 d, habits, routines, meals this week,
  shopping — only shared categories (others null).
- **Premium limit**: without Premium only a user's first 2 bouquets (by createdAt) work —
  POST /bouquets 402 at the limit; later ones get `paused: true` (excluded from access, join →
  403) until Premium is back. **Bouquet notes** (routers/notes.py, `appointment_notes`
  {id, ownerId, appointmentId, bouquetId, bouquetName, authorId, authorName, text}): a note
  lives in one bouquet; only its members + the owner see it. Viewers: POST
  /sharing/planner/{owner}/appointments/{id}/notes {text, bouquetId} (must be in that active
  bouquet sharing appointments; private appt → 403); snapshot carries `notes` +
  `noteBouquets`. Owner: GET/POST /sharing/my-notes/{apptId}, GET /sharing/note-counts (badge
  in DayAgenda); DELETE /sharing/notes/{id} (author or owner). UI: SharedPlanner thread per
  appointment; AppointmentDialog "Bouquet notes". **QR**: Bouquet card QR button → dialog with
  qrcode.react QRCodeSVG of the invite link (plumeria in the middle).
- **Invite links**: `/join/ABCD-2345` (Bouquet card "Invite link" → share sheet or copy).
  Signed out → SignIn shows an invite note; Google redirect returns to the same path; new
  accounts onboard first; then JoinBouquet page POSTs /sharing/join (response carries
  `joinedOwnerId`) and opens /shared/{owner}.
- **Friend calendar colours**: a friend's appointments use the flower colour of the first of
  their bouquets you joined (`flowerFor(bouquetId)`, FLOWER_TONES in Flower.tsx), or your pick:
  PUT /sharing/friends/{ownerId}/color {color: flower kind | null} → stored on your user doc
  `friendColors`. Picker (FriendColorPicker) on the calendar legend and the Bouquets "Planners
  shared with you" list. FriendCalendar/JoinedPlanner carry bouquetId(s) + color.
- **Shared shopping edits**: per-bouquet `shoppingEdit` (default true) — when any of the
  viewer's bouquets shares shopping with edits on, viewers may POST
  /sharing/planner/{ownerId}/shopping {name} and PATCH .../shopping/{itemId} {checked}
  (tick only, no rename/delete); 403 when off, 404 without a link. Everything else view-only.
- **Private appointments**: `Appointment.private` (create-dialog "Private" switch, lock icon in
  agendas; voice: "private"/"personal"/"secret"/"keep it private" → VoiceDraft.private, also
  in the Claude prompt; preview has a Private checkbox). Friends get them masked as "Unavailable" (time kept; location/notes/coords dropped)
  in the snapshot and the calendar overlay.
- **Combined calendar**: GET /sharing/calendar?from&to → [{owner, appointments}] for joined
  planners that share appointments. Calendar shows a coloured dot per friend per day, a legend
  with a Show/Hide friends toggle (localStorage `pua:friends-layer`) and a "Friends" section in
  the day sheet.
- **Starter packs** (lib/packs.py): onboarding 3rd option — clear planner + picked packs
  (`OnboardIn.packs` ⊆ fitness, mindful, home habit packs; morning, bedtime routine steps).
- Frontend: AuthGate (splash → SignIn → Onboarding → app; any 401 re-checks /auth/me);
  /sharing page (code + copy/new, category checkboxes, members, join, joined planners) and
  /shared/:ownerId read-only page ("View only" badge); header AccountButton (Sharing &
  friends, Sign out); nav "Sharing".
- Device-local prefs (wake/bedtime first-open, spoken replies, wake word) stay per device.
- Testing: /app/auth_testing.md + memory/test_credentials.md.

## Look: Hawaiian flower ticks & logo
- components/Flower.tsx: SVG plumeria, pink plumeria, hibiscus, ʻilima, lehua; `flowerFor(key)`
  picks one deterministically; `.pua-bloom` keyframe (index.css) pops them open.
- Every tick blooms: ui/checkbox.tsx (round bud → flower, kind from id/data-testid), habit
  check buttons, shared-planner habits, onboarding packs, routine "All done", theme choice.
- Logo `PuaLogo`: luau plumeria above the word PUA (header, sign-in); favicon.svg plumeria.
  Home-screen icons (public/icon-192.png, icon-512.png also maskable, apple-touch-icon.png,
  favicon PNG/ICO) are the plumeria-over-PUA artwork, rendered from SVG with headless Chrome.
- **Lei streaks** (components/Lei.tsx, in each RoutineCard): one flower per day of the
  routine's current streak, strung along a garland in rounds of 7 slots (max 28 shown, then
  "Full lei!"); morning = plumeria/pink plumeria/ʻilima, bedtime = hibiscus/lehua/pink.
  Nav item "Bouquets" (route /sharing).

## Premium (Stripe subscriptions — claimable sandbox, TEST MODE)
- setup_stripe.py (idempotent): product "PUA Premium" (txcd_10103001), prices by lookup_key
  pua_premium_monthly £2.99/month, pua_premium_yearly £24.99/year. Keys in backend/.env
  (STRIPE_SECRET_KEY/PUBLISHABLE/ACCOUNT_ID/WEBHOOK_SECRET/MODE). Tax: Stripe-managed
  (managed_payments, falls back to automatic_tax).
- routers/premium.py: GET /api/premium (state, prices, freeBouquets 1, freeGroupSize 6);
  POST /premium/checkout {plan, origin_url} → {checkout_url, session_id} (subscription mode,
  `payment_transactions` row inserted first); GET /premium/status/{session_id} (own sessions,
  polls Stripe, activates idempotently); POST /premium/cancel (cancels the Stripe
  subscription); POST /api/stripe/webhook (public, signature-verified: session completed →
  activate, subscription deleted → Premium off). PUT /settings premiumVoice:true → 402.
- Frontend: Paywall.tsx → Stripe-hosted checkout; /payment/success polls, /payment/cancel.
- Free limits: 1 bouquet (later ones paused), max 6 people per bouquet incl. owner (join →
  403 "full"); Premium removes both.

## Stats (/stats, routers/stats.py GET /api/stats)
memberSince/daysUsing (from users.created_at), activeDays, leisTotal + per-routine leis
(every 7th consecutive complete day in any run counts one lei), completeDays, best streaks,
habit check-offs, best habit streak, appointments, reminders done, bouquets, notes written.

## Duolingo link (lib/duolingo.py — unofficial public profile endpoint)
Habit.duolingoUsername (set in HabitDialog; PUT /habits/{id} validates the profile → 404
unknown, 502 unreachable; "" unlinks). The 5-min cron checks each linked habit ≤ every 30 min;
when the profile's currentStreak.endDate == local today it ticks the habit (source duolingo).

## Lei milestones
- LeiCelebration.tsx (mounted in AppShell): `celebrateIfLeiComplete(prev, next)` fires when a
  routine completes and its streak hits a multiple of 7 → falling flowers + card + spoken
  "Your lei is complete!" (if spoken replies are on). Called from RoutineCard, hands-free and
  voice check-offs.
