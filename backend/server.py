import asyncio
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, APIRouter, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
import uuid
from datetime import datetime


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes
from lib import weather as weather_lib
from lib.auth import require_user
from routers import auth as auth_routes
from routers import sharing as sharing_routes
from routers import notes as notes_routes
from routers import premium as premium_routes
from routers import stats as stats_routes
from routers import strava as strava_routes
from routers import anniversaries as anniversaries_routes
from routers import appointments, commute, runplan, habits, health, meals, overview, push, reminders, routines, shopping, voice
from routers import settings as settings_routes
from routers import weather as weather_routes


# Startup runs before the yield, shutdown after it. Add your own setup/teardown here.
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    yield
    app.state.index_task.cancel()  # stop a build still running before its client closes
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    await weather_lib.close()
    client.close()


# Create the main app without a prefix
app = FastAPI(lifespan=lifespan)

# Create a router with the /api prefix
# Every /api route needs a signed-in, allow-listed user (lib/auth.PUBLIC_PATHS are exempt).
api_router = APIRouter(prefix="/api", dependencies=[Depends(require_user)])


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.model_dump())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Mount resource routers (all under the /api prefix)
api_router.include_router(auth_routes.router)
api_router.include_router(sharing_routes.router)
api_router.include_router(notes_routes.router)
api_router.include_router(premium_routes.router)
api_router.include_router(stats_routes.router)
api_router.include_router(strava_routes.router)
api_router.include_router(anniversaries_routes.router)
api_router.include_router(overview.router)
api_router.include_router(appointments.router)
api_router.include_router(habits.router)
api_router.include_router(meals.router)
api_router.include_router(shopping.router)
api_router.include_router(reminders.router)
api_router.include_router(settings_routes.router)
api_router.include_router(weather_routes.router)
api_router.include_router(health.router)
api_router.include_router(routines.router)
api_router.include_router(push.router)
api_router.include_router(voice.router)
api_router.include_router(commute.router)
api_router.include_router(runplan.router)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
