// Hand-written mirrors of the backend Pydantic models (backend/models/planner.py,
// backend/models/weather.py). Nothing infers across the Python boundary — keep the
// two in sync in the same edit.

export interface Location {
  name: string;
  latitude: number;
  longitude: number;
  country?: string | null;
}

export type DistanceUnit = "km" | "mi";
export type TravelMode = "car" | "foot" | "bike" | "transit"; // transit needs a Google Maps key

export interface AppSettings {
  id: string;
  home: Location | null;
  units: "celsius" | "fahrenheit";
  distanceUnit: DistanceUnit;
  timezone: string;
  premiumVoice: boolean;
  reviewTime: string; // HH:MM — overview flips to tomorrow's review
  wakeTime: string; // HH:MM — wake-up notification
  wakeNotify: boolean;
  weekendWakeTime: string | null; // Sat/Sun; null = same as weekdays
  homeAddress: Location | null; // commute start point
  travelMode: TravelMode;
  liveLocation: boolean; // Premium: commute from the phone's location
  leaveAlerts: boolean; // "time to leave" pushes before appointments
  transitAvailable: boolean; // read-only: Google Maps key configured
  runReminders: boolean; // push 15 min before the planned run time
  mealPlanSource: string | null; // user_id of a bouquet's shared meal plan for Today/briefing; null = mine
}

// Mirrors RunPlan in backend/models/planner.py
export interface RunPlan {
  habitId: string;
  habitName: string;
  time: string;
  temperature: number;
  precipProb: number;
  windSpeed: number; // km/h
  isDay: boolean;
  reason: string;
  remindAt: string;
}

// Mirrors CommuteNext / LocationSuggestion in backend/models/planner.py
export interface CommuteNext {
  appointmentId: string;
  title: string;
  startTime: string;
  location: string;
  mode: TravelMode;
  minutes: number;
  leaveBy: string;
  leaveInMin: number;
  rainMinutes: number | null;
  rainLeaveBy: string | null;
}

export interface LocationSuggestion {
  appointmentId: string;
  title: string;
  date: string;
  startTime: string;
  location: string;
  matchName: string | null;
  matchLat: number | null;
  matchLon: number | null;
}

// Mirrors DayPart in backend/models/planner.py
export interface DayPart {
  part: "morning" | "evening";
  localTime: string;
  date: string;
  reviewTime: string;
  wakeTime: string; // today's effective wake-up time
  bedtimeTime: string;
}

// Partial PUT — only the fields sent change. home: null clears the home city.
export interface SettingsUpdate {
  home?: Location | null;
  units?: "celsius" | "fahrenheit";
  distanceUnit?: DistanceUnit;
  timezone?: string;
  premiumVoice?: boolean;
  reviewTime?: string;
  wakeTime?: string;
  wakeNotify?: boolean;
  weekendWakeTime?: string | null;
  homeAddress?: Location | null;
  travelMode?: TravelMode;
  liveLocation?: boolean;
  leaveAlerts?: boolean;
  runReminders?: boolean;
}

export interface Appointment {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string | null;
  location: string;
  notes: string;
  travelMode: TravelMode | null; // Premium per-appointment mode; null = default
  locationLat: number | null; // set when picked from address search
  locationLon: number | null;
  private: boolean; // friends see a blank "Unavailable" block
  openToJoin: boolean; // bouquet friends join straight away; otherwise the owner approves
  attendees: Attendee[];
  joinedFrom: JoinedFrom | null; // set on your copy of a friend's appointment
}
export interface Attendee {
  user_id: string;
  name: string;
  status: "pending" | "going";
}
export interface JoinedFrom {
  ownerId: string;
  ownerName: string;
  appointmentId: string;
}

export interface AppointmentCreate {
  title: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  location?: string;
  notes?: string;
  travelMode?: TravelMode | null;
  locationLat?: number | null;
  locationLon?: number | null;
  private?: boolean;
  openToJoin?: boolean;
}

export type HabitMode = "streak" | "monthly";

export interface HabitStats {
  id: string;
  name: string;
  emoji: string;
  mode: HabitMode;
  monthlyTarget: number;
  doneToday: boolean;
  streak: number;
  bestStreak: number;
  monthCount: number;
  tracksDistance: boolean;
  duolingoUsername: string | null; // linked Duolingo profile — auto-ticks after practice
  // Always km on the wire; convert with lib/units for display.
  todayKm: number;
  weekKm: number;
  monthKm: number;
  totalKm: number;
}

export interface HabitCreate {
  name: string;
  emoji: string;
  mode: HabitMode;
  monthlyTarget: number;
  tracksDistance: boolean;
}

export interface HabitToggleOut {
  habitId: string;
  date: string;
  done: boolean;
  distanceKm: number | null;
}

export interface HabitLog {
  date?: string;
  distanceKm: number | null;
}

export interface HabitCompletion {
  habitId: string;
  date: string;
  distanceKm: number | null;
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface Meal {
  id: string;
  date: string;
  slot: MealSlot;
  title: string;
  notes: string;
  ingredients: string[];
  cooks: Cook[]; // who's cooking — several can help
}
export interface Cook {
  user_id: string;
  name: string;
}
export interface MealUpsert {
  date: string;
  slot: MealSlot;
  title: string;
  notes: string;
  ingredients?: string[] | null; // omitted = keep / fill from the remembered recipe
}
export interface Recipe {
  title: string;
  ingredients: string[];
}
export interface FavouriteMeal {
  title: string;
  count: number;
  ingredients: string[];
}
export interface ShoppingSuggestion {
  name: string;
  meals: string[];
}

export interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
}

export interface Reminder {
  id: string;
  title: string;
  date: string;
  time: string;
  done: boolean;
}

export interface DayContext {
  date: string;
  appointments: Appointment[];
  meals: Meal[];
  reminders: Reminder[];
  workBlocks: WorkBlock[];
}

export interface RangeBundle {
  fromDate: string;
  toDate: string;
  appointments: Appointment[];
  meals: Meal[];
  reminders: Reminder[];
  completions: HabitCompletion[];
  workBlocks: WorkBlock[];
}

export interface WeatherNow {
  temperature: number;
  apparent: number;
  code: number;
  isDay: boolean;
  windSpeed: number; // km/h
  windGusts: number; // km/h
}

export interface HourPoint {
  time: string;
  temperature: number;
  precipProb: number;
  code: number;
  windSpeed: number; // km/h
}

export interface WeatherDay {
  date: string;
  tempMax: number;
  tempMin: number;
  precipProb: number;
  code: number;
}

export interface WeatherBundle {
  latitude: number;
  longitude: number;
  timezone: string;
  units: string;
  now: WeatherNow;
  hourly: HourPoint[];
  days: WeatherDay[];
}

export interface GeoPlace {
  name: string;
  country?: string | null;
  admin1?: string | null;
  latitude: number;
  longitude: number;
}

export interface ReversePlace {
  name: string;
  latitude: number;
  longitude: number;
}

// Mirrors backend/models/health.py
export type HealthType = "nutrition" | "exercise" | "sleep";

export interface HealthEvent {
  eventId: string;
  type: HealthType;
  date: string;
  start: string;
  end: string;
  title: string | null;
  durationMin: number | null;
  distanceKm: number | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  stage: string | null;
  score: number | null;
  sourceFile: string;
}

export interface HealthImportResult {
  imported: number;
  byType: Record<string, number>;
  files: string[];
}

// Mirrors backend/models/routines.py
export type RoutineKind = "morning" | "bedtime";

export interface RoutineStep {
  id: string;
  text: string;
}

export interface RoutineState {
  kind: RoutineKind;
  title: string;
  time: string;
  notify: boolean;
  steps: RoutineStep[];
  date: string;
  doneStepIds: string[];
  complete: boolean;
  streak: number;
  bestStreak: number;
}

export interface RoutineUpdate {
  time?: string;
  notify?: boolean;
  steps?: { id?: string; text: string }[];
}

// Mirrors backend/models/push.py
export interface PushPublicKey {
  publicKey: string;
}

export interface PushStatus {
  subscriptions: number;
}

export interface PushSendResult {
  sent: number;
  removed: number;
  failed: number;
}

// Mirrors backend/models/voice.py
export type VoiceKind = "appointment" | "habit" | "reminder" | "shopping" | "checkoff";

export interface VoiceDraft {
  kind: VoiceKind;
  title: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string;
  private: boolean; // appointment — friends see "Unavailable"
  time: string | null;
  emoji: string;
  habitMode: HabitMode;
  monthlyTarget: number;
  tracksDistance: boolean;
  items: string[];
  targetType: "habit" | "routine" | null;
  targetId: string | null;
  routineKind: "morning" | "bedtime" | null;
  distanceKm: number | null;
}

export interface VoiceParseIn {
  text: string;
  mode: "simple" | "ai";
}

export interface VoiceParseOut {
  transcript: string;
  mode: "simple" | "ai";
  draft: VoiceDraft | null;
  message: string | null;
  briefing: string | null;
}

export interface VoiceTranscript {
  text: string;
}

// Mirrors backend/models/auth.py
export interface AuthUser {
  user_id: string;
  email: string;
  name: string;
  picture: string;
  onboarded: boolean; // false until the first-run sample/clear choice
}

export type ShareCategory = "appointments" | "reminders" | "habits" | "routines" | "meals" | "shopping";

export interface Person {
  user_id: string;
  name: string;
  email: string;
  picture: string;
}

export interface JoinedPlanner extends Person {
  categories: ShareCategory[]; // union of every bouquet of theirs you joined
  shoppingEdit: boolean; // you may tick off / add items on their list
  bouquets: string[]; // names of their bouquets you're in (joined order)
  bouquetIds: string[]; // same order — the first one's flower colours them on your calendar
  color: FlowerKind | null; // your own calendar colour pick
  canLeave: boolean; // they own a bouquet you joined
}

// A group you share with — its own code and its own choice of what's shared
export interface Bouquet {
  id: string;
  name: string;
  code: string;
  categories: ShareCategory[];
  shoppingEdit: boolean;
  members: Person[];
  paused: boolean; // past the 2 free bouquets without Premium
}

export interface Membership {
  bouquetId: string;
  bouquetName: string;
  ownerId: string;
  ownerName: string;
  categories: ShareCategory[];
  shoppingEdit: boolean;
  paused: boolean;
}
export interface MembershipUpdate {
  categories?: ShareCategory[];
  shoppingEdit?: boolean;
}

export interface SharingState {
  bouquets: Bouquet[];
  joined: JoinedPlanner[];
  joinedOwnerId: string | null; // set by POST /sharing/join
  memberships: Membership[]; // bouquets you joined + what YOU share in each
  joinedBouquetId?: string | null; // set by POST /join
}

export type FlowerKind = "plumeria" | "pink-plumeria" | "hibiscus" | "ilima" | "lehua";
export interface FriendColorIn {
  color: FlowerKind | null;
}

export interface BouquetUpdate {
  name?: string;
  categories?: ShareCategory[];
  shoppingEdit?: boolean;
}

// Mirrors backend/models/sharing.py — view-only snapshot of a friend's planner
export interface SharedPlanner {
  owner: Person;
  categories: ShareCategory[];
  today: string;
  shoppingEdit: boolean;
  appointments: Appointment[] | null; // private ones arrive as "Unavailable"
  reminders: Reminder[] | null;
  habits: HabitStats[] | null;
  routines: RoutineState[] | null;
  meals: Meal[] | null;
  shopping: ShoppingItem[] | null;
  notes: AppointmentNote[]; // bouquet notes you can see
  noteBouquets: BouquetRef[]; // their bouquets you can post notes in
  workBlocks: WorkBlock[] | null; // "Working" blocks when appointments are shared
}

// Mirrors FriendCalendar in backend/models/sharing.py — calendar overlay
export interface FriendCalendar {
  owner: Person;
  appointments: Appointment[];
  bouquetId: string | null; // default colour = this bouquet's flower
  color: FlowerKind | null; // your pick overrides it
  workBlocks: WorkBlock[];
}

// Mirrors OnboardIn in backend/models/auth.py
export type StarterPack = "fitness" | "mindful" | "home" | "morning" | "bedtime";
export interface OnboardIn {
  sample: boolean;
  packs?: StarterPack[];
}

// Mirrors backend/models/notes.py — bouquet notes on shared appointments
export interface BouquetRef {
  id: string;
  name: string;
}
export interface AppointmentNote {
  id: string;
  appointmentId: string;
  bouquetId: string;
  bouquetName: string;
  authorId: string;
  authorName: string;
  authorPicture: string;
  text: string;
  createdAt: string;
  mine: boolean;
  canDelete: boolean;
}
export interface NoteIn {
  text: string;
  bouquetId: string;
}
export interface MyAppointmentNotes {
  notes: AppointmentNote[];
  bouquets: BouquetRef[];
  private: boolean;
}

// Mirrors backend/models/premium.py — MOCKED checkout (no payment taken yet)
export type PremiumPlan = "monthly" | "yearly";
export interface PremiumPrice {
  plan: PremiumPlan;
  label: string;
  amount: number;
  currency: string;
}
export interface PremiumState {
  active: boolean;
  plan: PremiumPlan | null;
  since: string | null;
  renewsOn: string | null;
  demo: boolean;
  testMode: boolean; // Stripe test mode — test cards only
  prices: PremiumPrice[];
  freeBouquets: number;
  freeGroupSize: number; // people per bouquet incl. owner, without Premium
}
export interface CheckoutIn {
  plan: PremiumPlan;
  origin_url: string;
}
export interface CheckoutOut {
  checkout_url: string;
  session_id: string;
}
export interface PaymentStatus {
  session_id: string;
  status: string;
  payment_status: string;
}

// Mirrors backend/routers/stats.py
export interface RoutineLeis {
  kind: "morning" | "bedtime";
  title: string;
  leis: number;
  completeDays: number;
  streak: number;
  bestStreak: number;
}
export interface Stats {
  memberSince: string;
  daysUsing: number;
  activeDays: number;
  leisTotal: number;
  routines: RoutineLeis[];
  habitCheckOffs: number;
  habits: number;
  bestHabitStreak: number;
  appointments: number;
  remindersDone: number;
  bouquets: number;
  notesWritten: number;
}

// Mirrors Leaderboard in backend/models/auth.py — longest lei this month per bouquet
export interface LeaderboardEntry extends Person {
  longestLei: number;
  daysFinished: number;
  isOwner: boolean;
  me: boolean;
  rank: number;
}
export interface Leaderboard {
  bouquetId: string;
  bouquetName: string;
  month: string;
  entries: LeaderboardEntry[];
}

// Mirrors backend/routers/strava.py
export interface StravaStatus {
  configured: boolean;
  connected: boolean;
  athleteName: string | null;
  habitId: string | null;
  lastSync: string | null;
  lastResult: string | null;
}
export interface StravaConnectOut {
  url: string;
}

// Mirrors backend/routers/anniversaries.py
export type AnniversaryKind = "birthday" | "anniversary" | "event";
export interface AnniversaryIn {
  title: string;
  kind: AnniversaryKind;
  date: string; // MM-DD, repeats yearly
  year: number | null; // birth / wedding year
  emoji: string;
  gifts: GiftIdea[]; // gift ideas (birthdays) — unbought ones are in the 1-week heads-up
}
export interface GiftIdea {
  id?: string;
  text: string;
  bought: boolean;
}
export interface MyBirthday {
  date: string | null; // MM-DD
  year: number | null; // birth year → bouquet sees your age
  share: boolean; // bouquet friends see it
  declined: boolean; // "Don't want to share" — stops the bouquet nudge
}
export interface Anniversary extends AnniversaryIn {
  id: string;
}
export interface UpcomingEvent {
  id: string;
  title: string;
  emoji: string;
  kind: AnniversaryKind | "holiday";
  holidaySet: string | null;
  next: string; // YYYY-MM-DD
  daysUntil: number;
  years: number | null;
  custom: Anniversary | null;
  friend: string | null; // user_id when it's a bouquet friend's shared birthday
  milestone: string | null; // "18th", "Big 40", "Silver"…
  gifts: GiftIdea[]; // your private gift ideas for a bouquet friend's birthday
  pool: PoolGift[]; // the bouquet's shared ideas for a friend (never shown to the friend)
}
export interface HolidaySetState {
  id: string;
  label: string;
  group: string;
  enabled: boolean;
}

export interface PoolGift {
  id: string;
  text: string;
  addedBy: string; // first name
  mine: boolean;
  claimedBy: string | null; // first name of whoever's buying it
  claimedByMe: boolean;
  chipIns: ChipIn[]; // who's putting money towards it, and how much
  chipTotal: number;
}
export interface ChipIn {
  name: string; // first name
  amount: number;
  mine: boolean;
}

// ---- work rota (backend/models/jobs.py)
export interface Shift {
  week: number; // 1..rotaWeeks
  weekday: number; // Mon=0 … Sun=6
  start: string; // HH:MM
  end: string; // HH:MM — earlier than start = finishes next morning
}
export interface JobIn {
  name: string;
  rotaWeeks: number; // 1–4
  startDate: string; // a day in week 1 (snapped to Monday)
  hourlyRate: number | null; // £ per hour, for estimated pay
  shifts: Shift[];
}
export interface Job extends JobIn {
  id: string;
  createdAt: string;
}
export interface WorkBlock {
  jobId: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  overnight: boolean;
}

// ---- work hours (GET /api/stats/work)
export interface JobHours {
  jobId: string;
  name: string;
  weekHours: number;
  weekShifts: number;
  monthHours: number;
  monthShifts: number;
  hourlyRate: number | null;
  weekPay: number | null; // estimated
  monthPay: number | null;
}
export interface WorkHours {
  weekStart: string;
  weekEnd: string;
  month: string; // YYYY-MM
  jobs: JobHours[];
  weekPay: number | null; // all jobs with a rate
  monthPay: number | null;
}
