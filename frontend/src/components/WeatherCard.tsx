import { Link } from "react-router-dom";
import { LocateFixed, MapPin, RotateCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useWeather } from "@/lib/useWeather";
import { addDaysIso } from "@/lib/dates";
import { fmtDeg, weatherCodeInfo } from "@/lib/weatherCodes";
import { cn } from "@/lib/utils";

export function WeatherCard({
  showHourly = false,
  showTomorrow = false,
  className,
}: {
  showHourly?: boolean;
  showTomorrow?: boolean;
  className?: string;
}) {
  const w = useWeather();
  const { bundle, appToday, loading, error, home, isAway, locationLabel } = w;

  if (loading) {
    return (
      <Card className={cn("rounded-2xl", className)} data-testid="weather-card-loading">
        <CardContent className="p-5">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-10 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-3 w-40 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!home && !isAway) {
    return (
      <Card className={cn("rounded-2xl", className)} data-testid="weather-card-setup">
        <CardContent className="p-5">
          <p className="text-sm font-medium">Set up weather</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a home city so your mornings start with a forecast.
          </p>
          {w.geoError && <p className="mt-2 text-xs text-destructive">{w.geoError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" data-testid="weather-detect-button" onClick={w.detect}>
              <LocateFixed className="size-4" /> Use my location
            </Button>
            <Link
              to="/settings"
              className={buttonLink}
              data-testid="weather-set-home-link"
            >
              Set home city
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !bundle) {
    return (
      <Card className={cn("rounded-2xl", className)} data-testid="weather-card-error">
        <CardContent className="p-5">
          <p className="text-sm font-medium">Weather unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The forecast service didn&apos;t answer. Your plans are safe.
          </p>
          {w.geoError && <p className="mt-2 text-xs text-destructive">{w.geoError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" data-testid="weather-retry-button" onClick={() => w.refetch()}>
              <RotateCw className="size-4" /> Retry
            </Button>
            {!isAway && (
              <Button size="sm" variant="ghost" data-testid="weather-detect-button-error" onClick={w.detect}>
                <LocateFixed className="size-4" /> Use my location
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const code = weatherCodeInfo(bundle.now.code);
  const todayWx = bundle.days.find((d) => d.date === appToday) ?? bundle.days[0];
  const tomorrowWx = appToday
    ? bundle.days.find((d) => d.date === addDaysIso(appToday, 1))
    : undefined;

  return (
    <Card className={cn("rounded-2xl", className)} data-testid="weather-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate" data-testid="weather-location">
                {locationLabel}
              </span>
              {isAway && (
                <Badge variant="secondary" className="ml-1 gap-1" data-testid="weather-away-badge">
                  away
                  <button onClick={w.resetAway} aria-label="Back to home weather" className="ml-0.5">
                    <X className="size-3" />
                  </button>
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-end gap-3">
              <span
                className="font-mono text-5xl font-semibold leading-none tracking-tight"
                data-testid="weather-temp"
              >
                {fmtDeg(bundle.now.temperature)}
              </span>
              <div className="pb-0.5">
                <div className="text-2xl leading-none" data-testid="weather-emoji">
                  {code.emoji}
                </div>
                <div className="text-xs text-muted-foreground" data-testid="weather-label">
                  {code.label}
                </div>
              </div>
            </div>
            {todayWx && (
              <div className="mt-2 font-mono text-xs text-muted-foreground" data-testid="weather-today-range">
                feels {fmtDeg(bundle.now.apparent)} · H {fmtDeg(todayWx.tempMax)} L{" "}
                {fmtDeg(todayWx.tempMin)} · ☔ {Math.round(todayWx.precipProb)}%
              </div>
            )}
          </div>
          {!isAway && (
            <Button
              variant="ghost"
              size="icon-xs"
              data-testid="weather-detect-away-button"
              title="I'm away — use my current location"
              aria-label="Use my current location"
              onClick={w.detect}
            >
              <LocateFixed className="size-4" />
            </Button>
          )}
        </div>

        {w.geoError && <p className="mt-2 text-xs text-destructive">{w.geoError}</p>}

        {showHourly && bundle.hourly.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" data-testid="weather-hourly">
            {bundle.hourly.map((h) => (
              <div
                key={h.time}
                className="flex min-w-14 flex-col items-center gap-1 rounded-xl bg-muted/70 px-2 py-2"
              >
                <span className="font-mono text-[11px] text-muted-foreground">{h.time}</span>
                <span>{weatherCodeInfo(h.code).emoji}</span>
                <span className="font-mono text-xs">{fmtDeg(h.temperature)}</span>
              </div>
            ))}
          </div>
        )}

        {showTomorrow && tomorrowWx && (
          <div
            className="mt-4 flex items-center gap-2 rounded-xl bg-muted/70 px-3 py-2 text-sm"
            data-testid="weather-tomorrow"
          >
            <span>{weatherCodeInfo(tomorrowWx.code).emoji}</span>
            <span className="text-muted-foreground">Tomorrow</span>
            <span className="ml-auto font-mono text-xs">
              H {fmtDeg(tomorrowWx.tempMax)} L {fmtDeg(tomorrowWx.tempMin)} · ☔{" "}
              {Math.round(tomorrowWx.precipProb)}%
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const buttonLink =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-accent";
