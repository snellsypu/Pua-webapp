"""Expand jobs' repeating rotas into dated work blocks."""

from datetime import date, timedelta

from lib.db import db, raw_db
from models.jobs import WorkBlock


def expand(jobs: list[dict], date_from: str, date_to: str) -> list[WorkBlock]:
    d0, d1 = date.fromisoformat(date_from), date.fromisoformat(date_to)
    out: list[WorkBlock] = []
    for j in jobs:
        start = date.fromisoformat(j["startDate"])
        weeks = j.get("rotaWeeks", 1)
        by_slot = {(s["week"], s["weekday"]): s for s in j.get("shifts", [])}
        d = d0
        while d <= d1:
            week = ((d - timedelta(days=d.weekday()) - start).days // 7) % weeks + 1
            if s := by_slot.get((week, d.weekday())):
                out.append(WorkBlock(jobId=j["id"], name=j["name"], date=d.isoformat(), startTime=s["start"],
                                     endTime=s["end"], overnight=s["end"] <= s["start"]))
            d += timedelta(days=1)
    out.sort(key=lambda b: (b.date, b.startTime))
    return out


async def my_blocks(date_from: str, date_to: str) -> list[WorkBlock]:
    return expand(await db.jobs.find({}, {"_id": 0}).to_list(100), date_from, date_to)


async def blocks_of(owner_id: str, date_from: str, date_to: str) -> list[WorkBlock]:
    return expand(await raw_db.jobs.find({"ownerId": owner_id}, {"_id": 0}).to_list(100), date_from, date_to)
