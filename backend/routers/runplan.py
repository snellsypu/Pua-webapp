"""Run time planner endpoint (best hour today for the running habit)."""

from fastapi import APIRouter

from lib.runplan import build_run_plan
from models.planner import RunPlan

router = APIRouter(tags=["run-plan"])


@router.get("/run-plan", response_model=RunPlan | None)
async def run_plan():
    """Null when there's no running habit, it's done today, no home city, or no free slot."""
    plan = await build_run_plan()
    return RunPlan(**plan) if plan else None
