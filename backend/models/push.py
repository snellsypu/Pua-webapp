"""Web Push models (VAPID). Mirrored by hand in frontend/src/lib/types.ts."""

from pydantic import BaseModel, ConfigDict, Field


class PushKeys(BaseModel):
    auth: str = Field(min_length=8)
    p256dh: str = Field(min_length=20)


class PushSubscriptionIn(BaseModel):
    """Exactly the shape of the browser's PushSubscription.toJSON()."""

    model_config = ConfigDict(extra="ignore")
    endpoint: str = Field(min_length=10, pattern=r"^https://")
    expirationTime: int | None = None
    keys: PushKeys


class PushPublicKey(BaseModel):
    publicKey: str


class PushStatus(BaseModel):
    subscriptions: int


class PushSendResult(BaseModel):
    sent: int
    removed: int
    failed: int
