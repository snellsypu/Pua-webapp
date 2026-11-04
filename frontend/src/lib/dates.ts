// Display-only date helpers (month navigation, labels). The authoritative "today"
// always comes from the server (overview endpoint / habit stats) — never computed here.
import { addDays, format, parseISO } from "date-fns";

const noon = (iso: string) => parseISO(`${iso}T12:00:00`);

export const fmtDay = (iso: string) => format(noon(iso), "EEEE, MMM d");
export const fmtShort = (iso: string) => format(noon(iso), "EEE, MMM d");
export const fmtMonth = (d: Date) => format(d, "MMMM yyyy");
export const addDaysIso = (iso: string, n: number) => format(addDays(noon(iso), n), "yyyy-MM-dd");
