"""Auth models — mirrored by AuthUser / AccessList in frontend/src/lib/types.ts."""

from pydantic import BaseModel, Field


class SessionIn(BaseModel):
    session_id: str = Field(min_length=1, max_length=500)


class AuthUser(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str = ""
    isOwner: bool = False


class AccessList(BaseModel):
    owner: str | None
    emails: list[str]


class AccessAdd(BaseModel):
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
