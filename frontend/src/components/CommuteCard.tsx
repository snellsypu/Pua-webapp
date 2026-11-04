// Settings: commute times — home street address, default way of travelling, and
// (Premium) live location. Address search goes through the backend (OSM Nominatim).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Car, Loader2, MapPin, Search, Sparkles, X } from "lucide-react";
import { apiGet, apiPut, ApiError } from "@/lib/api";
import type { AppSettings, GeoPlace, SettingsUpdate, TravelMode } from "@/lib/types";
import { TRAVEL_LABELS, travelModes } from "@/components/AppointmentDialog";
import { PinLocations } from "@/components/PinLocations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CommuteCard() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const s = settings.data;
  const premium = s?.premiumVoice ?? false;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoPlace[] | null>(null);

  const save = useMutation({
    mutationFn: (u: SettingsUpdate) => apiPut<AppSettings>("/settings", u),
    onSuccess: (next, u) => {
      qc.setQueryData(["settings"], next);
      qc.invalidateQueries({ queryKey: ["readout"] });
      if ("homeAddress" in u) toast.success(next.homeAddress ? "Home address saved" : "Home address removed");
      else if (u.travelMode) toast.success(`Default: ${TRAVEL_LABELS[next.travelMode].toLowerCase()}`);
      else if (u.leaveAlerts !== undefined) toast.success(next.leaveAlerts ? "Leave-now alerts on" : "Leave-now alerts off");
      else toast.success(next.liveLocation ? "Commute from your live location" : "Commute from home");
    },
    onError: () => toast.error("Could not save"),
  });

  const search = useMutation({
    mutationFn: (query: string) => apiGet<GeoPlace[]>(`/address/search?q=${encodeURIComponent(query)}`),
    onSuccess: (r) => setResults(r),
    onError: (e) => toast.error(e instanceof ApiError && e.status === 502 ? "Address search is busy — try again shortly" : "Search failed"),
  });

  const toggleLive = async (on: boolean) => {
    if (on) {
      const ok = await new Promise<boolean>((res) =>
        navigator.geolocation
          ? navigator.geolocation.getCurrentPosition(() => res(true), () => res(false), { timeout: 10_000 })
          : res(false),
      );
      if (!ok) {
        toast.error("Location permission denied — allow it in your browser's site settings");
        return;
      }
    }
    save.mutate({ liveLocation: on });
  };

  return (
    <Card data-testid="commute-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading">
          <Car className="size-4" /> Commute times
        </CardTitle>
        <CardDescription>
          The wake-up and bedtime read-outs tell you how long it takes to reach your first appointment and
          when to leave. Give appointments a street address or a well-known place for the best results.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="home-address">Home address</Label>
          {s?.homeAddress ? (
            <div className="flex items-start gap-2 rounded-xl border p-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="flex-1 text-sm" data-testid="settings-home-address">{s.homeAddress.name}</span>
              <Button variant="ghost" size="icon-xs" aria-label="Remove home address" data-testid="settings-home-address-clear"
                onClick={() => save.mutate({ homeAddress: null })}>
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="settings-home-address-empty">
              Not set — read-outs will skip travel times until you add it.
            </p>
          )}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 3) search.mutate(q.trim()); }}>
            <Input id="home-address" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 12 High Street, Bracknell"
              data-testid="settings-address-input" />
            <Button type="submit" size="sm" variant="outline" disabled={q.trim().length < 3 || search.isPending} data-testid="settings-address-search">
              {search.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Search
            </Button>
          </form>
          {results && (
            <ul className="space-y-1" data-testid="settings-address-results">
              {results.length === 0 && <li className="text-xs text-muted-foreground">No matches — try adding the town or postcode.</li>}
              {results.map((r, i) => (
                <li key={`${r.latitude},${r.longitude}`}>
                  <button type="button" data-testid={`settings-address-result-${i}`}
                    className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-accent"
                    onClick={() => {
                      save.mutate({ homeAddress: { name: r.name, latitude: r.latitude, longitude: r.longitude } });
                      setResults(null);
                      setQ("");
                    }}>
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="travel-mode">Usually I get there by</Label>
          <Select value={s?.travelMode ?? "car"} onValueChange={(v) => save.mutate({ travelMode: v as TravelMode })}>
            <SelectTrigger id="travel-mode" className="w-48" data-testid="settings-travel-mode">
              <SelectValue>{TRAVEL_LABELS[s?.travelMode ?? "car"]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {travelModes(!!s?.transitAvailable).map((m) => (
                <SelectItem key={m} value={m} data-testid={`settings-travel-mode-${m}`}>{TRAVEL_LABELS[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Typical journey times without live traffic.
            {s?.transitAvailable
              ? " Public transport times come from your Google Maps account."
              : " Public transport needs a Google Maps key (not connected yet)."}
            Walking or cycling into heavy rain? PUA suggests driving instead.
            {premium ? " You can also pick a mode per appointment." : " Premium lets you pick a mode per appointment."}
          </p>
        </div>

        <label htmlFor="leave-alerts" className="flex items-start gap-2.5 rounded-xl border p-3">
          <Checkbox id="leave-alerts" checked={s?.leaveAlerts ?? false} disabled={save.isPending || !s?.homeAddress}
            onCheckedChange={(c) => save.mutate({ leaveAlerts: c === true })} data-testid="settings-leave-alerts" />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">Leave-now alerts</span>
            <span className="text-xs text-muted-foreground">
              {s?.homeAddress
                ? "A notification about 5 minutes before you need to set off for each appointment with a place (travel time from home, with a drive suggestion if heavy rain is on the way). Needs notifications on for this device."
                : "Add your home address first."}
            </span>
          </span>
        </label>

        <label htmlFor="live-location" className="flex items-start gap-2.5 rounded-xl border p-3">
          <Checkbox id="live-location" checked={premium && (s?.liveLocation ?? false)} disabled={!premium || save.isPending}
            onCheckedChange={(c) => void toggleLive(c === true)} data-testid="settings-live-location" />
          <span className="grid gap-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-3.5" /> Live location <span className="text-xs font-normal text-muted-foreground">· Premium</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {premium
                ? "In the morning, work out the commute from where your phone is instead of home. Only checked when the wake-up read-out opens."
                : "Turn on Premium (Voice card) to work out commutes from where your phone is."}
            </span>
          </span>
        </label>
        <PinLocations />
        <p className="text-[11px] text-muted-foreground">
          Maps &amp; routes © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors
        </p>
      </CardContent>
    </Card>
  );
}
