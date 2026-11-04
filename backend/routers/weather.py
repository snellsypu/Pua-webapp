"""Weather + geocoding endpoints (Open-Meteo behind the backend)."""

from fastapi import APIRouter, HTTPException, Query

from lib import travel
from lib import weather as weather_lib
from lib.db import db
from models.weather import GeoPlace, ReversePlace, WeatherBundle

router = APIRouter(tags=["weather"])


@router.get("/weather", response_model=WeatherBundle)
async def get_weather(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
    units: str = Query(default="celsius"),
):
    if units not in ("celsius", "fahrenheit"):
        units = "celsius"
    return await weather_lib.get_bundle(lat, lon, units)


@router.get("/address/search", response_model=list[GeoPlace])
async def address_search(q: str = Query(min_length=3, max_length=200)):
    """Street address search (Nominatim) for the commute start point — explicit submit only."""
    s = await db.settings.find_one({"id": "app"}) or {}
    home = s.get("home")
    near = (home["latitude"], home["longitude"]) if home else None
    try:
        rows = await travel.search(q, near=near)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Address search is unavailable right now") from exc
    return [GeoPlace(name=r["name"], latitude=r["latitude"], longitude=r["longitude"]) for r in rows]


@router.get("/geocode", response_model=list[GeoPlace])
async def geocode(q: str = Query(min_length=2, max_length=100)):
    return await weather_lib.geocode(q.strip())


@router.get("/geocode/reverse", response_model=ReversePlace)
async def geocode_reverse(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
):
    return await weather_lib.reverse(lat, lon)
