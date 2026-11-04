"""Weather models — mirrors of the Open-Meteo response, normalized.

Kept in sync by hand with frontend/src/lib/types.ts.
"""

from pydantic import BaseModel


class WeatherNow(BaseModel):
    temperature: float
    apparent: float
    code: int
    isDay: bool
    windSpeed: float = 0  # km/h
    windGusts: float = 0  # km/h


class HourPoint(BaseModel):
    time: str  # location-local HH:MM
    temperature: float
    precipProb: float
    code: int
    windSpeed: float = 0  # km/h


class WeatherDay(BaseModel):
    date: str  # location-local YYYY-MM-DD
    tempMax: float
    tempMin: float
    precipProb: float
    code: int


class WeatherBundle(BaseModel):
    latitude: float
    longitude: float
    timezone: str
    units: str  # celsius | fahrenheit
    now: WeatherNow
    hourly: list[HourPoint]
    days: list[WeatherDay]  # [0] = today, [1] = tomorrow (location-local)


class GeoPlace(BaseModel):
    name: str
    country: str | None = None
    admin1: str | None = None
    latitude: float
    longitude: float


class ReversePlace(BaseModel):
    name: str
    latitude: float
    longitude: float
