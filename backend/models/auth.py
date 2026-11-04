"""Auth + sharing models — mirrored in frontend/src/lib/types.ts."""

from typing import Literal

from pydantic import BaseModel, Field

ShareCategory = Literal["appointments", "reminders", "habits", "routines", "meals", "shopping"]


class SessionIn(BaseModel):
    session_id: str = Field(min_length=1, max_length=500)


class AuthUser(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str = ""
    onboarded: bool = False


class OnboardIn(BaseModel):
    sample: bool  # True = sample planner, False = clear planner


class Person(BaseModel):
    user_id: str
    name: str
    email: str
    picture: str = ""


class JoinedPlanner(Person):
    categories: list[ShareCategory]


class SharingState(BaseModel):
    friendCode: str
    categories: list[ShareCategory]  # what this user shares
    members: list[Person]  # people who joined with this user's code
    joined: list[JoinedPlanner]  # planners this user can view


class CategoriesIn(BaseModel):
    categories: list[ShareCategory] = Field(max_length=6)


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=16)
