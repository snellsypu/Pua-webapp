"""Samsung Health import — the only web-reachable path (Samsung's data SDK is
Android-native). The user exports their data from Samsung Health
(Settings → Download personal data) and uploads the ZIP here; we parse the
CSV/JSON entries, normalize nutrition/sleep/exercise rows, and upsert by a
deterministic event id so re-imports never duplicate."""

import hashlib
import io
import json
import re
import zipfile
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pymongo import ASCENDING

from lib.db import db
from models.health import HealthEvent, HealthImportResult

router = APIRouter(prefix="/health", tags=["health"])

MAX_UPLOAD_MB = 50
MAX_UNCOMPRESSED_MB = 150
MAX_FILES = 200

# Samsung export filenames vary by version — match stable fragments, never exact names.
KIND_FRAGMENTS: dict[str, str] = {
    "food_intake": "nutrition",
    "nutrition": "nutrition",
    "food_info": "nutrition",
    "exercise": "exercise",
    "sleep_combined": "sleep",
    "shealth.sleep": "sleep",
    "sleep_stage": "sleep",
}


# Samsung exports exercise_type as a numeric code.
EXERCISE_CODES = {
    "1001": "Walking", "1002": "Running", "11007": "Cycling", "13001": "Hiking",
    "14001": "Swimming", "15003": "Treadmill running", "15005": "Elliptical",
}


def kind_for(name: str) -> str | None:
    n = name.lower()
    for fragment, kind in KIND_FRAGMENTS.items():
        if fragment in n:
            return kind
    return None


def read_csv_bytes(raw: bytes) -> pd.DataFrame:
    """Samsung CSVs carry a metadata line (e.g. "com.samsung.health.food_intake,6313002,2")
    above the real header. Find the header by its timestamp column names, and never
    treat a "com.samsung…" metadata line as the header."""
    text = raw.decode("utf-8-sig", errors="replace")
    lines = text.splitlines()

    def is_meta(line: str) -> bool:
        return line.lower().startswith("com.samsung")

    header = next(
        (
            i
            for i, line in enumerate(lines)
            if not is_meta(line)
            and any(x in line.lower() for x in ("start_time", "create_time", "day_time", "timestamp"))
        ),
        None,
    )
    if header is None:  # fallback: first non-metadata line
        header = next((i for i, line in enumerate(lines) if not is_meta(line)), 0)
    return pd.read_csv(io.StringIO("\n".join(lines[header:])), dtype=str)


def read_entry(name: str, raw: bytes) -> pd.DataFrame:
    suffix = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if suffix == ".csv":
        return read_csv_bytes(raw)
    if suffix == ".xlsx":
        return pd.read_excel(io.BytesIO(raw), engine="openpyxl", dtype=str)
    if suffix == ".json":
        value = json.loads(raw.decode("utf-8-sig"))
        return pd.json_normalize(value if isinstance(value, list) else value.get("data", value))
    return pd.DataFrame()


def col(row: dict, *names: str):
    lower = {str(k).lower().strip(): v for k, v in row.items()}
    for wanted in names:
        for key, value in lower.items():
            if key == wanted or key.endswith("." + wanted) or wanted in key:
                return value
    return None


def iso(value) -> str | None:
    if value is None or pd.isna(value) or str(value).strip() in ("", "nan", "None"):
        return None
    dt = pd.to_datetime(str(value), errors="coerce", utc=True)
    return None if pd.isna(dt) else dt.isoformat()


def number(value) -> float | None:
    if value is None or pd.isna(value):
        return None
    try:
        cleaned = re.sub(r"[^0-9.+-]", "", str(value))
        return float(cleaned) if cleaned else None
    except (ValueError, TypeError):
        return None


def minutes_between(start: str, end: str) -> float | None:
    try:
        s = pd.to_datetime(start)
        e = pd.to_datetime(end)
        mins = (e - s).total_seconds() / 60
        return round(mins, 1) if 0 < mins < 60 * 48 else None
    except (ValueError, TypeError):
        return None


def duration_minutes(value: float | None) -> float | None:
    """Samsung exports durations in milliseconds. Anything above 48h-in-minutes can't
    be a minute count, so treat it as ms."""
    if value is None:
        return None
    if value > 60 * 48:
        return round(value / 60000, 1)
    return round(value, 1)


def normalize(kind: str, row: dict, source: str) -> HealthEvent | None:
    start = iso(col(row, "start_time", "timestamp", "date", "time", "create_time"))
    if not start:
        return None
    end = iso(col(row, "end_time", "finish_time")) or start

    event: dict = {
        "eventId": "",
        "type": kind,
        "date": end[:10] if kind == "sleep" else start[:10],
        "start": start,
        "end": end,
        "title": None,
        "durationMin": None,
        "distanceKm": None,
        "calories": None,
        "proteinG": None,
        "carbsG": None,
        "fatG": None,
        "stage": None,
        "score": None,
        "sourceFile": source,
    }
    if kind == "nutrition":
        event["title"] = col(row, "food_name", "food", "name", "meal")
        event["calories"] = number(col(row, "calories", "calorie", "energy"))
        event["proteinG"] = number(col(row, "protein", "protein_g"))
        event["carbsG"] = number(col(row, "carbohydrate", "carbs", "carbs_g"))
        event["fatG"] = number(col(row, "fat", "fat_g"))
    elif kind == "exercise":
        raw_type = col(row, "exercise_type", "exercise", "name", "activity")
        event["title"] = EXERCISE_CODES.get(str(raw_type).strip(), raw_type) if raw_type is not None else None
        meters = number(col(row, "distance"))  # Samsung stores metres
        event["distanceKm"] = round(meters / 1000, 2) if meters else None
        event["durationMin"] = duration_minutes(number(col(row, "duration", "duration_min")))
        event["calories"] = number(col(row, "calorie", "calories", "calories_burned"))
    else:  # sleep
        event["title"] = "Sleep"
        event["durationMin"] = duration_minutes(number(col(row, "sleep_duration", "duration")))
        event["stage"] = col(row, "stage", "sleep_stage")
        event["score"] = number(col(row, "score", "sleep_score"))

    if event["durationMin"] is None and kind != "nutrition":
        event["durationMin"] = minutes_between(start, end)
    if isinstance(event["title"], float) and pd.isna(event["title"]):
        event["title"] = None
    event["title"] = str(event["title"]) if event["title"] is not None else None

    key = f"{kind}|{start}|{end}|{source}|{event['title']}"
    event["eventId"] = hashlib.sha256(key.encode()).hexdigest()
    return HealthEvent(**event)


@router.post("/import", response_model=HealthImportResult)
async def import_samsung_health(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")
    if not data.startswith(b"PK"):
        raise HTTPException(
            status_code=400,
            detail="Upload the Samsung Health ZIP export (Samsung Health → Settings → Download personal data)",
        )
    events: list[HealthEvent] = []
    files_seen: list[str] = []
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = archive.namelist()
            if len(names) > MAX_FILES:
                raise HTTPException(status_code=400, detail="Archive has too many files")
            if sum(i.file_size for i in archive.infolist()) > MAX_UNCOMPRESSED_MB * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Archive too large when uncompressed")
            for name in names:
                kind = kind_for(name)
                if not kind or name.endswith("/"):
                    continue
                df = read_entry(name, archive.read(name))
                for row in df.to_dict(orient="records"):
                    event = normalize(kind, row, name)
                    if event:
                        events.append(event)
                        if name not in files_seen:
                            files_seen.append(name)
    except (zipfile.BadZipFile, UnicodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid or unsupported Samsung Health export") from exc

    if not events:
        raise HTTPException(
            status_code=400,
            detail="No nutrition, sleep or exercise records found in this export",
        )

    by_type: dict[str, int] = {}
    for event in events:
        doc = event.model_dump()
        await db.health_events.update_one({"eventId": event.eventId}, {"$set": doc}, upsert=True)
        by_type[event.type] = by_type.get(event.type, 0) + 1

    return HealthImportResult(imported=len(events), byType=by_type, files=files_seen)


@router.get("/events", response_model=list[HealthEvent])
async def list_events(
    from_: str = Query(alias="from"),
    to: str = Query(alias="to"),
):
    docs = (
        await db.health_events.find({"date": {"$gte": from_, "$lte": to}})
        .sort([("start", ASCENDING)])
        .to_list(2000)
    )
    return [HealthEvent(**d) for d in docs]


@router.delete("/events")
async def clear_events():
    res = await db.health_events.delete_many({})
    return {"ok": True, "deleted": res.deleted_count}


# datetime import kept for type-checking tools; unused directly today.
_ = datetime
