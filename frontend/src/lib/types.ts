// Hand-written mirrors of the backend Pydantic models (backend/models/planner.py,
// backend/models/weather.py). Nothing infers across the Python boundary — keep the
// two in sync in the same edit.

export interface Location {
  name: string;
  latitude: number;
  longitude: number;
  country?: string | null;
}

export interface AppSettings {
  id: string;
  home: Location | null;
  units: "celsius" | "fahrenheit";
}

export interface SettingsUpdate {
  home: Location | null;
  units: "celsius" | "fahrenheit";
}

export interface Appointment {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string | null;
  location: string;
  notes: string;
}

export interface AppointmentCreate {
  title: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  location?: string;
  notes?: string;
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
}

export interface HabitCreate {
  name: string;
  emoji: string;
  mode: HabitMode;
  monthlyTarget: number;
}

export interface HabitToggleOut {
  habitId: string;
  date: string;
  done: boolean;
}

export interface HabitCompletion {
  habitId: string;
  date: string;
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
}

export interface HourPoint {
  time: string;
  temperature: number;
  precipProb: number;
  code: number;
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
