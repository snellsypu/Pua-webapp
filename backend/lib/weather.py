"""Open-Meteo forecast + geocoding client (free, no API key) with a small
in-memory cache, and Nominatim reverse geocoding (throttled, per usage policy).
All provider calls stay server-side so the frontend never hits them directly.
"""

import asyncio
import time
from typing import Any

import httpx
from fastapi import HTTPException

from models.weather import GeoPlace, HourPoint, WeatherBundle, WeatherDay, WeatherNow, ReversePlace

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"

# Nominatim's policy requires an identifying User-Agent.
NOMINATIM_UA = "pua-personal-uplink-assistant/1.0 (personal day-planner app)"

_http: httpx.AsyncClient | None = None
_cache: dict[str, tuple[float, Any]] = {}
_reverse_lock = asyncio.Lock()
_last_reverse_at = 0.0


def _client() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=3.0))
    return _http


async def close() -> None:
    global _http
    if _http is not None:
        await _http.aclose()
        _http = None


async def _get(url: str, params: dict[str, Any], ttl: int, headers: dict[str, str] | None = None) -> Any:
    key = f"{url}|{sorted(params.items())}"
    now = time.monotonic()
    hit = _cache.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1]
    try:
        res = await _client().get(url, params=params, headers=headers)
        res.raise_for_status()
        data = res.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Weather provider is unreachable right now") from exc
    if isinstance(data, dict) and data.get("error"):
        raise HTTPException(status_code=502, detail=str(data.get("reason", "Weather provider error")))
    if len(_cache) > 300:
        _cache.clear()
    _cache[key] = (now, data)
    return data


async def get_bundle(lat: float, lon: float, units: str = "celsius") -> WeatherBundle:
    data = await _get(
        FORECAST_URL,
        {
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_gusts_10m",
            "hourly": "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
            "forecast_days": 3,
            "timezone": "auto",
            "temperature_unit": units,
        },
        ttl=900,
    )
    cur = data.get("current") or {}
    daily = data.get("daily") or {}
    hourly = data.get("hourly") or {}

    # Slice the next 8 location-local hours starting from "now" at the location.
    prefix = str(cur.get("time", ""))[:13]
    times = [str(t) for t in hourly.get("time", [])]
    idx = 0
    for i, t in enumerate(times):
        if t[:13] >= prefix:
            idx = i
            break
    window = slice(idx, idx + 8)
    hours = [
        HourPoint(
            time=t[11:16],
            temperature=float(temp or 0),
            precipProb=float(prec or 0),
            code=int(code or 0),
            windSpeed=float(wind or 0),
        )
        for t, temp, prec, code, wind in zip(
            times[window],
            hourly.get("temperature_2m", [])[window],
            hourly.get("precipitation_probability", [])[window],
            hourly.get("weather_code", [])[window],
            hourly.get("wind_speed_10m", [])[window] or [0] * 8,
        )
    ]

    days = [
        WeatherDay(
            date=d,
            tempMax=float(tmax or 0),
            tempMin=float(tmin or 0),
            precipProb=float(prec or 0),
            code=int(code or 0),
        )
        for d, tmax, tmin, prec, code in zip(
            daily.get("time", []),
            daily.get("temperature_2m_max", []),
            daily.get("temperature_2m_min", []),
            daily.get("precipitation_probability_max", []),
            daily.get("weather_code", []),
        )
    ]

    return WeatherBundle(
        latitude=lat,
        longitude=lon,
        timezone=str(data.get("timezone", "UTC")),
        units=units,
        now=WeatherNow(
            temperature=float(cur.get("temperature_2m") or 0),
            apparent=float(cur.get("apparent_temperature") or 0),
            code=int(cur.get("weather_code") or 0),
            isDay=bool(cur.get("is_day", 1)),
            windSpeed=float(cur.get("wind_speed_10m") or 0),
            windGusts=float(cur.get("wind_gusts_10m") or 0),
        ),
        hourly=hours,
        days=days,
    )


async def geocode(q: str) -> list[GeoPlace]:
    data = await _get(
        GEOCODE_URL,
        {"name": q, "count": 6, "language": "en", "format": "json"},
        ttl=3600,
    )
    return [
        GeoPlace(
            name=str(r.get("name", "")),
            country=r.get("country"),
            admin1=r.get("admin1"),
            latitude=float(r.get("latitude") or 0),
            longitude=float(r.get("longitude") or 0),
        )
        for r in (data.get("results") or [])
    ]


async def reverse(lat: float, lon: float) -> ReversePlace:
    global _last_reverse_at
    rlat, rlon = round(lat, 3), round(lon, 3)
    key = f"reverse|{rlat}|{rlon}"
    now = time.monotonic()
    hit = _cache.get(key)
    if hit and now - hit[0] < 600:
        return hit[1]
    async with _reverse_lock:
        # Public Nominatim: serialize and keep >=1s between requests.
        wait = 1.0 - (time.monotonic() - _last_reverse_at)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_reverse_at = time.monotonic()
        data = await _get(
            REVERSE_URL,
            {"lat": rlat, "lon": rlon, "format": "jsonv2", "zoom": 10},
            ttl=600,
            headers={"User-Agent": NOMINATIM_UA, "Accept-Language": "en"},
        )
    addr = data.get("address") or {}
    name = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("suburb")
        or addr.get("county")
        or str(data.get("display_name", "Current location")).split(",")[0]
    )
    place = ReversePlace(name=str(name), latitude=rlat, longitude=rlon)
    _cache[key] = (time.monotonic(), place)
    return place
