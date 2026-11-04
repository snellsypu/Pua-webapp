"""Samsung Health import models — mirrored by hand in frontend/src/lib/types.ts."""

from pydantic import BaseModel


class HealthEvent(BaseModel):
    eventId: str  # deterministic sha256 — re-imports upsert instead of duplicating
    type: str  # nutrition | exercise | sleep
    date: str  # display day (for sleep: the wake-up day)
    start: str  # ISO datetime
    end: str
    title: str | None = None
    durationMin: float | None = None
    distanceKm: float | None = None
    calories: float | None = None
    proteinG: float | None = None
    carbsG: float | None = None
    fatG: float | None = None
    stage: str | None = None
    score: float | None = None
    sourceFile: str


class HealthImportResult(BaseModel):
    imported: int
    byType: dict[str, int]
    files: list[str]
