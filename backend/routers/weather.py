"""Weather + geocoding endpoints (Open-Meteo behind the backend)."""

from fastapi import APIRouter, Query

from lib import weather as weather_lib
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


@router.get("/geocode", response_model=list[GeoPlace])
async def geocode(q: str = Query(min_length=2, max_length=100)):
    return await weather_lib.geocode(q.strip())


@router.get("/geocode/reverse", response_model=ReversePlace)
async def geocode_reverse(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
):
    return await weather_lib.reverse(lat, lon)
