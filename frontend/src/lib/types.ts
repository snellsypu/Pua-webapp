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
}

export interface RangeBundle {
  fromDate: string;
  toDate: string;
  appointments: Appointment[];
  meals: Meal[];
  reminders: Reminder[];
  completions: HabitCompletion[];
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
  categories: ShareCategory[];
  shoppingEdit: boolean; // you may tick off / add items on their list
}

export interface SharingState {
  friendCode: string;
  categories: ShareCategory[];
  shoppingEdit: boolean; // friends may tick off / add shopping items
  members: Person[];
  joined: JoinedPlanner[];
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
}

// Mirrors FriendCalendar in backend/models/sharing.py — calendar overlay
export interface FriendCalendar {
  owner: Person;
  appointments: Appointment[];
}

// Mirrors OnboardIn in backend/models/auth.py
export type StarterPack = "fitness" | "mindful" | "home" | "morning" | "bedtime";
export interface OnboardIn {
  sample: boolean;
  packs?: StarterPack[];
}
