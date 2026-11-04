// Weather hook: resolves the location (away → home), fetches the Open-Meteo bundle
// through the backend, and exposes server-anchored "today" so weather days are matched
// by date, not by index (the location's local date can lag the app's date).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { DayContext, GeoPlace, ReversePlace, WeatherBundle } from "@/lib/types";

export function useWeather() {
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<AppSettingsShape>("/settings"),
    staleTime: 60_000,
  });
  const todayQ = useQuery({
    queryKey: ["overview", 0],
    queryFn: () => apiGet<DayContext>("/overview?offset=0"),
    staleTime: 60_000,
  });

  const [away, setAway] = useState<GeoPlace | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const home = settings.data?.home ?? null;
  const loc = away ?? home;
  const units = settings.data?.units ?? "celsius";
  const lat = loc?.latitude;
  const lon = loc?.longitude;

  const weather = useQuery({
    queryKey: ["weather", lat, lon, units],
    queryFn: () => apiGet<WeatherBundle>(`/weather?lat=${lat}&lon=${lon}&units=${units}`),
    enabled: lat !== undefined && lon !== undefined,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const detect = () => {
    setGeoError(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoError("Geolocation is not available in this browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        apiGet<ReversePlace>(
          `/geocode/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`,
        )
          .then((rev) =>
            setAway({ name: rev.name, latitude: rev.latitude, longitude: rev.longitude }),
          )
          .catch(() => setGeoError("Could not look up your current location"));
      },
      () => setGeoError("Location permission denied — set a home city in Settings instead"),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const resetAway = () => {
    setAway(null);
    setGeoError(null);
  };

  return {
    home,
    away,
    appToday: todayQ.data?.date ?? null,
    locationLabel: away?.name ?? home?.name ?? null,
    isAway: !!away,
    bundle: weather.data,
    loading: weather.isLoading || (settings.isLoading && !away),
    error: weather.error,
    refetch: weather.refetch,
    detect,
    resetAway,
    geoError,
  };
}

type AppSettingsShape = {
  home: { name: string; latitude: number; longitude: number; country?: string | null } | null;
  units: "celsius" | "fahrenheit";
};
