"""Commute times: OpenStreetMap Nominatim geocoding + FOSSGIS OSRM routing (free,
no key). Usage policy: identifying User-Agent, max 1 request/second app-wide,
cache everything (Mongo: geocode_cache, route_cache), OSM attribution in the UI.
Durations are static road-network estimates, not live traffic."""

import asyncio
import hashlib
import logging
import time
from datetime import datetime, timezone

import httpx

from lib.db import db
from lib.weather import NOMINATIM_UA

logger = logging.getLogger(__name__)

SEARCH_URL = "https://nominatim.openstreetmap.org/search"
ROUTERS = {
    "car": "https://routing.openstreetmap.de/routed-car/route/v1/driving",
    "foot": "https://routing.openstreetmap.de/routed-foot/route/v1/driving",
    "bike": "https://routing.openstreetmap.de/routed-bike/route/v1/driving",
}
MODE_WORDS = {"car": "by car", "foot": "on foot", "bike": "by bike"}
BUFFER_MIN = 10  # leave-by includes a little slack

_lock = asyncio.Lock()
_last = 0.0
_http: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=4.0), headers={"User-Agent": NOMINATIM_UA})
    return _http


def _key(*parts: object) -> str:
    return hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()


async def _get(url: str, params: dict) -> object:
    """App-wide 1 req/s gate (single backend process); callers check the cache first."""
    global _last
    async with _lock:
        wait = 1.0 - (time.monotonic() - _last)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            res = await _client().get(url, params=params)
        finally:
            _last = time.monotonic()
    res.raise_for_status()
    return res.json()


async def search(q: str, near: tuple[float, float] | None = None, limit: int = 5) -> list[dict]:
    """Free-text address/place → [{name, latitude, longitude}], biased near `near` (lat, lon)."""
    q = " ".join(q.split())
    viewbox = None
    if near:
        d = 0.35
        lat, lon = near
        viewbox = f"{lon - d},{lat + d},{lon + d},{lat - d}"
    key = _key("geo", q.lower(), viewbox, limit)
    hit = await db.geocode_cache.find_one({"_id": key})
    if hit:
        return hit["results"]
    params: dict = {"q": q, "format": "jsonv2", "limit": limit}
    if viewbox:
        params.update(viewbox=viewbox, bounded=0)
    rows = await _get(SEARCH_URL, params)
    results = [
        {"name": r.get("display_name", q), "latitude": float(r["lat"]), "longitude": float(r["lon"])}
        for r in rows if isinstance(r, dict) and "lat" in r and "lon" in r  # type: ignore[union-attr]
    ]
    await db.geocode_cache.replace_one(
        {"_id": key}, {"_id": key, "results": results, "at": datetime.now(timezone.utc)}, upsert=True
    )
    return results


async def route_minutes(mode: str, a: tuple[float, float], b: tuple[float, float]) -> int | None:
    """Travel minutes from a to b (lat, lon). OSRM wants lon,lat. Rounded to ~100 m for caching."""
    coords = f"{a[1]:.3f},{a[0]:.3f};{b[1]:.3f},{b[0]:.3f}"
    key = _key("route", mode, coords)
    hit = await db.route_cache.find_one({"_id": key})
    if hit:
        return hit["minutes"]
    data = await _get(f"{ROUTERS[mode]}/{coords}", {"overview": "false", "steps": "false", "alternatives": "false"})
    if not isinstance(data, dict) or data.get("code") != "Ok" or not data.get("routes"):
        return None
    minutes = max(1, round(data["routes"][0]["duration"] / 60))
    await db.route_cache.replace_one(
        {"_id": key}, {"_id": key, "minutes": minutes, "at": datetime.now(timezone.utc)}, upsert=True
    )
    return minutes


def _minus(hhmm: str, minutes: int) -> str:
    h, m = (int(x) for x in hhmm.split(":"))
    t = max(0, h * 60 + m - minutes)
    return f"{t // 60:02d}:{t % 60:02d}"


async def commute(appt: dict, origin: tuple[float, float], mode: str) -> dict | None:
    """→ {minutes, leaveBy, mode} for an appointment with a location, or None if not routable."""
    place = (appt.get("location") or "").strip()
    if not place:
        return None
    try:
        if appt.get("locationLat") is not None and appt.get("locationLon") is not None:
            dest = (appt["locationLat"], appt["locationLon"])  # picked from address search
        else:
            found = await search(place, near=origin, limit=1)
            if not found:
                return None
            dest = (found[0]["latitude"], found[0]["longitude"])
        minutes = await route_minutes(mode, origin, dest)
    except Exception:
        logger.warning("commute lookup failed for %r", place, exc_info=True)
        return None
    if minutes is None or minutes > 8 * 60:  # a wrong-continent match isn't a commute
        return None
    return {"minutes": minutes, "leaveBy": _minus(appt["startTime"], minutes + BUFFER_MIN), "mode": mode}
