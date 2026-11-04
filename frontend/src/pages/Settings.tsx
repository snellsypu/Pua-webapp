import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Check, LocateFixed, MapPin, Search } from "lucide-react";
import { apiGet, apiPut } from "@/lib/api";
import type { AppSettings, GeoPlace, ReversePlace, SettingsUpdate } from "@/lib/types";
import { NotificationsCard } from "@/components/NotificationsCard";
import { VoiceSettingsCard } from "@/components/VoiceSettingsCard";
import { OverviewWakeCard } from "@/components/OverviewWakeCard";
import { CommuteCard } from "@/components/CommuteCard";
import { AccessCard } from "@/components/AccessCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

export default function Settings() {
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<AppSettings>("/settings"),
  });
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoPlace[] | null>(null);
  const [searching, setSearching] = useState(false);

  const save = useMutation({
    // Partial update — only the field being changed is sent.
    mutationFn: (v: SettingsUpdate) => apiPut<AppSettings>("/settings", v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["weather"] });
      toast.success("Settings saved");
    },
    onError: () => toast.error("Could not save settings"),
  });

  const search = async () => {
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await apiGet<GeoPlace[]>(`/geocode?q=${encodeURIComponent(q.trim())}`));
    } catch {
      toast.error("Location search failed — try again");
    } finally {
      setSearching(false);
    }
  };

  const detectHome = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation is not available in this browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        apiGet<ReversePlace>(
          `/geocode/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`,
        )
          .then((rev) =>
            save.mutate({
              home: { name: rev.name, latitude: rev.latitude, longitude: rev.longitude },
            }),
          )
          .catch(() => toast.error("Could not look up your location"));
      },
      () => toast.error("Location permission denied"),
      { timeout: 10_000 },
    );
  };

  const home = settings.data?.home ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mx-auto max-w-2xl space-y-6"
    >
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Home city, weather units and appearance.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Home location</CardTitle>
          <CardDescription>
            Used for the morning weather. When you&apos;re out, use the location button on any
            weather card to see conditions where you are — your home stays saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl border bg-muted/50 p-3" data-testid="settings-current-home">
            <MapPin className="size-4 text-muted-foreground" />
            {settings.isLoading ? (
              <span className="text-sm text-muted-foreground">Loading…</span>
            ) : home ? (
              <span className="text-sm">
                <span className="font-medium">{home.name}</span>
                {home.country ? <span className="text-muted-foreground"> · {home.country}</span> : null}
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {home.latitude.toFixed(2)}, {home.longitude.toFixed(2)}
                </span>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Not set yet</span>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Search a city…"
              data-testid="settings-location-search-input"
            />
            <Button
              variant="outline"
              data-testid="settings-location-search-button"
              onClick={search}
              disabled={searching || q.trim().length < 2}
            >
              <Search className="size-4" /> Search
            </Button>
            <Button
              variant="outline"
              data-testid="settings-home-detect-button"
              onClick={detectHome}
              disabled={save.isPending}
            >
              <LocateFixed className="size-4" /> Detect
            </Button>
          </div>

          {results && (
            <ul className="overflow-hidden rounded-xl border" data-testid="settings-search-results">
              {results.length === 0 && (
                <li className="px-3 py-2.5 text-sm text-muted-foreground">No matches found</li>
              )}
              {results.map((r, i) => (
                <li key={`${r.name}-${i}`}>
                  <button
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent"
                    data-testid={`settings-home-result-${i}`}
                    onClick={() => {
                      save.mutate({ home: r });
                      setResults(null);
                      setQ("");
                    }}
                  >
                    <span>
                      <span className="font-medium">{r.name}</span>
                      <span className="text-muted-foreground">
                        {r.admin1 ? `, ${r.admin1}` : ""} {r.country ?? ""}
                      </span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.latitude.toFixed(2)}, {r.longitude.toFixed(2)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Appearance</CardTitle>
          <CardDescription>Light for the day, dark for the wind-down — your call.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5">
            <Label>Theme</Label>
            <div className="flex gap-2">
              {THEME_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={theme === opt.value ? "default" : "outline"}
                  size="sm"
                  data-testid={`settings-theme-${opt.value}`}
                  onClick={() => setTheme(opt.value)}
                >
                  {theme === opt.value && <Check className="size-3.5" />} {opt.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="units">Temperature units</Label>
            <Select
              value={settings.data?.units ?? "celsius"}
              onValueChange={(v: string) => save.mutate({ units: v as "celsius" | "fahrenheit" })}
            >
              <SelectTrigger id="units" className="w-48" data-testid="settings-units-select">
                <SelectValue>{(u: string) => (u === "fahrenheit" ? "°F Fahrenheit" : "°C Celsius")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="celsius" data-testid="settings-units-celsius">
                  °C Celsius
                </SelectItem>
                <SelectItem value="fahrenheit" data-testid="settings-units-fahrenheit">
                  °F Fahrenheit
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="distance-unit">Distance units</Label>
            <Select
              value={settings.data?.distanceUnit ?? "km"}
              onValueChange={(v: string) => save.mutate({ distanceUnit: v as "km" | "mi" })}
            >
              <SelectTrigger id="distance-unit" className="w-48" data-testid="settings-distance-select">
                <SelectValue>{(u: string) => (u === "mi" ? "Miles (mi)" : "Kilometres (km)")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="km" data-testid="settings-distance-km">
                  Kilometres (km)
                </SelectItem>
                <SelectItem value="mi" data-testid="settings-distance-mi">
                  Miles (mi)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <AccessCard />

      <OverviewWakeCard />

      <CommuteCard />

      <VoiceSettingsCard />

      <NotificationsCard />

      <Card className={cn("border-dashed")}>
        <CardHeader>
          <CardTitle className="font-heading">Home screen widget</CardTitle>
          <CardDescription>
            Add PUA to your phone&apos;s home screen (browser menu → &ldquo;Add to Home
            Screen&rdquo;) and open the widget view on the Today page for a one-glance summary of
            your day.
          </CardDescription>
        </CardHeader>
      </Card>
    </motion.div>
  );
}
