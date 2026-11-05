"""Auth + sharing models — mirrored in frontend/src/lib/types.ts."""

from typing import Literal

from pydantic import BaseModel, Field

FlowerKind = Literal["plumeria", "pink-plumeria", "hibiscus", "ilima", "lehua"]
ShareCategory = Literal["appointments", "reminders", "habits", "routines", "meals", "shopping"]


class SessionIn(BaseModel):
    session_id: str = Field(min_length=1, max_length=500)


class AuthUser(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str = ""
    onboarded: bool = False


PackId = Literal["fitness", "mindful", "home", "morning", "bedtime"]


class OnboardIn(BaseModel):
    sample: bool  # True = sample planner, False = clear planner (+ optional starter packs)
    packs: list[PackId] = Field(default_factory=list, max_length=5)


class Person(BaseModel):
    user_id: str
    name: str
    email: str
    picture: str = ""


class JoinedPlanner(Person):
    """A planner you can view — access is the union of every bouquet of theirs you joined."""
    categories: list[ShareCategory]
    shoppingEdit: bool = False  # you may tick off / add items on their shopping list
    bouquets: list[str]  # names of their bouquets you're in (joined order)
    bouquetIds: list[str]  # same order — the first one's flower colours them on your calendar
    color: FlowerKind | None = None  # your own pick for their calendar colour


class Bouquet(BaseModel):
    """A group you share with: its own join code and its own choice of what's shared."""
    id: str
    name: str
    code: str
    categories: list[ShareCategory]
    shoppingEdit: bool = True  # members may tick off / add shopping items (if shopping shared)
    members: list[Person]
    paused: bool = False  # past the 2 free bouquets without Premium: members can't see it


class SharingState(BaseModel):
    bouquets: list[Bouquet]  # your bouquets (you're the admin)
    joined: list[JoinedPlanner]  # planners you can view
    joinedOwnerId: str | None = None  # set by POST /join — whose planner you just joined


class BouquetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class BouquetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    categories: list[ShareCategory] | None = Field(default=None, max_length=6)
    shoppingEdit: bool | None = None


class LeaderboardEntry(Person):
    longestLei: int  # longest run of finished-routine days this month
    daysFinished: int  # days this month with a finished routine
    isOwner: bool
    me: bool
    rank: int


class Leaderboard(BaseModel):
    bouquetId: str
    bouquetName: str
    month: str  # YYYY-MM
    entries: list[LeaderboardEntry]


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=16)


class FriendColorIn(BaseModel):
    color: FlowerKind | None  # null = back to their bouquet's colour
