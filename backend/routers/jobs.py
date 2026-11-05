"""Jobs (work rota) CRUD + expanded work blocks. Free: 1 job; Premium: unlimited."""

from fastapi import APIRouter, HTTPException, Query
from pymongo import ReturnDocument

from lib.db import current_owner, db
from lib.work import my_blocks
from models.jobs import Job, JobIn, WorkBlock
from routers.premium import is_premium

router = APIRouter(prefix="/jobs", tags=["jobs"])
FREE_JOBS = 1


@router.get("", response_model=list[Job])
async def list_jobs():
    return [Job(**d) for d in await db.jobs.find({}, {"_id": 0}).sort("createdAt", 1).to_list(100)]


@router.get("/blocks", response_model=list[WorkBlock])
async def list_blocks(from_: str = Query(alias="from"), to: str = Query()):
    return await my_blocks(from_, to)


@router.post("", response_model=Job, status_code=201)
async def create_job(input: JobIn):
    if await db.jobs.count_documents({}) >= FREE_JOBS and not await is_premium(current_owner.get()):
        raise HTTPException(status_code=402, detail="Premium lets you add more than one job")
    job = Job(**input.model_dump())
    await db.jobs.insert_one(job.model_dump())
    return job


@router.put("/{id}", response_model=Job)
async def update_job(id: str, input: JobIn):
    doc = await db.jobs.find_one_and_update({"id": id}, {"$set": input.model_dump()}, projection={"_id": 0},
                                            return_document=ReturnDocument.AFTER)
    if not doc:
        raise HTTPException(status_code=404, detail="Job not found")
    return Job(**doc)


@router.delete("/{id}")
async def delete_job(id: str):
    if not (await db.jobs.delete_one({"id": id})).deleted_count:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True}
